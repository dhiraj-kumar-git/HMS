    res = _map_aggregated_patient(p)
    assert res["workflow_status"] == "completed"

def test_get_active_visit_id(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.find_one.return_value = {"visit_id": "v1"}
    assert _get_active_visit_id("123", "doc1") == "v1"

def test_finalize_visit(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    _finalize_visit('v1', 'completed')
    mock_visits.update_one.assert_called_once()

def test_get_receptionist_queue(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_visits.aggregate.return_value = [{"visit_id": "v1", "status": "booked"}]
    
    # Test without date filter
    res = patients_db.get_receptionist_queue(status_filter="all")
    assert len(res) == 1
    
    # Test with active status
    res = patients_db.get_receptionist_queue(status_filter="active")
    assert len(res) == 1
    
    # Test with dates
    res = patients_db.get_receptionist_queue(start_date="2026-06-01", end_date="2026-06-30", status_filter="")
    assert len(res) == 1

def test_get_doctors_name(mocker):
    mock_users = mocker.patch.object(patients_db, 'users')
    mock_users.find.return_value = [{"username": "doc1", "display_name": "Dr. One", "department": "Cardio"}]
    res = patients_db.get_doctors_name()
    assert len(res) == 1
    assert "doc1" in res

def test_book_appointment_confirmed(mocker):
    mock_visits = mocker.patch.object(patients_db, 'visits')
    mock_patients = mocker.patch.object(patients_db, 'patients')
    mock_patients.update_one.return_value.matched_count = 1
    
    res = book_appointment("123", "doc1", "Dr. One", "10:00", status="confirmed")
    assert res is True
    mock_visits.insert_one.assert_called_once()
