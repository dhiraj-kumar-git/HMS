from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, create_access_token
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

auth_bp = Blueprint('auth', __name__)


# -------------------- User and Patient Routes --------------------

# User login route
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Missing username or password"}), 400

    authenticated_user = database.authenticate_user(username, password)
    if not authenticated_user:
        return jsonify({"error": "Invalid username or password"}), 401

    session_id = str(uuid.uuid4())  # Generate a unique session ID
    database.start_session(username, session_id)  # Store session in the database

    # Generate JWT token
    access_token = create_access_token(
        identity=username, additional_claims={"role": authenticated_user["role"], "session_id": session_id}
    )
    return jsonify({"access_token": access_token, "role": authenticated_user["role"], "session_id": session_id}), 200

# User logout route
@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    username = get_jwt_identity()
    claims = get_jwt()
    session_id = claims.get("session_id")
    jti = claims.get("jti")
    exp = claims.get("exp")

    if not session_id:
        return jsonify({"error": "Invalid session"}), 400

    database.end_session(username, session_id, jti, exp)  # Remove session from DB and add to Redis blocklist
    return jsonify({"message": f"User '{username}' has logged out successfully."}), 200

# Endpoint to update a user's password (Admin only)
@auth_bp.route('/update_password/<username>', methods=['PUT'])
@jwt_required()
def update_password(username):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    new_password = data.get("new_password")
    
    if not new_password:
        return jsonify({"error": "New password is required"}), 400

    # Hash the new password using your existing function
    hashed_password = database.hash_password(new_password).decode('utf-8')

    # Update the password in the users collection
    result = database.users.update_one(
        {"username": username},
        {"$set": {"password": hashed_password}}
    )

    if result.modified_count > 0:
        return jsonify({"message": "Password updated successfully"}), 200
    else:
        return jsonify({"error": "Failed to update password, or user not found"}), 400
