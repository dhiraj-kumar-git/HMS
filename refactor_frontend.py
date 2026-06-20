import os
import shutil
import re

# Define the source directory
src_dir = os.path.join("frontend", "src")

# Define the file mappings
file_mapping = {
    # Components
    "Sidebar.js": "components/Sidebar.js",
    "Header.js": "components/Header.js",
    "PrescriptionModal.js": "components/PrescriptionModal.js",
    "StatusGuideModal.js": "components/StatusGuideModal.js",
    
    # Auth
    "Login.js": "pages/auth/Login.js",
    "CreateUser.js": "pages/auth/CreateUser.js",
    
    # Dashboards
    "AdminDashboard.js": "pages/dashboards/AdminDashboard.js",
    "DoctorsDashboard.js": "pages/dashboards/DoctorsDashboard.js",
    "ReceptionistDashboard.js": "pages/dashboards/ReceptionistDashboard.js",
    "MedicalCounterDashboard.js": "pages/dashboards/MedicalCounterDashboard.js",
    "Dashboard.js": "pages/dashboards/Dashboard.js",
    
    # Patients
    "PatientRegistration.js": "pages/patients/PatientRegistration.js",
    "PatientHistory.js": "pages/patients/PatientHistory.js",
    "AllPatients.js": "pages/patients/AllPatients.js",
    "PatientBooking.js": "pages/patients/PatientBooking.js",
    "PatientsList.js": "pages/patients/PatientsList.js",
    "BulkRegistration.js": "pages/patients/BulkRegistration.js",
    "Receptionlater.js": "pages/patients/Receptionlater.js",
    "PatientPortal.js": "pages/patients/PatientPortal.js",
    
    # Staff
    "StaffRegistration.js": "pages/staff/StaffRegistration.js",
    "DoctorSchedulePage.js": "pages/staff/DoctorSchedulePage.js",
    "ManageSchedule.js": "pages/staff/ManageSchedule.js",
    "UsersList.js": "pages/staff/UsersList.js",
    
    # Lab
    "LabTest.js": "pages/lab/LabTest.js",
    "UploadLabReports.js": "pages/lab/UploadLabReports.js",
    "PatientLabReports.js": "pages/lab/PatientLabReports.js",
    
    # Inventory
    "InventoryList.js": "pages/inventory/InventoryList.js",
    "AddMedicine.js": "pages/inventory/AddMedicine.js",
    "BillHistory.js": "pages/inventory/BillHistory.js",
    
    # Utils
    "utils.js": "utils/utils.js",
    "Config.js": "utils/Config.js",
    
    # Root (leave in src)
    "App.js": "App.js",
    "index.js": "index.js",
    "App.test.js": "App.test.js",
    "reportWebVitals.js": "reportWebVitals.js",
    "setupTests.js": "setupTests.js",
}

# Add css files to the mapping (they stay in src, but we need to track them for imports)
css_mapping = {
    "App.css": "App.css",
    "index.css": "index.css"
}

all_files = {**file_mapping, **css_mapping}

# Create directories
directories = set(os.path.dirname(v) for v in file_mapping.values() if os.path.dirname(v))
for d in directories:
    os.makedirs(os.path.join(src_dir, d), exist_ok=True)

# Function to get relative path from one file to another
def get_relative_import_path(from_file, to_file):
    from_dir = os.path.dirname(from_file)
    # If the file is in the same directory, return ./to_file
    rel_path = os.path.relpath(to_file, from_dir)
    # Convert windows path separators to posix
    rel_path = rel_path.replace(os.sep, '/')
    if not rel_path.startswith('.'):
        rel_path = './' + rel_path
    
    # Remove .js extension for imports
    if rel_path.endswith('.js'):
        rel_path = rel_path[:-3]
    return rel_path

# First, read all file contents and update imports before moving
updated_contents = {}

for old_name, new_name in file_mapping.items():
    old_path = os.path.join(src_dir, old_name)
    if not os.path.exists(old_path):
        continue
        
    with open(old_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # We need to find all imports:
    # import Component from './Component'
    # import './App.css'
    # import { ... } from './utils'
    # We will use regex to find all import/export statements that start with '.'
    
    # A function to replace matched imports
    def replace_import(match):
        full_match = match.group(0)
        import_path = match.group(1) # This is like './Sidebar' or '../utils'
        
        # Resolve what file this points to in the old structure
        # In the old structure, everything was flat in src.
        # So import_path was always './Something' or './Something.css'
        
        if import_path.startswith('.'):
            # Extract filename
            target_filename = os.path.basename(import_path)
            
            # Re-add extensions if missing to look it up in mapping
            if target_filename + '.js' in all_files:
                target_key = target_filename + '.js'
            elif target_filename in all_files:
                target_key = target_filename
            elif target_filename + '.css' in all_files:
                target_key = target_filename + '.css'
            else:
                return full_match # Unchanged if not found in our mapped files
            
            new_target_path = all_files[target_key]
            
            # Now calculate the new relative path
            new_rel_path = get_relative_import_path(new_name, new_target_path)
            
            # Replace the old path with the new path
            return full_match.replace(import_path, new_rel_path)
            
        return full_match

    # Regex to match import paths like: from './Sidebar' or import './App.css'
    # Matches: string starting with " or ' inside import/export statements
    # We'll use a simpler regex that matches any string starting with '.' that is part of an import/export or require
    
    new_content = re.sub(r'(?:from\s+|import\s+|require\()[\'"](\.[^\'"]+)[\'"]', replace_import, content)
    updated_contents[old_name] = new_content

# Now move files and write new contents
for old_name, new_name in file_mapping.items():
    old_path = os.path.join(src_dir, old_name)
    new_path = os.path.join(src_dir, new_name)
    
    if not os.path.exists(old_path):
        print(f"File not found: {old_path}")
        continue
        
    # If the path changed, move it
    if old_path != new_path:
        os.rename(old_path, new_path)
        print(f"Moved {old_name} -> {new_name}")
        
    # Write updated contents
    if old_name in updated_contents:
        with open(new_path, 'w', encoding='utf-8') as f:
            f.write(updated_contents[old_name])

print("Frontend refactoring script completed.")
