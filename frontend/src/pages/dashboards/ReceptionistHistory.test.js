import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistHistory from './ReceptionistHistory';

jest.mock('axios');

describe('ReceptionistHistory Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'fake-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <ReceptionistHistory />
      </ChakraProvider>
    );
  };

  it('renders correctly and fetches initial queue', async () => {
    const mockData = [
      {
        visit_id: 1,
        time: '2023-10-10T10:00:00Z',
        name: 'John Doe',
        age: 30,
        gender: 'Male',
        institute_id: 'H2023001',
        doctor_name: 'Dr. Smith',
        status: 'completed'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockData });

    renderComponent();

    // Loading state initially
    expect(screen.getByText('Appointment History')).toBeInTheDocument();

    // Data rendered
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('30 yrs • Male')).toBeInTheDocument();
      expect(screen.getByText('H2023001')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/receptionist/queue'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-token' }
      })
    );
  });

  it('handles empty queue', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No appointments found for the selected criteria.')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No appointments found for the selected criteria.')).toBeInTheDocument();
    });
  });

  it('filters trigger data fetch', async () => {
    axios.get.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] });

    renderComponent();

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    const statusSelect = screen.getByLabelText(/Status/i);
    fireEvent.change(statusSelect, { target: { value: 'cancelled' } });

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    const refreshBtn = screen.getByText('Refresh');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(3);
    });
  });

  it('opens print modal when clicking on a checked_in patient row', async () => {
    const mockData = [
      {
        visit_id: 1,
        time: '2023-10-10T10:00:00Z',
        name: 'Checked In Patient',
        age: 30,
        gender: 'Male',
        institute_id: 'H2023001',
        doctor_name: 'Dr. Smith',
        status: 'checked_in'
      },
      {
        visit_id: 2,
        time: '2023-10-10T11:00:00Z',
        name: 'Completed Patient',
        age: 25,
        gender: 'Female',
        institute_id: 'H2023002',
        doctor_name: 'Dr. John',
        status: 'completed'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Checked In Patient')).toBeInTheDocument();
      expect(screen.getByText('Completed Patient')).toBeInTheDocument();
    });

    // Mocking window.matchMedia for the PrescriptionModal component since Chakra UI Modal might render
    window.matchMedia = window.matchMedia || function() {
      return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
      };
    };

    // Click on checked in patient row (we'll click the text inside the row)
    fireEvent.click(screen.getByText('Checked In Patient'));

    // Modal should open, showing "OPD CARD / SLIP"
    await waitFor(() => {
      expect(screen.getByText('OPD CARD / SLIP')).toBeInTheDocument();
    });

    // Close the modal
    const closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('OPD CARD / SLIP')).not.toBeInTheDocument();
    });

    // Click on completed patient row
    fireEvent.click(screen.getByText('Completed Patient'));

    // Modal should NOT open
    expect(screen.queryByText('OPD CARD / SLIP')).not.toBeInTheDocument();
  });

  it('formats Date & Time in DD/MM/YY, H:MM PM format for receptionist view', async () => {
    const testDate = new Date(2026, 6, 16, 17, 30); // 16 July 2026 17:30
    const mockData = [
      {
        visit_id: 1,
        time: testDate.toISOString(),
        name: 'John Doe',
        age: 30,
        gender: 'Male',
        institute_id: 'H2023001',
        doctor_name: 'Dr. Smith',
        status: 'completed'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockData });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('16/7/26, 5:30 PM')).toBeInTheDocument();
    });
  });
});
