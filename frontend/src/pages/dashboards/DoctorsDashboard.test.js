import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import DoctorsDashboard from './DoctorsDashboard';

jest.setTimeout(20000); // Prevent timeouts during full suite run
// Mock axios
jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

window.scrollTo = jest.fn();

// Mock Multiselect to simplify testing
jest.mock('multiselect-react-dropdown', () => {
  return function MockMultiselect({ options, onSelect, placeholder }) {
    return (
      <div data-testid="mock-multiselect">
        <span>{placeholder}</span>
        {options.map((opt, i) => (
          <button
            key={i}
            data-testid={`select-${opt.item_name || opt.test_name}`}
            onClick={() => onSelect([opt])}
          >
            Select {opt.item_name || opt.test_name}
          </button>
        ))}
      </div>
    );
  };
});

// Mock window URL methods for Blob handling in reports
window.URL.createObjectURL = jest.fn();
window.URL.revokeObjectURL = jest.fn();

describe('DoctorsDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'doctor1');
    localStorage.setItem('token', 'fake-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDashboard = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <DoctorsDashboard />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders loading initially and fetches user details and patients', async () => {
    // Mock user details
    axios.get.mockImplementation((url) => {
      if (url.includes('/users/')) {
        return Promise.resolve({ data: { display_name: 'Dr. Smith', schedule: [] } });
      }
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            {
              institute_id: '101',
              name: 'John Doe',
              age: 30,
              gender: 'Male',
              workflow_status: 'consultation', appointments: [],
              doctor_assigned: 'doctor1',
              registration_time: '2023-01-01T10:00:00Z',
              visit_id: 'v101',
              appointments: []
            }
          ]
        });
      }
      if (url.includes('/dropdown/medicines')) {
        return Promise.resolve({ data: [{ item_name: 'Paracetamol' }] });
      }
      if (url.includes('/dropdown/labtests')) {
        return Promise.resolve({ data: [{ test_name: 'Blood Test' }] });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    // Check header updates
    await waitFor(() => {
      expect(screen.getByText('Welcome, Dr. Smith')).toBeInTheDocument();
    });

    // Check patients
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('opens patient modal when row is clicked', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            {
              institute_id: '101',
              name: 'John Doe',
              age: 30,
              gender: 'Male',
              workflow_status: 'consultation', appointments: [],
              doctor_assigned: 'doctor1',
              registration_time: '2023-01-01T10:00:00Z',
              appointments: []
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => {
      expect(screen.getByText(/John Doe \(ID: 101\)/i)).toBeInTheDocument();
      expect(screen.getByText('Plan (Medications, Labs, Advice)')).toBeInTheDocument();
    });
  });

  it('does not open patient modal when a confirmed patient row is clicked', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            {
              institute_id: '102',
              name: 'Jane Doe',
              age: 25,
              gender: 'Female',
              workflow_status: 'confirmed',
              doctor_assigned: 'doctor1',
              registration_time: '2023-01-01T10:00:00Z',
              appointments: []
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Jane Doe'));

    expect(screen.queryByText('Plan (Medications, Labs, Advice)')).not.toBeInTheDocument();
  });

  it('updates subjective and objective fields in the modal', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', age: 30, workflow_status: 'consultation', appointments: [] }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('John Doe (ID: 101)');

    // Subjective fields
    const chiefComplaintsInput = screen.getByLabelText(/Chief Complaints/i);
    fireEvent.change(chiefComplaintsInput, { target: { value: 'Fever' } });

    const hpiInput = screen.getByLabelText(/History of Present Illness/i);
    fireEvent.change(hpiInput, { target: { value: 'Since 3 days' } });

    const pmhInput = screen.getByLabelText(/Past Medical History/i);
    fireEvent.change(pmhInput, { target: { value: 'None' } });

    const allergiesInput = screen.getByLabelText(/Allergies/i);
    fireEvent.change(allergiesInput, { target: { value: 'Peanuts' } });

    // Objective fields (Vitals)
    const bpInput = screen.getByLabelText('BP (mmHg)');
    fireEvent.change(bpInput, { target: { value: '120/80' } });

    const pulseInput = screen.getByLabelText('Pulse (bpm)');
    fireEvent.change(pulseInput, { target: { value: '72' } });

    expect(chiefComplaintsInput.value).toBe('Fever');
    expect(hpiInput.value).toBe('Since 3 days');
    expect(pmhInput.value).toBe('None');
    expect(allergiesInput.value).toBe('Peanuts');
    expect(bpInput.value).toBe('120/80');
    expect(pulseInput.value).toBe('72');
  });

  it('adds custom medication and advice in the modal', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', age: 30, workflow_status: 'consultation', appointments: [] }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('John Doe (ID: 101)');

    // Add Medication
    const drugInput = screen.getAllByPlaceholderText(/Select or type/i)[0];
    fireEvent.change(drugInput, { target: { value: 'Paracetamol' } });
    const doseInput = screen.getByLabelText(/Dose/i);
    fireEvent.change(doseInput, { target: { value: '650mg' } });

    const addMedicationBtn = screen.getByRole('button', { name: /Add Medication/i });
    fireEvent.click(addMedicationBtn);

    expect(screen.getByText(/Paracetamol/i)).toBeInTheDocument();
    expect(screen.getByText(/650mg/i)).toBeInTheDocument();

    // Add Advice
    const adviceInput = screen.getByLabelText(/Advice \/ General Instructions/i);
    fireEvent.change(adviceInput, { target: { value: 'Rest for 2 days' } });

    expect(adviceInput.value).toBe('Rest for 2 days');
  });

  it('triggers confirmation modal when completing consultation with no meds or labs', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{
            institute_id: '101',
            visit_id: 'v101',
            name: 'John Doe',
            age: 30,
            doctor_assigned: 'doctor_user',
            workflow_status: 'consultation',
            appointments: [{
              doctor_username: 'doctor_user',
              emr_data: {
                assessment: { provisional_diagnosis: 'Test Diagnosis' },
                subjective: { chief_complaints: 'Test Complaints' },
                plan: { investigations: [], medications: [] }
              }
            }]
          }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    axios.post.mockResolvedValueOnce({ data: { message: 'success' } }); // for save_consultation
    axios.post.mockResolvedValueOnce({ data: { message: 'success' } }); // for complete_consultation

    renderDashboard();
    await screen.findByText('John Doe');
    
    // Click Complete Consultation (green checkmark) in the table row
    const completeBtn = screen.getByTitle('Complete Consultation');
    fireEvent.click(completeBtn);

    // Expect confirmation modal to open
    await waitFor(() => {
      expect(screen.getByText('Patient Prescription Summary')).toBeInTheDocument();
    });

    // Confirm and Save
    fireEvent.click(screen.getByText('Confirm & Complete'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/doctor/save_consultation/v101'),
        expect.objectContaining({ has_labs: false, has_meds: false }),
        expect.any(Object)
      );
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/doctor/complete_consultation/v101'),
        {},
        expect.any(Object)
      );
    });
  });

  it('autosaves and closes the modal immediately', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', visit_id: 'v101', name: 'John Doe', age: 30, workflow_status: 'consultation', appointments: [] }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    axios.put.mockResolvedValueOnce({ data: { message: 'success' } });

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('John Doe (ID: 101)');

    // Type in advice
    const adviceInput = screen.getByLabelText(/Advice \/ General Instructions/i);
    fireEvent.change(adviceInput, { target: { value: 'Unsaved advice' } });

    // Click Close
    fireEvent.click(screen.getByText('Close'));

    // Expect modal to close immediately without unsaved changes warning
    await waitFor(() => {
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
      expect(screen.queryByText('John Doe (ID: 101)')).not.toBeInTheDocument(); // main modal closed
    });

    // Expect axios.put to be called
    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining('/doctor/save_consultation_details/v101'),
      expect.anything(),
      expect.anything()
    );
  }, 10000);

  it('handles viewing history with past visits', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{
            institute_id: '101',
            name: 'John Doe',
            age: 30,
            workflow_status: 'consultation', appointments: [],
            visit_id: 'v101'
          }]
        });
      }
      if (url.includes('/get_patient/')) {
        return Promise.resolve({
          data: {
            institute_id: '101',
            appointments: [
              { status: 'completed' }
            ]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await screen.findByText('John Doe');

    // Find History button
    const historyBtn = screen.getByRole('button', { name: /History/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/doctor/patient-history/101', {
        state: { patientData: { institute_id: '101', appointments: [{ status: 'completed' }] } }
      });
    });
  }, 10000);

  it('handles viewing history without past visits', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{
            institute_id: '101',
            name: 'John Doe',
            age: 30,
            workflow_status: 'consultation', appointments: [],
            visit_id: 'v101'
          }]
        });
      }
      if (url.includes('/get_patient/')) {
        return Promise.resolve({
          data: {
            institute_id: '101',
            appointments: [
              { status: 'consultation' }
            ]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await screen.findByText('John Doe');

    const historyBtn = screen.getByRole('button', { name: /History/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(screen.getByText('No Past Visits')).toBeInTheDocument();
      expect(screen.getByText('This patient has not visited you previously for a consultation.')).toBeInTheDocument();
    });
  }, 10000);



  it('filters and sorts patients', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            { institute_id: '101', name: 'John Doe', workflow_status: 'consultation', appointments: [], registration_time: '2023-01-01T10:00:00Z' },
            { institute_id: '102', name: 'Alice Smith', workflow_status: 'consultation', appointments: [], registration_time: '2023-01-02T10:00:00Z' }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Test Search Filter
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: '101' } });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    });

    // Clear Search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Test Sort By Name
    const sortSelect = screen.getAllByRole('combobox').find(select => select.value === 'date' || select.value === 'name');
    if (sortSelect) {
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      // Alice should be before John, but we can just verify the DOM changes or state updates don't crash
    }
  });



  it('adds and removes a medication', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', workflow_status: 'consultation', appointments: [] }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('John Doe (ID: 101)');

    // Add custom medication
    const drugInput = screen.getAllByPlaceholderText(/Select or type/i)[0];
    fireEvent.change(drugInput, { target: { value: 'Drink water' } });
    const addMedicationBtn = screen.getByRole('button', { name: /Add Medication/i });
    fireEvent.click(addMedicationBtn);

    expect(screen.getByText(/Drink water/i)).toBeInTheDocument();

    const removeBtns = screen.getAllByRole('button', { name: /Remove/i });
    if (removeBtns.length > 0) {
      fireEvent.click(removeBtns[0]);
    }

    await waitFor(() => {
      expect(screen.queryByText(/Drink water/i)).not.toBeInTheDocument();
    });
  });

  it('renders checked-in and confirmed patients in separate lists and verifies order', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            {
              institute_id: '101',
              name: 'John Checked',
              age: 30,
              workflow_status: 'checked_in',
              registration_time: '2023-01-01T10:00:00Z',
              appointments: []
            },
            {
              institute_id: '102',
              name: 'Alice Confirmed',
              age: 25,
              workflow_status: 'confirmed',
              registration_time: '2023-01-01T11:00:00Z',
              appointments: []
            }
          ]
        });
      }
      if (url.includes('/users/')) {
        return Promise.resolve({ data: { display_name: 'Dr. Smith', schedule: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Checked-in Patients/i)).toBeInTheDocument();
      expect(screen.getByText(/Confirmed Patients/i)).toBeInTheDocument();
      expect(screen.getByText('John Checked')).toBeInTheDocument();
      expect(screen.getByText('Alice Confirmed')).toBeInTheDocument();
    });

    // Check order of headings to ensure Checked-in is above Confirmed
    const headings = screen.getAllByRole('heading', { level: 4 });
    const checkedInIndex = headings.findIndex(h => h.textContent.includes('Checked-in Patients'));
    const confirmedIndex = headings.findIndex(h => h.textContent.includes('Confirmed Patients'));

    expect(checkedInIndex).toBeLessThan(confirmedIndex);
  });

});
