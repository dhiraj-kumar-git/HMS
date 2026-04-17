# Hospital Management System (HMS)

Welcome to the Hospital Management System (HMS), a comprehensive platform designed to dramatically streamline clinical operations.

This architecture centralizes patient registration, unifies doctor queue workflows, synchronizes robust visit auditing (prescriptions, labs, remarks), and maintains a real-time medical store inventory pipeline.

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

If you strictly want to run the application identical to a server schema without actively modifying the underlying code framework, utilize Docker Compose.

**Notice:** Ensure you have legally generated the `.env` file explicitly in `/backend` using the steps above.

**Build and Run the Orchestrator:**
Execute this command at the root folder of the workspace.
```bash
docker compose up -d --build
```
This efficiently mounts the python logic onto `gunicorn`, compiles the React bundles via `node` multi-staging, and physically deploys those assets live via `Nginx` onto `http://localhost:3000`.

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
