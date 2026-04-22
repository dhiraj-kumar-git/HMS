# OTP System Integration Guide

This document provides step-by-step instructions to integrate the OTP-based patient access system into your existing HMS backend.

## Step 1: Update database.py

### Add Collections to Database Setup

In `backend/database.py`, find the section where collections are initialized (around line 24-26):

**Current Code:**

```python
db = client.hospital_db
patients = db.patients
users = db.users
sessions = db.sessions
inventory = db.inventory  # New collection for inventory management
visits = db.visits
```

**Change to:**

```python
db = client.hospital_db
patients = db.patients
users = db.users
sessions = db.sessions
inventory = db.inventory  # New collection for inventory management
visits = db.visits
otps = db.otps  # NEW: For OTP records
access_sessions = db.access_sessions  # NEW: For access sessions
```

### Add Index Creation for OTP Collections

In `backend/database.py`, find the "Ensure Indexes Configuration" section (around line 36-47):

**Current Code:**

```python
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
```

**Change to:**

```python
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

    # NEW: OTP System Indexes
    otps.create_index("otp_id", unique=True)
    otps.create_index("patient_psr_no")
    otps.create_index([("expires_at", 1)], expireAfterSeconds=1800)  # TTL: 30 min auto-delete
    otps.create_index([("created_at", 1)], expireAfterSeconds=1800)

    access_sessions.create_index("session_id", unique=True)
    access_sessions.create_index("patient_psr_no")
    access_sessions.create_index("doctor_username")
    access_sessions.create_index([("session_expires_at", 1)], expireAfterSeconds=1800)  # TTL: 30 min

except Exception as e:
    print(f"Error creating indexes: {e}")
```

---

## Step 2: Update .env File

Ensure these email configuration variables are present in `.env`:

**Current .env** (example):

```env
MONGO_URI=mongodb+srv://...
JWT_SECRET_KEY=your-secret-key
EMAIL_ADDRESS=f20230799@pilani.bits-pilani.ac.in
EMAIL_PASSWORD=your-email-password
```

**Add these lines if missing:**

```env
# SMTP Configuration for OTP Emails
SMTP_SERVER=<institution-smtp-host>
SMTP_PORT=587
# EMAIL_ADDRESS and EMAIL_PASSWORD (already present above) will be used for OTP emails
```

**If using an institutional email account:**

1. Use the SMTP server provided by the institution (do not assume Office365)
2. Keep `EMAIL_ADDRESS` as the sender mailbox used for OTP delivery
3. Use the password or app password required by that mailbox
4. Recipient addresses can be campus emails such as `f20230799@pilani.bits-pilani.ac.in`

---

## Step 3: Update main.py

### Step 3a: Add import at top

In `backend/main.py`, at the top with other imports (around line 1-25):

**Add this line:**

```python
from patient_access_otp.otp_routes import create_otp_routes
```

**Location (example):**

```python
import base64
import os
from tempfile import NamedTemporaryFile
from flask import Flask, request, jsonify
import database  # Import database functions
from database import get_doctors_name
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
import uuid
from database import get_patient_by_id
import pandas as pd
import json
import boto3
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from dotenv import load_dotenv
from datetime import datetime

# NEW: Add this import
from patient_access_otp.otp_routes import create_otp_routes

load_dotenv()
```

### Step 3b: Register OTP Routes after JWT setup

In `backend/main.py`, find where `jwt = JWTManager(app)` is called (around line 33):

**Current Code:**

```python
app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
jwt = JWTManager(app)

@jwt.token_in_blocklist_loader
def check_if_token_is_revoked(jwt_header, jwt_payload):
    jti = jwt_payload["jti"]
    if database.redis_client:
        token_in_redis = database.redis_client.get(f"blocklist_{jti}")
        return token_in_redis is not None
    return False
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})
```

**Change to:**

```python
app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
jwt = JWTManager(app)

@jwt.token_in_blocklist_loader
def check_if_token_is_revoked(jwt_header, jwt_payload):
    jti = jwt_payload["jti"]
    if database.redis_client:
        token_in_redis = database.redis_client.get(f"blocklist_{jti}")
        return token_in_redis is not None
    return False
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

# NEW: Register OTP Patient Access Routes
otp_bp = create_otp_routes(
    db_instance=database.db,
    otps_collection=database.otps,
    sessions_collection=database.access_sessions,
    users_collection=database.users,
    patients_collection=database.patients
)
app.register_blueprint(otp_bp)
```

---

## Step 4: Verify Patient & Doctor Schema

### Ensure Patient documents have these fields:

```python
# Patient schema (in MongoDB)
{
    "institute_id": "PSR123456789",          # Unique ID
    "name": "John Doe",                      # Patient name
    "email": "john@hospital.com",            # REQUIRED for OTP email
    "phone": "9876543210",                   # Optional (for future SMS)
    "doctor_assigned": "dr_smith",           # REQUIRED: Registered doctor username
    "doctor_specialization": "Cardiology",   # REQUIRED: Doctor's specialization
    "visit_history": [                       # Array of visits (should exist)
        {
            "doctor_username": "dr_smith",
            "doctor_specialization": "Cardiology",
            "visit_date": ISODate
        }
    ]
    # ... other fields
}
```

### Ensure Doctor/User documents have these fields:

```python
# User/Doctor schema (in MongoDB)
{
    "username": "dr_smith",                  # Doctor username
    "name": "Dr. Smith",                     # Doctor full name
    "role": "doctor",                        # REQUIRED: "doctor" role
    "email": "dr.smith@hospital.com",        # Doctor email
    "specialization": "Cardiology",          # REQUIRED: Doctor's specialization
    "password_hash": "...",                  # Password hash
    # ... other fields
}
```

---

## Step 5: Test the Integration

### Test 1: Patient Requests OTP

```bash
curl -X POST http://localhost:5000/api/patient-access/request-otp \
  -H "Authorization: Bearer <PATIENT_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "doctor_username": "dr_smith",
    "patient_psr_no": "PSR123456789"
  }'
```

### Test 2: Doctor Verifies OTP

```bash
curl -X POST http://localhost:5000/api/patient-access/verify-otp \
  -H "Authorization: Bearer <DOCTOR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "otp_code": "123456",
    "patient_psr_no": "PSR123456789"
  }'
```

### Test 3: Check Active Session

```bash
curl -X GET http://localhost:5000/api/patient-access/check-doctor-access/PSR123456789 \
  -H "Authorization: Bearer <DOCTOR_JWT_TOKEN>"
```

---

## Step 6: Add Session Verification Middleware

To prevent doctors from accessing patient data without valid OTP session, add this check before serving patient data.

### Option A: Decorator-based (Recommended)

Create a new file `backend/patient_access_otp/decorators.py`:

```python
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity
from otp_database import AccessSessionDatabase

def require_patient_access_session(access_sessions_collection):
    """
    Decorator to verify doctor has valid OTP session before accessing patient data
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            doctor_username = get_jwt_identity()
            patient_psr_no = request.args.get('patient_psr_no') or request.json.get('patient_psr_no')
            session_id = request.headers.get('X-Session-ID')

            if not patient_psr_no:
                return jsonify({"error": "Patient PSR number required"}), 400

            if not session_id:
                return jsonify({"error": "Session ID required in X-Session-ID header"}), 400

            # Verify session
            session = AccessSessionDatabase.get_session_by_id(access_sessions_collection, session_id)
            if not session or session.get("patient_psr_no") != patient_psr_no:
                return jsonify({"error": "Invalid session"}), 401

            if not AccessSessionDatabase.verify_session_valid(access_sessions_collection, session_id):
                return jsonify({"error": "Session expired"}), 401

            return f(*args, **kwargs)

        return decorated_function
    return decorator
```

### Option B: Inline check (Simple alternative)

In your patient data retrieval routes:

```python
@app.route('/doctor/get_patient/<psr_no>', methods=['GET'])
@jwt_required()
def get_patient_by_id_doctor(psr_no):
    doctor_username = get_jwt_identity()
    session_id = request.headers.get('X-Session-ID')

    # Check if doctor has valid OTP session
    from patient_access_otp.otp_database import AccessSessionDatabase
    session = AccessSessionDatabase.get_active_session(
        database.access_sessions,
        psr_no,
        doctor_username
    )

    if not session:
        return jsonify({"error": "No active OTP session. Request OTP to access patient data."}), 401

    # Continue with existing logic
    # ... rest of your code
```

---

## File Structure After Integration

```
HMS/
├── backend/
│   ├── patient_access_otp/          # NEW FOLDER
│   │   ├── __init__.py
│   │   ├── otp_models.py
│   │   ├── otp_service.py
│   │   ├── doctor_verification.py
│   │   ├── otp_database.py
│   │   ├── otp_routes.py
│   │   ├── decorators.py            # OPTIONAL: Middleware
│   │   └── README.md
│   ├── database.py                   # MODIFIED: Add OTP collections & indexes
│   ├── main.py                       # MODIFIED: Import & register OTP routes
│   ├── requirements.txt
│   └── ... (other files)
├── .env                              # MODIFIED: Add SMTP config if missing
└── ... (other folders)
```

---

## Summary of Changes

| File                  | Type       | Change                            |
| --------------------- | ---------- | --------------------------------- |
| `database.py`         | Modified   | Add OTP collections & TTL indexes |
| `main.py`             | Modified   | Import & register OTP routes      |
| `.env`                | Modified   | Add SMTP config (if missing)      |
| `patient_access_otp/` | New Folder | Complete OTP system (5 modules)   |

---

## Next Steps

1. ✅ Create the `patient_access_otp/` folder with all files
2. ⏳ Update `database.py` with collections & indexes
3. ⏳ Update `main.py` with imports & blueprint registration
4. ⏳ Update `.env` with SMTP config
5. ⏳ Restart Flask backend service
6. ⏳ Test API endpoints with provided curl commands
7. ⏳ Add middleware to protect patient data routes
8. ⏳ Frontend: Build OTP request/entry UI

---

## Troubleshooting

### Email not sending?

- Check `.env` EMAIL_ADDRESS and EMAIL_PASSWORD
- Use the SMTP credentials required by your institution’s email service
- Verify SMTP_SERVER and SMTP_PORT are correct

### OTP collections not created?

- Restart Flask backend to run index creation
- Check MongoDB connection in `.env`
- Verify `database.otps` and `database.access_sessions` are accessible

### Routes not working?

- Ensure import path is correct: `from patient_access_otp.otp_routes import create_otp_routes`
- Check Flask app is in correct directory when importing
- Verify JWT tokens are valid and include identity claim

### Doctor verification failing?

- Check `doctor_specialization` field exists in patient document
- Verify `specialization` field in doctor/user document
- Ensure `doctor_assigned` field matches doctor username exactly

---

**Need help?** Refer to `patient_access_otp/README.md` for detailed API documentation and examples.
