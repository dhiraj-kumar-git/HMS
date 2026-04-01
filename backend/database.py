from datetime import datetime
from pymongo import MongoClient
import os
import bcrypt
from collection_format import Patient, User, Medicine

# MongoDB connection setup
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://hms_user:strongpassword123@hms-cluster.y4grcdf.mongodb.net/hospital_db")
client = MongoClient(MONGO_URI)

# Database and collections
db = client.hospital_db
patients = db.patients
users = db.users
sessions = db.sessions
inventory = db.inventory  # New collection for inventory management

# Function to hash passwords
def hash_password(password):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt)

# Function to check password
def check_password(password, hashed_password):
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password)

# Create a new user (Receptionist, Doctor, Medical Store, Lab Staff, Admin)
def create_user(username, password, role, display_name, department=None):
    existing_user = users.find_one({"username": username})
    if not existing_user:
        hashed_password = hash_password(password)
        user = User(
            username=username,
            password=hashed_password.decode('utf-8'),
            role=role,
            display_name=display_name or username,  # fallback to username
            department=department
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
    return list(users.find({"role": "doctor"}, {"_id": 0, "password": 0}))

# Get all patients (Admin only)
def get_all_patients():
    return list(patients.find({}, {"_id": 0}))

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
def end_session(username, session_id):
    result = sessions.update_one(
        {"username": username, "session_id": session_id, "active": True},
        {"$set": {"active": False, "logout_time": datetime.now().isoformat()}}
    )
    return result.modified_count > 0  # Return True if session was updated

# Generate a unique PSR number for each patient
def generate_psr_number():
    today = datetime.now().strftime("%Y%m%d")
    count = patients.count_documents({"psr_no": {"$regex": f"^{today}"}})
    return f"{today}{str(count + 1).zfill(4)}"  # Format: YYYYMMDDXXXX

# Register a new patient
def register_patient(patient_data):
    psr_no = generate_psr_number()
    registration_time = datetime.now()

    patient_data["psr_no"] = psr_no
    patient_data["registration_time"] = registration_time
    patients.insert_one(patient_data)
    return psr_no  # Return the generated PSR number

# Retrieve patient details by PSR number
def get_patient_by_psr(psr_no):
    patient = patients.find_one({"psr_no": psr_no})
    if patient:
        patient["_id"] = str(patient["_id"])  # Convert ObjectId to string for JSON response
        return patient
    return None

# Get patients assigned to a specific doctor
def get_patients_by_doctor(doctor_username):
    return list(patients.find({"doctor_assigned": doctor_username, "workflow_status": "active"}, {"_id": 0}))

# Add a prescription to a patient (recording the doctor's note)
def add_prescription(psr_no, prescription, doctor_username):
    result = patients.update_one(
        {"psr_no": psr_no},
        {"$push": {"prescriptions": {"doctor": doctor_username, "note": prescription, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Add a prescription to a patient by setting a new 'prescription_details' field
def add_prescription_details(psr_no, prescription_details, doctor_username):
    result = patients.update_one(
        {"psr_no": psr_no},
        {"$push": {"prescription_details": {"doctor": doctor_username, "prescription_details": prescription_details, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Add a lab test to a patient (recording only the lab test details)
def add_lab_test(psr_no, lab_test, doctor_username):
    result = patients.update_one(
        {"psr_no": psr_no},
        {"$push": {"lab_tests": {"doctor": doctor_username, "lab_test": lab_test, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Add a lab report to a patient
def add_lab_report(psr_no, report_details):
    result = patients.update_one(
        {"psr_no": psr_no},
        {"$push": {"lab_reports": {**report_details, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Retrieve all patients with lab reports
def get_lab_reports():
    reports = list(
        patients.find(
            {"lab_reports": {"$exists": True, "$ne": []}},
            {"_id": 0, "name": 1, "psr_no": 1, "age": 1, "gender": 1, "lab_reports": 1, "email": 1}
        )
    )
    return reports

# Add a remark to a patient (recording the remark separately)
def add_remark(psr_no, remark, doctor_username):
    result = patients.update_one(
        {"psr_no": psr_no},
        {"$push": {"remarks": {"doctor": doctor_username, "remark": remark, "timestamp": datetime.now().isoformat()}}}
    )
    return result.modified_count > 0

# Mark a patient as complete (workflow_status "completed")
def complete_patient(psr_no):
    result = patients.update_one(
        {"psr_no": psr_no},
        {"$set": {"workflow_status": "completed"}}
    )
    return result.modified_count > 0

# Get inactive patients assigned to a specific doctor (i.e. workflow_status not "active")
def get_inactive_patients_by_doctor(doctor_username):
    return list(patients.find({"doctor_assigned": doctor_username, "workflow_status": {"$ne": "active"}}, {"_id": 0}))

def get_active_pending_patients():
    """
    Returns patients who are active, have a pending bill, and have been prescribed
    either medicines or lab tests.
    """
    query = {
        "workflow_status": "active",
        "bill_status": "Pending",
        "$or": [
            {"prescriptions": {"$exists": True, "$ne": []}},
            {"lab_tests": {"$exists": True, "$ne": []}},
            {"prescription_details": {"$exists": True, "$ne": []}}
        ]
    }
    return list(patients.find(query, {"_id": 0}))

def get_doctors_name():

    for d in db.users.find({"role": "doctor"}):
        print(d)

    doctors = db.users.find({"role": "doctor"})
    return {d["username"]: d.get("display_name", d["username"]) for d in doctors}

def add_dummy_users():
    dummy_users = [
        {"username": "receptionist1", "password": "test123", "role": "receptionist", "display_name": "Receptionist 1"},
        {"username": "doctor1", "password": "test123", "role": "doctor", "display_name": "Dr. Doctor Name"},
        {"username": "medical_store1", "password": "test123", "role": "medical_store", "display_name": "Medical Store"},
        {"username": "lab_staff1", "password": "test123", "role": "lab_staff", "display_name": "Lab Staff"},
        {"username": "admin1", "password": "test123", "role": "admin", "display_name": "Admin"},
    ]

    for user in dummy_users:
        if not create_user(user["username"], user["password"], user["role"], user.get("display_name")):
            print(f"User {user['username']} already exists.")
        else:
            print(f"User {user['username']} created successfully.")

def submit_lab_tests(psr_no):
    # Update the patient document with the lab tests, order time, and mark bill_status as "Paid"
    result = patients.update_one(
        {"psr_no": psr_no},
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
