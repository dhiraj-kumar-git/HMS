from app.database.core import *
from app.database.patients import _map_aggregated_patient, _get_active_visit_id
import json
import os

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

def _process_lab_orders(raw_orders, is_confirmed):
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
        patient["bill_status"] = "paid" if is_confirmed else "pending"
        patient["lab_status"] = "pending"
        patient["workflow_status"] = "lab test pending" if is_confirmed else "consultation completed"
        
        # Calculate age
        if "date_of_birth" in patient and isinstance(patient["date_of_birth"], datetime):
            dob = patient["date_of_birth"]
            now = datetime.now(timezone.utc)
            patient["age"] = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
            patient["date_of_birth"] = dob.isoformat()
            
        patient["visit_id"] = order.get("visit_id")
        patient["invoice_no"] = order.get("invoice_no")
        patient["consultation_completed_time"] = order.get("consultation_completed_time")
        patient["doctor_name"] = order.get("doctor_name")
        
        # Convert any other dates
        if "registration_time" in patient and isinstance(patient["registration_time"], datetime):
            patient["registration_time"] = patient["registration_time"].isoformat()
            
        result.append(patient)
    return result

def get_lab_patients():
    # 1. Confirmed Pipeline (invoice_no exists, pending lab tests)
    confirmed_pipeline = [
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
    raw_confirmed = list(visits.aggregate(confirmed_pipeline))
    confirmed = _process_lab_orders(raw_confirmed, is_confirmed=True)

    # 2. Upcoming Pipeline (invoice_no does not exist, status completed, pending lab tests)
    upcoming_pipeline = [
        {"$match": {
            "invoice_no": {"$exists": False},
            "status": "completed",
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
    raw_upcoming = list(visits.aggregate(upcoming_pipeline))
    upcoming = _process_lab_orders(raw_upcoming, is_confirmed=False)

    return {
        "confirmed": confirmed,
        "upcoming": upcoming
    }

# ---- BULK REGISTRATION FUNCTIONS ----


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


def load_lab_tests_from_config():
    try:
        with open(os.path.join(os.path.dirname(__file__), "..", "..", "data", "labtests_config.json"), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        import traceback; traceback.print_exc()
        return []


def get_test_price(test_name, config_list):
    if not test_name: return 0
    for c in config_list:
        if c.get("test_name", "").lower() == test_name.lower():
            rates = c.get("rates", [])
            if rates:
                return rates[-1]
    return 0

