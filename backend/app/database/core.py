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
leaves = db.leaves # Collection for storing doctor leave dates

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
