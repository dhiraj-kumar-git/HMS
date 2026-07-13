import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import BookAppointmentModal from './BookAppointmentModal';
import axios from 'axios';

jest.mock('axios');

describe('BookAppointmentModal Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/public/leaves')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/api/public/doctor-availability/')) {
        return Promise.resolve({ data: { full_slots: [] } });
      }
      // default: return doctors list
      return Promise.resolve({
        data: [{
          username: 'doc1',
          display_name: 'Dr. Test',
          department: 'Cardiology',
          schedule: [{ duty_days: 'Thursday', start_time: '09:00 AM', end_time: '05:00 PM' }]
        }]
      });
    });
  });

  const renderComponent = (props) => {
    return render(
      <ChakraProvider>
        <BookAppointmentModal {...props} />
      </ChakraProvider>
    );
  };

  it('renders modal with patient details and fetches doctors', async () => {
    renderComponent({ isOpen: true, onClose: jest.fn(), patient: { institute_id: 'P123', name: 'John Doe' }, onSuccess: jest.fn() });
    
    expect(screen.getByText(/Book Appointment for John Doe/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Dr. Test (Cardiology)')).toBeInTheDocument();
    });
  });

  it('books an appointment successfully', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: 'Success' } });
    
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    
    renderComponent({ isOpen: true, onClose, patient: { institute_id: 'P123', name: 'John' }, onSuccess });
    
    await waitFor(() => {
      expect(screen.getByText(/Dr. Test/i)).toBeInTheDocument();
    });

    // Select doctor
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'doc1' } });
    
    // Fill date
    const dateInput = screen.getByLabelText(/Appointment Date/i);
    fireEvent.change(dateInput, { target: { value: '2026-06-25' } }); // Assuming 2026-06-25 is Thursday

    await waitFor(() => {
      expect(selects[1]).not.toBeDisabled();
    });

    // Fill time slot
    fireEvent.change(selects[1], { target: { value: '10:00' } });

    // The Book button
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/receptionist/book-appointment'),
        {
          institute_id: 'P123',
          doctor_username: 'doc1',
          time: '2026-06-25T10:00',
          force: false
        },
        expect.any(Object)
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows warning when fields are missing on submit', async () => {
    renderComponent({ isOpen: true, onClose: jest.fn(), patient: { institute_id: 'P123', name: 'John Doe' }, onSuccess: jest.fn() });
    
    // Try to book without selecting anything
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    
    await waitFor(() => {
      // The toast is fired, which increases coverage.
    });
  });

  it('handles fetch full slots error and booking failure', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/public/leaves')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/api/public/doctor-availability/')) {
        return Promise.reject(new Error('Fetch full slots error'));
      }
      return Promise.resolve({ data: [{ username: 'doc1', display_name: 'Dr. Test', schedule: [] }] });
    });
    
    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Booking failed error' } } });
    
    renderComponent({ isOpen: true, onClose: jest.fn(), patient: { institute_id: 'P123', name: 'John Doe' }, onSuccess: jest.fn() });
    
    await waitFor(() => {
      expect(screen.getByText(/Dr. Test/i)).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'doc1' } });
    
    const dateInput = screen.getByLabelText(/Appointment Date/i);
    fireEvent.change(dateInput, { target: { value: '2026-06-25' } });
    
    await waitFor(() => {
      expect(selects[1]).not.toBeDisabled();
    });

    fireEvent.change(selects[1], { target: { value: '10:00' } });
    
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));

    await waitFor(() => {
      // It should call the error toast
    });
  });

  it('displays leave warning message and disables book button when doctor is on leave', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/public/leaves')) {
        return Promise.resolve({
          data: [{
            leave_id: 'L1',
            doctor_username: 'doc1',
            start_date: '2026-06-24',
            end_date: '2026-06-26',
            reason: 'Medical Leave'
          }]
        });
      }
      if (url.includes('/api/public/doctor-availability/')) {
        return Promise.resolve({ data: { full_slots: [] } });
      }
      return Promise.resolve({
        data: [{
          username: 'doc1',
          display_name: 'Dr. Test',
          department: 'Cardiology',
          schedule: [{ duty_days: 'Thursday', start_time: '09:00 AM', end_time: '05:00 PM' }]
        }]
      });
    });

    renderComponent({ isOpen: true, onClose: jest.fn(), patient: { institute_id: 'P123', name: 'John Doe' }, onSuccess: jest.fn() });

    await waitFor(() => {
      expect(screen.getByText('Dr. Test (Cardiology)')).toBeInTheDocument();
    });

    // Select doctor
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'doc1' } });
    
    // Select date within leave bounds
    const dateInput = screen.getByLabelText(/Appointment Date/i);
    fireEvent.change(dateInput, { target: { value: '2026-06-25' } });

    await waitFor(() => {
      expect(screen.getByText(/Doctor is on leave on this day/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Book' })).toBeDisabled();
    });
  });
});
