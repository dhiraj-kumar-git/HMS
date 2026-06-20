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

def test_public_book_appointment(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.users.find_one", return_value={"display_name": "Dr. Test"})
    mocker.patch("database.book_appointment", return_value=True)
    
    response = client.post("/api/public/book-appointment", json={"institute_id": "123", "doctor_username": "doc", "time": "10:00"})
    assert response.status_code == 200

def test_check_active_appointments(client, mock_db, mocker):
    mock_db["get_patient_by_id"].return_value = {"account_status": "active"}
    mocker.patch("database.visits.find", return_value=[{"doctor_username": "doc", "time": "10:00", "status": "upcoming"}])
    
    response = client.get("/api/public/check-active-appointments/123")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data["active_appointments"]) == 1
