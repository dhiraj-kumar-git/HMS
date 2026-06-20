import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
});
