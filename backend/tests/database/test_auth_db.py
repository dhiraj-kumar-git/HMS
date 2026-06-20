import pytest
import bcrypt
from unittest.mock import MagicMock
from app.database.auth import hash_password, check_password, authenticate_user, start_session, end_session
import app.database.auth as auth_db

def test_hash_password():
    pwd = "secretpassword"
    hashed = hash_password(pwd)
    assert hashed != pwd.encode('utf-8')
    assert check_password(pwd, hashed)

def test_check_password_wrong():
    pwd = "secretpassword"
    hashed = hash_password(pwd)
    assert not check_password("wrongpassword", hashed)

def test_authenticate_user_success(mocker):
    # Mock users collection
    mock_users = mocker.patch.object(auth_db, 'users')
    
    # Create a real hash so check_password passes
    pwd = "my_secure_password"
    hashed = hash_password(pwd).decode('utf-8')
    
    mock_users.find_one.return_value = {
        "username": "admin_user",
        "password": hashed,
        "role": "admin"
    }
    
    result = authenticate_user("admin_user", pwd)
    assert result is not None
    assert result["username"] == "admin_user"
    assert result["role"] == "admin"
    mock_users.find_one.assert_called_once_with({"username": "admin_user"})

def test_authenticate_user_not_found(mocker):
    mock_users = mocker.patch.object(auth_db, 'users')
    mock_users.find_one.return_value = None
    
    result = authenticate_user("unknown", "pwd")
    assert result is None

def test_authenticate_user_wrong_password(mocker):
    mock_users = mocker.patch.object(auth_db, 'users')
    pwd = "my_secure_password"
    hashed = hash_password(pwd).decode('utf-8')
    
    mock_users.find_one.return_value = {
        "username": "admin_user",
        "password": hashed,
        "role": "admin"
    }
    
    result = authenticate_user("admin_user", "wrong_pwd")
    assert result is None

def test_start_session(mocker):
    mock_sessions = mocker.patch.object(auth_db, 'sessions')
    
    start_session("admin_user", "session123")
    
    mock_sessions.insert_one.assert_called_once()
    called_args = mock_sessions.insert_one.call_args[0][0]
    assert called_args["username"] == "admin_user"
    assert called_args["session_id"] == "session123"
    assert called_args["active"] is True
    assert "login_time" in called_args

def test_end_session_success(mocker):
    mock_sessions = mocker.patch.object(auth_db, 'sessions')
    mock_sessions.update_one.return_value.modified_count = 1
    
    # Mock redis client
    mock_redis = MagicMock()
    mocker.patch.object(auth_db, 'redis_client', mock_redis)
    
    import time
    future_time = time.time() + 3600 # 1 hour from now
    
    result = end_session("admin_user", "session123", jti="fake_jti", exp=future_time)
    
    assert result is True
    mock_sessions.update_one.assert_called_once()
    mock_redis.setex.assert_called_once()

def test_end_session_no_redis(mocker):
    mock_sessions = mocker.patch.object(auth_db, 'sessions')
    mock_sessions.update_one.return_value.modified_count = 0
    
    mocker.patch.object(auth_db, 'redis_client', None)
    
    result = end_session("admin_user", "session123")
    
    assert result is False
    mock_sessions.update_one.assert_called_once()
