import os
import pytest
from unittest.mock import MagicMock

# Set required environment variables before importing app
os.environ["MONGO_URI"] = "mongodb://localhost:27017/test_hms"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["EMAIL_ADDRESS"] = "test@example.com"
os.environ["EMAIL_PASSWORD"] = "testpassword"
os.environ["AWS_ACCESS_KEY"] = "test"
os.environ["AWS_SECRET_KEY"] = "test"

import unittest.mock
# Mock MongoClient, boto3, and redis BEFORE importing the app
unittest.mock.patch('pymongo.MongoClient').start()
unittest.mock.patch('boto3.client').start()
unittest.mock.patch('redis.Redis').start()

# Import app after setting env vars
from main import app as flask_app
@pytest.fixture
def app():
    import database
    database.redis_client = None
    flask_app.config.update({
        "TESTING": True,
        "JWT_SECRET_KEY": "test-secret-key"
    })
    yield flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def mock_db(mocker):
    """Fixture to mock database.py functions."""
    import database
    
    # Mocking Redis client to None to force DB fetch instead of cache
    database.redis_client = None
    
    # Mock basic functions that get called frequently
    mock_get_all_doctors = mocker.patch("database.get_all_doctors", return_value=[])
    mock_register_patient = mocker.patch("database.register_patient", return_value="TEST-123")
    mock_get_patient = mocker.patch("database.get_patient_by_id", return_value={"institute_id": "TEST-123", "name": "Test User", "account_status": "active"})
    
    # Mocks for auth routes
    mock_authenticate_user = mocker.patch("database.authenticate_user", return_value={"role": "admin", "username": "admin_user"})
    mock_start_session = mocker.patch("database.start_session", return_value=True)
    mock_end_session = mocker.patch("database.end_session", return_value=True)
    mock_hash_password = mocker.patch("database.hash_password", return_value=b"hashed_pwd")
    mock_users_collection = mocker.patch("database.users")
    
    # Mocks for staff routes
    mock_get_all_users = mocker.patch("database.get_all_users", return_value=[{"username": "testuser", "role": "staff"}])
    mock_create_user = mocker.patch("database.create_user", return_value=True)
    mock_update_doctor_schedule = mocker.patch("database.update_doctor_schedule", return_value=True)
    mock_delete_user = mocker.patch("database.delete_user", return_value=True)
    mock_get_active_pending_patients = mocker.patch("database.get_active_pending_patients", return_value=[])
    
    return {
        "get_all_doctors": mock_get_all_doctors,
        "register_patient": mock_register_patient,
        "get_patient_by_id": mock_get_patient,
        "authenticate_user": mock_authenticate_user,
        "start_session": mock_start_session,
        "end_session": mock_end_session,
        "hash_password": mock_hash_password,
        "users_collection": mock_users_collection,
        "get_all_users": mock_get_all_users,
        "create_user": mock_create_user,
        "update_doctor_schedule": mock_update_doctor_schedule,
        "delete_user": mock_delete_user,
        "get_active_pending_patients": mock_get_active_pending_patients,
        "redis_client": None
    }
