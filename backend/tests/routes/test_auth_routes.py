import pytest
from flask_jwt_extended import create_access_token
import json

def test_login_success(client, mock_db):
    """Test successful login with valid credentials."""
    mock_db["authenticate_user"].return_value = {"role": "admin", "username": "admin_user"}
    
    response = client.post("/login", json={
        "username": "admin_user",
        "password": "correct_password"
    })
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "access_token" in data
    assert data["role"] == "admin"
    assert "session_id" in data

def test_login_missing_fields(client, mock_db):
    """Test login with missing fields."""
    response = client.post("/login", json={
        "username": "admin_user"
    })
    
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data["error"] == "Missing username or password"

def test_login_invalid_credentials(client, mock_db):
    """Test login with invalid credentials."""
    mock_db["authenticate_user"].return_value = None
    
    response = client.post("/login", json={
        "username": "admin_user",
        "password": "wrong_password"
    })
    
    assert response.status_code == 401
    data = json.loads(response.data)
    assert data["error"] == "Invalid username or password"

def test_logout_success(client, mock_db, app):
    """Test successful logout."""
    # We must generate a valid token manually
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin", "session_id": "12345"})
        
    response = client.post("/logout", headers={
        "Authorization": f"Bearer {token}"
    })
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "logged out successfully" in data["message"]

def test_update_password_admin(client, mock_db, app):
    """Test password update by admin."""
    # Mock the update_one result to simulate a successful modification
    mock_db["users_collection"].update_one.return_value.modified_count = 1
    
    with app.app_context():
        token = create_access_token(identity="admin_user", additional_claims={"role": "admin", "session_id": "12345"})
        
    response = client.put("/update_password/target_user", 
        headers={"Authorization": f"Bearer {token}"},
        json={"new_password": "new_secure_password"}
    )
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["message"] == "Password updated successfully"

def test_update_password_non_admin(client, mock_db, app):
    """Test password update by non-admin is forbidden."""
    with app.app_context():
        token = create_access_token(identity="staff_user", additional_claims={"role": "staff", "session_id": "12345"})
        
    response = client.put("/update_password/target_user", 
        headers={"Authorization": f"Bearer {token}"},
        json={"new_password": "new_secure_password"}
    )
    
    assert response.status_code == 403
    data = json.loads(response.data)
    assert data["error"] == "Unauthorized"
