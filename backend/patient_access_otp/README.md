# Patient Access OTP System

Secure OTP-based patient data access control with time-limited sessions (30 minutes) for doctors.

## Overview

This module implements a complete OTP-based access control system where:

1. **Patient initiates**: Patient requests OTP for a specific doctor
2. **Doctor verifies identity**: Must be registered doctor OR attending doctor with matching specialization
3. **OTP sent to patient**: Via the patient’s registered email address (30-minute validity)
4. **Doctor uses OTP**: Creates time-limited session (30 minutes)
5. **Doctor limited access**: Can access patient records only during session
6. **Auto-expiry**: After 30 minutes, doctor must request new OTP for continued access

## Security Features

- ✅ **Doctor Identity Verification**: Matches registered doctor or same specialization
- ✅ **One-Time OTP**: Each OTP can be used only once
- ✅ **Time Window**: All sessions expire after 30 minutes
- ✅ **Email Audit Trail**: OTP sent via email to patient
- ✅ **Session Tracking**: All access logged for audit purposes
- ✅ **Graceful Fallback**: If registered doctor unavailable, allows attending doctors with same specialization

## Module Structure

```
patient_access_otp/
├── otp_models.py              # Data models for OTP and sessions
├── otp_service.py             # OTP generation and email service
├── doctor_verification.py     # Doctor authorization logic
├── otp_database.py            # MongoDB operations
├── otp_routes.py              # Flask API routes
└── README.md                  # This file
```

## Files Description

### otp_models.py

- `OTPRecord`: Represents an OTP with patient/doctor info, timestamps, usage status
- `AccessSession`: Represents a verified access session valid for 30 minutes

### otp_service.py

- `OTPService.generate_otp()`: Creates random 6-digit OTP
- `OTPService.send_otp_email()`: Sends OTP via email with context
- `OTPService.validate_otp()`: Validates OTP against stored record

### doctor_verification.py

- `DoctorVerification.verify_doctor_for_patient()`: Checks if doctor is authorized
  - ✅ Registered doctor → Allow
  - ✅ Attending doctor with matching specialization → Allow
  - ❌ Other doctors → Deny

### otp_database.py

- `OTPDatabase`: Save, retrieve, validate OTP records
- `AccessSessionDatabase`: Manage access sessions and audit trails

### otp_routes.py

Contains all Flask API endpoints:

- `/api/patient-access/request-otp` [POST] - Patient requests OTP
- `/api/patient-access/verify-otp` [POST] - Doctor verifies OTP
- `/api/patient-access/verify-session/<session_id>` [GET] - Check session validity
- `/api/patient-access/check-doctor-access/<patient_psr_no>` [GET] - Doctor checks own access
- `/api/patient-access/doctor/<doctor_username>/access-history` [GET] - Access audit

## Integration Steps

### 1. Update MongoDB Collections

Add these indexes to your MongoDB database setup (in `database.py`):

```python
# In database.py, add to the index creation section:

otps = db.otps
access_sessions = db.access_sessions

# Create indexes
otps.create_index("otp_id", unique=True)
otps.create_index("patient_psr_no")
otps.create_index("expires_at", expireAfterSeconds=1800)  # TTL: 30 min
otps.create_index([("created_at", 1)], expireAfterSeconds=1800)

access_sessions.create_index("session_id", unique=True)
access_sessions.create_index("patient_psr_no")
access_sessions.create_index("doctor_username")
access_sessions.create_index([("session_expires_at", 1)], expireAfterSeconds=1800)  # TTL: 30 min
```

### 2. Update main.py

Add these imports at the top of `main.py`:

```python
from patient_access_otp.otp_routes import create_otp_routes
```

Register the OTP routes after Flask app creation:

```python
# After: app = Flask(__name__)
# And after: jwt = JWTManager(app)

# Register OTP routes
otp_bp = create_otp_routes(
    db_instance=db,
    otps_collection=db.otps,
    sessions_collection=db.access_sessions,
    users_collection=users,
    patients_collection=patients
)
app.register_blueprint(otp_bp)
```

### 3. Update .env File

Ensure these email configuration variables are set:

```env
# Email Configuration
SMTP_SERVER=<institution-smtp-host>
SMTP_PORT=587
EMAIL_ADDRESS=f20230799@pilani.bits-pilani.ac.in
EMAIL_PASSWORD=your-email-password
```

**For institute email accounts:**

1. Use the SMTP server provided by your institution IT team
2. Set `EMAIL_ADDRESS` to the sender mailbox used for OTP delivery
3. Set `EMAIL_PASSWORD` to the SMTP password or app password required by that mailbox
4. Patient recipient emails can be campus addresses like `f20230799@pilani.bits-pilani.ac.in`

### 4. Update Patient Schema

Ensure patient documents have these fields (likely already present):

```python
{
    "institute_id": "PSR123456789",
    "name": "John Doe",
    "email": "john@hospital.com",
    "phone": "9876543210",
    "doctor_assigned": "dr_smith",           # Registered doctor
    "doctor_specialization": "Cardiology",   # Required specialization
    "visit_history": [                       # Array of visits
        {
            "doctor_username": "dr_smith",
            "doctor_specialization": "Cardiology"
        }
    ]
}
```

### 5. Update Doctor Schema

Ensure doctor/user documents have:

```python
{
    "username": "dr_smith",
    "name": "Dr. Smith",
    "role": "doctor",
    "specialization": "Cardiology",
    "email": "dr.smith@hospital.com"
}
```

## API Usage Examples

### 1. Patient Requests OTP

**Endpoint**: `POST /api/patient-access/request-otp`

```bash
curl -X POST http://localhost:5000/api/patient-access/request-otp \
  -H "Authorization: Bearer <PATIENT_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "doctor_username": "dr_smith",
    "patient_psr_no": "PSR123456789"
  }'
```

**Success Response (200)**:

```json
{
  "success": true,
  "message": "OTP sent to john@hospital.com",
  "otp_id": "550e8400-e29b-41d4-a716-446655440000",
  "expires_in_minutes": 30
}
```

**Error Response (403)**:

```json
{
  "success": false,
  "error": "Doctor not authorized to access this patient's records",
  "detail": "Access denied - doctor is not registered or attending..."
}
```

### 2. Doctor Verifies OTP

**Endpoint**: `POST /api/patient-access/verify-otp`

```bash
curl -X POST http://localhost:5000/api/patient-access/verify-otp \
  -H "Authorization: Bearer <DOCTOR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "otp_code": "123456",
    "patient_psr_no": "PSR123456789"
  }'
```

**Success Response (200)**:

```json
{
  "success": true,
  "message": "Access granted for 30 minutes (registered_doctor)",
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "access_reason": "registered_doctor",
  "expires_at": "2026-04-22T15:30:00Z",
  "patient_psr_no": "PSR123456789"
}
```

**Error Response (401)**:

```json
{
  "success": false,
  "error": "This OTP has already been used. Please request a new OTP."
}
```

### 3. Doctor Checks Current Access

**Endpoint**: `GET /api/patient-access/check-doctor-access/<patient_psr_no>`

```bash
curl -X GET http://localhost:5000/api/patient-access/check-doctor-access/PSR123456789 \
  -H "Authorization: Bearer <DOCTOR_JWT_TOKEN>"
```

**Active Session Response (200)**:

```json
{
  "has_access": true,
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "access_reason": "registered_doctor",
  "time_remaining_minutes": 25.3,
  "expires_at": "2026-04-22T15:30:00Z"
}
```

**No Session Response (401)**:

```json
{
  "has_access": false,
  "message": "No active session. Request OTP for access."
}
```

### 4. Verify Session Validity

**Endpoint**: `GET /api/patient-access/verify-session/<session_id>`

```bash
curl -X GET http://localhost:5000/api/patient-access/verify-session/660e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

**Valid Response (200)**:

```json
{
  "valid": true,
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "patient_psr_no": "PSR123456789",
  "doctor_username": "dr_smith",
  "access_reason": "registered_doctor",
  "expires_at": "2026-04-22T15:30:00Z",
  "time_remaining_minutes": 24.7
}
```

### 5. Get Doctor's Access History (Audit)

**Endpoint**: `GET /api/patient-access/doctor/<doctor_username>/access-history?limit=50`

```bash
curl -X GET "http://localhost:5000/api/patient-access/doctor/dr_smith/access-history?limit=20" \
  -H "Authorization: Bearer <DOCTOR_JWT_TOKEN>"
```

**Response (200)**:

```json
{
  "success": true,
  "doctor_username": "dr_smith",
  "total_records": 3,
  "history": [
    {
      "session_id": "660e8400-e29b-41d4-a716-446655440001",
      "patient_psr_no": "PSR123456789",
      "access_reason": "registered_doctor",
      "created_at": "2026-04-22T15:00:00Z",
      "expires_at": "2026-04-22T15:30:00Z",
      "is_active": true
    }
  ]
}
```

## Doctor Verification Logic

### Scenario 1: Registered Doctor (Direct Access)

```
Patient registered with: Dr. Smith (Cardiology)
Requesting doctor: Dr. Smith
Result: ✅ APPROVED - "registered_doctor"
```

### Scenario 2: Registered Doctor Unavailable

```
Patient registered with: Dr. Smith (Cardiology) - NOT AVAILABLE
Requesting doctor: Dr. Jones (Cardiology)
Result: ✅ APPROVED - "attending_doctor_specialization_match"
```

### Scenario 3: Different Specialization

```
Patient registered with: Dr. Smith (Cardiology)
Requesting doctor: Dr. Brown (Neurology)
Result: ❌ DENIED - Specialization mismatch
```

### Scenario 4: Attending but Different Specialization

```
Patient currently with: Dr. Wilson (Neurology)
Patient registered with: Dr. Smith (Cardiology)
Requesting doctor: Dr. Wilson (Neurology)
Result: ❌ DENIED - Attending but no specialization match
```

## Database Collections

### otps Collection

```json
{
  "_id": ObjectId,
  "otp_id": "uuid",
  "patient_psr_no": "PSR123456789",
  "otp_code": "123456",
  "created_at": ISODate,
  "expires_at": ISODate,
  "used": false,
  "used_at": null,
  "doctor_username": "dr_smith",
  "doctor_specialization": "Cardiology",
  "requested_by_doctor": "patient_dr_smith",
  "session_id": null,
  "patient_email": "john@hospital.com"
}
```

### access_sessions Collection

```json
{
  "_id": ObjectId,
  "session_id": "uuid",
  "patient_psr_no": "PSR123456789",
  "doctor_username": "dr_smith",
  "doctor_specialization": "Cardiology",
  "session_created_at": ISODate,
  "session_expires_at": ISODate,
  "otp_used": "123456",
  "is_active": true,
  "access_granted_by_system": "registered_doctor"
}
```

## Workflow Flow

```
1. Patient → Request OTP
   ↓
2. System → Verify doctor authorization
   - Is doctor registered? → YES → Approve
   - Is doctor attending with same specialization? → YES → Approve
   - Otherwise → DENY
   ↓
3. System → Generate 6-digit OTP
   ↓
4. Email → Send OTP to patient (30-min validity)
   ↓
5. Doctor → Enter OTP
   ↓
6. System → Verify OTP (not expired, not used)
   ↓
7. System → Create access session (30-min validity)
   ↓
8. Doctor → Can now access patient records
   ↓
9. After 30 min → Session expires, doctor must request new OTP
```

## Next Steps (Integration)

1. ✅ Create this folder structure
2. ⏳ Update MongoDB collections with TTL indexes
3. ⏳ Import and register routes in `main.py`
4. ⏳ Test endpoints with Postman/curl
5. ⏳ Add frontend UI for OTP request/entry
6. ⏳ Add middleware to verify sessions before accessing patient data
7. ⏳ Set up audit logging for compliance

## Notes

- OTPs auto-delete after 30 minutes (TTL index)
- Sessions auto-expire after 30 minutes (TTL index)
- Each session gives full access to all patient data for 30 minutes
- Doctor must re-verify every 30 minutes for continued access
- All access is logged for audit and compliance purposes
- Recipient addresses are the patient’s registered institutional email, such as `f20230799@pilani.bits-pilani.ac.in`
