from app.database.core import *
from app.database.patients import _map_aggregated_patient, _get_active_visit_id
import json
import os

def add_lab_report(institute_id, visit_id, report_details, auto_complete=False):
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
    
    if auto_complete:
        # Mark specified test or all tests as completed
        target_test = report_details.get("test_name")
        if target_test:
            visits.update_one(
                {"visit_id": visit["visit_id"], "lab_tests.lab_test": target_test},
                {"$set": {"lab_tests.$.status": "completed"}}
            )
            # Clear draft if all tests are now completed
            updated_visit = visits.find_one({"visit_id": visit["visit_id"]})
            if updated_visit and all(t.get("status") == "completed" for t in updated_visit.get("lab_tests", [])):
                visits.update_one(
                    {"visit_id": visit["visit_id"]},
                    {"$unset": {"lab_results_draft": ""}}
                )
        else:
            visits.update_one(
                {"visit_id": visit["visit_id"]},
                {"$set": {"lab_tests.$[].status": "completed"}, "$unset": {"lab_results_draft": ""}}
            )
        
        patient = patients.find_one({"institute_id": institute_id})
        if patient:
            new_workflow_status = patient.get("workflow_status", "completed")
            if new_workflow_status == "lab test pending":
                # Check if all tests in the last visit are completed
                last_visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])
                if last_visit and all(t.get("status") == "completed" for t in last_visit.get("lab_tests", [])):
                    new_workflow_status = "completed"
                    patients.update_one(
                        {"institute_id": institute_id},
                        {"$set": {"workflow_status": new_workflow_status, "lab_status": "completed"}}
                    )
                else:
                    patients.update_one(
                        {"institute_id": institute_id},
                        {"$set": {"lab_status": "partially completed"}}
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
        patient["lab_results_draft"] = order.get("lab_results_draft", {})
        
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
            {"$set": {"lab_results": results}, "$unset": {"lab_results_draft": ""}}
        )

    new_workflow_status = patient.get("workflow_status", "completed")
    if new_workflow_status == "lab test pending":
        # Per your request, we move the patient to "completed" rather than returning them to the doctor.
        new_workflow_status = "completed"

    return patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"workflow_status": new_workflow_status, "lab_status": "completed"}}
    ).modified_count > 0


def save_lab_results_draft(institute_id, visit_id, results_draft):
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
    else:
        visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])
        
    if not visit: return False
    
    return visits.update_one(
        {"visit_id": visit["visit_id"]},
        {"$set": {"lab_results_draft": results_draft}}
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


def validate_and_complete_lab_report(institute_id, visit_id):
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
    else:
        visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])

    if not visit:
        return False, "Visit not found"

    # Get prescribed tests
    lab_tests = visit.get("lab_tests", [])
    if not lab_tests:
        return False, "No lab tests prescribed"

    # Load S3 uploaded reports for matching
    uploaded_reports = visit.get("lab_reports", [])
    draft = visit.get("lab_results_draft", {})

    config_list = load_lab_tests_from_config()

    import re

    # 1. Identify all prescribed group tests and gather all covered component/sub-field names
    prescribed_group_configs = []
    for lt in lab_tests:
        cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == lt["lab_test"].lower() or ct.get("test_id", "") == lt["lab_test"]), None)
        if cfg and (cfg.get("sub_tests") or cfg.get("test_id", "").lower().startswith("group")):
            prescribed_group_configs.append(cfg)

    covered_names = set()
    for g_cfg in prescribed_group_configs:
        if g_cfg.get("sub_tests"):
            for st in g_cfg["sub_tests"]:
                covered_names.add(st["name"].lower())
                sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == st["name"].lower()), None)
                ref_range = (sub_cfg.get("reference_range") if sub_cfg else None) or st.get("reference_range") or ""
                if "," in ref_range:
                    refs = [s.strip() for s in ref_range.split(",")]
                    for r in refs:
                        label = r.split(":")[0]
                        covered_names.add(label.lower())
        else:
            match = re.search(r"\(([^)]+)\)", g_cfg.get("test_name", ""))
            legacy_names = [s.strip() for s in match.group(1).split(",")] if match else []
            for ln in legacy_names:
                covered_names.add(ln.lower())
                sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == ln.lower()), None)
                ref_range = sub_cfg.get("reference_range") if sub_cfg else ""
                if ref_range and "," in ref_range:
                    refs = [s.strip() for s in ref_range.split(",")]
                    for r in refs:
                        label = r.split(":")[0]
                        covered_names.add(label.lower())

    # Deduplicate prescribed lab tests
    deduplicated_tests = []
    for lt in lab_tests:
        cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == lt["lab_test"].lower() or ct.get("test_id", "") == lt["lab_test"]), None)
        is_group = cfg and (cfg.get("sub_tests") or cfg.get("test_id", "").lower().startswith("group"))
        if is_group:
            deduplicated_tests.append(lt)
        elif lt["lab_test"].lower() not in covered_names:
            deduplicated_tests.append(lt)

    # Validate each test
    for lt in deduplicated_tests:
        test_name = lt["lab_test"]
        
        # Check if file upload exists
        has_file = any(r.get("test_name", "").lower() == test_name.lower() and r.get("s3_key") for r in uploaded_reports)
        if has_file:
            continue

        # If no file, check if draft results exist and are complete
        cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == test_name.lower() or ct.get("test_id", "") == test_name), None)
        
        if cfg and cfg.get("sub_tests"):
            for st in cfg["sub_tests"]:
                sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == st["name"].lower()), None)
                ref_range = (sub_cfg.get("reference_range") if sub_cfg else None) or st.get("reference_range") or ""
                if "," in ref_range:
                    refs = [s.strip() for s in ref_range.split(",")]
                    for r in refs:
                        label = r.split(":")[0]
                        if not draft.get(label, {}).get("value", "").strip():
                            return False, f"Missing value for sub-test parameter: {label}"
                else:
                    if not draft.get(st["name"], {}).get("value", "").strip():
                        return False, f"Missing value for sub-test: {st['name']}"
        
        elif cfg and cfg.get("test_id", "").lower().startswith("group"):
            match = re.search(r"\(([^)]+)\)", cfg.get("test_name", ""))
            legacy_names = [s.strip() for s in match.group(1).split(",")] if match else []
            for ln in legacy_names:
                sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == ln.lower()), None)
                ref_range = sub_cfg.get("reference_range") if sub_cfg else ""
                if ref_range and "," in ref_range:
                    refs = [s.strip() for s in ref_range.split(",")]
                    for r in refs:
                        label = r.split(":")[0]
                        if not draft.get(label, {}).get("value", "").strip():
                            return False, f"Missing value for sub-test parameter: {label}"
                else:
                    if not draft.get(ln, {}).get("value", "").strip():
                        return False, f"Missing value for sub-test: {ln}"

        elif cfg and "," in (cfg.get("reference_range") or ""):
            refs = [s.strip() for s in cfg.get("reference_range", "").split(",")]
            for r in refs:
                label = r.split(":")[0]
                if not draft.get(label, {}).get("value", "").strip():
                    return False, f"Missing value for parameter: {label}"

        else:
            if not draft.get(test_name, {}).get("value", "").strip():
                return False, f"Missing value for test: {test_name}"

    # All tests are validated! Now perform database updates
    
    # 1. Update lab_tests statuses to completed
    visits.update_one(
        {"visit_id": visit["visit_id"]},
        {"$set": {"lab_tests.$[].status": "completed"}}
    )

    # 2. Package draft results split by test
    if draft:
        for lt in deduplicated_tests:
            test_name = lt["lab_test"]
            has_file = any(r.get("test_name", "").lower() == test_name.lower() and r.get("s3_key") for r in uploaded_reports)
            if has_file:
                continue

            cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == test_name.lower() or ct.get("test_id", "") == test_name), None)
            test_params = set()
            
            if cfg and cfg.get("sub_tests"):
                for st in cfg["sub_tests"]:
                    test_params.add(st["name"].lower())
                    sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == st["name"].lower()), None)
                    ref_range = (sub_cfg.get("reference_range") if sub_cfg else None) or st.get("reference_range") or ""
                    if "," in ref_range:
                        refs = [s.strip() for s in ref_range.split(",")]
                        for r in refs:
                            test_params.add(r.split(":")[0].lower())
            elif cfg and cfg.get("test_id", "").lower().startswith("group"):
                match = re.search(r"\(([^)]+)\)", cfg.get("test_name", ""))
                legacy_names = [s.strip() for s in match.group(1).split(",")] if match else []
                for ln in legacy_names:
                    test_params.add(ln.lower())
                    sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == ln.lower()), None)
                    ref_range = sub_cfg.get("reference_range") if sub_cfg else ""
                    if ref_range and "," in ref_range:
                        refs = [s.strip() for s in ref_range.split(",")]
                        for r in refs:
                            test_params.add(r.split(":")[0].lower())
            elif cfg and "," in (cfg.get("reference_range") or ""):
                refs = [s.strip() for s in cfg.get("reference_range", "").split(",")]
                for r in refs:
                    test_params.add(r.split(":")[0].lower())
            else:
                test_params.add(test_name.lower())

            # Extract matching parameters from draft
            test_results = {}
            for param, val in draft.items():
                if param.lower() in test_params:
                    test_results[param] = val

            if test_results:
                report_data = {
                    "test_name": test_name,
                    "results": test_results,
                    "remarks": "",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                visits.update_one(
                    {"visit_id": visit["visit_id"]},
                    {"$push": {"lab_reports": report_data}}
                )

        # Clear draft
        visits.update_one(
            {"visit_id": visit["visit_id"]},
            {"$unset": {"lab_results_draft": ""}}
        )

    # 3. Update patient workflow_status and lab_status
    patients.update_one(
        {"institute_id": visit["institute_id"]},
        {"$set": {"workflow_status": "completed", "lab_status": "completed"}}
    )

    return True, "Lab report completed successfully"


def delete_lab_report(visit_id, s3_key, test_name):
    if not visit_id or not s3_key:
        return False
    try:
        vid = int(visit_id)
    except ValueError:
        vid = visit_id
    res = visits.update_one(
        {"visit_id": vid},
        {"$pull": {"lab_reports": {"s3_key": s3_key}}}
    )
    return res.modified_count > 0


def migrate_legacy_lab_reports():
    """
    Scans all visits with lab_reports in the database and cleans up any combined results
    so that every prescribed lab test has its own separate entry under the correct test_name.
    """
    import re
    config_list = load_lab_tests_from_config()
    all_visits = list(visits.find({"lab_reports.results": {"$exists": True}}))

    for visit in all_visits:
        lab_reports = visit.get("lab_reports", [])
        lab_tests = visit.get("lab_tests", [])
        if not lab_reports or not lab_tests:
            continue

        updated = False
        new_reports = []

        # Map which parameters belong to which test name
        test_to_params = {}
        for lt in lab_tests:
            t_name = lt["lab_test"]
            cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == t_name.lower() or ct.get("test_id", "") == t_name), None)
            params = set()
            if cfg and cfg.get("sub_tests"):
                for st in cfg["sub_tests"]:
                    params.add(st["name"].lower())
                    sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == st["name"].lower()), None)
                    ref_range = sub_cfg.get("reference_range") if sub_cfg else ""
                    if ref_range and "," in ref_range:
                        refs = [s.strip() for s in ref_range.split(",")]
                        for r in refs:
                            params.add(r.split(":")[0].lower())
            elif cfg and cfg.get("test_id", "").lower().startswith("group"):
                match = re.search(r"\(([^)]+)\)", cfg.get("test_name", ""))
                legacy_names = [s.strip() for s in match.group(1).split(",")] if match else []
                for ln in legacy_names:
                    params.add(ln.lower())
                    sub_cfg = next((ct for ct in config_list if ct.get("test_name", "").lower() == ln.lower()), None)
                    ref_range = sub_cfg.get("reference_range") if sub_cfg else ""
                    if ref_range and "," in ref_range:
                        refs = [s.strip() for s in ref_range.split(",")]
                        for r in refs:
                            params.add(r.split(":")[0].lower())
            elif cfg and "," in (cfg.get("reference_range") or ""):
                refs = [s.strip() for s in cfg.get("reference_range", "").split(",")]
                for r in refs:
                    params.add(r.split(":")[0].lower())
            else:
                params.add(t_name.lower())
            test_to_params[t_name] = params

        # Process each report entry in visit['lab_reports']
        for rep in lab_reports:
            # If it's a file upload, keep it as is
            if "s3_key" in rep:
                new_reports.append(rep)
                continue

            results = rep.get("results", {})
            if not results:
                new_reports.append(rep)
                continue

            rep_test_name = rep.get("test_name")
            rep_params = test_to_params.get(rep_test_name, set())

            # Check if there are keys in results that do not belong to rep_test_name,
            # but belong to other tests in lab_tests that DO NOT have their own report yet
            existing_report_tests = {r.get("test_name", "").lower() for r in lab_reports}
            other_prescribed_tests = [lt["lab_test"] for lt in lab_tests if lt["lab_test"].lower() not in existing_report_tests]

            # We will split out any parameters from `results` that belong to `other_prescribed_tests`
            split_reports = {}
            cleaned_results = {}

            for key, val in results.items():
                key_lower = key.lower()
                # Check if it belongs to rep_params
                if key_lower in rep_params:
                    cleaned_results[key] = val
                    continue

                # If not, check if it belongs to any of the other prescribed tests
                found_other = False
                for other_t in other_prescribed_tests:
                    other_params = test_to_params.get(other_t, set())
                    if key_lower in other_params:
                        if other_t not in split_reports:
                            split_reports[other_t] = {}
                        split_reports[other_t][key] = val
                        found_other = True
                        break

                if not found_other:
                    cleaned_results[key] = val

            # If we split anything, we update new_reports
            if split_reports:
                updated = True
                rep["results"] = cleaned_results
                new_reports.append(rep)

                for other_t, other_results in split_reports.items():
                    new_reports.append({
                        "test_name": other_t,
                        "results": other_results,
                        "remarks": rep.get("remarks", ""),
                        "timestamp": rep.get("timestamp") or datetime.now(timezone.utc).isoformat()
                    })
            else:
                new_reports.append(rep)

        if updated:
            visits.update_one(
                {"visit_id": visit["visit_id"]},
                {"$set": {"lab_reports": new_reports}}
            )


