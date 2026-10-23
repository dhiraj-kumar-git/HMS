from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

import pytest
from pymongo.errors import DuplicateKeyError

import app.database.inventory as inv
import app.database.patients as patients_db


def _visit_mock(mocker, slot_rank, patient_rank):
    mock_visits = mocker.patch.object(patients_db, "visits")
    mock_visits.insert_one.return_value.inserted_id = "new-id"
    mock_visits.count_documents.side_effect = [slot_rank, patient_rank]
    mock_patients = mocker.patch.object(patients_db, "patients")
    mock_patients.update_one.return_value.matched_count = 1
    mocker.patch.object(patients_db, "next_sequence", return_value=7)
    return mock_visits


def test_book_appointment_within_capacity(mocker):
    mock_visits = _visit_mock(mocker, 3, 1)
    assert patients_db.book_appointment("123", "doc1", "Dr", "2026-06-21T10:00") is True
    mock_visits.delete_one.assert_not_called()
    assert mock_visits.insert_one.call_args[0][0]["opd_no"] == "202606210007"


def test_book_appointment_rolled_back_when_slot_overbooked(mocker):
    mock_visits = _visit_mock(mocker, 4, 1)
    assert patients_db.book_appointment("123", "doc1", "Dr", "2026-06-21T10:00") is False
    mock_visits.delete_one.assert_called_once_with({"_id": "new-id"})


def test_book_appointment_rolled_back_when_patient_limit_exceeded(mocker):
    mock_visits = _visit_mock(mocker, 1, 4)
    assert patients_db.book_appointment("123", "doc1", "Dr", "2026-06-21T10:00") is False
    mock_visits.delete_one.assert_called_once()


def test_register_patient_concurrent_duplicate_returns_none(mocker):
    mock_patients = mocker.patch.object(patients_db, "patients")
    mock_patients.find_one.return_value = None
    mock_patients.insert_one.side_effect = DuplicateKeyError("dup")
    assert patients_db.register_patient({"institute_id": "abc"}) is None


def test_finalize_visit_force_consultation_is_per_call(mocker):
    mock_visits = mocker.patch.object(patients_db, "visits")
    mock_visits.find_one.return_value = {"visit_id": "v1"}
    patients_db._finalize_visit("v1", mark_as_completed=False, force_consultation=True)
    assert mock_visits.update_one.call_args[0][1]["$set"]["status"] == "consultation"
    patients_db._finalize_visit("v1", mark_as_completed=False)
    assert "status" not in mock_visits.update_one.call_args[0][1]["$set"]


def test_verify_otp_locks_after_max_attempts(mocker):
    mock_patients = mocker.patch.object(patients_db, "patients")
    mock_patients.find_one.return_value = {
        "otp": "111111", "otp_expires": datetime.now(timezone.utc) + timedelta(minutes=1),
        "otp_attempts": patients_db.MAX_OTP_ATTEMPTS,
    }
    ok, msg = patients_db.verify_patient_otp("123", "111111")
    assert ok is False and "Too many" in msg


def test_verify_otp_wrong_code_increments_attempts(mocker):
    mock_patients = mocker.patch.object(patients_db, "patients")
    mock_patients.find_one.return_value = {
        "otp": "111111", "otp_expires": datetime.now(timezone.utc) + timedelta(minutes=1),
    }
    ok, _ = patients_db.verify_patient_otp("123", "000000")
    assert ok is False
    mock_patients.update_one.assert_called_once_with({"institute_id": "123"}, {"$inc": {"otp_attempts": 1}})


def test_verify_otp_success_consumes_otp(mocker):
    mock_patients = mocker.patch.object(patients_db, "patients")
    mock_patients.find_one.return_value = {
        "otp": "111111", "otp_expires": datetime.now(timezone.utc) + timedelta(minutes=1),
    }
    assert patients_db.verify_patient_otp("123", "111111") == (True, "Success")
    assert "$unset" in mock_patients.update_one.call_args[0][1]


def test_bulk_date_prefers_day_first():
    row = {"institute_id": "A1", "name": "N", "email": "a@b.com", "date_of_birth": "05-06-2000",
           "gender": "M", "contact_no": "9876543210", "patient_type": "Student", "address": "x"}
    parsed = patients_db._validate_and_parse_bulk_row(row)
    assert parsed["date_of_birth"].startswith("2000-06-05")


def _pay_mocks(mocker, visit):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_patients.find_one.return_value = {"institute_id": "I1", "workflow_status": "active"}
    mock_visits.find_one.return_value = visit
    mocker.patch("app.database.inventory.load_lab_tests_from_config", return_value=[])
    mocker.patch("app.database.inventory.get_test_price", return_value=100.0)
    mock_bills.count_documents.return_value = 0
    return mock_visits, mock_bills


def test_pay_bill_lost_claim_returns_already_paid(mocker):
    visit = {"visit_id": "v1", "lab_tests": [{"lab_test": "CBC"}], "prescriptions": []}
    mock_visits, mock_bills = _pay_mocks(mocker, visit)
    mock_visits.update_one.return_value.matched_count = 0
    res = inv.pay_bill("I1", "v1", selected_labs=[0], selected_medicines=[])
    assert res["success"] is False
    mock_bills.insert_one.assert_not_called()


def test_pay_bill_releases_lock_on_failure(mocker):
    visit = {"visit_id": "v1", "lab_tests": [{"lab_test": "CBC"}], "prescriptions": []}
    mock_visits, mock_bills = _pay_mocks(mocker, visit)
    mock_visits.update_one.return_value.matched_count = 1
    mock_bills.insert_one.side_effect = RuntimeError("db down")
    with pytest.raises(RuntimeError):
        inv.pay_bill("I1", "v1", selected_labs=[0], selected_medicines=[])
    assert mock_visits.update_one.call_args[0][1] == {"$unset": {"billing_lock": ""}}


def test_pay_bill_retries_on_duplicate_invoice(mocker):
    visit = {"visit_id": "v1", "lab_tests": [{"lab_test": "CBC"}], "prescriptions": []}
    mock_visits, mock_bills = _pay_mocks(mocker, visit)
    mock_visits.update_one.return_value.matched_count = 1
    mock_bills.insert_one.side_effect = [DuplicateKeyError("dup"), None]
    res = inv.pay_bill("I1", "v1", selected_labs=[0], selected_medicines=[])
    assert res["success"] is True
    assert mock_bills.insert_one.call_count == 2


def test_generate_medicine_id_skips_taken_ids(mocker):
    mock_inventory = mocker.patch("app.database.inventory.inventory")
    mock_inventory.count_documents.return_value = 2
    mock_inventory.find_one.side_effect = [{"medicine_id": "MED0003"}, None]
    assert inv.generate_medicine_id() == "MED0004"


def test_search_input_is_escaped(mocker):
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_bills.find.return_value.sort.return_value.skip.return_value.limit.return_value = []
    mock_bills.count_documents.return_value = 0
    inv.get_bill_history_patients(search_term="a(b")
    query = mock_bills.find.call_args[0][0]
    assert query["$or"][0]["institute_id"]["$regex"] == "a\\(b"


def test_receptionist_queue_uses_stored_numbers(mocker):
    mock_visits = mocker.patch.object(patients_db, "visits")
    mock_visits.aggregate.return_value = [{
        "visit_id": "v1", "institute_id": "123", "time": "2026-06-21T10:00",
        "opd_no": "202606210001", "stored_uhid_no": "202601010005",
    }]
    res = patients_db.get_receptionist_queue(status_filter="all")
    assert res[0]["opd_no"] == "202606210001"
    assert res[0]["uhid_no"] == "202601010005"
    mock_visits.find.assert_not_called()
