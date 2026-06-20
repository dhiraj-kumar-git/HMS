import pytest
from flask_jwt_extended import create_access_token

def test_pay_bill_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "doctor"})
    res = client.post("/pay_bill", headers={"Authorization": f"Bearer {token}"}, json={})
    assert res.status_code == 403

def test_pay_bill_missing_institute_id(client, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    res = client.post("/pay_bill", headers={"Authorization": f"Bearer {token}"}, json={"visit_id": "v1"})
    assert res.status_code == 400

def test_pay_bill_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    mocker.patch("database.pay_bill", return_value={"success": True, "invoice_no": "INV-123"})
    res = client.post("/pay_bill", headers={"Authorization": f"Bearer {token}"}, json={"institute_id": "I123"})
    assert res.status_code == 200

def test_cancel_bill_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    mocker.patch("database.cancel_bill", return_value={"success": True})
    res = client.post("/cancel_bill", headers={"Authorization": f"Bearer {token}"}, json={"institute_id": "I123"})
    assert res.status_code == 200

def test_get_bills_history(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    mocker.patch("database.get_bill_history_patients", return_value={"bills": []})
    res = client.get("/medical_store/bills", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_get_bills_stats(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    mocker.patch("database.get_bill_history_stats", return_value={"total": 100})
    res = client.get("/medical_store/bills/stats?start_date=2023-01-01T00:00:00Z", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_add_medicine(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    mocker.patch("database.add_medicine", return_value="MED-123")
    res = client.post("/inventory/add", headers={"Authorization": f"Bearer {token}"}, json={"item_name": "Paracetamol"})
    assert res.status_code == 201

def test_get_inventory(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "admin"})
    mocker.patch("database.get_inventory", return_value=[{"item_name": "Paracetamol"}])
    res = client.get("/inventory", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_dropdown_medicines(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "medical_store"})
    mocker.patch("app.routes.inventory_routes.load_medicines_from_config", return_value=[{"item_name": "Paracetamol"}])
    res = client.get("/dropdown/medicines", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
