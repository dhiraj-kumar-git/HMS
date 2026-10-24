from datetime import datetime, date, timezone, timedelta, timezone
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
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
leaves = db.leaves # Collection for storing doctor leave dates
lab_view_access = db.lab_view_access # Short-lived records: admin windows for viewing lab results, and failed password attempts
counters = db.counters # Atomic sequence counters (OPD / UHID numbers)

def next_sequence(name):
    """Atomically increment and return the named counter; None if the counter store is unavailable."""
    try:
        doc = counters.find_one_and_update(
            {"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
        )
        seq = doc.get("seq") if isinstance(doc, dict) else None
        return seq if isinstance(seq, int) else None
    except Exception:
        return None

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
    leaves.create_index([("doctor_username", 1), ("start_date", 1), ("end_date", 1)])
except Exception as e:
    print(f"Error creating indexes: {e}")

# Invoice numbers must be unique; kept separate so legacy duplicate data cannot block the indexes above
try:
    bills.create_index("invoice_no", unique=True)
except Exception as e:
    print(f"Error creating invoice_no unique index (resolve duplicate invoice numbers, then restart): {e}")

# Records in lab_view_access delete themselves when expires_at passes
try:
    lab_view_access.create_index("expires_at", expireAfterSeconds=0)
    lab_view_access.create_index([("kind", 1), ("username", 1)])
except Exception as e:
    print(f"Error creating lab_view_access indexes: {e}")

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
