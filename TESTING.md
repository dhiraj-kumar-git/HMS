# HMS Testing Guide

This document outlines the testing strategies and procedures for the Hospital Management System (HMS) to ensure reliability and prevent regression failures.

## 1. Test-Driven Development (TDD) Approach

All new code changes in this application follow a Test-Driven Development (TDD) approach:
1. **Write Tests First**: Before implementing a new feature or fixing a bug, write a failing unit or integration test that defines the expected behavior.
2. **Make it Pass**: Write the minimum amount of code necessary to make the test pass.
3. **Refactor**: Clean up the code while ensuring the tests continue to pass.

## 2. Backend Testing (Python/Flask)

### 2.1 Unit and Integration Tests
The backend utilizes `pytest` for unit and integration testing. Tests are located in the `backend/tests/` directory and mirror the structure of the application.

- **`backend/tests/database/`**: Tests for MongoDB CRUD operations and schema validation (e.g., `test_patients_db.py`).
- **`backend/tests/routes/`**: Tests for API endpoints and request/response formatting (e.g., `test_patient_routes.py`).

### 2.2 Running Backend Tests
To run the backend tests locally, ensure your virtual environment is active and run:
```bash
cd backend
python -m pytest tests/ -v
```

### 2.3 API Testing with Swagger
For manual endpoint testing, the backend provides an interactive Swagger UI sandbox. 
See the [API Testing Guide (API_TESTING_GUIDE.md)](./API_TESTING_GUIDE.md) for detailed instructions on using the Swagger interface to test payloads and responses.

## 3. Frontend Testing (React)

The frontend utilizes standard React testing utilities. Components should be tested for rendering, state management, and user interactions.

*(Note: Add frontend specific testing commands and methodologies here as the suite expands)*

## 4. Manual Verification & QA

Before deploying to production, all critical user flows should undergo manual QA:

1. **Patient Journey**: 
   - Registration -> Booking Appointment -> Checked-In Status.
2. **Doctor Journey**: 
   - Viewing Queue -> Starting Consultation -> Saving Drafts -> Completing EMR (Subjective, Objective, Assessment, Plan) -> Viewing Patient History.
3. **Lab Journey**: 
   - Viewing Lab Requests -> Uploading Reports.
4. **Pharmacy Journey**: 
   - Viewing Medicine Requests -> Processing Bills -> Updating Inventory.

## 5. Continuous Integration (CI)
*(To be implemented: Details about CI pipelines, GitHub Actions, and automated test enforcement before merging PRs)*
