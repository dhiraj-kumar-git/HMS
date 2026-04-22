"""
OTP Service - Generate OTPs, send via email, and manage validation
"""

import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import os
from dotenv import load_dotenv
from typing import Tuple, Optional
import sys

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
ALLOWED_PATIENT_EMAIL_DOMAIN = "pilani.bits-pilani.ac.in"


class OTPService:
    """Service for OTP generation, sending, and validation"""

    @staticmethod
    def is_allowed_patient_email(patient_email: str) -> bool:
        """Allow OTP delivery only to the configured campus domain."""
        if not patient_email or "@" not in patient_email:
            return False
        domain = patient_email.strip().lower().split("@")[-1]
        return domain == ALLOWED_PATIENT_EMAIL_DOMAIN
    
    @staticmethod
    def generate_otp(length: int = 6) -> str:
        """
        Generate a random 6-digit OTP
        
        Args:
            length: Length of OTP (default: 6)
        
        Returns:
            OTP code as string
        """
        return ''.join(random.choices(string.digits, k=length))
    
    @staticmethod
    def send_otp_email(
        patient_email: str,
        patient_name: str,
        otp_code: str,
        doctor_name: str = None,
        is_registered_doctor: bool = True
    ) -> Tuple[bool, str]:
        """
        Send OTP via email to patient
        
        Args:
            patient_email: Patient's email address
            patient_name: Patient's full name
            otp_code: 6-digit OTP
            doctor_name: Name of doctor requesting access
            is_registered_doctor: Whether doctor is registered with patient
        
        Returns:
            Tuple of (success: bool, message: str)
        """
        if not OTPService.is_allowed_patient_email(patient_email):
            return False, f"Patient email domain not allowed. Use @{ALLOWED_PATIENT_EMAIL_DOMAIN} only."

        if not SMTP_SERVER or not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            return False, "Email service not configured in .env"
        
        try:
            # Create email content
            subject = "Your OTP for Doctor Access Request - HMS"
            
            if is_registered_doctor:
                access_type = f"your registered doctor {doctor_name}" if doctor_name else "your registered doctor"
            else:
                access_type = f"an attending doctor ({doctor_name})" if doctor_name else "an attending doctor"
            
            body = f"""
Dear {patient_name},

A doctor has requested access to your medical records in the Hospital Management System (HMS).

Access Request Details:
- Doctor: {access_type}
- Your OTP: {otp_code}
- Valid for: 30 minutes from request time
- Access Expires: After 30 minutes (request new OTP for extended access)

IMPORTANT SECURITY INFORMATION:
1. Never share this OTP with anyone
2. This OTP is valid for ONE 30-minute session
3. If you don't recognize this access request, contact the hospital immediately
4. Each new OTP must be approved by you and gives a fresh 30-minute session

How to use this OTP:
1. Go to HMS patient portal
2. Provide doctor's username (or name)
3. Enter this OTP: {otp_code}
4. Doctor will then have access to your records for 30 minutes

After the 30-minute period, the doctor must request a new OTP if continued access is needed.

Best regards,
Hospital Management System (HMS)
"""
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = EMAIL_ADDRESS
            msg['To'] = patient_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            
            # Send email
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(msg)
            server.quit()
            
            return True, f"OTP sent successfully to {patient_email}"
        
        except smtplib.SMTPAuthenticationError:
            return False, "Email authentication failed. Check EMAIL_ADDRESS and EMAIL_PASSWORD in .env"
        except smtplib.SMTPException as e:
            return False, f"SMTP error occurred: {str(e)}"
        except Exception as e:
            return False, f"Error sending email: {str(e)}"
    
    @staticmethod
    def validate_otp(
        otp_record: dict,
        provided_otp: str
    ) -> Tuple[bool, str]:
        """
        Validate provided OTP against stored OTP record
        
        Args:
            otp_record: OTP record from database
            provided_otp: OTP code provided by user
        
        Returns:
            Tuple of (is_valid: bool, message: str)
        """
        # Check if OTP exists
        if not otp_record:
            return False, "OTP not found. Please request a new OTP."
        
        # Check if already used
        if otp_record.get("used"):
            return False, "This OTP has already been used. Please request a new OTP."
        
        # Check if expired
        expires_at = otp_record.get("expires_at")
        if expires_at and datetime.utcnow() > expires_at:
            return False, "OTP has expired. Please request a new OTP."
        
        # Check OTP code
        if str(otp_record.get("otp_code")) != str(provided_otp):
            return False, "Invalid OTP code. Please check and try again."
        
        return True, "OTP validated successfully"
