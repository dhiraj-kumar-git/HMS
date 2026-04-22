"""
Doctor Verification - Verify doctor identity based on registration and specialization
"""

from typing import Tuple, Optional, Dict, Any


class DoctorVerification:
    """Verify doctor identity for patient access"""

    @staticmethod
    def _normalize(value: str) -> str:
        if not value:
            return ""
        return str(value).strip().lower()

    @staticmethod
    def _doctor_map(all_doctors: list) -> dict:
        doctor_map = {}
        for doctor in all_doctors or []:
            username = DoctorVerification._normalize(doctor.get("username"))
            if username:
                doctor_map[username] = doctor
        return doctor_map
    
    @staticmethod
    def verify_doctor_for_patient(
        patient_doc: dict,
        requesting_doctor_username: str,
        doctor_record: dict,
        all_doctors: list = None
    ) -> Tuple[bool, str, Optional[str], Optional[str]]:
        """
        Verify if a doctor can access a patient's records based on:
        1. Is doctor the registered/assigned doctor? → Allow
        2. Is doctor not available but has matching specialization? → Allow
        3. Is doctor attending the patient? → Verify specialization match
        4. Otherwise → Deny
        
        Args:
            patient_doc: Patient document from MongoDB
            requesting_doctor_username: Username of doctor requesting access
            doctor_record: Doctor's profile document
            all_doctors: List of all doctors (for specialization matching)
        
        Returns:
            Tuple of:
            - is_authorized: bool (True if doctor can access)
            - message: str (Reason for approval/denial)
            - doctor_specialization: str or None (Doctor's specialization if approved)
            - access_reason: str (e.g., "registered_doctor", "attending_doctor_specialization_match")
        """
        
        if not patient_doc:
            return False, "Patient not found", None, None
        
        doctor_map = DoctorVerification._doctor_map(all_doctors)
        requesting_username = DoctorVerification._normalize(requesting_doctor_username)
        requesting_doctor_record = doctor_map.get(requesting_username, doctor_record or {})

        if not requesting_doctor_record:
            return False, "Doctor profile not found", None, None
        
        # Extract doctor's specialization
        doctor_specialization = DoctorVerification._normalize(requesting_doctor_record.get("specialization", ""))
        if not doctor_specialization:
            return False, "Doctor's specialization not set in profile", None, None
        
        # Get patient's registered doctor(s) and specialization requirements
        registered_doctor = DoctorVerification._normalize(patient_doc.get("doctor_assigned", ""))
        visit_history = patient_doc.get("visit_history", [])

        registered_doctor_record = doctor_map.get(registered_doctor) if registered_doctor else None
        registered_doctor_specialization = DoctorVerification._normalize(
            (registered_doctor_record or {}).get("specialization") or patient_doc.get("doctor_specialization", "")
        )
        
        # STEP 1: Check if requesting doctor is the registered doctor
        if registered_doctor and requesting_username == registered_doctor:
            return (
                True,
                f"Access approved as registered doctor",
                doctor_specialization,
                "registered_doctor"
            )
        
        # STEP 2: If registered doctor is assigned but not available, check specialization match
        if registered_doctor and requesting_username != registered_doctor:
            if registered_doctor_specialization and doctor_specialization == registered_doctor_specialization:
                return (
                    True,
                    f"Access approved - requesting doctor has same specialization ({doctor_specialization}) as assigned doctor from database",
                    doctor_specialization,
                    "attending_doctor_specialization_match"
                )
        
        # STEP 3: Check if doctor is currently attending the patient (in visit_history)
        doctor_attending = False
        if visit_history:
            # Check if this doctor has recent or active visits
            for visit in visit_history[-5:]:  # Check last 5 visits
                if DoctorVerification._normalize(visit.get("doctor_username", "")) == requesting_username:
                    doctor_attending = True
                    visit_doc_specialization = DoctorVerification._normalize(visit.get("doctor_specialization", ""))
                    
                    # If attending doctor has matching specialization with registered doctor
                    if registered_doctor_specialization and doctor_specialization == registered_doctor_specialization:
                        return (
                            True,
                            f"Access approved - attending doctor has matching specialization ({doctor_specialization}) from database",
                            doctor_specialization,
                            "attending_doctor_specialization_match"
                        )
                    break
        
        # STEP 4: If no conditions met, deny access
        return (
            False,
            f"Access denied - doctor is not registered or attending with matching specialization. "
            f"Registered doctor: {registered_doctor or 'Not assigned'}, "
            f"Doctor specialization required: {registered_doctor_specialization or 'Not set'}",
            None,
            None
        )
    
    @staticmethod
    def get_verification_summary(
        is_authorized: bool,
        message: str,
        doctor_username: str,
        doctor_specialization: str = None,
        access_reason: str = None
    ) -> Dict[str, Any]:
        """
        Create a summary of doctor verification for logging/response
        
        Args:
            is_authorized: Whether doctor is authorized
            message: Verification message
            doctor_username: Doctor's username
            doctor_specialization: Doctor's specialization
            access_reason: Reason for access grant/deny
        
        Returns:
            Dictionary with verification summary
        """
        return {
            "is_authorized": is_authorized,
            "message": message,
            "doctor_username": doctor_username,
            "doctor_specialization": doctor_specialization,
            "access_reason": access_reason,
            "verified_at": None  # Will be set when verification is complete
        }
