from app.database.core import *
from app.database.auth import hash_password

def create_user(username, password, role, display_name, department=None, schedule=None):
    existing_user = users.find_one({"username": username})
    if not existing_user:
        hashed_password = hash_password(password)
        
        if display_name:
            display_name = display_name.title()
            
        user = User(
            username=username,
            password=hashed_password.decode('utf-8'),
            role=role,
            display_name=display_name or username,  # fallback to username
            department=department,
            schedule=schedule or []
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
    docs = list(users.find({"role": "doctor"}, {"_id": 0, "password": 0}))
    # Ensure legacy records always have schedule and department keys
    for d in docs:
        if "schedule" not in d:
            d["schedule"] = []
        if "department" not in d or d["department"] is None:
            d["department"] = ""
    return docs

# Update a doctor's schedule dynamically
def update_doctor_schedule(username, schedule_list):
    result = users.update_one(
        {"username": username, "role": "doctor"},
        {"$set": {"schedule": schedule_list}}
    )
    return result.matched_count > 0

# Get all patients (Admin only)

def get_doctors_name():

    for d in db.users.find({"role": "doctor"}):
        print(d)

    doctors = db.users.find({"role": "doctor"})
    return {d["username"]: d.get("display_name", d["username"]) for d in doctors}

import hashlib


def add_dummy_users():
    dummy_users = [
        {"username": "receptionist1", "password": "test123", "role": "receptionist", "display_name": "Receptionist 1"},
        {"username": "doctor1", "password": "test123", "role": "doctor", "display_name": "Dr. Doctor Name", "department":"Sample","schedule":[{"duty_days":["Wednesday"],"start_time":"06:00 PM","end_time":"07:00 PM"},{"duty_days":["Friday"],"start_time":"08:00 PM","end_time":"09:00 PM"}]},
        {"username": "medical_store1", "password": "test123", "role": "medical_store", "display_name": "Medical Store"},
        {"username": "lab_staff1", "password": "test123", "role": "lab_staff", "display_name": "Lab Staff"},
        {"username": "admin1", "password": "test123", "role": "admin", "display_name": "Admin"},
    ]

    for user in dummy_users:
        # Generate the frontend-equivalent SHA256 hash first
        sha256_pwd = hashlib.sha256(user["password"].encode('utf-8')).hexdigest()
        if not create_user(user["username"], sha256_pwd, user["role"], user.get("display_name"), user.get("department"), user.get("schedule", [])):
            print(f"User {user['username']} already exists.")
        else:
            print(f"User {user['username']} created successfully.")

import json

