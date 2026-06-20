import pytest
from datetime import datetime, timezone
import app.database.inventory as inv
from unittest.mock import MagicMock

def test_get_bill_history_patients(mocker):
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_cursor = MagicMock()
    
    doc = {"_id": "1", "payment_date": datetime(2023, 1, 1, tzinfo=timezone.utc), "invoice_no": "INV-1"}
    mock_cursor.sort.return_value.skip.return_value.limit.return_value = [doc]
    mock_bills.find.return_value = mock_cursor
    mock_bills.count_documents.return_value = 1
    
    res = inv.get_bill_history_patients(search_term="123", start_date="2023-01-01", end_date="2023-12-31")
    assert res["total"] == 1
    assert len(res["bills"]) == 1
    assert isinstance(res["bills"][0]["payment_date"], str)

def test_get_bill_history_stats(mocker):
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_bills.aggregate.return_value = [{"total_revenue": 1000, "bill_count": 5}]
    
    res = inv.get_bill_history_stats(start_date="2023-01-01", end_date="2023-12-31")
    assert res["total_revenue"] == 1000
    assert res["bill_count"] == 5

def test_get_bill_history_stats_empty(mocker):
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_bills.aggregate.return_value = []
    res = inv.get_bill_history_stats()
    assert res["total_revenue"] == 0
    assert res["bill_count"] == 0

def test_pay_bill_patient_not_found(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_patients.find_one.return_value = None
    
    res = inv.pay_bill("I123")
    assert res["success"] is False

def test_pay_bill_success(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_bills = mocker.patch("app.database.inventory.bills")
    
    mock_patients.find_one.return_value = {"institute_id": "I123", "workflow_status": "active"}
    mock_visits.find_one.return_value = {
        "visit_id": "v1", 
        "lab_tests": [{"lab_test": "CBC", "discount": 10, "rembPerc": 0}],
        "prescriptions": [{"note": "Paracetamol"}]
    }
    
    mocker.patch("app.database.inventory.load_lab_tests_from_config", return_value=[])
    mocker.patch("app.database.inventory.get_test_price", return_value=100.0)
    mock_bills.count_documents.return_value = 0
    mock_patients.update_one.return_value.modified_count = 1
    
    res = inv.pay_bill("I123", visit_id="v1", selected_labs=[0], selected_medicines=[0])
    
    assert res["success"] is True
    assert res["total_amount"] == 90.0
    assert "INV-" in res["invoice_no"]

def test_pay_bill_no_visit(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_bills = mocker.patch("app.database.inventory.bills")
    
    mock_patients.find_one.return_value = {"institute_id": "I123", "workflow_status": "consultation"}
    mock_visits.find_one.return_value = None
    
    mocker.patch("app.database.inventory.load_lab_tests_from_config", return_value=[])
    mocker.patch("app.database.inventory.get_test_price", return_value=100.0)
    mock_bills.count_documents.return_value = 0
    mock_patients.update_one.return_value.modified_count = 1
    
    res = inv.pay_bill("I123", visit_id=None, selected_labs=[], selected_medicines=[])
    
    assert res["success"] is True
    assert res["total_amount"] == 0

def test_cancel_bill_patient_not_found(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_patients.find_one.return_value = None
    
    res = inv.cancel_bill("I123")
    assert res["success"] is False

def test_cancel_bill_success(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_patients.find_one.return_value = {"institute_id": "I123"}
    mock_patients.update_one.return_value.modified_count = 1
    
    res = inv.cancel_bill("I123")
    assert res["success"] is True

def test_generate_medicine_id(mocker):
    mock_inventory = mocker.patch("app.database.inventory.inventory")
    mock_inventory.count_documents.return_value = 5
    res = inv.generate_medicine_id()
    assert res == "MED0006"

def test_add_medicine(mocker):
    mocker.patch("app.database.inventory.generate_medicine_id", return_value="MED0001")
    mock_inventory = mocker.patch("app.database.inventory.inventory")
    
    res = inv.add_medicine(
        item_name="Paracetamol",
        manufacture_date="2023-01-01T00:00:00",
        expiry_date="2025-01-01T00:00:00"
    )
    
    assert res == "MED0001"
    mock_inventory.insert_one.assert_called_once()

def test_get_inventory(mocker):
    mock_inventory = mocker.patch("app.database.inventory.inventory")
    mock_inventory.find.return_value = [{"item_name": "Paracetamol"}]
    
    res = inv.get_inventory()
    assert len(res) == 1
    assert res[0]["item_name"] == "Paracetamol"
