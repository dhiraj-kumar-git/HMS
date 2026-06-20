from app.database.core import *

# Function to hash passwords
def hash_password(password):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt)

# Function to check password
def check_password(password, hashed_password):
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password)

# Create a new user (Receptionist, Doctor, Medical Store, Lab Staff, Admin)
def authenticate_user(username, password):
    user = users.find_one({"username": username})
    if user and check_password(password, user["password"].encode('utf-8')):
        return {"username": user["username"], "role": user["role"]}
    return None

# Start a session for a user (supports multiple active logins)
def start_session(username, session_id):
    session_data = {
        "username": username,
        "session_id": session_id,
        "login_time": datetime.now(timezone.utc).isoformat(),
        "active": True
    }
    sessions.insert_one(session_data)

# End a session for a specific user
def end_session(username, session_id, jti=None, exp=None):
    result = sessions.update_one(
        {"username": username, "session_id": session_id, "active": True},
        {"$set": {"active": False, "logout_time": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Blocklist the JWT using redis
    if redis_client and jti and exp:
        # Calculate time remaining on the token
        now = datetime.timestamp(datetime.now(timezone.utc))
        expires_in = int(exp - now)
        if expires_in > 0:
            # We save the JTI with an expiration matching the token's remaining lifespan.
            redis_client.setex(f"blocklist_{jti}", expires_in, "true")
            
    return result.modified_count > 0  # Return True if session was updated


# Register a new patient
