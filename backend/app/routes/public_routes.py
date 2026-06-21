from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import database
import time
import random
from app.routes.lab_routes import send_email
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

public_bp = Blueprint('public', __name__)


# -------------------- Public Patient Portal Endpoints --------------------

@public_bp.route('/api/public/doctors', methods=['GET'])
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

@public_bp.route('/api/public/register', methods=['POST'])
def public_register_patient():
    data = request.json
    name = data.get("name")
    date_of_birth = data.get("date_of_birth")
    gender = data.get("gender")
    contact_no = data.get("contact_no")
    institute_id = data.get("institute_id")
    address = data.get("address")
    email = data.get("email")
    patient_type = data.get("patient_type")
    
    if not institute_id:
        return jsonify({"error": "Institute ID is required"}), 400
        
    if not all([name, date_of_birth, gender, contact_no, address, email, patient_type]):
        return jsonify({"error": "Missing required fields"}), 400

    patient_data = {
        "name": name,
        "date_of_birth": date_of_birth,
        "gender": gender,
        "contact_no": contact_no,
        "institute_id": institute_id,
        "email": email,
        "address": address,
        "patient_type": patient_type,
        "workflow_status": "inactive",
        "bill_status": "none",
        "lab_status": "none",
        "lab_tests": [],
        "appointments": []
    }

    result_id = database.register_patient(patient_data)
    if result_id is None:
        return jsonify({"error": "Patient with this Institute ID already exists"}), 409
        
    return jsonify({"message": "Patient registered successfully", "institute_id": result_id}), 201

# ---- STAFF & FAMILY REGISTRATION ENDPOINTS ----

def generate_relation_id(psrn_id, relation, existing_family):
    rel = str(relation).strip().upper()
    prefix = "OTHER"
    if "SON" in rel: prefix = "SON"
    elif "DAUGHTER" in rel: prefix = "DAUGHTER"
    elif "SPOUSE" in rel or "WIFE" in rel or "HUSBAND" in rel: prefix = "SPOUSE"
    elif "FATHER-IN-LAW" in rel: prefix = "FIL"
    elif "MOTHER-IN-LAW" in rel: prefix = "MIL"
    elif "FATHER" in rel: prefix = "FATHER"
    elif "MOTHER" in rel: prefix = "MOTHER"
    
    always_number = prefix in ["SON", "DAUGHTER", "OTHER"]
    
    existing_ids = [f.get("institute_id", "") for f in existing_family if f.get("institute_id", "").startswith(f"{psrn_id}-{prefix}")]
    
    if not existing_ids:
        return f"{psrn_id}-{prefix}1" if always_number else f"{psrn_id}-{prefix}"
        
    max_idx = 0
    unnumbered_exists = False
    
    for eid in existing_ids:
        suffix = eid[len(f"{psrn_id}-{prefix}"):]
        if suffix == "":
            unnumbered_exists = True
        elif suffix.isdigit():
            max_idx = max(max_idx, int(suffix))
            
    if max_idx == 0 and unnumbered_exists:
        max_idx = 1
        
    next_idx = max_idx + 1
    return f"{psrn_id}-{prefix}{next_idx}"

@public_bp.route('/api/public/register_staff', methods=['POST'])
def public_register_staff():
    data = request.json
    primary = data.get("primary")
    dependants = data.get("dependants", [])

    if not primary or not primary.get("psrn_id"):
        return jsonify({"error": "Primary member details and PSRN ID are required"}), 400

    psrn_id = primary.get("psrn_id")

    # Register Primary
    primary_data = {
        "name": primary.get("name"),
        "date_of_birth": primary.get("date_of_birth"),
        "gender": primary.get("gender"),
        "contact_no": primary.get("contact_no"),
        "institute_id": psrn_id,  # Primary gets PSRN as institute ID
        "psrn_id": psrn_id,
        "relation": "Self",
        "email": primary.get("email"),
        "address": primary.get("address"),
        "patient_type": primary.get("patient_type", "Faculty"),
        "workflow_status": "inactive",
        "bill_status": "none",
        "lab_status": "none"
    }

    result_id = database.register_patient(primary_data)
    if result_id is None:
        return jsonify({"error": f"PSRN ID {psrn_id} is already registered."}), 409

    # Register Dependants sequentially
    current_family = []
    for dep in dependants:
        dep_id = generate_relation_id(psrn_id, dep.get("relation", "Other"), current_family)
        dep_data = {
            "name": dep.get("name"),
            "date_of_birth": dep.get("date_of_birth"),
            "gender": dep.get("gender"),
            "contact_no": dep.get("contact_no") or primary.get("contact_no"),
            "institute_id": dep_id,
            "psrn_id": psrn_id,
            "relation": dep.get("relation"),
            "email": dep.get("email") or primary.get("email"),
            "address": dep.get("address") or primary.get("address"),
            "patient_type": "Dependant",
            "workflow_status": "inactive",
            "bill_status": "none",
            "lab_status": "none"
        }
        database.register_patient(dep_data)
        current_family.append(dep_data)

    return jsonify({"message": "Staff and dependants registered successfully", "institute_id": psrn_id}), 201

@public_bp.route('/api/public/send_registration_otp', methods=['POST'])
def send_registration_otp():
    data = request.json
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email is required"}), 400
        
    otp = str(random.randint(1000, 9999))
    if database.redis_client:
        database.redis_client.setex(f"otp_{email}", 300, otp)
    else:
        return jsonify({"error": "Failed to generate OTP (Redis offline)"}), 500
        
    subject = "Your BITS Medical Centre Registration OTP"
    body = f"Hello,\n\nYour OTP to verify your Staff Registration is: {otp}\n\nThis code will expire in 5 minutes.\n\nRegards,\nBITS Pilani Medical Centre"
    
    send_email(email, subject, body)
    
    return jsonify({"message": "OTP sent successfully"}), 200

@public_bp.route('/api/public/verify_registration_otp', methods=['POST'])
def verify_registration_otp():
    data = request.json
    email = data.get("email")
    user_otp = data.get("otp")
    
    if not email or not user_otp:
        return jsonify({"error": "Email and OTP are required"}), 400
        
    if not database.redis_client:
        return jsonify({"error": "OTP service unavailable"}), 500
        
    stored_otp = database.redis_client.get(f"otp_{email}")
    if not stored_otp:
        return jsonify({"error": "OTP expired or not found. Please request a new one."}), 400
        
    if stored_otp != user_otp:
        return jsonify({"error": "Invalid OTP"}), 400
        
    database.redis_client.delete(f"otp_{email}")
    return jsonify({"message": "OTP verified successfully"}), 200

@public_bp.route('/api/public/verify', methods=['POST'])
def public_verify_patient():
    data = request.json
    institute_id = data.get("institute_id")
    if not institute_id:
        return jsonify({"error": "Institute ID is required"}), 400
        
    patient = database.get_patient_by_id(institute_id)
    if not patient:
        return jsonify({"error": "No patient found with this Institute ID"}), 404
        
    if patient.get("account_status") == "archived":
        return jsonify({"error": "This ID belongs to a former student/staff member and is no longer eligible for active appointments. Please contact the Hospital Receptionist."}), 403
        
    email = patient.get("email")
    if not email:
        return jsonify({"error": "Patient does not have a registered email address for OTP."}), 400
        
    otp = str(random.randint(1000, 9999))
    if not database.store_patient_otp(institute_id, otp):
        return jsonify({"error": "Failed to generate OTP"}), 500
        
    # Mask email for frontend
    try:
        user, domain = email.split('@')
        masked_email = user[0] + "***@" + domain
    except:
        masked_email = "your registered email"
        
    subject = "Your BITS Medical Centre OTP"
    body = f"Dear {patient.get('name')},\n\nYour OTP to verify your appointment booking is: {otp}\n\nThis code will expire in 5 minutes.\n\nRegards,\nBITS Pilani Medical Centre"
    
    send_email(email, subject, body)
        
    return jsonify({
        "requires_otp": True,
        "email": masked_email
    }), 200

@public_bp.route('/api/public/verify-otp', methods=['POST'])
def public_verify_otp():
    data = request.json
    institute_id = data.get("institute_id")
    otp = data.get("otp")
    
    if not institute_id or not otp:
        return jsonify({"error": "Institute ID and OTP are required"}), 400
        
    success, msg = database.verify_patient_otp(institute_id, otp)
    if not success:
        return jsonify({"error": msg}), 400
        
    patient = database.get_patient_by_id(institute_id)
    if not patient:
        return jsonify({"error": "No patient found"}), 404
        
    return jsonify({
        "message": "OTP verified successfully", 
        "institute_id": patient.get("institute_id"), 
        "name": patient.get("name"),
        "psrn_id": patient.get("psrn_id"),
        "doctor_assigned": patient.get("doctor_assigned"),
        "appointments": patient.get("appointments", []),
        "bill_status": patient.get("bill_status", "none")
    }), 200

@public_bp.route('/api/public/doctor-availability/<doctor_username>', methods=['GET'])
def public_doctor_availability(doctor_username):
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Date is required"}), 400
        
    # Get all active appointments for the day
    appointments_on_date = list(database.visits.find({
        "doctor_username": doctor_username,
        "time": {"$regex": f"^{date_str}[T ]"},
        "status": {"$in": ["upcoming", "consultation", "Upcoming", "Consultation"]}
    }))
    
    time_counts = {}
    for app in appointments_on_date:
        time_counts[app["time"]] = time_counts.get(app["time"], 0) + 1
        
    # Full slots are those with >= 3 appointments
    full_slots = []
    for time_str, count in time_counts.items():
        if count >= 3:
            try:
                if 'T' in time_str:
                    slot_time = time_str.split('T')[1]
                else:
                    slot_time = time_str.split(' ')[1]
                
                # Keep only HH:MM
                if len(slot_time) > 5:
                    slot_time = slot_time[:5]
                    
                full_slots.append(slot_time)
            except IndexError:
                pass
                
    return jsonify({"full_slots": full_slots}), 200

@public_bp.route('/api/public/book-appointment', methods=['POST'])
def public_book_appointment():
    data = request.json
    institute_id = data.get("institute_id")
    doctor_username = data.get("doctor_username")
    appointment_time = data.get("time") 
    force = data.get("force", False)
    
    if not all([institute_id, doctor_username, appointment_time]):
        return jsonify({"error": "Missing required fields"}), 400
        
    patient = database.get_patient_by_id(institute_id)
    if not patient or patient.get("account_status") == "archived":
        return jsonify({"error": "This ID belongs to a former student/staff member and is no longer eligible for active appointments. Please contact the Hospital Receptionist."}), 403
        
    # PATIENT LIMIT VALIDATION
    patient_active_count = database.visits.count_documents({
        "institute_id": institute_id,
        "status": {"$in": ["upcoming", "consultation", "Upcoming", "Consultation"]}
    })
    
    if patient_active_count >= 3:
        return jsonify({"error": "You have reached the maximum limit of 3 active appointments. Please complete all previous appointments with the doctor before booking another appointment."}), 403

    # CAPACITY VALIDATION
    try:
        # Extract just the date part (e.g., '2026-06-21')
        date_str = appointment_time.split("T")[0]
    except Exception:
        date_str = appointment_time.split(" ")[0]
        
    # Count active appointments for this specific slot
    active_count = database.visits.count_documents({
        "doctor_username": doctor_username,
        "time": appointment_time,
        "status": {"$in": ["upcoming", "consultation", "Upcoming", "Consultation"]}
    })
    
    if active_count >= 3:
        # The slot is full. Check if the doctor has ANY slots left for the whole day.
        doctor = database.users.find_one({"username": doctor_username, "role": "doctor"})
        
        # Get all active appointments for the day
        appointments_on_date = list(database.visits.find({
            "doctor_username": doctor_username,
            "time": {"$regex": f"^{date_str}[T ]"},
            "status": {"$in": ["upcoming", "consultation", "Upcoming", "Consultation"]}
        }))
        
        time_counts = {}
        for app in appointments_on_date:
            normalized_time = app["time"].replace(" ", "T")
            time_counts[normalized_time] = time_counts.get(normalized_time, 0) + 1
            
        # Determine day of week
        try:
            from datetime import datetime
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            day_name = date_obj.strftime("%A")
            
            # Find the shift
            shift = next((s for s in doctor.get("schedule", []) if day_name in s.get("duty_days", [])), None)
            has_available_slot = False
            
            if shift:
                start_h, start_m = map(int, shift["start_time"].split(":"))
                end_h, end_m = map(int, shift["end_time"].split(":"))
                
                curr_time = datetime(2000, 1, 1, start_h, start_m)
                end_time = datetime(2000, 1, 1, end_h, end_m)
                
                while curr_time <= end_time:
                    slot_str = f"{date_str}T{curr_time.strftime('%H:%M')}"
                    if time_counts.get(slot_str, 0) < 3:
                        has_available_slot = True
                        break
                    from datetime import timedelta
                    curr_time += timedelta(minutes=10)
            else:
                # If no shift found but they're trying to book, assume there's availability we can't calculate
                has_available_slot = True
                
            if not has_available_slot:
                return jsonify({"error": "Doctor is not available for appointments on the selected day as all appointment slots are fully booked."}), 409
        except Exception as e:
            print("Error calculating daily schedule availability:", str(e))
            
        return jsonify({"error": "The selected appointment slot is fully booked and is no longer available."}), 409
        
    elif active_count in [1, 2] and not force:
        return jsonify({
            "warning": "This slot is already booked by another patient but still has remaining availability.",
            "requires_confirmation": True
        }), 409

    doctor = database.users.find_one({"username": doctor_username, "role": "doctor"})
    doctor_name = doctor.get("display_name") if doctor else doctor_username
    
    if database.book_appointment(institute_id, doctor_username, doctor_name, appointment_time):
        return jsonify({"message": "Appointment booked successfully"}), 200
    return jsonify({"error": "Failed to book appointment"}), 400

@public_bp.route('/api/public/check-active-appointments/<institute_id>', methods=['GET'])
def check_active_appointments(institute_id):
    patient = database.get_patient_by_id(institute_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
        
    active_appointments = []
    # Fetch all upcoming/consultation visits from the visits collection
    visits = list(database.visits.find({"institute_id": institute_id, "status": {"$in": ["upcoming", "consultation"]}}))
    for v in visits:
        active_appointments.append({
            "doctor_username": v.get("doctor_username"),
            "doctor_name": v.get("doctor_name", v.get("doctor_username")),
            "time": v.get("time")
        })
    
    return jsonify({"active_appointments": active_appointments}), 200

# uploading lab reports to s3

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
