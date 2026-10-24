from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt
import database

admin_appointments_bp = Blueprint('admin_appointments', __name__)


def _admin_only():
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    return None


@admin_appointments_bp.route('/api/admin/appointments/today', methods=['GET'])
@jwt_required()
def admin_todays_appointments():
    """Today's appointments for the admin dashboard (read-only)."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        return jsonify(database.get_todays_appointments()), 200
    except Exception as e:
        print(f"Error loading today's appointments: {e}")
        return jsonify({"error": "Could not load today's appointments"}), 500


@admin_appointments_bp.route('/api/admin/appointments/search', methods=['GET'])
@jwt_required()
def admin_search_appointments():
    """Past and present appointments filtered by date range, status, doctor, who booked and patient (read-only)."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        filters = database.parse_search_filters(request.args)
        page, limit = database.parse_paging(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        result = database.search_appointments(filters, page, limit)
        result["filters"] = filters
        return jsonify(result), 200
    except Exception as e:
        print(f"Error searching appointments: {e}")
        return jsonify({"error": "Could not search appointments"}), 500


@admin_appointments_bp.route('/api/admin/appointments/export', methods=['GET'])
@jwt_required()
def admin_export_appointments():
    """The same search as a CSV file (at most database.EXPORT_LIMIT rows)."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        filters = database.parse_search_filters(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        rows, truncated = database.export_appointments(filters)
        body = database.appointments_to_csv(rows)
    except Exception as e:
        print(f"Error exporting appointments: {e}")
        return jsonify({"error": "Could not export appointments"}), 500
    filename = f"appointments_{filters['start_date']}_to_{filters['end_date']}.csv"
    return Response(body, mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Export-Truncated": "true" if truncated else "false",
    })


@admin_appointments_bp.route('/api/admin/appointments/doctors', methods=['GET'])
@jwt_required()
def admin_appointment_doctors():
    """Doctors that appear in any appointment, for the search filter."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        return jsonify(database.list_appointment_doctors()), 200
    except Exception as e:
        print(f"Error listing doctors: {e}")
        return jsonify({"error": "Could not load doctors"}), 500


@admin_appointments_bp.route('/api/admin/appointments/analytics', methods=['GET'])
@jwt_required()
def admin_appointment_analytics():
    """Counts, rates and breakdowns for a period (read-only). Defaults to the last 30 days."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        start_date, end_date = database.parse_analytics_range(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        return jsonify(database.get_appointment_analytics(start_date, end_date)), 200
    except Exception as e:
        print(f"Error building appointment analytics: {e}")
        return jsonify({"error": "Could not load the analytics"}), 500
