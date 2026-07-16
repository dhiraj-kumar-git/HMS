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
    assert "confirmed" in res
    assert "upcoming" in res
    assert len(res["confirmed"]) == 1
    assert len(res["upcoming"]) == 1

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

def test_validate_and_complete_lab_report(mocker):
    mock_visits = mocker.patch.object(lab_db, 'visits')
    mock_patients = mocker.patch.object(lab_db, 'patients')
    mocker.patch("app.database.lab.load_lab_tests_from_config", return_value=[{"test_name": "Blood", "test_id": "T1"}])

    # Case 1: Visit not found
    mock_visits.find_one.return_value = None
    success, msg = lab_db.validate_and_complete_lab_report("123", "v123")
    assert success is False
    assert "Visit not found" in msg

    # Case 2: Validation success
    mock_visits.find_one.return_value = {
        "visit_id": "v123",
        "institute_id": "123",
        "lab_tests": [{"lab_test": "Blood"}],
        "lab_results_draft": {"Blood": {"value": "Normal"}}
    }
    success, msg = lab_db.validate_and_complete_lab_report("123", "v123")
    assert success is True
    assert "completed" in msg


def test_migrate_legacy_lab_reports(mocker):
    mock_visits = mocker.patch.object(lab_db, 'visits')
    mocker.patch("app.database.lab.load_lab_tests_from_config", return_value=[
        {"test_name": "CBC", "test_id": "CBC"},
        {"test_name": "VITAMIN D3 25 OH TOTAL", "test_id": "VitD"}
    ])

    # Mock visit with combined results
    mock_visits.find.return_value = [
        {
            "visit_id": "v123",
            "lab_tests": [
                {"lab_test": "CBC"},
                {"lab_test": "VITAMIN D3 25 OH TOTAL"}
            ],
            "lab_reports": [
                {
                    "test_name": "CBC",
                    "results": {
                        "BLOOD Hb": {"value": "15"},
                        "VITAMIN D3 25 OH TOTAL": {"value": "65"}
                    }
                }
            ]
        }
    ]

    lab_db.migrate_legacy_lab_reports()

    # Verify that visits.update_one was called to update lab_reports
    assert mock_visits.update_one.called
    args, kwargs = mock_visits.update_one.call_args
    assert args[0]["visit_id"] == "v123"
    updated_reports = args[1]["$set"]["lab_reports"]

    # It should have split the reports into 2: CBC and VITAMIN D3 25 OH TOTAL
    assert len(updated_reports) == 2
    assert updated_reports[0]["test_name"] == "CBC"
    assert "BLOOD Hb" in updated_reports[0]["results"]
    assert "VITAMIN D3 25 OH TOTAL" not in updated_reports[0]["results"]

    assert updated_reports[1]["test_name"] == "VITAMIN D3 25 OH TOTAL"
    assert "VITAMIN D3 25 OH TOTAL" in updated_reports[1]["results"]

