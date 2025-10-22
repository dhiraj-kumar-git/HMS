from dataclasses import dataclass, asdict, field
from typing import Optional
from datetime import datetime

@dataclass
class Patient:
    psr_no: str  # Unique ID for each patient
    name: str
    age: int
    gender: str
    contact_no: str
    address: str
    patient_type: str
    registration_time: datetime
    doctor_assigned: Optional[str] = None
    prescriptions: list = field(default_factory=list)  # (Legacy field, if needed)
    lab_tests: list = field(default_factory=list)
    remarks: list = field(default_factory=list)  # For storing remarks (multiple)
    prescription_details: list = field(default_factory=list)  # New field for storing prescription details
    bill_status: Optional[str] = "Pending"
    workflow_status: str = "active"

    def to_dict(self) -> dict:
        patient_dict = asdict(self)
        patient_dict["registration_time"] = self.registration_time.isoformat()
        return patient_dict

@dataclass
class User:
    username: str
    password: str  # Hashed password storage
    role: str  # receptionist, doctor, medical_store, lab_staff, admin
    display_name: str  # Added field for Display Name

    def to_dict(self) -> dict:
        user_dict = asdict(self)
        # Ensure display_name has a fallback to username if not provided
        if not user_dict.get("display_name"):
            user_dict["display_name"] = self.username
        return user_dict


@dataclass
class Session:
    username: str
    session_id: str
    login_time: datetime
    logout_time: Optional[datetime] = None
    active: bool = True

    def to_dict(self) -> dict:
        session_dict = asdict(self)
        session_dict["login_time"] = self.login_time.isoformat()
        if self.logout_time:
            session_dict["logout_time"] = self.logout_time.isoformat()
        return session_dict

@dataclass
class Medicine:
    medicine_id: str                        # Unique identifier (generated automatically)
    item_name: Optional[str] = None
    unit: Optional[str] = None
    unit_detail: Optional[str] = None
    item_no: Optional[str] = None
    sale_rate: Optional[float] = None
    hsn: Optional[str] = None
    gst_rate: Optional[float] = None
    cess: Optional[float] = None
    gst_category: Optional[str] = None
    nil_rated: Optional[bool] = False
    non_gst_item: Optional[bool] = False
    for_web: Optional[bool] = False
    manufacturer: Optional[str] = None
    location: Optional[str] = None
    schedule: Optional[str] = None
    main_image1: Optional[str] = None
    main_image2: Optional[str] = None
    detail: Optional[str] = None
    ean_bar_code: Optional[str] = None
    no_med_rem: Optional[bool] = False
    linked_item_store: Optional[str] = None
    qty: Optional[int] = None
    medicine_type: Optional[str] = None      # e.g. Narcotics, Psychotropics
    manufacture_date: Optional[datetime] = None  # Date when the medicine was manufactured
    expiry_date: Optional[datetime] = None       # Expiry date of the medicine
    batch_number: Optional[str] = None           # Batch or lot number for tracking
    storage_conditions: Optional[str] = None     # Storage conditions (e.g., room temperature, refrigerated)
    date_added: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        med_dict = asdict(self)
        med_dict["date_added"] = self.date_added.isoformat()
        if self.manufacture_date is not None:
            med_dict["manufacture_date"] = self.manufacture_date.isoformat()
        if self.expiry_date is not None:
            med_dict["expiry_date"] = self.expiry_date.isoformat()
        return med_dict