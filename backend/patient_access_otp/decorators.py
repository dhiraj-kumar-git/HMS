from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity

import database
from .otp_database import AccessSessionDatabase


def require_patient_access_session(patient_id_arg="institute_id", patient_id_body_field="institute_id", doctor_only=False):
    """
    Enforce active OTP access-session validation for doctor routes.

    - Reads consent session from X-Access-Session-ID header
      (falls back to legacy X-Session-ID for compatibility).
    - Validates session ownership (doctor_username), expiry and activeness.
    - If patient_id is provided by path/body, validates session is for that patient.

    Args:
        patient_id_arg: Path parameter name for patient id (e.g., institute_id)
        patient_id_body_field: JSON body field name for patient id
        doctor_only: If True, rejects non-doctor users with 403.
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            role = claims.get("role")

            if role != "doctor":
                if doctor_only:
                    return jsonify({"error": "Unauthorized access"}), 403
                return func(*args, **kwargs)

            doctor_username = get_jwt_identity()
            access_session_id = request.headers.get("X-Access-Session-ID") or request.headers.get("X-Session-ID")

            if not access_session_id:
                return jsonify({"error": "Active OTP access session required in X-Access-Session-ID header"}), 401

            session = AccessSessionDatabase.get_session_by_id(database.access_sessions, access_session_id)
            if not session:
                return jsonify({"error": "OTP session not found"}), 401

            if session.get("doctor_username") != doctor_username:
                return jsonify({"error": "OTP session does not belong to the current doctor"}), 403

            if not AccessSessionDatabase.verify_session_valid(database.access_sessions, access_session_id):
                return jsonify({"error": "OTP session expired or inactive"}), 401

            patient_id = None
            if patient_id_arg:
                patient_id = kwargs.get(patient_id_arg)

            if patient_id is None and patient_id_body_field:
                payload = request.get_json(silent=True) or {}
                patient_id = payload.get(patient_id_body_field)

            if patient_id and session.get("patient_psr_no") != patient_id:
                return jsonify({"error": "OTP session is not valid for this patient"}), 403

            return func(*args, **kwargs)

        return wrapper

    return decorator
