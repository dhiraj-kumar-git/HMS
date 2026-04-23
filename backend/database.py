from datetime import datetime, date
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
    patients.create_index([("workflow_status", 1), ("bill_status", 1), ("lab_status", 1)])
    users.create_index("username", unique=True)
    inventory.create_index("medicine_id", unique=True)
    sessions.create_index("session_id", unique=True)
    sessions.create_index("login_time", expireAfterSeconds=86400) # TTL index 24 hours
    visits.create_index("visit_id", unique=True)
    visits.create_index("institute_id")
    visits.create_index("doctor_username")
except Exception as e:
    print(f"Error creating indexes: {e}")

# ---------------------------------------------------------------------------
# COMPUTE_AGE_STAGE — MongoDB aggregation stage that derives 'age' at query
# time from the stored 'date_of_birth' field using the server's live UTC clock.
# Age is NEVER stored in the database — it is always computed fresh.
# Inject this stage into every patient aggregation pipeline after $lookup.
# ---------------------------------------------------------------------------
COMPUTE_AGE_STAGE = {
    "$addFields": {
        "age": {
            "$dateDiff": {
                "startDate": "$date_of_birth",
                "endDate": "$$NOW",
                "unit": "year"
            }
        }
    }
}

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
    pipeline.append(COMPUTE_AGE_STAGE)  # Derive age from date_of_birth at query time
    
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
    
    # Ensure date_of_birth is a datetime object for $dateDiff aggregation
    dob = patient_data.get("date_of_birth")
    if isinstance(dob, str):
        try:
            # Handle YYYY-MM-DD
            patient_data["date_of_birth"] = datetime.strptime(dob, "%Y-%m-%d")
        except ValueError:
            try:
                # Fallback to ISO format
                patient_data["date_of_birth"] = datetime.fromisoformat(dob.replace("Z", "+00:00"))
            except ValueError:
                print(f"Warning: Could not parse date_of_birth '{dob}' as date.")
    
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
    visits.insert_one(visit_dict)
    
    # Update active status
    result = patients.update_one(
        {"institute_id": institute_id},
        {
            "$set": {
                "doctor_assigned": doctor_username,
                "workflow_status": "active",
                "bill_status": "none",
                "lab_status": "none",
                "doctor_finalized": False
            }
        }
    )
    return result.modified_count > 0

def _map_aggregated_patient(patient):
    if not patient:
        return None
    if "_id" in patient:
        patient["_id"] = str(patient["_id"])
    
    # Convert datetime objects to ISO strings for JSON safety
    for key in ["registration_time", "date_of_birth"]:
        if key in patient and isinstance(patient[key], (datetime, date)):
            patient[key] = patient[key].isoformat()
    
    patient_visits = patient.pop("patient_visits", [])
    patient_visits = sorted(patient_visits, key=lambda x: x.get("booked_at", ""))
    
    patient["appointments"] = []
    patient["prescriptions"] = []
    patient["prescription_details"] = []
    patient["lab_tests"] = []
    patient["lab_reports"] = []
    patient["remarks"] = []
    
    for v in patient_visits:
        patient["appointments"].append({
            "doctor_username": v.get("doctor_username"),
            "doctor_name": v.get("doctor_name", v.get("doctor_username")),
            "status": v.get("status"),
            "time": v.get("time"),
            "booked_at": v.get("booked_at"),
            "prescription_summary": v.get("prescription_summary", []),
            "prescription_remarks_summary": v.get("prescription_remarks_summary", []),
            "lab_test_summary": v.get("lab_test_summary", []),
            "diagnosis_note": v.get("diagnosis_note", [])
        })
        patient["prescriptions"].extend(v.get("prescriptions", []))
        patient["prescription_details"].extend(v.get("prescription_details", []))
        patient["lab_tests"].extend(v.get("lab_tests", []))
        patient["lab_reports"].extend(v.get("lab_reports", []))
        patient["remarks"].extend(v.get("remarks", []))
        
    return patient

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
        },
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
    ]
    result = list(patients.aggregate(pipeline))
    if not result:
        return None
    return _map_aggregated_patient(result[0])

# Get patients assigned to a specific doctor
def get_patients_by_doctor(doctor_username):
    pipeline = [
        {"$match": {
            "doctor_assigned": doctor_username, 
            "workflow_status": {"$in": ["active", "consultation", "lab test pending"]},
            "doctor_finalized": {"$ne": True}
        }},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        },
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
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

def _finalize_visit(institute_id, mark_as_completed=True):
    visit_id = _get_active_visit_id(institute_id)
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
        if visit:
            prescriptions = [p.get("note") for p in visit.get("prescriptions", [])]
            lab_tests = [l.get("lab_test") for l in visit.get("lab_tests", [])]
            remarks = [r.get("remark") for r in visit.get("remarks", [])]
            prescription_details = [pd.get("prescription_details") for pd in visit.get("prescription_details", [])]
            
            update_data = {
                "prescription_summary": prescriptions,
                "prescription_remarks_summary": prescription_details,
                "lab_test_summary": lab_tests,
                "diagnosis_note": remarks
            }
            if mark_as_completed:
                update_data["status"] = "completed"
            
            visits.update_one(
                {"visit_id": visit_id},
                {"$set": update_data}
            )

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
    
    patient = patients.find_one({"institute_id": institute_id})
    if patient:
        new_workflow_status = patient.get("workflow_status", "completed")
        if new_workflow_status == "lab test pending":
            # Optional: change back to consultation or keep as lab test pending.
            # Keeping it as consultation makes it clearer it's back to the doctor.
            new_workflow_status = "consultation"
            
        patients.update_one(
            {"institute_id": institute_id},
            {"$set": {"workflow_status": new_workflow_status, "lab_status": "completed"}}
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
            "patient_visits": {
                "$elemMatch": {
                    "lab_reports.0": {"$exists": True}
                }
            }
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

# Mark a patient as complete (workflow_status "completed") when no meds/labs are given
# (This is now largely replaced by the two-step consultation flow)
def complete_patient(institute_id):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    _finalize_visit(institute_id, mark_as_completed=True)

    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "workflow_status": "completed",
            "bill_status": "none",
            "lab_status": "none"
        }}
    )
    return result.modified_count > 0

# Set patient status to 'consultation'
def consultation_patient(institute_id, has_labs, has_meds):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    lab_status = "active" if has_labs else "none"
    bill_status = "pending" if (has_labs or has_meds) else "none"
    
    # Update visit summary so patient can see it in history immediately
    _finalize_visit(institute_id, mark_as_completed=False)

    # If labs are assigned, move to 'lab test pending' so they show up for billing/labs
    # Otherwise, move to 'consultation'
    new_workflow = "lab test pending" if has_labs else "consultation"

    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "workflow_status": new_workflow,
            "bill_status": bill_status,
            "lab_status": lab_status,
            "doctor_finalized": False
        }}
    )
    return result.modified_count > 0

# Move patient to 'consultation completed' or 'completed'
def complete_consultation(institute_id):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    # Finalize the visit status to "completed" in the visits collection
    _finalize_visit(institute_id, mark_as_completed=True)
    
    # Check if we can move straight to "completed" in the patients collection
    # If bill is already paid (or none) and labs are already completed (or none)
    bill_status = patient.get("bill_status", "none")
    lab_status = patient.get("lab_status", "none")
    
    if bill_status in ["paid", "none"] and lab_status in ["completed", "none"]:
        new_status = "completed"
    elif bill_status == "paid" and lab_status == "pending":
        new_status = "lab test pending"
    else:
        new_status = "consultation completed"

    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "workflow_status": new_status,
            "doctor_finalized": True
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
        },
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
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
            "bill_status": "pending"
        }},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        },
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
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
            "workflow_status": "lab test pending",
            "bill_status": "paid",
            "lab_status": "pending"
        }},
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        },
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
    ]
    raw_patients = list(patients.aggregate(pipeline))
    result = []
    for p in raw_patients:
        assembled = _map_aggregated_patient(p)
        if assembled:
            assembled.pop("_id", None)
            result.append(assembled)
    return result

# ---- BULK REGISTRATION FUNCTIONS ----

def _validate_and_parse_bulk_row(row):
    """
    Validate a single CSV row dict. Returns a cleaned patient_data dict.
    Raises ValueError with a descriptive message on any validation failure.
    """
    required_fields = ["institute_id", "name", "email", "date_of_birth", "gender", "contact_no", "patient_type", "address"]
    for field in required_fields:
        val = row.get(field)
        if val is None or str(val).strip() == "" or str(val).strip().lower() == "nan":
            raise ValueError(f"Missing or empty field: '{field}'")

    institute_id  = str(row["institute_id"]).strip()
    name          = str(row["name"]).strip()
    email         = str(row["email"]).strip()
    dob_str       = str(row["date_of_birth"]).strip()
    gender        = str(row["gender"]).strip().capitalize()
    contact_no    = str(row["contact_no"]).strip()
    patient_type  = str(row["patient_type"]).strip().capitalize()
    address       = str(row["address"]).strip()

    # Validate date_of_birth format (YYYY-MM-DD or DD-MM-YYYY)
    try:
        # pandas may parse the date already; handle both string and datetime
        if hasattr(dob_str, 'date'):
            dob = dob_str
        else:
            # Try YYYY-MM-DD first
            try:
                dob = datetime.strptime(dob_str, "%Y-%m-%d")
            except ValueError:
                # Fallback to DD-MM-YYYY (common in Excel/Sheets)
                try:
                    dob = datetime.strptime(dob_str, "%m-%d-%Y") # In case it's US format
                except ValueError:
                    try:
                        dob = datetime.strptime(dob_str, "%d-%m-%Y")
                    except ValueError:
                        raise ValueError(f"Date '{dob_str}' does not match YYYY-MM-DD or DD-MM-YYYY")

        if dob >= datetime.now():
            raise ValueError("Date of birth cannot be in the future")
    except ValueError as e:
        raise ValueError(f"Invalid date_of_birth format: {str(e)}")

    # Validate gender
    # Map shorthand gender to full words
    gender_map = {
        "M": "Male", "Male": "Male",
        "F": "Female", "Female": "Female",
        "O": "Other", "Other": "Other"
    }
    gender = gender_map.get(gender.capitalize() if len(gender) == 1 else gender)
    if not gender:
        raise ValueError(f"Invalid gender. Use Male (M), Female (F), or Other (O).")

    # Validate contact_no — strip any spaces and check 10 digits
    contact_no_clean = contact_no.replace(" ", "")
    if not contact_no_clean.isdigit() or len(contact_no_clean) != 10:
        raise ValueError(f"Invalid contact_no '{contact_no}': must be exactly 10 digits")

    # Validate patient_type
    valid_types = ["Student", "Faculty", "Staff", "Dependent", "Other"]
    if patient_type not in valid_types:
        raise ValueError(f"Invalid patient_type '{patient_type}': must be one of {valid_types}")

    # Basic email format check
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError(f"Invalid email format: '{email}'")

    return {
        "institute_id":   institute_id,
        "name":           name,
        "email":          email,
        "date_of_birth":  dob,         # datetime object — stored as ISODate by MongoDB
        "gender":         gender,
        "contact_no":     contact_no_clean,
        "patient_type":   patient_type,
        "address":        address,
        "workflow_status": "inactive",
        "bill_status":    "none",
        "lab_status":     "none",
        "import_source":  "bulk_csv",
    }


def bulk_register_patients(rows, admin_username):
    """
    Bulk-register patients from a list of CSV row dicts.
    Validates each row individually. Skips (does NOT overwrite) duplicates.
    Returns: { success: int, failed: int, errors: list[{row, institute_id, reason}] }
    """
    results = {"success": 0, "failed": 0, "errors": []}
    seen_ids_in_file = set()  # Catch duplicates within the same upload file

    for i, row in enumerate(rows, start=2):  # Row 2 = first data row (row 1 = header)
        raw_id = str(row.get("institute_id", "")).strip()
        try:
            # Within-file duplicate check
            if raw_id in seen_ids_in_file:
                raise ValueError("Duplicate institute_id within the uploaded file")
            seen_ids_in_file.add(raw_id)

            patient_data = _validate_and_parse_bulk_row(row)
            patient_data["imported_by"] = admin_username

            result_id = register_patient(patient_data)
            if result_id is None:
                raise ValueError("Already registered in database (duplicate institute_id — skipped)")

            results["success"] += 1

        except ValueError as e:
            results["failed"] += 1
            results["errors"].append({
                "row": i,
                "institute_id": raw_id or "(empty)",
                "reason": str(e)
            })

    return results

def submit_lab_results(institute_id, results):
    # Depending on your workflow, you might update the visit or patient.
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False

    visit_id = _get_active_visit_id(institute_id)
    if visit_id:
        visits.update_one(
            {"visit_id": visit_id},
            {"$set": {"lab_results": results}}
        )

    new_workflow_status = patient.get("workflow_status", "completed")
    if new_workflow_status == "lab test pending":
        # Keep visible for the doctor
        new_workflow_status = "consultation"

    return patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"workflow_status": new_workflow_status, "lab_status": "completed"}}
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

def pay_bill(institute_id, has_labs):
    # Update the patient document with the bill payment and workflow updates
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False

    # Logic: if doctor is already done (consultation completed), move to labs or complete
    # If doctor is still working (consultation), stay in consultation but mark bill as paid
    
    current_workflow = patient.get("workflow_status", "active")
    
    if current_workflow == "consultation":
        # Doctor still hasn't clicked "Complete", stay in consultation
        new_workflow = "consultation"
    else:
        # Doctor is done, or it was active. Move to next logical step.
        new_workflow = "lab test pending" if has_labs else "completed"
    
    lab_status = "pending" if has_labs else patient.get("lab_status", "none")
    
    # (Visit already finalized by doctor in complete_consultation or will be soon)
    
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "bill_status": "paid",
            "workflow_status": new_workflow,
            "lab_status": lab_status
        }}
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
