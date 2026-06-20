from datetime import datetime, date, timezone, timedelta, timezone
from pymongo import MongoClient
from dotenv import load_dotenv
import os
import uuid
import bcrypt
import redis
from scripts.collection_format import Patient, Visit, User, Medicine

load_dotenv()

# MongoDB connection setup
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI is not set")
client = MongoClient(MONGO_URI, tz_aware=True)

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
bills = db.bills # Collection for storing permanent billing ledger

# Ensure Indexes Configuration
try:
    patients.create_index("institute_id", unique=True)
    patients.create_index("doctor_assigned")
    patients.create_index([("workflow_status", 1), ("bill_status", 1), ("lab_status", 1)])
    patients.create_index("psrn_id")
    users.create_index("username", unique=True)
    inventory.create_index("medicine_id", unique=True)
    sessions.create_index("session_id", unique=True)
    sessions.create_index("login_time", expireAfterSeconds=86400) # TTL index 24 hours
    visits.create_index("visit_id", unique=True)
    visits.create_index("institute_id")
    visits.create_index("doctor_username")
    bills.create_index("institute_id")
    bills.create_index("payment_date")
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

def get_bill_history_patients(skip=0, limit=20, search_term="", start_date=None, end_date=None):
    query = {}
    if search_term:
        query["$or"] = [
            {"institute_id": {"$regex": search_term, "$options": "i"}},
            {"patient_name": {"$regex": search_term, "$options": "i"}},
            {"invoice_no": {"$regex": search_term, "$options": "i"}}
        ]
    if start_date or end_date:
        query["payment_date"] = {}
        if start_date:
            query["payment_date"]["$gte"] = start_date
        if end_date:
            query["payment_date"]["$lte"] = end_date

    cursor = bills.find(query).sort("payment_date", -1).skip(skip).limit(limit)
    total_count = bills.count_documents(query)
    
    bill_list = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        # ensure payment_date is string
        if isinstance(doc.get("payment_date"), datetime):
            doc["payment_date"] = doc["payment_date"].isoformat()
        bill_list.append(doc)
        
    return {
        "bills": bill_list,
        "total": total_count
    }

def get_bill_history_stats(start_date=None, end_date=None):
    query = {}
    if start_date or end_date:
        query["payment_date"] = {}
        if start_date:
            query["payment_date"]["$gte"] = start_date
        if end_date:
            query["payment_date"]["$lte"] = end_date

    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": None,
            "total_revenue": {"$sum": "$total_amount"},
            "bill_count": {"$sum": 1}
        }}
    ]
    result = list(bills.aggregate(pipeline))
    if result:
        return {
            "total_revenue": result[0]["total_revenue"],
            "bill_count": result[0]["bill_count"]
        }
    return {"total_revenue": 0, "bill_count": 0}

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
        "login_time": datetime.now(timezone.utc).isoformat(),
        "active": True
    }
    sessions.insert_one(session_data)

# End a session for a specific user
def end_session(username, session_id, jti=None, exp=None):
    result = sessions.update_one(
        {"username": username, "session_id": session_id, "active": True},
        {"$set": {"active": False, "logout_time": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Blocklist the JWT using redis
    if redis_client and jti and exp:
        # Calculate time remaining on the token
        now = datetime.timestamp(datetime.now(timezone.utc))
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

    registration_time = datetime.now(timezone.utc)
    patient_data["registration_time"] = registration_time
    patient_data["account_status"] = patient_data.get("account_status", "active")
    
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

def update_dependant(institute_id, updated_data):
    # Ensure date_of_birth is a datetime object if it was passed as string
    dob = updated_data.get("date_of_birth")
    if dob and isinstance(dob, str):
        try:
            updated_data["date_of_birth"] = datetime.strptime(dob, "%Y-%m-%d")
        except ValueError:
            pass

    # Prevent MongoDB from throwing "modifying immutable field" errors
    updated_data.pop("_id", None)
    updated_data.pop("institute_id", None)

    result = patients.update_one(
        {"institute_id": institute_id, "patient_type": "Dependant"},
        {"$set": updated_data}
    )
    return result.matched_count > 0

def delete_dependant(institute_id):
    result = patients.delete_one(
        {"institute_id": institute_id, "patient_type": "Dependant"}
    )
    return result.deleted_count > 0

def archive_patient(institute_id):
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"account_status": "archived"}}
    )
    return result.matched_count > 0

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
    
    # Update active status (Legacy fallback, now visits collection is the source of truth)
    # We do NOT overwrite workflow_status here to allow multiple concurrent appointments.
    result = patients.update_one(
        {"institute_id": institute_id},
        {
            "$set": {
                "doctor_assigned": doctor_username,
                "doctor_finalized": False
            }
        }
    )
    return result.modified_count > 0

def _map_aggregated_patient(patient, active_doctor_username=None):
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
        has_labs = len(v.get("lab_tests", [])) > 0
        has_prescriptions = len(v.get("prescriptions", [])) > 0
        has_invoice = bool(v.get("invoice_no"))
        visit_status = v.get("status", "upcoming")
        
        # Calculate bill status
        if has_invoice:
            v_bill = "paid"
        elif visit_status == "completed" and (has_labs or has_prescriptions):
            v_bill = "pending"
        else:
            v_bill = "none"
            
        # Calculate lab status
        if has_labs:
            labs_pending = any(lt.get("status") == "pending" for lt in v.get("lab_tests", []))
            v_lab = "pending" if labs_pending else "completed"
        else:
            v_lab = "none"
            
        # Calculate workflow status
        if visit_status == "upcoming":
            v_workflow = "active"
        elif visit_status == "completed":
            if has_invoice:
                if has_labs and v_lab == "pending":
                    v_workflow = "lab test pending"
                else:
                    v_workflow = "completed"
            else:
                if has_labs or has_prescriptions:
                    v_workflow = "consultation completed"
                else:
                    v_workflow = "completed"
        else:
            v_workflow = visit_status

        patient["appointments"].append({
            "visit_id": v.get("visit_id"),
            "doctor_username": v.get("doctor_username"),
            "doctor_name": v.get("doctor_name", v.get("doctor_username")),
            "status": v.get("status"),
            "time": v.get("time"),
            "booked_at": v.get("booked_at"),
            "consultation_completed_time": v.get("consultation_completed_time", ""),
            "v_bill_status": v_bill,
            "v_lab_status": v_lab,
            "v_workflow_status": v_workflow,
            "prescription_summary": v.get("prescription_summary", []),
            "prescription_remarks_summary": v.get("prescription_remarks_summary", []),
            "lab_test_summary": v.get("lab_test_summary", []),
            "diagnosis_note": v.get("diagnosis_note", []),
            "prescriptions_draft": v.get("prescriptions", []),
            "prescription_details_draft": v.get("prescription_details", []),
            "lab_tests_draft": v.get("lab_tests", []),
            "remarks_draft": v.get("remarks", [])
        })

    # The root properties should ONLY reflect the most recent/active visit
    if patient_visits:
        if active_doctor_username:
            doctor_visits = [v for v in patient_visits if v.get("doctor_username") == active_doctor_username]
            latest_visit = doctor_visits[-1] if doctor_visits else patient_visits[-1]
        else:
            latest_visit = patient_visits[-1]
            
        patient["prescriptions"] = latest_visit.get("prescriptions", [])
        patient["prescription_details"] = latest_visit.get("prescription_details", [])
        patient["lab_tests"] = latest_visit.get("lab_tests", [])
        patient["lab_reports"] = latest_visit.get("lab_reports", [])
        patient["remarks"] = latest_visit.get("remarks", [])
        
        # Override root statuses with the calculated statuses of the active visit
        # We need to recalculate them for the specific latest_visit since they were local variables in the loop above
        has_labs = len(latest_visit.get("lab_tests", [])) > 0
        has_prescriptions = len(latest_visit.get("prescriptions", [])) > 0
        has_invoice = bool(latest_visit.get("invoice_no"))
        visit_status = latest_visit.get("status", "upcoming")
        
        if has_invoice:
            v_bill = "paid"
        elif visit_status == "completed" and (has_labs or has_prescriptions):
            v_bill = "pending"
        else:
            v_bill = "none"
            
        if has_labs:
            labs_pending = any(lt.get("status") == "pending" for lt in latest_visit.get("lab_tests", []))
            v_lab = "pending" if labs_pending else "completed"
        else:
            v_lab = "none"
            
        if visit_status == "upcoming":
            v_workflow = "active"
        elif visit_status == "consultation":
            if has_labs and v_lab == "pending":
                v_workflow = "lab test pending"
            else:
                v_workflow = "consultation"
        elif visit_status == "completed":
            if has_invoice:
                if has_labs and v_lab == "pending":
                    v_workflow = "lab test pending"
                else:
                    v_workflow = "completed"
            else:
                if has_labs or has_prescriptions:
                    v_workflow = "consultation completed"
                else:
                    v_workflow = "completed"
        else:
            v_workflow = visit_status
            
        patient["workflow_status"] = v_workflow
        patient["bill_status"] = v_bill
        patient["lab_status"] = v_lab
        patient["doctor_assigned"] = latest_visit.get("doctor_username")
        
    return patient

def store_patient_otp(institute_id, otp):
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"otp": otp, "otp_expires": expires_at}}
    )
    return result.modified_count > 0

def verify_patient_otp(institute_id, otp):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient or "otp" not in patient:
        return False, "OTP not generated or patient not found."
    
    if patient.get("otp_expires") and datetime.now(timezone.utc) > patient["otp_expires"]:
        return False, "OTP has expired."
        
    if str(patient.get("otp")) == str(otp):
        # Clear the OTP
        patients.update_one(
            {"institute_id": institute_id},
            {"$unset": {"otp": "", "otp_expires": ""}}
        )
        return True, "Success"
        
    return False, "Invalid OTP."

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

# Retrieve family members by PSRN ID
def get_family_by_psrn(psrn_id):
    pipeline = [
        {"$match": {"psrn_id": psrn_id}},
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
    return [_map_aggregated_patient(p) for p in result]


# Get patients assigned to a specific doctor
def get_patients_by_doctor(doctor_username):
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
                    "doctor_username": doctor_username,
                    "status": {"$in": ["upcoming", "consultation"]}
                }
            }
        }},
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
    ]
    pts = list(patients.aggregate(pipeline))
    result = []
    for p in pts:
        assembled = _map_aggregated_patient(p, active_doctor_username=doctor_username)
        if assembled:
            assembled.pop("_id", None)
            result.append(assembled)
    return result

# Helper to get the active visit ID for a patient
def _get_active_visit_id(institute_id, doctor_username=None):
    # Find the most recent active visit (can be upcoming or in consultation)
    query = {"institute_id": institute_id, "status": {"$in": ["upcoming", "consultation"]}}
    if doctor_username:
        query["doctor_username"] = doctor_username
        
    visit = visits.find_one(query, sort=[("booked_at", -1)])
    if visit:
        return visit["visit_id"]
    return None
def get_patient_history_for_doctor(doctor_username, doctor_display_name, skip=0, limit=0):
    pipeline = [
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        },
        {
            "$match": {
                "patient_visits": {
                    "$elemMatch": {
                        "$or": [
                            {"doctor_username": doctor_username},
                            {"doctor_name": doctor_display_name}
                        ],
                        "status": "completed"
                    }
                }
            }
        }
    ]
    if skip > 0:
        pipeline.append({"$skip": skip})
    if limit > 0:
        pipeline.append({"$limit": limit})
        
    pipeline.append(COMPUTE_AGE_STAGE)
    
    pts = list(patients.aggregate(pipeline))
    result = []
    for p in pts:
        assembled = _map_aggregated_patient(p)
        if assembled:
            assembled.pop("_id", None)
            result.append(assembled)
    return result


def _finalize_visit(institute_id, doctor_username=None, mark_as_completed=True):
    visit_id = _get_active_visit_id(institute_id, doctor_username)
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
                update_data["consultation_completed_time"] = datetime.now(timezone.utc).isoformat()
            elif hasattr(mark_as_completed, 'strip'): # Just in case it's a string like "consultation" passed incorrectly
                pass
                
            # Allow explicitly setting the status to "consultation"
            if not mark_as_completed and getattr(_finalize_visit, 'force_consultation', False):
                update_data["status"] = "consultation"
            
            visits.update_one(
                {"visit_id": visit_id},
                {"$set": update_data}
            )

# [NEW] Overwrite consultation details using $set to prevent duplicates
def update_consultation_details(institute_id, doctor_username, prescriptions, prescription_details, lab_tests, remarks):
    visit_id = _get_active_visit_id(institute_id, doctor_username)
    if not visit_id: return False
    
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Structure natively to preserve expected db formats
    new_prescriptions = [{"doctor": doctor_username, "note": p, "timestamp": timestamp} for p in prescriptions]
    new_prescription_details = [{"doctor": doctor_username, "prescription_details": pd, "timestamp": timestamp} for pd in prescription_details]
    new_lab_tests = [{"doctor": doctor_username, "lab_test": lt, "status": "pending", "timestamp": timestamp} for lt in lab_tests]
    new_remarks = [{"doctor": doctor_username, "remark": r, "timestamp": timestamp} for r in remarks]
    
    result = visits.update_one(
        {"visit_id": visit_id},
        {"$set": {
            "prescriptions": new_prescriptions,
            "prescription_details": new_prescription_details,
            "lab_tests": new_lab_tests,
            "remarks": new_remarks
        }}
    )
    return result.matched_count > 0

# Add a lab report to a patient
def add_lab_report(institute_id, visit_id, report_details):
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
    else:
        # Fallback if visit_id not provided (e.g. from PDF upload endpoint which doesn't know visit_id yet)
        visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])
        
    if not visit: return False
    
    # Push the report
    result = visits.update_one(
        {"visit_id": visit["visit_id"]},
        {"$push": {"lab_reports": {**report_details, "timestamp": datetime.now(timezone.utc).isoformat()}}}
    )
    
    # Mark all tests in this visit as completed, since frontend submits them together as one master report
    visits.update_one(
        {"visit_id": visit["visit_id"]},
        {"$set": {"lab_tests.$[].status": "completed"}}
    )
    
    patient = patients.find_one({"institute_id": institute_id})
    if patient:
        new_workflow_status = patient.get("workflow_status", "completed")
        # Note: We no longer rely on patient.lab_status for the Lab Queue, but we keep this for legacy safety
        if new_workflow_status == "lab test pending":
            new_workflow_status = "completed"
            
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


# Mark a patient as complete (workflow_status "completed") when no meds/labs are given
# (This is now largely replaced by the two-step consultation flow)
def complete_patient(institute_id, doctor_username=None):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    _finalize_visit(institute_id, doctor_username, mark_as_completed=True)

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
def consultation_patient(institute_id, doctor_username, has_labs, has_meds):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    lab_status = "active" if has_labs else "none"
    bill_status = "pending" if (has_labs or has_meds) else "none"
    
    # Update visit summary so patient can see it in history immediately
    # We must explicitly set the visit status to 'consultation' so _map_aggregated_patient picks it up
    setattr(_finalize_visit, 'force_consultation', True)
    _finalize_visit(institute_id, doctor_username, mark_as_completed=False)
    setattr(_finalize_visit, 'force_consultation', False)

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
    return result.matched_count > 0

# Move patient to 'consultation completed' or 'completed'
def complete_consultation(institute_id, doctor_username=None):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    # Finalize the visit status to "completed" in the visits collection
    _finalize_visit(institute_id, doctor_username, mark_as_completed=True)
    
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
    Returns pending bill orders. We query 'visits' directly for any visit that has 
    prescriptions or lab tests, but NO invoice_no.
    """
    pipeline = [
        {"$match": {
            "invoice_no": {"$exists": False},
            "$or": [
                {"prescriptions.0": {"$exists": True}},
                {"lab_tests.0": {"$exists": True}},
                {"prescription_details.0": {"$exists": True}}
            ]
        }},
        {
            "$lookup": {
                "from": "patients",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_info"
            }
        },
        {"$unwind": "$patient_info"}
    ]
    raw_orders = list(visits.aggregate(pipeline))
    result = []
    for order in raw_orders:
        patient = order["patient_info"]
        patient["_id"] = str(patient["_id"])
        
        # Override root properties with this specific order's details
        patient["prescriptions"] = order.get("prescriptions", [])
        patient["prescription_details"] = order.get("prescription_details", [])
        patient["lab_tests"] = order.get("lab_tests", [])
        patient["remarks"] = order.get("remarks", [])
        
        # Override global statuses with order-specific logical statuses
        # Since this order has no invoice_no, its bill is guaranteed pending
        patient["bill_status"] = "pending"
        
        # If the order has lab tests, it will require lab action
        has_labs = len(patient["lab_tests"]) > 0
        patient["lab_status"] = "pending" if has_labs else "none"
        
        # Wait, if it's unpaid and at the medical store, its workflow status is technically "consultation completed"
        # as it hasn't passed to "lab test pending" until the bill is paid.
        visit_status = order.get("status", "upcoming")
        if visit_status == "completed":
            patient["workflow_status"] = "consultation completed"
        else:
            patient["workflow_status"] = "consultation"

        
        # Calculate age
        if "date_of_birth" in patient and isinstance(patient["date_of_birth"], datetime):
            dob = patient["date_of_birth"]
            now = datetime.now(timezone.utc)
            patient["age"] = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
            patient["date_of_birth"] = dob.isoformat()
            
        patient["visit_id"] = order.get("visit_id")
        
        # Convert any other dates
        if "registration_time" in patient and isinstance(patient["registration_time"], datetime):
            patient["registration_time"] = patient["registration_time"].isoformat()
            
        patient["booked_at"] = order.get("booked_at", "")
        patient["consultation_completed_time"] = order.get("consultation_completed_time", "")
            
        result.append(patient)
    return result

def get_lab_patients():
    pipeline = [
        {"$match": {
            "invoice_no": {"$exists": True},
            "lab_tests.status": "pending"
        }},
        {
            "$lookup": {
                "from": "patients",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_info"
            }
        },
        {"$unwind": "$patient_info"}
    ]
    raw_orders = list(visits.aggregate(pipeline))
    result = []
    for order in raw_orders:
        patient = order["patient_info"]
        patient["_id"] = str(patient["_id"])
        
        # Override root properties with this specific order's details
        patient["prescriptions"] = order.get("prescriptions", [])
        patient["prescription_details"] = order.get("prescription_details", [])
        patient["lab_tests"] = order.get("lab_tests", [])
        patient["lab_reports"] = order.get("lab_reports", [])
        patient["remarks"] = order.get("remarks", [])
        
        # Override global statuses with order-specific logical statuses
        # The lab queue only fetches billed orders with pending labs
        patient["bill_status"] = "paid"
        patient["lab_status"] = "pending"
        patient["workflow_status"] = "lab test pending"
        
        # Calculate age
        if "date_of_birth" in patient and isinstance(patient["date_of_birth"], datetime):
            dob = patient["date_of_birth"]
            now = datetime.now(timezone.utc)
            patient["age"] = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
            patient["date_of_birth"] = dob.isoformat()
            
        patient["visit_id"] = order.get("visit_id")
        patient["invoice_no"] = order.get("invoice_no")
        
        # Convert any other dates
        if "registration_time" in patient and isinstance(patient["registration_time"], datetime):
            patient["registration_time"] = patient["registration_time"].isoformat()
            
        result.append(patient)
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

        if dob.tzinfo is None:
            dob = dob.replace(tzinfo=timezone.utc)
        if dob >= datetime.now(timezone.utc):
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
    valid_types = ["Student", "Faculty", "Staff", "Dependant", "Other"]
    if patient_type not in valid_types:
        raise ValueError(f"Invalid patient_type '{patient_type}': must be one of {valid_types}")

    # Basic email format check
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError(f"Invalid email format: '{email}'")

    return {
        "institute_id":   institute_id,
        "name":           name,
        "email":          email,
        "date_of_birth":  dob.isoformat(),         # Store consistently as ISO string
        "gender":         gender,
        "contact_no":     contact_no_clean,
        "patient_type":   patient_type,
        "address":        address,
        "workflow_status": "inactive",
        "bill_status":    "none",
        "lab_status":     "none",
        "account_status": "active",
        "import_source":  "bulk_csv",
    }


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

def bulk_register_staff_and_dependants(rows, admin_username):
    """
    Bulk-register Faculty/Staff and their Dependants in a two-pass approach.
    Pass 1: Register primary members (Faculty/Staff).
    Pass 2: Register dependants and generate their institute_id based on the primary member.
    """
    results = {"success": 0, "failed": 0, "errors": []}
    
    # 1. Separate the rows
    primary_rows = []
    dependant_rows = []
    
    for i, row in enumerate(rows, start=2):
        ptype = str(row.get("patient_type", "")).strip().capitalize()
        if ptype in ["Faculty", "Staff"]:
            primary_rows.append((i, row))
        elif ptype == "Dependant":
            dependant_rows.append((i, row))
        else:
            results["failed"] += 1
            results["errors"].append({
                "row": i,
                "institute_id": str(row.get("primary_psrn_id", "")).strip(),
                "reason": f"Invalid patient_type '{ptype}'. Must be Faculty, Staff, or Dependant."
            })

    # Cache for newly inserted or existing primary members to fallback data
    primary_cache = {}

    # PASS 1: Register Primary Members
    for i, row in primary_rows:
        raw_id = str(row.get("primary_psrn_id", "")).strip()
        if not raw_id:
            results["failed"] += 1
            results["errors"].append({"row": i, "institute_id": "(empty)", "reason": "Missing primary_psrn_id"})
            continue
            
        try:
            # Map primary_psrn_id to institute_id so _validate_and_parse_bulk_row can process it
            row_mapped = dict(row)
            row_mapped["institute_id"] = raw_id
            
            patient_data = _validate_and_parse_bulk_row(row_mapped)
            patient_data["relation"] = "Self"
            patient_data["imported_by"] = admin_username
            
            result_id = register_patient(patient_data)
            if result_id is None:
                # Already exists, just cache it
                existing_p = patients.find_one({"institute_id": raw_id})
                if existing_p:
                    primary_cache[raw_id] = existing_p
            else:
                primary_cache[raw_id] = patient_data
                results["success"] += 1

        except ValueError as e:
            results["failed"] += 1
            results["errors"].append({"row": i, "institute_id": raw_id, "reason": str(e)})

    # PASS 2: Register Dependants
    for i, row in dependant_rows:
        raw_psrn = str(row.get("primary_psrn_id", "")).strip()
        if not raw_psrn:
            results["failed"] += 1
            results["errors"].append({"row": i, "institute_id": "(empty)", "reason": "Missing primary_psrn_id"})
            continue

        try:
            # Fetch primary member data for fallbacks
            primary = primary_cache.get(raw_psrn) or patients.find_one({"institute_id": raw_psrn})
            if not primary:
                raise ValueError(f"Primary member with PSRN {raw_psrn} not found in database or this CSV.")

            # Fallbacks
            row_mapped = dict(row)
            if not str(row_mapped.get("email", "")).strip():
                row_mapped["email"] = primary.get("email", "")
            if not str(row_mapped.get("contact_no", "")).strip():
                row_mapped["contact_no"] = primary.get("contact_no", "")
            if not str(row_mapped.get("address", "")).strip():
                row_mapped["address"] = primary.get("address", "")

            relation = str(row_mapped.get("relation", "")).strip()
            if not relation:
                raise ValueError("Dependant is missing 'relation'")
            if relation.lower() == "self":
                raise ValueError("Dependant cannot have relation 'Self'")

            # Generate ID
            existing_family = get_family_by_psrn(raw_psrn)
            dep_id = generate_relation_id(raw_psrn, relation, existing_family)
            
            row_mapped["institute_id"] = dep_id
            patient_data = _validate_and_parse_bulk_row(row_mapped)
            patient_data["imported_by"] = admin_username
            patient_data["primary_member_id"] = raw_psrn
            patient_data["relation"] = relation
            
            # Additional validation specific to dependants can go here
            result_id = register_patient(patient_data)
            if result_id is None:
                raise ValueError("Dependant with this exact ID already exists")

            results["success"] += 1

        except ValueError as e:
            results["failed"] += 1
            results["errors"].append({"row": i, "institute_id": raw_psrn, "reason": str(e)})

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
        # Per your request, we move the patient to "completed" rather than returning them to the doctor.
        new_workflow_status = "completed"

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

import json

def load_lab_tests_from_config():
    try:
        with open(os.path.join(os.path.dirname(__file__), "data", "labtests_config.json"), "r") as f:
            return json.load(f)
    except:
        return []

def get_test_price(test_name, config_list):
    if not test_name: return 0
    for c in config_list:
        if c.get("test_name", "").lower() == test_name.lower():
            rates = c.get("rates", [])
            if rates:
                return rates[-1]
    return 0

def pay_bill(institute_id, visit_id=None, payment_mode="UPI", selected_labs=None, selected_medicines=None):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient:
        return {"success": False, "error": "Patient not found"}
        
    # Compute totals for snapshot
    config_list = load_lab_tests_from_config()
    total_amount = 0
    billed_items = []
    
    # Fetch specific visit to extract lab_tests and prescriptions
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
    else:
        visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])
    
    lab_tests = visit.get("lab_tests", []) if visit else []
    medicines = visit.get("prescriptions", []) if visit else []

    if selected_labs is None:
        selected_labs = list(range(len(lab_tests)))
    if selected_medicines is None:
        selected_medicines = list(range(len(medicines)))
        
    # We will update the patient and visit with ONLY the selected lab tests.
    final_lab_tests = []
    
    for i, t in enumerate(lab_tests):
        if i in selected_labs:
            test_name = t.get("lab_test", "")
            gross = get_test_price(test_name, config_list)
            discPerc = t.get("discount", 0)
            discAmt = gross * discPerc / 100
            rembPerc = t.get("rembPerc", 0)
            rembAmt = gross * rembPerc / 100
            amt = gross - discAmt - rembAmt
            
            billed_items.append({
                "type": "lab_test",
                "name": test_name,
                "gross": gross,
                "discount": discPerc,
                "discount_amount": discAmt,
                "rembursement": rembPerc,
                "rembursement_amount": rembAmt,
                "amount": amt
            })
            total_amount += amt
            final_lab_tests.append(t)
        
    final_medicines = []
    for i, p in enumerate(medicines):
        if i in selected_medicines:
            billed_items.append({
                "type": "medicine",
                "name": p.get("note", p) if isinstance(p, dict) else p,
                "amount": 0 # Assuming medicines are dispensed without extra charge here, or handled separately
            })
            final_medicines.append(p)
            
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    count = bills.count_documents({"payment_date": {"$gte": today_start}})
    invoice_no = f"INV-{now.strftime('%Y%m%d')}-{(count + 1):04d}"
    
    bill_doc = {
        "invoice_no": invoice_no,
        "payment_date": now,
        "institute_id": patient.get("institute_id"),
        "patient_name": patient.get("name"),
        "patient_type": patient.get("patient_type"),
        "age": patient.get("date_of_birth"), # Age is derived from DOB later
        "gender": patient.get("gender"),
        "items": billed_items,
        "total_amount": round(total_amount, 2),
        "payment_mode": payment_mode
    }
    bills.insert_one(bill_doc)

    has_labs = len(final_lab_tests) > 0
    current_workflow = patient.get("workflow_status", "active")
    
    if current_workflow == "consultation":
        # Doctor still hasn't clicked "Complete", stay in consultation
        new_workflow = "consultation"
    else:
        # Doctor is done, or it was active. Move to next logical step.
        new_workflow = "lab test pending" if has_labs else "completed"
    
    lab_status = "pending" if has_labs else patient.get("lab_status", "none")

    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "bill_status": "paid",
            "workflow_status": new_workflow,
            "lab_status": lab_status,
            "invoice_no": invoice_no,
            "payment_date": now,
            "lab_tests": final_lab_tests,
            "prescriptions": final_medicines
        }}
    )
    
    if visit:
        visits.update_one(
            {"visit_id": visit["visit_id"]},
            {"$set": {
                "invoice_no": invoice_no,
                "lab_tests": final_lab_tests,
                "prescription_details": final_medicines
            }}
        )

    return {"success": result.modified_count > 0, "invoice_no": invoice_no, "total_amount": total_amount, "bill": bill_doc}

def cancel_bill(institute_id, visit_id=None):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient:
        return {"success": False, "error": "Patient not found"}
        
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "bill_status": "cancelled",
            "workflow_status": "completed",
            "lab_status": "cancelled",
        }}
    )
    return {"success": result.modified_count > 0}

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
