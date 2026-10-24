from datetime import date, datetime, timezone

import pytest

import app.database.billing_admin as bd

UTC = timezone.utc
TODAY = date(2026, 10, 25)


def bill(day, hour, total, mode="UPI", cat="medicine", ptype="Faculty", doctor="Dr. X", reimbursed=0.0, round_off=0.0, gst=0.0, lab_discount=0.0):
    """A paid bill; `day`/`hour` are given in UTC so the IST day can differ from the UTC one."""
    return {"payment_date": datetime(2026, 10, day, hour, 0, tzinfo=UTC), "total_amount": total, "reimbursed_amount": reimbursed,
            "self_paid_amount": round(total - reimbursed, 2), "round_off": round_off, "bill_category": cat, "payment_mode": mode,
            "patient_type": ptype, "doctor_name": doctor, "gst": gst, "lab_discount": lab_discount}


def order(day, status="pending"):
    return {"date": f"2026-10-{day:02d}T10:00", "status": status}


PREV = {"start_date": "2026-09-27", "end_date": "2026-10-01", "revenue": 100.0, "bills": 2, "average_bill": 50.0}


def build(paid, period_orders=(), pending_now=(), start="2026-10-02", end="2026-10-06", previous=PREV):
    return bd.build_billing_analytics(start, end, list(paid), previous, list(period_orders), list(pending_now), TODAY)


PAID = [
    bill(2, 5, 100, "UPI", "medicine", "Faculty", "Dr. X", reimbursed=90, round_off=-0.4, gst=12, ),
    bill(2, 20, 50, "Cash", "lab_test", "Student", "Dr. Y", round_off=0.2, lab_discount=50),     # 20:00 UTC = 01:30 IST on the 3rd
    bill(4, 6, 200, "UPI", "medicine", "Faculty", "Dr. X", reimbursed=180, gst=24),
    bill(4, 7, 25.5, "UPI", "lab_test", "", "", lab_discount=25.5),
]


def test_headline_numbers():
    k = build(PAID)["kpis"]
    assert k == {"revenue": 375.5, "bills": 4, "average_bill": 93.88, "reimbursed": 270.0, "self_paid": 105.5}
    assert k["reimbursed"] + k["self_paid"] == k["revenue"]


def test_the_previous_period_is_passed_through_for_the_comparison():
    assert build(PAID)["previous"] == PREV


def test_every_day_is_listed_and_bills_fall_on_their_india_day():
    days = build(PAID)["revenue_per_day"]
    assert [d["date"] for d in days] == ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]
    # 05:00 UTC is 10:30 IST on the 2nd; 20:00 UTC is 01:30 IST on the 3rd
    assert [(d["revenue"], d["bills"]) for d in days] == [(100.0, 1), (50.0, 1), (225.5, 2), (0.0, 0), (0.0, 0)]
    assert sum(d["revenue"] for d in days) == 375.5


def test_medicine_versus_lab_tests_always_lists_both():
    assert [(c["name"], c["label"], c["revenue"], c["bills"]) for c in build(PAID)["by_category"]] == [
        ("medicine", "Medicines", 300.0, 2), ("lab_test", "Lab tests", 75.5, 2)]
    only_meds = build([PAID[0]])["by_category"]
    assert [(c["name"], c["revenue"], c["bills"]) for c in only_meds] == [("medicine", 100.0, 1), ("lab_test", 0.0, 0)]


def test_payment_modes_and_patient_types_are_ranked_by_revenue():
    out = build(PAID)
    assert [(g["name"], g["revenue"], g["bills"]) for g in out["by_payment_mode"]] == [("UPI", 325.5, 3), ("Cash", 50.0, 1)]
    assert [(g["name"], g["revenue"], g["bills"]) for g in out["by_patient_type"]] == [
        ("Faculty", 300.0, 2), ("Student", 50.0, 1), ("Not recorded", 25.5, 1)]


def test_tax_discounts_and_round_off():
    assert build(PAID)["tax_and_discount"] == {"gst_collected": 36.0, "lab_discounts": 75.5, "round_off": -0.2}


def test_doctors_are_ranked_and_a_missing_name_is_labelled():
    top = build(PAID)["by_doctor"]["top"]
    assert [(g["name"], g["revenue"], g["bills"]) for g in top] == [("Dr. X", 300.0, 2), ("Dr. Y", 50.0, 1), ("Unknown doctor", 25.5, 1)]


def test_only_the_top_ten_doctors_are_listed_and_the_rest_are_summed():
    paid = [bill(3, 6, 100 - i, doctor=f"Dr {i:02d}") for i in range(13)]
    d = build(paid)["by_doctor"]
    assert len(d["top"]) == 10 and d["top"][0]["name"] == "Dr 00"
    assert d["others"] == {"doctors": 3, "revenue": 267.0, "bills": 3}


def test_equal_revenue_keeps_a_stable_order():
    paid = [bill(3, 6, 10, doctor="Dr. B"), bill(3, 6, 10, doctor="Dr. A")]
    assert [g["name"] for g in build(paid)["by_doctor"]["top"]] == ["Dr. A", "Dr. B"]


def test_pending_and_cancelled_are_counted_never_summed():
    out = build(PAID, period_orders=[order(3), order(4), order(5, "cancelled")])
    assert out["unpaid_in_period"] == {"pending": 2, "cancelled": 1}
    assert out["kpis"]["revenue"] == 375.5 and out["kpis"]["bills"] == 4


def test_backlog_buckets_by_age_and_ignores_cancelled():
    # today is 25 Oct: ages 0,2 | 3,7 | 8 | 15,30 | 31 (a cancelled one is ignored)
    pending = [order(25), order(23), order(22), order(18), order(17), order(10), {"date": "2026-09-25T10:00", "status": "pending"},
               {"date": "2026-09-24T10:00", "status": "pending"}, order(20, "cancelled")]
    b = build([], pending_now=pending)["pending_backlog"]
    assert [(x["label"], x["count"]) for x in b["buckets"]] == [
        ("0–2 days", 2), ("3–7 days", 2), ("8–14 days", 1), ("15–30 days", 2), ("Over 30 days", 1)]
    assert b["total"] == 8 and b["oldest_days"] == 31


def test_backlog_with_nothing_pending_or_bad_dates():
    b = build([], pending_now=[{"date": "", "status": "pending"}, {"date": "nonsense", "status": "pending"}])["pending_backlog"]
    assert b["total"] == 0 and b["oldest_days"] is None
    assert build([])["pending_backlog"]["total"] == 0


def test_a_future_dated_visit_counts_as_today_not_a_negative_age():
    b = build([], pending_now=[order(28)])["pending_backlog"]
    assert b["buckets"][0]["count"] == 1 and b["oldest_days"] == 0


def test_an_empty_period_is_all_zero_and_still_has_every_day():
    out = build([], previous={**PREV, "revenue": 0.0, "bills": 0, "average_bill": 0.0})
    assert out["kpis"] == {"revenue": 0.0, "bills": 0, "average_bill": 0.0, "reimbursed": 0.0, "self_paid": 0.0}
    assert out["day_count"] == 5 and all(d["revenue"] == 0 and d["bills"] == 0 for d in out["revenue_per_day"])
    assert out["by_payment_mode"] == [] and out["by_doctor"]["top"] == []
    assert out["tax_and_discount"] == {"gst_collected": 0.0, "lab_discounts": 0.0, "round_off": 0.0}


def test_odd_stored_values_do_not_break_it():
    odd = {"payment_date": datetime(2026, 10, 3, 6, tzinfo=UTC), "total_amount": "abc", "reimbursed_amount": None, "self_paid_amount": None,
           "round_off": "x", "gst": None, "lab_discount": None, "bill_category": "other"}
    out = build([odd])
    assert out["kpis"]["revenue"] == 0.0 and out["kpis"]["bills"] == 1
    assert [c["bills"] for c in out["by_category"]] == [0, 0]


def test_a_missing_payment_date_is_left_out_of_the_days_but_not_the_totals():
    out = build([{**bill(3, 6, 40), "payment_date": None}])
    assert out["kpis"]["revenue"] == 40.0 and sum(d["bills"] for d in out["revenue_per_day"]) == 0


# ---------------------------------------------------------------- what the database is asked

@pytest.fixture
def db(mocker):
    b = mocker.patch.object(bd, "bills")
    v = mocker.patch.object(bd, "visits")
    b.aggregate.return_value = []
    v.aggregate.return_value = []
    return b, v


def test_the_previous_period_is_the_same_length_straight_before():
    assert bd._previous_period("2026-10-02", "2026-10-06") == ("2026-09-27", "2026-10-01")
    assert bd._previous_period("2026-10-06", "2026-10-06") == ("2026-10-05", "2026-10-05")
    assert bd._previous_period("2026-03-01", "2026-03-31") == ("2026-01-29", "2026-02-28")


def test_previous_totals_come_from_one_grouped_query(db):
    db[0].aggregate.return_value = [{"_id": None, "revenue": 300.0, "bills": 4}]
    out = bd._previous_totals("2026-10-02", "2026-10-06")
    assert out == {"start_date": "2026-09-27", "end_date": "2026-10-01", "revenue": 300.0, "bills": 4, "average_bill": 75.0}
    pipeline = db[0].aggregate.call_args[0][0]
    assert pipeline[1]["$group"]["bills"] == {"$sum": 1}


def test_previous_totals_with_no_bills(db):
    assert bd._previous_totals("2026-10-02", "2026-10-06")["average_bill"] == 0.0


def test_the_bill_query_is_by_india_day_range_and_sums_lines_inside_the_database(db):
    bd._paid_for_analytics("2026-10-02", "2026-10-06")
    match, project = db[0].aggregate.call_args[0][0]
    assert match["$match"]["payment_date"]["$gte"] == datetime(2026, 10, 1, 18, 30, tzinfo=UTC)       # 00:00 IST on the 2nd
    assert match["$match"]["payment_date"]["$lt"] == datetime(2026, 10, 6, 18, 30, tzinfo=UTC)        # 00:00 IST on the 7th
    fields = project["$project"]
    assert "items" not in fields and "gst" in fields and "lab_discount" in fields
    assert not any(k in fields for k in ("sponsor_name", "sponsor_psrn", "age", "institute_id", "patient_name", "invoice_no"))


def test_analytics_uses_orders_for_the_period_and_for_the_backlog(db, mocker):
    calls = []
    mocker.patch.object(bd, "_order_rows", side_effect=lambda f: calls.append(f) or [])
    mocker.patch.object(bd, "today_ist", return_value=TODAY)
    out = bd.get_billing_analytics("2026-10-02", "2026-10-06")
    assert (calls[0]["start_date"], calls[0]["end_date"]) == ("2026-10-02", "2026-10-06")
    assert calls[1]["end_date"] == "2026-10-25" and calls[1]["start_date"] < "2026-01-01"
    assert all(calls[i][k] is None for i in (0, 1) for k in ("status", "category", "payment_mode", "patient_type", "doctor", "q"))
    assert out["kpis"]["bills"] == 0
