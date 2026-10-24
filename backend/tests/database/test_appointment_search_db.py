import csv
import io
from datetime import datetime, timezone

import pytest

import app.database.appointments_admin as aa

NOW = datetime(2026, 10, 24, 6, 0, tzinfo=timezone.utc)      # 24 Oct 2026, 11:30 IST


def filters(**over):
    base = {"start_date": "2026-10-01", "end_date": "2026-10-24", "status": None, "booked_by": None, "doctor": None, "q": None}
    return {**base, **over}


# ------------------------------------------------------------------ parse_search_filters

def test_defaults_to_the_last_30_days_ending_today_ist():
    f = aa.parse_search_filters({}, now=NOW)
    assert (f["start_date"], f["end_date"]) == ("2026-09-25", "2026-10-24")
    assert f["status"] is f["doctor"] is f["booked_by"] is f["q"] is None


def test_default_end_day_follows_india_time_not_utc():
    late_utc = datetime(2026, 10, 23, 20, 0, tzinfo=timezone.utc)
    assert aa.parse_search_filters({}, now=late_utc)["end_date"] == "2026-10-24"


def test_explicit_dates_and_filters_are_cleaned():
    f = aa.parse_search_filters({"start_date": "2026-10-01", "end_date": "2026-10-10", "status": "Checked in",
                                 "booked_by": " Receptionist ", "doctor": " drx ", "q": "  ann  "}, now=NOW)
    assert f == {"start_date": "2026-10-01", "end_date": "2026-10-10", "status": "checked_in",
                 "booked_by": "receptionist", "doctor": "drx", "q": "ann"}


@pytest.mark.parametrize("key", ["status", "booked_by", "doctor"])
def test_all_means_no_filter(key):
    assert aa.parse_search_filters({key: "all"}, now=NOW)[key] is None
    assert aa.parse_search_filters({key: ""}, now=NOW)[key] is None


@pytest.mark.parametrize("args,message", [
    ({"start_date": "24-10-2026"}, "From date"),
    ({"end_date": "2026/10/24"}, "To date"),
    ({"start_date": "2026-02-30"}, "not a real date"),
    ({"start_date": "'; drop"}, "From date"),
    ({"start_date": "2026-10-25", "end_date": "2026-10-24"}, "must not be after"),
    ({"status": "deleted"}, "Unknown status"),
    ({"booked_by": "admin"}, "booked by"),
    ({"doctor": "x" * 101}, "too long"),
    ({"q": "x" * 101}, "too long"),
])
def test_bad_filters_are_refused_with_a_readable_message(args, message):
    with pytest.raises(aa.SearchError) as err:
        aa.parse_search_filters(args, now=NOW)
    assert message in str(err.value)


def test_every_known_status_is_accepted():
    for s in aa.SEARCHABLE_STATUSES:
        assert aa.parse_search_filters({"status": s}, now=NOW)["status"] == s
    assert "no_show" in aa.SEARCHABLE_STATUSES


# ------------------------------------------------------------------ parse_paging

def test_paging_defaults_and_limits():
    assert aa.parse_paging({}) == (1, 25)
    assert aa.parse_paging({"page": "3", "limit": "100"}) == (3, 100)


@pytest.mark.parametrize("args", [{"page": "0"}, {"page": "-1"}, {"limit": "0"}, {"limit": "101"}, {"page": "x"}, {"limit": "1.5"}])
def test_bad_paging_is_refused(args):
    with pytest.raises(aa.SearchError):
        aa.parse_paging(args)


# ------------------------------------------------------------------ the query that is built

def stage(pipeline, name):
    return [s[name] for s in pipeline if name in s]


def test_date_range_covers_the_whole_last_day_and_both_time_formats():
    p = aa._search_pipeline(filters(start_date="2026-10-01", end_date="2026-10-24"))
    assert p[0]["$match"]["time"] == {"$gte": "2026-10-01", "$lt": "2026-10-25"}
    # 'YYYY-MM-DDTHH:MM' and 'YYYY-MM-DD HH:MM' both fall inside the range, a day later does not
    for inside in ("2026-10-24T23:59", "2026-10-24 23:59", "2026-10-01T00:00"):
        assert "2026-10-01" <= inside < "2026-10-25"
    assert not ("2026-10-01" <= "2026-10-25T00:00" < "2026-10-25")


def test_month_end_rolls_over_correctly():
    assert aa._search_pipeline(filters(end_date="2026-12-31"))[0]["$match"]["time"]["$lt"] == "2027-01-01"


def test_status_matches_old_spellings():
    import re
    pat = aa._search_pipeline(filters(status="checked_in"))[0]["$match"]["status"]
    assert pat["$options"] == "i"
    for spelling in ("checked_in", "Checked in", "CHECKED_IN", "checked in"):
        assert re.match(pat["$regex"], spelling, re.I)
    for other in ("checked_inx", "xchecked_in", "booked"):
        assert not re.match(pat["$regex"], other, re.I)


def test_doctor_and_booked_by_are_exact_matches():
    m = aa._search_pipeline(filters(doctor="drx", booked_by="receptionist"))[0]["$match"]
    assert m["doctor_username"] == "drx" and m["booked_by"] == "receptionist"


def test_no_filters_means_only_the_date_range_is_matched():
    assert list(aa._search_pipeline(filters())[0]["$match"]) == ["time"]


def test_patient_text_search_is_escaped_and_covers_name_and_id():
    p = aa._search_pipeline(filters(q="a.*(b"))
    or_ = [s for s in p if "$match" in s and "$or" in s["$match"]][0]["$match"]["$or"]
    assert {"institute_id", "_p.name"} == {list(c)[0] for c in or_}
    assert all(c[list(c)[0]]["$regex"] == "a\\.\\*\\(b" for c in or_)


def test_no_text_means_no_patient_condition():
    assert not [s for s in aa._search_pipeline(filters()) if "$match" in s and "$or" in s["$match"]]


def test_newest_first_with_a_stable_tiebreak():
    assert aa._search_pipeline(filters())[-1] == {"$sort": {"time": -1, "visit_id": 1}}


def test_only_display_columns_enter_the_pipeline_and_patient_lookup():
    p = aa._search_pipeline(filters())
    slim = p[1]["$project"]
    assert not ({"prescriptions", "lab_tests", "lab_reports", "emr_data", "diagnosis_note", "remarks"} & set(slim))
    look = [s for s in p if "$lookup" in s][0]["$lookup"]
    kept = look["pipeline"][1]["$project"]
    assert set(kept) == {"_id", "name", "patient_type"}            # no date of birth, contact, OTP, ...


# ------------------------------------------------------------------ search_appointments

@pytest.fixture
def visits(mocker):
    return mocker.patch.object(aa, "visits")


def facet(rows, total):
    return [{"rows": rows, "total": [{"n": total}] if total else []}]


def test_search_returns_a_page_with_totals(visits):
    visits.aggregate.return_value = facet([
        {"visit_id": "v1", "time": "2026-10-24T09:00", "status": "Checked in", "institute_id": "H1", "doctor_username": "drx",
         "doctor_name": None, "booked_by": "patient", "booked_at": datetime(2026, 10, 20, tzinfo=timezone.utc),
         "patient_name": "Ann", "patient_type": "Student"}], 61)
    out = aa.search_appointments(filters(), page=2, limit=25)
    assert (out["page"], out["limit"], out["total"], out["total_pages"], out["export_limit"]) == (2, 25, 61, 3, aa.EXPORT_LIMIT)
    row = out["rows"][0]
    assert row["status"] == "checked_in" and row["doctor_name"] == "drx" and row["patient_name"] == "Ann"
    assert row["booked_at"] == "2026-10-20T00:00:00+00:00"


def test_search_asks_the_database_for_the_right_page(visits):
    visits.aggregate.return_value = facet([], 0)
    aa.search_appointments(filters(), page=3, limit=10)
    pipeline = visits.aggregate.call_args[0][0]
    f = pipeline[-1]["$facet"]
    assert f["rows"][0] == {"$skip": 20} and f["rows"][1] == {"$limit": 10}
    assert visits.aggregate.call_args.kwargs.get("allowDiskUse") is True


def test_search_with_no_results(visits):
    visits.aggregate.return_value = facet([], 0)
    out = aa.search_appointments(filters())
    assert out["rows"] == [] and out["total"] == 0 and out["total_pages"] == 1


def test_search_survives_an_empty_aggregation_result(visits):
    visits.aggregate.return_value = []
    assert aa.search_appointments(filters())["total"] == 0


# ------------------------------------------------------------------ export + CSV

def raw_row(i, **over):
    return {"visit_id": f"v{i}", "time": "2026-10-24T09:00", "status": "completed", "institute_id": f"H{i}",
            "doctor_username": "drx", "doctor_name": "Dr. X", "booked_by": "patient", "booked_at": "2026-10-20T00:00:00+00:00",
            "patient_name": f"Name {i}", "patient_type": "Student", **over}


def test_export_returns_every_row_up_to_the_cap(visits):
    visits.aggregate.return_value = [raw_row(i) for i in range(5)]
    rows, truncated = aa.export_appointments(filters())
    assert len(rows) == 5 and truncated is False
    assert visits.aggregate.call_args[0][0][-1] == {"$limit": aa.EXPORT_LIMIT + 1}


def test_export_reports_when_it_had_to_cut_off(visits, monkeypatch):
    monkeypatch.setattr(aa, "EXPORT_LIMIT", 3)
    visits.aggregate.return_value = [raw_row(i) for i in range(4)]
    rows, truncated = aa.export_appointments(filters())
    assert len(rows) == 3 and truncated is True


def parse_csv(text):
    return list(csv.reader(io.StringIO(text.lstrip("﻿"))))


def test_csv_has_a_header_and_readable_values(visits):
    visits.aggregate.return_value = [raw_row(1, status="checked_in")]
    rows, _ = aa.export_appointments(filters())
    text = aa.appointments_to_csv(rows)
    assert text.startswith("﻿")                              # Excel-friendly
    table = parse_csv(text)
    assert table[0] == aa.CSV_COLUMNS
    assert table[1] == ["2026-10-24T09:00", "Name 1", "H1", "Student", "Dr. X", "checked in", "patient",
                        "2026-10-20T00:00:00+00:00", "v1"]


def test_csv_for_no_rows_is_just_the_header():
    assert parse_csv(aa.appointments_to_csv([])) == [aa.CSV_COLUMNS]


@pytest.mark.parametrize("name", ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"])
def test_csv_cannot_carry_spreadsheet_formulas(name):
    rows = [aa._clean_row(raw_row(1, patient_name=name))]
    cell = parse_csv(aa.appointments_to_csv(rows))[1][1]
    assert cell == "'" + name


def test_csv_quotes_commas_quotes_and_newlines_properly():
    rows = [aa._clean_row(raw_row(1, patient_name='Lee, "Ann"\nSmith'))]
    assert parse_csv(aa.appointments_to_csv(rows))[1][1] == 'Lee, "Ann"\nSmith'


def test_csv_tolerates_missing_fields():
    rows = [aa._clean_row({"visit_id": "v1"})]
    line = parse_csv(aa.appointments_to_csv(rows))[1]
    assert line[-1] == "v1" and len(line) == len(aa.CSV_COLUMNS)


# ------------------------------------------------------------------ doctor list

def test_doctor_list_uses_names_and_falls_back_to_usernames(visits):
    visits.aggregate.return_value = [{"_id": "drx", "name": "Dr. X"}, {"_id": "dry", "name": None}]
    assert aa.list_appointment_doctors() == [{"username": "drx", "name": "Dr. X"}, {"username": "dry", "name": "dry"}]
