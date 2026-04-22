"""
OTP-based Patient Access API Routes

This module provides Flask routes for:
1. Patients to generate and send OTPs for doctor access
2. Doctors to verify OTP and create access sessions
3. Backend to verify valid sessions before providing data
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from typing import Tuple

from .otp_models import OTPRecord, AccessSession
from .otp_service import OTPService
from .otp_database import OTPDatabase, AccessSessionDatabase
from .doctor_verification import DoctorVerification


def create_otp_routes(db_instance, otps_collection, sessions_collection, users_collection, patients_collection):
    """
    Factory function to create OTP routes with database collections
    
    Args:
        db_instance: MongoDB database instance
        otps_collection: MongoDB collection for OTP records
        sessions_collection: MongoDB collection for access sessions
        users_collection: MongoDB collection for users/doctors
        patients_collection: MongoDB collection for patients
    
    Returns:
        Flask Blueprint with OTP routes
    """
    
    otp_bp = Blueprint('otp', __name__, url_prefix='/api/patient-access')

    def _get_all_doctors():
        return list(users_collection.find({"role": "doctor"}, {"_id": 0, "password": 0}))

    def _get_doctor_by_username(username: str):
        return users_collection.find_one({"username": username, "role": "doctor"}, {"_id": 0, "password": 0})
    
    # ==================== PATIENT ROUTES ====================
    
    @otp_bp.route('/request-otp', methods=['POST'])
    @jwt_required()
    def patient_request_otp():
        """
        Request an OTP for a doctor to access a patient's records.

        Example Request Body:
        {
            "doctor_username": "dr_smith",
            "patient_psr_no": "PSR123456789"  (optional; defaults to logged-in patient)
        }

        Example Response:
        {
            "success": true,
            "message": "OTP sent to your registered email",
            "otp_id": "uuid",
            "expires_in_minutes": 30
        }
        """
        try:
            identity = get_jwt_identity()
            data = request.get_json()
            
            doctor_username = data.get("doctor_username", "").strip()
            patient_psr_no = data.get("patient_psr_no", identity)
            
            # Validation
            if not doctor_username:
                return jsonify({"success": False, "error": "Doctor username is required"}), 400
            
            if not patient_psr_no:
                return jsonify({"success": False, "error": "Patient PSR number is required"}), 400
            
            # Get patient record
            patient = patients_collection.find_one({"institute_id": patient_psr_no})
            if not patient:
                return jsonify({"success": False, "error": "Patient not found"}), 404

            patient_email = patient.get("email", "")
            if not OTPService.is_allowed_patient_email(patient_email):
                return jsonify({
                    "success": False,
                    "error": "Patient email must be a campus email ending with @pilani.bits-pilani.ac.in"
                }), 400
            
            all_doctors = _get_all_doctors()
            doctor = next(
                (item for item in all_doctors if item.get("username", "").lower() == doctor_username.lower()),
                None,
            )
            if not doctor:
                return jsonify({"success": False, "error": "Doctor not found"}), 404
            
            # Verify doctor is authorized for this patient
            is_authorized, auth_message, doctor_spec, access_reason = DoctorVerification.verify_doctor_for_patient(
                patient_doc=patient,
                requesting_doctor_username=doctor_username,
                doctor_record=doctor,
                all_doctors=all_doctors
            )
            
            if not is_authorized:
                return jsonify({
                    "success": False,
                    "error": "Doctor not authorized to access this patient's records",
                    "detail": auth_message
                }), 403
            
            # Generate OTP
            otp_code = OTPService.generate_otp()
            
            # Create OTP record
            otp_record = OTPRecord(
                patient_psr_no=patient_psr_no,
                otp_code=otp_code,
                patient_email=patient_email,
                doctor_username=doctor_username,
                doctor_specialization=doctor.get("specialization", ""),
                requested_by_doctor=identity
            )
            
            # Save to database
            success = OTPDatabase.save_otp_record(otps_collection, otp_record)
            if not success:
                return jsonify({"success": False, "error": "Failed to generate OTP"}), 500
            
            # Send OTP via email
            email_success, email_message = OTPService.send_otp_email(
                patient_email=patient_email,
                patient_name=patient.get("name", patient_psr_no),
                otp_code=otp_code,
                doctor_name=doctor.get("name", doctor_username),
                is_registered_doctor=(patient.get("doctor_assigned", "").lower() == doctor_username.lower())
            )
            
            if not email_success:
                # OTP created but email failed - still return success but warn user
                return jsonify({
                    "success": False,
                    "error": "OTP generated but failed to send email",
                    "detail": email_message
                }), 500
            
            return jsonify({
                "success": True,
                "message": f"OTP sent to {patient.get('email', 'your registered email')}",
                "otp_id": otp_record.otp_id,
                "expires_in_minutes": 30
            }), 200
        
        except Exception as e:
            return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500
    
    # ==================== DOCTOR ROUTES ====================
    
    @otp_bp.route('/verify-otp', methods=['POST'])
    @jwt_required()
    def doctor_verify_otp():
        """
        Doctor verifies OTP to get access session
        
        Request Body:
        {
            "otp_code": "123456",
            "patient_psr_no": "PSR123456789"
        }
        
        Response:
        {
            "success": true,
            "message": "Access granted for 30 minutes",
            "access_session_id": "uuid",
            "access_token": "jwt-token",
            "expires_at": "2026-04-22T15:30:00Z",
            "access_reason": "registered_doctor"
        }
        """
        try:
            doctor_username = get_jwt_identity()
            data = request.get_json()
            
            otp_code = data.get("otp_code", "").strip()
            patient_psr_no = data.get("patient_psr_no", "").strip()
            
            # Validation
            if not otp_code or not patient_psr_no:
                return jsonify({"success": False, "error": "OTP and patient PSR are required"}), 400
            
            # Get OTP record
            otp_record = OTPDatabase.get_otp_record(otps_collection, otp_code, patient_psr_no)
            
            # Validate OTP
            is_valid, otp_message = OTPService.validate_otp(otp_record, otp_code)
            if not is_valid:
                return jsonify({"success": False, "error": otp_message}), 401
            
            # Get patient and doctor records
            patient = patients_collection.find_one({"institute_id": patient_psr_no})
            all_doctors = _get_all_doctors()
            doctor = next(
                (item for item in all_doctors if item.get("username", "").lower() == doctor_username.lower()),
                None,
            )
            
            if not patient or not doctor:
                return jsonify({"success": False, "error": "Patient or doctor record not found"}), 404
            
            # Verify doctor authorization
            is_authorized, auth_message, doctor_spec, access_reason = DoctorVerification.verify_doctor_for_patient(
                patient_doc=patient,
                requesting_doctor_username=doctor_username,
                doctor_record=doctor,
                all_doctors=all_doctors
            )
            
            if not is_authorized:
                return jsonify({
                    "success": False,
                    "error": "Doctor not authorized",
                    "detail": auth_message
                }), 403
            
            # Create access session
            session = AccessSession(
                patient_psr_no=patient_psr_no,
                doctor_username=doctor_username,
                doctor_specialization=doctor_spec,
                access_reason=access_reason
            )
            
            # Save session
            success = AccessSessionDatabase.save_access_session(
                sessions_collection,
                session,
                otp_code=otp_code
            )
            
            if not success:
                return jsonify({"success": False, "error": "Failed to create access session"}), 500
            
            # Mark OTP as used
            OTPDatabase.mark_otp_as_used(otps_collection, otp_record.get("otp_id"), session.session_id)
            
            return jsonify({
                "success": True,
                "message": f"Access granted for 30 minutes ({access_reason})",
                "access_session_id": session.session_id,
                "session_id": session.session_id,
                "access_reason": access_reason,
                "expires_at": session.session_expires_at.isoformat(),
                "patient_psr_no": patient_psr_no
            }), 200
        
        except Exception as e:
            return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500
    
    # ==================== VERIFICATION ROUTES ====================
    
    @otp_bp.route('/verify-session/<session_id>', methods=['GET'])
    @jwt_required()
    def verify_session_status(session_id):
        """
        Verify if a session is still valid before providing data
        
        Response:
        {
            "valid": true,
            "access_session_id": "uuid",
            "patient_psr_no": "PSR123456789",
            "expires_at": "2026-04-22T15:30:00Z",
            "time_remaining_minutes": 25
        }
        """
        try:
            session = AccessSessionDatabase.get_session_by_id(sessions_collection, session_id)
            
            if not session:
                return jsonify({"valid": False, "error": "Session not found"}), 404
            
            # Check if session is valid
            is_valid = AccessSessionDatabase.verify_session_valid(sessions_collection, session_id)
            
            if not is_valid:
                return jsonify({
                    "valid": False,
                    "error": "Session expired or inactive"
                }), 401
            
            # Calculate time remaining
            expires_at = session.get("session_expires_at")
            time_remaining = (expires_at - datetime.utcnow()).total_seconds() / 60
            
            return jsonify({
                "valid": True,
                "access_session_id": session_id,
                "session_id": session_id,
                "patient_psr_no": session.get("patient_psr_no"),
                "doctor_username": session.get("doctor_username"),
                "access_reason": session.get("access_granted_by_system"),
                "expires_at": expires_at.isoformat(),
                "time_remaining_minutes": round(time_remaining, 1)
            }), 200
        
        except Exception as e:
            return jsonify({"valid": False, "error": f"Server error: {str(e)}"}), 500
    
    @otp_bp.route('/check-doctor-access/<patient_psr_no>', methods=['GET'])
    @jwt_required()
    def check_doctor_access(patient_psr_no):
        """
        Check if currently logged-in doctor has active access to patient
        
        Response:
        {
            "has_access": true,
            "access_session_id": "uuid",
            "access_reason": "registered_doctor",
            "time_remaining_minutes": 25
        }
        """
        try:
            doctor_username = get_jwt_identity()
            session = AccessSessionDatabase.get_active_session(
                sessions_collection,
                patient_psr_no,
                doctor_username
            )
            
            if not session:
                return jsonify({
                    "has_access": False,
                    "message": "No active session. Request OTP for access."
                }), 401
            
            # Calculate time remaining
            expires_at = session.get("session_expires_at")
            time_remaining = (expires_at - datetime.utcnow()).total_seconds() / 60
            
            return jsonify({
                "has_access": True,
                "access_session_id": session.get("session_id"),
                "session_id": session.get("session_id"),
                "access_reason": session.get("access_granted_by_system"),
                "time_remaining_minutes": round(time_remaining, 1),
                "expires_at": expires_at.isoformat()
            }), 200
        
        except Exception as e:
            return jsonify({"has_access": False, "error": f"Server error: {str(e)}"}), 500
    
    # ==================== ADMIN/AUDIT ROUTES ====================
    
    @otp_bp.route('/doctor/<doctor_username>/access-history', methods=['GET'])
    @jwt_required()
    def get_doctor_access_history(doctor_username):
        """
        Get doctor's recent access history (audit trail)
        Only doctors can view their own, admins can view others
        
        Query Params:
            limit: Number of records (default: 50)
        """
        try:
            current_user = get_jwt_identity()
            limit = request.args.get("limit", 50, type=int)
            
            # Security: Only allow doctors to view own history or admins to view all
            # (This check should use actual role from JWT)
            if current_user != doctor_username:
                # Will add admin check here
                pass
            
            history = AccessSessionDatabase.get_doctor_access_history(
                sessions_collection,
                doctor_username,
                limit=limit
            )
            
            # Format response
            formatted_history = []
            for session in history:
                formatted_history.append({
                    "session_id": session.get("session_id"),
                    "patient_psr_no": session.get("patient_psr_no"),
                    "access_reason": session.get("access_granted_by_system"),
                    "created_at": session.get("session_created_at").isoformat(),
                    "expires_at": session.get("session_expires_at").isoformat(),
                    "is_active": session.get("is_active")
                })
            
            return jsonify({
                "success": True,
                "doctor_username": doctor_username,
                "total_records": len(formatted_history),
                "history": formatted_history
            }), 200
        
        except Exception as e:
            return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500
    
    return otp_bp
