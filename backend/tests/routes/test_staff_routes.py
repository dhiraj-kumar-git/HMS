import pytest
from flask_jwt_extended import create_access_token
import json

def test_get_users_admin(client, mock_db, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(json.loads(response.data)) == 1

def test_get_users_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="staff", additional_claims={"role": "doctor"})
    response = client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

def test_get_user_found(client, mock_db, app):
    mock_db["users_collection"].find_one.return_value = {"username": "doc", "display_name": "Doctor Doc"}
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.get("/users/doc", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert json.loads(response.data)["display_name"] == "Doctor Doc"

def test_get_user_not_found(client, mock_db, app):
    mock_db["users_collection"].find_one.return_value = None
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.get("/users/unknown", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 404

def test_get_doctors_receptionist(client, mock_db, app):
    mock_db["get_all_doctors"].return_value = [{"username": "doc", "display_name": "Dr. Smith", "department": "Cardio", "schedule": []}]
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    response = client.get("/doctors", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data) == 1
    assert data[0]["display_name"] == "Dr. Smith"

def test_get_doctors_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="patient", additional_claims={"role": "patient"})
    response = client.get("/doctors", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

def test_create_user_success(client, mock_db, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.post("/create_user", headers={"Authorization": f"Bearer {token}"}, json={
        "username": "newdoc", "password": "pwd", "role": "doctor", "display_name": "New Doc", "department": "Neuro", "schedule": ["Mon", "Tue"]
    })
    assert response.status_code == 201

def test_create_user_missing_fields(client, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.post("/create_user", headers={"Authorization": f"Bearer {token}"}, json={
        "username": "newdoc"
    })
    assert response.status_code == 400

def test_create_user_doctor_missing_dept(client, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.post("/create_user", headers={"Authorization": f"Bearer {token}"}, json={
        "username": "newdoc", "password": "pwd", "role": "doctor", "display_name": "New Doc"
    })
    assert response.status_code == 400
    assert "Department is required" in json.loads(response.data)["error"]

def test_create_user_already_exists(client, mock_db, app):
    mock_db["create_user"].return_value = False
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.post("/create_user", headers={"Authorization": f"Bearer {token}"}, json={
        "username": "newdoc", "password": "pwd", "role": "admin", "display_name": "New Doc"
    })
    assert response.status_code == 400
    assert "already exists" in json.loads(response.data)["error"]

def test_update_doctor_success(client, mock_db, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.put("/api/update_doctor/doc", headers={"Authorization": f"Bearer {token}"}, json={"schedule": ["Mon"]})
    assert response.status_code == 200

def test_update_doctor_invalid_schedule(client, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.put("/api/update_doctor/doc", headers={"Authorization": f"Bearer {token}"}, json={"schedule": "not_a_list"})
    assert response.status_code == 400

def test_update_doctor_not_found(client, mock_db, app):
    mock_db["update_doctor_schedule"].return_value = False
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.put("/api/update_doctor/doc", headers={"Authorization": f"Bearer {token}"}, json={"schedule": ["Mon"]})
    assert response.status_code == 404

def test_delete_user_success(client, mock_db, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.delete("/delete_user/doc", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200

def test_delete_user_not_found(client, mock_db, app):
    mock_db["delete_user"].return_value = False
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.delete("/delete_user/doc", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 404

def test_active_registrations_medical_store(client, mock_db, app):
    mock_db["get_active_pending_patients"].return_value = [{"name": "Patient 1"}]
    with app.app_context():
        token = create_access_token(identity="store", additional_claims={"role": "medical_store"})
    response = client.get("/active_registrations", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(json.loads(response.data)) == 1

def test_active_registrations_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin"})
    response = client.get("/active_registrations", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
