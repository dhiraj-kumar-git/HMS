import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import DoctorsDashboard from './DoctorsDashboard';

// Mock axios
jest.mock('axios');

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
              workflow_status: 'consultation',
              doctor_assigned: 'doctor1',
              registration_time: '2023-01-01T10:00:00Z',
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
              workflow_status: 'consultation',
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
      expect(screen.getByText('John Doe (ID: 101)')).toBeInTheDocument();
      expect(screen.getByText('Prescription & Remarks')).toBeInTheDocument();
    });
  });

  it('adds custom prescription and remark in the modal', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', age: 30, workflow_status: 'consultation' }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await waitFor(() => screen.getByText('John Doe'));
    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => screen.getByText('John Doe (ID: 101)'));

    // Add Prescription
    const prescriptionInput = screen.getByPlaceholderText(/Type a prescription detail/i);
    fireEvent.change(prescriptionInput, { target: { value: 'Drink water' } });
    const addPrescriptionBtn = screen.getAllByRole('button', { name: /Add/i })[0];
    fireEvent.click(addPrescriptionBtn);

    expect(screen.getByText('• Drink water')).toBeInTheDocument();

    // Add Remark
    const remarkInput = screen.getByPlaceholderText(/Type a remark/i);
    fireEvent.change(remarkInput, { target: { value: 'Rest for 2 days' } });
    const addRemarkBtn = screen.getAllByRole('button', { name: /Add/i })[1];
    fireEvent.click(addRemarkBtn);

    expect(screen.getByText('• Rest for 2 days')).toBeInTheDocument();
  });

});
