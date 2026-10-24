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
    mock_patients.update_one.return_value.matched_count = 1
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
    mock_patients.aggregate.return_value = [{"institute_id": "123", "patient_visits": [{"doctor_username": "doc1", "status": "confirmed", "visit_id": "v1"}]}]
    res = get_patients_by_doctor("doc1")
    assert len(res) == 1

def test_get_patient_history_for_doctor(mocker):
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123", "patient_visits": []}]
    res = get_patient_history_for_doctor("doc1", "Dr. One")
    assert len(res) == 1
    
    # Verify pipeline match status in aggregate call
    pipeline = mock_patients.aggregate.call_args[0][0]
    match_stage = pipeline[1]["$match"]
    assert match_stage["patient_visits"]["$elemMatch"]["status"] == {"$in": ["completed", "cancelled"]}

def test_update_consultation_details(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.update_one.return_value.matched_count = 1
    
    prescription_data = {
        "plan": {
            "medications": [
                {"drug": "Dolo", "dose": "650mg", "route": "PO", "frequency": "1-1-1", "duration": "3 days", "quantity": "10"}
            ],
            "investigations": ["CBC", "X-Ray"]
        }
    }
    
    res = update_consultation_details("v123", "doc1", prescription_data)
    assert res is True
    
    # Verify the $set was called correctly
    mock_visits.update_one.assert_called_once()
    call_args = mock_visits.update_one.call_args[0]
    assert call_args[0] == {"visit_id": "v123"}
    
    update_doc = call_args[1]["$set"]
    assert "prescriptions" in update_doc
    assert "lab_tests" in update_doc
    assert "emr_data" in update_doc
    
    assert len(update_doc["prescriptions"]) == 1
    assert update_doc["prescriptions"][0]["note"] == "Dolo"
    assert update_doc["prescriptions"][0]["dose"] == "650mg"
    assert update_doc["prescriptions"][0]["route"] == "PO"
    assert update_doc["prescriptions"][0]["frequency"] == "1-1-1"
    assert update_doc["prescriptions"][0]["duration"] == "3 days"
    assert update_doc["prescriptions"][0]["quantity"] == "10"
    
    assert len(update_doc["lab_tests"]) == 2
    assert update_doc["lab_tests"][0]["lab_test"] == "CBC"
    assert update_doc["lab_tests"][1]["lab_test"] == "X-Ray"

def test_update_consultation_details_empty(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.update_one.return_value.matched_count = 1
    res = update_consultation_details("v123", "doc1", {})
    assert res is True
    
    update_doc = mock_visits.update_one.call_args[0][1]["$set"]
    assert len(update_doc["prescriptions"]) == 0
    assert len(update_doc["lab_tests"]) == 0

def test_update_consultation_details_no_visit(mocker):
    # Should return False if visit_id is missing
    res = update_consultation_details("", "doc1", {})
    assert res is False

def test_complete_patient(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.find_one.return_value = {"institute_id": "123"}
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123"}
    mocker.patch("app.database.patients._finalize_visit")
    mock_patients.update_one.return_value.modified_count = 1
    res = complete_patient("v1")
    assert res is True

def test_consultation_patient(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.find_one.return_value = {"institute_id": "123"}
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123"}
    mocker.patch("app.database.patients._finalize_visit")
    mock_patients.update_one.return_value.matched_count = 1
    res = consultation_patient("v1", "doc1", False, False)
    assert res is True

def test_complete_consultation(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.find_one.return_value = {"institute_id": "123"}
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.find_one.return_value = {"institute_id": "123", "bill_status": "none", "lab_status": "none"}
    mocker.patch("app.database.patients._finalize_visit")
    mock_patients.update_one.return_value.modified_count = 1
    res = complete_consultation("v1")
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
    assert res["workflow_status"] == "upcoming"
    
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

def test_map_aggregated_patient_visit_independence():
    p = {
        "institute_id": "123",
        "patient_visits": [
            {
                "visit_id": "v1", "status": "completed", "invoice_no": None,
                "lab_tests": [{"status": "pending"}], "prescriptions": [{"medicine": "A"}]
            },
            {
                "visit_id": "v2", "status": "confirmed", "doctor_username": "doc2"
            }
        ]
    }
    res = _map_aggregated_patient(p)
    # The root workflow_status should represent the latest active visit's workflow
    assert res["workflow_status"] == "confirmed"
    # Root bill_status must aggregate globally and remain "pending" because v1 has an unpaid bill
    assert res["bill_status"] == "pending"
    # Root lab_status must aggregate globally and remain "pending" because v1 has a pending lab
    assert res["lab_status"] == "pending"

def test_map_aggregated_patient_cancelled_visit():
    p = {
        "institute_id": "123",
        "patient_visits": [
            {
                "visit_id": "v1", "status": "cancelled", "invoice_no": None,
                "lab_tests": [{"status": "cancelled"}], "prescriptions": [{"medicine": "A"}]
            }
        ]
    }
    res = _map_aggregated_patient(p)
    assert res["workflow_status"] == "cancelled"
    assert res["bill_status"] == "cancelled"
    assert res["lab_status"] == "cancelled"

def test_get_active_visit_id(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.find_one.return_value = {"visit_id": "v1"}
    assert _get_active_visit_id("123", "doc1") == "v1"

def test_finalize_visit(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    _finalize_visit('v1', 'completed')
    mock_visits.update_one.assert_called_once()

def test_get_receptionist_queue(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.aggregate.return_value = [{"visit_id": "v1", "status": "booked"}]
    
    # Test without date filter
    res = patients_db.get_receptionist_queue(status_filter="all")
    assert len(res) == 1
    
    # Test with active status
    res = patients_db.get_receptionist_queue(status_filter="active")
    assert len(res) == 1
    
    # Test with dates
    res = patients_db.get_receptionist_queue(start_date="2026-06-01", end_date="2026-06-30", status_filter="")
    assert len(res) == 1

def test_book_appointment_confirmed(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.update_one.return_value.matched_count = 1
    
    res = book_appointment("123", "doc1", "Dr. One", "10:00", status="confirmed")
    assert res is True
    mock_visits.insert_one.assert_called_once()

def test_generate_relation_id():
    # Test prefixes
    assert patients_db.generate_relation_id("P123", "Son", []) == "P123-SON1"
    assert patients_db.generate_relation_id("P123", "Daughter", []) == "P123-DAUGHTER1"
    assert patients_db.generate_relation_id("P123", "Spouse", []) == "P123-SPOUSE"
    assert patients_db.generate_relation_id("P123", "Father-in-law", []) == "P123-FIL"
    assert patients_db.generate_relation_id("P123", "Mother-in-law", []) == "P123-MIL"
    assert patients_db.generate_relation_id("P123", "Father", []) == "P123-FATHER"
    assert patients_db.generate_relation_id("P123", "Mother", []) == "P123-MOTHER"
    assert patients_db.generate_relation_id("P123", "Uncle", []) == "P123-OTHER1"
    
    # Test existing numbering
    family = [{"institute_id": "P123-SON1"}, {"institute_id": "P123-SON2"}]
    assert patients_db.generate_relation_id("P123", "Son", family) == "P123-SON3"
    
    # Test unnumbered spouse becomes numbered if duplicate
    family2 = [{"institute_id": "P123-SPOUSE"}]
    assert patients_db.generate_relation_id("P123", "Spouse", family2) == "P123-SPOUSE2"

def test_bulk_register_patients_duplicate_in_file(mocker):
    rows = [
        {"institute_id": "1", "name": "Pat1", "email": "a@b.com", "date_of_birth": "1990-01-01", "gender": "M", "contact_no": "123", "patient_type": "Student", "address": "Addr"},
        {"institute_id": "1", "name": "Pat2", "email": "a@b.com", "date_of_birth": "1990-01-01", "gender": "M", "contact_no": "123", "patient_type": "Student", "address": "Addr"}
    ]
    res = bulk_register_patients(rows, "admin")
    assert res["success"] == 0
    assert res["failed"] == 2
    assert "Duplicate institute_id within the uploaded file" in res["errors"][1]["reason"]

def test_bulk_register_patients_already_in_db(mocker):
    mocker.patch("app.database.patients.register_patient", return_value=None)
    rows = [
        {"institute_id": "1", "name": "Pat", "email": "a@b.com", "date_of_birth": "1990-01-01", "gender": "M", "contact_no": "1234567890", "patient_type": "Student", "address": "Addr"}
    ]
    res = bulk_register_patients(rows, "admin")
    assert res["success"] == 0
    assert res["failed"] == 1
    assert "Already registered in database" in res["errors"][0]["reason"]

