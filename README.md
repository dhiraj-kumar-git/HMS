# Hospital Management System (HMS)

Welcome to the Hospital Management System (HMS), a comprehensive platform designed to dramatically streamline clinical operations.

This architecture centralizes patient registration, unifies doctor queue workflows, synchronizes robust visit auditing (prescriptions, labs, remarks), and maintains a real-time medical store inventory pipeline.

---

## Documentation Directory
- **[Functional Guide (GUIDE.md)](./GUIDE.md)**: A complete walkthrough of user roles, dashboards, and system functionalities.
- **[Technical Documentation (TECHNICAL_DOC.md)](./TECHNICAL_DOC.md)**: Details on the system architecture, backend routes, directory structure, and onboarding guidelines.
- **[API Testing Guide (API_TESTING_GUIDE.md)](./API_TESTING_GUIDE.md)**: Instructions for using the built-in Swagger UI sandbox to test HMS APIs.

---

## Technology Stack

- **Frontend**: React.js, Chakra UI, Tailwind CSS, Framer Motion
- **Backend**: Python, Flask, PyMongo, JWT Auth, Bcrypt
- **Database**: MongoDB (Atlas)
- **Deployment**: Docker, Nginx, Gunicorn

---

## Local Setup & Development

If you intend to develop dynamically and see live-reloaded changes instantly on your machine, perform a manual split-terminal setup:

### Prerequisites
- Node.js (v18+)
- Python (v3.9+)
- Active MongoDB remote Cluster URI

### 1. Backend Configuration
**Navigate to the backend directory and set up a robust python virtual environment:**
```bash
cd backend
python -m venv venv

# If utilizing Windows:
venv\Scripts\activate
# If utilizing Mac/Linux:
source venv/bin/activate
```
**Install requirements:**
```bash
pip install -r requirements.txt
```
**Construct your local environment file:**
Create a `.env` file logically seated in the `/backend` folder. Mount your database keys into it:
```env
MONGO_URI="mongodb+srv://<USER>:<PASS>@<cluster>.mongodb.net/hospital_db"
JWT_SECRET_KEY="super_secret_development_key"
```
**Boot the API:**
```bash
python main.py
```
*The Flask API is now aggressively polling `http://localhost:5000`.*

### 2. Frontend Configuration
**Boot up a separate secondary terminal tab:**
```bash
cd frontend
npm install
npm run start
```
*React will seamlessly proxy `http://localhost:3000` onto your browser window.*

---

## Docker Deployment (Production / Standardized Setup)

The application utilizes an **Nginx Reverse Proxy** architecture. This means you do **not** need to configure any frontend environment variables for the API to connect. It is zero-config and works out-of-the-box anywhere.

**Notice:** Ensure you have your `.env` file explicitly in `/backend` using the steps above.

**Build and Run the Orchestrator:**
Execute this command at the root folder of the workspace on your server or local machine:
```bash
docker compose up -d --build --force-recreate
```
This efficiently mounts the python logic onto `gunicorn`, compiles the React bundles via `node` multi-staging, and physically deploys those assets live via `Nginx` onto port `3000`. All frontend API traffic is automatically proxy-routed internally over Docker's network.

**Monitoring system logic:**
Because the stack launches detached in the background, you can review live server hit logs (both Python and Nginx) instantly by typing:
```bash
docker compose logs -f
```
*(Press `CTRL+C` to detach your terminal from the log stream safely).*

**Stopping the system:**
When you no longer need the application broadcasting, smoothly terminate and spin down all containers by running:
```bash
docker compose down
```

---

## Linting & Code Quality

Linting tools are configured for both the frontend and backend to check for syntax errors, unused variables, styling issues, and potential bugs.

### 1. Frontend Linting (ESLint)
To run ESLint on the frontend codebase:
```bash
cd frontend
# Run checks and view warnings/errors
npm run lint

# Automatically resolve fixable style violations and unused imports
npm run lint:fix
```

### 2. Backend Linting (Ruff)
Ruff is set up to analyze Python files. Config rules (like ignoring line-length checks) are managed in `backend/pyproject.toml`.
To run checks on the backend:
```bash
cd backend
# Activate virtual environment
venv\Scripts\activate  # or source venv/bin/activate on Mac/Linux

# Run checks and view issues
ruff check .

# Automatically fix fixable issues
ruff check . --fix
```

---

## System Architecture
```
HMS/
├── backend/                  # Flask REST API Logic
│   ├── database.py           # Core MongoDB CRUD routing 
│   ├── main.py               # Core application entrypoint / API
│   ├── Dockerfile            # Lightweight Python orchestrator map 
├── frontend/                 # React UI Client
│   ├── src/                  # React routing, components, & dashboard views
│   ├── Dockerfile            # Multi-layer Node Builder -> Nginx Server map
│   ├── nginx.conf            # Advanced redirect config for React Router
├── docker-compose.yml        # Orchestration topology mapping
└── README.md
```
