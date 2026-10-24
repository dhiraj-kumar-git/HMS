import pytest

import app.database.billing_admin as bd

BILL = {"invoice_no": "INV-1", "payment_date": __import__("datetime").datetime(2026, 10, 1, 19, 0, tzinfo=__import__("datetime").timezone.utc),
        "institute_id": "H1", "patient_name": "Ann", "patient_type": "Faculty", "doctor_name": "Dr. X", "bill_category": "medicine",
        "payment_mode": "UPI", "unrounded_total": 110.4, "round_off": -0.4, "total_amount": 110, "reimbursed_amount": 99.36, "self_paid_amount": 10.64,
        "items": [{"type": "medicine", "name": "Para", "rate": 10, "quantity": 5, "gross": 50, "discount": 0, "discount_amount": 0,
                   "cgst": 1.5, "sgst": 1.5, "item_total": 53, "batch": "B1", "expiry": "2027-01", "secret": "X"},
                  {"type": "lab_test", "name": "CBC", "gross": 100, "discount": 50, "discount_amount": 50, "cgst": 0, "sgst": 0, "item_total": 50},
                  "junk"]}


@pytest.fixture
def db(mocker):
    return mocker.patch.object(bd, "bills"), mocker.patch.object(bd, "visits"), mocker.patch.object(bd, "patients")


def test_bill_details_have_lines_and_totals(db):
    db[0].find_one.return_value = dict(BILL)
    d = bd.get_billing_details("bill", "INV-1")
    assert [i["name"] for i in d["items"]] == ["Para", "CBC"]
    assert d["items"][0]["quantity"] == 5 and d["items"][1]["quantity"] is None
    assert d["totals"] == {"items_total": 110.4, "gst": 3.0, "discount": 50.0, "round_off": -0.4, "total": 110.0, "reimbursed": 99.36, "self_paid": 10.64}
    assert d["date"] == "2026-10-02T00:30" and "secret" not in repr(d)


def test_bill_query_is_by_invoice_and_projects_only_invoice_fields(db):
    db[0].find_one.return_value = None
    assert bd.get_billing_details("bill", "INV-9") is None
    q, proj = db[0].find_one.call_args.args
    assert q == {"invoice_no": "INV-9"} and "sponsor_name" not in proj and "sponsor_psrn" not in proj and "age" not in proj


@pytest.mark.parametrize("kind,key", [("x", "a"), ("bill", ""), ("bill", None), ("bill", {"$ne": 1}), ("order", {"$ne": 1}), (None, "a")])
def test_bad_input_is_not_queried(db, kind, key):
    assert bd.get_billing_details(kind, key) is None
    assert not db[0].find_one.called and not db[1].find_one.called


def order(**over):
    return {"visit_id": "v1", "institute_id": "H1", "time": "2026-10-01 10:00", "status": "Completed", "doctor_name": "Dr. Y",
            "prescriptions": [{"drug": "Para", "quantity": "2"}, {"note": "Syrup"}], "lab_tests": [{"lab_test": "CBC"}, {"x": 1}], **over}


def test_order_details_are_names_only(db):
    db[1].find_one.return_value = order()
    db[2].find_one.return_value = {"name": "Ann", "patient_type": "Student"}
    d = bd.get_billing_details("order", "v1")
    assert d["status"] == "pending" and d["totals"] is None and d["date"] == "2026-10-01T10:00"
    assert d["items"] == [{"type": "medicine", "name": "Para", "quantity": "2"}, {"type": "medicine", "name": "Syrup", "quantity": "1"},
                          {"type": "lab_test", "name": "CBC", "quantity": "1"}]
    assert not any(k in repr(d) for k in ("rate", "gross", "amount"))


def test_cancelled_order(db):
    db[1].find_one.return_value = order(status="cancelled")
    db[2].find_one.return_value = None
    assert bd.get_billing_details("order", "v1")["status"] == "cancelled"


@pytest.mark.parametrize("visit", [None, order(invoice_no="INV-1"), order(status="booked"), order(prescriptions=[], lab_tests=[])])
def test_not_a_pending_or_cancelled_bill(db, visit):
    db[1].find_one.return_value = visit
    assert bd.get_billing_details("order", "v1") is None
