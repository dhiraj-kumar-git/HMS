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
    
    mock_inventory = mocker.patch("app.database.patients.inventory")
    mock_inventory.find_one.return_value = {"sale_rate": 0.0, "gst_rate": 0.0, "batch_number": "B-TEST", "expiry_date": "12/30"}
    
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
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_patients.find_one.return_value = {"institute_id": "I123"}
    mock_patients.update_one.return_value.modified_count = 1
    mock_visits.find_one.return_value = None
    
    res = inv.cancel_bill("I123")
    assert res["success"] is True

def test_cancel_bill_success_with_lab_tests(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_patients.find_one.return_value = {"institute_id": "I123"}
    mock_patients.update_one.return_value.modified_count = 1
    
    mock_visits.find_one.return_value = {
        "visit_id": 456,
        "institute_id": "I123",
        "status": "completed",
        "lab_tests": [
            {"lab_test": "Hemoglobin", "status": "pending"},
            {"lab_test": "Blood Sugar", "status": "pending"},
            {"lab_test": "X-Ray", "status": "completed"}
        ]
    }
    
    res = inv.cancel_bill("I123", visit_id=456)
    assert res["success"] is True
    
    mock_visits.update_one.assert_called_once_with(
        {"visit_id": 456},
        {"$set": {
            "status": "cancelled",
            "lab_tests": [
                {"lab_test": "Hemoglobin", "status": "cancelled"},
                {"lab_test": "Blood Sugar", "status": "cancelled"},
                {"lab_test": "X-Ray", "status": "completed"}
            ]
        }}
    )

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


def test_pay_bill_faculty_pricing(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_bills = mocker.patch("app.database.inventory.bills")
    
    # Dependant patient with Faculty sponsor
    mock_patients.find_one.side_effect = lambda query: {
        "institute_id": "DEP1",
        "name": "Dependent Daughter",
        "patient_type": "Dependant",
        "primary_psrn_id": "PSRN1",
        "relation": "Daughter",
        "gender": "Female",
        "date_of_birth": datetime(2015, 5, 5)
    } if query.get("institute_id") == "DEP1" else {
        "institute_id": "PSRN1",
        "name": "Sponsor Employee",
        "patient_type": "Faculty"
    }
    
    mock_visits.find_one.return_value = {
        "visit_id": "v2",
        "lab_tests": [{"lab_test": "CBC", "status": "pending"}],
        "prescriptions": [{"note": "SYRINGE 10ML", "quantity": "2"}]
    }
    
    mocker.patch("app.database.inventory.load_lab_tests_from_config", return_value=[])
    mocker.patch("app.database.inventory.get_test_price", return_value=100.0) # CBC price
    mock_bills.count_documents.return_value = 0
    mock_patients.update_one.return_value.modified_count = 1
    
    # We will simulate medicine details (rate 12.67, 5% GST)
    res = inv.pay_bill("DEP1", visit_id="v2", selected_labs=[0], selected_medicines=[
        {
            "drug": "SYRINGE 10ML",
            "quantity": "2",
            "sale_rate": 12.67,
            "gst_rate": 5.0,
            "batch_number": "B-611104EC2",
            "expiry_date": "02/31"
        }
    ])
    
    assert res["success"] is True
    # Calculations:
    # Lab CBC: 100.0 -> 50% discount = 50.00
    # Med SYRINGE: 12.67 * 2 = 25.34 gross. GST 5% = 1.267 (CGST 0.63, SGST 0.63, total 26.61 rounded/exact)
    # Gross sum: 50.00 + 26.607 = 76.607
    # Total rounded: 77.00
    # Reimbursed (90% of unrounded 76.61) = 68.95
    # Self Paid (77 - 68.95) = 8.05
    assert res["total_amount"] == 77
    bills_list = res["bill"]
    assert isinstance(bills_list, list)
    assert len(bills_list) == 2
    
    bill_med = bills_list[0]
    bill_lab = bills_list[1]
    
    assert bill_med["sponsor_name"] == "Sponsor Employee"
    assert bill_med["sponsor_psrn"] == "PSRN1"
    assert bill_med["relation"] == "Daughter"
    assert bill_med["total_amount"] == 27
    assert bill_med["reimbursed_amount"] == 23.95
    assert bill_med["self_paid_amount"] == 3.05
    assert len(bill_med["items"]) == 1
    assert bill_med["items"][0]["type"] == "medicine"
    assert bill_med["items"][0]["rate"] == 12.67
    assert bill_med["items"][0]["cgst"] == 0.63
    assert bill_med["items"][0]["sgst"] == 0.63
    assert bill_med["items"][0]["item_total"] == 26.61
    
    assert bill_lab["sponsor_name"] == "Sponsor Employee"
    assert bill_lab["sponsor_psrn"] == "PSRN1"
    assert bill_lab["relation"] == "Daughter"
    assert bill_lab["total_amount"] == 50
    assert bill_lab["reimbursed_amount"] == 45.00
    assert bill_lab["self_paid_amount"] == 5.00
    assert len(bill_lab["items"]) == 1
    assert bill_lab["items"][0]["type"] == "lab_test"
    assert bill_lab["items"][0]["discount"] == 50
    assert bill_lab["items"][0]["item_total"] == 50.0


