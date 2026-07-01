from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import database
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import uuid
from datetime import datetime
import pandas as pd
import json
import boto3
from botocore.config import Config
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv('EMAIL_ADDRESS')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')

s3 = boto3.client('s3', endpoint_url='http://localstack:4566', aws_access_key_id='test', aws_secret_access_key='test', region_name='us-east-1', config=Config(s3={'addressing_style': 'path'}, signature_version='s3v4'))
BUCKET = 'hms-lab-reports'

staff_bp = Blueprint('staff', __name__)


# Get list of all users (Admin only)
@staff_bp.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    users_list = database.get_all_users()
    return jsonify(users_list), 200

# Get the display_name from the username
@staff_bp.route('/users/<username>', methods=['GET'])
@jwt_required()
def get_user(username):
    user = database.users.find_one({"username": username}, {"_id": 0, "password": 0})
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user), 200

# Endpoint to fetch the list of doctors (accessible by receptionists and admins)
@staff_bp.route('/doctors', methods=['GET'])
@jwt_required()
def get_doctors():
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized access"}), 403

    doctors = database.get_all_doctors()
    # Return a safe consistent subset that always includes department and schedule
    safe_docs = [{
        "username": d.get("username"),
        "display_name": d.get("display_name", d.get("username")),
        "department": d.get("department", ""),
        "schedule": d.get("schedule", [])
    } for d in doctors]
    return jsonify(safe_docs), 200

# Create a new user (Admin only)
@staff_bp.route('/create_user', methods=['POST'])
@jwt_required()
def create_user():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    username = data.get("username")
    password = data.get("password")
    role = data.get("role")
    display_name = data.get("display_name")
    department = data.get("department")
    schedule = data.get("schedule", [])

    if not all([username, password, role, display_name]):
        return jsonify({"error": "Missing required fields"}), 400
    
    if role == "doctor":
        if not department:
            return jsonify({"error": "Department is required for doctors"}), 400
        if not schedule or len(schedule) == 0:
            return jsonify({"error": "Schedule is required for doctors"}), 400

    if database.create_user(username, password, role, display_name, department, schedule):
        return jsonify({"message": "User created successfully"}), 201
    return jsonify({"error": "User already exists"}), 400

# Update a user's shift schedule (Admin only)
@staff_bp.route('/api/update_doctor/<username>', methods=['PUT'])
@jwt_required()
def update_doctor(username):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    schedule = data.get("schedule")
    if schedule is None or not isinstance(schedule, list):
        return jsonify({"error": "Schedule is missing or invalid"}), 400

    if database.update_doctor_schedule(username, schedule):
        return jsonify({"message": "Doctor schedule updated successfully"}), 200
    return jsonify({"error": "Failed to update or doctor not found"}), 404

# Delete a user (Admin only)
@staff_bp.route('/delete_user/<username>', methods=['DELETE'])
@jwt_required()
def delete_user(username):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if database.delete_user(username):
        return jsonify({"message": "User deleted successfully"}), 200
    return jsonify({"error": "User not found"}), 404

@staff_bp.route('/active_registrations', methods=['GET'])
@jwt_required()
def active_registrations():
    """
    Return only patients whose workflow_status is 'active' and bill_status is 'Pending'.
    Accessible by 'medical_store' role only.
    """
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized"}), 403

    # Call the new database function:
    regs = database.get_active_pending_patients()
    return jsonify(regs), 200
