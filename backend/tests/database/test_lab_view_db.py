from datetime import datetime, timedelta, timezone

import pytest

import app.database.lab_reports_admin as lr

NOW = datetime(2026, 10, 25, 6, 0, tzinfo=timezone.utc)


@pytest.fixture
def access(mocker):
    return mocker.patch.object(lr, "lab_view_access")


# ---------------------------------------------------------------- the window

def test_window_is_checked_for_this_admin_and_this_login_session_and_time(access):
    access.find_one.return_value = {"kind": "unlock"}
    assert lr.is_lab_view_unlocked("admin1", "sess-1", now=NOW) is True
    access.find_one.assert_called_once_with({"kind": "unlock", "username": "admin1", "session_id": "sess-1", "expires_at": {"$gt": NOW}})


def test_no_record_means_locked(access):
    access.find_one.return_value = None
    assert lr.is_lab_view_unlocked("admin1", "sess-1", now=NOW) is False


def test_window_is_ten_minutes():
    assert lr.UNLOCK_MINUTES == 10


# ---------------------------------------------------------------- unlocking

@pytest.fixture
def password_check(mocker):
    return mocker.patch("app.database.auth.authenticate_user")


def test_right_password_opens_a_ten_minute_window(access, password_check):
    access.count_documents.return_value = 0
    password_check.return_value = {"username": "admin1", "role": "admin"}
    outcome, expires = lr.attempt_lab_view_unlock("admin1", "sess-1", "digest", now=NOW)
    assert outcome == "ok" and expires == NOW + timedelta(minutes=10)
    password_check.assert_called_once_with("admin1", "digest")
    doc = access.insert_one.call_args.args[0]
    assert doc == {"kind": "unlock", "username": "admin1", "session_id": "sess-1", "created_at": NOW, "expires_at": NOW + timedelta(minutes=10)}


def test_success_clears_old_failures_and_an_earlier_window_of_the_same_session(access, password_check):
    access.count_documents.return_value = 3
    password_check.return_value = {"username": "admin1"}
    lr.attempt_lab_view_unlock("admin1", "sess-1", "digest", now=NOW)
    deleted = [c.args[0] for c in access.delete_many.call_args_list]
    assert {"kind": "failure", "username": "admin1"} in deleted
    assert {"kind": "unlock", "username": "admin1", "session_id": "sess-1"} in deleted


def test_wrong_password_is_recorded_and_opens_nothing(access, password_check):
    access.count_documents.return_value = 0
    password_check.return_value = None
    outcome, expires = lr.attempt_lab_view_unlock("admin1", "sess-1", "wrong", now=NOW)
    assert (outcome, expires) == ("incorrect", None)
    doc = access.insert_one.call_args.args[0]
    assert doc["kind"] == "failure" and doc["username"] == "admin1" and doc["expires_at"] == NOW + timedelta(minutes=15)
    assert not [c for c in access.insert_one.call_args_list if c.args[0]["kind"] == "unlock"]


def test_the_password_must_belong_to_the_logged_in_admin(access, password_check):
    access.count_documents.return_value = 0
    password_check.return_value = {"username": "someone_else"}
    assert lr.attempt_lab_view_unlock("admin1", "sess-1", "digest", now=NOW)[0] == "incorrect"


def test_empty_password_is_wrong_and_is_not_even_checked(access, password_check):
    access.count_documents.return_value = 0
    assert lr.attempt_lab_view_unlock("admin1", "sess-1", "", now=NOW)[0] == "incorrect"
    password_check.assert_not_called()


def test_five_wrong_passwords_lock_the_prompt_for_a_while(access, password_check):
    access.count_documents.return_value = 5
    password_check.return_value = {"username": "admin1"}                   # even the RIGHT password is not tried
    assert lr.attempt_lab_view_unlock("admin1", "sess-1", "digest", now=NOW) == ("locked_out", None)
    password_check.assert_not_called()
    access.insert_one.assert_not_called()
    query = access.count_documents.call_args.args[0]
    assert query == {"kind": "failure", "username": "admin1", "expires_at": {"$gt": NOW}}


def test_four_wrong_passwords_are_still_allowed_a_fifth_try(access, password_check):
    access.count_documents.return_value = 4
    password_check.return_value = {"username": "admin1"}
    assert lr.attempt_lab_view_unlock("admin1", "sess-1", "digest", now=NOW)[0] == "ok"


def test_locking_ends_only_this_sessions_window(access):
    lr.lock_lab_view("admin1", "sess-1")
    access.delete_many.assert_called_once_with({"kind": "unlock", "username": "admin1", "session_id": "sess-1"})


# ---------------------------------------------------------------- details

@pytest.fixture
def db(mocker):
    visits = mocker.patch.object(lr, "visits")
    patients = mocker.patch.object(lr, "patients")
    patients.find_one.return_value = {"name": "Ann Lee", "patient_type": "Student", "gender": "Female"}
    return visits, patients


VISIT = {
    "visit_id": "v1", "institute_id": "H1", "time": "2026-10-20T10:00", "doctor_username": "drx", "doctor_name": "Dr. X",
    "status": "completed", "invoice_no": "INV-1",
    "lab_tests": [
        {"lab_test": "Hemoglobin", "status": "completed", "timestamp": "2026-10-20T04:30:00+00:00"},
        {"lab_test": "Sugar", "status": "pending", "timestamp": datetime(2026, 10, 20, 4, 30, tzinfo=timezone.utc)},
    ],
    "lab_reports": [
        {"test_name": "Hemoglobin", "s3_key": "reports/lab1/SECRET-KEY.pdf", "file_name": "hb.pdf", "uploaded_by": "lab1",
         "uploaded_at": datetime(2026, 10, 20, 5, 0, tzinfo=timezone.utc)},
        {"test_name": "Sugar", "timestamp": "2026-10-20T05:30:00+00:00", "remarks": "fasting",
         "results": {"Glucose": {"value": "99", "reference_range": "70-110", "units": "mg/dl"}, "Note": "ok", "Weird": {"value": None}}},
    ],
    "lab_results_draft": {"Sugar": {"value": "DRAFT-VALUE"}},
}


def test_details_include_test_names_and_results(db):
    visits, _ = db
    visits.find_one.return_value = VISIT
    d = lr.get_lab_order_details("v1")
    assert d["patient_name"] == "Ann Lee" and d["institute_id"] == "H1" and d["gender"] == "Female" and d["doctor_name"] == "Dr. X"
    assert [(t["name"], t["status"]) for t in d["tests"]] == [("Hemoglobin", "completed"), ("Sugar", "pending")]
    assert d["tests"][1]["ordered_at"] == "2026-10-20T04:30:00+00:00"
    assert d["status"] == "partially_completed"


def test_typed_results_come_out_in_one_shape(db):
    visits, _ = db
    visits.find_one.return_value = VISIT
    typed = lr.get_lab_order_details("v1")["reports"][1]
    assert typed["kind"] == "typed" and typed["test_name"] == "Sugar" and typed["remarks"] == "fasting"
    assert typed["results"] == [
        {"name": "Glucose", "value": "99", "reference_range": "70-110", "units": "mg/dl"},
        {"name": "Note", "value": "ok", "reference_range": "", "units": ""},
        {"name": "Weird", "value": "", "reference_range": "", "units": ""},
    ]


def test_files_are_listed_by_position_and_never_by_storage_key(db):
    visits, _ = db
    visits.find_one.return_value = VISIT
    d = lr.get_lab_order_details("v1")
    f = d["reports"][0]
    assert (f["index"], f["kind"], f["file_name"], f["uploaded_by"]) == (0, "file", "hb.pdf", "lab1")
    assert f["saved_at"] == "2026-10-20T05:00:00+00:00"
    assert "SECRET-KEY" not in repr(d) and "s3_key" not in repr(d)


def test_unfinished_drafts_are_not_shown(db):
    visits, _ = db
    visits.find_one.return_value = VISIT
    assert "DRAFT-VALUE" not in repr(lr.get_lab_order_details("v1"))


def test_visit_without_lab_tests_or_missing_visit_is_not_found(db):
    visits, _ = db
    visits.find_one.return_value = None
    assert lr.get_lab_order_details("nope") is None
    visits.find_one.return_value = {"visit_id": "v", "lab_tests": []}
    assert lr.get_lab_order_details("v") is None


def test_damaged_entries_do_not_break_the_page(db):
    visits, patients = db
    patients.find_one.return_value = None
    visits.find_one.return_value = {**VISIT, "lab_tests": ["junk", {"lab_test": "A"}], "lab_reports": ["junk", None, {"test_name": "A", "results": "not a dict"}]}
    d = lr.get_lab_order_details("v1")
    assert [t["name"] for t in d["tests"]] == ["A"] and d["tests"][0]["status"] == "pending"
    assert d["patient_name"] is None
    assert d["reports"] == [{"index": 2, "test_name": "A", "saved_at": "", "uploaded_by": None, "kind": "typed", "results": [], "remarks": ""}]


def test_only_needed_fields_are_read_and_patient_details_are_minimal(db):
    visits, patients = db
    visits.find_one.return_value = VISIT
    lr.get_lab_order_details("v1")
    assert set(visits.find_one.call_args.args[1]) == {"_id", "visit_id", "institute_id", "time", "doctor_username", "doctor_name",
                                                      "status", "invoice_no", "lab_tests", "lab_reports", "lab_results_draft"}
    assert set(patients.find_one.call_args.args[1]) == {"_id", "name", "patient_type", "gender"}      # no date of birth, contact, OTP


# ---------------------------------------------------------------- file lookup

def test_file_reference_by_position(db):
    visits, _ = db
    visits.find_one.return_value = VISIT
    assert lr.get_lab_report_file_ref("v1", 0) == ("reports/lab1/SECRET-KEY.pdf", "hb.pdf")
    assert lr.get_lab_report_file_ref("v1", "0") == ("reports/lab1/SECRET-KEY.pdf", "hb.pdf")


@pytest.mark.parametrize("index", [1, 2, -1, 99, "x", None, 1.5])
def test_no_file_for_typed_reports_or_bad_positions(db, index):
    visits, _ = db
    visits.find_one.return_value = VISIT
    assert lr.get_lab_report_file_ref("v1", index) is None


def test_no_file_for_a_missing_visit(db):
    visits, _ = db
    visits.find_one.return_value = None
    assert lr.get_lab_report_file_ref("nope", 0) is None
    visits.find_one.return_value = {"lab_reports": None}
    assert lr.get_lab_report_file_ref("v", 0) is None
