"""
Database Models for OTP-based patient access control
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import uuid


class OTPRecord:
    """
    Represents an OTP (One-Time Password) record for patient data access.
    
    Fields:
        otp_id: Unique identifier for this OTP record
        patient_psr_no: Patient's PSR/Institute ID
        otp_code: 6-digit OTP
        created_at: When OTP was generated
        expires_at: When OTP expires (30 minutes from creation)
        used: Whether this OTP has been used for creating a session
        used_at: When this OTP was used
        doctor_username: Doctor who will access patient data
        doctor_specialization: Doctor's specialization (from registration)
        requested_by_doctor: Doctor who requested access
        session_id: Associated session ID (created after OTP validation)
        patient_email: Patient's email (for sending OTP)
        is_valid: Whether OTP is still valid (not expired, not used)
    """
    
    def __init__(
        self,
        patient_psr_no: str,
        otp_code: str,
        patient_email: str,
        doctor_username: str = None,
        doctor_specialization: str = None,
        requested_by_doctor: str = None
    ):
        self.otp_id = str(uuid.uuid4())
        self.patient_psr_no = patient_psr_no
        self.otp_code = otp_code
        self.created_at = datetime.utcnow()
        self.expires_at = self.created_at + timedelta(minutes=30)
        self.used = False
        self.used_at = None
        self.doctor_username = doctor_username
        self.doctor_specialization = doctor_specialization
        self.requested_by_doctor = requested_by_doctor
        self.session_id = None
        self.patient_email = patient_email
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert OTP record to dictionary for MongoDB storage"""
        return {
            "otp_id": self.otp_id,
            "patient_psr_no": self.patient_psr_no,
            "otp_code": self.otp_code,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "used": self.used,
            "used_at": self.used_at,
            "doctor_username": self.doctor_username,
            "doctor_specialization": self.doctor_specialization,
            "requested_by_doctor": self.requested_by_doctor,
            "session_id": self.session_id,
            "patient_email": self.patient_email,
        }
    
    def is_expired(self) -> bool:
        """Check if OTP has expired"""
        return datetime.utcnow() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if OTP is still valid (not expired and not used)"""
        return not self.is_expired() and not self.used


class AccessSession:
    """
    Represents a verified patient access session for a doctor.
    
    Fields:
        session_id: Unique identifier
        patient_psr_no: Patient's PSR/Institute ID
        doctor_username: Doctor accessing patient data
        doctor_specialization: Doctor's confirmed specialization
        session_created_at: When session was created (after OTP verification)
        session_expires_at: When session expires (30 minutes from creation)
        otp_used: The OTP code that created this session
        is_active: Whether session is currently active
        access_granted_by_system: Reason for access (e.g., "registered_doctor" or "attending_doctor_specialization_match")
    """
    
    def __init__(
        self,
        patient_psr_no: str,
        doctor_username: str,
        doctor_specialization: str,
        access_reason: str = "otp_verified"
    ):
        self.session_id = str(uuid.uuid4())
        self.patient_psr_no = patient_psr_no
        self.doctor_username = doctor_username
        self.doctor_specialization = doctor_specialization
        self.session_created_at = datetime.utcnow()
        self.session_expires_at = self.session_created_at + timedelta(minutes=30)
        self.otp_used = None
        self.is_active = True
        self.access_granted_by_system = access_reason
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert session to dictionary for MongoDB storage"""
        return {
            "session_id": self.session_id,
            "patient_psr_no": self.patient_psr_no,
            "doctor_username": self.doctor_username,
            "doctor_specialization": self.doctor_specialization,
            "session_created_at": self.session_created_at,
            "session_expires_at": self.session_expires_at,
            "otp_used": self.otp_used,
            "is_active": self.is_active,
            "access_granted_by_system": self.access_granted_by_system,
        }
    
    def is_expired(self) -> bool:
        """Check if session has expired"""
        return datetime.utcnow() > self.session_expires_at
    
    def is_valid(self) -> bool:
        """Check if session is valid (active and not expired)"""
        return self.is_active and not self.is_expired()
