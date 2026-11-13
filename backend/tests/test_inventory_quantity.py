import pytest
from flask_jwt_extended import create_access_token
import app.database.inventory as inv
from unittest.mock import MagicMock

def test_restock_medicine_missing_id():
    res = inv.restock_medicine("", 10)
    assert res["success"] is False
    assert "Missing medicine_id" in res["error"]

def test_restock_medicine_invalid_quantity():
    res = inv.restock_medicine("MED0001", -5)
    assert res["success"] is False
    assert "positive number" in res["error"]

    res2 = inv.restock_medicine("MED0001", 0)
    assert res2["success"] is False
    assert "positive number" in res2["error"]

    res3 = inv.restock_medicine("MED0001", "invalid")
    assert res3["success"] is False
    assert "Invalid quantity" in res3["error"]

def test_restock_medicine_not_found(mocker):
    mock_inv = mocker.patch("app.database.inventory.inventory")
    mock_inv.find_one.return_value = None
    res = inv.restock_medicine("MED9999", 10)
    assert res["success"] is False
    assert res["error"] == "Medicine not found"

def test_restock_medicine_success(mocker):
    mock_inv = mocker.patch("app.database.inventory.inventory")
    mock_inv.find_one.side_effect = [
        {"medicine_id": "MED0001", "item_name": "Paracetamol", "qty": 15},
        {"medicine_id": "MED0001", "item_name": "Paracetamol", "qty": 25}
    ]
    res = inv.restock_medicine("MED0001", 10)
    assert res["success"] is True
    assert res["qty"] == 25
    mock_inv.update_one.assert_called_once_with(
        {"medicine_id": "MED0001"},
        {"$inc": {"qty": 10}}
    )

def test_restock_medicine_initial_none_qty(mocker):
    mock_inv = mocker.patch("app.database.inventory.inventory")
    mock_inv.find_one.return_value = {"medicine_id": "MED0001", "item_name": "Paracetamol", "qty": None}
    res = inv.restock_medicine("MED0001", 20)
    assert res["success"] is True
    assert res["qty"] == 20
    mock_inv.update_one.assert_called_once_with(
        {"medicine_id": "MED0001"},
        {"$set": {"qty": 20}}
    )

def test_restock_route_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="doc", additional_claims={"role": "doctor"})
    res = client.post("/inventory/restock", headers={"Authorization": f"Bearer {token}"}, json={"medicine_id": "MED0001", "quantity": 10})
    assert res.status_code == 403

def test_restock_route_missing_id(client, app):
    with app.app_context():
        token = create_access_token(identity="store", additional_claims={"role": "medical_store"})
    res = client.post("/inventory/restock", headers={"Authorization": f"Bearer {token}"}, json={"quantity": 10})
    assert res.status_code == 400

def test_restock_route_invalid_quantity(client, app):
    with app.app_context():
        token = create_access_token(identity="store", additional_claims={"role": "medical_store"})
    res = client.post("/inventory/restock", headers={"Authorization": f"Bearer {token}"}, json={"medicine_id": "MED0001", "quantity": -5})
    assert res.status_code == 400

def test_restock_route_not_found(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="store", additional_claims={"role": "medical_store"})
    mocker.patch("database.restock_medicine", return_value={"success": False, "error": "Medicine not found"})
    res = client.post("/inventory/restock", headers={"Authorization": f"Bearer {token}"}, json={"medicine_id": "MED9999", "quantity": 5})
    assert res.status_code == 404

def test_restock_route_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="store", additional_claims={"role": "medical_store"})
    mocker.patch("database.restock_medicine", return_value={"success": True, "qty": 30})
    res = client.post("/inventory/restock", headers={"Authorization": f"Bearer {token}"}, json={"medicine_id": "MED0001", "quantity": 10})
    assert res.status_code == 200
    assert res.json["qty"] == 30

def test_pay_bill_insufficient_stock(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_inv = mocker.patch("app.database.inventory.inventory")

    mock_patients.find_one.return_value = {"institute_id": "I123", "workflow_status": "active"}
    mock_visits.find_one.return_value = {
        "visit_id": "v1",
        "lab_tests": [],
        "prescriptions": [{"drug": "Paracetamol", "quantity": "10"}]
    }
    mock_bills.count_documents.return_value = 0
    # Available qty is only 5
    mock_inv.find_one.return_value = {"item_name": "Paracetamol", "qty": 5}
    mocker.patch("app.database.patients.get_stable_medicine_details", return_value=(10.0, 5.0, "BATCH1", "12/30"))

    res = inv.pay_bill("I123", visit_id="v1", selected_medicines=[0])
    assert res["success"] is False
    assert "Insufficient stock" in res["error"]
    # Verify no bills inserted
    mock_bills.insert_one.assert_not_called()

def test_pay_bill_deducts_inventory(mocker):
    mock_patients = mocker.patch("app.database.inventory.patients")
    mock_visits = mocker.patch("app.database.inventory.visits")
    mock_bills = mocker.patch("app.database.inventory.bills")
    mock_inv = mocker.patch("app.database.inventory.inventory")

    mock_patients.find_one.return_value = {"institute_id": "I123", "workflow_status": "active"}
    mock_visits.find_one.return_value = {
        "visit_id": "v1",
        "lab_tests": [],
        "prescriptions": [{"drug": "Paracetamol", "quantity": "3"}]
    }
    mock_inv.find_one.return_value = {"item_name": "Paracetamol", "qty": 10}
    mocker.patch("app.database.patients.get_stable_medicine_details", return_value=(10.0, 5.0, "BATCH1", "12/30"))
    mock_bills.count_documents.return_value = 0

    mock_update_res = MagicMock()
    mock_update_res.matched_count = 1
    mock_inv.update_one.return_value = mock_update_res

    res = inv.pay_bill("I123", visit_id="v1", selected_medicines=[0])
    assert res["success"] is True
    # Verify guarded update with $inc: {"qty": -3} and qty >= 3
    mock_inv.update_one.assert_called_once_with(
        {"item_name": "Paracetamol", "qty": {"$gte": 3}},
        {"$inc": {"qty": -3}}
    )
