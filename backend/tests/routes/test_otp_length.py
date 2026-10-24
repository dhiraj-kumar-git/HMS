"""Every OTP must be exactly 4 digits: that is all the portal and staff-registration screens accept."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

import app.routes.public_routes as pr

FRONTEND = Path(__file__).resolve().parents[3] / "frontend" / "src" / "pages"


# ---------------------------------------------------------------- the generator

def test_otp_is_always_between_1000_and_9999():
    for _ in range(20000):
        otp = pr.generate_otp()
        assert len(otp) == 4 and otp.isdigit(), otp
        assert 1000 <= int(otp) <= 9999, otp
        assert not otp.startswith("0")


@pytest.mark.parametrize("raw,expected", [(0, "1000"), (1, "1001"), (42, "1042"), (8999, "9999")])
def test_the_range_ends_are_exactly_1000_and_9999(monkeypatch, raw, expected):
    monkeypatch.setattr(pr.secrets, "randbelow", lambda n: raw)
    assert pr.generate_otp() == expected


def test_every_code_from_1000_to_9999_is_possible(monkeypatch):
    asked = []
    monkeypatch.setattr(pr.secrets, "randbelow", lambda n: asked.append(n) or 0)
    pr.generate_otp()
    assert asked == [9999 - 1000 + 1]                  # 9000 values: 1000, 1001, ... 9999


def test_codes_are_spread_across_the_range():
    values = [int(pr.generate_otp()) for _ in range(20000)]
    assert min(values) < 1200 and max(values) > 9800
    assert len(set(values)) > 5000


def test_it_uses_the_secure_generator_not_random():
    import inspect
    source = inspect.getsource(pr.generate_otp)
    assert "secrets.randbelow" in source and "random." not in source


def test_length_and_range_constants():
    assert (pr.OTP_LENGTH, pr.OTP_MIN, pr.OTP_MAX) == (4, 1000, 9999)
    assert len(str(pr.OTP_MIN)) == len(str(pr.OTP_MAX)) == pr.OTP_LENGTH


# ---------------------------------------------------------------- patient OTP (appointment booking)

def test_patient_otp_is_four_digits_and_emailed_unchanged(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active", "email": "p@x.com", "name": "Ann"}
    store = mocker.patch("database.store_patient_otp", return_value=True)
    send = mocker.patch("app.routes.public_routes.send_email")
    mocker.patch.object(pr.secrets, "randbelow", return_value=42)

    r = client.post("/api/public/verify", json={"institute_id": "H1"})

    assert r.status_code == 200
    stored = store.call_args.args[1]
    assert stored == "1042"
    assert "1042" in send.call_args.args[2]              # the email body carries the very code that was stored


def test_patient_can_verify_with_the_four_digit_code(mocker):
    import app.database.patients as patients_db
    patients = mocker.patch.object(patients_db, "patients")
    patients.find_one.return_value = {"otp": "4821", "otp_expires": datetime.now(timezone.utc) + timedelta(minutes=5)}
    assert patients_db.verify_patient_otp("H1", "4821") == (True, "Success")
    patients.find_one.return_value = {"otp": "4821", "otp_expires": datetime.now(timezone.utc) + timedelta(minutes=5)}
    assert patients_db.verify_patient_otp("H1", "4822")[0] is False


# ---------------------------------------------------------------- staff registration OTP

def test_registration_otp_is_four_digits_and_emailed_unchanged(client, mocker):
    import database
    database.redis_client = MagicMock()
    send = mocker.patch("app.routes.public_routes.send_email")
    mocker.patch.object(pr.secrets, "randbelow", return_value=5)
    try:
        r = client.post("/api/public/send_registration_otp", json={"email": "a@b.com"})
        assert r.status_code == 200
        key, ttl, stored = database.redis_client.setex.call_args.args
        assert (key, ttl, stored) == ("otp_a@b.com", 300, "1005")
        assert "1005" in send.call_args.args[2]
    finally:
        database.redis_client = None


def test_registration_check_accepts_the_code_it_sent(client):
    import database
    database.redis_client = MagicMock()
    database.redis_client.get.return_value = "1005"
    try:
        r = client.post("/api/public/verify_registration_otp", json={"email": "a@b.com", "otp": "1005"})
        assert r.status_code == 200
    finally:
        database.redis_client = None


# ---------------------------------------------------------------- the screens agree

SCREENS = [FRONTEND / "patients" / "PatientBooking.js", FRONTEND / "staff" / "StaffRegistration.js"]


@pytest.mark.skipif(not all(p.exists() for p in SCREENS), reason="frontend sources not present")
@pytest.mark.parametrize("screen", SCREENS, ids=lambda p: p.name)
def test_screens_accept_exactly_the_length_the_server_sends(screen):
    text = screen.read_text(encoding="utf-8")
    n = pr.OTP_LENGTH
    assert f"{n}-digit OTP" in text, "the on-screen wording must match the server"
    assert f"maxLength={{{n}}}" in text, "the input must allow every digit"
    assert re.search(rf"\\d\{{0,{n}\}}", text), "the digit filter must allow every digit"
    assert not re.search(rf"maxLength=\{{(?!{n}\}})\d+\}}[^\n]*\n[^\n]*OTP", text)
