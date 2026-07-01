from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import database
import io
from database import get_doctors_name, generate_relation_id
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

patient_bp = Blueprint('patient', __name__)


# Protected route to add a patient (only accessible by receptionists)
@patient_bp.route('/register_patient', methods=['POST'])
@jwt_required()
def register_patient():
    claims = get_jwt()
    if claims.get("role") != "receptionist":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json

    doctor_username = data.get("doctor_assigned")
    doctor_name = None
    if doctor_username:
        doctors_map = get_doctors_name()
        doctor_name = doctors_map.get(doctor_username, doctor_username)
        data["doctor_name"] = doctor_name
        print("Doctors Map:", doctors_map)

    name = data.get("name")
    date_of_birth = data.get("date_of_birth")
    gender = data.get("gender")
    contact_no = data.get("contact_no")
    email = data.get("email")
    address = data.get("address")
    doctor_assigned = data.get("doctor_assigned")
    patient_type = data.get("patient_type")
    institute_id = data.get("institute_id")

    if patient_type == "Temporary" and not institute_id:
        import uuid
        from datetime import datetime
        # Generate a unique pseudo-ID for temporary guests
        institute_id = f"TEMP-{datetime.now().strftime('%d%m%Y')}-{uuid.uuid4().hex[:2].upper()}"

    if patient_type == "Temporary":
        if not all([name, date_of_birth, gender, contact_no, email, institute_id]):
            return jsonify({"error": "Missing required fields for Temporary guest"}), 400
    else:
        if not all([name, date_of_birth, gender, contact_no, email, address, patient_type, institute_id]):
            return jsonify({"error": "Missing required fields"}), 400

    patient_data = {
        "institute_id": institute_id,
        "name": name,
        "date_of_birth": date_of_birth,
        "gender": gender,
        "contact_no": contact_no,
        "email": email,
        "address": address,
        "doctor_assigned": doctor_assigned,
        "doctor_name": doctor_name,
        "patient_type": patient_type,
        "workflow_status": "inactive",
        "bill_status": "none",
        "lab_status": "none",
        "lab_tests": [],
        "lab_results": []
    }

    appointment_time = data.get("appointment_time")
    force = data.get("force", False)

    if appointment_time and doctor_assigned:
        from app.routes.public_routes import validate_appointment_slot
        is_valid, error_response = validate_appointment_slot(institute_id, doctor_assigned, appointment_time, force, booked_by="receptionist")
        if not is_valid:
            return error_response

        # Register patient
        result_id = database.register_patient(patient_data)
        if result_id is None:
            return jsonify({"error": "Patient with this Institute ID already exists"}), 409
            
        # Get doctor name
        doctor = database.users.find_one({"username": doctor_assigned, "role": "doctor"})
        doctor_name = doctor.get("display_name") if doctor else doctor_assigned

        # Book appointment as confirmed immediately
        database.book_appointment(institute_id, doctor_assigned, doctor_name, appointment_time, status="confirmed")
        return jsonify({"message": "Patient registered and appointment confirmed successfully", "institute_id": result_id}), 201

    result_id = database.register_patient(patient_data)
    if result_id is None:
        return jsonify({"error": "Patient with this Institute ID already exists"}), 409
        
    return jsonify({"message": "Patient registered successfully", "institute_id": result_id}), 201

# Protected route to fetch patient details
@patient_bp.route('/get_patient/<institute_id>', methods=['GET'])
@jwt_required()
def get_patient(institute_id):
    patient = database.get_patient_by_id(institute_id)
    if patient:
        return jsonify(patient), 200
    return jsonify({"error": "Patient not found"}), 404

# Get list of all patients (Admin only)
@patient_bp.route('/patients', methods=['GET'])
@jwt_required()
def get_patients():
    claims = get_jwt()
    if claims.get("role") not in ["admin", "receptionist"]:
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


@patient_bp.route('/doctor/all_patients', methods=['GET'])
@jwt_required()
def get_all_patients_for_doctor():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized"}), 403

    username = get_jwt_identity()

    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 0))
    except ValueError:
        page = 1
        limit = 0
        
    skip = (page - 1) * limit if limit > 0 else 0
    
    # get doctor display name
    doctor_user = database.users.find_one({"username": username})
    doctor_display_name = doctor_user.get("display_name", username) if doctor_user else username

    all_patients = database.get_patient_history_for_doctor(username, doctor_display_name, skip, limit)
    return jsonify(all_patients), 200

# Endpoint to get patients assigned to the doctor
@patient_bp.route('/doctor/patients', methods=['GET'])
@jwt_required()
def get_doctor_patients():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    doctor_username = get_jwt_identity()
    patients_list = database.get_patients_by_doctor(doctor_username)
    return jsonify(patients_list), 200

# [NEW] Endpoint for doctor to overwrite all drafted consultation details at once
@patient_bp.route('/doctor/save_consultation_details/<visit_id>', methods=['PUT'])
@jwt_required()
def save_consultation_details_route(visit_id):
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json
    doctor_username = get_jwt_identity()
    
    prescriptions = data.get("prescriptions", [])
    prescription_details = data.get("prescription_details", [])
    lab_tests = data.get("lab_tests", [])
    remarks = data.get("remarks", [])

    if database.update_consultation_details(visit_id, doctor_username, prescriptions, prescription_details, lab_tests, remarks):
        return jsonify({"message": "Consultation details saved successfully"}), 200
    return jsonify({"error": "Failed to save consultation details"}), 400


# Endpoint for doctor to confirm consultation details and update statuses
@patient_bp.route('/doctor/save_consultation/<visit_id>', methods=['POST'])
@jwt_required()
def save_consultation_route(visit_id):
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    data = request.json
    has_labs = data.get("has_labs", False)
    has_meds = data.get("has_meds", False)
    doctor_username = get_jwt_identity()

    # Move to 'consultation' status (patient stays in doctor list)
    if database.consultation_patient(visit_id, doctor_username, has_labs, has_meds):
        return jsonify({"message": "Consultation details saved"}), 200
    return jsonify({"error": "Failed to save consultation"}), 400

@patient_bp.route('/doctor/complete_consultation/<visit_id>', methods=['POST'])
@jwt_required()
def complete_consultation_route(visit_id):
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    doctor_username = get_jwt_identity()

    if database.complete_consultation(visit_id, doctor_username):
        return jsonify({"message": "Consultation marked as completed"}), 200
    return jsonify({"error": "Failed to complete consultation"}), 400

# Endpoint to fetch inactive (or completed) patients assigned to the doctor
@patient_bp.route('/doctor/patients_inactive', methods=['GET'])
@jwt_required()
def get_inactive_patients():
    claims = get_jwt()
    if claims.get("role") != "doctor":
        return jsonify({"error": "Unauthorized access"}), 403

    doctor_username = get_jwt_identity()
    patients_list = database.get_inactive_patients_by_doctor(doctor_username)
    return jsonify(patients_list), 200

@patient_bp.route('/api/public/add_dependant', methods=['POST'])
def add_dependant_later():
    data = request.json
    psrn_id = data.get("psrn_id")
    dep = data.get("dependant")

    if not psrn_id or not dep:
        return jsonify({"error": "PSRN ID and dependant details are required"}), 400

    # Find existing family to pass to generate_relation_id
    family = database.get_family_by_psrn(psrn_id)
    if not family:
        return jsonify({"error": "PSRN ID not found in records"}), 404

    dep_id = generate_relation_id(psrn_id, dep.get("relation", "Other"), family)

    primary_member = next((f for f in family if f.get("institute_id") == psrn_id), {})
    primary_email = primary_member.get("email")
    primary_contact = primary_member.get("contact_no")
    primary_address = primary_member.get("address")

    dep_data = {
        "name": dep.get("name"),
        "date_of_birth": dep.get("date_of_birth"),
        "gender": dep.get("gender"),
        "contact_no": dep.get("contact_no") or primary_contact,
        "institute_id": dep_id,
        "psrn_id": psrn_id,
        "relation": dep.get("relation"),
        "email": dep.get("email") or primary_email,
        "address": dep.get("address") or primary_address,
        "patient_type": "Dependant",
        "workflow_status": "inactive",
        "bill_status": "none",
        "lab_status": "none"
    }
    
    result_id = database.register_patient(dep_data)
    if result_id is None:
        return jsonify({"error": "Failed to add dependant. ID may already exist."}), 500

    return jsonify({"message": "Dependant added successfully", "institute_id": dep_id}), 201

@patient_bp.route('/api/family/<psrn_id>', methods=['GET'])
def get_family(psrn_id):
    family = database.get_family_by_psrn(psrn_id)
    if not family:
        return jsonify({"error": "No family found for this PSRN ID"}), 404
    return jsonify(family), 200

@patient_bp.route('/api/family/dependant/<institute_id>', methods=['PUT'])
def edit_dependant(institute_id):
    data = request.json
    if not database.update_dependant(institute_id, data):
        return jsonify({"error": "Failed to update dependant"}), 400
    return jsonify({"message": "Dependant updated successfully"}), 200

@patient_bp.route('/api/family/dependant/<institute_id>', methods=['DELETE'])
def remove_dependant(institute_id):
    if not database.delete_dependant(institute_id):
        return jsonify({"error": "Failed to delete dependant"}), 400
    return jsonify({"message": "Dependant deleted successfully"}), 200

@patient_bp.route('/api/admin/archive_patient/<institute_id>', methods=['PUT'])
@jwt_required()
def admin_archive_patient(institute_id):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    
    if not database.archive_patient(institute_id):
        return jsonify({"error": "Patient not found"}), 404
        
    return jsonify({"message": "Patient archived successfully"}), 200


# ---- ADMIN BULK REGISTRATION ENDPOINTS ----

@patient_bp.route('/admin/bulk_register/template', methods=['GET'])
@jwt_required()
def download_bulk_template():
    """Serve the CSV template file for bulk student registration."""
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    from flask import send_from_directory
    return send_from_directory(
        directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"),
        path="student_bulk_registration_template.xlsx",
        as_attachment=True,
        download_name="student_bulk_registration_template.xlsx"
    )


@patient_bp.route('/admin/bulk_register', methods=['POST'])
@jwt_required()
def bulk_register_patients_route():
    """
    Bulk-register students from a CSV file upload.
    Admin role only. Skips duplicates and reports row-level errors.
    """
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded. Form field must be named 'file'"}), 400

    file = request.files['file']
    if not (file.filename.lower().endswith('.csv') or file.filename.lower().endswith('.xlsx')):
        return jsonify({"error": "Only .csv or .xlsx files are accepted"}), 400

    # Enforce 5 MB cap
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)
    if file_size > 5 * 1024 * 1024:
        return jsonify({"error": "File size exceeds the 5 MB limit"}), 400

    try:
        import pandas as pd
        if file.filename.lower().endswith('.csv'):
            stream = io.StringIO(file.stream.read().decode("utf-8"))
            df = pd.read_csv(stream, comment='#', dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(file.stream, dtype=str, keep_default_na=False)
            
        df.columns = df.columns.str.strip().str.lower()
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400

    # Verify all required columns are present before touching the DB
    required_cols = {"institute_id", "name", "email", "date_of_birth", "gender", "contact_no", "patient_type", "address"}
    missing_cols = required_cols - set(df.columns)
    if missing_cols:
        return jsonify({"error": f"Missing required columns: {', '.join(sorted(missing_cols))}"}), 400

    rows = df.to_dict(orient="records")
    admin_username = get_jwt_identity()
    results = database.bulk_register_patients(rows, admin_username)
    results["total"] = len(rows)

    return jsonify(results), 200

@patient_bp.route('/admin/bulk_register_staff/template', methods=['GET'])
@jwt_required()
def download_bulk_staff_template():
    """Serve the CSV/Excel template file for bulk staff and dependant registration."""
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    from flask import send_from_directory
    return send_from_directory(
        directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"),
        path="staff_bulk_registration_template.xlsx",
        as_attachment=True,
        download_name="staff_bulk_registration_template.xlsx"
    )

@patient_bp.route('/admin/bulk_register_staff', methods=['POST'])
@jwt_required()
def bulk_register_staff_route():
    """
    Bulk-register staff and dependants from an Excel/CSV file upload.
    Admin role only.
    """
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded. Form field must be named 'file'"}), 400

    file = request.files['file']
    if not (file.filename.lower().endswith('.csv') or file.filename.lower().endswith('.xlsx')):
        return jsonify({"error": "Only .csv or .xlsx files are accepted"}), 400

    # Enforce 5 MB cap
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)
    if file_size > 5 * 1024 * 1024:
        return jsonify({"error": "File size exceeds the 5 MB limit"}), 400

    try:
        import pandas as pd
        if file.filename.lower().endswith('.csv'):
            stream = io.StringIO(file.stream.read().decode("utf-8"))
            df = pd.read_csv(stream, comment='#', dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(file.stream, dtype=str, keep_default_na=False)
            
        df.columns = df.columns.str.strip().str.lower()
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400

    # Verify all required columns are present
    required_cols = {"primary_psrn_id", "name", "date_of_birth", "gender", "patient_type"}
    missing_cols = required_cols - set(df.columns)
    if missing_cols:
        return jsonify({"error": f"Missing required columns: {', '.join(sorted(missing_cols))}"}), 400

    # Fill NaNs with empty string for cleaner processing
    df.fillna("", inplace=True)
    rows = df.to_dict(orient="records")
    admin_username = get_jwt_identity()
    results = database.bulk_register_staff_and_dependants(rows, admin_username)
    results["total"] = len(rows)

    return jsonify(results), 200

@patient_bp.route("/debug/s3")
def debug_s3():
    try:
        buckets = s3.list_buckets()
        return buckets
    except Exception as e:
        return {"error": str(e)}
    
@patient_bp.route('/s3/upload-url', methods=['POST'])
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

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET,
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
    
@patient_bp.route('/s3/save-metadata', methods=['POST'])
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
        if database.add_lab_report(institute_id, None, report_data):
            return jsonify({"message": "Metadata saved"}), 200
        else:
            return jsonify({"error": "Patient not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@patient_bp.route('/s3/view-url', methods=['POST'])
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
                "Bucket": BUCKET,
                "Key": key
            },
            ExpiresIn=300
        )

        return jsonify({"url": url})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@patient_bp.route('/api/receptionist/queue', methods=['GET'])
@jwt_required()
def get_receptionist_appointments():
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized"}), 403

    try:
        import database
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        status_filter = request.args.get("status")
        
        queue = database.get_receptionist_queue(
            start_date=start_date,
            end_date=end_date,
            status_filter=status_filter
        )
        return jsonify(queue), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@patient_bp.route('/api/receptionist/appointment/<visit_id>/status', methods=['POST'])
@jwt_required()
def update_appointment_status_route(visit_id):
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    new_status = data.get("status")
    if not new_status:
        return jsonify({"error": "Status is required"}), 400

    try:
        import database
        success = database.update_appointment_status(visit_id, new_status)
        if success:
            return jsonify({"message": "Appointment status updated"}), 200
        return jsonify({"error": "Visit not found or no changes made"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@patient_bp.route('/api/receptionist/book-appointment', methods=['POST'])
@jwt_required()
def receptionist_book_appointment():
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    institute_id = data.get("institute_id")
    doctor_username = data.get("doctor_username")
    appointment_time = data.get("time") 
    force = data.get("force", False)
    
    if not all([institute_id, doctor_username, appointment_time]):
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        import database
        from app.routes.public_routes import validate_appointment_slot
        
        patient = database.get_patient_by_id(institute_id)
        if not patient or patient.get("account_status") == "archived":
            return jsonify({"error": "This ID belongs to a former student/staff member and is no longer eligible for active appointments."}), 403
            
        is_valid, error_response = validate_appointment_slot(institute_id, doctor_username, appointment_time, force, booked_by="receptionist")
        if not is_valid:
            return error_response
            
        doctor = database.users.find_one({"username": doctor_username, "role": "doctor"})
        doctor_name = doctor.get("display_name") if doctor else doctor_username
        
        # Receptionist books directly to 'confirmed' status
        if database.book_appointment(institute_id, doctor_username, doctor_name, appointment_time, status="confirmed"):
            return jsonify({"message": "Appointment booked and confirmed successfully"}), 200
            
        return jsonify({"error": "Failed to book appointment"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
