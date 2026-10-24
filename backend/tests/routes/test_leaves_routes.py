import pytest
import json
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

def test_get_leaves_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "patient"})
    res = client.get("/api/receptionist/leaves", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403

def test_get_leaves_success(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
    
    mock_leaves = [
        {"doctor_username": "doc1", "start_date": "2026-07-15", "end_date": "2026-07-20", "reason": "Sick Leave"}
    ]
    # Mock leaves collection
    mocker.patch("database.leaves.find", return_value=mock_leaves)
    
    res = client.get("/api/receptionist/leaves", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json) == 1
    assert res.json[0]["doctor_username"] == "doc1"

def test_create_leave_success(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
        
    mocker.patch("database.users.find_one", return_value={"username": "doc1", "role": "doctor", "display_name": "Dr. House"})
    mock_insert = mocker.patch("database.leaves.insert_one")
    
    payload = {
        "doctor_username": "doc1",
        "start_date": "2026-07-15",
        "end_date": "2026-07-20",
        "reason": "Conference"
    }
    
    res = client.post("/api/receptionist/leaves", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 201
    assert "Leave recorded successfully" in res.json["message"]
    mock_insert.assert_called_once()

def test_create_leave_doctor_not_found(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
        
    mocker.patch("database.users.find_one", return_value=None)
    
    payload = {
        "doctor_username": "doc_unknown",
        "start_date": "2026-07-15",
        "end_date": "2026-07-20"
    }
    
    res = client.post("/api/receptionist/leaves", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 404
    assert "not found" in res.json["error"]

def test_create_leave_invalid_dates(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
        
    mocker.patch("database.users.find_one", return_value={"username": "doc1", "role": "doctor"})
    
    payload = {
        "doctor_username": "doc1",
        "start_date": "2026-07-20",
        "end_date": "2026-07-15"  # start after end
    }
    
    res = client.post("/api/receptionist/leaves", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 400
    assert "before or equal to" in res.json["error"]

def test_delete_leave_success(client, app, mocker):
    with app.app_context():
        token = create_access_token(identity="recep", additional_claims={"role": "receptionist"})
        
    mock_delete = MagicMock()
    mock_delete.deleted_count = 1
    mocker.patch("database.leaves.delete_one", return_value=mock_delete)
    
    res = client.delete("/api/receptionist/leaves/some-id", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert "deleted successfully" in res.json["message"]
