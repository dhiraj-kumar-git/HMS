"""Read-only appointment queries for the admin dashboard."""
import csv
import io
import re

from app.database.core import *

IST = timezone(timedelta(hours=5, minutes=30))

# Statuses shown in the "active" list, and the ones given their own counter on the Today view
ACTIVE_STATUSES = ("booked", "confirmed", "checked_in", "consultation", "upcoming")
COUNTED_STATUSES = ("booked", "confirmed", "checked_in", "consultation", "completed", "cancelled")


def normalize_status(status):
    """'Checked in' / 'Consultation' / 'booked' -> 'checked_in' / 'consultation' / 'booked' (older rows vary)."""
    return str(status or "").strip().lower().replace(" ", "_")


def today_ist(now=None):
    """Today's date in IST, the clock the hospital books appointments by."""
    return (now or datetime.now(timezone.utc)).astimezone(IST).date()


def get_todays_appointments(now=None):
    """Today's appointment counts per status, plus the list of appointments still to be seen.

    Appointment times are stored as 'YYYY-MM-DDTHH:MM' (older rows may use a space), so a day is
    matched on that prefix.
    """
    date_str = today_ist(now).strftime("%Y-%m-%d")
    todays = list(visits.find(
        {"time": {"$regex": f"^{date_str}[T ]"}},
        {"_id": 0, "visit_id": 1, "institute_id": 1, "doctor_username": 1, "doctor_name": 1,
         "time": 1, "status": 1, "booked_by": 1},
    ))

    # one lookup for every patient involved, not one per appointment
    institute_ids = list({v.get("institute_id") for v in todays if v.get("institute_id")})
    people = {}
    if institute_ids:
        for p in patients.find({"institute_id": {"$in": institute_ids}},
                               {"_id": 0, "institute_id": 1, "name": 1, "patient_type": 1}):
            people[p.get("institute_id")] = p

    counts = {status: 0 for status in COUNTED_STATUSES}
    counts["other"] = 0
    active = []
    for v in todays:
        status = normalize_status(v.get("status"))
        counts[status if status in COUNTED_STATUSES else "other"] += 1
        if status in ACTIVE_STATUSES:
            person = people.get(v.get("institute_id"), {})
            active.append({
                "visit_id": v.get("visit_id"),
                "time": v.get("time"),
                "status": status,
                "institute_id": v.get("institute_id"),
                "patient_name": person.get("name"),
                "patient_type": person.get("patient_type"),
                "doctor_username": v.get("doctor_username"),
                "doctor_name": v.get("doctor_name") or v.get("doctor_username"),
                "booked_by": v.get("booked_by"),
            })
    active.sort(key=lambda a: str(a.get("time") or "").replace(" ", "T"))

    counts["total"] = len(todays)
    return {
        "date": date_str,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "active": active,
    }


# ---------------------------------------------------------------------------------------------
# Search past appointments (admin) and CSV export
# ---------------------------------------------------------------------------------------------

SEARCHABLE_STATUSES = COUNTED_STATUSES + ("no_show", "upcoming")
BOOKED_BY_VALUES = ("patient", "receptionist")
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
EXPORT_LIMIT = 10000
DEFAULT_RANGE_DAYS = 30
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SearchError(ValueError):
    """The request's filters are not usable; the message is safe to show to the admin."""


def _parse_date(value, label):
    if not _DATE_RE.match(value or ""):
        raise SearchError(f"{label} must be a date in YYYY-MM-DD format")
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise SearchError(f"{label} is not a real date")


def parse_search_filters(args, now=None):
    """Validate the query-string filters. With no dates given, the last 30 days are searched."""
    today = today_ist(now)
    end = _parse_date(args.get("end_date") or today.strftime("%Y-%m-%d"), "To date")
    start = _parse_date(
        args.get("start_date") or (end - timedelta(days=DEFAULT_RANGE_DAYS - 1)).strftime("%Y-%m-%d"), "From date")
    if start > end:
        raise SearchError("From date must not be after To date")

    status = normalize_status(args.get("status"))
    if status in ("", "all"):
        status = None
    elif status not in SEARCHABLE_STATUSES:
        raise SearchError("Unknown status")

    booked_by = str(args.get("booked_by") or "").strip().lower()
    if booked_by in ("", "all"):
        booked_by = None
    elif booked_by not in BOOKED_BY_VALUES:
        raise SearchError("Unknown value for booked by")

    doctor = str(args.get("doctor") or "").strip()
    if doctor.lower() == "all":
        doctor = ""
    if len(doctor) > 100:
        raise SearchError("Doctor filter is too long")

    q = str(args.get("q") or "").strip()
    if len(q) > 100:
        raise SearchError("Search text is too long (100 characters at most)")

    return {"start_date": start.strftime("%Y-%m-%d"), "end_date": end.strftime("%Y-%m-%d"),
            "status": status, "booked_by": booked_by, "doctor": doctor or None, "q": q or None}


def parse_paging(args):
    try:
        page = int(args.get("page", 1))
        limit = int(args.get("limit", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        raise SearchError("page and limit must be whole numbers")
    if page < 1 or not 1 <= limit <= MAX_PAGE_SIZE:
        raise SearchError(f"page must be 1 or more and limit between 1 and {MAX_PAGE_SIZE}")
    return page, limit


def _status_pattern(status):
    """'checked_in' also matches the older spellings 'Checked in' / 'checked in'."""
    return "^" + "[ _]".join(re.escape(part) for part in status.split("_")) + "$"


def _search_pipeline(filters):
    """Everything up to and including the sort. Patient details are fetched with a projection, so
    sensitive fields (date of birth, contact, OTP, ...) never leave the database."""
    match = {"time": _time_range(filters["start_date"], filters["end_date"])}
    if filters.get("status"):
        match["status"] = {"$regex": _status_pattern(filters["status"]), "$options": "i"}
    if filters.get("doctor"):
        match["doctor_username"] = filters["doctor"]
    if filters.get("booked_by"):
        match["booked_by"] = filters["booked_by"]

    pipeline = [
        {"$match": match},
        # keep only the columns shown; whole visit records (prescriptions, notes) stay out of the sort
        {"$project": {"_id": 0, "visit_id": 1, "time": 1, "status": 1, "institute_id": 1, "doctor_username": 1,
                      "doctor_name": 1, "booked_by": 1, "booked_at": 1}},
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
    pipeline.append({"$sort": {"time": -1, "visit_id": 1}})
    return pipeline


_ROW_PROJECTION = {"$project": {
    "_id": 0, "visit_id": 1, "time": 1, "status": 1, "institute_id": 1, "doctor_username": 1, "doctor_name": 1,
    "booked_by": 1, "booked_at": 1, "patient_name": "$_p.name", "patient_type": "$_p.patient_type",
}}


def _clean_row(v):
    booked_at = v.get("booked_at")
    return {
        "visit_id": v.get("visit_id"),
        "time": v.get("time"),
        "status": normalize_status(v.get("status")),
        "institute_id": v.get("institute_id"),
        "patient_name": v.get("patient_name"),
        "patient_type": v.get("patient_type"),
        "doctor_username": v.get("doctor_username"),
        "doctor_name": v.get("doctor_name") or v.get("doctor_username"),
        "booked_by": v.get("booked_by"),
        "booked_at": booked_at.isoformat() if isinstance(booked_at, (datetime, date)) else booked_at,
    }


def search_appointments(filters, page=1, limit=DEFAULT_PAGE_SIZE):
    """One page of matching appointments (newest first) and the total number that match."""
    pipeline = _search_pipeline(filters) + [{"$facet": {
        "rows": [{"$skip": (page - 1) * limit}, {"$limit": limit}, _ROW_PROJECTION],
        "total": [{"$count": "n"}],
    }}]
    result = next(iter(visits.aggregate(pipeline, allowDiskUse=True)), {}) or {}
    total = (result.get("total") or [{"n": 0}])[0].get("n", 0)
    return {
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": max((total + limit - 1) // limit, 1),
        "export_limit": EXPORT_LIMIT,
        "rows": [_clean_row(v) for v in result.get("rows", [])],
    }


def export_appointments(filters):
    """Every matching appointment, newest first, capped at EXPORT_LIMIT. Returns (rows, truncated)."""
    pipeline = _search_pipeline(filters) + [_ROW_PROJECTION, {"$limit": EXPORT_LIMIT + 1}]
    rows = [_clean_row(v) for v in visits.aggregate(pipeline, allowDiskUse=True)]
    return rows[:EXPORT_LIMIT], len(rows) > EXPORT_LIMIT


def list_appointment_doctors():
    """Doctors who appear in any appointment (including ones no longer on staff), for the filter list."""
    docs = visits.aggregate([
        {"$match": {"doctor_username": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$doctor_username", "name": {"$last": "$doctor_name"}}},
        {"$sort": {"name": 1, "_id": 1}},
    ])
    return [{"username": d["_id"], "name": d.get("name") or d["_id"]} for d in docs]


CSV_COLUMNS = ["Date & Time", "Patient", "Institute ID", "Patient type", "Doctor", "Status", "Booked by", "Booked at", "Visit ID"]


def _safe_cell(value):
    """Spreadsheets run text starting with = + - @ as a formula; patient names are typed by users, so
    such cells are prefixed with an apostrophe to keep them plain text."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def appointments_to_csv(rows):
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow([_safe_cell(x) for x in (
            r["time"], r["patient_name"], r["institute_id"], r["patient_type"], r["doctor_name"],
            (r["status"] or "").replace("_", " "), r["booked_by"], r["booked_at"], r["visit_id"])])
    return "﻿" + out.getvalue()   # BOM so Excel reads names with accents correctly


# ---------------------------------------------------------------------------------------------
# Analytics for a chosen period (admin)
# ---------------------------------------------------------------------------------------------

MAX_ANALYTICS_DAYS = 366
RESOLVED_STATUSES = ("completed", "cancelled", "no_show")
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
# a turnaround outside this range is a data glitch (appointment completed days later, clock mix-up), not a real wait
MAX_TURNAROUND_MINUTES = 12 * 60
MAX_LEAD_DAYS = 365
LOOKUP_CHUNK = 1000


def _time_range(start_date, end_date):
    """Appointment times are 'YYYY-MM-DD...' strings, so a day range is a string range (end day included)."""
    end_exclusive = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    return {"$gte": start_date, "$lt": end_exclusive}


def parse_analytics_range(args, now=None):
    """Validate the period. With no dates given, the last 30 days ending today (IST) are used."""
    today = today_ist(now)
    end = _parse_date(args.get("end_date") or today.strftime("%Y-%m-%d"), "To date")
    start = _parse_date(
        args.get("start_date") or (end - timedelta(days=DEFAULT_RANGE_DAYS - 1)).strftime("%Y-%m-%d"), "From date")
    if start > end:
        raise SearchError("From date must not be after To date")
    if (end - start).days + 1 > MAX_ANALYTICS_DAYS:
        raise SearchError(f"Please choose a period of {MAX_ANALYTICS_DAYS} days or less")
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def _parse_local(text):
    """'2026-10-24T09:30' / '2026-10-24 09:30' (hospital local time, IST) -> aware datetime, or None."""
    cleaned = str(text).strip().replace(" ", "T")[:19]
    if len(cleaned) < 16:          # no clock time (e.g. just a date): it must not be counted as midnight
        return None
    try:
        return datetime.fromisoformat(cleaned).replace(tzinfo=IST)
    except (TypeError, ValueError):
        return None


def _parse_instant(value):
    """A stored timestamp that is either a datetime or an ISO string (UTC unless it says otherwise)."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _percent(part, whole):
    return round(100.0 * part / whole, 1) if whole else None


def _median(values):
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    return ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def _chunks(items, size=LOOKUP_CHUNK):
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]


def get_appointment_analytics(start_date, end_date):
    """Counts, rates and breakdowns for every appointment scheduled between the two dates (inclusive)."""
    query = {"time": _time_range(start_date, end_date)}
    start_d = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_d = datetime.strptime(end_date, "%Y-%m-%d").date()
    days = (end_d - start_d).days + 1

    status_counts = {s: 0 for s in COUNTED_STATUSES + ("no_show", "upcoming")}
    status_counts["other"] = 0
    daily = {(start_d + timedelta(days=i)).strftime("%Y-%m-%d"): {"total": 0, "completed": 0, "cancelled": 0} for i in range(days)}
    by_hour = [0] * 24
    by_weekday = [0] * 7
    booked_by = {}
    doctors = {}
    per_patient = {}
    lead_hours, turnaround_minutes = [], []
    total = 0

    cursor = visits.find(query, {"_id": 0, "institute_id": 1, "doctor_username": 1, "doctor_name": 1, "time": 1,
                                 "status": 1, "booked_by": 1, "booked_at": 1, "consultation_completed_time": 1})
    for v in cursor:
        total += 1
        status = normalize_status(v.get("status"))
        status_counts[status if status in status_counts else "other"] += 1

        when = str(v.get("time") or "")
        day = when[:10]
        if day in daily:
            daily[day]["total"] += 1
            if status in ("completed", "cancelled"):
                daily[day]["completed" if status == "completed" else "cancelled"] += 1
        scheduled = _parse_local(when)
        if scheduled:
            by_hour[scheduled.hour] += 1
            by_weekday[scheduled.weekday()] += 1

        who = str(v.get("booked_by") or "unknown").lower()
        booked_by[who] = booked_by.get(who, 0) + 1

        username = v.get("doctor_username") or "unknown"
        d = doctors.setdefault(username, {"username": username, "name": None, "total": 0, "completed": 0, "cancelled": 0, "no_show": 0})
        d["name"] = v.get("doctor_name") or d["name"] or username
        d["total"] += 1
        if status in ("completed", "cancelled", "no_show"):
            d[status] += 1

        if v.get("institute_id"):
            per_patient[v["institute_id"]] = per_patient.get(v["institute_id"], 0) + 1

        booked_at = _parse_instant(v.get("booked_at"))
        if scheduled and booked_at:
            lead = (scheduled - booked_at).total_seconds() / 3600.0
            if 0 <= lead <= MAX_LEAD_DAYS * 24:
                lead_hours.append(lead)
        if status == "completed" and scheduled:
            finished = _parse_instant(v.get("consultation_completed_time"))
            if finished:
                minutes = (finished - scheduled).total_seconds() / 60.0
                if 0 <= minutes <= MAX_TURNAROUND_MINUTES:
                    turnaround_minutes.append(minutes)

    # patient type of each appointment, and who had been seen before the period (one lookup per 1000 patients)
    type_of = {}
    returning = set()
    for chunk in _chunks(per_patient):
        for p in patients.find({"institute_id": {"$in": chunk}}, {"_id": 0, "institute_id": 1, "patient_type": 1}):
            type_of[p.get("institute_id")] = p.get("patient_type") or "Unknown"
        returning.update(visits.distinct("institute_id", {"institute_id": {"$in": chunk}, "time": {"$lt": start_date}}))
    type_counts = {}
    for iid, n in per_patient.items():
        t = type_of.get(iid, "Unknown")
        type_counts[t] = type_counts.get(t, 0) + n

    resolved = sum(status_counts[s] for s in RESOLVED_STATUSES)
    still_open = sum(status_counts[s] for s in ACTIVE_STATUSES)

    prev_end = start_d - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    prev_total = visits.count_documents({"time": _time_range(prev_start.strftime("%Y-%m-%d"), prev_end.strftime("%Y-%m-%d"))})

    daily_list = [{"date": k, **v} for k, v in daily.items()]
    busiest_day = max(daily_list, key=lambda x: x["total"], default=None)
    busiest_hour = max(range(24), key=lambda h: by_hour[h])
    doctor_list = sorted(
        ({**d, "share_pct": _percent(d["total"], total),
          "completion_rate": _percent(d["completed"], d["completed"] + d["cancelled"] + d["no_show"])} for d in doctors.values()),
        key=lambda d: (-d["total"], str(d["name"])))

    return {
        "range": {"start_date": start_date, "end_date": end_date, "days": days},
        "totals": {"total": total, "resolved": resolved, "open": still_open, "completed": status_counts["completed"],
                   "cancelled": status_counts["cancelled"], "no_show": status_counts["no_show"]},
        "rates": {"completion": _percent(status_counts["completed"], resolved),
                  "cancellation": _percent(status_counts["cancelled"], resolved),
                  "no_show": _percent(status_counts["no_show"], resolved)},
        "previous": {"start_date": prev_start.strftime("%Y-%m-%d"), "end_date": prev_end.strftime("%Y-%m-%d"), "total": prev_total,
                     "change_pct": round(100.0 * (total - prev_total) / prev_total, 1) if prev_total else None},
        "patients": {"unique": len(per_patient), "new": len(per_patient) - len(returning & set(per_patient)),
                     "returning": len(returning & set(per_patient))},
        "timing": {"avg_lead_hours": round(sum(lead_hours) / len(lead_hours), 1) if lead_hours else None,
                   "avg_turnaround_minutes": round(sum(turnaround_minutes) / len(turnaround_minutes)) if turnaround_minutes else None,
                   "median_turnaround_minutes": round(_median(turnaround_minutes)) if turnaround_minutes else None,
                   "turnaround_samples": len(turnaround_minutes)},
        "status": [{"status": s, "count": c} for s, c in status_counts.items() if c or s in COUNTED_STATUSES],
        "daily": daily_list,
        "by_hour": [{"hour": h, "count": c} for h, c in enumerate(by_hour)],
        "by_weekday": [{"weekday": WEEKDAYS[i], "count": c} for i, c in enumerate(by_weekday)],
        "booked_by": sorted(({"booked_by": k, "count": c} for k, c in booked_by.items()), key=lambda x: -x["count"]),
        "patient_types": sorted(({"type": k, "count": c} for k, c in type_counts.items()), key=lambda x: -x["count"]),
        "doctors": doctor_list,
        "busiest": {"day": busiest_day if busiest_day and busiest_day["total"] else None,
                    "hour": {"hour": busiest_hour, "count": by_hour[busiest_hour]} if by_hour[busiest_hour] else None},
    }
