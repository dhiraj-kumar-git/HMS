import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistQueue from './ReceptionistQueue';

jest.mock('axios');

describe('ReceptionistQueue Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <ReceptionistQueue />
      </ChakraProvider>
    );
  };

  it('renders queue items and handles actions', async () => {
    axios.get.mockResolvedValue({
      data: [
        { visit_id: 'V1', time: '2026-06-25T10:00:00', name: 'John Doe', institute_id: 'P1', doctor_name: 'Dr. A', status: 'booked' },
        { visit_id: 'V2', time: '2026-06-25T10:15:00', name: 'Jane Doe', institute_id: 'P2', doctor_name: 'Dr. B', status: 'confirmed' },
        { visit_id: 'V3', time: '2026-06-25T10:30:00', name: 'Jack Doe', institute_id: 'P3', doctor_name: 'Dr. C', status: 'checked_in' }
      ]
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('Jack Doe')).toBeInTheDocument();
    });

    // Check actions for 'booked'
    expect(screen.getAllByRole('button', { name: /Confirm/i })).toHaveLength(1);
    
    // Check actions for 'confirmed'
    expect(screen.getAllByRole('button', { name: /Check-In/i })).toHaveLength(1);

    // Check No Show button (appears for booked and confirmed)
    expect(screen.getAllByRole('button', { name: /No Show/i })).toHaveLength(2);



    // Test Confirm Arrival click
    axios.post.mockResolvedValueOnce({ data: { message: 'Success' } });
    axios.get.mockResolvedValueOnce({ data: [] }); // fetchQueue mock for after action

    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/receptionist/appointment/V1/status'),
        { status: 'confirmed' },
        expect.any(Object)
      );
    });
  });

  it('renders empty message when queue is empty', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('No appointments found for the selected criteria.')).toBeInTheDocument();
    });
  });

  it('updates filters and fetches queue with correct query parameters on refresh', async () => {
    axios.get.mockResolvedValue({ data: [] });
    renderComponent();

    // Initial fetch should have today's date and 'active' status
    const today = new Date().toISOString().split('T')[0];
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/receptionist/queue'),
        expect.objectContaining({
          params: { start_date: today, end_date: today, status: 'active' }
        })
      );
    });

    // Clear mock to check next calls easily
    axios.get.mockClear();

    // Wait for the component to finish loading and display the form
    await waitFor(() => {
      expect(screen.getByTestId('start-date-input')).toBeInTheDocument();
    });

    // Change Start Date
    fireEvent.change(screen.getByTestId('start-date-input'), { target: { value: '2026-06-20' } });
    
    // Change End Date
    fireEvent.change(screen.getByTestId('end-date-input'), { target: { value: '2026-06-25' } });
    
    // Change Status
    fireEvent.change(screen.getByTestId('status-filter-select'), { target: { value: 'all' } });

    // The effect should trigger a fetch automatically when dependencies change
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/receptionist/queue'),
        expect.objectContaining({
          params: { start_date: '2026-06-20', end_date: '2026-06-25', status: 'all' }
        })
      );
    });

    // Click Refresh
    axios.get.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });
});
