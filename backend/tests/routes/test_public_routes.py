import json

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
