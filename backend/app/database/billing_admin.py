"""Read-only billing queries for the admin dashboard.

Paid bills come from the `bills` collection and carry real amounts. Pending and cancelled bills are not stored as
bills at all: they are visits that have medicines or lab tests but no invoice, so they are only counted and
never given an amount or added to any total. The itemised lines (which medicines and tests were billed) are
reduced to a count in every query here; they belong to the password-protected details step.
"""
import csv
import io
import re

from app.database.core import *
from app.database.appointments_admin import (
    SearchError, EXPORT_LIMIT, DEFAULT_RANGE_DAYS, IST, _parse_date, _safe_cell, normalize_status, today_ist,
)

BILL_STATUSES = (("paid", "Paid"), ("pending", "Pending"), ("cancelled", "Cancelled"))
BILL_STATUS_KEYS = tuple(k for k, _ in BILL_STATUSES)
BILL_STATUS_LABELS = dict(BILL_STATUSES)
BILL_CATEGORIES = ("medicine", "lab_test")


def parse_billing_filters(args, now=None):
    """Validate the query-string filters. With no dates given, the last 30 days are searched."""
    today = today_ist(now)
    end = _parse_date(args.get("end_date") or today.strftime("%Y-%m-%d"), "To date")
    start = _parse_date(
        args.get("start_date") or (end - timedelta(days=DEFAULT_RANGE_DAYS - 1)).strftime("%Y-%m-%d"), "From date")
    if start > end:
        raise SearchError("From date must not be after To date")

    def choice(name, allowed, message):
        value = str(args.get(name) or "").strip().lower()
        if value in ("", "all"):
            return None
        if value not in allowed:
            raise SearchError(message)
        return value

    def text(name, label, limit=100):
        value = str(args.get(name) or "").strip()
        if value.lower() == "all":
            return None
        if len(value) > limit:
            raise SearchError(f"{label} is too long")
        return value or None

    return {
        "start_date": start.strftime("%Y-%m-%d"), "end_date": end.strftime("%Y-%m-%d"),
        "status": choice("status", BILL_STATUS_KEYS, "Unknown status"),
        "category": choice("category", BILL_CATEGORIES, "Unknown category"),
        "payment_mode": text("payment_mode", "Payment mode", 30),
        "patient_type": text("patient_type", "Patient type", 30),
        "doctor": text("doctor", "Doctor filter"),
        "q": text("q", "Search text"),
    }


def _ist_day_bounds(start_date, end_date):
    """[start, end) as UTC instants for IST calendar days (bills store their payment time in UTC)."""
    first = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=IST)
    after = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=IST) + timedelta(days=1)
    return first.astimezone(timezone.utc), after.astimezone(timezone.utc)


def _exact_ci(value):
    return {"$regex": f"^{re.escape(value)}$", "$options": "i"}


def _as_ist_text(value):
    """A stored payment time as IST 'YYYY-MM-DDTHH:MM' (what the appointment screens already show)."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(IST).strftime("%Y-%m-%dT%H:%M")
    return ""


def _money(value):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------------------------
# paid bills
# ---------------------------------------------------------------------------------------------

def _paid_rows(filters):
    first, after = _ist_day_bounds(filters["start_date"], filters["end_date"])
    match = {"payment_date": {"$gte": first, "$lt": after}}
    if filters.get("category"):
        match["bill_category"] = filters["category"]
    if filters.get("payment_mode"):
        match["payment_mode"] = _exact_ci(filters["payment_mode"])
    if filters.get("patient_type"):
        match["patient_type"] = _exact_ci(filters["patient_type"])
    if filters.get("doctor"):
        match["doctor_name"] = filters["doctor"]
    if filters.get("q"):
        needle = re.escape(filters["q"])
        match["$or"] = [{field: {"$regex": needle, "$options": "i"}} for field in ("institute_id", "patient_name", "invoice_no")]

    pipeline = [
        {"$match": match},
        # the itemised lines are reduced to a count inside the database: they never leave it here
        {"$project": {"_id": 0, "invoice_no": 1, "payment_date": 1, "institute_id": 1, "patient_name": 1, "patient_type": 1,
                      "doctor_name": 1, "bill_category": 1, "payment_mode": 1, "total_amount": 1, "reimbursed_amount": 1,
                      "self_paid_amount": 1, "item_count": {"$size": {"$cond": [{"$isArray": "$items"}, "$items", []]}}}},
    ]
    rows = []
    for b in bills.aggregate(pipeline, allowDiskUse=True):
        rows.append({
            "kind": "bill", "key": b.get("invoice_no"), "date": _as_ist_text(b.get("payment_date")), "status": "paid",
            "invoice_no": b.get("invoice_no"), "institute_id": b.get("institute_id"), "patient_name": b.get("patient_name"),
            "patient_type": b.get("patient_type"), "doctor_name": b.get("doctor_name"),
            "category": b.get("bill_category"), "payment_mode": b.get("payment_mode"), "item_count": b.get("item_count", 0),
            "total_amount": _money(b.get("total_amount")), "reimbursed_amount": _money(b.get("reimbursed_amount")),
            "self_paid_amount": _money(b.get("self_paid_amount")),
        })
    return rows


# ---------------------------------------------------------------------------------------------
# pending and cancelled (visits with billable items and no invoice)
# ---------------------------------------------------------------------------------------------

def _order_rows(filters):
    # a payment mode only exists once a bill is paid, so asking for one leaves these out
    if filters.get("payment_mode"):
        return []
    end_exclusive = (datetime.strptime(filters["end_date"], "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    has_items = {"$or": [{"prescriptions.0": {"$exists": True}}, {"lab_tests.0": {"$exists": True}},
                         {"prescription_details.0": {"$exists": True}}]}
    no_invoice = {"$or": [{"invoice_no": {"$exists": False}}, {"invoice_no": None}, {"invoice_no": ""}]}
    clauses = [
        {"time": {"$gte": filters["start_date"], "$lt": end_exclusive}},
        {"status": {"$regex": "^(completed|cancelled)$", "$options": "i"}},
        has_items, no_invoice,
    ]
    if filters.get("doctor"):
        clauses.append({"$or": [{"doctor_name": filters["doctor"]}, {"doctor_username": filters["doctor"]}]})

    def size(field):
        return {"$size": {"$cond": [{"$isArray": f"${field}"}, f"${field}", []]}}

    pipeline = [
        {"$match": {"$and": clauses}},
        {"$project": {"_id": 0, "visit_id": 1, "institute_id": 1, "time": 1, "status": 1, "doctor_username": 1, "doctor_name": 1,
                      "medicines": {"$max": [size("prescriptions"), size("prescription_details")]}, "tests": size("lab_tests")}},
        {"$lookup": {"from": "patients", "let": {"iid": "$institute_id"}, "pipeline": [
            {"$match": {"$expr": {"$eq": ["$institute_id", "$$iid"]}}},
            {"$project": {"_id": 0, "name": 1, "patient_type": 1}}], "as": "_p"}},
        {"$addFields": {"_p": {"$arrayElemAt": ["$_p", 0]}}},
    ]
    later = []
    if filters.get("patient_type"):
        later.append({"_p.patient_type": _exact_ci(filters["patient_type"])})
    if filters.get("q"):
        needle = re.escape(filters["q"])
        later.append({"$or": [{"institute_id": {"$regex": needle, "$options": "i"}}, {"_p.name": {"$regex": needle, "$options": "i"}}]})
    if later:
        pipeline.append({"$match": {"$and": later}})
    pipeline.append({"$addFields": {"patient_name": "$_p.name", "patient_type": "$_p.patient_type"}})
    pipeline.append({"$project": {"_p": 0}})

    rows = []
    for v in visits.aggregate(pipeline, allowDiskUse=True):
        medicines, tests = v.get("medicines", 0), v.get("tests", 0)
        if filters.get("category") == "medicine" and not medicines:
            continue
        if filters.get("category") == "lab_test" and not tests:
            continue
        status = "cancelled" if normalize_status(v.get("status")) == "cancelled" else "pending"
        rows.append({
            "kind": "order", "key": v.get("visit_id"), "date": str(v.get("time") or "").replace(" ", "T")[:16], "status": status,
            "invoice_no": None, "institute_id": v.get("institute_id"), "patient_name": v.get("patient_name"),
            "patient_type": v.get("patient_type"), "doctor_name": v.get("doctor_name") or v.get("doctor_username"),
            "category": "both" if medicines and tests else ("medicine" if medicines else "lab_test"),
            "payment_mode": None, "item_count": medicines + tests,
            "total_amount": None, "reimbursed_amount": None, "self_paid_amount": None,
        })
    return rows


# ---------------------------------------------------------------------------------------------
# list, summary, export
# ---------------------------------------------------------------------------------------------

def _all_rows(filters):
    rows = _paid_rows(filters) + _order_rows(filters)
    rows.sort(key=lambda r: (r["date"], str(r["key"])), reverse=True)
    return rows


def _summary(rows):
    counts = {s: 0 for s in BILL_STATUS_KEYS}
    paid = {"total": 0.0, "reimbursed": 0.0, "self_paid": 0.0}
    for r in rows:
        counts[r["status"]] += 1
        if r["status"] == "paid":                 # only real bills have amounts; pending/cancelled never enter a total
            paid["total"] += r["total_amount"]
            paid["reimbursed"] += r["reimbursed_amount"]
            paid["self_paid"] += r["self_paid_amount"]
    counts["total"] = len(rows)
    return {"counts": counts, "paid_amount": {k: round(v, 2) for k, v in paid.items()}}


def search_billing(filters, page=1, limit=25):
    rows = _all_rows(filters)
    summary = _summary(rows)
    shown = [r for r in rows if r["status"] == filters["status"]] if filters.get("status") else rows
    total = len(shown)
    start = (page - 1) * limit
    return {
        "page": page, "limit": limit, "total": total, "total_pages": max((total + limit - 1) // limit, 1),
        "export_limit": EXPORT_LIMIT, "summary": summary, "rows": shown[start:start + limit],
    }


def export_billing(filters):
    rows = _all_rows(filters)
    if filters.get("status"):
        rows = [r for r in rows if r["status"] == filters["status"]]
    return rows[:EXPORT_LIMIT], len(rows) > EXPORT_LIMIT


def list_billing_filter_options():
    """Values for the filter drop-downs, taken from what exists in the data."""
    def distinct(collection, field):
        return sorted({str(v).strip() for v in collection.distinct(field) if v and str(v).strip()}, key=str.lower)

    doctors = set(distinct(bills, "doctor_name")) | set(distinct(visits, "doctor_name"))
    return {
        "doctors": sorted(doctors, key=str.lower),
        "payment_modes": distinct(bills, "payment_mode"),
        "patient_types": sorted(set(distinct(bills, "patient_type")) | {"Student", "Faculty", "Staff", "Dependant"}, key=str.lower),
    }


CATEGORY_LABELS = {"medicine": "Medicines", "lab_test": "Lab tests", "both": "Medicines + lab tests"}
BILLING_CSV_COLUMNS = ["Date & Time", "Status", "Invoice No", "Patient", "Institute ID", "Patient type", "Doctor", "Category",
                       "Payment mode", "Items", "Total (INR)", "Reimbursed (INR)", "Paid by patient (INR)"]


def billing_to_csv(rows):
    def amount(v):
        return "" if v is None else f"{v:.2f}"

    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(BILLING_CSV_COLUMNS)
    for r in rows:
        writer.writerow([_safe_cell(x) for x in (
            r["date"], BILL_STATUS_LABELS.get(r["status"], r["status"]), r["invoice_no"], r["patient_name"], r["institute_id"],
            r["patient_type"], r["doctor_name"], CATEGORY_LABELS.get(r["category"], r["category"]), r["payment_mode"],
            r["item_count"], amount(r["total_amount"]), amount(r["reimbursed_amount"]), amount(r["self_paid_amount"]))])
    return "﻿" + out.getvalue()


# ---------------------------------------------------------------------------------------------
# itemised lines (password-protected: the route checks the unlock window before calling these)
# ---------------------------------------------------------------------------------------------

def _text(value):
    return "" if value is None else str(value)


def _bill_item(item):
    if not isinstance(item, dict):
        return None
    out = {"type": "lab_test" if item.get("type") == "lab_test" else "medicine", "name": _text(item.get("name")),
           "quantity": item.get("quantity"), "batch": _text(item.get("batch")), "expiry": _text(item.get("expiry"))}
    for field in ("rate", "gross", "discount", "discount_amount", "cgst", "sgst", "item_total"):
        out[field] = _money(item.get(field))
    if not isinstance(out["quantity"], (int, float)) or isinstance(out["quantity"], bool):
        out["quantity"] = None
    return out


def get_bill_details(key):
    """The lines of one paid bill, with only the fields that belong on an invoice (no sponsor or personal data)."""
    if not isinstance(key, str) or not key:
        return None
    b = bills.find_one({"invoice_no": key}, {"_id": 0, "invoice_no": 1, "payment_date": 1, "institute_id": 1, "patient_name": 1,
                                             "patient_type": 1, "doctor_name": 1, "bill_category": 1, "payment_mode": 1,
                                             "items": 1, "unrounded_total": 1, "round_off": 1, "total_amount": 1,
                                             "reimbursed_amount": 1, "self_paid_amount": 1})
    if not b:
        return None
    items = [i for i in (_bill_item(x) for x in (b.get("items") or [])) if i]
    return {
        "kind": "bill", "status": "paid", "key": b.get("invoice_no"), "invoice_no": b.get("invoice_no"),
        "date": _as_ist_text(b.get("payment_date")), "institute_id": b.get("institute_id"), "patient_name": b.get("patient_name"),
        "patient_type": b.get("patient_type"), "doctor_name": b.get("doctor_name"), "category": b.get("bill_category"),
        "payment_mode": b.get("payment_mode"), "items": items,
        "totals": {"items_total": _money(b.get("unrounded_total")), "gst": round(sum(i["cgst"] + i["sgst"] for i in items), 2),
                   "discount": round(sum(i["discount_amount"] for i in items), 2), "round_off": _money(b.get("round_off")),
                   "total": _money(b.get("total_amount")), "reimbursed": _money(b.get("reimbursed_amount")),
                   "self_paid": _money(b.get("self_paid_amount"))},
    }


def get_order_details(key):
    """What a pending or cancelled bill would contain: names and quantities only, never prices."""
    if not isinstance(key, str) or not key:
        return None
    v = visits.find_one({"visit_id": key}, {"_id": 0, "visit_id": 1, "institute_id": 1, "time": 1, "status": 1, "invoice_no": 1,
                                            "doctor_username": 1, "doctor_name": 1, "prescriptions": 1, "prescription_details": 1,
                                            "lab_tests": 1})
    if not v or v.get("invoice_no"):
        return None
    status = normalize_status(v.get("status"))
    if status not in ("completed", "cancelled"):
        return None
    meds = [m for m in (v.get("prescription_details") or v.get("prescriptions") or [])]
    items = []
    for m in meds:
        d = m if isinstance(m, dict) else {"drug": m}
        name = _text(d.get("drug") or d.get("note"))
        if name:
            items.append({"type": "medicine", "name": name, "quantity": _text(d.get("quantity") or "1")})
    for t in v.get("lab_tests") or []:
        if isinstance(t, dict) and t.get("lab_test"):
            items.append({"type": "lab_test", "name": _text(t.get("lab_test")), "quantity": "1"})
    if not items:
        return None
    person = patients.find_one({"institute_id": v.get("institute_id")}, {"_id": 0, "name": 1, "patient_type": 1}) or {}
    return {
        "kind": "order", "status": "cancelled" if status == "cancelled" else "pending", "key": v.get("visit_id"), "invoice_no": None,
        "date": _text(v.get("time")).replace(" ", "T")[:16], "institute_id": v.get("institute_id"),
        "patient_name": person.get("name"), "patient_type": person.get("patient_type"),
        "doctor_name": v.get("doctor_name") or v.get("doctor_username"), "items": items, "totals": None,
    }


def get_billing_details(kind, key):
    if kind == "bill":
        return get_bill_details(key)
    if kind == "order":
        return get_order_details(key)
    return None


# ---------------------------------------------------------------------------------------------
# analytics (paid bills carry the money; pending and cancelled are only counted)
# ---------------------------------------------------------------------------------------------

TOP_DOCTORS = 10
BACKLOG_BUCKETS = (("0–2 days", 0, 2), ("3–7 days", 3, 7), ("8–14 days", 8, 14), ("15–30 days", 15, 30), ("Over 30 days", 31, None))
NO_FILTERS = {"status": None, "category": None, "payment_mode": None, "patient_type": None, "doctor": None, "q": None}


def _number(path):
    return {"$convert": {"input": path, "to": "double", "onError": 0, "onNull": 0}}


def _sum_over_items(expr):
    return {"$sum": {"$map": {"input": {"$cond": [{"$isArray": "$items"}, "$items", []]}, "as": "i", "in": expr}}}


def _paid_for_analytics(start_date, end_date):
    """One slim row per paid bill in the period. GST and discounts are added up inside the database, so the lines stay there."""
    first, after = _ist_day_bounds(start_date, end_date)
    pipeline = [
        {"$match": {"payment_date": {"$gte": first, "$lt": after}}},
        {"$project": {"_id": 0, "payment_date": 1, "total_amount": 1, "reimbursed_amount": 1, "self_paid_amount": 1, "round_off": 1,
                      "bill_category": 1, "payment_mode": 1, "patient_type": 1, "doctor_name": 1,
                      "gst": _sum_over_items({"$add": [_number("$$i.cgst"), _number("$$i.sgst")]}),
                      "lab_discount": _sum_over_items({"$cond": [{"$eq": ["$$i.type", "lab_test"]}, _number("$$i.discount_amount"), 0]})}},
    ]
    return list(bills.aggregate(pipeline, allowDiskUse=True))


def _previous_period(start_date, end_date):
    """The same number of days straight before the period (for 'up/down compared with before')."""
    start, end = _parse_date(start_date, "From date"), _parse_date(end_date, "To date")
    days = (end - start).days + 1
    return (start - timedelta(days=days)).strftime("%Y-%m-%d"), (start - timedelta(days=1)).strftime("%Y-%m-%d")


def _previous_totals(start_date, end_date):
    prev_start, prev_end = _previous_period(start_date, end_date)
    first, after = _ist_day_bounds(prev_start, prev_end)
    row = next(iter(bills.aggregate([
        {"$match": {"payment_date": {"$gte": first, "$lt": after}}},
        {"$group": {"_id": None, "revenue": {"$sum": _number("$total_amount")}, "bills": {"$sum": 1}}}])), None) or {}
    revenue, count = round(float(row.get("revenue", 0)), 2), int(row.get("bills", 0))
    return {"start_date": prev_start, "end_date": prev_end, "revenue": revenue, "bills": count,
            "average_bill": round(revenue / count, 2) if count else 0.0}


def _group(rows, key_of):
    groups = {}
    for r in rows:
        g = groups.setdefault(key_of(r), {"revenue": 0.0, "bills": 0})
        g["revenue"] += _money(r.get("total_amount"))
        g["bills"] += 1
    return [{"name": k, "revenue": round(g["revenue"], 2), "bills": g["bills"]} for k, g in groups.items()]


def _ranked(groups):
    return sorted(groups, key=lambda g: (-g["revenue"], g["name"]))


def _ist_date_of(value):
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(IST).date()
    return None


def _backlog(pending_rows, today):
    """Pending (unpaid, not cancelled) bills by how long ago the visit was."""
    buckets = [{"label": label, "count": 0} for label, _, _ in BACKLOG_BUCKETS]
    oldest = None
    for r in pending_rows:
        try:
            age = (today - datetime.strptime(str(r["date"])[:10], "%Y-%m-%d").date()).days
        except ValueError:
            continue
        age = max(age, 0)
        oldest = age if oldest is None else max(oldest, age)
        for bucket, (_, low, high) in zip(buckets, BACKLOG_BUCKETS):
            if age >= low and (high is None or age <= high):
                bucket["count"] += 1
                break
    return {"total": sum(b["count"] for b in buckets), "oldest_days": oldest, "buckets": buckets}


def build_billing_analytics(start_date, end_date, paid, previous, period_orders, pending_now, today):
    """Pure calculation from the already-fetched rows (kept apart from the queries so it can be tested exactly)."""
    first_day, last_day = _parse_date(start_date, "From date"), _parse_date(end_date, "To date")
    revenue = round(sum(_money(r.get("total_amount")) for r in paid), 2)
    reimbursed = round(sum(_money(r.get("reimbursed_amount")) for r in paid), 2)
    self_paid = round(sum(_money(r.get("self_paid_amount")) for r in paid), 2)
    count = len(paid)

    per_day = {}
    for r in paid:
        day = _ist_date_of(r.get("payment_date"))
        if day:
            cell = per_day.setdefault(day, {"revenue": 0.0, "bills": 0})
            cell["revenue"] += _money(r.get("total_amount"))
            cell["bills"] += 1
    days, cursor = [], first_day
    while cursor <= last_day:
        cell = per_day.get(cursor, {"revenue": 0.0, "bills": 0})
        days.append({"date": cursor.strftime("%Y-%m-%d"), "revenue": round(cell["revenue"], 2), "bills": cell["bills"]})
        cursor += timedelta(days=1)

    by_name = {g["name"]: g for g in _group(paid, lambda r: r.get("bill_category"))}
    by_category = [{"name": name, "label": CATEGORY_LABELS[name], **(by_name.get(name) or {"revenue": 0.0, "bills": 0})}
                   for name in BILL_CATEGORIES]
    doctors = _ranked(_group(paid, lambda r: (r.get("doctor_name") or "").strip() or "Unknown doctor"))
    rest = doctors[TOP_DOCTORS:]

    return {
        "start_date": start_date, "end_date": end_date, "day_count": len(days),
        "kpis": {"revenue": revenue, "bills": count, "average_bill": round(revenue / count, 2) if count else 0.0,
                 "reimbursed": reimbursed, "self_paid": self_paid},
        "previous": previous,
        "revenue_per_day": days,
        "by_category": by_category,
        "by_payment_mode": _ranked(_group(paid, lambda r: (r.get("payment_mode") or "").strip() or "Not recorded")),
        "by_patient_type": _ranked(_group(paid, lambda r: (r.get("patient_type") or "").strip() or "Not recorded")),
        "tax_and_discount": {"gst_collected": round(sum(float(r.get("gst") or 0) for r in paid), 2),
                             "lab_discounts": round(sum(float(r.get("lab_discount") or 0) for r in paid), 2),
                             "round_off": round(sum(_money(r.get("round_off")) for r in paid), 2)},
        "by_doctor": {"top": doctors[:TOP_DOCTORS],
                      "others": {"doctors": len(rest), "revenue": round(sum(g["revenue"] for g in rest), 2), "bills": sum(g["bills"] for g in rest)}},
        "unpaid_in_period": {"pending": sum(1 for r in period_orders if r["status"] == "pending"),
                             "cancelled": sum(1 for r in period_orders if r["status"] == "cancelled")},
        "pending_backlog": _backlog([r for r in pending_now if r["status"] == "pending"], today),
    }


def get_billing_analytics(start_date, end_date):
    today = today_ist()
    paid = _paid_for_analytics(start_date, end_date)
    period_orders = _order_rows({**NO_FILTERS, "start_date": start_date, "end_date": end_date})
    # the backlog is what is unpaid right now, whatever period is on screen
    pending_now = _order_rows({**NO_FILTERS, "start_date": "2000-01-01", "end_date": today.strftime("%Y-%m-%d")})
    return build_billing_analytics(start_date, end_date, paid, _previous_totals(start_date, end_date), period_orders, pending_now, today)
