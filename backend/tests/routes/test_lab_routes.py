import pytest
from unittest.mock import MagicMock
from flask_jwt_extended import create_access_token

def test_save_lab_report_unauthorized(client, app):
    with app.app_context():
        token = create_access_token(identity="user", additional_claims={"role": "doctor"})
    res = client.post("/lab/save_report", headers={"Authorization": f"Bearer {token}"}, json={})
    assert res.status_code == 403

def test_save_lab_report_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    mocker.patch("database.add_lab_report", return_value=True)
    payload = {"institute_id": "123", "visit_id": "v123", "test_name": "Blood", "results": "Normal", "remarks": "None"}
    res = client.post("/lab/save_report", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 200

def test_save_lab_report_missing_fields(client, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    payload = {"institute_id": "123", "visit_id": "v123"}
    res = client.post("/lab/save_report", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 400

def test_get_lab_reports_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    mocker.patch("database.get_lab_reports", return_value=[{"test_name": "Blood"}])
    res = client.get("/lab/reports", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json) == 1

def test_lab_send_email_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    mocker.patch("app.routes.lab_routes.send_email")
    payload = {"recipient_email": "a@b.com", "subject": "Test", "body": "Body", "pdf_base64": "YmFzZTY0", "filename": "t.pdf"}
    res = client.post("/lab/send_email", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 200

def test_lab_send_email_missing_fields(client, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    payload = {"recipient_email": "a@b.com"}
    res = client.post("/lab/send_email", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 400

def test_get_lab_patients_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    mocker.patch("database.get_lab_patients", return_value={"confirmed": [{"institute_id": "123"}], "upcoming": []})
    res = client.get("/lab/patients", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

def test_submit_lab_results_success(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    mocker.patch("database.submit_lab_results", return_value=True)
    payload = {"institute_id": "123", "results": [{"test": "Blood"}]}
    res = client.post("/lab/submit_results", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 200

def test_dropdown_labtests_no_cache(client, mocker, app):
    with app.app_context():
        token = create_access_token(identity="lab1", additional_claims={"role": "lab_staff"})
    mocker.patch("app.routes.lab_routes.load_lab_tests_from_config", return_value={"test1": "details"})
    mocker.patch("database.redis_client", None)
    res = client.get("/dropdown/labtests", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert "test1" in res.json
