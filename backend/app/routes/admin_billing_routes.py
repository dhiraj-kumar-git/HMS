from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
import database

admin_billing_bp = Blueprint('admin_billing', __name__)


def _admin_only():
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    return None


@admin_billing_bp.route('/api/admin/billing/search', methods=['GET'])
@jwt_required()
def admin_search_billing():
    """Paid bills (with amounts) plus pending and cancelled ones (counted only), filtered. Itemised lines are not included."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        filters = database.parse_billing_filters(request.args)
        page, limit = database.parse_paging(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        result = database.search_billing(filters, page, limit)
        result["filters"] = filters
        return jsonify(result), 200
    except Exception as e:
        print(f"Error searching billing: {e}")
        return jsonify({"error": "Could not load the billing information"}), 500


@admin_billing_bp.route('/api/admin/billing/export', methods=['GET'])
@jwt_required()
def admin_export_billing():
    """The same list as a CSV file."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        filters = database.parse_billing_filters(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        rows, truncated = database.export_billing(filters)
        body = database.billing_to_csv(rows)
    except Exception as e:
        print(f"Error exporting billing: {e}")
        return jsonify({"error": "Could not export the billing information"}), 500
    filename = f"billing_{filters['start_date']}_to_{filters['end_date']}.csv"
    return Response(body, mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Export-Truncated": "true" if truncated else "false",
    })


@admin_billing_bp.route('/api/admin/billing/filters', methods=['GET'])
@jwt_required()
def admin_billing_filters():
    """Doctors, payment modes and patient types that appear in billing, for the filter drop-downs."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        return jsonify(database.list_billing_filter_options()), 200
    except Exception as e:
        print(f"Error loading billing filter options: {e}")
        return jsonify({"error": "Could not load the filter options"}), 500


@admin_billing_bp.route('/api/admin/billing/<kind>/<path:key>/details', methods=['GET'])
@jwt_required()
def admin_billing_details(kind, key):
    """Medicine and test lines of one bill. Inside the admin's 10-minute password window only (shared with lab results)."""
    denied = _admin_only()
    if denied:
        return denied
    if not database.is_lab_view_unlocked(get_jwt_identity(), get_jwt().get("session_id")):
        return jsonify({"error": "Enter your password to view billing details", "code": "LAB_VIEW_LOCKED"}), 403
    try:
        details = database.get_billing_details(kind, key)
    except Exception as e:
        print(f"Error loading billing details: {e}")
        return jsonify({"error": "Could not load the bill"}), 500
    if not details:
        return jsonify({"error": "Bill not found"}), 404
    response = jsonify(details)
    response.headers["Cache-Control"] = "no-store"
    return response, 200


@admin_billing_bp.route('/api/admin/billing/analytics', methods=['GET'])
@jwt_required()
def admin_billing_analytics():
    """Revenue, mix and backlog for a period (read-only, paid bills only for money). Defaults to the last 30 days."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        start_date, end_date = database.parse_analytics_range(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        response = jsonify(database.get_billing_analytics(start_date, end_date))
    except Exception as e:
        print(f"Error building billing analytics: {e}")
        return jsonify({"error": "Could not load the billing analytics"}), 500
    response.headers["Cache-Control"] = "no-store"
    return response, 200
