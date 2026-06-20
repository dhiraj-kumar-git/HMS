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
    
    return {
        "get_all_doctors": mock_get_all_doctors,
        "register_patient": mock_register_patient,
        "get_patient_by_id": mock_get_patient,
        "redis_client": None
    }
