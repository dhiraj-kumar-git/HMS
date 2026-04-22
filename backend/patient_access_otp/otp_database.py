"""
Database operations for OTP and patient access sessions
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from .otp_models import OTPRecord, AccessSession


class OTPDatabase:
    """Database operations for OTP records"""
    
    @staticmethod
    def save_otp_record(db_collection, otp_record: OTPRecord) -> bool:
        """
        Save OTP record to MongoDB
        
        Args:
            db_collection: MongoDB otps collection
            otp_record: OTPRecord instance
        
        Returns:
            True if saved successfully
        """
        try:
            result = db_collection.insert_one(otp_record.to_dict())
            return result.inserted_id is not None
        except Exception as e:
            print(f"Error saving OTP record: {str(e)}")
            return False
    
    @staticmethod
    def get_otp_record(db_collection, otp_code: str, patient_psr_no: str) -> Optional[Dict]:
        """
        Retrieve OTP record by code and patient
        
        Args:
            db_collection: MongoDB otps collection
            otp_code: OTP code
            patient_psr_no: Patient's PSR number
        
        Returns:
            OTP record document or None
        """
        try:
            return db_collection.find_one({
                "otp_code": otp_code,
                "patient_psr_no": patient_psr_no,
                "used": False  # Only get unused OTPs
            })
        except Exception as e:
            print(f"Error retrieving OTP: {str(e)}")
            return None
    
    @staticmethod
    def get_latest_otp_for_patient(db_collection, patient_psr_no: str) -> Optional[Dict]:
        """
        Get latest OTP for a patient (for verification display)
        
        Args:
            db_collection: MongoDB otps collection
            patient_psr_no: Patient's PSR number
        
        Returns:
            Latest OTP record or None
        """
        try:
            return db_collection.find_one(
                {"patient_psr_no": patient_psr_no},
                sort=[("created_at", -1)]
            )
        except Exception as e:
            print(f"Error retrieving latest OTP: {str(e)}")
            return None
    
    @staticmethod
    def mark_otp_as_used(db_collection, otp_id: str, session_id: str = None) -> bool:
        """
        Mark OTP as used after successful verification
        
        Args:
            db_collection: MongoDB otps collection
            otp_id: OTP ID
            session_id: Associated session ID
        
        Returns:
            True if updated successfully
        """
        try:
            update_data = {
                "used": True,
                "used_at": datetime.utcnow(),
                "session_id": session_id
            }
            result = db_collection.update_one(
                {"otp_id": otp_id},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            print(f"Error marking OTP as used: {str(e)}")
            return False
    
    @staticmethod
    def cleanup_expired_otps(db_collection) -> int:
        """
        Delete expired OTPs that haven't been used
        
        Args:
            db_collection: MongoDB otps collection
        
        Returns:
            Number of OTPs deleted
        """
        try:
            result = db_collection.delete_many({
                "expires_at": {"$lt": datetime.utcnow()},
                "used": False
            })
            return result.deleted_count
        except Exception as e:
            print(f"Error cleaning up expired OTPs: {str(e)}")
            return 0


class AccessSessionDatabase:
    """Database operations for access sessions"""
    
    @staticmethod
    def save_access_session(db_collection, session: AccessSession, otp_code: str = None) -> bool:
        """
        Save access session to MongoDB
        
        Args:
            db_collection: MongoDB access_sessions collection
            session: AccessSession instance
            otp_code: OTP code that created this session
        
        Returns:
            True if saved successfully
        """
        try:
            session_dict = session.to_dict()
            session_dict["otp_used"] = otp_code
            result = db_collection.insert_one(session_dict)
            return result.inserted_id is not None
        except Exception as e:
            print(f"Error saving access session: {str(e)}")
            return False
    
    @staticmethod
    def get_active_session(
        db_collection,
        patient_psr_no: str,
        doctor_username: str
    ) -> Optional[Dict]:
        """
        Get active session for doctor accessing patient
        
        Args:
            db_collection: MongoDB access_sessions collection
            patient_psr_no: Patient's PSR number
            doctor_username: Doctor's username
        
        Returns:
            Active session or None
        """
        try:
            return db_collection.find_one({
                "patient_psr_no": patient_psr_no,
                "doctor_username": doctor_username,
                "is_active": True,
                "session_expires_at": {"$gt": datetime.utcnow()}
            })
        except Exception as e:
            print(f"Error retrieving active session: {str(e)}")
            return None
    
    @staticmethod
    def verify_session_valid(db_collection, session_id: str) -> bool:
        """
        Verify if a session is currently valid
        
        Args:
            db_collection: MongoDB access_sessions collection
            session_id: Session ID to verify
        
        Returns:
            True if session is valid and not expired
        """
        try:
            session = db_collection.find_one({
                "session_id": session_id,
                "is_active": True,
                "session_expires_at": {"$gt": datetime.utcnow()}
            })
            return session is not None
        except Exception as e:
            print(f"Error verifying session: {str(e)}")
            return False
    
    @staticmethod
    def get_session_by_id(db_collection, session_id: str) -> Optional[Dict]:
        """
        Get session details by session ID
        
        Args:
            db_collection: MongoDB access_sessions collection
            session_id: Session ID
        
        Returns:
            Session document or None
        """
        try:
            return db_collection.find_one({"session_id": session_id})
        except Exception as e:
            print(f"Error retrieving session: {str(e)}")
            return None
    
    @staticmethod
    def cleanup_expired_sessions(db_collection) -> int:
        """
        Deactivate expired sessions
        
        Args:
            db_collection: MongoDB access_sessions collection
        
        Returns:
            Number of sessions deactivated
        """
        try:
            result = db_collection.update_many(
                {
                    "session_expires_at": {"$lt": datetime.utcnow()},
                    "is_active": True
                },
                {"$set": {"is_active": False}}
            )
            return result.modified_count
        except Exception as e:
            print(f"Error expiring sessions: {str(e)}")
            return 0
    
    @staticmethod
    def get_doctor_access_history(
        db_collection,
        doctor_username: str,
        limit: int = 50
    ) -> List[Dict]:
        """
        Get doctor's recent access history (for audit)
        
        Args:
            db_collection: MongoDB access_sessions collection
            doctor_username: Doctor's username
            limit: Maximum number of records
        
        Returns:
            List of sessions
        """
        try:
            return list(db_collection.find(
                {"doctor_username": doctor_username},
                sort=[("session_created_at", -1)],
                limit=limit
            ))
        except Exception as e:
            print(f"Error retrieving access history: {str(e)}")
            return []
