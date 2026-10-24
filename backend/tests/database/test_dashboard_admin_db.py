from datetime import date, datetime, timedelta, timezone

import pytest

import app.database.dashboard_admin as dd

TODAY = date(2026, 10, 25)                                   # a Sunday
NOW = datetime(2026, 10, 25, 8, 0, tzinfo=timezone.utc)      # 13:30 IST on the same day


@pytest.fixture
def db(mocker):
    return {name: mocker.patch.object(dd, name) for name in ("visits", "bills", "patients", "users")}


# ---------------------------------------------------------------- today's appointments

def test_todays_appointments_are_counted_by_outcome_and_older_spellings(db):
    statuses = ["booked", "Checked in", "consultation", "Confirmed", "completed", "Completed", "cancelled", "no_show", None, "Upcoming"]
    db["visits"].find.return_value = [{"status": s} for s in statuses]
    assert dd._appointments_today(TODAY) == {"total": 10, "open": 5, "completed": 2, "cancelled": 1, "other": 2}


def test_todays_appointments_ask_for_exactly_today(db):
    db["visits"].find.return_value = []
    dd._appointments_today(TODAY)
    query, projection = db["visits"].find.call_args.args
    assert query == {"time": {"$gte": "2026-10-25", "$lt": "2026-10-26"}} and projection == {"_id": 0, "status": 1}
    assert dd._appointments_today(TODAY) == {"total": 0, "open": 0, "completed": 0, "cancelled": 0, "other": 0}


# ---------------------------------------------------------------- the 14-day trend

def test_trend_lists_every_day_with_zeros_and_ends_today(db):
    db["bills"].aggregate.return_value = [{"_id": "2026-10-25", "revenue": 300.456, "bills": 3}, {"_id": "2026-10-24", "revenue": 50.0, "bills": 1},
                                          {"_id": "2026-10-12", "revenue": 99.0, "bills": 9}]      # outside the window: ignored
    db["visits"].aggregate.return_value = [{"_id": "2026-10-25", "n": 4}, {"_id": "2026-10-12", "n": 2}, {"_id": "2026-10-01", "n": 7}]
    t = dd._trend(TODAY)
    assert len(t) == 14 and t[0]["date"] == "2026-10-12" and t[-1]["date"] == "2026-10-25"
    assert t[-1] == {"date": "2026-10-25", "appointments": 4, "revenue": 300.46, "bills": 3}
    assert t[-2] == {"date": "2026-10-24", "appointments": 0, "revenue": 50.0, "bills": 1}
    assert t[0]["appointments"] == 2 and t[0]["revenue"] == 99.0
    assert sum(d["appointments"] for d in t) == 6                                                  # the 1 Oct row is outside the window


def test_trend_asks_for_india_days(db):
    db["bills"].aggregate.return_value = []
    db["visits"].aggregate.return_value = []
    dd._trend(TODAY)
    bills_pipe = db["bills"].aggregate.call_args[0][0]
    assert bills_pipe[0]["$match"]["payment_date"]["$gte"] == datetime(2026, 10, 11, 18, 30, tzinfo=timezone.utc)      # 00:00 IST on the 12th
    assert bills_pipe[0]["$match"]["payment_date"]["$lt"] == datetime(2026, 10, 25, 18, 30, tzinfo=timezone.utc)       # 00:00 IST on the 26th
    assert bills_pipe[1]["$group"]["_id"]["$dateToString"]["timezone"] == "+05:30"
    visits_pipe = db["visits"].aggregate.call_args[0][0]
    assert visits_pipe[0]["$match"]["time"] == {"$gte": "2026-10-12", "$lt": "2026-10-26"}


def test_revenue_today_and_yesterday_come_from_the_trend():
    trend = [{"date": "2026-10-24", "appointments": 1, "revenue": 50.0, "bills": 1}, {"date": "2026-10-25", "appointments": 4, "revenue": 300.46, "bills": 3}]
    assert dd._revenue_from_trend(trend) == {"today": 300.46, "bills_today": 3, "yesterday": 50.0, "bills_yesterday": 1}


# ---------------------------------------------------------------- pending bills and lab orders

def test_pending_bills_count_age_and_old_ones(mocker):
    rows = [{"status": "pending", "date": d} for d in ("2026-10-25T09:00", "2026-10-22T09:00", "2026-10-17T09:00", "2026-09-15T09:00")]
    rows += [{"status": "cancelled", "date": "2026-01-01T09:00"}]
    order_rows = mocker.patch.object(dd._billing, "_order_rows", return_value=rows)
    out = dd._pending_bills(TODAY)
    assert out == {"total": 4, "oldest_days": 40, "over_7_days": 2}        # ages 0, 3, 8, 40 (the cancelled one is ignored)
    assert order_rows.call_args.args[0]["start_date"] == "2000-01-01" and order_rows.call_args.args[0]["end_date"] == "2026-10-25"


def test_no_pending_bills(mocker):
    mocker.patch.object(dd._billing, "_order_rows", return_value=[])
    assert dd._pending_bills(TODAY) == {"total": 0, "oldest_days": None, "over_7_days": 0}


def test_lab_orders_that_still_need_work(mocker):
    statuses = ["awaiting_payment", "awaiting_payment", "pending", "in_progress", "partially_completed", "completed", "cancelled"]
    order_rows = mocker.patch.object(dd._lab, "_order_rows", return_value=[{"status": s} for s in statuses])
    out = dd._lab_orders(TODAY)
    assert out == {"open": 5, "by_status": {"awaiting_payment": 2, "pending": 1, "in_progress": 1, "partially_completed": 1}, "days": 30}
    f = order_rows.call_args.args[0]
    assert (f["start_date"], f["end_date"]) == ("2026-09-26", "2026-10-25")


# ---------------------------------------------------------------- patients and staff

def test_patients_by_type_merge_blank_names_and_exclude_archived(db):
    db["patients"].aggregate.return_value = [{"_id": "Student", "n": 5}, {"_id": "Faculty", "n": 2}, {"_id": "  ", "n": 2}, {"_id": "Unknown", "n": 1}]
    db["patients"].count_documents.return_value = 3
    out = dd._patients(NOW)
    assert out == {"total": 10, "new_this_week": 3, "by_type": [{"name": "Student", "count": 5}, {"name": "Unknown", "count": 3}, {"name": "Faculty", "count": 2}]}
    assert db["patients"].aggregate.call_args[0][0][0] == {"$match": {"account_status": {"$ne": "archived"}}}
    query = db["patients"].count_documents.call_args.args[0]
    assert query["account_status"] == {"$ne": "archived"} and query["registration_time"]["$gte"] == NOW - timedelta(days=7)


def test_staff_counts_only_working_roles(db):
    db["users"].aggregate.return_value = [{"_id": "doctor", "n": 8}, {"_id": "lab_staff", "n": 2}]
    assert dd._staff() == {"total": 10, "by_role": {"doctor": 8, "receptionist": 0, "lab_staff": 2, "medical_store": 0}}
    assert db["users"].aggregate.call_args[0][0][0]["$match"]["role"]["$in"] == ["doctor", "receptionist", "lab_staff", "medical_store"]


def test_new_patients_are_five_newest_with_only_safe_fields(db):
    cursor = db["patients"].find.return_value.sort.return_value.limit
    cursor.return_value = [{"name": "Ann", "institute_id": "H1", "patient_type": "Student", "registration_time": datetime(2026, 10, 24, 19, 0, tzinfo=timezone.utc)},
                           {"name": "Bob", "institute_id": "H2"}]
    assert dd._new_patients() == [{"name": "Ann", "institute_id": "H1", "patient_type": "Student", "registered": "2026-10-25T00:30"},
                                  {"name": "Bob", "institute_id": "H2", "patient_type": None, "registered": ""}]
    query, projection = db["patients"].find.call_args.args
    assert query == {"account_status": {"$ne": "archived"}}
    assert set(projection) == {"_id", "name", "institute_id", "patient_type", "registration_time"}
    db["patients"].find.return_value.sort.assert_called_once_with("registration_time", -1)
    cursor.assert_called_once_with(5)


# ---------------------------------------------------------------- needs attention

def test_left_open_appointments_are_before_today_and_within_30_days(db):
    db["visits"].count_documents.return_value = 6
    assert dd._left_open(TODAY) == 6
    q = db["visits"].count_documents.call_args.args[0]
    assert q["time"] == {"$gte": "2026-09-25", "$lt": "2026-10-25"} and q["status"]["$options"] == "i"
    import re
    pattern = re.compile(q["status"]["$regex"], re.I)
    assert all(pattern.match(s) for s in ("booked", "Confirmed", "Checked in", "checked_in", "consultation", "upcoming"))
    assert not any(pattern.match(s) for s in ("completed", "cancelled", "no_show", "booked now"))


def test_attention_list_and_unknowns():
    items = dd.build_attention(3, {"over_7_days": 2}, {"by_status": {"awaiting_payment": 4}})
    assert [(i["key"], i["count"], i["link"]) for i in items] == [("left_open", 3, "appointments"), ("old_bills", 2, "billing"), ("lab_unpaid", 4, "reports")]
    unknown = dd.build_attention(None, None, None)
    assert [i["count"] for i in unknown] == [None, None, None]


# ---------------------------------------------------------------- all together

ALL = ("_appointments_today", "_trend", "_pending_bills", "_lab_orders", "_patients", "_staff", "_new_patients", "_left_open")


@pytest.fixture
def parts(mocker):
    values = {"_appointments_today": {"total": 1}, "_trend": [{"date": "a", "appointments": 0, "revenue": 1.0, "bills": 1},
                                                              {"date": "b", "appointments": 2, "revenue": 5.0, "bills": 2}],
              "_pending_bills": {"total": 2, "oldest_days": 9, "over_7_days": 1}, "_lab_orders": {"open": 1, "by_status": {"awaiting_payment": 1}},
              "_patients": {"total": 9}, "_staff": {"total": 4}, "_new_patients": [], "_left_open": 7}
    return {name: mocker.patch.object(dd, name, return_value=value) for name, value in values.items()}


def test_dashboard_has_every_section(parts):
    out = dd.get_admin_dashboard(NOW)
    assert out["date"] == "2026-10-25" and out["errors"] == []
    assert out["revenue"] == {"today": 5.0, "bills_today": 2, "yesterday": 1.0, "bills_yesterday": 1}
    assert out["appointments_today"] == {"total": 1} and out["patients"] == {"total": 9} and out["staff"] == {"total": 4}
    assert [i["count"] for i in out["attention"]] == [7, 1, 1]


@pytest.mark.parametrize("broken", ALL)
def test_one_broken_section_does_not_blank_the_rest(parts, mocker, broken):
    mocker.patch.object(dd, broken, side_effect=RuntimeError("mongodb://secret"))
    out = dd.get_admin_dashboard(NOW)
    assert out["errors"] == [broken.lstrip("_")]
    assert "secret" not in repr(out)
    others = {"_appointments_today": "appointments_today", "_pending_bills": "pending_bills", "_lab_orders": "lab_orders", "_patients": "patients",
              "_staff": "staff", "_new_patients": "new_patients"}
    for name, key in others.items():
        if name != broken:
            assert out[key] is not None
    if broken == "_trend":
        assert out["revenue"] is None and out["trend"] is None


def test_a_failed_section_is_unknown_in_the_attention_list_not_zero(parts, mocker):
    mocker.patch.object(dd, "_pending_bills", side_effect=RuntimeError("x"))
    mocker.patch.object(dd, "_left_open", side_effect=RuntimeError("x"))
    out = dd.get_admin_dashboard(NOW)
    assert [i["count"] for i in out["attention"]] == [None, None, 1]


def test_the_dashboard_never_returns_personal_data_beyond_the_new_patient_list(parts):
    out = dd.get_admin_dashboard(NOW)
    assert set(out) == {"date", "generated_at", "appointments_today", "revenue", "trend", "pending_bills", "lab_orders", "patients", "staff",
                        "new_patients", "attention", "errors"}
