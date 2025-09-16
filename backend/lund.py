from flask import Flask, request, jsonify
import database  # Import database functions
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
import uuid
from database import get_patient_by_psr
import pandas as pd
import json
import os

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = "your_secret_key"  # Change this to a strong secret
jwt = JWTManager(app)
CORS(app)

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

    if not session_id:
        return jsonify({"error": "Invalid session"}), 400

    database.end_session(username, session_id)  # Remove session from DB
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
    name = data.get("name")
    age = data.get("age")
    gender = data.get("gender")
    contact_no = data.get("contact_no")
    address = data.get("address")
    doctor_assigned = data.get("doctor_assigned")

    if not all([name, age, gender, contact_no, address, doctor_assigned]):
        return jsonify({"error": "Missing required fields"}), 400

    psr_no = database.register_patient(name, age, gender, contact_no, address, doctor_assigned)
    return jsonify({"message": "Patient registered successfully", "psr_no": psr_no}), 201

# Protected route to fetch patient details
@app.route('/get_patient/<psr_no>', methods=['GET'])
@jwt_required()
def get_patient(psr_no):
    patient = database.get_patient_by_psr(psr_no)
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

# Get list of all patients (Admin only)
@app.route('/patients', methods=['GET'])
@jwt_required()
def get_patients():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    patients_list = database.get_all_patients()
    return jsonify(patients_list), 200

@app.route('/doctor/all_patients', methods=['GET'])
@jwt_required()
def get_all_patients_for_doctor():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized"}), 403

    # Reuse the same database function for returning all patients
    all_patients = database.get_all_patients()
    return jsonify(all_patients), 200

# Endpoint to fetch the list of doctors (accessible by receptionists and admins)
@app.route('/doctors', methods=['GET'])
@jwt_required()
def get_doctors():
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized access"}), 403

    doctors = database.get_all_doctors()
    return jsonify(doctors), 200

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

    if not all([username, password, role]):
        return jsonify({"error": "Missing required fields"}), 400

    if database.create_user(username, password, role):
        return jsonify({"message": "User created successfully"}), 201
    return jsonify({"error": "User already exists"}), 400

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
    psr_no = data.get("psr_no")
    prescription = data.get("prescription")

    if not psr_no or not prescription:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_prescription(psr_no, prescription, doctor_username):
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
    psr_no = data.get("psr_no")
    prescription_details = data.get("prescription_details")

    if not psr_no or not prescription_details:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_prescription_details(psr_no, prescription_details, doctor_username):
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
    psr_no = data.get("psr_no")
    lab_test = data.get("lab_test")

    if not psr_no or not lab_test:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_lab_test(psr_no, lab_test, doctor_username):
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
    psr_no = data.get("psr_no")
    remark = data.get("remark")

    if not psr_no or not remark:
        return jsonify({"error": "Missing required fields"}), 400

    doctor_username = get_jwt_identity()
    if database.add_remark(psr_no, remark, doctor_username):
        return jsonify({"message": "Remark added successfully"}), 200
    return jsonify({"error": "Failed to add remark"}), 400

# Endpoint for doctor to mark a patient as complete
@app.route('/doctor/complete_patient/<psr_no>', methods=['POST'])
@jwt_required()
def complete_patient_route(psr_no):
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    if database.complete_patient(psr_no):
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
    psr_no = data.get("psr_no")
    lab_tests = data.get("lab_tests")
    if not psr_no or not lab_tests:
        return jsonify({"error": "Missing required fields"}), 400

    success = database.submit_lab_tests(psr_no, lab_tests)
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

    patients_list = list(database.patients.find({
        "bill_status": "Paid",
        "workflow_status": "active"
    }, {"_id": 0}))
    
    return jsonify(patients_list), 200

# Submit lab test results
@app.route('/lab/submit_results', methods=['POST'])
@jwt_required()
def submit_lab_results():
    claims = get_jwt()
    if claims.get("role") != "lab_staff":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    psr_no = data.get("psr_no")
    results = data.get("results")
    
    if not psr_no or not results:
        return jsonify({"error": "Missing required fields"}), 400

    result = database.patients.update_one(
        {"psr_no": psr_no},
        {"$set": {"lab_results": results, "workflow_status": "completed"}}
    )
    
    if result.modified_count > 0:
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

# -------------------- Helper Function to Load Config Files --------------------
def load_lab_tests_from_config():
    try:
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
@app.route('/dropdown/medicines', methods=['GET'])
@jwt_required()
def dropdown_medicines():
    medicines = load_medicines_from_config()
    return jsonify(medicines), 200

@app.route('/dropdown/labtests', methods=['GET'])
@jwt_required()
def dropdown_labtests():
    lab_tests = load_lab_tests_from_config()
    return jsonify(lab_tests), 200

if __name__ == "__main__":
    app.run(debug=True)
