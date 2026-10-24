from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
import database
import uuid
from datetime import datetime

leaves_bp = Blueprint('leaves', __name__)

# List all leaves
@leaves_bp.route('/api/receptionist/leaves', methods=['GET'])
@jwt_required()
def get_leaves():
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized"}), 403

    try:
        all_leaves = list(database.leaves.find({}, {"_id": 0}))
        # Sort by start_date descending
        all_leaves.sort(key=lambda x: x.get("start_date", ""), reverse=True)
        return jsonify(all_leaves), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Mark doctor on leave
@leaves_bp.route('/api/receptionist/leaves', methods=['POST'])
@jwt_required()
def create_leave():
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json or {}
    doctor_username = data.get("doctor_username")
    start_date_str = data.get("start_date")
    end_date_str = data.get("end_date")
    reason = data.get("reason", "")

    if not all([doctor_username, start_date_str, end_date_str]):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # Validate doctor exists
        doctor = database.users.find_one({"username": doctor_username, "role": "doctor"})
        if not doctor:
            return jsonify({"error": f"Doctor '{doctor_username}' not found."}), 404

        # Validate date formats
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Dates must be in YYYY-MM-DD format."}), 400

        if start_date > end_date:
            return jsonify({"error": "Start date must be before or equal to end date."}), 400

        # Insert leave record
        leave_id = str(uuid.uuid4())
        leave_record = {
            "leave_id": leave_id,
            "doctor_username": doctor_username,
            "doctor_name": doctor.get("display_name") or doctor_username,
            "start_date": start_date_str,
            "end_date": end_date_str,
            "reason": reason
        }
        database.leaves.insert_one(leave_record)
        if "_id" in leave_record:
            del leave_record["_id"]

        return jsonify({"message": "Leave recorded successfully", "leave": leave_record}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Delete leave
@leaves_bp.route('/api/receptionist/leaves/<leave_id>', methods=['DELETE'])
@jwt_required()
def delete_leave(leave_id):
    claims = get_jwt()
    if claims.get("role") not in ["receptionist", "admin"]:
        return jsonify({"error": "Unauthorized"}), 403

    try:
        result = database.leaves.delete_one({"leave_id": leave_id})
        if result.deleted_count > 0:
            return jsonify({"message": "Leave cancelled/deleted successfully"}), 200
        return jsonify({"error": "Leave record not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
