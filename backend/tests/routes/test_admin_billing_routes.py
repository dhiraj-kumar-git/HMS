import pytest
from flask_jwt_extended import create_access_token

SEARCH = "/api/admin/billing/search"
EXPORT = "/api/admin/billing/export"
FILTERS = "/api/admin/billing/filters"
RESULT = {"page": 1, "limit": 25, "total": 1, "total_pages": 1, "export_limit": 10000,
          "summary": {"counts": {"paid": 1, "pending": 0, "cancelled": 0, "total": 1},
                      "paid_amount": {"total": 10.0, "reimbursed": 0.0, "self_paid": 10.0}},
          "rows": [{"key": "INV-1", "status": "paid"}]}


def headers(app, role):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity='u', additional_claims={'role': role})}"}


@pytest.mark.parametrize("url", [SEARCH, EXPORT, FILTERS])
def test_login_is_required(client, url):
    assert client.get(url).status_code == 401


@pytest.mark.parametrize("url", [SEARCH, EXPORT, FILTERS])
@pytest.mark.parametrize("role", ["receptionist", "doctor", "lab_staff", "medical_store", "patient"])
def test_admin_only(client, app, mocker, url, role):
    mocker.patch("database.search_billing", return_value=RESULT)
    mocker.patch("database.export_billing", return_value=([], False))
    mocker.patch("database.list_billing_filter_options", return_value={})
    assert client.get(url, headers=headers(app, role)).status_code == 403


def test_search_passes_every_filter_through(client, app, mocker):
    search = mocker.patch("database.search_billing", return_value=dict(RESULT))
    r = client.get(SEARCH, headers=headers(app, "admin"), query_string={
        "start_date": "2026-10-01", "end_date": "2026-10-10", "status": "paid", "category": "lab_test", "payment_mode": "UPI",
        "patient_type": "Faculty", "doctor": "Dr. X", "q": "ann", "page": "2", "limit": "50"})
    assert r.status_code == 200
    f, page, limit = search.call_args.args
    assert (f["start_date"], f["end_date"], f["status"], f["category"], f["payment_mode"], f["patient_type"], f["doctor"], f["q"]) == (
        "2026-10-01", "2026-10-10", "paid", "lab_test", "UPI", "Faculty", "Dr. X", "ann")
    assert (page, limit) == (2, 50)
    assert r.get_json()["filters"]["status"] == "paid" and r.get_json()["rows"] == RESULT["rows"]


def test_search_defaults(client, app, mocker):
    search = mocker.patch("database.search_billing", return_value=dict(RESULT))
    assert client.get(SEARCH, headers=headers(app, "admin")).status_code == 200
    f, page, limit = search.call_args.args
    assert f["start_date"] < f["end_date"] and (page, limit) == (1, 25)


@pytest.mark.parametrize("query,fragment", [
    ({"start_date": "yesterday"}, "From date"), ({"status": "refunded"}, "status"), ({"category": "x"}, "category"),
    ({"page": "0"}, "page"), ({"limit": "5000"}, "limit"), ({"start_date": "2026-11-01", "end_date": "2026-10-01"}, "after"),
    ({"payment_mode": "x" * 40}, "too long"),
])
def test_bad_input_is_refused_before_the_database(client, app, mocker, query, fragment):
    search = mocker.patch("database.search_billing", return_value=dict(RESULT))
    r = client.get(SEARCH, headers=headers(app, "admin"), query_string=query)
    assert r.status_code == 400 and fragment in r.get_json()["error"]
    search.assert_not_called()


def test_failures_are_generic(client, app, mocker):
    mocker.patch("database.search_billing", side_effect=RuntimeError("mongodb://user:pw@host"))
    r = client.get(SEARCH, headers=headers(app, "admin"))
    assert r.status_code == 500 and "mongodb" not in r.get_data(as_text=True)


def test_export_is_a_csv_download(client, app, mocker):
    rows = [{"kind": "bill", "key": "INV-1", "date": "2026-10-20T10:00", "status": "paid", "invoice_no": "INV-1", "institute_id": "H1",
             "patient_name": "Ann", "patient_type": "Staff", "doctor_name": "Dr. X", "category": "medicine", "payment_mode": "UPI",
             "item_count": 2, "total_amount": 100.0, "reimbursed_amount": 90.0, "self_paid_amount": 10.0}]
    mocker.patch("database.export_billing", return_value=(rows, False))
    r = client.get(EXPORT, headers=headers(app, "admin"), query_string={"start_date": "2026-10-01", "end_date": "2026-10-24"})
    assert r.status_code == 200 and r.mimetype == "text/csv"
    assert r.headers["Content-Disposition"] == 'attachment; filename="billing_2026-10-01_to_2026-10-24.csv"'
    assert r.headers["Cache-Control"] == "no-store" and r.headers["X-Export-Truncated"] == "false"
    text = r.get_data(as_text=True)
    assert "INV-1" in text and "100.00" in text and "Medicines" in text


def test_export_flags_truncation_validates_and_hides_errors(client, app, mocker):
    export = mocker.patch("database.export_billing", return_value=([], True))
    assert client.get(EXPORT, headers=headers(app, "admin")).headers["X-Export-Truncated"] == "true"
    export.reset_mock()
    assert client.get(EXPORT, headers=headers(app, "admin"), query_string={"status": "nope"}).status_code == 400
    export.assert_not_called()
    mocker.patch("database.export_billing", side_effect=RuntimeError("secret"))
    r = client.get(EXPORT, headers=headers(app, "admin"))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)


def test_filter_options(client, app, mocker):
    options = {"doctors": ["Dr. X"], "payment_modes": ["UPI"], "patient_types": ["Staff"]}
    mocker.patch("database.list_billing_filter_options", return_value=options)
    r = client.get(FILTERS, headers=headers(app, "admin"))
    assert r.status_code == 200 and r.get_json() == options
    mocker.patch("database.list_billing_filter_options", side_effect=RuntimeError("boom"))
    r = client.get(FILTERS, headers=headers(app, "admin"))
    assert r.status_code == 500 and "boom" not in r.get_data(as_text=True)


DETAILS = "/api/admin/billing/bill/INV-1/details"


def test_details_need_login_and_admin(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_billing_details", return_value={"items": []})
    assert client.get(DETAILS).status_code == 401
    for role in ["receptionist", "doctor", "lab_staff", "medical_store", "patient"]:
        assert client.get(DETAILS, headers=headers(app, role)).status_code == 403


def test_details_are_locked_until_the_password_was_entered(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=False)
    get = mocker.patch("database.get_billing_details", return_value={"items": []})
    r = client.get(DETAILS, headers=headers(app, "admin"))
    assert r.status_code == 403 and r.get_json()["code"] == "LAB_VIEW_LOCKED"
    assert not get.called


def test_details_inside_the_window(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    get = mocker.patch("database.get_billing_details", return_value={"items": [{"name": "Para"}]})
    r = client.get("/api/admin/billing/order/v1/details", headers=headers(app, "admin"))
    assert r.status_code == 200 and r.get_json() == {"items": [{"name": "Para"}]} and r.headers["Cache-Control"] == "no-store"
    assert get.call_args.args == ("order", "v1")


def test_details_not_found_and_errors_are_generic(client, app, mocker):
    mocker.patch("database.is_lab_view_unlocked", return_value=True)
    mocker.patch("database.get_billing_details", return_value=None)
    assert client.get(DETAILS, headers=headers(app, "admin")).status_code == 404
    mocker.patch("database.get_billing_details", side_effect=RuntimeError("mongo://secret"))
    r = client.get(DETAILS, headers=headers(app, "admin"))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)


ANALYTICS = "/api/admin/billing/analytics"


def test_analytics_need_login_and_admin(client, app, mocker):
    mocker.patch("database.get_billing_analytics", return_value={"kpis": {}})
    assert client.get(ANALYTICS).status_code == 401
    for role in ["receptionist", "doctor", "lab_staff", "medical_store", "patient"]:
        assert client.get(ANALYTICS, headers=headers(app, role)).status_code == 403


def test_analytics_default_to_the_last_30_days(client, app, mocker):
    get = mocker.patch("database.get_billing_analytics", return_value={"kpis": {}})
    r = client.get(ANALYTICS, headers=headers(app, "admin"))
    assert r.status_code == 200 and r.headers["Cache-Control"] == "no-store"
    start, end = get.call_args.args
    assert start < end


def test_analytics_pass_the_period_through(client, app, mocker):
    get = mocker.patch("database.get_billing_analytics", return_value={"kpis": {}})
    client.get(ANALYTICS, headers=headers(app, "admin"), query_string={"start_date": "2026-10-01", "end_date": "2026-10-10"})
    assert get.call_args.args == ("2026-10-01", "2026-10-10")


@pytest.mark.parametrize("query", [{"start_date": "x"}, {"end_date": "2026-13-45"}, {"start_date": "2026-10-10", "end_date": "2026-10-01"},
                                   {"start_date": "2020-01-01", "end_date": "2026-10-01"}])
def test_analytics_refuse_bad_periods_before_the_database(client, app, mocker, query):
    get = mocker.patch("database.get_billing_analytics", return_value={})
    assert client.get(ANALYTICS, headers=headers(app, "admin"), query_string=query).status_code == 400
    assert not get.called


def test_analytics_errors_are_generic(client, app, mocker):
    mocker.patch("database.get_billing_analytics", side_effect=RuntimeError("mongodb://secret"))
    r = client.get(ANALYTICS, headers=headers(app, "admin"))
    assert r.status_code == 500 and "secret" not in r.get_data(as_text=True)
