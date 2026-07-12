from app.database.core import *
from app.database.lab import load_lab_tests_from_config, get_test_price

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

def pay_bill(institute_id, visit_id=None, payment_mode="UPI", selected_labs=None, selected_medicines=None):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient:
        return {"success": False, "error": "Patient not found"}
        
    p_type = patient.get("patient_type", "Student")
    is_faculty_eligible = p_type in ["Faculty", "Staff", "Dependant"]
    
    sponsor_name = None
    sponsor_psrn = None
    relation = "Student"
    
    if is_faculty_eligible:
        relation = patient.get("relation", "Self")
        if p_type == "Dependant":
            sponsor_psrn = patient.get("primary_psrn_id")
            if sponsor_psrn:
                sponsor_doc = patients.find_one({"institute_id": sponsor_psrn})
                sponsor_name = sponsor_doc.get("name") if sponsor_doc else None
        else:
            sponsor_psrn = patient.get("institute_id")
            sponsor_name = patient.get("name")
            relation = "Self"

    # Compute totals for snapshot
    config_list = load_lab_tests_from_config()
    billed_items = []
    
    # Fetch specific visit to extract lab_tests and prescriptions
    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
    else:
        visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])
    
    visit_doc = visit or {}
    doctor_name = visit_doc.get("doctor_name", visit_doc.get("doctor_username", ""))
    lab_tests = visit_doc.get("lab_tests", [])
    medicines = visit_doc.get("prescriptions", [])

    if selected_labs is None:
        selected_labs = list(range(len(lab_tests)))
    if selected_medicines is None:
        selected_medicines = list(range(len(medicines)))
        
    final_lab_tests = []
    
    for i, t in enumerate(lab_tests):
        if i in selected_labs:
            test_name = t.get("lab_test", "")
            gross = get_test_price(test_name, config_list)
            discPerc = 50
            discAmt = gross * discPerc / 100
            amt = gross - discAmt
            
            billed_items.append({
                "type": "lab_test",
                "name": test_name,
                "gross": gross,
                "discount": discPerc,
                "discount_amount": round(discAmt, 2),
                "cgst": 0.00,
                "sgst": 0.00,
                "amount": round(amt, 2),
                "item_total": round(amt, 2)
            })
            final_lab_tests.append(t)
        
    final_medicines = []
    from app.database.patients import get_stable_medicine_details
    
    for idx, item in enumerate(selected_medicines):
        if isinstance(item, dict):
            m_dict = dict(item)
        else:
            # item is an index
            idx_val = int(item)
            if idx_val < len(medicines):
                p = medicines[idx_val]
                m_dict = dict(p) if isinstance(p, dict) else {"drug": p}
            else:
                continue
                
        med_name = m_dict.get("drug") or m_dict.get("note") or ""
        qty_str = m_dict.get("quantity") or "1"
        try:
            quantity = float(qty_str) if qty_str else 1.0
        except ValueError:
            quantity = 1.0
            
        rate = m_dict.get("sale_rate")
        gst_rate = m_dict.get("gst_rate")
        batch = m_dict.get("batch_number")
        expiry = m_dict.get("expiry_date")
        
        if rate is None or gst_rate is None or batch is None or expiry is None:
            # Lookup or fallback
            rate, gst_rate, batch, expiry = get_stable_medicine_details(visit_id or (visit.get("visit_id") if visit else None), med_name)
            
        gross = rate * quantity
        gst_amount = gross * (gst_rate / 100.0)
        cgst = gst_amount / 2.0
        sgst = gst_amount / 2.0
        item_total = gross + gst_amount
        
        billed_items.append({
            "type": "medicine",
            "name": med_name,
            "rate": rate,
            "quantity": int(quantity) if quantity.is_integer() else quantity,
            "gross": round(gross, 2),
            "discount": 0,
            "discount_amount": 0.00,
            "cgst": round(cgst, 2),
            "sgst": round(sgst, 2),
            "amount": round(gross, 2),
            "item_total": round(item_total, 2),
            "batch": batch,
            "expiry": expiry
        })
        m_dict["quantity"] = quantity
        m_dict["sale_rate"] = rate
        m_dict["gst_rate"] = gst_rate
        m_dict["batch_number"] = batch
        m_dict["expiry_date"] = expiry
        final_medicines.append(m_dict)
            
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Filter items by type
    med_items = [item for item in billed_items if item["type"] == "medicine"]
    lab_items = [item for item in billed_items if item["type"] == "lab_test"]
    
    count = bills.count_documents({"payment_date": {"$gte": today_start}})
    
    bill_docs_to_insert = []
    invoice_no = ""
    total_rounded = 0
    
    if len(med_items) > 0 and len(lab_items) > 0:
        # Scenario 3: Both Medicines and Labs -> Generate 2 distinct bills
        invoice_no_med = f"INV-{now.strftime('%Y%m%d')}-{(count + 1):04d}"
        invoice_no_lab = f"INV-{now.strftime('%Y%m%d')}-{(count + 2):04d}"
        invoice_no = f"{invoice_no_med}, {invoice_no_lab}"
        
        # Med Bill
        med_unrounded = sum(item["item_total"] for item in med_items)
        med_rounded = round(med_unrounded)
        med_round_off = round(med_rounded - med_unrounded, 2)
        if is_faculty_eligible:
            med_reimbursed = round(med_unrounded * 0.90, 2)
            med_self_paid = round(med_rounded - med_reimbursed, 2)
        else:
            med_reimbursed = 0.00
            med_self_paid = float(med_rounded)
            
        bill_doc_med = {
            "invoice_no": invoice_no_med,
            "payment_date": now,
            "institute_id": patient.get("institute_id"),
            "patient_name": patient.get("name"),
            "patient_type": p_type,
            "age": patient.get("date_of_birth"),
            "gender": patient.get("gender"),
            "items": med_items,
            "unrounded_total": round(med_unrounded, 2),
            "round_off": med_round_off,
            "total_amount": med_rounded,
            "reimbursed_amount": med_reimbursed,
            "self_paid_amount": med_self_paid,
            "sponsor_name": sponsor_name,
            "sponsor_psrn": sponsor_psrn,
            "relation": relation,
            "payment_mode": payment_mode,
            "doctor_name": doctor_name,
            "bill_category": "medicine"
        }
        bill_docs_to_insert.append(bill_doc_med)
        
        # Lab Bill
        lab_unrounded = sum(item["item_total"] for item in lab_items)
        lab_rounded = round(lab_unrounded)
        lab_round_off = round(lab_rounded - lab_unrounded, 2)
        if is_faculty_eligible:
            lab_reimbursed = round(lab_unrounded * 0.90, 2)
            lab_self_paid = round(lab_rounded - lab_reimbursed, 2)
        else:
            lab_reimbursed = 0.00
            lab_self_paid = float(lab_rounded)
            
        bill_doc_lab = {
            "invoice_no": invoice_no_lab,
            "payment_date": now,
            "institute_id": patient.get("institute_id"),
            "patient_name": patient.get("name"),
            "patient_type": p_type,
            "age": patient.get("date_of_birth"),
            "gender": patient.get("gender"),
            "items": lab_items,
            "unrounded_total": round(lab_unrounded, 2),
            "round_off": lab_round_off,
            "total_amount": lab_rounded,
            "reimbursed_amount": lab_reimbursed,
            "self_paid_amount": lab_self_paid,
            "sponsor_name": sponsor_name,
            "sponsor_psrn": sponsor_psrn,
            "relation": relation,
            "payment_mode": payment_mode,
            "doctor_name": doctor_name,
            "bill_category": "lab_test"
        }
        bill_docs_to_insert.append(bill_doc_lab)
        total_rounded = med_rounded + lab_rounded
        
    else:
        # Scenario 1 & 2: Medicines only or Labs only -> Single bill
        invoice_no = f"INV-{now.strftime('%Y%m%d')}-{(count + 1):04d}"
        total_unrounded = sum(item["item_total"] for item in billed_items)
        total_rounded = round(total_unrounded)
        round_off = round(total_rounded - total_unrounded, 2)
        if is_faculty_eligible:
            reimbursed = round(total_unrounded * 0.90, 2)
            self_paid = round(total_rounded - reimbursed, 2)
        else:
            reimbursed = 0.00
            self_paid = float(total_rounded)
            
        bill_category = "medicine" if len(med_items) > 0 else "lab_test"
        bill_doc = {
            "invoice_no": invoice_no,
            "payment_date": now,
            "institute_id": patient.get("institute_id"),
            "patient_name": patient.get("name"),
            "patient_type": p_type,
            "age": patient.get("date_of_birth"),
            "gender": patient.get("gender"),
            "items": billed_items,
            "unrounded_total": round(total_unrounded, 2),
            "round_off": round_off,
            "total_amount": total_rounded,
            "reimbursed_amount": reimbursed,
            "self_paid_amount": self_paid,
            "sponsor_name": sponsor_name,
            "sponsor_psrn": sponsor_psrn,
            "relation": relation,
            "payment_mode": payment_mode,
            "doctor_name": doctor_name,
            "bill_category": bill_category
        }
        bill_docs_to_insert.append(bill_doc)
        total_rounded = total_rounded

    # Insert bills
    for doc in bill_docs_to_insert:
        bills.insert_one(doc)

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

    returned_bill = bill_docs_to_insert if len(bill_docs_to_insert) > 1 else bill_docs_to_insert[0]
    return {"success": True, "invoice_no": invoice_no, "total_amount": total_rounded, "bill": returned_bill}


def cancel_bill(institute_id, visit_id=None):
    patient = patients.find_one({"institute_id": institute_id})
    if not patient:
        return {"success": False, "error": "Patient not found"}
        
    patients.update_one(
        {"institute_id": institute_id},
        {"$set": {
            "bill_status": "cancelled",
            "workflow_status": "completed",
            "lab_status": "cancelled",
        }}
    )

    if visit_id:
        visit = visits.find_one({"visit_id": visit_id})
    else:
        visit = visits.find_one({"institute_id": institute_id}, sort=[("booked_at", -1)])

    if visit:
        updated_lab_tests = visit.get("lab_tests", [])
        for lt in updated_lab_tests:
            if lt.get("status") == "pending":
                lt["status"] = "cancelled"

        visits.update_one(
            {"visit_id": visit["visit_id"]},
            {"$set": {
                "status": "cancelled",
                "lab_tests": updated_lab_tests
            }}
        )

    return {"success": True}

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

