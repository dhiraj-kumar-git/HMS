from datetime import datetime, timezone

import pytest

import app.database.appointments_admin as aa

NOW = datetime(2026, 10, 25, 6, 0, tzinfo=timezone.utc)
START, END = "2026-10-19", "2026-10-25"            # Monday .. Sunday


def utc(day, hh, mm):
    return datetime(2026, 10, day, hh, mm, tzinfo=timezone.utc)


def v(vid, iid, time, status, doctor="drx", by="patient", **extra):
    return {"visit_id": vid, "institute_id": iid, "doctor_username": doctor, "doctor_name": {"drx": "Dr. X", "dry": "Dr. Y"}[doctor],
            "time": time, "status": status, "booked_by": by, **extra}


VISITS = [
    # booked 48 h ahead, finished 20 min after the scheduled start
    v("v1", "H1", "2026-10-19T09:00", "completed", booked_at=utc(17, 3, 30), consultation_completed_time="2026-10-19T03:50:00+00:00"),
    # booked 1 h ahead, finished 30 min after the scheduled start
    v("v2", "H2", "2026-10-19T09:30", "completed", by="receptionist", booked_at=utc(19, 3, 0), consultation_completed_time="2026-10-19T04:30:00+00:00"),
    v("v3", "H1", "2026-10-20T14:00", "cancelled", "dry"),
    v("v4", "H3", "2026-10-20 14:30", "no_show", "dry"),
    v("v5", "H2", "2026-10-21T10:00", "booked"),
    v("v6", "H4", "2026-10-21T10:00", "confirmed", "dry", "receptionist"),
    # completion stamped 3 days late: a data glitch, must not distort the average
    v("v7", "H1", "2026-10-25T16:00", "completed", consultation_completed_time="2026-10-28T10:00:00+00:00"),
    v("v8", "H5", "2026-10-22T11:00", "Checked in"),
    v("v9", "H6", "2026-10-23T12:00", "weird", "dry"),
]
TYPES = [{"institute_id": "H1", "patient_type": "Student"}, {"institute_id": "H2", "patient_type": "Faculty"},
         {"institute_id": "H3", "patient_type": "Student"}, {"institute_id": "H4", "patient_type": "Staff"},
         {"institute_id": "H5"}, {"institute_id": "H6", "patient_type": "Dependant"}]


@pytest.fixture
def db(mocker):
    visits = mocker.patch.object(aa, "visits")
    patients = mocker.patch.object(aa, "patients")
    visits.find.return_value = list(VISITS)
    visits.distinct.return_value = ["H2", "H9"]          # H2 was seen before the period; H9 is not in it
    visits.count_documents.return_value = 6              # the 7 days before
    patients.find.return_value = list(TYPES)
    return visits, patients


@pytest.fixture
def out(db):
    return aa.get_appointment_analytics(START, END)


def test_totals_and_open_appointments(out):
    assert out["range"] == {"start_date": START, "end_date": END, "days": 7}
    assert out["totals"] == {"total": 9, "resolved": 5, "open": 3, "completed": 3, "cancelled": 1, "no_show": 1}


def test_rates_are_over_finished_appointments_only(out):
    assert out["rates"] == {"completion": 60.0, "cancellation": 20.0, "no_show": 20.0}


def test_status_breakdown_keeps_old_spellings_and_unknowns_separate(out):
    counts = {s["status"]: s["count"] for s in out["status"]}
    assert counts == {"booked": 1, "confirmed": 1, "checked_in": 1, "consultation": 0, "completed": 3, "cancelled": 1,
                      "no_show": 1, "other": 1}


def test_comparison_with_the_previous_period(db, out):
    visits, _ = db
    assert out["previous"] == {"start_date": "2026-10-12", "end_date": "2026-10-18", "total": 6, "change_pct": 50.0}
    assert visits.count_documents.call_args[0][0] == {"time": {"$gte": "2026-10-12", "$lt": "2026-10-19"}}


def test_new_and_returning_patients(db, out):
    visits, _ = db
    assert out["patients"] == {"unique": 6, "new": 5, "returning": 1}
    query = visits.distinct.call_args[0]
    assert query[0] == "institute_id" and query[1]["time"] == {"$lt": START}        # seen before the period began


def test_daily_trend_covers_every_day_including_empty_ones(out):
    assert [d["date"] for d in out["daily"]] == ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]
    by = {d["date"]: d for d in out["daily"]}
    assert by["2026-10-19"] == {"date": "2026-10-19", "total": 2, "completed": 2, "cancelled": 0}
    assert by["2026-10-20"]["total"] == 2 and by["2026-10-20"]["cancelled"] == 1
    assert by["2026-10-24"] == {"date": "2026-10-24", "total": 0, "completed": 0, "cancelled": 0}
    assert sum(d["total"] for d in out["daily"]) == 9


def test_busiest_hours_and_weekdays(out):
    hours = {h["hour"]: h["count"] for h in out["by_hour"]}
    assert len(out["by_hour"]) == 24
    assert {h: c for h, c in hours.items() if c} == {9: 2, 10: 2, 11: 1, 12: 1, 14: 2, 16: 1}
    days = {d["weekday"]: d["count"] for d in out["by_weekday"]}
    assert [d["weekday"] for d in out["by_weekday"]][0] == "Monday" and len(days) == 7
    assert days == {"Monday": 2, "Tuesday": 2, "Wednesday": 2, "Thursday": 1, "Friday": 1, "Saturday": 0, "Sunday": 1}


def test_busiest_day_and_hour(out):
    assert out["busiest"]["day"]["date"] == "2026-10-19" and out["busiest"]["day"]["total"] == 2
    assert out["busiest"]["hour"] == {"hour": 9, "count": 2}


def test_booked_by_split(out):
    assert out["booked_by"] == [{"booked_by": "patient", "count": 7}, {"booked_by": "receptionist", "count": 2}]


def test_patient_type_mix_counts_appointments_not_people(out):
    assert {t["type"]: t["count"] for t in out["patient_types"]} == {"Student": 4, "Faculty": 2, "Staff": 1, "Dependant": 1, "Unknown": 1}
    assert out["patient_types"][0]["type"] == "Student"                            # biggest first


def test_doctor_table(out):
    x, y = out["doctors"]
    assert (x["name"], x["total"], x["completed"], x["cancelled"], x["no_show"]) == ("Dr. X", 5, 3, 0, 0)
    assert (x["share_pct"], x["completion_rate"]) == (55.6, 100.0)
    assert (y["name"], y["total"], y["completed"], y["cancelled"], y["no_show"]) == ("Dr. Y", 4, 0, 1, 1)
    assert (y["share_pct"], y["completion_rate"]) == (44.4, 0.0)


def test_timing_ignores_impossible_values(out):
    t = out["timing"]
    assert t["avg_lead_hours"] == 24.5                    # (48 h + 1 h) / 2
    assert t["avg_turnaround_minutes"] == 25 and t["median_turnaround_minutes"] == 25
    assert t["turnaround_samples"] == 2                   # v7's 3-day gap is left out


def test_query_uses_the_same_date_rule_as_search_and_no_clinical_fields(db):
    visits, _ = db
    aa.get_appointment_analytics(START, END)
    query, projection = visits.find.call_args[0]
    assert query == {"time": {"$gte": START, "$lt": "2026-10-26"}}
    assert not ({"prescriptions", "lab_tests", "lab_reports", "emr_data", "diagnosis_note", "remarks"} & set(projection))


# ---------------------------------------------------------------- edge cases

def test_empty_period(db):
    visits, patients = db
    visits.find.return_value = []
    visits.count_documents.return_value = 0
    out = aa.get_appointment_analytics(START, END)
    assert out["totals"]["total"] == 0 and out["rates"] == {"completion": None, "cancellation": None, "no_show": None}
    assert out["previous"]["change_pct"] is None
    assert out["patients"] == {"unique": 0, "new": 0, "returning": 0}
    assert out["doctors"] == [] and out["booked_by"] == [] and out["patient_types"] == []
    assert out["busiest"] == {"day": None, "hour": None}
    assert out["timing"] == {"avg_lead_hours": None, "avg_turnaround_minutes": None, "median_turnaround_minutes": None, "turnaround_samples": 0}
    assert len(out["daily"]) == 7 and all(d["total"] == 0 for d in out["daily"])
    patients.find.assert_not_called()


def test_single_day_period(db):
    visits, _ = db
    visits.find.return_value = [VISITS[0]]
    out = aa.get_appointment_analytics("2026-10-19", "2026-10-19")
    assert out["range"]["days"] == 1 and len(out["daily"]) == 1
    assert out["previous"]["start_date"] == out["previous"]["end_date"] == "2026-10-18"


def test_period_across_a_year_end(db):
    visits, _ = db
    visits.find.return_value = []
    out = aa.get_appointment_analytics("2026-12-30", "2027-01-02")
    assert [d["date"] for d in out["daily"]] == ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]
    assert out["previous"]["start_date"] == "2026-12-26" and out["previous"]["end_date"] == "2026-12-29"


def test_appointments_without_a_usable_time_still_count_but_skip_hour_and_weekday(db):
    visits, _ = db
    visits.find.return_value = [v("a", "H1", "2026-10-20", "completed"), v("b", "H1", "", "booked")]
    out = aa.get_appointment_analytics(START, END)
    assert out["totals"]["total"] == 2
    assert sum(h["count"] for h in out["by_hour"]) == 0 and sum(d["count"] for d in out["by_weekday"]) == 0


def test_negative_lead_and_early_completion_are_ignored(db):
    visits, _ = db
    visits.find.return_value = [
        v("a", "H1", "2026-10-20T10:00", "completed", booked_at=utc(21, 0, 0), consultation_completed_time="2026-10-20T03:00:00+00:00"),   # booked after, done before start
    ]
    t = aa.get_appointment_analytics(START, END)["timing"]
    assert t["avg_lead_hours"] is None and t["turnaround_samples"] == 0


def test_text_timestamps_work_like_real_ones(db):
    visits, _ = db
    visits.find.return_value = [v("a", "H1", "2026-10-20T10:00", "completed",
                                  booked_at="2026-10-19T04:30:00+00:00", consultation_completed_time="2026-10-20T05:30:00Z")]
    t = aa.get_appointment_analytics(START, END)["timing"]
    # 10:00 IST is 04:30 UTC: booked exactly 24 h before, finished 60 min after the scheduled start
    assert t["avg_lead_hours"] == 24.0
    assert t["avg_turnaround_minutes"] == 60


def test_median_of_an_even_and_odd_number_of_samples():
    assert aa._median([]) is None and aa._median([5]) == 5 and aa._median([1, 9, 3]) == 3 and aa._median([1, 2, 3, 10]) == 2.5


def test_many_patients_are_looked_up_in_chunks(db):
    visits, patients = db
    visits.find.return_value = [v(str(i), f"H{i}", "2026-10-20T10:00", "completed") for i in range(2500)]
    patients.find.return_value = []
    visits.distinct.return_value = []
    out = aa.get_appointment_analytics(START, END)
    assert patients.find.call_count == 3 and visits.distinct.call_count == 3
    assert all(len(c[0][0]["institute_id"]["$in"]) <= 1000 for c in patients.find.call_args_list)
    assert out["patients"]["unique"] == 2500 and out["patient_types"] == [{"type": "Unknown", "count": 2500}]


def test_unknown_doctor_and_booker_do_not_break_it(db):
    visits, _ = db
    visits.find.return_value = [{"institute_id": "H1", "time": "2026-10-20T10:00", "status": "booked"}]
    out = aa.get_appointment_analytics(START, END)
    assert out["doctors"][0]["username"] == "unknown" and out["booked_by"] == [{"booked_by": "unknown", "count": 1}]


# ---------------------------------------------------------------- the period parameters

def test_default_period_is_the_last_30_days_in_india_time():
    assert aa.parse_analytics_range({}, now=NOW) == ("2026-09-26", "2026-10-25")


def test_explicit_period():
    assert aa.parse_analytics_range({"start_date": "2026-01-01", "end_date": "2026-01-31"}, now=NOW) == ("2026-01-01", "2026-01-31")


def test_a_year_is_allowed_but_not_more():
    assert aa.parse_analytics_range({"start_date": "2026-01-01", "end_date": "2026-12-31"}, now=NOW)       # 365 days
    assert aa.parse_analytics_range({"start_date": "2024-01-01", "end_date": "2024-12-31"}, now=NOW)       # 366 (leap year)
    with pytest.raises(aa.SearchError) as err:
        aa.parse_analytics_range({"start_date": "2025-12-30", "end_date": "2026-12-31"}, now=NOW)           # 367 days
    assert "366 days or less" in str(err.value)


@pytest.mark.parametrize("args,fragment", [
    ({"start_date": "soon"}, "From date"), ({"end_date": "2026-13-01"}, "To date"),
    ({"start_date": "2026-10-10", "end_date": "2026-10-01"}, "must not be after"),
])
def test_bad_periods_are_refused(args, fragment):
    with pytest.raises(aa.SearchError) as err:
        aa.parse_analytics_range(args, now=NOW)
    assert fragment in str(err.value)
