import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import BookAppointmentModal from './BookAppointmentModal';

jest.mock('axios');

describe('BookAppointmentModal Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
  });

  const renderComponent = (props) => {
    return render(
      <ChakraProvider>
        <BookAppointmentModal {...props} />
      </ChakraProvider>
    );
  };

  it('renders modal with patient details and fetches doctors', async () => {
    axios.get.mockResolvedValueOnce({ data: [{ username: 'doc1', display_name: 'Dr. Test', department: 'Cardiology' }] });
    
    renderComponent({ isOpen: true, onClose: jest.fn(), patient: { institute_id: 'P123', name: 'John Doe' }, onSuccess: jest.fn() });
    
    expect(screen.getByText(/Book Appointment for John Doe/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Dr. Test (Cardiology)')).toBeInTheDocument();
    });
  });

  it('books an appointment successfully', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/public/doctor-availability/')) {
        return Promise.resolve({ data: { full_slots: [] } });
      }
      return Promise.resolve({ data: [{ username: 'doc1', display_name: 'Dr. Test', schedule: [{ duty_days: 'Thursday', start_time: '09:00 AM', end_time: '05:00 PM' }] }] });
    });
    axios.post.mockResolvedValueOnce({ data: { message: 'Success' } });
    
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    
    renderComponent({ isOpen: true, onClose, patient: { institute_id: 'P123', name: 'John' }, onSuccess });
    
    await waitFor(() => {
      expect(screen.getByText('Dr. Test')).toBeInTheDocument();
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
          time: '2026-06-25T10:00'
        },
        expect.any(Object)
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
