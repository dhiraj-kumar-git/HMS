from app.database.core import *
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

def register_patient(patient_data):
    if "name" in patient_data and patient_data["name"]:
        patient_data["name"] = patient_data["name"].title()
        
    institute_id = patient_data.get("institute_id")
    if not institute_id:
        raise ValueError("Institute ID is required for registration")
    
    institute_id = institute_id.upper()
    patient_data["institute_id"] = institute_id
    
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
    if institute_id:
        institute_id = institute_id.upper()
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
    if institute_id:
        institute_id = institute_id.upper()
    result = patients.delete_one(
        {"institute_id": institute_id, "patient_type": "Dependant"}
    )
    return result.deleted_count > 0


def archive_patient(institute_id):
    if institute_id:
        institute_id = institute_id.upper()
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"account_status": "archived"}}
    )
    return result.matched_count > 0


def book_appointment(institute_id, doctor_username, doctor_name, appointment_time, status="booked", booked_by="patient"):
    if institute_id:
        institute_id = institute_id.upper()
    # Create the Visit
    v = Visit(
        visit_id=str(uuid.uuid4()),
        institute_id=institute_id,
        doctor_username=doctor_username,
        status=status,
        booked_by=booked_by,
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
    return result.matched_count > 0


import hashlib

def get_stable_medicine_details(visit_id, med_name):
    # Try looking up in inventory collection
    med_doc = inventory.find_one({"item_name": med_name})
    if med_doc and isinstance(med_doc, dict):
        sale_rate = med_doc.get("sale_rate") or 0.0
        gst_rate = med_doc.get("gst_rate") or 5.0
        batch_number = med_doc.get("batch_number") or "B-UNKNOWN"
        expiry_date = med_doc.get("expiry_date")
        if isinstance(expiry_date, datetime):
            expiry_date = expiry_date.strftime("%m/%y")
        elif not expiry_date:
            expiry_date = "12/30"
        return sale_rate, gst_rate, batch_number, expiry_date

    # Fallback to deterministic pseudo-random details using seed = visit_id + med_name
    seed_str = f"{visit_id or 'default_visit'}:{med_name or 'default_med'}"
    h = hashlib.sha256(seed_str.encode('utf-8')).hexdigest()
    # Generate stable sale_rate between 10.00 and 150.00
    val_rate = int(h[0:8], 16) % 14000
    sale_rate = round(10.00 + (val_rate / 100.0), 2)
    # GST rate default is 5.0
    gst_rate = 5.0
    # Batch number like B-XXXXXX
    batch_hex = h[8:16].upper()
    batch_number = f"B-{batch_hex}"
    # Expiry date like MM/YY (stable month 01 to 12, stable year 28 to 35)
    val_month = (int(h[16:20], 16) % 12) + 1
    val_year = (int(h[20:24], 16) % 8) + 28 # years 28 to 35
    expiry_date = f"{val_month:02d}/{val_year}"
    
    return sale_rate, gst_rate, batch_number, expiry_date


def _map_aggregated_patient(patient, active_doctor_username=None):
    if not patient:
        return None
    if "_id" in patient:
        patient["_id"] = str(patient["_id"])
    
    # Calculate age dynamically from date_of_birth
    if "date_of_birth" in patient:
        dob = patient["date_of_birth"]
        if isinstance(dob, (datetime, date)):
            dob_date = dob.date() if isinstance(dob, datetime) else dob
            now = datetime.now(timezone.utc).date()
            patient["age"] = now.year - dob_date.year - ((now.month, now.day) < (dob_date.month, dob_date.day))
        elif isinstance(dob, str):
            try:
                from dateutil.parser import parse
                dob_parsed = parse(dob)
                now = datetime.now(timezone.utc)
                patient["age"] = now.year - dob_parsed.year - ((now.month, now.day) < (dob_parsed.month, dob_parsed.day))
            except:
                pass

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
    
    any_bill_pending = False
    any_lab_pending = False
    
    for v in patient_visits:
        visit_id = v.get("visit_id")
        
        # Enrich prescriptions in place
        raw_pres = v.get("prescriptions", [])
        enriched_pres = []
        for p in raw_pres:
            if isinstance(p, str):
                p_dict = {"drug": p}
            elif isinstance(p, dict):
                p_dict = dict(p)
            else:
                continue
            p_name = p_dict.get("drug") or p_dict.get("note") or ""
            rate, gst, batch, expiry = get_stable_medicine_details(visit_id, p_name)
            p_dict["sale_rate"] = rate
            p_dict["gst_rate"] = gst
            p_dict["batch_number"] = batch
            p_dict["expiry_date"] = expiry
            enriched_pres.append(p_dict)
        v["prescriptions"] = enriched_pres
        
        # Do the same for prescription_details
        raw_details = v.get("prescription_details", [])
        enriched_details = []
        for p in raw_details:
            if isinstance(p, str):
                p_dict = {"drug": p}
            elif isinstance(p, dict):
                p_dict = dict(p)
            else:
                continue
            p_name = p_dict.get("drug") or p_dict.get("note") or ""
            rate, gst, batch, expiry = get_stable_medicine_details(visit_id, p_name)
            p_dict["sale_rate"] = rate
            p_dict["gst_rate"] = gst
            p_dict["batch_number"] = batch
            p_dict["expiry_date"] = expiry
            enriched_details.append(p_dict)
        v["prescription_details"] = enriched_details

        has_labs = len(v.get("lab_tests", [])) > 0
        has_prescriptions = len(v.get("prescriptions", [])) > 0
        has_invoice = bool(v.get("invoice_no"))
        visit_status = v.get("status", "upcoming")
        
        # Calculate bill status
        if visit_status == "cancelled" and (has_labs or has_prescriptions):
            v_bill = "cancelled"
        elif has_invoice:
            v_bill = "paid"
        elif visit_status == "completed" and (has_labs or has_prescriptions):
            v_bill = "pending"
            any_bill_pending = True
        else:
            v_bill = "none"
            
        # Calculate lab status
        if has_labs:
            if visit_status == "cancelled":
                v_lab = "cancelled"
            else:
                labs_pending = any(lt.get("status") == "pending" for lt in v.get("lab_tests", []))
                v_lab = "pending" if labs_pending else "completed"
                if labs_pending:
                    any_lab_pending = True
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
            "remarks_draft": v.get("remarks", []),
            "emr_data": v.get("emr_data", {}),
            "lab_reports": v.get("lab_reports", [])
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
        
        if visit_status == "cancelled" and (has_labs or has_prescriptions):
            v_bill = "cancelled"
        elif has_invoice:
            v_bill = "paid"
        elif visit_status == "completed" and (has_labs or has_prescriptions):
            v_bill = "pending"
        else:
            v_bill = "none"
            
        if has_labs:
            if visit_status == "cancelled":
                v_lab = "cancelled"
            else:
                labs_pending = any(lt.get("status") == "pending" for lt in latest_visit.get("lab_tests", []))
                v_lab = "pending" if labs_pending else "completed"
        else:
            v_lab = "none"
            
        if visit_status in ["upcoming", "booked", "confirmed", "checked_in"]:
            v_workflow = visit_status
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
        patient["bill_status"] = "pending" if any_bill_pending else v_bill
        patient["lab_status"] = "pending" if any_lab_pending else v_lab
        patient["doctor_assigned"] = latest_visit.get("doctor_username")
        
    return patient


def store_patient_otp(institute_id, otp):
    if institute_id:
        institute_id = institute_id.upper()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    result = patients.update_one(
        {"institute_id": institute_id},
        {"$set": {"otp": otp, "otp_expires": expires_at}}
    )
    return result.modified_count > 0

def get_receptionist_queue(start_date=None, end_date=None, status_filter=None):
    query = {}
    
    # Status filtering
    if status_filter and status_filter.lower() != 'all':
        if status_filter.lower() == 'active':
            query["status"] = {"$in": ["booked", "confirmed"]}
        else:
            query["status"] = status_filter.lower()
    elif not status_filter:
        # Default to active statuses
        query["status"] = {"$in": ["booked", "confirmed"]}

    # Date filtering (time field)
    if start_date or end_date:
        time_query = {}
        if start_date:
            # Match dates greater than or equal to start_date
            time_query["$gte"] = f"{start_date}T00:00:00"
        if end_date:
            # Match dates less than or equal to end_date
            time_query["$lte"] = f"{end_date}T23:59:59"
        if time_query:
            query["time"] = time_query

    pipeline = [
        {"$match": query},
        {"$lookup": {
            "from": "patients",
            "localField": "institute_id",
            "foreignField": "institute_id",
            "as": "patient_info"
        }},
        {"$unwind": {"path": "$patient_info", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "visit_id": 1,
            "institute_id": 1,
            "doctor_username": 1,
            "doctor_name": 1,
            "time": 1,
            "status": 1,
            "name": "$patient_info.name",
            "contact_no": "$patient_info.contact_no",
            "gender": "$patient_info.gender",
            "date_of_birth": "$patient_info.date_of_birth",
            "email": "$patient_info.email",
            "address": "$patient_info.address",
            "registration_time": "$patient_info.registration_time",
            "emr_data": 1,
            "prescriptions": 1,
            "lab_tests": 1
        }},
        COMPUTE_AGE_STAGE,
        {"$sort": {"time": 1}}
    ]
    results = list(visits.aggregate(pipeline))
    for v in results:
        # 1. OPD No calculation
        v_time = v.get("time")
        if v_time:
            date_str = v_time.split("T")[0]
            day_visits = list(visits.find({"time": {"$regex": f"^{date_str}"}}).sort([("time", 1), ("visit_id", 1)]))
            visit_index = 1
            for idx, item in enumerate(day_visits):
                if item.get("visit_id") == v.get("visit_id"):
                    visit_index = idx + 1
                    break
            v["opd_no"] = f"{date_str.replace('-', '')}{visit_index:04d}"
        else:
            v["opd_no"] = ""

        # 2. UHID No calculation
        reg_time = v.get("registration_time")
        inst_id = v.get("institute_id", "")
        if reg_time and inst_id:
            if isinstance(reg_time, str):
                try:
                    reg_dt = datetime.fromisoformat(reg_time.replace("Z", "+00:00"))
                except Exception:
                    reg_dt = None
            else:
                reg_dt = reg_time
                
            if reg_dt:
                reg_date_str = reg_dt.strftime("%Y-%m-%d")
                start_of_day = datetime.strptime(reg_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                end_of_day = start_of_day + timedelta(days=1)
                
                day_patients = list(patients.find({
                    "registration_time": {
                        "$gte": start_of_day,
                        "$lt": end_of_day
                    }
                }).sort([("registration_time", 1), ("institute_id", 1)]))
                
                patient_index = 1
                for idx, pt in enumerate(day_patients):
                    if pt.get("institute_id") == inst_id:
                        patient_index = idx + 1
                        break
                v["uhid_no"] = f"{reg_date_str.replace('-', '')}{patient_index:04d}"
            else:
                v["uhid_no"] = inst_id
        else:
            v["uhid_no"] = inst_id
            
    return results

def update_appointment_status(visit_id, status):
    res = visits.update_one({"visit_id": visit_id}, {"$set": {"status": status}})
    return res.modified_count > 0


def verify_patient_otp(institute_id, otp):
    if institute_id:
        institute_id = institute_id.upper()
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
    if institute_id:
        institute_id = institute_id.upper()
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
        {"$match": {
            "$or": [
                {"institute_id": psrn_id},
                {"psrn_id": psrn_id}
            ]
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
                    "status": {"$in": ["confirmed", "checked_in", "consultation"]}
                }
            }
        }},
        COMPUTE_AGE_STAGE  # Derive age from date_of_birth at query time
    ]
    pts = list(patients.aggregate(pipeline))
    result = []
    for p in pts:
        patient_visits = p.get("patient_visits", [])
        doctor_visits = [v for v in patient_visits if v.get("doctor_username") == doctor_username and v.get("status") in ["confirmed", "checked_in", "consultation"]]
        
        for visit in doctor_visits:
            # Clone patient but keep only this single visit in the list
            p_clone = p.copy()
            p_clone["patient_visits"] = [visit]
            
            assembled = _map_aggregated_patient(p_clone, active_doctor_username=doctor_username)
            if assembled:
                assembled.pop("_id", None)
                assembled["visit_id"] = visit.get("visit_id")
                result.append(assembled)
                
    return result

def _get_active_visit_id(institute_id, doctor_username=None):
    # Find the most recent active visit (can be upcoming, booked, confirmed, checked_in, or in consultation)
    query = {"institute_id": institute_id, "status": {"$in": ["upcoming", "booked", "confirmed", "checked_in", "consultation"]}}
    if doctor_username:
        query["doctor_username"] = doctor_username
        
    visit = visits.find_one(query, sort=[("booked_at", -1)])
    if visit:
        return visit["visit_id"]
    return None
def get_patient_history_for_doctor(doctor_username, doctor_display_name, skip=0, limit=0, days=7):
    from datetime import datetime, timedelta, timezone
    date_limit = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
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
                        "status": {"$in": ["completed", "cancelled"]},
                        "time": {"$gte": date_limit}
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


def search_past_patients_for_doctor(doctor_username, doctor_display_name, institute_id=None, last_visit_date=None, name=None):
    pipeline = [
        {
            "$lookup": {
                "from": "visits",
                "localField": "institute_id",
                "foreignField": "institute_id",
                "as": "patient_visits"
            }
        }
    ]
    
    match_conditions = {
        "patient_visits": {
            "$elemMatch": {
                "$or": [
                    {"doctor_username": doctor_username},
                    {"doctor_name": doctor_display_name}
                ],
                "status": {"$in": ["completed", "cancelled"]}
            }
        }
    }
    
    if institute_id:
        match_conditions["institute_id"] = institute_id.upper()
    
    if name:
        match_conditions["name"] = {"$regex": name, "$options": "i"}
        
    pipeline.append({"$match": match_conditions})
    
    if last_visit_date:
        pipeline.append({
            "$match": {
                "patient_visits": {
                    "$elemMatch": {
                        "$or": [
                            {"doctor_username": doctor_username},
                            {"doctor_name": doctor_display_name}
                        ],
                        "status": {"$in": ["completed", "cancelled"]},
                        "time": {"$regex": f"^{last_visit_date}"}
                    }
                }
            }
        })
        
    pipeline.append(COMPUTE_AGE_STAGE)
    
    pts = list(patients.aggregate(pipeline))
    result = []
    for p in pts:
        assembled = _map_aggregated_patient(p)
        if assembled:
            assembled.pop("_id", None)
            result.append(assembled)
    return result




def _finalize_visit(visit_id, mark_as_completed=True):
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
def update_consultation_details(visit_id, doctor_username, prescription_data):
    if not visit_id: return False
    
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # We still want to maintain `prescriptions` array for the Medical Store mapping.
    # The new medications list will be in prescription_data["plan"]["medications"]
    new_prescriptions = []
    medications = prescription_data.get("plan", {}).get("medications", [])
    for m in medications:
        new_prescriptions.append({
            "doctor": doctor_username, 
            "note": m.get("drug", ""), 
            "dose": m.get("dose", ""),
            "route": m.get("route", ""),
            "frequency": m.get("frequency", ""),
            "duration": m.get("duration", ""),
            "quantity": m.get("quantity", ""),
            "timestamp": timestamp
        })

    # The same goes for lab_tests
    new_lab_tests = [{"doctor": doctor_username, "lab_test": lt, "status": "pending", "timestamp": timestamp} for lt in prescription_data.get("plan", {}).get("investigations", [])]
    
    result = visits.update_one(
        {"visit_id": visit_id},
        {"$set": {
            "prescriptions": new_prescriptions,
            "lab_tests": new_lab_tests,
            "emr_data": prescription_data
        }}
    )
    return result.matched_count > 0

# Add a lab report to a patient
def complete_patient(visit_id):
    visit = visits.find_one({"visit_id": visit_id})
    if not visit: return False
    institute_id = visit.get("institute_id")
    
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    _finalize_visit(visit_id, mark_as_completed=True)

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
def consultation_patient(visit_id, doctor_username, has_labs, has_meds):
    visit = visits.find_one({"visit_id": visit_id})
    if not visit: return False
    institute_id = visit.get("institute_id")
    
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    lab_status = "active" if has_labs else "none"
    bill_status = "pending" if (has_labs or has_meds) else "none"
    
    # Update visit summary so patient can see it in history immediately
    # We must explicitly set the visit status to 'consultation' so _map_aggregated_patient picks it up
    setattr(_finalize_visit, 'force_consultation', True)
    _finalize_visit(visit_id, mark_as_completed=False)
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
def complete_consultation(visit_id, doctor_username=None):
    visit = visits.find_one({"visit_id": visit_id})
    if not visit: return False
    institute_id = visit.get("institute_id")
    
    patient = patients.find_one({"institute_id": institute_id})
    if not patient: return False
    
    # Finalize the visit status to "completed" in the visits collection
    _finalize_visit(visit_id, mark_as_completed=True)
    
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
            "status": "completed",
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
        patient["doctor_name"] = order.get("doctor_name", order.get("doctor_username", ""))
        patient["doctor_assigned"] = order.get("doctor_name", order.get("doctor_username", ""))
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
            patient_data["psrn_id"] = raw_id
            
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
            patient_data["psrn_id"] = raw_psrn
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

