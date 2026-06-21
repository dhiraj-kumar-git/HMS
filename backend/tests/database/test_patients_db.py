import pytest
from unittest.mock import MagicMock
from app.database.patients import (
    get_all_patients, register_patient, update_dependant, delete_dependant,
    archive_patient, book_appointment, store_patient_otp, verify_patient_otp,
    get_patient_by_id, get_family_by_psrn, get_patients_by_doctor,
    get_patient_history_for_doctor, update_consultation_details,
    complete_patient, consultation_patient, complete_consultation,
    get_inactive_patients_by_doctor, get_active_pending_patients,
    bulk_register_patients, bulk_register_staff_and_dependants,
    _map_aggregated_patient, _get_active_visit_id, _finalize_visit
)
import app.database.patients as patients_db
from datetime import datetime, timezone, timedelta

def test_get_all_patients(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123", "name": "Pat", "patient_visits": []}]
    res = get_all_patients()
    assert len(res) == 1
    assert res[0]["institute_id"] == "123"

def test_register_patient_success(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = None
    res = register_patient({"institute_id": "123", "date_of_birth": "1990-01-01"})
    assert res == "123"
    mock_patients.insert_one.assert_called_once()

def test_register_patient_duplicate(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123"}
    res = register_patient({"institute_id": "123"})
    assert res is None

def test_update_dependant(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.update_one.return_value.matched_count = 1
    res = update_dependant("123", {"name": "New Name", "date_of_birth": "1990-01-01"})
    assert res is True

def test_delete_dependant(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.delete_one.return_value.deleted_count = 1
    res = delete_dependant("123")
    assert res is True

def test_archive_patient(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.update_one.return_value.matched_count = 1
    res = archive_patient("123")
    assert res is True

def test_book_appointment(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.update_one.return_value.modified_count = 1
    res = book_appointment("123", "doc1", "Dr. One", "10:00")
    assert res is True
    mock_visits.insert_one.assert_called_once()

def test_store_patient_otp(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.update_one.return_value.modified_count = 1
    res = store_patient_otp("123", "1234")
    assert res is True

def test_verify_patient_otp_success(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {
        "institute_id": "123", "otp": "1234",
        "otp_expires": datetime.now(timezone.utc) + timedelta(minutes=5)
    }
    success, msg = verify_patient_otp("123", "1234")
    assert success is True

def test_get_patient_by_id(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123", "name": "Pat", "patient_visits": []}]
    res = get_patient_by_id("123")
    assert res is not None
    assert res["institute_id"] == "123"

def test_get_family_by_psrn(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "P123", "patient_visits": []}]
    res = get_family_by_psrn("P123")
    assert len(res) == 1

def test_get_patients_by_doctor(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123", "patient_visits": []}]
    res = get_patients_by_doctor("doc1")
    assert len(res) == 1

def test_get_patient_history_for_doctor(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123", "patient_visits": []}]
    res = get_patient_history_for_doctor("doc1", "Dr. One")
    assert len(res) == 1

def test_update_consultation_details(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mocker.patch("app.database.patients._get_active_visit_id", return_value="v123")
    mock_visits.update_one.return_value.matched_count = 1
    res = update_consultation_details("123", "doc1", [], [], [], [])
    assert res is True

def test_complete_patient(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123"}
    mocker.patch("app.database.patients._finalize_visit")
    mock_patients.update_one.return_value.modified_count = 1
    res = complete_patient("123")
    assert res is True

def test_consultation_patient(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123"}
    mocker.patch("app.database.patients._finalize_visit")
    mock_patients.update_one.return_value.matched_count = 1
    res = consultation_patient("123", "doc1", False, False)
    assert res is True

def test_complete_consultation(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123", "bill_status": "none", "lab_status": "none"}
    mocker.patch("app.database.patients._finalize_visit")
    mock_patients.update_one.return_value.modified_count = 1
    res = complete_consultation("123")
    assert res is True

def test_get_inactive_patients_by_doctor(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123", "patient_visits": []}]
    res = get_inactive_patients_by_doctor("doc1")
    assert len(res) == 1

def test_get_active_pending_patients(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.aggregate.return_value = [{"patient_info": {"institute_id": "123", "_id": "1", "patient_visits": []}}]
    res = get_active_pending_patients()
    assert len(res) == 1
    
    # Verify that the pipeline filters for "status": "completed"
    pipeline = mock_visits.aggregate.call_args[0][0]
    match_stage = pipeline[0]["$match"]
    assert match_stage.get("status") == "completed"
    assert match_stage.get("invoice_no") == {"$exists": False}

def test_bulk_register_patients(mocker):
    mocker.patch("app.database.patients.register_patient", return_value="123")
    rows = [{"institute_id": "1", "name": "Pat", "email": "a@b.com", "date_of_birth": "1990-01-01", "gender": "M", "contact_no": "1234567890", "patient_type": "Student", "address": "Addr"}]
    res = bulk_register_patients(rows, "admin")
    assert res["success"] == 1

def test_bulk_register_staff_and_dependants(mocker):
    mocker.patch("app.database.patients.register_patient", return_value="123")
    mocker.patch("app.database.patients.generate_relation_id", return_value="1-SON1")
    rows = [
        {"primary_psrn_id": "1", "name": "Pat", "date_of_birth": "1990-01-01", "gender": "M", "patient_type": "Faculty", "email": "a@b.com", "contact_no": "1234567890", "address": "Addr"},
        {"primary_psrn_id": "1", "name": "Son", "date_of_birth": "2010-01-01", "gender": "M", "patient_type": "Dependant", "relation": "Son", "email": "a@b.com", "contact_no": "1234567890", "address": "Addr"}
    ]
    res = bulk_register_staff_and_dependants(rows, "admin")
    assert res["success"] == 2

def test_map_aggregated_patient_none():
    assert _map_aggregated_patient(None) is None

def test_map_aggregated_patient_no_visits():
    p = {"institute_id": "123"}
    res = _map_aggregated_patient(p)
    assert res["institute_id"] == "123"

def test_map_aggregated_patient_with_visits():
    p = {
        "institute_id": "123",
        "patient_visits": [
            {
                "visit_id": "v1", "status": "completed", "invoice_no": "INV-1",
                "lab_tests": [{"status": "pending"}], "prescriptions": [{"note": "med"}]
            },
            {
                "visit_id": "v2", "status": "upcoming",
                "doctor_username": "doc1", "doctor_name": "Dr. One"
            },
            {
                "visit_id": "v3", "status": "consultation",
                "lab_tests": [{"status": "pending"}]
            }
        ]
    }
    res = _map_aggregated_patient(p, active_doctor_username="doc1")
    assert res["workflow_status"] == "active"
    
def test_map_aggregated_patient_other_statuses():
    p = {
        "institute_id": "123",
        "patient_visits": [
            {
                "visit_id": "v1", "status": "completed", "invoice_no": None,
                "lab_tests": [], "prescriptions": []
            }
        ]
    }
    res = _map_aggregated_patient(p)
    assert res["workflow_status"] == "completed"

def test_get_active_visit_id(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.find_one.return_value = {"visit_id": "v1"}
    assert _get_active_visit_id("123", "doc1") == "v1"
def test_finalize_visit(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    _finalize_visit('v1', 'completed')
    mock_visits.update_one.assert_called_once()

