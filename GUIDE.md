# Hospital Management System (HMS) - Complete User Guide (Functional Documentation)

Welcome to the HMS User Guide! This document serves as a comprehensive resource for understanding all the functionalities, pages, and dashboards available in the application. It acts as the primary functional documentation for end-users and administrators.

## 1. System Overview
The Hospital Management System (HMS) is a centralized platform designed to streamline clinical operations. It handles patient registration, appointment scheduling, doctor consultations, laboratory test management, and pharmacy inventory control. The system utilizes role-based access to ensure data security and operational efficiency.

## 2. User Roles & Access Levels
The system supports the following user roles, each with specific access to modules and dashboards:
- **Admin**: Has overarching control over the system configuration and oversight.
- **Receptionist**: Manages patient registration, directory, queue, and appointment scheduling.
- **Doctor**: Consults patients, views medical history, and writes prescriptions or lab requests.
- **Lab Staff**: Processes lab test requests and uploads patient test reports.
- **Medical Store (Pharmacy)**: Manages medicine inventory and billing.
- **Patient**: Accesses the public portal to register and book appointments.

## 3. Dashboards & Functionalities

### 3.1 Public Patient Portal (`/portal`)
The public-facing portal allows patients and staff to interact with the system without a prior login.
- **Patient Registration**: New patients can self-register into the system.
- **Staff Registration**: New staff members can submit registration requests.
- **Book Appointment**: Patients can book appointments with specific doctors directly from the portal.

### 3.2 Receptionist Dashboard (`/receptionist`)
The primary interface for front-desk operations.
- **Patient Registration**: Register new patients on arrival.
- **Student & Staff Registration**: Specialized registration flows for university students and staff.
- **Patient Directory (`/receptionist/patient-directory`)**: A complete listing of all registered patients with search and filtering capabilities.
- **Appointment History (`/receptionist/history`)**: View historical data for patient appointments and visits.
- **Patient History (`/receptionist/patient-history/:id`)**: View the specific appointment and medical history for individual patients.

### 3.3 Doctor Dashboard (`/doctor`)
The workspace for medical professionals.
- **Consultation Queue**: View the list of assigned patients waiting for consultation.
- **All Patients (`/doctor/all-patients`)**: Access the complete directory of patients.
- **Patient History (`/doctor/patient-history/:id`)**: Review past diagnoses, prescriptions, and lab reports before or during a consultation.
- **Schedule Management (`/schedule`)**: Doctors can manage and view their appointment schedules.

### 3.4 Medical Store Dashboard (`/medical_counter`)
The pharmacy module for inventory and dispensing.
- **Inventory List (`/inventory`)**: View current stock levels of medicines, filter, and track availability.
- **Add Medicine (`/add-medicine`)**: Introduce new stock or new medicine types into the inventory.
- **Bill History (`/bill_history`)**: Track the history of dispensed medicines and billing records.

### 3.5 Lab Staff Dashboard (`/lab`)
The laboratory operations center.
- **Lab Tests Overview**: View pending and completed lab tests for patients.
- **All Reports (`/lab/all-reports`)**: View a comprehensive list of all patient lab reports.
- **Upload Reports (`/lab/upload`)**: Upload new test results and reports against specific patient requests.

### 3.6 Admin Dashboard (`/admin/*`)
The system administration control center.
- **User Management**: View, approve, or revoke access for staff members across all roles.
- **System Settings**: High-level configuration options and broad system monitoring.
