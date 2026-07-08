import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import MedicalCounterDashboard from './MedicalCounterDashboard';

// Mock axios
jest.mock('axios');

describe('MedicalCounterDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'counter1');
    localStorage.setItem('token', 'fake-token');

    // Default mock implementation
    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) {
        return Promise.resolve({
          data: [
            { test_name: 'Blood Test', rates: [100] }
          ]
        });
      }
      if (url.includes('/active_registrations')) {
        return Promise.resolve({
          data: [
            {
              institute_id: 'OPD-101',
              name: 'John Doe',
              age: 25,
              patient_type: 'Student',
              workflow_status: 'consultation completed',
              bill_status: 'pending',
              lab_status: 'pending',
              prescriptions: [{ note: 'Paracetamol' }],
              lab_tests: [{ lab_test: 'Blood Test' }],
              visit_id: 'VIS-001'
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDashboard = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <MedicalCounterDashboard />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders and fetches active registrations', async () => {
    renderDashboard();

    // Wait for the loading spinner to disappear and data to load
    await waitFor(() => {
      expect(screen.getByText('Medical Counter')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('OPD-101')).toBeInTheDocument();
    });
  });

  it('opens payment modal and calculates total correctly', async () => {
    renderDashboard();

    await screen.findByText('John Doe');

    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => {
      expect(screen.getByText(/John Doe \(ID: OPD-101\)/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      const amounts = screen.getAllByText('100.00');
      expect(amounts.length).toBeGreaterThan(0);
    });
  });

  it('handles payment confirmation', async () => {
    axios.post.mockResolvedValueOnce({ data: { invoice_no: 'INV-101' } });

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('Confirm Payment & Mark as Paid');

    await waitFor(() => {
      const amounts = screen.getAllByText('100.00');
      expect(amounts.length).toBeGreaterThan(0);
    });

    const confirmBtn = screen.getByText('Confirm Payment & Mark as Paid');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/pay_bill'),
        expect.objectContaining({
          institute_id: 'OPD-101',
          visit_id: 'VIS-001',
          payment_mode: 'UPI',
        }),
        expect.any(Object)
      );
      // Wait for success screen
      expect(screen.getByText('Payment Received')).toBeInTheDocument();
      expect(screen.getByText('Invoice No: INV-101')).toBeInTheDocument();
    });
  });

  it('handles bill cancellation', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: 'cancelled' } });

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('Cancel Entire Bill');

    const cancelBtn = screen.getByText('Cancel Entire Bill');
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/cancel_bill'),
        expect.objectContaining({
          institute_id: 'OPD-101',
          visit_id: 'VIS-001'
        }),
        expect.any(Object)
      );
    });
  });

  it('allows toggling checkboxes for lab tests and medicines', async () => {
    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('Confirm Payment & Mark as Paid');

    // Find checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2); // one for med, one for lab

    // Uncheck both
    fireEvent.click(checkboxes[0]); // Uncheck med
    fireEvent.click(checkboxes[1]); // Uncheck lab

    // Total should be 0.00 after unchecking
    await waitFor(() => {
      const amounts = screen.getAllByText('0.00');
      expect(amounts.length).toBeGreaterThan(0);
    });
  });

  it('handles print receipt', async () => {
    axios.post.mockResolvedValueOnce({ data: { invoice_no: 'INV-101' } });

    // Mock window.open
    const mockWindow = {
      document: {
        open: jest.fn(),
        write: jest.fn(),
        close: jest.fn(),
      },
      print: jest.fn(),
      close: jest.fn(),
    };
    window.open = jest.fn(() => mockWindow);

    renderDashboard();
    await screen.findByText('John Doe');
    fireEvent.click(screen.getByText('John Doe'));

    await screen.findByText('Confirm Payment & Mark as Paid');

    const confirmBtn = screen.getByText('Confirm Payment & Mark as Paid');
    fireEvent.click(confirmBtn);

    await screen.findByText('Print Receipt');

    const printBtn = screen.getByText('Print Receipt');
    fireEvent.click(printBtn);

    expect(window.open).toHaveBeenCalled();
    expect(mockWindow.print).toHaveBeenCalled();
  });

  it('sorts patients in ascending order of Completed Time (earliest first)', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/active_registrations')) {
        return Promise.resolve({
          data: [
            {
              institute_id: 'OPD-102',
              name: 'Jane Smith',
              age: 30,
              workflow_status: 'consultation completed',
              consultation_completed_time: '2026-07-08T10:30:00Z',
              visit_id: 'VIS-002'
            },
            {
              institute_id: 'OPD-101',
              name: 'John Doe',
              age: 25,
              workflow_status: 'consultation completed',
              consultation_completed_time: '2026-07-08T10:00:00Z',
              visit_id: 'VIS-001'
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await screen.findByText('John Doe');
    await screen.findByText('Jane Smith');

    const rows = screen.getAllByRole('row');
    // Row 0 is the table header, Row 1 should be John Doe (10:00), Row 2 should be Jane Smith (10:30)
    expect(rows[1]).toHaveTextContent('John Doe');
    expect(rows[2]).toHaveTextContent('Jane Smith');
  });

  it('renders correctly when no patients are active', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/active_registrations')) {
        return Promise.resolve({ data: [] }); // No patients
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No active patients found.')).toBeInTheDocument();
    });
  });
});
