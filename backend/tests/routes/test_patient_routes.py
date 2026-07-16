import pytest
import json
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

def test_register_patient_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "patient"})
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json={})
    assert res.status_code == 403

def test_register_patient_success(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mock_db["register_patient"].return_value = "123"
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    
    payload = {
        "name": "Pat",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "contact_no": "123",
        "email": "a@b.com",
        "address": "Addr",
        "doctor_assigned": "doc1",
        "patient_type": "Student",
        "institute_id": "INST123"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 201

def test_register_patient_temporary(client, mock_db, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mock_db["register_patient"].return_value = "TEMP-123"
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    
    payload = {
        "name": "Temp Pat",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "contact_no": "123",
        "email": "temp@example.com",
        "doctor_assigned": "doc1",
        "patient_type": "Temporary"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 201
    assert "TEMP-" in res.json["institute_id"]

def test_register_patient_temporary_missing_fields(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    
    payload = {
        "name": "Temp Pat",
        "patient_type": "Temporary"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 400

def test_register_patient_missing_fields(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    
    payload = {
        "name": "Student Pat",
        "patient_type": "Student"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 400

def test_register_patient_duplicate(client, mock_db, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mock_db["register_patient"].return_value = None
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    
    payload = {
        "name": "Pat",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "contact_no": "123",
        "email": "a@b.com",
        "address": "Addr",
        "doctor_assigned": "doc1",
        "patient_type": "Student",
        "institute_id": "INST123"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 409

def test_register_patient_with_appointment(client, mock_db, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mock_db["register_patient"].return_value = "INST123"
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    mocker.patch("app.routes.public_routes.validate_appointment_slot", return_value=(True, None))
    mocker.patch("database.users.find_one", return_value={"display_name": "Dr. First"})
    mocker.patch("database.book_appointment", return_value=True)
    
    payload = {
        "name": "Pat",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "contact_no": "123",
        "email": "a@b.com",
        "address": "Addr",
        "doctor_assigned": "doc1",
        "patient_type": "Student",
        "institute_id": "INST123",
        "appointment_time": "2026-06-25T10:00"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 201

def test_register_patient_with_appointment_conflict(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    # Validate fails
    mocker.patch("app.routes.public_routes.validate_appointment_slot", return_value=(False, ({"error": "Slot full"}, 409)))
    
    payload = {
        "name": "Pat",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "contact_no": "123",
        "email": "a@b.com",
        "address": "Addr",
        "doctor_assigned": "doc1",
        "patient_type": "Student",
        "institute_id": "INST123",
        "appointment_time": "2026-06-25T10:00"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 409

def test_register_patient_with_appointment_duplicate(client, mock_db, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    mocker.patch("app.routes.patient_routes.get_doctors_name", return_value={"doc1": "Dr. First"})
    mocker.patch("app.routes.public_routes.validate_appointment_slot", return_value=(True, None))
    # Return None for duplicate
    mock_db["register_patient"].return_value = None
    
    payload = {
        "name": "Pat",
        "date_of_birth": "1990-01-01",
        "gender": "M",
        "contact_no": "123",
        "email": "a@b.com",
        "address": "Addr",
        "doctor_assigned": "doc1",
        "patient_type": "Student",
        "institute_id": "INST123",
        "appointment_time": "2026-06-25T10:00"
    }
    res = client.post("/register_patient", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 409


def test_get_patient_success(client, mock_db, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "doctor"})
    mock_db["get_patient_by_id"].return_value = {"institute_id": "123"}
    res = client.get("/get_patient/123", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_get_patients_admin(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="admin1", additional_claims={"role": "admin"})
    mocker.patch("database.get_all_patients", return_value=[{"institute_id": "123"}])
    res = client.get("/patients", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_get_all_patients_for_doctor(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="doc1", additional_claims={"role": "doctor"})
    mocker.patch("database.users.find_one", return_value={"display_name": "Dr. One"})
    mocker.patch("database.get_patient_history_for_doctor", return_value=[{"institute_id": "123"}])
    res = client.get("/doctor/all_patients", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_get_doctor_patients(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="doc1", additional_claims={"role": "doctor"})
    mocker.patch("database.get_patients_by_doctor", return_value=[{"institute_id": "123"}])
    res = client.get("/doctor/patients", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_save_consultation_details(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="doc1", additional_claims={"role": "doctor"})
    mocker.patch("database.update_consultation_details", return_value=True)
    res = client.put("/doctor/save_consultation_details/123", headers={"Authorization": f"Bearer {token}"}, json={"prescription_data": {}})
    assert res.status_code == 200

def test_save_consultation(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="doc1", additional_claims={"role": "doctor"})
    mocker.patch("database.consultation_patient", return_value=True)
    res = client.post("/doctor/save_consultation/123", headers={"Authorization": f"Bearer {token}"}, json={"has_labs": False})
    assert res.status_code == 200

def test_complete_consultation(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="doc1", additional_claims={"role": "doctor"})
    mocker.patch("database.complete_consultation", return_value=True)
    res = client.post("/doctor/complete_consultation/123", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_get_inactive_patients(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="doc1", additional_claims={"role": "doctor"})
    mocker.patch("database.get_inactive_patients_by_doctor", return_value=[])
    res = client.get("/doctor/patients_inactive", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_add_dependant_later(client, mock_db, mocker):
    mocker.patch("database.get_family_by_psrn", return_value=[{"institute_id": "P123", "email": "a@b.com"}])
    mock_db["register_patient"].return_value = "P123-OTHER"
    
    payload = {"psrn_id": "P123", "dependant": {"name": "Dep1", "relation": "Son"}}
    res = client.post("/api/public/add_dependant", json=payload)
    assert res.status_code == 201

def test_get_family(client, mocker):
    mocker.patch("database.get_family_by_psrn", return_value=[{"institute_id": "P123"}])
    res = client.get("/api/family/P123")
    assert res.status_code == 200

def test_edit_dependant(client, mocker):
    mocker.patch("database.update_dependant", return_value=True)
    res = client.put("/api/family/dependant/D123", json={"name": "Dep New"})
    assert res.status_code == 200

def test_remove_dependant(client, mocker):
    mocker.patch("database.delete_dependant", return_value=True)
    res = client.delete("/api/family/dependant/D123")
    assert res.status_code == 200

def test_admin_archive_patient(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="admin1", additional_claims={"role": "admin"})
    mocker.patch("database.archive_patient", return_value=True)
    res = client.put("/api/admin/archive_patient/123", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_download_bulk_template(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="admin1", additional_claims={"role": "admin"})
    mocker.patch("flask.send_from_directory", return_value="file_content")
    res = client.get("/admin/bulk_register/template", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_bulk_register_patients(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="admin1", additional_claims={"role": "admin"})
    mocker.patch("database.bulk_register_patients", return_value={"success": 1, "failed": 0})
    
    import io
    file_content = b"institute_id,name,email,date_of_birth,gender,contact_no,patient_type,address\n1,Pat,a@b.com,1990-01-01,M,123,Student,Addr"
    data = {"file": (io.BytesIO(file_content), "test.csv")}
    
    res = client.post("/admin/bulk_register", headers={"Authorization": f"Bearer {token}"}, data=data, content_type="multipart/form-data")
    assert res.status_code == 200

def test_download_bulk_staff_template(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="admin1", additional_claims={"role": "admin"})
    mocker.patch("flask.send_from_directory", return_value="file_content")
    res = client.get("/admin/bulk_register_staff/template", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_bulk_register_staff(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="admin1", additional_claims={"role": "admin"})
    mocker.patch("database.bulk_register_staff_and_dependants", return_value={"success": 1, "failed": 0})
    
    import io
    file_content = b"primary_psrn_id,name,date_of_birth,gender,patient_type\nPSRN1,Staff,1990-01-01,M,Faculty"
    data = {"file": (io.BytesIO(file_content), "test.csv")}
    
    res = client.post("/admin/bulk_register_staff", headers={"Authorization": f"Bearer {token}"}, data=data, content_type="multipart/form-data")
    assert res.status_code == 200

def test_s3_upload_url(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
    
    res = client.post("/s3/upload-url", headers={"Authorization": f"Bearer {token}"}, json={"instituteId": "123", "filename": "test.pdf", "content_type": "application/pdf"})
    assert res.status_code == 200
    data = res.get_json()
    assert "upload_url" in data
    assert "/s3/proxy-upload?key=" in data["upload_url"]

def test_s3_save_metadata(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
    mocker.patch("database.add_lab_report", return_value=True)
    
    res = client.post("/s3/save-metadata", headers={"Authorization": f"Bearer {token}"}, json={"instituteId": "123", "key": "k", "filename": "test.pdf"})
    assert res.status_code == 200

def test_s3_view_url(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
    
    res = client.post("/s3/view-url", headers={"Authorization": f"Bearer {token}"}, json={"s3_key": "k"})
    assert res.status_code == 200
    data = res.get_json()
    assert "url" in data
    assert "/s3/proxy-download?key=k" in data["url"]

def test_receptionist_get_queue(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="recep1", additional_claims={"role": "receptionist"})
    mock_get_queue = mocker.patch("database.get_receptionist_queue", return_value=[{"visit_id": "v1", "status": "booked"}])
    res = client.get("/api/receptionist/queue?start_date=2026-06-20&end_date=2026-06-25&status=all", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = json.loads(res.data)
    assert len(data) == 1
    assert data[0]["status"] == "booked"
    mock_get_queue.assert_called_once_with(start_date="2026-06-20", end_date="2026-06-25", status_filter="all")

def test_receptionist_update_appointment_status(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="recep1", additional_claims={"role": "receptionist"})
    mocker.patch("database.update_appointment_status", return_value=True)
    res = client.post("/api/receptionist/appointment/v1/status", headers={"Authorization": f"Bearer {token}"}, json={"status": "confirmed"})
    assert res.status_code == 200
    assert json.loads(res.data)["message"] == "Appointment status updated"

def test_receptionist_book_appointment(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="recep1", additional_claims={"role": "receptionist"})
    
    # Mock validate_appointment_slot to return True (is_valid) and None (error)
    mocker.patch("app.routes.public_routes.validate_appointment_slot", return_value=(True, None))
    # Mock get_patient_by_id to return a valid active patient
    mocker.patch("database.get_patient_by_id", return_value={"institute_id": "f20250001", "account_status": "active"})
    # Mock doctor user retrieval
    mocker.patch("database.users.find_one", return_value={"username": "doc1", "display_name": "Dr. Smith", "role": "doctor"})
    # Mock book_appointment to return True
    mocker.patch("database.book_appointment", return_value=True)

    data = {
        "institute_id": "f20250001",
        "doctor_username": "doc1",
        "time": "2026-06-25T10:00"
    }

    res = client.post("/api/receptionist/book-appointment", headers={"Authorization": f"Bearer {token}"}, json=data)
    assert res.status_code == 200
    assert "Appointment booked and confirmed successfully" in res.json["message"]

def test_receptionist_confirm_appointment_email_success(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="recep1", additional_claims={"role": "receptionist"})
    
    mock_visit = {
        "visit_id": "v_test",
        "institute_id": "p_test",
        "doctor_name": "Dr. Smith",
        "time": "2026-07-11T12:00:00",
        "status": "booked"
    }
    mock_patient = {
        "institute_id": "p_test",
        "name": "Jane Doe",
        "email": "jane@example.com"
    }
    
    mocker.patch("database.visits.find_one", return_value=mock_visit)
    mocker.patch("database.patients.find_one", return_value=mock_patient)
    mocker.patch("database.update_appointment_status", return_value=True)
    mock_send = mocker.patch("app.routes.lab_routes.send_email", return_value=None)
    
    res = client.post("/api/receptionist/appointment/v_test/status", headers={"Authorization": f"Bearer {token}"}, json={"status": "confirmed"})
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["message"] == "Appointment status updated"
    assert data["email_error"] is None
    mock_send.assert_called_once()

def test_receptionist_confirm_appointment_email_failure(client, mock_db, mocker, app):
    with app.app_context():
        token = create_access_token(identity="recep1", additional_claims={"role": "receptionist"})
    
    mock_visit = {
        "visit_id": "v_test",
        "institute_id": "p_test",
        "doctor_name": "Dr. Smith",
        "time": "2026-07-11T12:00:00",
        "status": "booked"
    }
    mock_patient = {
        "institute_id": "p_test",
        "name": "Jane Doe",
        "email": "jane@example.com"
    }
    
    mocker.patch("database.visits.find_one", return_value=mock_visit)
    mocker.patch("database.patients.find_one", return_value=mock_patient)
    mocker.patch("database.update_appointment_status", return_value=True)
    mocker.patch("app.routes.lab_routes.send_email", side_effect=Exception("SMTP Connection Error"))
    
    res = client.post("/api/receptionist/appointment/v_test/status", headers={"Authorization": f"Bearer {token}"}, json={"status": "confirmed"})
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["message"] == "Appointment status updated"
    assert "SMTP Connection Error" in data["email_error"]
import json
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

def test_s3_proxy_upload_success(client, mocker, app):
    mocker.patch("app.routes.patient_routes.s3.put_object", return_value={})
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
        
    res = client.put("/s3/proxy-upload?key=reports/user1/test.pdf", headers={"Authorization": f"Bearer {token}"}, data=b"pdf content")
    assert res.status_code == 200
    assert b"File uploaded successfully" in res.data

def test_s3_proxy_upload_missing_token(client, mocker, app):
    res = client.put("/s3/proxy-upload?key=reports/user1/test.pdf", data=b"pdf content")
    assert res.status_code == 401

def test_s3_proxy_download_success(client, mocker, app):
    mock_body = MagicMock()
    mock_body.read.return_value = b"pdf binary content"
    mocker.patch("app.routes.patient_routes.s3.get_object", return_value={"Body": mock_body})
    
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
        
    res = client.get("/s3/proxy-download?key=reports/user1/test.pdf", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.data == b"pdf binary content"
    assert res.mimetype == "application/pdf"

def test_s3_proxy_download_missing_key(client, mocker, app):
    res = client.get("/s3/proxy-download")
    assert res.status_code == 400

def test_s3_proxy_upload_invalid_token(client, mocker, app):
    res = client.put("/s3/proxy-upload?key=reports/user1/test.pdf", headers={"Authorization": "Bearer invalid-token"}, data=b"pdf content")
    assert res.status_code == 422

def test_s3_proxy_upload_missing_key(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
    res = client.put("/s3/proxy-upload", headers={"Authorization": f"Bearer {token}"}, data=b"pdf content")
    assert res.status_code == 400

def test_s3_proxy_upload_s3_error(client, mocker, app):
    mocker.patch("app.routes.patient_routes.s3.put_object", side_effect=Exception("MinIO Connection Timeout"))
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
    res = client.put("/s3/proxy-upload?key=reports/user1/test.pdf", headers={"Authorization": f"Bearer {token}"}, data=b"pdf content")
    assert res.status_code == 500
    assert b"MinIO Connection Timeout" in res.data

def test_s3_proxy_download_invalid_token(client, mocker, app):
    res = client.get("/s3/proxy-download?key=reports/user1/test.pdf", headers={"Authorization": "Bearer invalid-token"})
    assert res.status_code == 422

def test_s3_proxy_download_s3_error(client, mocker, app):
    mocker.patch("app.routes.patient_routes.s3.get_object", side_effect=Exception("S3 Object Not Found"))
    with app.app_context():
        token = create_access_token(identity="user1", additional_claims={"role": "doctor"})
    res = client.get("/s3/proxy-download?key=reports/user1/test.pdf", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 500
    assert b"S3 Object Not Found" in res.data
