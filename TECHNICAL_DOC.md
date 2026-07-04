# Hospital Management System (HMS) - Technical Documentation

Welcome to the technical documentation for the HMS platform. This document is intended for software engineers, interns, and developers looking to understand the system architecture, technology stack, and onboarding guidelines.

## 1. Technology Stack

### Frontend
- **React.js**: Single Page Application UI framework.
- **Chakra UI**: Component library for rapid, accessible UI development.
- **Tailwind CSS & Framer Motion**: Additional styling and micro-animations.
- **React Router**: Client-side routing.
- **Axios**: HTTP client for API communication.

### Backend
- **Python / Flask**: Core API logic and HTTP routing.
- **PyMongo**: MongoDB driver for database CRUD operations.
- **Flask-JWT-Extended**: Robust JWT-based authentication and authorization.
- **Bcrypt**: Password hashing and security.
- **Pandas / Openpyxl**: Data manipulation and Excel handling (bulk uploads).
- **Redis**: Token blocklisting (Revoked JWTs).
- **Boto3**: AWS integration.

### Database & Deployment
- **MongoDB**: NoSQL database (Atlas / Remote Cluster).
- **Docker & Docker Compose**: Containerization for consistent environments.
- **Nginx**: Reverse proxy to route frontend and backend traffic.
- **Gunicorn**: WSGI HTTP Server for Python web applications.

## 2. System Architecture

The application employs a decoupled client-server architecture.

### Directory Structure
```text
HMS/
├── backend/                   # Python Flask API
│   ├── app/                   # Application Modules
│   │   ├── database/          # Domain-specific DB logic (auth, inventory, lab, patients, staff)
│   │   ├── routes/            # Blueprint API endpoints
│   ├── tests/                 # Pytest test suites
│   ├── data/                  # Static excel templates and config files
│   ├── scripts/               # Helper python scripts
│   ├── main.py                # Flask entry point and configuration
│   └── requirements.txt       # Python dependencies
├── frontend/                  # React Application
│   ├── public/                # Static HTML/Assets
│   ├── src/
│   │   ├── components/        # Reusable UI components (Modals, Sidebar)
│   │   ├── pages/             # Page components separated by domain (auth, dashboards, inventory, lab, patients, staff)
│   │   ├── utils/             # Helper utilities and config
│   │   └── App.js             # Main routing configuration
│   └── package.json           # Node dependencies
└── docker-compose.yml         # Container orchestration
```

## 3. Backend API Routes

The backend uses Flask Blueprints to separate domain concerns.
- **Auth (`/api/auth`)**: Login, token management, logout.
- **Staff (`/api/staff`)**: Staff registration, directory, and scheduling management.
- **Patients (`/api/patients`)**: Patient registration, appointment bookings, history, and medical records.
- **Inventory (`/api/inventory`)**: Pharmacy inventory, adding medicines, and billing.
- **Lab (`/api/lab`)**: Lab tests, request tracking, and uploading reports.
- **Public (`/api/public`)**: Unauthenticated public portal functionalities.

Swagger documentation is automatically hosted at `/api/docs` via `flask-swagger-ui`. (Refer to `API_TESTING_GUIDE.md` for API testing workflows).

## 4. Development Workflow

### Rule 1: Test-Driven Development (TDD)
- **Unit Testing**: All new endpoints must have accompanying tests in `backend/tests/`. Ensure high code coverage using `pytest`.
- **Frontend Testing**: React components and utilities must be tested (e.g., using Jest/React Testing Library, seen in `.test.js` files).

### Rule 2: Documentation
- Any new features must be reflected in `GUIDE.md` (Functional changes) and this `TECHNICAL_DOC.md` (Architecture changes).
- Maintain API accuracy in Swagger documentation files.

### Rule 3: Tracker
- Log all completed changes in `NEW_CHANGES.md` before pushing to version control.

## 5. Security & Authentication
- **JWT**: JSON Web Tokens are passed in the `Authorization: Bearer <token>` header.
- **Blocklisting**: Redis is used to track logged-out or revoked tokens to prevent replay attacks (`check_if_token_is_revoked` in `main.py`).
- **CORS**: Configured in `main.py` to allow cross-origin requests securely.
