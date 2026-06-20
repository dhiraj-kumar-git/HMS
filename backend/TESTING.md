# Backend Testing Guide

This document outlines how to run and manage unit tests for the HMS backend. The testing framework uses [pytest](https://docs.pytest.org/) along with [pytest-mock](https://pypi.org/project/pytest-mock/) to isolate database, AWS, and Redis dependencies.

## Basic Test Commands

Open a terminal, navigate to the `backend/` directory, and ensure your Python virtual environment (e.g., conda base) is activated.

1. **Run all tests**
   ```bash
   python -m pytest
   ```

2. **Run a specific test file**
   ```bash
   python -m pytest tests/routes/test_public_routes.py
   ```

3. **Run a specific test function**
   ```bash
   python -m pytest tests/routes/test_public_routes.py::test_public_get_doctors
   ```

4. **Run tests with print statements (Debugging)**
   Use the `-s` flag to prevent pytest from capturing standard output.
   ```bash
   python -m pytest -s
   ```

## Checking Code Coverage

We use `pytest-cov` to measure how much of the application code is covered by tests.

1. **Terminal Coverage Report**
   Running the default `pytest` command automatically generates a summary table in your terminal because it is configured in `pytest.ini`.

2. **Detailed HTML Report**
   To see a line-by-line breakdown of what code is untested:
   ```bash
   python -m pytest --cov-report=html
   ```
   This generates an `htmlcov/` folder. Open `htmlcov/index.html` in your web browser to visually inspect your code coverage.



## Adding New Tests

When adding tests for new routes or database functions:
1. Create a new test file in `tests/routes/` or `tests/database/` with the prefix `test_` (e.g., `test_auth.py`).
2. Include the `client` and `mock_db` fixtures as arguments in your test function.
3. Update the `mock_db` fixture in `tests/conftest.py` if your new test requires mocking a new core dependency (e.g., a new database collection or external API).
