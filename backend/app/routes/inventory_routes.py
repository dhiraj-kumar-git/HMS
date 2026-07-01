from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import database
import time
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

inventory_bp = Blueprint('inventory', __name__)


@inventory_bp.route('/pay_bill', methods=['POST'])
@jwt_required()
def pay_bill_route():
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    visit_id = data.get("visit_id")
    payment_mode = data.get("payment_mode", "UPI")
    selected_labs = data.get("selected_labs")
    selected_medicines = data.get("selected_medicines")
    if not institute_id:
        return jsonify({"error": "Missing institute_id"}), 400

    result = database.pay_bill(institute_id, visit_id, payment_mode, selected_labs, selected_medicines)
    if result and result.get("success"):
        return jsonify({"message": "Bill paid successfully", "invoice_no": result.get("invoice_no")}), 200
    else:
        return jsonify({"error": "Failed to pay bill"}), 400

@inventory_bp.route('/cancel_bill', methods=['POST'])
@jwt_required()
def cancel_bill_route():
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    visit_id = data.get("visit_id")
    if not institute_id:
        return jsonify({"error": "Missing institute_id"}), 400

    result = database.cancel_bill(institute_id, visit_id)
    if result and result.get("success"):
        return jsonify({"message": "Bill cancelled successfully"}), 200
    else:
        return jsonify({"error": "Failed to cancel bill"}), 400

@inventory_bp.route('/medical_store/bills', methods=['GET'])
@jwt_required()
def get_bills_history():
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        skip = (page - 1) * limit
        search_term = request.args.get('search', '')
        
        # parse dates
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        start_date = None
        end_date = None
        
        # Handle ISO strings safely
        from datetime import datetime
        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))

        result = database.get_bill_history_patients(skip, limit, search_term, start_date, end_date)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@inventory_bp.route('/medical_store/bills/stats', methods=['GET'])
@jwt_required()
def get_bills_stats():
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        start_date = None
        end_date = None
        
        from datetime import datetime
        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))

        stats = database.get_bill_history_stats(start_date, end_date)
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# -------------------- INVENTORY ENDPOINTS --------------------

# Endpoint for a medical_store user to add a new medicine item
@inventory_bp.route('/inventory/add', methods=['POST'])
@jwt_required()
def add_medicine_route():
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json

    # Call the add_medicine function passing along all the received data.
    medicine_id = database.add_medicine(
        item_name=data.get("item_name"),
        unit=data.get("unit"),
        unit_detail=data.get("unit_detail"),
        item_no=data.get("item_no"),
        sale_rate=data.get("sale_rate"),
        hsn=data.get("hsn"),
        gst_rate=data.get("gst_rate"),
        cess=data.get("cess"),
        gst_category=data.get("gst_category"),
        nil_rated=data.get("nil_rated"),
        non_gst_item=data.get("non_gst_item"),
        for_web=data.get("for_web"),
        manufacturer=data.get("manufacturer"),
        location=data.get("location"),
        schedule=data.get("schedule"),
        main_image1=data.get("main_image1"),
        main_image2=data.get("main_image2"),
        detail=data.get("detail"),
        ean_bar_code=data.get("ean_bar_code"),
        no_med_rem=data.get("no_med_rem"),
        linked_item_store=data.get("linked_item_store"),
        qty=data.get("qty"),
        medicine_type=data.get("medicine_type"),
        manufacture_date=data.get("manufacture_date"),  # Expecting ISO formatted string if provided
        expiry_date=data.get("expiry_date"),            # Expecting ISO formatted string if provided
        batch_number=data.get("batch_number"),
        storage_conditions=data.get("storage_conditions")
    )
    if medicine_id:
        return jsonify({"message": "Medicine added successfully", "medicine_id": medicine_id}), 201
    return jsonify({"error": "Failed to add medicine"}), 400

# Endpoint to fetch all inventory items (accessible by medical_store and admin)
@inventory_bp.route('/inventory', methods=['GET'])
@jwt_required()
def get_inventory_route():
    claims = get_jwt()
    if claims.get("role") not in ["medical_store", "admin"]:
        return jsonify({"error": "Unauthorized access"}), 403

    meds = database.get_inventory()
    return jsonify(meds), 200

# -------------------- Helper Function to Load Lab Tests from JSON Config --------------------
def load_lab_tests_from_config():
    try:
        # Get absolute path to the current file's directory
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "..", "..", "data", "labtests_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            lab_tests = json.load(f)
        return lab_tests
    except Exception as e:
        print("Error loading lab tests from config:", e)
        return []

def load_medicines_from_config():
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "..", "..", "data", "medicines_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            medicines = json.load(f)
        return medicines
    except Exception as e:
        print("Error loading medicines from config:", e)
        return []

# -------------------- Dropdown Endpoints --------------------

# Endpoint to return medicines from the inventory.
@inventory_bp.route('/dropdown/medicines', methods=['GET'])
@jwt_required()
def dropdown_medicines():
    t0 = time.time()
    if database.redis_client:
        cached_md = database.redis_client.get("medicines_config")
        if cached_md:
            ms = (time.time() - t0) * 1000
            print(f"[REDIS CACHE] /dropdown/medicines served in {ms:.3f} ms", flush=True)
            return cached_md, 200, {'Content-Type': 'application/json'}

    medicines = load_medicines_from_config()
    
    if database.redis_client:
        database.redis_client.setex("medicines_config", 86400, json.dumps(medicines))

    return jsonify(medicines), 200
