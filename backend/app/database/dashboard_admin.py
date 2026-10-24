"""Read-only numbers for the admin Dashboard.

Everything here is built from the same rules as the Appointments, Reports and Billing pages (IST days, paid bills
only for money, pending and cancelled bills only counted), so the Dashboard cannot disagree with them. Each section
is computed on its own: if one fails the others are still returned and the failed one is named in `errors`.
Only numbers and a short list of new patients (name, ID, type, date) leave the database.
"""
from app.database.core import *
from app.database.appointments_admin import IST, normalize_status, today_ist, _time_range
from app.database import billing_admin as _billing
from app.database import lab_reports_admin as _lab

TREND_DAYS = 14
LOOKBACK_DAYS = 30
NEW_PATIENT_DAYS = 7
NEW_PATIENT_ROWS = 5
OPEN_APPOINTMENT_STATUSES = ("booked", "confirmed", "checked_in", "consultation", "upcoming")
OPEN_LAB_STATUSES = ("awaiting_payment", "pending", "in_progress", "partially_completed")
STAFF_ROLES = ("doctor", "receptionist", "lab_staff", "medical_store")
OLD_BILL_DAYS = 7
_OPEN_STATUS_PATTERN = "^(booked|confirmed|checked[ _]in|consultation|upcoming)$"
_NO_FILTERS = {"status": None, "doctor": None, "q": None}


def _day(d):
    return d.strftime("%Y-%m-%d")


def _number(path):
    return {"$convert": {"input": path, "to": "double", "onError": 0, "onNull": 0}}


def _appointments_today(today):
    counts = {"total": 0, "open": 0, "completed": 0, "cancelled": 0, "other": 0}
    for v in visits.find({"time": _time_range(_day(today), _day(today))}, {"_id": 0, "status": 1}):
        status = normalize_status(v.get("status"))
        counts["total"] += 1
        if status in OPEN_APPOINTMENT_STATUSES:
            counts["open"] += 1
        elif status in ("completed", "cancelled"):
            counts[status] += 1
        else:
            counts["other"] += 1
    return counts


def _trend(today, days=TREND_DAYS):
    """Appointments and paid revenue for each of the last `days` days (IST), quiet days included."""
    first_day = today - timedelta(days=days - 1)
    first, after = _billing._ist_day_bounds(_day(first_day), _day(today))
    revenue = {r["_id"]: r for r in bills.aggregate([
        {"$match": {"payment_date": {"$gte": first, "$lt": after}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$payment_date", "timezone": "+05:30"}},
                    "revenue": {"$sum": _number("$total_amount")}, "bills": {"$sum": 1}}}])}
    appointments = {r["_id"]: r["n"] for r in visits.aggregate([
        {"$match": {"time": _time_range(_day(first_day), _day(today))}},
        {"$group": {"_id": {"$substrCP": [{"$toString": "$time"}, 0, 10]}, "n": {"$sum": 1}}}])}
    out = []
    for i in range(days):
        key = _day(first_day + timedelta(days=i))
        out.append({"date": key, "appointments": int(appointments.get(key, 0)),
                    "revenue": round(float(revenue.get(key, {}).get("revenue", 0)), 2), "bills": int(revenue.get(key, {}).get("bills", 0))})
    return out


def _revenue_from_trend(trend):
    today, yesterday = trend[-1], trend[-2]
    return {"today": today["revenue"], "bills_today": today["bills"], "yesterday": yesterday["revenue"], "bills_yesterday": yesterday["bills"]}


def _pending_bills(today):
    """Unpaid visits with billable items, as a count (they have no amount) and how long they have waited."""
    rows = _billing._order_rows({**_billing.NO_FILTERS, "start_date": "2000-01-01", "end_date": _day(today)})
    backlog = _billing._backlog([r for r in rows if r["status"] == "pending"], today)
    old = sum(b["count"] for b in backlog["buckets"][2:])          # everything beyond the 0-2 and 3-7 day buckets
    return {"total": backlog["total"], "oldest_days": backlog["oldest_days"], "over_7_days": old}


def _lab_orders(today):
    rows = _lab._order_rows({**_NO_FILTERS, "start_date": _day(today - timedelta(days=LOOKBACK_DAYS - 1)), "end_date": _day(today)})
    counts = {s: 0 for s in OPEN_LAB_STATUSES}
    for r in rows:
        if r["status"] in counts:
            counts[r["status"]] += 1
    return {"open": sum(counts.values()), "by_status": counts, "days": LOOKBACK_DAYS}


def _patients(now):
    live = {"account_status": {"$ne": "archived"}}
    by_type = {}
    for r in patients.aggregate([{"$match": live}, {"$group": {"_id": {"$ifNull": ["$patient_type", "Unknown"]}, "n": {"$sum": 1}}}]):
        name = str(r["_id"]).strip() or "Unknown"
        by_type[name] = by_type.get(name, 0) + int(r["n"])
    ranked = sorted(({"name": k, "count": v} for k, v in by_type.items()), key=lambda g: (-g["count"], g["name"]))
    since = now - timedelta(days=NEW_PATIENT_DAYS)
    return {"total": sum(by_type.values()), "new_this_week": patients.count_documents({**live, "registration_time": {"$gte": since}}),
            "by_type": ranked}


def _staff():
    counts = {role: 0 for role in STAFF_ROLES}
    for r in users.aggregate([{"$match": {"role": {"$in": list(STAFF_ROLES)}}}, {"$group": {"_id": "$role", "n": {"$sum": 1}}}]):
        counts[r["_id"]] = int(r["n"])
    return {"total": sum(counts.values()), "by_role": counts}


def _new_patients():
    rows = []
    cursor = patients.find({"account_status": {"$ne": "archived"}},
                           {"_id": 0, "name": 1, "institute_id": 1, "patient_type": 1, "registration_time": 1}
                           ).sort("registration_time", -1).limit(NEW_PATIENT_ROWS)
    for p in cursor:
        rows.append({"name": p.get("name"), "institute_id": p.get("institute_id"), "patient_type": p.get("patient_type"),
                     "registered": _billing._as_ist_text(p.get("registration_time"))})
    return rows


def _left_open(today):
    """Appointments from the last 30 days (before today) that were never completed or cancelled."""
    return visits.count_documents({
        "time": {"$gte": _day(today - timedelta(days=LOOKBACK_DAYS)), "$lt": _day(today)},
        "status": {"$regex": _OPEN_STATUS_PATTERN, "$options": "i"},
    })


def build_attention(left_open, pending, lab):
    """The short 'needs attention' list. A section that could not be computed is reported as unknown (None), not as zero."""
    return [
        {"key": "left_open", "label": f"Appointments from the last {LOOKBACK_DAYS} days still open", "count": left_open, "link": "appointments"},
        {"key": "old_bills", "label": f"Bills pending for more than {OLD_BILL_DAYS} days", "count": None if pending is None else pending["over_7_days"], "link": "billing"},
        {"key": "lab_unpaid", "label": "Lab orders waiting for payment", "count": None if lab is None else lab["by_status"]["awaiting_payment"], "link": "reports"},
    ]


def get_admin_dashboard(now=None):
    now = now or datetime.now(timezone.utc)
    today = today_ist(now)
    errors = []

    def section(name, fn, *args):
        try:
            return fn(*args)
        except Exception as e:             # one broken section must not blank the page
            print(f"Dashboard section '{name}' failed: {e}")
            errors.append(name)
            return None

    trend = section("trend", _trend, today)
    pending = section("pending_bills", _pending_bills, today)
    lab = section("lab_orders", _lab_orders, today)
    left_open = section("left_open", _left_open, today)
    return {
        "date": _day(today),
        "generated_at": now.isoformat(),
        "appointments_today": section("appointments_today", _appointments_today, today),
        "revenue": _revenue_from_trend(trend) if trend else None,
        "trend": trend,
        "pending_bills": pending,
        "lab_orders": lab,
        "patients": section("patients", _patients, now),
        "staff": section("staff", _staff),
        "new_patients": section("new_patients", _new_patients),
        "attention": build_attention(left_open, pending, lab),
        "errors": errors,
    }
