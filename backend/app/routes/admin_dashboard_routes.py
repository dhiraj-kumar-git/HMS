from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt
import database

admin_dashboard_bp = Blueprint('admin_dashboard', __name__)


@admin_dashboard_bp.route('/api/admin/dashboard', methods=['GET'])
@jwt_required()
def admin_dashboard():
    """Numbers for the admin Dashboard (read-only). Sections that fail are reported by name; the rest are still returned."""
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    try:
        response = jsonify(database.get_admin_dashboard())
    except Exception as e:
        print(f"Error building the dashboard: {e}")
        return jsonify({"error": "Could not load the dashboard"}), 500
    response.headers["Cache-Control"] = "no-store"
    return response, 200
