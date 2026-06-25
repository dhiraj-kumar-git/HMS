import json
from unittest.mock import MagicMock

def test_public_get_doctors(client, mock_db):
    # Set the mock return value
    mock_db["get_all_doctors"].return_value = [
        {"username": "dr_smith", "display_name": "Dr. Smith", "department": "Cardiology"}
    ]
    
    response = client.get("/api/public/doctors")
    assert response.status_code == 200
    
    data = json.loads(response.data)
    assert len(data) == 1
    assert data[0]["display_name"] == "Dr. Smith"
    
def test_public_register_patient(client, mock_db):
    payload = {
        "name": "Jane Doe",
        "date_of_birth": "1990-01-01",
        "gender": "Female",
        "contact_no": "1234567890",
        "institute_id": "ST-9999",
        "address": "123 Main St",
        "email": "jane@example.com",
        "patient_type": "Student"
    }
    
    response = client.post("/api/public/register", json=payload)
    assert response.status_code == 201
    
    data = json.loads(response.data)
    assert data["message"] == "Patient registered successfully"
    assert data["institute_id"] == "TEST-123"
    
    # Verify that the mocked function was called
    mock_db["register_patient"].assert_called_once()
    
def test_public_register_patient_missing_fields(client):
    # Missing 'name' and 'gender'
    payload = {
        "date_of_birth": "1990-01-01",
        "contact_no": "1234567890",
        "institute_id": "ST-9999",
        "address": "123 Main St",
        "email": "jane@example.com",
        "patient_type": "Student"
    }
    
    response = client.post("/api/public/register", json=payload)
    assert response.status_code == 400
    
    data = json.loads(response.data)
    assert "error" in data

def test_public_register_staff_success(client, mock_db):
    payload = {
        "primary": {
            "name": "Dr. Staff",
            "date_of_birth": "1980-01-01",
            "gender": "Male",
            "contact_no": "1234567890",
            "psrn_id": "PSRN123",
            "address": "Campus",
            "email": "staff@bits.edu"
        },
        "dependants": [
            {"name": "Son Staff", "date_of_birth": "2010-01-01", "gender": "Male", "relation": "Son"}
        ]
    }
    
    response = client.post("/api/public/register_staff", json=payload)
    assert response.status_code == 201
    assert mock_db["register_patient"].call_count == 2
    
def test_send_registration_otp(client, mocker):
    import database
    mock_redis = MagicMock()
    database.redis_client = mock_redis
    mocker.patch("app.routes.public_routes.send_email")
    
    response = client.post("/api/public/send_registration_otp", json={"email": "test@example.com"})
    assert response.status_code == 200
    mock_redis.setex.assert_called_once()
    database.redis_client = None

def test_verify_registration_otp(client):
    import database
    mock_redis = MagicMock()
    mock_redis.get.return_value = "1234"
    database.redis_client = mock_redis
    
    response = client.post("/api/public/verify_registration_otp", json={"email": "test@example.com", "otp": "1234"})
    assert response.status_code == 200
    mock_redis.delete.assert_called_once()
    database.redis_client = None

def test_public_verify_patient(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active", "email": "test@example.com", "name": "Patient"}
    mocker.patch("database.store_patient_otp", return_value=True)
    mocker.patch("app.routes.public_routes.send_email")
    
    response = client.post("/api/public/verify", json={"institute_id": "123"})
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["requires_otp"] is True

def test_public_verify_otp(client, mock_db, mocker):
    mocker.patch("database.verify_patient_otp", return_value=(True, ""))
    mock_db["get_patient_by_id"].return_value = {"institute_id": "123", "name": "Patient"}
    
    response = client.post("/api/public/verify-otp", json={"institute_id": "123", "otp": "1234"})
    assert response.status_code == 200
    assert json.loads(response.data)["name"] == "Patient"

def test_public_book_appointment_success(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.users.find_one", return_value={"display_name": "Dr. Test"})
    mocker.patch("database.visits.count_documents", return_value=0)
    mocker.patch("database.book_appointment", return_value=True)
    
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T10:00"})
    assert response.status_code == 200

def test_public_book_appointment_patient_limit(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.visits.count_documents", return_value=3)
    
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T10:00"})
    assert response.status_code == 403
    assert "maximum limit of 3 active appointments" in json.loads(response.data)["error"]

def test_public_book_appointment_warning(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.users.find_one", return_value={"display_name": "Dr. Test"})
    # First count is patient limit (0), second is capacity (1)
    mocker.patch("database.visits.count_documents", side_effect=[0, 1, 0, 1])
    
    # Without force flag
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T10:00"})
    assert response.status_code == 409
    assert json.loads(response.data)["requires_confirmation"] is True
    
    # With force flag
    mocker.patch("database.book_appointment", return_value=True)
    response2 = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T10:00", "force": True})
    assert response2.status_code == 200

def test_public_book_appointment_slot_full(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.users.find_one", return_value={
        "display_name": "Dr. Test",
        "schedule": [{"duty_days": ["Sunday"], "start_time": "09:00", "end_time": "10:00"}]
    })
    
    # First count is patient limit (0), second is capacity (3)
    mocker.patch("database.visits.count_documents", side_effect=[0, 3])
    mocker.patch("database.visits.find", return_value=[])
    
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T09:00"})
    assert response.status_code == 409
    assert "no longer available" in json.loads(response.data)["error"]

def test_public_book_appointment_day_full(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.users.find_one", return_value={
        "display_name": "Dr. Test",
        "schedule": [{"duty_days": ["Sunday"], "start_time": "09:00", "end_time": "09:20"}]
    })
    
    # First count is patient limit (0), second is capacity (3)
    mocker.patch("database.visits.count_documents", side_effect=[0, 3])
    # Mock find for the whole day to simulate all slots are full
    # 09:00, 09:10, 09:20 are the slots (3 slots). 3 appointments each = 9.
    fake_appointments = []
    for slot in ["09:00", "09:10", "09:20"]:
        for _ in range(3):
            fake_appointments.append({"time": f"2026-06-21T{slot}"})
    mocker.patch("database.visits.find", return_value=fake_appointments)
    
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T09:00"})
    assert response.status_code == 409
    assert "Doctor is not available" in json.loads(response.data)["error"]

def test_check_active_appointments(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.visits.find", return_value=[{"doctor_username": "doc", "time": "10:00", "status": "upcoming"}])
    
    response = client.get("/api/public/check-active-appointments/123")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data["active_appointments"]) == 1

def test_doctor_availability(client, mock_db, mocker):
    mocker.patch("database.visits.find", return_value=[
        {"time": "2026-06-21T10:00"},
        {"time": "2026-06-21T10:00"},
        {"time": "2026-06-21T10:00"},
        {"time": "2026-06-21T10:10"}
    ])
    
    response = client.get("/api/public/doctor-availability/doc?date=2026-06-21")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "10:00" in data["full_slots"]
    assert "10:10" not in data["full_slots"]

def test_doctor_availability_missing_date(client):
    response = client.get("/api/public/doctor-availability/doc")
    assert response.status_code == 400

def test_send_registration_otp_missing_email(client):
    response = client.post("/api/public/send_registration_otp", json={})
    assert response.status_code == 400

def test_send_registration_otp_redis_offline(client):
    import database
    database.redis_client = None
    response = client.post("/api/public/send_registration_otp", json={"email": "test@example.com"})
    assert response.status_code == 500

def test_verify_registration_otp_missing_fields(client):
    response = client.post("/api/public/verify_registration_otp", json={"email": "test@example.com"})
    assert response.status_code == 400

def test_verify_registration_otp_redis_offline(client):
    import database
    database.redis_client = None
    response = client.post("/api/public/verify_registration_otp", json={"email": "test@example.com", "otp": "1234"})
    assert response.status_code == 500

def test_verify_registration_otp_expired(client):
    import database
    from unittest.mock import MagicMock
    mock_redis = MagicMock()
    mock_redis.get.return_value = None
    database.redis_client = mock_redis
    
    response = client.post("/api/public/verify_registration_otp", json={"email": "test@example.com", "otp": "1234"})
    assert response.status_code == 400
    database.redis_client = None

def test_verify_registration_otp_invalid(client):
    import database
    from unittest.mock import MagicMock
    mock_redis = MagicMock()
    mock_redis.get.return_value = "0000"
    database.redis_client = mock_redis
    
    response = client.post("/api/public/verify_registration_otp", json={"email": "test@example.com", "otp": "1234"})
    assert response.status_code == 400
    database.redis_client = None

def test_public_verify_patient_missing_id(client):
    response = client.post("/api/public/verify", json={})
    assert response.status_code == 400

def test_public_verify_patient_not_found(client, mock_db):
    mock_db["get_patient_by_id"].return_value = None
    response = client.post("/api/public/verify", json={"institute_id": "123"})
    assert response.status_code == 404

def test_public_verify_patient_archived(client, mock_db):
    mock_db["get_patient_by_id"].return_value = {"account_status": "archived"}
    response = client.post("/api/public/verify", json={"institute_id": "123"})
    assert response.status_code == 403

def test_public_verify_patient_no_email(client, mock_db):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active", "email": None}
    response = client.post("/api/public/verify", json={"institute_id": "123"})
    assert response.status_code == 400

def test_public_verify_patient_otp_fail(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active", "email": "test@example.com", "name": "Patient"}
    mocker.patch("database.store_patient_otp", return_value=False)
    
    response = client.post("/api/public/verify", json={"institute_id": "123"})
    assert response.status_code == 500

def test_public_verify_patient_email_mask_fallback(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active", "email": "invalidemail", "name": "Patient"}
    mocker.patch("database.store_patient_otp", return_value=True)
    mocker.patch("app.routes.public_routes.send_email")
    
    response = client.post("/api/public/verify", json={"institute_id": "123"})
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["email"] == "your registered email"

def test_public_verify_otp_missing_fields(client):
    response = client.post("/api/public/verify-otp", json={"institute_id": "123"})
    assert response.status_code == 400

def test_public_verify_otp_failure(client, mock_db):
    mock_db["verify_patient_otp"].return_value = (False, "Invalid OTP")
    response = client.post("/api/public/verify-otp", json={"institute_id": "123", "otp": "0000"})
    assert response.status_code == 400

def test_public_verify_otp_patient_not_found(client, mock_db):
    mock_db["verify_patient_otp"].return_value = (True, "")
    mock_db["get_patient_by_id"].return_value = None
    response = client.post("/api/public/verify-otp", json={"institute_id": "123", "otp": "1234"})
    assert response.status_code == 404

def test_public_book_appointment_receptionist_warning(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.users.find_one", return_value={"display_name": "Dr. Test"})
    # First count is patient limit (0), second is capacity (1)
    mocker.patch("database.visits.count_documents", side_effect=[0, 1])
    
    # Booked by receptionist
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "2026-06-21T10:00", "booked_by": "receptionist"})
    assert response.status_code == 409
    assert "Continue?" in json.loads(response.data)["warning"]
