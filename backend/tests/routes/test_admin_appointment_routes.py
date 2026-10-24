import pytest
from flask_jwt_extended import create_access_token

URL = "/api/admin/appointments/today"
PAYLOAD = {"date": "2026-10-24", "generated_at": "x", "counts": {"total": 0}, "active": []}


def headers(app, role):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity='u', additional_claims={'role': role})}"}


def test_admin_gets_todays_appointments(client, app, mocker):
    mocker.patch("database.get_todays_appointments", return_value=PAYLOAD)
    r = client.get(URL, headers=headers(app, "admin"))
    assert r.status_code == 200 and r.get_json() == PAYLOAD


@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_other_roles_are_refused(client, app, mocker, role):
    load = mocker.patch("database.get_todays_appointments", return_value=PAYLOAD)
    assert client.get(URL, headers=headers(app, role)).status_code == 403
    load.assert_not_called()


def test_login_is_required(client):
    assert client.get(URL).status_code == 401


def test_failure_gives_a_generic_message_not_internals(client, app, mocker):
    mocker.patch("database.get_todays_appointments", side_effect=RuntimeError("mongo://secret-host exploded"))
    r = client.get(URL, headers=headers(app, "admin"))
    assert r.status_code == 500
    assert "secret-host" not in r.get_data(as_text=True)


# ---------------------------------------------------------------- search, export, doctors

SEARCH = "/api/admin/appointments/search"
EXPORT = "/api/admin/appointments/export"
DOCTORS = "/api/admin/appointments/doctors"
RESULT = {"page": 1, "limit": 25, "total": 1, "total_pages": 1, "export_limit": 10000, "rows": [{"visit_id": "v1"}]}


@pytest.mark.parametrize("url", [SEARCH, EXPORT, DOCTORS])
def test_new_endpoints_need_login(client, url):
    assert client.get(url).status_code == 401


@pytest.mark.parametrize("url", [SEARCH, EXPORT, DOCTORS])
@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_new_endpoints_are_admin_only(client, app, mocker, url, role):
    mocker.patch("database.search_appointments", return_value=RESULT)
    mocker.patch("database.export_appointments", return_value=([], False))
    mocker.patch("database.list_appointment_doctors", return_value=[])
    assert client.get(url, headers=headers(app, role)).status_code == 403


def test_search_passes_the_filters_and_paging_through(client, app, mocker):
    search = mocker.patch("database.search_appointments", return_value=dict(RESULT))
    r = client.get(SEARCH, headers=headers(app, "admin"), query_string={
        "start_date": "2026-10-01", "end_date": "2026-10-10", "status": "completed", "doctor": "drx",
        "booked_by": "patient", "q": "ann", "page": "2", "limit": "50"})
    assert r.status_code == 200
    f, page, limit = search.call_args.args
    assert (f["start_date"], f["end_date"], f["status"], f["doctor"], f["booked_by"], f["q"]) == (
        "2026-10-01", "2026-10-10", "completed", "drx", "patient", "ann")
    assert (page, limit) == (2, 50)
    assert r.get_json()["filters"]["status"] == "completed" and r.get_json()["rows"] == [{"visit_id": "v1"}]


def test_search_with_nothing_given_uses_the_default_window(client, app, mocker):
    search = mocker.patch("database.search_appointments", return_value=dict(RESULT))
    assert client.get(SEARCH, headers=headers(app, "admin")).status_code == 200
    f, page, limit = search.call_args.args
    assert f["start_date"] < f["end_date"] and (page, limit) == (1, 25)


@pytest.mark.parametrize("query,fragment", [
    ({"start_date": "tomorrow"}, "From date"), ({"status": "bogus"}, "status"), ({"page": "0"}, "page"),
    ({"limit": "5000"}, "limit"), ({"start_date": "2026-11-01", "end_date": "2026-10-01"}, "after"),
])
def test_search_rejects_bad_input_without_touching_the_database(client, app, mocker, query, fragment):
    search = mocker.patch("database.search_appointments", return_value=dict(RESULT))
    r = client.get(SEARCH, headers=headers(app, "admin"), query_string=query)
    assert r.status_code == 400 and fragment in r.get_json()["error"]
    search.assert_not_called()


def test_search_failure_is_generic(client, app, mocker):
    mocker.patch("database.search_appointments", side_effect=RuntimeError("mongodb://user:pw@host"))
    r = client.get(SEARCH, headers=headers(app, "admin"))
    assert r.status_code == 500 and "mongodb" not in r.get_data(as_text=True)


def test_export_downloads_a_csv_file(client, app, mocker):
    rows = [{"visit_id": "v1", "time": "2026-10-24T09:00", "status": "completed", "institute_id": "H1", "patient_name": "Ann",
             "patient_type": "Student", "doctor_name": "Dr. X", "doctor_username": "drx", "booked_by": "patient", "booked_at": "x"}]
    mocker.patch("database.export_appointments", return_value=(rows, False))
    r = client.get(EXPORT, headers=headers(app, "admin"), query_string={"start_date": "2026-10-01", "end_date": "2026-10-24"})
    assert r.status_code == 200 and r.mimetype == "text/csv"
    assert r.headers["Content-Disposition"] == 'attachment; filename="appointments_2026-10-01_to_2026-10-24.csv"'
    assert r.headers["Cache-Control"] == "no-store" and r.headers["X-Export-Truncated"] == "false"
    text = r.get_data(as_text=True)
    assert "Date & Time" in text and "Ann" in text and "completed" in text


def test_export_flags_truncation(client, app, mocker):
    mocker.patch("database.export_appointments", return_value=([], True))
    r = client.get(EXPORT, headers=headers(app, "admin"))
    assert r.headers["X-Export-Truncated"] == "true"


def test_export_validates_and_hides_internals(client, app, mocker):
    export = mocker.patch("database.export_appointments", return_value=([], False))
    assert client.get(EXPORT, headers=headers(app, "admin"), query_string={"status": "bogus"}).status_code == 400
    export.assert_not_called()
    mocker.patch("database.export_appointments", side_effect=RuntimeError("secret"))
    r = client.get(EXPORT, headers=headers(app, "admin"))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)


def test_doctor_list(client, app, mocker):
    mocker.patch("database.list_appointment_doctors", return_value=[{"username": "drx", "name": "Dr. X"}])
    r = client.get(DOCTORS, headers=headers(app, "admin"))
    assert r.status_code == 200 and r.get_json() == [{"username": "drx", "name": "Dr. X"}]


def test_doctor_list_failure_is_generic(client, app, mocker):
    mocker.patch("database.list_appointment_doctors", side_effect=RuntimeError("boom"))
    r = client.get(DOCTORS, headers=headers(app, "admin"))
    assert r.status_code == 500 and "boom" not in r.get_data(as_text=True)


# ---------------------------------------------------------------- analytics

ANALYTICS = "/api/admin/appointments/analytics"


def test_analytics_needs_login(client):
    assert client.get(ANALYTICS).status_code == 401


@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_analytics_is_admin_only(client, app, mocker, role):
    build = mocker.patch("database.get_appointment_analytics", return_value={})
    assert client.get(ANALYTICS, headers=headers(app, role)).status_code == 403
    build.assert_not_called()


def test_analytics_uses_the_requested_period(client, app, mocker):
    build = mocker.patch("database.get_appointment_analytics", return_value={"totals": {"total": 3}})
    r = client.get(ANALYTICS, headers=headers(app, "admin"), query_string={"start_date": "2026-10-01", "end_date": "2026-10-07"})
    assert r.status_code == 200 and r.get_json() == {"totals": {"total": 3}}
    build.assert_called_once_with("2026-10-01", "2026-10-07")


def test_analytics_defaults_to_30_days(client, app, mocker):
    build = mocker.patch("database.get_appointment_analytics", return_value={})
    assert client.get(ANALYTICS, headers=headers(app, "admin")).status_code == 200
    start, end = build.call_args.args
    from datetime import date
    assert (date.fromisoformat(end) - date.fromisoformat(start)).days == 29


@pytest.mark.parametrize("query,fragment", [
    ({"start_date": "yesterday"}, "From date"), ({"start_date": "2020-01-01", "end_date": "2026-01-01"}, "366 days"),
    ({"start_date": "2026-10-10", "end_date": "2026-10-01"}, "after"),
])
def test_analytics_rejects_bad_periods_without_touching_the_database(client, app, mocker, query, fragment):
    build = mocker.patch("database.get_appointment_analytics", return_value={})
    r = client.get(ANALYTICS, headers=headers(app, "admin"), query_string=query)
    assert r.status_code == 400 and fragment in r.get_json()["error"]
    build.assert_not_called()


def test_analytics_failure_is_generic(client, app, mocker):
    mocker.patch("database.get_appointment_analytics", side_effect=RuntimeError("mongodb://user:pw@host"))
    r = client.get(ANALYTICS, headers=headers(app, "admin"))
    assert r.status_code == 500 and "mongodb" not in r.get_data(as_text=True)
