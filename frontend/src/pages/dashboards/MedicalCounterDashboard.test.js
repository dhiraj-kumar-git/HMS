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

    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => expect(screen.getByText('Confirm Payment & Mark as Paid')).toBeInTheDocument());

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
});
