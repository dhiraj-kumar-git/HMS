import pytest
from flask_jwt_extended import create_access_token

SEARCH = "/api/admin/lab-reports/search"
EXPORT = "/api/admin/lab-reports/export"
DOCTORS = "/api/admin/lab-reports/doctors"
RESULT = {"page": 1, "limit": 25, "total": 1, "total_pages": 1, "export_limit": 10000,
          "summary": {"total": 1}, "rows": [{"visit_id": "v1", "status": "pending"}]}


def headers(app, role):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity='u', additional_claims={'role': role})}"}


@pytest.mark.parametrize("url", [SEARCH, EXPORT, DOCTORS])
def test_login_is_required(client, url):
    assert client.get(url).status_code == 401


@pytest.mark.parametrize("url", [SEARCH, EXPORT, DOCTORS])
@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_admin_only(client, app, mocker, url, role):
    mocker.patch("database.search_lab_orders", return_value=RESULT)
    mocker.patch("database.export_lab_orders", return_value=([], False))
    mocker.patch("database.list_lab_order_doctors", return_value=[])
    assert client.get(url, headers=headers(app, role)).status_code == 403


def test_search_passes_filters_and_paging_through(client, app, mocker):
    search = mocker.patch("database.search_lab_orders", return_value=dict(RESULT))
    r = client.get(SEARCH, headers=headers(app, "admin"), query_string={
        "start_date": "2026-10-01", "end_date": "2026-10-10", "status": "pending", "doctor": "drx", "q": "ann",
        "page": "2", "limit": "50"})
    assert r.status_code == 200
    f, page, limit = search.call_args.args
    assert (f["start_date"], f["end_date"], f["status"], f["doctor"], f["q"]) == ("2026-10-01", "2026-10-10", "pending", "drx", "ann")
    assert (page, limit) == (2, 50)
    assert r.get_json()["filters"]["status"] == "pending" and r.get_json()["rows"] == RESULT["rows"]


def test_search_defaults(client, app, mocker):
    search = mocker.patch("database.search_lab_orders", return_value=dict(RESULT))
    assert client.get(SEARCH, headers=headers(app, "admin")).status_code == 200
    f, page, limit = search.call_args.args
    assert f["start_date"] < f["end_date"] and (page, limit) == (1, 25)


@pytest.mark.parametrize("query,fragment", [
    ({"start_date": "yesterday"}, "From date"), ({"status": "booked"}, "status"), ({"page": "0"}, "page"),
    ({"limit": "5000"}, "limit"), ({"start_date": "2026-11-01", "end_date": "2026-10-01"}, "after"),
])
def test_bad_input_is_refused_before_the_database(client, app, mocker, query, fragment):
    search = mocker.patch("database.search_lab_orders", return_value=dict(RESULT))
    r = client.get(SEARCH, headers=headers(app, "admin"), query_string=query)
    assert r.status_code == 400 and fragment in r.get_json()["error"]
    search.assert_not_called()


def test_failures_are_generic(client, app, mocker):
    mocker.patch("database.search_lab_orders", side_effect=RuntimeError("mongodb://user:pw@host"))
    r = client.get(SEARCH, headers=headers(app, "admin"))
    assert r.status_code == 500 and "mongodb" not in r.get_data(as_text=True)


def test_export_is_a_csv_download(client, app, mocker):
    rows = [{"visit_id": "v1", "time": "2026-10-20T10:00", "status": "completed", "institute_id": "H1", "patient_name": "Ann",
             "patient_type": "Student", "doctor_name": "Dr. X", "tests_total": 2, "tests_completed": 2, "report_files": 1, "report_typed": 1}]
    mocker.patch("database.export_lab_orders", return_value=(rows, False))
    r = client.get(EXPORT, headers=headers(app, "admin"), query_string={"start_date": "2026-10-01", "end_date": "2026-10-24"})
    assert r.status_code == 200 and r.mimetype == "text/csv"
    assert r.headers["Content-Disposition"] == 'attachment; filename="lab_reports_2026-10-01_to_2026-10-24.csv"'
    assert r.headers["Cache-Control"] == "no-store" and r.headers["X-Export-Truncated"] == "false"
    text = r.get_data(as_text=True)
    assert "Completed" in text and "Ann" in text


def test_export_flags_truncation_and_validates(client, app, mocker):
    export = mocker.patch("database.export_lab_orders", return_value=([], True))
    assert client.get(EXPORT, headers=headers(app, "admin")).headers["X-Export-Truncated"] == "true"
    export.reset_mock()
    assert client.get(EXPORT, headers=headers(app, "admin"), query_string={"status": "nope"}).status_code == 400
    export.assert_not_called()


def test_export_failure_is_generic(client, app, mocker):
    mocker.patch("database.export_lab_orders", side_effect=RuntimeError("secret"))
    r = client.get(EXPORT, headers=headers(app, "admin"))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)


def test_doctor_list(client, app, mocker):
    mocker.patch("database.list_lab_order_doctors", return_value=[{"username": "drx", "name": "Dr. X"}])
    r = client.get(DOCTORS, headers=headers(app, "admin"))
    assert r.status_code == 200 and r.get_json() == [{"username": "drx", "name": "Dr. X"}]
    mocker.patch("database.list_lab_order_doctors", side_effect=RuntimeError("boom"))
    r = client.get(DOCTORS, headers=headers(app, "admin"))
    assert r.status_code == 500 and "boom" not in r.get_data(as_text=True)


# ---------------------------------------------------------------- password-protected part

from datetime import datetime as _dt, timezone as _tz

UNLOCK = "/api/admin/lab-reports/unlock"
LOCK = "/api/admin/lab-reports/lock"
DETAILS = "/api/admin/lab-reports/v1/details"
FILE = "/api/admin/lab-reports/v1/file/0"
EXPIRES = _dt(2026, 10, 25, 6, 10, tzinfo=_tz.utc)
DETAIL_PAYLOAD = {"visit_id": "v1", "tests": [{"name": "Hemoglobin", "status": "completed"}], "reports": []}


def session_headers(app, role="admin", session="sess-1", user="admin1"):
    with app.app_context():
        return {"Authorization": "Bearer " + create_access_token(identity=user, additional_claims={"role": role, "session_id": session})}


@pytest.mark.parametrize("method,url", [("post", UNLOCK), ("post", LOCK), ("get", DETAILS), ("get", FILE)])
def test_protected_endpoints_need_login(client, method, url):
    assert getattr(client, method)(url, json={}).status_code == 401


@pytest.mark.parametrize("method,url", [("post", UNLOCK), ("post", LOCK), ("get", DETAILS), ("get", FILE)])
@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_protected_endpoints_are_admin_only(client, app, mocker, method, url, role):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    attempt = mocker.patch("database.attempt_lab_view_unlock", return_value=("ok", EXPIRES))
    details = mocker.patch("database.get_lab_order_details", return_value=DETAIL_PAYLOAD)
    assert getattr(client, method)(url, headers=session_headers(app, role), json={"password": "x"}).status_code == 403
    attempt.assert_not_called()
    details.assert_not_called()


# -- unlocking

def test_right_password_opens_the_window_for_this_login_session(client, app, mocker):
    attempt = mocker.patch("database.attempt_lab_view_unlock", return_value=("ok", EXPIRES))
    r = client.post(UNLOCK, headers=session_headers(app), json={"password": "digest"})
    assert r.status_code == 200
    assert r.get_json() == {"unlocked": True, "expires_in": 600, "expires_at": EXPIRES.isoformat()}
    attempt.assert_called_once_with("admin1", "sess-1", "digest")


def test_wrong_password_is_403_never_401(client, app, mocker):
    """The app signs a user out on any 401, so a mistyped password must not be one."""
    mocker.patch("database.attempt_lab_view_unlock", return_value=("incorrect", None))
    r = client.post(UNLOCK, headers=session_headers(app), json={"password": "nope"})
    assert r.status_code == 403 and r.get_json()["code"] == "INCORRECT_PASSWORD"


def test_too_many_wrong_passwords_gives_429(client, app, mocker):
    mocker.patch("database.attempt_lab_view_unlock", return_value=("locked_out", None))
    r = client.post(UNLOCK, headers=session_headers(app), json={"password": "x"})
    assert r.status_code == 429 and r.get_json()["code"] == "TOO_MANY_ATTEMPTS"


@pytest.mark.parametrize("body", [{}, {"password": ""}, {"password": 123}, {"password": None}])
def test_password_is_required(client, app, mocker, body):
    attempt = mocker.patch("database.attempt_lab_view_unlock", return_value=("ok", EXPIRES))
    assert client.post(UNLOCK, headers=session_headers(app), json=body).status_code == 400
    attempt.assert_not_called()


def test_unlock_without_a_json_body(client, app, mocker):
    mocker.patch("database.attempt_lab_view_unlock", return_value=("ok", EXPIRES))
    assert client.post(UNLOCK, headers=session_headers(app), data="not json").status_code == 400


def test_unlock_failure_is_generic_and_never_echoes_the_password(client, app, mocker):
    mocker.patch("database.attempt_lab_view_unlock", side_effect=RuntimeError("db down, password=hunter2"))
    r = client.post(UNLOCK, headers=session_headers(app), json={"password": "hunter2"})
    assert r.status_code == 500 and "hunter2" not in r.get_data(as_text=True)


def test_lock_now(client, app, mocker):
    lock = mocker.patch("database.lock_lab_view")
    r = client.post(LOCK, headers=session_headers(app))
    assert r.status_code == 200 and r.get_json() == {"locked": True}
    lock.assert_called_once_with("admin1", "sess-1")


# -- while locked

@pytest.mark.parametrize("url", [DETAILS, FILE])
def test_nothing_is_given_while_locked(client, app, mocker, url):
    mocker.patch("database.is_lab_view_unlocked", return_value=False)
    details = mocker.patch("database.get_lab_order_details", return_value=DETAIL_PAYLOAD)
    ref = mocker.patch("database.get_lab_report_file_ref", return_value=("k.pdf", "f.pdf"))
    r = client.get(url, headers=session_headers(app))
    assert r.status_code == 403 and r.get_json()["code"] == "LAB_VIEW_LOCKED"
    details.assert_not_called()
    ref.assert_not_called()


def test_the_window_is_looked_up_for_this_admin_and_session(client, app, mocker):
    check = mocker.patch("database.is_lab_view_unlocked", return_value=False)
    client.get(DETAILS, headers=session_headers(app, session="sess-9", user="adminB"))
    check.assert_called_once_with("adminB", "sess-9")


def test_the_status_list_does_not_need_the_password(client, app, mocker):
    check = mocker.patch("database.is_lab_view_unlocked", return_value=False)
    mocker.patch("database.search_lab_orders", return_value=dict(RESULT))
    assert client.get(SEARCH, headers=session_headers(app)).status_code == 200
    check.assert_not_called()


# -- while unlocked

def test_details_when_unlocked(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_lab_order_details", return_value=DETAIL_PAYLOAD)
    r = client.get(DETAILS, headers=session_headers(app))
    assert r.status_code == 200 and r.get_json() == DETAIL_PAYLOAD
    assert r.headers["Cache-Control"] == "no-store"


def test_details_not_found_and_failure(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_lab_order_details", return_value=None)
    assert client.get(DETAILS, headers=session_headers(app)).status_code == 404
    mocker.patch("database.get_lab_order_details", side_effect=RuntimeError("mongodb://u:p@h"))
    r = client.get(DETAILS, headers=session_headers(app))
    assert r.status_code == 500 and "mongodb" not in r.get_data(as_text=True)


def stored(mocker, data=b"%PDF-1.4 body"):
    from unittest.mock import MagicMock
    body = MagicMock()
    body.read.return_value = data
    return mocker.patch("app.routes.admin_lab_report_routes.s3.get_object", return_value={"Body": body})


def test_file_comes_back_from_memory_with_safe_headers(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_lab_report_file_ref", return_value=("reports/lab1/hb.pdf", "hb.pdf"))
    get = stored(mocker)
    r = client.get(FILE, headers=session_headers(app))
    assert r.status_code == 200 and r.data == b"%PDF-1.4 body" and r.mimetype == "application/pdf"
    assert r.headers["Cache-Control"] == "no-store" and r.headers["X-Content-Type-Options"] == "nosniff"
    assert "sandbox" in r.headers["Content-Security-Policy"]
    assert get.call_args.kwargs["Key"] == "reports/lab1/hb.pdf"


def test_the_file_is_looked_up_by_visit_and_position(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    ref = mocker.patch("database.get_lab_report_file_ref", return_value=("reports/lab1/hb.pdf", "hb.pdf"))
    stored(mocker)
    client.get("/api/admin/lab-reports/v7/file/3", headers=session_headers(app))
    ref.assert_called_once_with("v7", 3)


@pytest.mark.parametrize("url", ["/api/admin/lab-reports/v1/file/x", "/api/admin/lab-reports/v1/file/-1", "/api/admin/lab-reports/v1/file/1.5"])
def test_only_whole_positions_are_routed(client, app, mocker, url):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    ref = mocker.patch("database.get_lab_report_file_ref", return_value=None)
    assert client.get(url, headers=session_headers(app)).status_code == 404
    ref.assert_not_called()


def test_unknown_file_types_are_forced_to_download(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_lab_report_file_ref", return_value=("reports/lab1/old.html", "old.html"))
    stored(mocker, b"<script>alert(1)</script>")
    r = client.get(FILE, headers=session_headers(app))
    assert r.mimetype == "application/octet-stream" and r.headers["Content-Disposition"].startswith("attachment")


def test_missing_file_and_storage_failure(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_lab_report_file_ref", return_value=None)
    assert client.get(FILE, headers=session_headers(app)).status_code == 404
    mocker.patch("database.get_lab_report_file_ref", return_value=("reports/lab1/hb.pdf", "hb.pdf"))
    mocker.patch("app.routes.admin_lab_report_routes.s3.get_object", side_effect=RuntimeError("minio://secret-host"))
    r = client.get(FILE, headers=session_headers(app))
    assert r.status_code == 500 and "secret-host" not in r.get_data(as_text=True)
