import pytest
from unittest.mock import MagicMock
from app.database.lab import (
    add_lab_report, get_lab_reports, get_lab_patients,
    submit_lab_results, load_lab_tests_from_config, get_test_price
)
import app.database.lab as lab_db
import json

def test_add_lab_report(mocker):
    mock_visits = mocker.patch.object(lab_db, 'visits')
    mock_patients = mocker.patch.object(lab_db, 'patients')
    
    mock_visits.find_one.return_value = {"visit_id": "v123"}
    mock_visits.update_one.return_value.modified_count = 1
    
    res = add_lab_report("123", "v123", {"test_name": "Blood"})
    assert res is True

def test_get_lab_reports(mocker):
    mock_patients = mocker.patch.object(lab_db, 'patients')
    mock_patients.aggregate.return_value = [{"institute_id": "123"}]
    mocker.patch("app.database.lab._map_aggregated_patient", return_value={"institute_id": "123"})
    res = get_lab_reports()
    assert len(res) == 1

def test_get_lab_patients(mocker):
    mock_visits = mocker.patch.object(lab_db, 'visits')
    mock_visits.aggregate.return_value = [{"patient_info": {"institute_id": "123", "_id": "1"}}]
    res = get_lab_patients()
    assert len(res) == 1

def test_submit_lab_results(mocker):
    mock_patients = mocker.patch.object(lab_db, 'patients')
    mock_visits = mocker.patch.object(lab_db, 'visits')
    mocker.patch("app.database.lab._get_active_visit_id", return_value="v123")
    
    mock_patients.find_one.return_value = {"institute_id": "123"}
    mock_patients.update_one.return_value.modified_count = 1
    
    res = submit_lab_results("123", [{"test": "Blood"}])
    assert res is True

def test_load_lab_tests_from_config_success(mocker):
    mocker.patch("builtins.open", mocker.mock_open(read_data='[{"test_name": "Blood"}]'))
    res = load_lab_tests_from_config()
    assert len(res) == 1
    assert res[0]["test_name"] == "Blood"

def test_load_lab_tests_from_config_failure(mocker):
    mocker.patch("builtins.open", side_effect=Exception("File not found"))
    res = load_lab_tests_from_config()
    assert res == []

def test_get_test_price():
    config = [{"test_name": "Blood", "rates": [10, 20]}]
    res = get_test_price("blood", config)
    assert res == 20
    
    res = get_test_price("unknown", config)
    assert res == 0
