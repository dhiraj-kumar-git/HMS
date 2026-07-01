import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ManageSchedule from './ManageSchedule';

jest.mock('axios');

const mockDoctors = [
  { 
    username: 'doc1', 
    display_name: 'Dr. John', 
    department: 'Cardio', 
    schedule: [
      { duty_days: ['Monday'], start_time: '10:00 AM', end_time: '02:00 PM' }
    ]
  },
  { 
    username: 'doc2', 
    display_name: 'Dr. Smith', 
    department: 'Neuro', 
    schedule: [] // no schedule
  }
];

describe('ManageSchedule Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <ManageSchedule />
      </ChakraProvider>
    );
  };

  it('renders and fetches doctors', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    expect(screen.getByText(/Manage Doctor Schedules/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Dr. John (Cardio)')).toBeInTheDocument();
      expect(screen.getByText('Dr. Smith (Neuro)')).toBeInTheDocument();
    });
  });

  it('selects a doctor and displays their schedule', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John (Cardio)')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'doc1' } });

    await waitFor(() => {
      expect(screen.getByText('Active Shifts')).toBeInTheDocument();
      expect(screen.getByText('Shift 1')).toBeInTheDocument();
    });

    // Check if Monday is checked
    const monCheckbox = screen.getByLabelText('Mon');
    expect(monCheckbox).toBeChecked();
  });

  it('handles empty schedule state for new doctor', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (Neuro)')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'doc2' } });

    await waitFor(() => {
      expect(screen.getByText('Active Shifts')).toBeInTheDocument();
      expect(screen.getByText('Shift 1')).toBeInTheDocument();
    });
    
    // Check if defaults are loaded
    const monCheckbox = screen.getByLabelText('Mon');
    expect(monCheckbox).not.toBeChecked();
  });

  it('adds and removes a shift', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John (Cardio)')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'doc1' } });

    await waitFor(() => {
      expect(screen.getByText('Shift 1')).toBeInTheDocument();
    });

    const addShiftBtn = screen.getByRole('button', { name: /Add Shift/i });
    fireEvent.click(addShiftBtn);

    expect(screen.getByText('Shift 2')).toBeInTheDocument();

    // Delete first shift
    const deleteBtns = screen.getAllByRole('button').filter(btn => {
      return !btn.textContent.includes('Add Shift') && 
             !btn.textContent.includes('Save Changes');
    });
    // Click the first delete button
    fireEvent.click(deleteBtns[0]);

    // After deleting, there should be only one shift left
    expect(screen.queryByText('Shift 2')).not.toBeInTheDocument();
    expect(screen.getByText('Shift 1')).toBeInTheDocument();
  });

  it('saves a valid schedule', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John (Cardio)')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'doc1' } });

    await waitFor(() => {
      expect(screen.getByText('Shift 1')).toBeInTheDocument();
    });

    // Valid schedule is already set for doc1 (Monday 10am-2pm)
    axios.put.mockResolvedValueOnce({ data: { message: 'success' } });

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining('/api/update_doctor/doc1'),
        { schedule: [{ duty_days: ['Monday'], start_time: '10:00 AM', end_time: '02:00 PM' }] },
        expect.any(Object)
      );
    });
  });

  it('validates incomplete shift', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. Smith (Neuro)')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'doc2' } });

    await waitFor(() => {
      expect(screen.getByText('Shift 1')).toBeInTheDocument();
    });

    // Default shift has no duty days, so it's incomplete
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    // Toast will fire, API should not be called
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('handles zero shifts with modal confirmation', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Dr. John (Cardio)')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'doc1' } });

    await waitFor(() => {
      expect(screen.getByText('Shift 1')).toBeInTheDocument();
    });

    // Delete the only shift
    const deleteBtns = screen.getAllByRole('button').filter(btn => {
      return !btn.textContent.includes('Add Shift') && 
             !btn.textContent.includes('Save Changes');
    });
    fireEvent.click(deleteBtns[0]);

    // Now 0 shifts
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText(/Warning: No Shifts Assigned/i)).toBeInTheDocument();
    });

    axios.put.mockResolvedValueOnce({ data: { message: 'success' } });

    const proceedBtn = screen.getByRole('button', { name: /Proceed with 0 Shifts/i });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining('/api/update_doctor/doc1'),
        { schedule: [] },
        expect.any(Object)
      );
    });
  });
});
