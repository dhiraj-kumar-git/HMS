"""Read-only lab report status queries for the admin dashboard.

Nothing here returns test names, result values or file names: the database reduces each visit to counts and
flags, and the status of an order is worked out from those. Result details are a separate, password-protected step.
"""
import csv
import io
import re

from app.database.core import *
from app.database.appointments_admin import (
    SearchError, EXPORT_LIMIT, DEFAULT_RANGE_DAYS, _parse_date, _time_range, _safe_cell, normalize_status,
)

# (key, label) in the order a lab order moves through them
LAB_STATUSES = (
    ("awaiting_payment", "Awaiting payment"),
    ("pending", "Pending"),
    ("in_progress", "In progress"),
    ("partially_completed", "Partially completed"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
)
LAB_STATUS_KEYS = tuple(k for k, _ in LAB_STATUSES)
LAB_STATUS_LABELS = dict(LAB_STATUSES)


def derive_lab_status(tests_total, tests_completed, tests_cancelled, has_invoice, has_draft, has_reports, visit_status=None):
    """One status for a visit's lab order.

    * nothing left to do: completed (if any test was done) or cancelled
    * not billed yet: awaiting payment
    * billed and some tests done: partially completed
    * billed, nothing done but results being entered / a report saved: in progress
    * billed, nothing started: pending
    """
    still_open = tests_total - tests_completed - tests_cancelled
    if tests_total > 0 and still_open <= 0:
        return "completed" if tests_completed > 0 else "cancelled"
    if normalize_status(visit_status) == "cancelled":
        return "cancelled"
    if not has_invoice:
        return "awaiting_payment"
    if tests_completed > 0:
        return "partially_completed"
    if has_draft or has_reports:
        return "in_progress"
    return "pending"


def parse_lab_filters(args, now=None):
    """Validate the query-string filters. With no dates given, the last 30 days are searched."""
    from app.database.appointments_admin import today_ist
    today = today_ist(now)
    end = _parse_date(args.get("end_date") or today.strftime("%Y-%m-%d"), "To date")
    start = _parse_date(
        args.get("start_date") or (end - timedelta(days=DEFAULT_RANGE_DAYS - 1)).strftime("%Y-%m-%d"), "From date")
    if start > end:
        raise SearchError("From date must not be after To date")

    status = str(args.get("status") or "").strip().lower()
    if status in ("", "all"):
        status = None
    elif status not in LAB_STATUS_KEYS:
        raise SearchError("Unknown status")

    doctor = str(args.get("doctor") or "").strip()
    if doctor.lower() == "all":
        doctor = ""
    if len(doctor) > 100:
        raise SearchError("Doctor filter is too long")

    q = str(args.get("q") or "").strip()
    if len(q) > 100:
        raise SearchError("Search text is too long (100 characters at most)")

    return {"start_date": start.strftime("%Y-%m-%d"), "end_date": end.strftime("%Y-%m-%d"),
            "status": status, "doctor": doctor or None, "q": q or None}


def _count_where(array_field, cond):
    return {"$size": {"$filter": {"input": {"$ifNull": [array_field, []]}, "as": "x", "cond": cond}}}


def _lab_order_pipeline(filters):
    """Matching visits that have lab tests, reduced to counts and flags (no names, values or file names)."""
    match = {"time": _time_range(filters["start_date"], filters["end_date"]), "lab_tests.0": {"$exists": True}}
    if filters.get("doctor"):
        match["doctor_username"] = filters["doctor"]

    has_file = {"$ne": [{"$ifNull": ["$$x.s3_key", ""]}, ""]}
    pipeline = [
        {"$match": match},
        {"$project": {
            "_id": 0, "visit_id": 1, "institute_id": 1, "time": 1, "doctor_username": 1, "doctor_name": 1,
            "visit_status": "$status",
            "tests_total": {"$size": {"$ifNull": ["$lab_tests", []]}},
            "tests_completed": _count_where("$lab_tests", {"$eq": ["$$x.status", "completed"]}),
            "tests_cancelled": _count_where("$lab_tests", {"$eq": ["$$x.status", "cancelled"]}),
            "report_files": _count_where("$lab_reports", has_file),
            "report_typed": _count_where("$lab_reports", {"$not": [has_file]}),
            "has_invoice": {"$ne": [{"$ifNull": ["$invoice_no", ""]}, ""]},
            "has_draft": {"$cond": [{"$eq": [{"$type": "$lab_results_draft"}, "object"]},
                                    {"$gt": [{"$size": {"$objectToArray": "$lab_results_draft"}}, 0]}, False]},
        }},
        {"$lookup": {
            "from": "patients",
            "let": {"iid": "$institute_id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$institute_id", "$$iid"]}}},
                {"$project": {"_id": 0, "name": 1, "patient_type": 1}},
            ],
            "as": "_p",
        }},
        {"$addFields": {"_p": {"$arrayElemAt": ["$_p", 0]}}},
    ]
    if filters.get("q"):
        needle = re.escape(filters["q"])
        pipeline.append({"$match": {"$or": [
            {"institute_id": {"$regex": needle, "$options": "i"}},
            {"_p.name": {"$regex": needle, "$options": "i"}},
        ]}})
    pipeline += [
        {"$addFields": {"patient_name": "$_p.name", "patient_type": "$_p.patient_type"}},
        {"$sort": {"time": -1, "visit_id": 1}},
        {"$project": {"_p": 0}},
    ]
    return pipeline


def _order_rows(filters):
    """Every matching order with its derived status, newest first."""
    rows = []
    for v in visits.aggregate(_lab_order_pipeline(filters), allowDiskUse=True):
        status = derive_lab_status(v.get("tests_total", 0), v.get("tests_completed", 0), v.get("tests_cancelled", 0),
                                   bool(v.get("has_invoice")), bool(v.get("has_draft")),
                                   (v.get("report_files", 0) + v.get("report_typed", 0)) > 0, v.get("visit_status"))
        rows.append({
            "visit_id": v.get("visit_id"),
            "time": v.get("time"),
            "status": status,
            "institute_id": v.get("institute_id"),
            "patient_name": v.get("patient_name"),
            "patient_type": v.get("patient_type"),
            "doctor_username": v.get("doctor_username"),
            "doctor_name": v.get("doctor_name") or v.get("doctor_username"),
            "tests_total": v.get("tests_total", 0),
            "tests_completed": v.get("tests_completed", 0),
            "tests_cancelled": v.get("tests_cancelled", 0),
            "report_files": v.get("report_files", 0),
            "report_typed": v.get("report_typed", 0),
        })
    return rows


def search_lab_orders(filters, page=1, limit=25):
    """One page of lab orders, plus how many orders there are in each status for the other filters."""
    rows = _order_rows(filters)
    summary = {key: 0 for key in LAB_STATUS_KEYS}
    for r in rows:
        summary[r["status"]] += 1
    summary["total"] = len(rows)

    shown = [r for r in rows if r["status"] == filters["status"]] if filters.get("status") else rows
    total = len(shown)
    start = (page - 1) * limit
    return {
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": max((total + limit - 1) // limit, 1),
        "export_limit": EXPORT_LIMIT,
        "summary": summary,
        "rows": shown[start:start + limit],
    }


def export_lab_orders(filters):
    """Every matching order (status list only), newest first, capped at EXPORT_LIMIT. Returns (rows, truncated)."""
    rows = _order_rows(filters)
    if filters.get("status"):
        rows = [r for r in rows if r["status"] == filters["status"]]
    return rows[:EXPORT_LIMIT], len(rows) > EXPORT_LIMIT


def list_lab_order_doctors():
    """Doctors who ordered at least one lab test, for the filter list."""
    docs = visits.aggregate([
        {"$match": {"lab_tests.0": {"$exists": True}, "doctor_username": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$doctor_username", "name": {"$last": "$doctor_name"}}},
        {"$sort": {"name": 1, "_id": 1}},
    ])
    return [{"username": d["_id"], "name": d.get("name") or d["_id"]} for d in docs]


LAB_CSV_COLUMNS = ["Date & Time", "Patient", "Institute ID", "Patient type", "Doctor", "Status", "Tests ordered",
                   "Tests completed", "Uploaded files", "Typed reports", "Visit ID"]


def lab_orders_to_csv(rows):
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(LAB_CSV_COLUMNS)
    for r in rows:
        writer.writerow([_safe_cell(x) for x in (
            r["time"], r["patient_name"], r["institute_id"], r["patient_type"], r["doctor_name"],
            LAB_STATUS_LABELS.get(r["status"], r["status"]), r["tests_total"], r["tests_completed"],
            r["report_files"], r["report_typed"], r["visit_id"])])
    return "﻿" + out.getvalue()


# ---------------------------------------------------------------------------------------------
# Password-protected result view
# ---------------------------------------------------------------------------------------------

UNLOCK_MINUTES = 10
MAX_UNLOCK_FAILURES = 5
UNLOCK_FAILURE_WINDOW_MINUTES = 15


def is_lab_view_unlocked(username, session_id, now=None):
    """True while this admin's login session is inside its 10-minute window for viewing lab results."""
    now = now or datetime.now(timezone.utc)
    return lab_view_access.find_one({"kind": "unlock", "username": username, "session_id": session_id,
                                     "expires_at": {"$gt": now}}) is not None


def attempt_lab_view_unlock(username, session_id, password, now=None):
    """Check the admin's password (as sent by the login page: its SHA-256) and open the window if correct.

    Returns ("ok", expires_at), ("incorrect", None) or ("locked_out", None). After MAX_UNLOCK_FAILURES wrong
    passwords in 15 minutes the password is not even checked until the failures age out.
    """
    from app.database.auth import authenticate_user
    now = now or datetime.now(timezone.utc)
    recent = lab_view_access.count_documents({"kind": "failure", "username": username, "expires_at": {"$gt": now}})
    if isinstance(recent, int) and recent >= MAX_UNLOCK_FAILURES:
        return "locked_out", None

    user = authenticate_user(username, password) if password else None
    if not user or user.get("username") != username:
        lab_view_access.insert_one({"kind": "failure", "username": username, "created_at": now,
                                    "expires_at": now + timedelta(minutes=UNLOCK_FAILURE_WINDOW_MINUTES)})
        return "incorrect", None

    expires_at = now + timedelta(minutes=UNLOCK_MINUTES)
    lab_view_access.delete_many({"kind": "failure", "username": username})
    lab_view_access.delete_many({"kind": "unlock", "username": username, "session_id": session_id})
    lab_view_access.insert_one({"kind": "unlock", "username": username, "session_id": session_id,
                                "created_at": now, "expires_at": expires_at})
    return "ok", expires_at


def lock_lab_view(username, session_id):
    """End the window right away."""
    lab_view_access.delete_many({"kind": "unlock", "username": username, "session_id": session_id})


def _as_text(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return "" if value is None else str(value)


def _normalise_results(results):
    """Typed-in results as a list of {name, value, reference_range, units}, whatever shape they were saved in."""
    if not isinstance(results, dict):
        return []
    rows = []
    for name, entry in results.items():
        if isinstance(entry, dict):
            rows.append({"name": str(name), "value": _as_text(entry.get("value")),
                         "reference_range": _as_text(entry.get("reference_range")), "units": _as_text(entry.get("units"))})
        else:
            rows.append({"name": str(name), "value": _as_text(entry), "reference_range": "", "units": ""})
    return rows


def get_lab_order_details(visit_id):
    """Everything about one lab order, including test names and results. Only call after the unlock check."""
    v = visits.find_one({"visit_id": visit_id}, {"_id": 0, "visit_id": 1, "institute_id": 1, "time": 1, "doctor_username": 1,
                                                 "doctor_name": 1, "status": 1, "invoice_no": 1, "lab_tests": 1,
                                                 "lab_reports": 1, "lab_results_draft": 1})
    if not v or not v.get("lab_tests"):
        return None
    person = patients.find_one({"institute_id": v.get("institute_id")}, {"_id": 0, "name": 1, "patient_type": 1, "gender": 1}) or {}

    tests = [{"name": t.get("lab_test"), "status": t.get("status") or "pending", "ordered_at": _as_text(t.get("timestamp"))}
             for t in v["lab_tests"] if isinstance(t, dict)]
    reports_raw = [r for r in (v.get("lab_reports") or []) if isinstance(r, dict)]
    counts = {s: sum(1 for t in tests if t["status"] == s) for s in ("completed", "cancelled")}
    draft = v.get("lab_results_draft")
    status = derive_lab_status(len(tests), counts["completed"], counts["cancelled"], bool(v.get("invoice_no")),
                               isinstance(draft, dict) and len(draft) > 0, len(reports_raw) > 0, v.get("status"))

    reports = []
    for index, r in enumerate(v.get("lab_reports") or []):
        if not isinstance(r, dict):
            continue
        item = {"index": index, "test_name": r.get("test_name"),
                "saved_at": _as_text(r.get("timestamp") or r.get("uploaded_at")), "uploaded_by": r.get("uploaded_by")}
        if r.get("s3_key"):
            item.update(kind="file", file_name=r.get("file_name") or "report")
        else:
            item.update(kind="typed", results=_normalise_results(r.get("results")), remarks=_as_text(r.get("remarks")))
        reports.append(item)

    return {
        "visit_id": v.get("visit_id"),
        "time": v.get("time"),
        "status": status,
        "institute_id": v.get("institute_id"),
        "patient_name": person.get("name"),
        "patient_type": person.get("patient_type"),
        "gender": person.get("gender"),
        "doctor_name": v.get("doctor_name") or v.get("doctor_username"),
        "tests": tests,
        "reports": reports,
    }


def get_lab_report_file_ref(visit_id, index):
    """(storage key, file name) of the index-th report of a visit, or None. The key never goes to the browser."""
    try:
        index = int(index)
    except (TypeError, ValueError):
        return None
    v = visits.find_one({"visit_id": visit_id}, {"_id": 0, "lab_reports": 1})
    reports = (v or {}).get("lab_reports") or []
    if index < 0 or index >= len(reports) or not isinstance(reports[index], dict):
        return None
    r = reports[index]
    return (r["s3_key"], r.get("file_name") or "report") if r.get("s3_key") else None
