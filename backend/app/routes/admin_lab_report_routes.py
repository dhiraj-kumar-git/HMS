import io
import os

from flask import Blueprint, Response, jsonify, request, send_file
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
import database
from app.s3_client import s3, BUCKET

admin_lab_reports_bp = Blueprint('admin_lab_reports', __name__)


def _admin_only():
    if get_jwt().get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403
    return None


def _locked():
    """Test names and results are only given inside the admin's 10-minute window (after re-entering the password)."""
    if not database.is_lab_view_unlocked(get_jwt_identity(), get_jwt().get("session_id")):
        return jsonify({"error": "Enter your password to view lab results", "code": "LAB_VIEW_LOCKED"}), 403
    return None


@admin_lab_reports_bp.route('/api/admin/lab-reports/search', methods=['GET'])
@jwt_required()
def admin_search_lab_orders():
    """Status of each lab order (counts only: no test names, results or files) filtered by date, status, doctor, patient."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        filters = database.parse_lab_filters(request.args)
        page, limit = database.parse_paging(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        result = database.search_lab_orders(filters, page, limit)
        result["filters"] = filters
        return jsonify(result), 200
    except Exception as e:
        print(f"Error searching lab orders: {e}")
        return jsonify({"error": "Could not load the lab reports"}), 500


@admin_lab_reports_bp.route('/api/admin/lab-reports/export', methods=['GET'])
@jwt_required()
def admin_export_lab_orders():
    """The same list as a CSV file (status information only)."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        filters = database.parse_lab_filters(request.args)
    except database.SearchError as e:
        return jsonify({"error": str(e)}), 400
    try:
        rows, truncated = database.export_lab_orders(filters)
        body = database.lab_orders_to_csv(rows)
    except Exception as e:
        print(f"Error exporting lab orders: {e}")
        return jsonify({"error": "Could not export the lab reports"}), 500
    filename = f"lab_reports_{filters['start_date']}_to_{filters['end_date']}.csv"
    return Response(body, mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Export-Truncated": "true" if truncated else "false",
    })


@admin_lab_reports_bp.route('/api/admin/lab-reports/doctors', methods=['GET'])
@jwt_required()
def admin_lab_order_doctors():
    """Doctors who ordered lab tests, for the filter."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        return jsonify(database.list_lab_order_doctors()), 200
    except Exception as e:
        print(f"Error listing doctors: {e}")
        return jsonify({"error": "Could not load doctors"}), 500


# ---------------------------------------------------------------- password-protected part

@admin_lab_reports_bp.route('/api/admin/lab-reports/unlock', methods=['POST'])
@jwt_required()
def admin_unlock_lab_results():
    """Open a 10-minute window for viewing lab results after the admin re-enters their password."""
    denied = _admin_only()
    if denied:
        return denied
    password = (request.get_json(silent=True) or {}).get("password")
    if not isinstance(password, str) or not password:
        return jsonify({"error": "Password is required"}), 400
    try:
        outcome, expires_at = database.attempt_lab_view_unlock(get_jwt_identity(), get_jwt().get("session_id"), password)
    except Exception as e:
        print(f"Error unlocking lab results: {e}")
        return jsonify({"error": "Could not check the password"}), 500
    if outcome == "locked_out":
        return jsonify({"error": "Too many wrong passwords. Please try again in 15 minutes.", "code": "TOO_MANY_ATTEMPTS"}), 429
    if outcome != "ok":
        # 403, not 401: the app treats any 401 as "session expired" and signs the user out
        return jsonify({"error": "Incorrect password", "code": "INCORRECT_PASSWORD"}), 403
    return jsonify({"unlocked": True, "expires_in": database.UNLOCK_MINUTES * 60, "expires_at": expires_at.isoformat()}), 200


@admin_lab_reports_bp.route('/api/admin/lab-reports/lock', methods=['POST'])
@jwt_required()
def admin_lock_lab_results():
    """End the window straight away."""
    denied = _admin_only()
    if denied:
        return denied
    try:
        database.lock_lab_view(get_jwt_identity(), get_jwt().get("session_id"))
    except Exception as e:
        print(f"Error locking lab results: {e}")
        return jsonify({"error": "Could not lock"}), 500
    return jsonify({"locked": True}), 200


@admin_lab_reports_bp.route('/api/admin/lab-reports/<visit_id>/details', methods=['GET'])
@jwt_required()
def admin_lab_order_details(visit_id):
    """Test names, per-test status and results of one lab order (inside the unlocked window only)."""
    denied = _admin_only() or _locked()
    if denied:
        return denied
    try:
        details = database.get_lab_order_details(visit_id)
    except Exception as e:
        print(f"Error loading lab order details: {e}")
        return jsonify({"error": "Could not load the lab report"}), 500
    if not details:
        return jsonify({"error": "Lab order not found"}), 404
    response = jsonify(details)
    response.headers["Cache-Control"] = "no-store"
    return response, 200


INLINE_TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


@admin_lab_reports_bp.route('/api/admin/lab-reports/<visit_id>/file/<int:index>', methods=['GET'])
@jwt_required()
def admin_lab_report_file(visit_id, index):
    """One uploaded report file of a visit, read through the backend and returned from memory (never saved to disk)."""
    denied = _admin_only() or _locked()
    if denied:
        return denied
    ref = database.get_lab_report_file_ref(visit_id, index)
    if not ref:
        return jsonify({"error": "Report file not found"}), 404
    key, file_name = ref
    try:
        data = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except Exception as e:
        print(f"Error reading report file: {e}")
        return jsonify({"error": "Could not open the report file"}), 500
    extension = os.path.splitext(key)[1].lower()
    mimetype = INLINE_TYPES.get(extension)
    response = send_file(io.BytesIO(data), mimetype=mimetype or "application/octet-stream",
                         as_attachment=mimetype is None, download_name=file_name)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
    return response
