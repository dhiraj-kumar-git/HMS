from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import database
import base64
import time
from tempfile import NamedTemporaryFile
from database import load_lab_tests_from_config
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import uuid
from datetime import datetime
import pandas as pd
import json
from app.s3_client import s3, BUCKET
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv('EMAIL_ADDRESS')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')

lab_bp = Blueprint('lab', __name__)


# Save lab report for a patient (Lab staff only)
@lab_bp.route('/lab/save_report', methods=['POST'])
@jwt_required()
def save_lab_report():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    visit_id = data.get("visit_id")
    test_name = data.get("test_name")
    results = data.get("results")
    remarks = data.get("remarks")

    if not institute_id or not test_name or not results:
        return jsonify({"error": "Missing required fields"}), 400

    from database import add_lab_report
    success = add_lab_report(institute_id, visit_id, {
        "test_name": test_name,
        "results": results,
        "remarks": remarks,
    })

    if success:
        return jsonify({"message": "Lab report saved successfully"}), 200
    else:
        return jsonify({"error": "Failed to save report"}), 400

@lab_bp.route('/lab/save_draft', methods=['POST'])
@jwt_required()
def save_lab_draft():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    visit_id = data.get("visit_id")
    results_draft = data.get("results_draft")

    if not institute_id or results_draft is None:
        return jsonify({"error": "Missing required fields"}), 400

    from database import save_lab_results_draft
    success = save_lab_results_draft(institute_id, visit_id, results_draft)

    if success:
        return jsonify({"message": "Draft saved successfully"}), 200
    else:
        return jsonify({"error": "Failed to save draft"}), 400

# Get all the lab reports for patients (Lab staff only)
@lab_bp.route('/lab/reports', methods=['GET'])
@jwt_required()
def get_lab_reports():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    from database import get_lab_reports
    reports = get_lab_reports()
    return jsonify(reports), 200

# Sending Lab report email
def send_email(recipient_email, subject, body, attachment_path=None):
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_ADDRESS
        msg['To'] = recipient_email
        msg['Subject'] = subject

        is_html = body.strip().startswith('<!DOCTYPE') or body.strip().startswith('<html') or '<html>' in body or '<div' in body
        msg.attach(MIMEText(body, 'html' if is_html else 'plain'))

        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, 'rb') as f:
                part = MIMEApplication(f.read(), Name=os.path.basename(attachment_path))
            part['Content-Disposition'] = f'attachment; filename="%s"' % os.path.basename(attachment_path)
            msg.attach(part)

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.sendmail(EMAIL_ADDRESS, recipient_email, msg.as_string())

        print("Email sent successfully!")

    except Exception as e:
        print(f"Error sending mail: {e}")
        raise e

@lab_bp.route('/lab/send_email', methods=['POST'])
@jwt_required()
def lab_send_email():
    try:
        data = request.get_json()
        print("Incoming email JSON:", data)
        recipient_email = data.get("recipient_email")
        subject = data.get("subject")
        body = data.get("body")
        pdf_base64 = data.get("pdf_base64")
        filename = data.get("filename", "LabReport.pdf")

        if not all([recipient_email, subject, body]):
            return jsonify({"error": "Missing required fields"}), 400

        attachment_path = None
        if pdf_base64:
            pdf_bytes = base64.b64decode(pdf_base64)
            tmp_file = NamedTemporaryFile(delete=False, suffix=".pdf")
            tmp_file.write(pdf_bytes)
            tmp_file.close()
            attachment_path = tmp_file.name

        # Updated send_email to handle attachment
        send_email(recipient_email, subject, body, attachment_path)

        if attachment_path and os.path.exists(attachment_path):
            os.remove(attachment_path)

        return jsonify({"message": "Email sent successfully"}), 200

    except Exception as e:
        print(f"Error in sending lab report email: {e}")
        return jsonify({"error": str(e)}), 500

# Get patients with Paid bills and Active status
@lab_bp.route('/lab/patients', methods=['GET'])
@jwt_required()
def get_lab_patients():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    patients_list = database.get_lab_patients()
    return jsonify(patients_list), 200

# Submit lab test results
@lab_bp.route('/lab/submit_results', methods=['POST'])
@jwt_required()
def submit_lab_results():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    results = data.get("results")
    
    if not institute_id or not results:
        return jsonify({"error": "Missing required fields"}), 400

    if database.submit_lab_results(institute_id, results):
        return jsonify({"message": "Results submitted successfully"}), 200
    return jsonify({"error": "Failed to submit results"}), 400

# Updated dropdown endpoint to return lab tests using the JSON config file.
@lab_bp.route('/dropdown/labtests', methods=['GET'])
@jwt_required()
def dropdown_labtests():
    t0 = time.time()
    if database.redis_client:
        cached_lt = database.redis_client.get("labtests_config")
        if cached_lt:
            ms = (time.time() - t0) * 1000
            print(f"[REDIS CACHE] /dropdown/labtests served in {ms:.3f} ms", flush=True)
            return cached_lt, 200, {'Content-Type': 'application/json'}

    lab_tests = load_lab_tests_from_config()
    
    if database.redis_client:
        database.redis_client.setex("labtests_config", 86400, json.dumps(lab_tests))

    return jsonify(lab_tests), 200
