from datetime import datetime, timezone

import pytest

import app.database.appointments_admin as aa


def visit(vid, time, status, institute_id="H1", doctor="drx", **extra):
    return {"visit_id": vid, "institute_id": institute_id, "doctor_username": doctor, "doctor_name": extra.pop("doctor_name", None),
            "time": time, "status": status, "booked_by": extra.pop("booked_by", "patient"), **extra}


@pytest.fixture
def db(mocker):
    mock_visits = mocker.patch.object(aa, "visits")
    mock_patients = mocker.patch.object(aa, "patients")
    mock_patients.find.return_value = [
        {"institute_id": "H1", "name": "Ann Lee", "patient_type": "Student"},
        {"institute_id": "H2", "name": "Bob Roy", "patient_type": "Faculty"},
    ]
    return mock_visits, mock_patients


NOW = datetime(2026, 10, 24, 6, 0, tzinfo=timezone.utc)   # 11:30 IST on 24 Oct


def test_day_is_taken_in_ist_not_utc(db):
    # 20:00 UTC on the 23rd is already 01:30 on the 24th in India
    late_utc = datetime(2026, 10, 23, 20, 0, tzinfo=timezone.utc)
    assert aa.get_todays_appointments(late_utc)["date"] == "2026-10-24"
    assert aa.get_todays_appointments(NOW)["date"] == "2026-10-24"
    early_utc = datetime(2026, 10, 24, 18, 0, tzinfo=timezone.utc)   # 23:30 IST, same Indian day
    assert aa.get_todays_appointments(early_utc)["date"] == "2026-10-24"


def test_query_matches_the_days_prefix_with_t_or_space(db):
    visits, _ = db
    visits.find.return_value = []
    aa.get_todays_appointments(NOW)
    query = visits.find.call_args[0][0]
    assert query == {"time": {"$regex": "^2026-10-24[T ]"}}


def test_counts_cover_every_status_and_total(db):
    visits, _ = db
    visits.find.return_value = [
        visit("a", "2026-10-24T09:00", "booked"), visit("b", "2026-10-24T09:10", "confirmed"),
        visit("c", "2026-10-24T09:20", "confirmed"), visit("d", "2026-10-24T09:30", "checked_in"),
        visit("e", "2026-10-24T09:40", "consultation"), visit("f", "2026-10-24T09:50", "completed"),
        visit("g", "2026-10-24T10:00", "completed"), visit("h", "2026-10-24T10:10", "cancelled"),
        visit("i", "2026-10-24T10:20", "no_show"),
    ]
    c = aa.get_todays_appointments(NOW)["counts"]
    assert c == {"booked": 1, "confirmed": 2, "checked_in": 1, "consultation": 1, "completed": 2,
                 "cancelled": 1, "other": 1, "total": 9}


def test_empty_day(db):
    visits, patients = db
    visits.find.return_value = []
    out = aa.get_todays_appointments(NOW)
    assert out["active"] == [] and out["counts"]["total"] == 0
    patients.find.assert_not_called()                      # nothing to look up


def test_only_unfinished_appointments_are_listed_and_sorted_by_time(db):
    visits, _ = db
    visits.find.return_value = [
        visit("late", "2026-10-24T15:00", "confirmed"), visit("done", "2026-10-24T08:00", "completed"),
        visit("early", "2026-10-24 09:00", "booked"), visit("gone", "2026-10-24T08:30", "cancelled"),
        visit("mid", "2026-10-24T12:00", "checked_in"), visit("now", "2026-10-24T13:00", "consultation"),
    ]
    ids = [a["visit_id"] for a in aa.get_todays_appointments(NOW)["active"]]
    assert ids == ["early", "mid", "now", "late"]


def test_legacy_status_spellings_are_normalised(db):
    visits, _ = db
    visits.find.return_value = [visit("a", "2026-10-24T09:00", "Checked in"), visit("b", "2026-10-24T09:10", "Consultation"),
                                visit("c", "2026-10-24T09:20", "Upcoming"), visit("d", "2026-10-24T09:30", None)]
    out = aa.get_todays_appointments(NOW)
    assert [a["status"] for a in out["active"]] == ["checked_in", "consultation", "upcoming"]
    assert out["counts"]["checked_in"] == 1 and out["counts"]["consultation"] == 1 and out["counts"]["other"] == 2


def test_rows_carry_patient_and_doctor_details(db):
    visits, _ = db
    visits.find.return_value = [
        visit("a", "2026-10-24T09:00", "booked", "H1", "drx", doctor_name="Dr. X", booked_by="receptionist"),
        visit("b", "2026-10-24T10:00", "booked", "H2", "dry"),
        visit("c", "2026-10-24T11:00", "booked", "H9", "drz"),
    ]
    rows = {r["visit_id"]: r for r in aa.get_todays_appointments(NOW)["active"]}
    assert rows["a"]["patient_name"] == "Ann Lee" and rows["a"]["patient_type"] == "Student"
    assert rows["a"]["doctor_name"] == "Dr. X" and rows["a"]["booked_by"] == "receptionist"
    assert rows["b"]["doctor_name"] == "dry"                # falls back to the username
    assert rows["c"]["patient_name"] is None                # unknown patient does not break the list


def test_patients_are_looked_up_once_for_everyone(db):
    visits, patients = db
    visits.find.return_value = [visit(str(i), f"2026-10-24T09:{i:02d}", "booked", "H1" if i % 2 else "H2") for i in range(10)]
    aa.get_todays_appointments(NOW)
    assert patients.find.call_count == 1
    assert sorted(patients.find.call_args[0][0]["institute_id"]["$in"]) == ["H1", "H2"]


def test_no_clinical_data_is_selected(db):
    visits, _ = db
    visits.find.return_value = []
    aa.get_todays_appointments(NOW)
    projection = visits.find.call_args[0][1]
    assert not ({"prescriptions", "lab_tests", "lab_reports", "emr_data", "diagnosis_note"} & set(projection))
