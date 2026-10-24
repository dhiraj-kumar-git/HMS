import pytest
from flask_jwt_extended import create_access_token

URL = "/api/admin/dashboard"


def headers(app, role):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity='u', additional_claims={'role': role})}"}


def test_login_is_required(client):
    assert client.get(URL).status_code == 401


@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_admin_only(client, app, mocker, role):
    get = mocker.patch("database.get_admin_dashboard", return_value={})
    assert client.get(URL, headers=headers(app, role)).status_code == 403
    assert not get.called


def test_admin_gets_the_numbers_uncached(client, app, mocker):
    mocker.patch("database.get_admin_dashboard", return_value={"date": "2026-10-25", "errors": []})
    r = client.get(URL, headers=headers(app, "admin"))
    assert r.status_code == 200 and r.get_json() == {"date": "2026-10-25", "errors": []} and r.headers["Cache-Control"] == "no-store"


def test_errors_are_generic(client, app, mocker):
    mocker.patch("database.get_admin_dashboard", side_effect=RuntimeError("mongodb://secret"))
    r = client.get(URL, headers=headers(app, "admin"))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)


def test_it_only_reads(client, app):
    for method in ("post", "put", "delete", "patch"):
        assert getattr(client, method)(URL, headers=headers(app, "admin")).status_code == 405
