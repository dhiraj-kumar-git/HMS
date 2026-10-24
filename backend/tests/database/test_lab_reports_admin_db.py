import csv
import io
from datetime import datetime, timezone

import pytest

import app.database.lab_reports_admin as lr

NOW = datetime(2026, 10, 25, 6, 0, tzinfo=timezone.utc)


def filters(**over):
    return {**{"start_date": "2026-10-01", "end_date": "2026-10-25", "status": None, "doctor": None, "q": None}, **over}


# ---------------------------------------------------------------- one status per order

@pytest.mark.parametrize("total,done,cancelled,invoice,draft,reports,visit,expected", [
    # nothing left to do
    (3, 3, 0, True, False, True, "completed", "completed"),
    (3, 2, 1, True, False, True, "completed", "completed"),            # one cancelled, the rest done
    (2, 0, 2, True, False, False, "cancelled", "cancelled"),
    (2, 0, 2, False, False, False, "cancelled", "cancelled"),
    (1, 1, 0, False, False, True, "completed", "completed"),           # finished beats 'not billed'
    # not billed
    (2, 0, 0, False, False, False, "completed", "awaiting_payment"),
    (2, 0, 0, False, True, False, "completed", "awaiting_payment"),    # drafts do not matter before payment
    # billed
    (2, 0, 0, True, False, False, "completed", "pending"),
    (2, 0, 0, True, True, False, "completed", "in_progress"),          # results being typed in
    (2, 0, 0, True, False, True, "completed", "in_progress"),          # a report saved, tests not yet marked done
    (3, 1, 0, True, False, True, "completed", "partially_completed"),
    (3, 1, 1, True, False, True, "completed", "partially_completed"),
    # a cancelled visit whose tests are somehow still open
    (2, 0, 0, True, False, False, "cancelled", "cancelled"),
    (2, 0, 0, True, False, False, "Cancelled", "cancelled"),
    (2, 1, 0, True, False, True, "cancelled", "cancelled"),            # the order was cancelled; done results stay available later
])
def test_status_of_an_order(total, done, cancelled, invoice, draft, reports, visit, expected):
    assert lr.derive_lab_status(total, done, cancelled, invoice, draft, reports, visit) == expected


def test_six_statuses_with_labels():
    assert [k for k, _ in lr.LAB_STATUSES] == ["awaiting_payment", "pending", "in_progress", "partially_completed", "completed", "cancelled"]
    assert lr.LAB_STATUS_LABELS["partially_completed"] == "Partially completed"


# ---------------------------------------------------------------- filters

def test_default_period_is_the_last_30_days():
    f = lr.parse_lab_filters({}, now=NOW)
    assert (f["start_date"], f["end_date"]) == ("2026-09-26", "2026-10-25")
    assert f["status"] is f["doctor"] is f["q"] is None


def test_filters_are_cleaned():
    f = lr.parse_lab_filters({"start_date": "2026-10-01", "end_date": "2026-10-10", "status": " Partially_Completed ",
                              "doctor": " drx ", "q": " ann "}, now=NOW)
    assert f == {"start_date": "2026-10-01", "end_date": "2026-10-10", "status": "partially_completed", "doctor": "drx", "q": "ann"}


@pytest.mark.parametrize("key", ["status", "doctor"])
def test_all_means_no_filter(key):
    assert lr.parse_lab_filters({key: "all"}, now=NOW)[key] is None


@pytest.mark.parametrize("args,fragment", [
    ({"start_date": "soon"}, "From date"), ({"end_date": "2026-13-01"}, "To date"), ({"status": "done"}, "Unknown status"),
    ({"status": "booked"}, "Unknown status"), ({"start_date": "2026-10-10", "end_date": "2026-10-01"}, "must not be after"),
    ({"doctor": "x" * 101}, "too long"), ({"q": "x" * 101}, "too long"),
])
def test_bad_filters_are_refused(args, fragment):
    with pytest.raises(lr.SearchError) as err:
        lr.parse_lab_filters(args, now=NOW)
    assert fragment in str(err.value)


def test_there_is_no_test_name_filter():
    """Which patient had which test is private until the password is entered, so it cannot be searched."""
    f = lr.parse_lab_filters({"test": "HIV", "test_name": "HIV", "lab_test": "HIV"}, now=NOW)
    assert set(f) == {"start_date", "end_date", "status", "doctor", "q"}


# ---------------------------------------------------------------- what the database is asked

def test_only_visits_with_lab_tests_in_range_are_matched():
    m = lr._lab_order_pipeline(filters())[0]["$match"]
    assert m["lab_tests.0"] == {"$exists": True}
    assert m["time"] == {"$gte": "2026-10-01", "$lt": "2026-10-26"}
    assert "doctor_username" not in m


def test_doctor_filter_is_exact():
    assert lr._lab_order_pipeline(filters(doctor="drx"))[0]["$match"]["doctor_username"] == "drx"


def test_patient_search_is_escaped_and_covers_name_and_id():
    p = lr._lab_order_pipeline(filters(q="a.*(b"))
    or_ = [s for s in p if "$match" in s and "$or" in s["$match"]][0]["$match"]["$or"]
    assert {list(c)[0] for c in or_} == {"institute_id", "_p.name"}
    assert all(c[list(c)[0]]["$regex"] == "a\\.\\*\\(b" for c in or_)


def keys_of_projections(pipeline):
    """Every output field name any $project / $addFields stage can create."""
    out = set()
    for stage in pipeline:
        for name in ("$project", "$addFields"):
            if name in stage:
                out |= {k for k, v in stage[name].items() if v != 0}
    return out


def test_no_test_names_results_or_file_names_can_leave_the_query():
    p = lr._lab_order_pipeline(filters())
    produced = keys_of_projections(p)
    for secret in ("lab_tests", "lab_reports", "lab_results_draft", "lab_results", "results", "s3_key", "file_name",
                   "test_name", "prescriptions", "emr_data", "diagnosis_note", "remarks"):
        assert secret not in produced, secret
    # and the patient lookup only brings name and type
    look = [s for s in p if "$lookup" in s][0]["$lookup"]
    assert set(look["pipeline"][1]["$project"]) == {"_id", "name", "patient_type"}


def test_newest_first_and_patient_internals_are_dropped_at_the_end():
    p = lr._lab_order_pipeline(filters())
    assert p[-2] == {"$sort": {"time": -1, "visit_id": 1}} and p[-1] == {"$project": {"_p": 0}}


# ---------------------------------------------------------------- rows, summary, paging

def doc(vid, status_counts, **over):
    base = {"visit_id": vid, "institute_id": f"H{vid}", "time": f"2026-10-{20 + int(vid) % 5:02d}T10:00", "doctor_username": "drx",
            "doctor_name": "Dr. X", "visit_status": "completed", "tests_total": 2, "tests_completed": 0, "tests_cancelled": 0,
            "report_files": 0, "report_typed": 0, "has_invoice": True, "has_draft": False,
            "patient_name": f"Patient {vid}", "patient_type": "Student"}
    return {**base, **status_counts, **over}


DOCS = [
    doc("1", {"tests_completed": 2, "report_files": 1, "report_typed": 1}),                      # completed
    doc("2", {"has_invoice": False}),                                                            # awaiting payment
    doc("3", {}),                                                                                # pending
    doc("4", {"has_draft": True}),                                                               # in progress
    doc("5", {"tests_completed": 1, "report_typed": 1}),                                         # partially completed
    doc("6", {"tests_cancelled": 2, "visit_status": "cancelled"}),                               # cancelled
    doc("7", {"tests_completed": 2, "report_files": 2}),                                         # completed
]


@pytest.fixture
def visits(mocker):
    m = mocker.patch.object(lr, "visits")
    m.aggregate.return_value = list(DOCS)
    return m


def test_every_order_gets_its_status(visits):
    out = lr.search_lab_orders(filters())
    assert {r["visit_id"]: r["status"] for r in out["rows"]} == {
        "1": "completed", "2": "awaiting_payment", "3": "pending", "4": "in_progress",
        "5": "partially_completed", "6": "cancelled", "7": "completed"}


def test_summary_counts_each_status(visits):
    s = lr.search_lab_orders(filters())["summary"]
    assert s == {"awaiting_payment": 1, "pending": 1, "in_progress": 1, "partially_completed": 1, "completed": 2, "cancelled": 1, "total": 7}


def test_status_filter_narrows_the_list_but_not_the_summary(visits):
    out = lr.search_lab_orders(filters(status="completed"))
    assert [r["visit_id"] for r in out["rows"]] == ["1", "7"] and out["total"] == 2
    assert out["summary"]["total"] == 7 and out["summary"]["pending"] == 1                   # the cards still show every status


def test_rows_carry_counts_but_no_names_or_values(visits):
    row = lr.search_lab_orders(filters())["rows"][0]
    assert set(row) == {"visit_id", "time", "status", "institute_id", "patient_name", "patient_type", "doctor_username",
                        "doctor_name", "tests_total", "tests_completed", "tests_cancelled", "report_files", "report_typed"}
    assert (row["tests_total"], row["tests_completed"], row["report_files"], row["report_typed"]) == (2, 2, 1, 1)


def test_paging(visits):
    visits.aggregate.return_value = [doc(str(i), {}) for i in range(60)]
    p1 = lr.search_lab_orders(filters(), page=1, limit=25)
    p3 = lr.search_lab_orders(filters(), page=3, limit=25)
    assert (p1["total"], p1["total_pages"], len(p1["rows"])) == (60, 3, 25)
    assert len(p3["rows"]) == 10 and p3["rows"][0]["visit_id"] == "50"
    assert lr.search_lab_orders(filters(), page=9, limit=25)["rows"] == []


def test_nothing_found(visits):
    visits.aggregate.return_value = []
    out = lr.search_lab_orders(filters())
    assert out["rows"] == [] and out["total"] == 0 and out["total_pages"] == 1 and out["summary"]["total"] == 0


def test_missing_counts_are_treated_as_zero(visits):
    visits.aggregate.return_value = [{"visit_id": "x", "institute_id": "H1", "time": "2026-10-20T10:00"}]
    row = lr.search_lab_orders(filters())["rows"][0]
    assert row["tests_total"] == 0 and row["status"] in lr.LAB_STATUS_KEYS


def test_the_database_may_spill_to_disk_for_big_histories(visits):
    lr.search_lab_orders(filters())
    assert visits.aggregate.call_args.kwargs.get("allowDiskUse") is True


# ---------------------------------------------------------------- export

def parse_csv(text):
    return list(csv.reader(io.StringIO(text.lstrip("﻿"))))


def test_export_uses_the_same_status_filter(visits):
    rows, truncated = lr.export_lab_orders(filters(status="completed"))
    assert [r["visit_id"] for r in rows] == ["1", "7"] and truncated is False


def test_export_reports_truncation(visits, monkeypatch):
    monkeypatch.setattr(lr, "EXPORT_LIMIT", 3)
    rows, truncated = lr.export_lab_orders(filters())
    assert len(rows) == 3 and truncated is True


def test_csv_has_statuses_and_counts_only(visits):
    rows, _ = lr.export_lab_orders(filters())
    table = parse_csv(lr.lab_orders_to_csv(rows))
    assert table[0] == lr.LAB_CSV_COLUMNS
    assert table[1] == ["2026-10-21T10:00", "Patient 1", "H1", "Student", "Dr. X", "Completed", "2", "2", "1", "1", "1"]
    assert {r[5] for r in table[1:]} == {"Completed", "Awaiting payment", "Pending", "In progress", "Partially completed", "Cancelled"}


@pytest.mark.parametrize("name", ['=HYPERLINK("http://evil","x")', "+1+1", "-2+3", "@SUM(A1)"])
def test_csv_cannot_carry_formulas(name):
    rows = [{"visit_id": "v", "time": "t", "status": "pending", "institute_id": "H1", "patient_name": name,
             "patient_type": "Student", "doctor_name": "Dr", "tests_total": 1, "tests_completed": 0,
             "report_files": 0, "report_typed": 0}]
    assert parse_csv(lr.lab_orders_to_csv(rows))[1][1] == "'" + name


# ---------------------------------------------------------------- doctors

def test_doctor_list_only_counts_doctors_who_ordered_tests(visits):
    visits.aggregate.return_value = [{"_id": "drx", "name": "Dr. X"}, {"_id": "dry", "name": None}]
    assert lr.list_lab_order_doctors() == [{"username": "drx", "name": "Dr. X"}, {"username": "dry", "name": "dry"}]
    assert visits.aggregate.call_args[0][0][0]["$match"]["lab_tests.0"] == {"$exists": True}
