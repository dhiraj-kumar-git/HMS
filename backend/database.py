from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import uuid
import bcrypt
import redis
from collection_format import Patient, Visit, User, Medicine

load_dotenv()

# MongoDB connection setup
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI is not set")
client = MongoClient(MONGO_URI)

# Redis connection setup with Graceful Fallback
redis_client = None
try:
    # Look for docker container named 'redis' 
    redis_client = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)
    redis_client.ping()
    print("Successfully connected to Redis cache.")
except (redis.ConnectionError, redis.TimeoutError):
    print("Warning: Redis container not found or offline. Caching disabled.")
    redis_client = None

# Database and collections
db = client.hospital_db
patients = db.patients
users = db.users
sessions = db.sessions
inventory = db.inventory  # New collection for inventory management
visits = db.visits # Collection for storing individual patient visits

# Ensure Indexes Configuration
try:
    patients.create_index("institute_id", unique=True)
    patients.create_index("doctor_assigned")
    patients.create_index([("workflow_status", 1), ("bill_status", 1)])
    users.create_index("username", unique=True)
    inventory.create_index("medicine_id", unique=True)
    sessions.create_index("session_id", unique=True)
    sessions.create_index("login_time", expireAfterSeconds=86400) # TTL index 24 hours
    visits.create_index("visit_id", unique=True)
    visits.create_index("institute_id")
    visits.create_index("doctor_username")
except Exception as e:
    print(f"Error creating indexes: {e}")

# Function to hash passwords
def hash_password(password):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt)

# Function to check password
def check_password(password, hashed_password):
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password)

# Create a new user (Receptionist, Doctor, Medical Store, Lab Staff, Admin)
def create_user(username, password, role, display_name, department=None, schedule=None):
    existing_user = users.find_one({"username": username})
    if not existing_user:
        hashed_password = hash_password(password)
        user = User(
            username=username,
            password=hashed_password.decode('utf-8'),
            role=role,
            display_name=display_name or username,  # fallback to username
            department=department,
            schedule=schedule or []
        )
        users.insert_one(user.to_dict())
        return True
    return False  # User already exists

# Delete a user (Admin only)
def delete_user(username):
    result = users.delete_one({"username": username})
    return result.deleted_count > 0  # Return True if user was deleted

# Get all users (Admin only)
def get_all_users():
    return list(users.find({}, {"_id": 0, "password": 0}))  # Exclude password for security

# Get all doctors (for receptionist selection)
def get_all_doctors():
    docs = list(users.find({"role": "doctor"}, {"_id": 0, "password": 0}))
    # Ensure legacy records always have schedule and department keys
    for d in docs:
        if "schedule" not in d:
            d["schedule"] = []
        if "department" not in d or d["department"] is None:
            d["department"] = ""
    return docs

# Update a doctor's schedule dynamically
def update_doctor_schedule(username, schedule_list):
    result = users.update_one(
        {"username": username, "role": "doctor"},
        {"$set": {"schedule": schedule_list}}
    )
    return result.matched_count > 0

# Get all patients (Admin only)
def get_all_patients(skip=0, limit=0):
    pipeline = []
    if skip > 0:
        pipeline.append({"$skip": skip})
    if limit > 0:
        pipeline.append({"$limit": limit})
        
    pipeline.append({
        "$lookup": {
            "from": "visits",
            "localField": "institute_id",
            "foreignField": "institute_id",
            "as": "patient_visits"
        }
    })
    
    pts = list(patients.aggregate(pipeline))
    result = []
    for p in pts:
        assembled = _map_aggregated_patient(p)
        if assembled:
            assembled.pop("_id", None)
            result.append(assembled)
    return result

# Authenticate user and return role if valid
def authenticate_user(username, password):
    user = users.find_one({"username": username})
    if user and check_password(password, user["password"].encode('utf-8')):
        return {"username": user["username"], "role": user["role"]}
    return None

# Start a session for a user (supports multiple active logins)
def start_session(username, session_id):
    session_data = {
        "username": username,
        "session_id": session_id,
        "login_time": datetime.now().isoformat(),
        "active": True
    }
    sessions.insert_one(session_data)

# End a session for a specific user
def end_session(username, session_id, jti=None, exp=None):
    result = sessions.update_one(
        {"username": username, "session_id": session_id, "active": True},
        {"$set": {"active": False, "logout_time": datetime.now().isoformat()}}
    )
    
    # Blocklist the JWT using redis
    if redis_client and jti and exp:
        # Calculate time remaining on the token
        now = datetime.timestamp(datetime.now())
        expires_in = int(exp - now)
        if expires_in > 0:
            # We save the JTI with an expiration matching the token's remaining lifespan.
            redis_client.setex(f"blocklist_{jti}", expires_in, "true")
            
    return result.modified_count > 0  # Return True if session was updated


# Register a new patient
def register_patient(patient_data):
    institute_id = patient_data.get("institute_id")
    if not institute_id:
        raise ValueError("Institute ID is required for registration")
    
    # Optional: check if already exists to prevent duplicate primary IDs
    if patients.find_one({"institute_id": institute_id}):
        return None # Indicate duplicate

    registration_time = datetime.now()
    patient_data["registration_time"] = registration_time
    # Note: patient_data from main.py might have legacy arrays. Ensure they are stripped or just ignore since we don't query them.
    for k in ["appointments", "prescriptions", "lab_tests", "remarks", "prescription_details", "lab_results"]:
        patient_data.pop(k, None)
    
    patients.insert_one(patient_data)
    return institute_id  # Return the Institute ID

def book_appointment(institute_id, doctor_username, doctor_name, appointment_time):
    # Create the Visit
    v = Visit(
        visit_id=str(uuid.uuid4()),
        institute_id=institute_id,
        doctor_username=doctor_username,
        status="upcoming",
        time=appointment_time
    )
    visit_dict = v.to_dict()
    visit_dict["doctor_name"] = doctor_name
    visit_dict["booked_at"] = datetime.now().isoformat()
    visits.insert_one(visit_dict)
    
    # Update active status
    result = patients.update_one(
        {"institute_id": institute_id},
        {
            "$set": {
                "doctor_assigned": doctor_username,
                "workflow_status": "active"
            }
        }
    )
    return result.modified_count > 0

def _map_aggregated_patient(patient):
    if not patient:
        return None

    if "_id" in patient:
        patient["_id"] = str(patient["_id"])

    patient_visits = patient.pop("patient_visits", [])

    # Safer sort (handles missing booked_at)
    patient_visits = sorted(
        patient_visits,
        key=lambda x: x.get("booked_at") or ""
    )

    # Flattened (global) data — keep for compatibility
    patient["appointments"] = []
    patient["prescriptions"] = []
    patient["prescription_details"] = []
    patient["lab_tests"] = []
    patient["lab_reports"] = []
    patient["remarks"] = []

    for v in patient_visits:
        # ✅ KEY CHANGE: attach lab_reports to EACH visit
        patient["appointments"].append({
            "visit_id": v.get("visit_id"),  # important for frontend mapping
            "doctor_username": v.get("doctor_username"),
            "doctor_name": v.get("doctor_name", v.get("doctor_username")),
            "status": v.get("status"),
            "time": v.get("time"),
            "booked_at": v.get("booked_at"),

            # 👇 THIS ENABLES YOUR S3 VIEW BUTTON
            "lab_reports": v.get("lab_reports", []),

            "prescription_summary": v.get("prescription_summary", []),
            "prescription_remarks_summary": v.get("prescription_remarks_summary", []),
            "lab_test_summary": v.get("lab_test_summary", []),
            "diagnosis_note": v.get("diagnosis_note", [])
        })

        # Existing flattened data (unchanged)
        patient["prescriptions"].extend(v.get("prescriptions", []))
        patient["prescription_details"].extend(v.get("prescription_details", []))
        patient["lab_tests"].extend(v.get("lab_tests", []))
        patient["lab_reports"].extend(v.get("lab_reports", []))
        patient["remarks"].extend(v.get("remarks", []))

    return patient

# def _map_aggregated_patient(patient):
#     if not patient:
#         return None
#     if "_id" in patient:
#         patient["_id"] = str(patient["_id"])
    
#     patient_visits = patient.pop("patient_visits", [])
#     patient_visits = sorted(patient_visits, key=lambda x: x.get("booked_at", ""))
    
#     patient["appointments"] = []
#     patient["prescriptions"] = []
#     patient["prescription_details"] = []
#     patient["lab_tests"] = []
#     patient["lab_reports"] = []
#     patient["remarks"] = []
    
#     for v in patient_visits:
#         patient["appointments"].append({
#             "doctor_username": v.get("doctor_username"),
#             "doctor_name": v.get("doctor_name", v.get("doctor_username")),
#             "status": v.get("status"),
#             "time": v.get("time"),
#             "booked_at": v.get("booked_at"),
#             "prescription_summary": v.get("prescription_summary", []),
#             "prescription_remarks_summary": v.get("prescription_remarks_summary", []),
#             "lab_test_summary": v.get("lab_test_summary", []),
#             "diagnosis_note": v.get("diagnosis_note", [])
#         })
#         patient["prescriptions"].extend(v.get("prescriptions", []))
#         patient["prescription_details"].extend(v.get("prescription_details", []))
#         patient["lab_tests"].extend(v.get("lab_tests", []))
#         patient["lab_reports"].extend(v.get("lab_reports", []))
#         patient["remarks"].extend(v.get("remarks", []))
        
#     return patient

# Retrieve patient details by Institute ID
def get_patient_by_id(institute_id):
    pipeline = [
        {"$match": {"institute_id": institute_id}},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        }
    ]
    result = list(patients.aggregate(pipeline))
    if not result:
        return None
    return _map_aggregated_patient(result[0])

# Get patients assigned to a specific doctor
def get_patients_by_doctor(doctor_username):
    pipeline = [
        {"$match": {"doctor_assigned": doctor_username, "workflow_status": "active"}},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        }
    ]
    pts = list(patients.aggregate(pipeline))
    return [_map_aggregated_patient(p) for p in pts]

# Helper to get the active visit ID for a patient
def _get_active_visit_id(institute_id):
    # Find the most recent active visit
    visit = visits.find_one({"institute_id": institute_id, "status": "upcoming"}, sort=[("booked_at", -1)])
    if visit:
        return visit["visit_id"]
    return None

# Add a prescription to a patient (recording the doctor's note)
def add_prescription(institute_id, prescription, doctor_username):
    visit_id = _get_active_visit_id(institute_id)
    if not visit_id: return False
    result = visits.update_one(
        {"visit_id": visit_id},
        {"$push": {"prescriptions": {"doctor": doctor_username, "note": prescription, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Add a prescription to a patient by setting a new 'prescription_details' field
def add_prescription_details(institute_id, prescription_details, doctor_username):
    visit_id = _get_active_visit_id(institute_id)
    if not visit_id: return False
    result = visits.update_one(
        {"visit_id": visit_id},
        {"$push": {"prescription_details": {"doctor": doctor_username, "prescription_details": prescription_details, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Add a lab test to a patient (recording only the lab test details)
def add_lab_test(institute_id, lab_test, doctor_username):
    visit_id = _get_active_visit_id(institute_id)
    if not visit_id: return False
    result = visits.update_one(
        {"visit_id": visit_id},
        {"$push": {"lab_tests": {"doctor": doctor_username, "lab_test": lab_test, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Add a lab report to a patient
def add_lab_report(institute_id, report_details):
    # Find the most recent visit, active or not, to attach the report
    visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])
    if not visit: return False
    result = visits.update_one(
        {"visit_id": visit["visit_id"]},
        {"$push": {"lab_reports": {**report_details, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Retrieve all patients with lab reports
def get_lab_reports():
    pipeline = [
        {"$lookup": {
            "from": "visits",
            "localField": "institute_id",
            "foreignField": "institute_id",
            "as": "patient_visits"
        }},
        {"$match": {
            "patient_visits.lab_reports": {"$exists": True, "$not": {"$size": 0}}
        }}
    ]
    pts = list(patients.aggregate(pipeline))
    reports = []
    for p in pts:
        assembled = _map_aggregated_patient(p)
        if assembled:
            assembled.pop("_id", None)
            reports.append(assembled)
    return reports

# Add a remark to a patient (recording the remark separately)
def add_remark(institute_id, remark, doctor_username):
    visit_id = _get_active_visit_id(institute_id)
    if not visit_id: return False
    result = visits.update_one(
        {"visit_id": visit_id},
        {"$push": {"remarks": {"doctor": doctor_username, "remark": remark, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Mark a patient as complete (workflow_status "completed") and update visit history
def complete_patient(institute_id):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    visit_id = _get_active_visit_id(institute_id)
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
        if visit:
            prescriptions = [p.get("note") for p in visit.get("prescriptions", [])]
            lab_tests = [l.get("lab_test") for l in visit.get("lab_tests", [])]
            remarks = [r.get("remark") for r in visit.get("remarks", [])]
            prescription_details = [pd.get("prescription_details") for pd in visit.get("prescription_details", [])]
            
            visits.update_one(
                {"visit_id": visit_id},
                {"$set": {
                    "status": "completed",
                    "prescription_summary": prescriptions,
                    "prescription_remarks_summary": prescription_details,
                    "lab_test_summary": lab_tests,
                    "diagnosis_note": remarks
                }}
            )

    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "workflow_status": "completed"
        }}
    )
    return result.modified_count > 0

# Get inactive patients assigned to a specific doctor (i.e. workflow_status not "active")
def get_inactive_patients_by_doctor(doctor_username):
    pipeline = [
        {"$match": {"doctor_assigned": doctor_username, "workflow_status": {"$ne": "active"}}},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        }
    ]
    pts = list(patients.aggregate(pipeline))
    return [_map_aggregated_patient(p) for p in pts]

def get_active_pending_patients():
    """
    Returns patients who are active/completed, have a pending bill, and have been prescribed
    either medicines or lab tests.
    """
    pipeline = [
        {"$match": {
            "workflow_status": {"$in": ["active", "completed"]},
            "bill_status": "Pending"
        }},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        }
    ]
    raw_patients = list(patients.aggregate(pipeline))
    result = []
    for p in raw_patients:
        assembled = _map_aggregated_patient(p)
        if assembled:
            if assembled.get("prescriptions") or assembled.get("lab_tests") or assembled.get("prescription_details"):
                assembled.pop("_id", None)
                result.append(assembled)
    return result

def get_lab_patients():
    pipeline = [
        {"$match": {
            "bill_status": "Paid",
            "workflow_status": "active"
        }},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        }
    ]
    raw_patients = list(patients.aggregate(pipeline))
    result = []
    for p in raw_patients:
        assembled = _map_aggregated_patient(p)
        if assembled:
            assembled.pop("_id", None)
            result.append(assembled)
    return result

def submit_lab_results(institute_id, results):
    # Depending on your workflow, you might update the visit or patient.
    # We will mark patient as completed and attach results to the active visit.
    visit_id = _get_active_visit_id(institute_id)
    if visit_id:
        visits.update_one(
            {"visit_id": visit_id},
            {"$set": {"lab_results": results, "status": "completed"}}
        )
    return patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"workflow_status": "completed"}}
    ).modified_count > 0

def get_doctors_name():

    for d in db.users.find({"role": "doctor"}):
        print(d)

    doctors = db.users.find({"role": "doctor"})
    return {d["username"]: d.get("display_name", d["username"]) for d in doctors}

import hashlib

def add_dummy_users():
    dummy_users = [
        {"username": "receptionist1", "password": "test123", "role": "receptionist", "display_name": "Receptionist 1"},
        {"username": "doctor1", "password": "test123", "role": "doctor", "display_name": "Dr. Doctor Name", "department":"Sample","schedule":[{"duty_days":["Wednesday"],"start_time":"06:00 PM","end_time":"07:00 PM"},{"duty_days":["Friday"],"start_time":"08:00 PM","end_time":"09:00 PM"}]},
        {"username": "medical_store1", "password": "test123", "role": "medical_store", "display_name": "Medical Store"},
        {"username": "lab_staff1", "password": "test123", "role": "lab_staff", "display_name": "Lab Staff"},
        {"username": "admin1", "password": "test123", "role": "admin", "display_name": "Admin"},
    ]

    for user in dummy_users:
        # Generate the frontend-equivalent SHA256 hash first
        sha256_pwd = hashlib.sha256(user["password"].encode('utf-8')).hexdigest()
        if not create_user(user["username"], sha256_pwd, user["role"], user.get("display_name"), user.get("department"), user.get("schedule", [])):
            print(f"User {user['username']} already exists.")
        else:
            print(f"User {user['username']} created successfully.")

def submit_lab_tests(institute_id):
    # Update the patient document with the lab tests, order time, and mark bill_status as "Paid"
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"lab_order_time": datetime.now(), "bill_status": "Paid"}}
    )
    return result.modified_count > 0

# def add_lab_test(psr_no, lab_test, doctor_username):
#     # Define reference ranges based on test type
#     reference_ranges = {
#         "Blood Sugar": "70-100 mg/dL (Fasting)",
#         "Hemoglobin": "13.5-17.5 g/dL",
#         "Cholesterol": "<200 mg/dL"
#     }
    
#     test_with_range = {
#         "test_name": lab_test,
#         "reference_range": reference_ranges.get(lab_test, "N/A"),
#         "ordered_by": doctor_username,
#         "result": ""
#     }
    
#     result = patients.update_one(
#         {"psr_no": psr_no},
#         {"$push": {"lab_tests": test_with_range}}
#     )
#     return result.modified_count > 0
# ---- INVENTORY MANAGEMENT FUNCTIONS ----

# Generate a unique medicine ID (e.g., MED0001)
def generate_medicine_id():
    count = inventory.count_documents({})
    return f"MED{str(count + 1).zfill(4)}"

# Add a new medicine to the inventory. All fields are optional.
def add_medicine(
    item_name=None,
    unit=None,
    unit_detail=None,
    item_no=None,
    sale_rate=None,
    hsn=None,
    gst_rate=None,
    cess=None,
    gst_category=None,
    nil_rated=None,
    non_gst_item=None,
    for_web=None,
    manufacturer=None,
    location=None,
    schedule=None,
    main_image1=None,
    main_image2=None,
    detail=None,
    ean_bar_code=None,
    no_med_rem=None,
    linked_item_store=None,
    qty=None,
    medicine_type=None,
    manufacture_date=None,
    expiry_date=None,
    batch_number=None,
    storage_conditions=None
):
    medicine_id = generate_medicine_id()
    # Convert manufacture_date and expiry_date from string to datetime if provided
    m_date = datetime.fromisoformat(manufacture_date) if manufacture_date else None
    e_date = datetime.fromisoformat(expiry_date) if expiry_date else None
    medicine = Medicine(
        medicine_id=medicine_id,
        item_name=item_name,
        unit=unit,
        unit_detail=unit_detail,
        item_no=item_no,
        sale_rate=sale_rate,
        hsn=hsn,
        gst_rate=gst_rate,
        cess=cess,
        gst_category=gst_category,
        nil_rated=nil_rated,
        non_gst_item=non_gst_item,
        for_web=for_web,
        manufacturer=manufacturer,
        location=location,
        schedule=schedule,
        main_image1=main_image1,
        main_image2=main_image2,
        detail=detail,
        ean_bar_code=ean_bar_code,
        no_med_rem=no_med_rem,
        linked_item_store=linked_item_store,
        qty=qty,
        medicine_type=medicine_type,
        manufacture_date=m_date,
        expiry_date=e_date,
        batch_number=batch_number,
        storage_conditions=storage_conditions
    )
    inventory.insert_one(medicine.to_dict())
    return medicine_id

# Retrieve all inventory items
def get_inventory():
    return list(inventory.find({}, {"_id": 0}))

if __name__ == "__main__":
    add_dummy_users()
