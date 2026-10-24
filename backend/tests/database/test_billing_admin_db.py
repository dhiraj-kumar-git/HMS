import csv
import io
from datetime import datetime, timezone

import pytest

import app.database.billing_admin as bd

NOW = datetime(2026, 10, 25, 6, 0, tzinfo=timezone.utc)


def filters(**over):
    base = {"start_date": "2026-10-01", "end_date": "2026-10-25", "status": None, "category": None, "payment_mode": None,
            "patient_type": None, "doctor": None, "q": None}
    return {**base, **over}


# ---------------------------------------------------------------- filters

def test_default_period_is_the_last_30_days():
    f = bd.parse_billing_filters({}, now=NOW)
    assert (f["start_date"], f["end_date"]) == ("2026-09-26", "2026-10-25")
    assert all(f[k] is None for k in ("status", "category", "payment_mode", "patient_type", "doctor", "q"))


def test_filters_are_cleaned():
    f = bd.parse_billing_filters({"start_date": "2026-10-01", "end_date": "2026-10-10", "status": " Pending ", "category": "LAB_TEST",
                                  "payment_mode": " UPI ", "patient_type": "Faculty", "doctor": " Dr. X ", "q": " ann "}, now=NOW)
    assert f == {"start_date": "2026-10-01", "end_date": "2026-10-10", "status": "pending", "category": "lab_test",
                 "payment_mode": "UPI", "patient_type": "Faculty", "doctor": "Dr. X", "q": "ann"}


@pytest.mark.parametrize("key", ["status", "category", "payment_mode", "patient_type", "doctor"])
def test_all_means_no_filter(key):
    assert bd.parse_billing_filters({key: "all"}, now=NOW)[key] is None


@pytest.mark.parametrize("args,fragment", [
    ({"start_date": "soon"}, "From date"), ({"end_date": "2026-13-01"}, "To date"), ({"status": "refunded"}, "Unknown status"),
    ({"status": "completed"}, "Unknown status"), ({"category": "x-ray"}, "Unknown category"),
    ({"start_date": "2026-10-10", "end_date": "2026-10-01"}, "must not be after"),
    ({"payment_mode": "x" * 31}, "too long"), ({"patient_type": "x" * 31}, "too long"),
    ({"doctor": "x" * 101}, "too long"), ({"q": "x" * 101}, "too long"),
])
def test_bad_filters_are_refused(args, fragment):
    with pytest.raises(bd.SearchError) as err:
        bd.parse_billing_filters(args, now=NOW)
    assert fragment in str(err.value)


# ---------------------------------------------------------------- dates (bills keep UTC instants, the hospital works in IST)

def test_a_day_range_is_converted_from_india_time_to_utc():
    first, after = bd._ist_day_bounds("2026-10-01", "2026-10-25")
    assert first == datetime(2026, 9, 30, 18, 30, tzinfo=timezone.utc)
    assert after == datetime(2026, 10, 25, 18, 30, tzinfo=timezone.utc)


def test_a_payment_made_just_after_midnight_india_time_falls_on_that_day():
    first, after = bd._ist_day_bounds("2026-10-02", "2026-10-02")
    paid = datetime(2026, 10, 1, 19, 0, tzinfo=timezone.utc)          # 00:30 IST on the 2nd
    assert first <= paid < after
    assert bd._as_ist_text(paid) == "2026-10-02T00:30"


@pytest.mark.parametrize("value,expected", [
    (datetime(2026, 10, 20, 4, 30, tzinfo=timezone.utc), "2026-10-20T10:00"),
    (datetime(2026, 10, 20, 4, 30), "2026-10-20T10:00"),                         # naive = UTC
    ("2026-10-20T04:30:00+00:00", "2026-10-20T10:00"), ("2026-10-20T04:30:00Z", "2026-10-20T10:00"),
    ("garbage", "garbage"), (None, ""),
])
def test_payment_times_are_shown_in_india_time(value, expected):
    assert bd._as_ist_text(value) == expected


# ---------------------------------------------------------------- what the database is asked

@pytest.fixture
def db(mocker):
    b = mocker.patch.object(bd, "bills")
    v = mocker.patch.object(bd, "visits")
    b.aggregate.return_value = []
    v.aggregate.return_value = []
    return b, v


def paid_pipeline(db, **f):
    b, _ = db
    bd._paid_rows(filters(**f))
    return b.aggregate.call_args[0][0]


def order_pipeline(db, **f):
    _, v = db
    bd._order_rows(filters(**f))
    return v.aggregate.call_args[0][0]


def test_paid_bills_are_matched_by_india_day_range(db):
    m = paid_pipeline(db)[0]["$match"]
    assert m == {"payment_date": {"$gte": datetime(2026, 9, 30, 18, 30, tzinfo=timezone.utc), "$lt": datetime(2026, 10, 25, 18, 30, tzinfo=timezone.utc)}}


def test_paid_filters_are_exact_where_they_should_be(db):
    m = paid_pipeline(db, category="lab_test", payment_mode="UPI", patient_type="Faculty", doctor="Dr. X")[0]["$match"]
    assert m["bill_category"] == "lab_test" and m["doctor_name"] == "Dr. X"
    assert m["payment_mode"] == {"$regex": "^UPI$", "$options": "i"} and m["patient_type"] == {"$regex": "^Faculty$", "$options": "i"}


def test_paid_text_search_covers_id_name_and_invoice_and_is_escaped(db):
    m = paid_pipeline(db, q="a.*(b")[0]["$match"]
    assert [list(c)[0] for c in m["$or"]] == ["institute_id", "patient_name", "invoice_no"]
    assert all(c[list(c)[0]]["$regex"] == "a\\.\\*\\(b" for c in m["$or"])


def test_itemised_lines_never_leave_the_database(db):
    project = paid_pipeline(db)[1]["$project"]
    assert "items" not in {k for k, v in project.items() if v == 1} and "items" not in project
    assert "item_count" in project and "$items" in repr(project["item_count"])          # only their number is returned


def test_pending_and_cancelled_are_visits_with_items_and_no_invoice(db):
    m = order_pipeline(db)[0]["$match"]["$and"]
    assert {"time": {"$gte": "2026-10-01", "$lt": "2026-10-26"}} in m
    assert {"status": {"$regex": "^(completed|cancelled)$", "$options": "i"}} in m
    assert {"$or": [{"prescriptions.0": {"$exists": True}}, {"lab_tests.0": {"$exists": True}}, {"prescription_details.0": {"$exists": True}}]} in m
    assert {"$or": [{"invoice_no": {"$exists": False}}, {"invoice_no": None}, {"invoice_no": ""}]} in m


def test_order_doctor_filter_matches_name_or_username(db):
    m = order_pipeline(db, doctor="drx")[0]["$match"]["$and"]
    assert {"$or": [{"doctor_name": "drx"}, {"doctor_username": "drx"}]} in m


def test_no_clinical_data_comes_out_of_the_order_query(db):
    p = order_pipeline(db)
    produced = set()
    for stage in p:
        for k in ("$project", "$addFields"):
            if k in stage:
                produced |= {n for n, v in stage[k].items() if v != 0}
    for secret in ("prescriptions", "prescription_details", "lab_tests", "lab_reports", "emr_data", "diagnosis_note", "remarks", "items"):
        assert secret not in produced, secret
    look = [s for s in p if "$lookup" in s][0]["$lookup"]
    assert set(look["pipeline"][1]["$project"]) == {"_id", "name", "patient_type"}


def test_asking_for_a_payment_mode_leaves_pending_and_cancelled_out(db):
    _, v = db
    assert bd._order_rows(filters(payment_mode="UPI")) == []
    v.aggregate.assert_not_called()


def test_patient_filters_on_orders_are_applied_after_the_patient_lookup(db):
    p = order_pipeline(db, patient_type="Staff", q="ann")
    later = [s for s in p if "$match" in s and "$and" in s["$match"] and "_p" in repr(s)][0]["$match"]["$and"]
    assert {"_p.patient_type": {"$regex": "^Staff$", "$options": "i"}} in later


# ---------------------------------------------------------------- rows

def bill(inv, paid, total, reimb, mode="UPI", cat="medicine", **extra):
    return {"invoice_no": inv, "payment_date": paid, "institute_id": "H1", "patient_name": "Ann Lee", "patient_type": "Faculty",
            "doctor_name": "Dr. X", "bill_category": cat, "payment_mode": mode, "total_amount": total, "reimbursed_amount": reimb,
            "self_paid_amount": total - reimb, "item_count": 3, **extra}


def visit(vid, time, status, meds=1, tests=0, iid="H2", name="Bob Roy", ptype="Student", doctor="Dr. Y"):
    return {"visit_id": vid, "institute_id": iid, "time": time, "status": status, "doctor_username": "dry", "doctor_name": doctor,
            "medicines": meds, "tests": tests, "patient_name": name, "patient_type": ptype}


def utc(day, hh, mm):
    return datetime(2026, 10, day, hh, mm, tzinfo=timezone.utc)


def test_paid_row_fields(db):
    b, _ = db
    b.aggregate.return_value = [bill("INV-1", utc(20, 4, 30), 200.0, 180.0, item_count=4)]
    row = bd._paid_rows(filters())[0]
    assert row == {"kind": "bill", "key": "INV-1", "date": "2026-10-20T10:00", "status": "paid", "invoice_no": "INV-1",
                   "institute_id": "H1", "patient_name": "Ann Lee", "patient_type": "Faculty", "doctor_name": "Dr. X",
                   "category": "medicine", "payment_mode": "UPI", "item_count": 4, "total_amount": 200.0,
                   "reimbursed_amount": 180.0, "self_paid_amount": 20.0}


def test_amounts_are_rounded_and_missing_ones_are_zero(db):
    b, _ = db
    b.aggregate.return_value = [bill("INV-1", utc(20, 4, 30), 100.456, 0, reimbursed_amount=None, self_paid_amount="oops")]
    row = bd._paid_rows(filters())[0]
    assert (row["total_amount"], row["reimbursed_amount"], row["self_paid_amount"]) == (100.46, 0.0, 0.0)


def test_order_rows_have_no_amounts_and_the_right_category(db):
    _, v = db
    v.aggregate.return_value = [visit("a", "2026-10-20T10:00", "completed", 2, 0), visit("b", "2026-10-21T10:00", "completed", 0, 3),
                                visit("c", "2026-10-22 10:00", "Completed", 1, 1)]
    rows = {r["key"]: r for r in bd._order_rows(filters())}
    assert [rows[k]["category"] for k in "abc"] == ["medicine", "lab_test", "both"]
    assert [rows[k]["item_count"] for k in "abc"] == [2, 3, 2]
    assert rows["c"]["date"] == "2026-10-22T10:00"                        # a space becomes the usual 'T'
    for r in rows.values():
        assert r["status"] == "pending" and r["kind"] == "order" and r["invoice_no"] is None and r["payment_mode"] is None
        assert (r["total_amount"], r["reimbursed_amount"], r["self_paid_amount"]) == (None, None, None)


@pytest.mark.parametrize("raw,expected", [("completed", "pending"), ("Completed", "pending"), ("cancelled", "cancelled"), ("Cancelled", "cancelled")])
def test_order_status(db, raw, expected):
    _, v = db
    v.aggregate.return_value = [visit("a", "2026-10-20T10:00", raw)]
    assert bd._order_rows(filters())[0]["status"] == expected


def test_category_filter_drops_orders_without_that_kind_of_item(db):
    _, v = db
    v.aggregate.return_value = [visit("med", "2026-10-20T10:00", "completed", 1, 0), visit("lab", "2026-10-20T11:00", "completed", 0, 1),
                                visit("both", "2026-10-20T12:00", "completed", 1, 1)]
    assert {r["key"] for r in bd._order_rows(filters(category="medicine"))} == {"med", "both"}
    assert {r["key"] for r in bd._order_rows(filters(category="lab_test"))} == {"lab", "both"}


def test_doctor_name_falls_back_to_the_username(db):
    _, v = db
    v.aggregate.return_value = [visit("a", "2026-10-20T10:00", "completed", doctor=None)]
    assert bd._order_rows(filters())[0]["doctor_name"] == "dry"


# ---------------------------------------------------------------- the combined list, summary and paging

@pytest.fixture
def data(db):
    b, v = db
    b.aggregate.return_value = [bill("INV-1", utc(20, 4, 30), 200.0, 180.0), bill("INV-2", utc(22, 4, 30), 100.5, 0.0, mode="Cash", cat="lab_test"),
                                bill("INV-3", utc(18, 4, 30), 50.0, 45.0)]
    v.aggregate.return_value = [visit("p1", "2026-10-21T10:00", "completed", 1, 1), visit("c1", "2026-10-19T10:00", "cancelled", 0, 2)]
    return b, v


def test_everything_is_in_one_list_newest_first(data):
    rows = bd.search_billing(filters())["rows"]
    assert [r["key"] for r in rows] == ["INV-2", "p1", "INV-1", "c1", "INV-3"]
    assert [r["status"] for r in rows] == ["paid", "pending", "paid", "cancelled", "paid"]


def test_summary_counts_every_status_and_totals_only_paid_bills(data):
    s = bd.search_billing(filters())["summary"]
    assert s["counts"] == {"paid": 3, "pending": 1, "cancelled": 1, "total": 5}
    assert s["paid_amount"] == {"total": 350.5, "reimbursed": 225.0, "self_paid": 125.5}


def test_pending_and_cancelled_never_add_to_the_amounts(data):
    b, v = data
    v.aggregate.return_value = [visit(f"p{i}", "2026-10-21T10:00", "completed", 5, 5) for i in range(50)]
    s = bd.search_billing(filters())["summary"]
    assert s["counts"]["pending"] == 50 and s["paid_amount"]["total"] == 350.5


def test_status_filter_narrows_the_list_but_not_the_summary(data):
    out = bd.search_billing(filters(status="paid"))
    assert [r["key"] for r in out["rows"]] == ["INV-2", "INV-1", "INV-3"] and out["total"] == 3
    assert out["summary"]["counts"]["pending"] == 1 and out["summary"]["counts"]["total"] == 5
    assert [r["key"] for r in bd.search_billing(filters(status="cancelled"))["rows"]] == ["c1"]


def test_a_payment_mode_filter_removes_unpaid_rows_from_list_and_summary(data):
    b, v = data
    b.aggregate.return_value = [bill("INV-2", utc(22, 4, 30), 100.5, 0.0, mode="Cash")]
    out = bd.search_billing(filters(payment_mode="Cash"))
    assert out["summary"]["counts"] == {"paid": 1, "pending": 0, "cancelled": 0, "total": 1}
    v.aggregate.assert_not_called()


def test_paging(db):
    b, _ = db
    b.aggregate.return_value = [bill(f"INV-{i:03d}", utc(1 + i % 20, 4, 30), 10.0, 0.0) for i in range(60)]
    p1, p3 = bd.search_billing(filters(), 1, 25), bd.search_billing(filters(), 3, 25)
    assert (p1["total"], p1["total_pages"], len(p1["rows"]), len(p3["rows"])) == (60, 3, 25, 10)
    assert bd.search_billing(filters(), 9, 25)["rows"] == []


def test_nothing_found(db):
    out = bd.search_billing(filters())
    assert out["rows"] == [] and out["total"] == 0 and out["total_pages"] == 1
    assert out["summary"] == {"counts": {"paid": 0, "pending": 0, "cancelled": 0, "total": 0}, "paid_amount": {"total": 0.0, "reimbursed": 0.0, "self_paid": 0.0}}


def test_amounts_are_added_without_float_dust(db):
    b, _ = db
    b.aggregate.return_value = [bill(f"INV-{i}", utc(20, 4, 30), 0.1, 0.0) for i in range(30)]
    assert bd.search_billing(filters())["summary"]["paid_amount"]["total"] == 3.0


# ---------------------------------------------------------------- export and CSV

def parse_csv(text):
    return list(csv.reader(io.StringIO(text.lstrip("﻿"))))


def test_export_follows_the_same_filters_and_reports_truncation(data, monkeypatch):
    rows, truncated = bd.export_billing(filters(status="paid"))
    assert [r["key"] for r in rows] == ["INV-2", "INV-1", "INV-3"] and truncated is False
    monkeypatch.setattr(bd, "EXPORT_LIMIT", 2)
    rows, truncated = bd.export_billing(filters())
    assert len(rows) == 2 and truncated is True


def test_csv_has_amounts_for_paid_and_blanks_for_the_rest(data):
    rows, _ = bd.export_billing(filters())
    table = parse_csv(bd.billing_to_csv(rows))
    assert table[0] == bd.BILLING_CSV_COLUMNS
    by_status = {r[1]: r for r in table[1:]}
    assert table[1] == ["2026-10-22T10:00", "Paid", "INV-2", "Ann Lee", "H1", "Faculty", "Dr. X", "Lab tests", "Cash", "3", "100.50", "0.00", "100.50"]
    assert by_status["Pending"][2] == "" and by_status["Pending"][10:] == ["", "", ""] and by_status["Pending"][7] == "Medicines + lab tests"
    assert by_status["Cancelled"][7] == "Lab tests" and by_status["Cancelled"][10:] == ["", "", ""]


@pytest.mark.parametrize("name", ['=HYPERLINK("http://evil","x")', "+1+1", "-2+3", "@SUM(A1)"])
def test_csv_cannot_carry_formulas(name):
    row = {"kind": "bill", "key": "k", "date": "d", "status": "paid", "invoice_no": "INV", "institute_id": "H1", "patient_name": name,
           "patient_type": "Staff", "doctor_name": "Dr", "category": "medicine", "payment_mode": "UPI", "item_count": 1,
           "total_amount": 1.0, "reimbursed_amount": 0.0, "self_paid_amount": 1.0}
    assert parse_csv(bd.billing_to_csv([row]))[1][3] == "'" + name


# ---------------------------------------------------------------- filter options

def test_filter_options_come_from_the_data(db):
    b, v = db
    b.distinct.side_effect = lambda field: {"doctor_name": ["Dr. X", "dr. a"], "payment_mode": ["UPI", "Cash", None, " "], "patient_type": ["Faculty", "Other"]}[field]
    v.distinct.side_effect = lambda field: ["Dr. Y", "Dr. X"]
    out = bd.list_billing_filter_options()
    assert out["doctors"] == ["dr. a", "Dr. X", "Dr. Y"]
    assert out["payment_modes"] == ["Cash", "UPI"]
    assert out["patient_types"] == ["Dependant", "Faculty", "Other", "Staff", "Student"]
