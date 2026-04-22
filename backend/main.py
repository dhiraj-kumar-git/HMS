import base64
import os
from tempfile import NamedTemporaryFile
from flask import Flask, request, jsonify
import database  # Import database functions
from database import get_doctors_name
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
import uuid
from database import get_patient_by_id
import pandas as pd
import json
import boto3
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

import time

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
jwt = JWTManager(app)

@jwt.token_in_blocklist_loader
def check_if_token_is_revoked(jwt_header, jwt_payload):
    jti = jwt_payload["jti"]
    if database.redis_client:
        token_in_redis = database.redis_client.get(f"blocklist_{jti}")
        return token_in_redis is not None
    return False
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

# -------------------- User and Patient Routes --------------------

# User login route
@app.route('/login', methods=['POST'])
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
@app.route('/logout', methods=['POST'])
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
@app.route('/update_password/<username>', methods=['PUT'])
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

# Protected route to add a patient (only accessible by receptionists)
@app.route('/register_patient', methods=['POST'])
@jwt_required()
def register_patient():
    claims = get_jwt()
    if claims.get("role") != "receptionist":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json

    doctor_username = data.get("doctor_assigned")
    if doctor_username:
        doctors_map = get_doctors_name()
        doctor_name = doctors_map.get(doctor_username, doctor_username)
        data["doctor_name"] = doctor_name

    print("Doctors Map:", doctors_map)

    name = data.get("name")
    age = data.get("age")
    gender = data.get("gender")
    contact_no = data.get("contact_no")
    email = data.get("email")
    address = data.get("address")
    doctor_assigned = data.get("doctor_assigned")
    patient_type = data.get("patient_type")
    institute_id = data.get("institute_id")

    if not all([name, age, gender, contact_no, email, address, doctor_assigned, doctor_name, patient_type, institute_id]):
        return jsonify({"error": "Missing required fields"}), 400

    patient_data = {
        "institute_id": institute_id,
        "name": name,
        "age": age,
        "gender": gender,
        "contact_no": contact_no,
        "email": email,
        "address": address,
        "doctor_assigned": doctor_assigned,
        "doctor_name": doctor_name,
        "patient_type": patient_type,
        "workflow_status": "active",
        "bill_status": "Pending",
        "lab_tests": [],
        "lab_results": []
    }

    result_id = database.register_patient(patient_data)
    if result_id is None:
        return jsonify({"error": "Patient with this Institute ID already exists"}), 409
        
    from datetime import datetime
    database.book_appointment(institute_id, doctor_assigned, doctor_name, datetime.now().isoformat())
        
    return jsonify({"message": "Patient registered successfully", "institute_id": result_id}), 201

# Protected route to fetch patient details
@app.route('/get_patient/<institute_id>', methods=['GET'])
@jwt_required()
def get_patient(institute_id):
    patient = database.get_patient_by_id(institute_id)
    if patient:
        return jsonify(patient), 200
    return jsonify({"error": "Patient not found"}), 404

# Get list of all users (Admin only)
@app.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    users_list = database.get_all_users()
    return jsonify(users_list), 200

# Get the display_name from the username
@app.route('/users/<username>', methods=['GET'])
@jwt_required()
def get_user(username):
    user = database.users.find_one({"username": username}, {"_id": 0, "password": 0})
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user), 200

# Save lab report for a patient (Lab staff only)
@app.route('/lab/save_report', methods=['POST'])
@jwt_required()
def save_lab_report():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    test_name = data.get("test_name")
    results = data.get("results")
    remarks = data.get("remarks")

    if not institute_id or not test_name or not results:
        return jsonify({"error": "Missing required fields"}), 400

    from database import add_lab_report
    success = add_lab_report(institute_id, {
        "test_name": test_name,
        "results": results,
        "remarks": remarks,
    })

    if success:
        return jsonify({"message": "Lab report saved successfully"}), 200
    else:
        return jsonify({"error": "Failed to save report"}), 400

# Get all the lab reports for patients (Lab staff only)
@app.route('/lab/reports', methods=['GET'])
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

        msg.attach(MIMEText(body, 'plain'))

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

@app.route('/lab/send_email', methods=['POST'])
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

# Get list of all patients (Admin only)
@app.route('/patients', methods=['GET'])
@jwt_required()
def get_patients():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 0))
    except ValueError:
        page = 1
        limit = 0
        
    skip = (page - 1) * limit if limit > 0 else 0
    patients_list = database.get_all_patients(skip, limit)
    return jsonify(patients_list), 200


@app.route('/doctor/all_patients', methods=['GET'])
@jwt_required()
def get_all_patients_for_doctor():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized"}), 403

    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 0))
    except ValueError:
        page = 1
        limit = 0
        
    skip = (page - 1) * limit if limit > 0 else 0
    all_patients = database.get_all_patients(skip, limit)
    return jsonify(all_patients), 200

# Endpoint to fetch the list of doctors (accessible by receptionists and admins)
@app.route('/doctors', methods=['GET'])
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
@app.route('/create_user', methods=['POST'])
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
@app.route('/api/update_doctor/<username>', methods=['PUT'])
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
@app.route('/delete_user/<username>', methods=['DELETE'])
@jwt_required()
def delete_user(username):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if database.delete_user(username):
        return jsonify({"message": "User deleted successfully"}), 200
    return jsonify({"error": "User not found"}), 404

# Endpoint to get patients assigned to the doctor
@app.route('/doctor/patients', methods=['GET'])
@jwt_required()
def get_doctor_patients():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    doctor_username = get_jwt_identity()
    patients_list = database.get_patients_by_doctor(doctor_username)
    return jsonify(patients_list), 200

# Endpoint for doctor to add a prescription
@app.route('/doctor/add_prescription', methods=['POST'])
@jwt_required()
def add_prescription_route():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    prescription = data.get("prescription")

    if not institute_id or not prescription:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_prescription(institute_id, prescription, doctor_username):
        return jsonify({"message": "Prescription added successfully"}), 200
    return jsonify({"error": "Failed to add prescription"}), 400

# Endpoint for doctor to add prescription details
@app.route('/doctor/add_prescription_details', methods=['POST'])
@jwt_required()
def add_prescription_details_route():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json    
    institute_id = data.get("institute_id")
    prescription_details = data.get("prescription_details")

    if not institute_id or not prescription_details:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_prescription_details(institute_id, prescription_details, doctor_username):
        return jsonify({"message": "Prescription details added successfully"}), 200
    return jsonify({"error": "Failed to add prescription details"}), 400

# Endpoint for doctor to add a lab test
@app.route('/doctor/add_lab_test', methods=['POST'])
@jwt_required()
def add_lab_test_route():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    lab_test = data.get("lab_test")

    if not institute_id or not lab_test:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_lab_test(institute_id, lab_test, doctor_username):
        return jsonify({"message": "Lab test added successfully"}), 200
    return jsonify({"error": "Failed to add lab test"}), 400

# Endpoint for doctor to add a remark
@app.route('/doctor/add_remark', methods=['POST'])
@jwt_required()
def add_remark_route():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    remark = data.get("remark")

    if not institute_id or not remark:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_remark(institute_id, remark, doctor_username):
        return jsonify({"message": "Remark added successfully"}), 200
    return jsonify({"error": "Failed to add remark"}), 400

# Endpoint for doctor to mark a patient as complete
@app.route('/doctor/complete_patient/<institute_id>', methods=['POST'])
@jwt_required()
def complete_patient_route(institute_id):
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    if database.complete_patient(institute_id):
        return jsonify({"message": "Patient marked as complete"}), 200
    return jsonify({"error": "Failed to mark patient as complete"}), 400

# Endpoint to fetch inactive (or completed) patients assigned to the doctor
@app.route('/doctor/patients_inactive', methods=['GET'])
@jwt_required()
def get_inactive_patients():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    doctor_username = get_jwt_identity()
    patients_list = database.get_inactive_patients_by_doctor(doctor_username)
    return jsonify(patients_list), 200

@app.route('/active_registrations', methods=['GET'])
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

@app.route('/submit_lab_tests', methods=['POST'])
@jwt_required()
def submit_lab_tests_route():
    claims = get_jwt()
    if claims.get("role") != "medical_store":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    lab_tests = data.get("lab_tests")
    if not institute_id or not lab_tests:
        return jsonify({"error": "Missing required fields"}), 400

    success = database.submit_lab_tests(institute_id)
    if success:
        return jsonify({"message": "Lab tests submitted successfully"}), 200
    else:
        return jsonify({"error": "Failed to submit lab tests"}), 400

# Get patients with Paid bills and Active status
@app.route('/lab/patients', methods=['GET'])
@jwt_required()
def get_lab_patients():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    patients_list = database.get_lab_patients()
    return jsonify(patients_list), 200

# Submit lab test results
@app.route('/lab/submit_results', methods=['POST'])
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

# -------------------- INVENTORY ENDPOINTS --------------------

# Endpoint for a medical_store user to add a new medicine item
@app.route('/inventory/add', methods=['POST'])
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
@app.route('/inventory', methods=['GET'])
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
        config_path = os.path.join(base_dir, "labtests_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            lab_tests = json.load(f)
        return lab_tests
    except Exception as e:
        print("Error loading lab tests from config:", e)
        return []

def load_medicines_from_config():
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "medicines_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            medicines = json.load(f)
        return medicines
    except Exception as e:
        print("Error loading medicines from config:", e)
        return []

# -------------------- Dropdown Endpoints --------------------

# Endpoint to return medicines from the inventory.
@app.route('/dropdown/medicines', methods=['GET'])
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

# Updated dropdown endpoint to return lab tests using the JSON config file.
@app.route('/dropdown/labtests', methods=['GET'])
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

# -------------------- Public Patient Portal Endpoints --------------------

@app.route('/api/public/doctors', methods=['GET'])
def public_get_doctors():
    t0 = time.time()
    
    # 1. Check Cache
    if database.redis_client:
        cached_doctors = database.redis_client.get("public_doctors_list")
        if cached_doctors:
            ms = (time.time() - t0) * 1000
            print(f"[REDIS CACHE] /api/public/doctors served in {ms:.3f} ms", flush=True)
            return cached_doctors, 200, {'Content-Type': 'application/json'}

    # 2. Fetch natively if not cached or if redis is offline
    doctors = database.get_all_doctors()
    safe_docs = [{"username": d.get("username"), "display_name": d.get("display_name", d.get("username")), "department": d.get("department"), "schedule": d.get("schedule", [])} for d in doctors]
    
    # 3. Save into cache natively passing json string
    result_json = json.dumps(safe_docs)
    if database.redis_client:
        database.redis_client.setex("public_doctors_list", 43200, result_json)
        
    ms = (time.time() - t0) * 1000
    print(f"[MONGODB FETCH] /api/public/doctors served in {ms:.3f} ms", flush=True)
    return result_json, 200, {'Content-Type': 'application/json'}

@app.route('/api/public/register', methods=['POST'])
def public_register_patient():
    data = request.json
    name = data.get("name")
    age = data.get("age")
    gender = data.get("gender")
    contact_no = data.get("contact_no")
    institute_id = data.get("institute_id")
    address = data.get("address")
    email = data.get("email")
    patient_type = data.get("patient_type")
    
    if not institute_id:
        return jsonify({"error": "Institute ID is required"}), 400
        
    if not all([name, age, gender, contact_no, address, email, patient_type]):
        return jsonify({"error": "Missing required fields"}), 400

    patient_data = {
        "name": name,
        "age": age,
        "gender": gender,
        "contact_no": contact_no,
        "institute_id": institute_id,
        "email": email,
        "address": address,
        "patient_type": patient_type,
        "workflow_status": "active",
        "bill_status": "Pending",
        "lab_tests": [],
        "appointments": []
    }

    result_id = database.register_patient(patient_data)
    if result_id is None:
        return jsonify({"error": "Patient with this Institute ID already exists"}), 409
        
    return jsonify({"message": "Patient registered successfully", "institute_id": result_id}), 201

@app.route('/api/public/verify', methods=['POST'])
def public_verify_patient():
    data = request.json
    institute_id = data.get("institute_id")
    if not institute_id:
        return jsonify({"error": "Institute ID is required"}), 400
        
    patient = database.get_patient_by_id(institute_id)
    if not patient:
        return jsonify({"error": "No patient found with this Institute ID"}), 404
        
    return jsonify({
        "message": "Patient verified", 
        "institute_id": patient.get("institute_id"), 
        "name": patient.get("name"),
        "doctor_assigned": patient.get("doctor_assigned"),
        "appointments": patient.get("appointments", [])
    }), 200

@app.route('/api/public/book-appointment', methods=['POST'])
def public_book_appointment():
    data = request.json
    institute_id = data.get("institute_id")
    doctor_username = data.get("doctor_username")
    appointment_time = data.get("time") 
    
    if not all([institute_id, doctor_username, appointment_time]):
        return jsonify({"error": "Missing required fields"}), 400
        
    doctor = database.users.find_one({"username": doctor_username, "role": "doctor"})
    doctor_name = doctor.get("display_name") if doctor else doctor_username
    
    if database.book_appointment(institute_id, doctor_username, doctor_name, appointment_time):
        return jsonify({"message": "Appointment booked successfully"}), 200
    return jsonify({"error": "Failed to book appointment"}), 400


# uploading lab reports to s3

from botocore.config import Config

s3 = boto3.client(
    "s3",
    region_name="eu-north-1",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET_KEY"),
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"}
    )
)
BUCKET = "hms-lab-reports"

try:
    print(s3.list_buckets())
except Exception as e:
    print("S3 ERROR:", e)

@app.route("/debug/s3")
def debug_s3():
    try:
        buckets = s3.list_buckets()
        return buckets
    except Exception as e:
        return {"error": str(e)}
    
@app.route('/s3/upload-url', methods=['POST'])
@jwt_required()
def generate_upload_url():
    data = request.json
    instituteId=data.get("instituteId")
    filename = data.get("filename")
    content_type = data.get("content_type")


    if not filename or not content_type:
        return jsonify({"error": "Missing fields"}), 400

    user = get_jwt_identity()
    key = f"reports/{user}/{uuid.uuid4()}_{filename}"
    # user="user"
    # key= f"reports/{user}/{filename}"

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": "hms-lab-reports",
                "Key": key,
                "ContentType": content_type
            },
            ExpiresIn=600
        )

        return jsonify({
            "upload_url": url,
            "key": key
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/s3/save-metadata', methods=['POST'])
@jwt_required()
def save_s3_metadata():
    data = request.json

    institute_id = data.get("instituteId")
    key = data.get("key")
    filename = data.get("filename")

    if not institute_id or not key or not filename:
        return jsonify({"error": "Missing fields"}), 400

    user = get_jwt_identity()

    report_data = {
        "file_name": filename,
        "s3_key": key,
        "uploaded_by": user,
        "uploaded_at": datetime.utcnow()
    }

    try:
        if database.add_lab_report(institute_id,report_data):
            return jsonify({"message": "Metadata saved"}), 200

        else:
            return jsonify({"error": "Patient not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/s3/view-url', methods=['POST'])
@jwt_required()
def generate_view_url():
    data = request.json
    key = data.get("s3_key")

    if not key:
        return jsonify({"error": "Missing key"}), 400

    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": "hms-lab-reports",
                "Key": key
            },
            ExpiresIn=300
        )

        return jsonify({"url": url})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
