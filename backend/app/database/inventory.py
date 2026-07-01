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

