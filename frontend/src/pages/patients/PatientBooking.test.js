import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import PatientBooking from './PatientBooking';
import * as utils from '../../utils/utils';

jest.mock('axios');

const mockNavigate = jest.fn();
const mockLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation()
}));

describe('PatientBooking Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.mockReturnValue({ state: { autoFillInstituteId: '' } });
    jest.spyOn(utils, 'getWeekdayIST').mockReturnValue('Monday');
    jest.spyOn(utils, 'formatDateTimeIST').mockImplementation((date) => date);
  });

  const renderComponent = (initialState = { autoFillInstituteId: '' }) => {
    mockLocation.mockReturnValue({ state: initialState });

    return render(
      <ChakraProvider>
        <MemoryRouter>
          <PatientBooking />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders initial state and allows verification', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        institute_id: '12345',
        name: 'John Doe',
        appointments: []
      }
    });

    renderComponent();

    const input = screen.getByPlaceholderText(/e.g. 2025H1120147P/i);
    fireEvent.change(input, { target: { value: '12345' } });
    
    const verifyBtn = screen.getByRole('button', { name: /Verify Patient/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('handles autofill institute_id from location state', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        institute_id: '99999',
        name: 'Jane Doe',
        appointments: []
      }
    });

    renderComponent({ autoFillInstituteId: '99999' });

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('handles OTP verification flow', async () => {
    // 1. First Verify returns requires_otp
    axios.post.mockResolvedValueOnce({
      data: { requires_otp: true, email: 'j***@bits.edu' }
    });

    renderComponent();
    
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText(/We've sent a 4-digit OTP/i)).toBeInTheDocument();
    });

    // 2. Submit OTP
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', appointments: [] }
    });

    const otpInput = screen.getByPlaceholderText('----');
    fireEvent.change(otpInput, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify OTP/i }));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('handles doctor fetching and quick booking', async () => {
    // Verify
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', appointments: [] }
    });
    // Fetch doctors
    axios.get.mockResolvedValueOnce({
      data: [
        {
          username: 'doc1',
          display_name: 'Dr. Smith',
          department: 'General',
          schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
        }
      ]
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // Quick Book
    fireEvent.click(screen.getByRole('button', { name: /Book Now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Immediate Booking Confirmation/i)).toBeInTheDocument();
    });

    // Check active appointments
    axios.get.mockResolvedValueOnce({ data: { activeAppointments: [] } });
    // Book Appointment
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Book/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/portal');
    }, { timeout: 3000 });
  });

  it('handles receptionist skipOtp redirection to /receptionist', async () => {
    // 1) Setup mocks before rendering
    axios.get.mockResolvedValueOnce({
      data: [
        {
          username: 'doc1',
          display_name: 'Dr. Smith',
          department: 'General',
          schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
        }
      ]
    });

    // 2) Set state to skipOtp
    renderComponent({ skipOtp: true, verifiedPatientData: { institute_id: 'receptionist123', name: 'Rec Patient' } });

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // 3) Quick Book
    fireEvent.click(screen.getByRole('button', { name: /Book Now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Immediate Booking Confirmation/i)).toBeInTheDocument();
    });

    // 4) Check active appointments and Book Appointment
    axios.get.mockResolvedValueOnce({ data: { activeAppointments: [] } });
    axios.post.mockResolvedValueOnce({ data: { success: true } });

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Book/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/receptionist');
    }, { timeout: 3000 });
  });

  it('handles billing warning when bill_status is pending for quick book', async () => {
    // Verify patient with pending bills
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', bill_status: 'pending', appointments: [] }
    });
    // Fetch doctors
    axios.get.mockResolvedValueOnce({
      data: [
        {
          username: 'doc1',
          display_name: 'Dr. Smith',
          department: 'General',
          schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
        }
      ]
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // Click Book Now
    fireEvent.click(screen.getByRole('button', { name: /Book Now/i }));

    // Billing warning modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Pending Bill Notice/i)).toBeInTheDocument();
    });

    // Proceed from warning
    fireEvent.click(screen.getByRole('button', { name: /Proceed to Book/i }));

    // Should open Immediate Booking Confirmation
    await waitFor(() => {
      expect(screen.getByText(/Immediate Booking Confirmation/i)).toBeInTheDocument();
    });
  });

  it('handles future booking warning and active appointments check', async () => {
    // 1) Verify Patient
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', appointments: [] }
    });
    
    // Mock for actual booking submission
    axios.post.mockResolvedValueOnce({
      data: { message: 'Appointment booked successfully' }
    });
    // Mock all get requests robustly to handle multiple renders
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctors')) {
        return Promise.resolve({
          data: [
            {
              username: 'doc1',
              display_name: 'Dr. Smith',
              department: 'General',
              schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
            }
          ]
        });
      }
      if (url.includes('/doctor-availability/')) {
        return Promise.resolve({ data: { full_slots: ['09:10 AM'] } });
      }
      if (url.includes('/check-active-appointments/')) {
        return Promise.resolve({ data: { activeAppointments: [{ doctor_name: 'Dr. Jones', time: '2030-10-14T09:00:00Z', status: 'Booked' }] } });
      }
      return Promise.resolve({ data: [] });
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // Switch to Advanced Booking
    fireEvent.click(screen.getByRole('button', { name: /Schedule for a Later Date/i }));

    // Wait for the warning modal
    await waitFor(() => {
      expect(screen.getByText(/Do you want to proceed with advanced booking?/i)).toBeInTheDocument();
    });

    // Proceed from warning
    fireEvent.click(screen.getByRole('button', { name: /Proceed/i }));

    // Select the doctor
    const doctorSelect = screen.getByRole('combobox', { name: /Doctor/i });
    fireEvent.change(doctorSelect, { target: { value: 'doc1' } });

    // Fill date to enable confirm button
    const dateInput = screen.getByLabelText(/Appointment Date/i);
    fireEvent.change(dateInput, { target: { value: '2030-10-14' } }); // A Monday

    // Wait for availability fetch
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/doctor-availability/'));
    });

    // Pick a slot
    const slotSelect = screen.getByLabelText(/Time Slot/i);
    fireEvent.change(slotSelect, { target: { value: '09:00' } });

    // Click confirm booking
    const confirmBtn = screen.getByRole('button', { name: /Confirm Appointment/i });
    fireEvent.submit(confirmBtn.closest('form'));

    // Wait for the active appointments warning
    await waitFor(() => {
      expect(screen.getByText(/Active Appointments Detected/i)).toBeInTheDocument();
    });
    
    // Proceed from warning
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: /Yes, Proceed/i }));

    // Should successfully navigate after proceeding
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/portal');
    }, { timeout: 3000 });
  });


  it('handles future booking flow', async () => {
    // Verify
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', appointments: [] }
    });
    // Fetch doctors
    axios.get.mockResolvedValueOnce({
      data: [
        {
          username: 'doc1',
          display_name: 'Dr. Smith',
          department: 'General',
          schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
        }
      ]
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Schedule for a Later Date/i }));

    await waitFor(() => {
      expect(screen.getByText(/Advanced Booking/i)).toBeInTheDocument();
      // Future Booking warning modal comes up because we clicked "Schedule for a later date"
      // Wait, is it a modal? Let's check `PatientBooking.js`: 
      // handleFutureBookingClick calls setShowFutureBookingWarning(true) if bill pending else setShowFutureBookingWarning(true)
      // Ah! `handleFutureBookingClick` shows a warning modal first!
    });
    
    // Accept future warning
    fireEvent.click(screen.getByRole('button', { name: /Proceed/i, hidden: true }));

    await waitFor(() => {
      expect(screen.getByText(/Advanced Booking/i)).toBeInTheDocument();
    });
  });

  it('handles family member selection for dependant', async () => {
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', psrn_id: 'P-123', appointments: [] }
    });
    // Mock family members
    axios.get.mockResolvedValueOnce({
      data: [
        { institute_id: '12345', name: 'John Doe', relation: 'Self' },
        { institute_id: '12346', name: 'Jane Doe', relation: 'Spouse' }
      ]
    });
    // Mock doctors
    axios.get.mockResolvedValueOnce({ data: [] });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Select family member
    const familySelect = screen.getByRole('combobox', { name: /Who is this appointment for\?/i });
    fireEvent.change(familySelect, { target: { value: '12346' } });

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('handles family member selection for faculty', async () => {
    axios.post.mockResolvedValueOnce({
      data: { institute_id: 'F-9999', name: 'Faculty Member', patient_type: 'Faculty', appointments: [] }
    });
    // Mock family members
    axios.get.mockResolvedValueOnce({
      data: [
        { institute_id: 'F-9999', name: 'Faculty Member', relation: 'Self' },
        { institute_id: 'F-9999-SPOUSE', name: 'Faculty Spouse', relation: 'Spouse' }
      ]
    });
    // Mock doctors
    axios.get.mockResolvedValueOnce({ data: [] });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: 'F-9999' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Faculty Member')).toBeInTheDocument();
    });

    // Verify API call used institute_id
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/family/F-9999'));

    // Select family member
    const familySelect = screen.getByRole('combobox', { name: /Who is this appointment for\?/i });
    fireEvent.change(familySelect, { target: { value: 'F-9999-SPOUSE' } });

    await waitFor(() => {
      expect(screen.getByText('Faculty Spouse')).toBeInTheDocument();
    });
  });

  it('handles pending bills warning and active appointments warning', async () => {
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', bill_status: 'pending', appointments: [] }
    });
    axios.get.mockResolvedValue({
      data: [
        {
          username: 'doc1',
          display_name: 'Dr. Smith',
          department: 'General',
          schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
        }
      ]
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // Click Book Now for Quick Book
    fireEvent.click(screen.getByRole('button', { name: /Book Now/i }));

    // Should show billing warning
    await waitFor(() => {
      expect(screen.getByText(/Pending Bill Notice/i)).toBeInTheDocument();
    });

    // Acknowledge billing warning
    fireEvent.click(screen.getByRole('button', { name: /Proceed to Book/i }));

    // Should proceed to Quick Confirm
    await waitFor(() => {
      expect(screen.getByText(/Immediate Booking Confirmation/i)).toBeInTheDocument();
    });

    // Now Mock active appointments and submit
    axios.get.mockResolvedValue({
      data: { activeAppointments: [{ id: 1, time: '2025-01-01T10:00:00', doctor_name: 'Dr. Smith' }] }
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Book/i }));

    // Should show active appointment warning
    await waitFor(() => {
      expect(screen.getAllByText(/Active Appointment/i)[0]).toBeInTheDocument();
    });

    // Proceed anyway
    axios.post.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: /Yes, Proceed/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/portal');
    }, { timeout: 3000 });
  }, 10000);

  it('handles verification error and OTP error', async () => {
    // 1. Invalid Institute ID
    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Not found' } } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Not found/i)).toBeInTheDocument();
    });

    // 2. Invalid OTP
    axios.post.mockResolvedValueOnce({
      data: { requires_otp: true, email: 'j***@bits.edu' }
    });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText(/We've sent a 4-digit OTP/i)).toBeInTheDocument();
    });

    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Invalid OTP' } } });
    const otpInput = screen.getByPlaceholderText('----');
    fireEvent.change(otpInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify OTP/i }));

    await waitFor(() => {
      expect(screen.getByText(/Verification Failed/i)).toBeInTheDocument();
    });
  });

  it('disables full time slots', async () => {
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', appointments: [] }
    });
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/public/doctors')) {
        return Promise.resolve({
          data: [
            {
              username: 'doc1',
              display_name: 'Dr. Smith',
              department: 'General',
              schedule: [{ duty_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
            }
          ]
        });
      }
      if (url.includes('/api/public/doctor-availability')) {
        return Promise.resolve({
          data: { full_slots: ['09:10'] }
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // Go to future booking flow
    fireEvent.click(screen.getByRole('button', { name: /Schedule for a Later Date/i }));
    await waitFor(() => {
      expect(screen.getByText(/Advanced Booking/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Proceed/i, hidden: true }));

    await waitFor(() => {
      expect(screen.getByText(/Advanced Booking/i)).toBeInTheDocument();
    });

    // Select the doctor
    fireEvent.change(screen.getByLabelText(/Select Doctor/i), { target: { value: 'doc1' } });
    
    // Choose date
    fireEvent.change(screen.getByLabelText(/Appointment Date/i), { target: { value: '2026-06-22' } });

    // "09:10 AM" option should be disabled and have (Full)
    const fullOption = await screen.findByText(/9:10 AM \(Full\)/i);
    expect(fullOption).toBeDisabled();
    
    const openOption = await screen.findByText(/^9:20 AM$/i);
    expect(openOption).not.toBeDisabled();
  });

  it('blocks booking when patient has 3 or more active appointments', async () => {
    axios.post.mockResolvedValueOnce({
      data: { institute_id: '12345', name: 'John Doe', appointments: [] }
    });
    axios.get.mockResolvedValue({
      data: [
        {
          username: 'doc1',
          display_name: 'Dr. Smith',
          department: 'General',
          schedule: [{ duty_days: ['Monday'], start_time: '09:00 AM', end_time: '05:00 PM' }]
        }
      ]
    });

    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (General)')).toBeInTheDocument();
    });

    // Quick Book
    fireEvent.click(screen.getByRole('button', { name: /Book Now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Immediate Booking Confirmation/i)).toBeInTheDocument();
    });

    // Mock 3 active appointments
    axios.get.mockResolvedValue({
      data: { activeAppointments: [
        { id: 1, time: '2025-01-01T10:00:00', doctor_name: 'Dr. Smith' },
        { id: 2, time: '2025-01-02T10:00:00', doctor_name: 'Dr. Smith' },
        { id: 3, time: '2025-01-03T10:00:00', doctor_name: 'Dr. Smith' }
      ] }
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Book/i }));

    // Should show error toast directly
    await waitFor(() => {
      expect(screen.getByText(/Appointment Limit Reached/i)).toBeInTheDocument();
      expect(screen.getByText(/You have reached the maximum limit of 3 active appointments/i)).toBeInTheDocument();
    });
  }, 10000);

  it('renders patient visit history and expands the prescription slip accordion', async () => {
    const mockHistoryPatient = {
      institute_id: '12345',
      name: 'John Doe',
      appointments: [
        {
          status: 'completed',
          time: new Date('2023-01-01T10:00:00Z').toISOString(),
          doctor_name: 'Dr. Smith',
          emr_data: {
            assessment: { provisional_diagnosis: 'Fever' },
            subjective: { chief_complaints: 'High temp' },
            plan: { investigations: [], medications: [] }
          }
        }
      ]
    };

    axios.post.mockResolvedValueOnce({ data: mockHistoryPatient });
    renderComponent();

    // Verify patient to load history
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    // Wait for history to load
    await waitFor(() => {
      expect(screen.getByText('My Visit History')).toBeInTheDocument();
    });

    // Expand the main visit history panel
    const visitAccordionButton = screen.getByText(/Dr. Smith/i);
    fireEvent.click(visitAccordionButton);

    // Verify EMR details from EMRHistoryDisplay are rendered
    expect(screen.getByText(/High temp/i)).toBeInTheDocument();

    // Verify OPD Card nested accordion button is visible, but the slip itself is closed/not visible
    const slipAccordionButton = screen.getByText('OPD Card / Prescription Slip Preview');
    expect(slipAccordionButton).toBeInTheDocument();
    expect(screen.queryByText('Birla Institute of Technology & Science')).not.toBeInTheDocument();

    // Expand the OPD Card nested accordion
    fireEvent.click(slipAccordionButton);
    expect(screen.getByText('Birla Institute of Technology & Science')).toBeInTheDocument();

  });

  it('asks for confirmation when clicking Back to Portal after verification', async () => {
    const mockPatient = {
      institute_id: '12345',
      name: 'John Doe',
      appointments: []
    };
    axios.post.mockResolvedValueOnce({ data: mockPatient });
    renderComponent();

    // Verify patient
    fireEvent.change(screen.getByPlaceholderText(/e.g. 2025H1120147P/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Patient/i }));

    // Wait for verified state
    await screen.findByText('Verified Patient');

    // Click Back to Portal button
    const backBtn = screen.getByRole('button', { name: 'Back to Portal' });
    fireEvent.click(backBtn);

    // Confirmation Modal should appear
    await screen.findByText('Exit Patient Portal');
    expect(screen.getByText(/Are you sure you want to go back/i)).toBeInTheDocument();

    // Click Stay Here to cancel
    fireEvent.click(screen.getByRole('button', { name: 'Stay Here' }));
    await waitFor(() => {
      expect(screen.queryByText('Exit Patient Portal')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Verified Patient')).toBeInTheDocument();

    // Click back again
    fireEvent.click(backBtn);
    await screen.findByText('Exit Patient Portal');

    // Click Yes, Go Back to confirm
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Go Back' }));
    await waitFor(() => {
      expect(screen.queryByText('Verified Patient')).not.toBeInTheDocument();
    });
  });
});
