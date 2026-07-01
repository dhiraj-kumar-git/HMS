import pytest
from unittest.mock import MagicMock
from app.database.staff import create_user, delete_user, get_all_users, get_all_doctors, update_doctor_schedule, get_doctors_name
import app.database.staff as staff_db

def test_create_user_success(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.find_one.return_value = None
    
    # We deliberately don't mock hash_password because it's missing from the file!
    # This will cause a NameError when the test runs, highlighting the flaw.
    
    result = create_user("newdoc", "pwd", "doctor", "New Doc", "Cardio", ["Mon"])
    assert result is True
    mock_users.insert_one.assert_called_once()
    
def test_create_user_already_exists(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.find_one.return_value = {"username": "newdoc"}
    
    result = create_user("newdoc", "pwd", "doctor", "New Doc")
    assert result is False
    mock_users.insert_one.assert_not_called()

def test_delete_user_success(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.delete_one.return_value.deleted_count = 1
    assert delete_user("testuser") is True

def test_delete_user_not_found(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.delete_one.return_value.deleted_count = 0
    assert delete_user("testuser") is False

def test_get_all_users(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.find.return_value = [{"username": "u1"}, {"username": "u2"}]
    res = get_all_users()
    assert len(res) == 2
    assert res[0]["username"] == "u1"

def test_get_all_doctors(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    # One legacy doctor without schedule/dept, one with
    mock_users.find.return_value = [
        {"username": "doc1"},
        {"username": "doc2", "schedule": ["Mon"], "department": "Neuro"}
    ]
    res = get_all_doctors()
    assert len(res) == 2
    assert res[0]["schedule"] == []
    assert res[0]["department"] == ""
    assert res[1]["schedule"] == ["Mon"]
    assert res[1]["department"] == "Neuro"

def test_update_doctor_schedule_success(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.update_one.return_value.matched_count = 1
    assert update_doctor_schedule("doc1", ["Tue"]) is True
    mock_users.update_one.assert_called_once_with({"username": "doc1", "role": "doctor"}, {"$set": {"schedule": ["Tue"]}})

def test_update_doctor_schedule_not_found(mocker):
    mock_users = mocker.patch.object(staff_db, 'users')
    mock_users.update_one.return_value.matched_count = 0
    assert update_doctor_schedule("doc1", ["Tue"]) is False

def test_get_doctors_name(mocker):
    mock_db = mocker.patch.object(staff_db, 'db')
    mock_db.users.find.return_value = [
        {"username": "doc1", "display_name": "Dr. First"},
        {"username": "doc2"}  # No display name
    ]
    res = get_doctors_name()
    assert res["doc1"] == "Dr. First"
    assert res["doc2"] == "doc2"
