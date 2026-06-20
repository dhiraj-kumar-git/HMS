import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import PatientsList from './PatientsList';

// Mock axios
jest.mock('axios');

describe('PatientsList Component', () => {
  const mockPatientsData = [
    {
      institute_id: 'INST001',
      name: 'John Doe',
      age: 30,
      gender: 'Male',
      contact_no: '1234567890',
      patient_type: 'Student',
      workflow_status: 'active',
      bill_status: 'paid',
      lab_status: 'completed',
      appointments: [
        {
          booked_at: new Date('2023-01-01T10:00:00Z').toISOString(),
          doctor_name: 'Dr. Smith',
          v_workflow_status: 'consultation completed',
          v_bill_status: 'paid',
          v_lab_status: 'completed'
        }
      ]
    },
    {
      institute_id: 'INST002',
      name: 'Jane Smith',
      age: 25,
      gender: 'Female',
      contact_no: '0987654321',
      patient_type: 'Faculty',
      workflow_status: 'inactive',
      bill_status: 'pending',
      lab_status: 'pending',
      appointments: []
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'mock-token');
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <PatientsList />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders correctly and fetches patients', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('INST001')).toBeInTheDocument();
    expect(screen.getByText('INST002')).toBeInTheDocument();
  });

  it('filters patients by search input', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by Institute ID, name, or contact/i);
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('expands row to show visit history when clicked', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Row for John Doe should be clickable since it has appointments
    const johnDoeRow = screen.getByText('John Doe').closest('tr');
    fireEvent.click(johnDoeRow);

    // Visit History should appear
    expect(screen.getByText('Visit History')).toBeInTheDocument();
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
  });

  it('opens status guide modal when button is clicked', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const guideButton = screen.getByRole('button', { name: /Status Guide/i });
    fireEvent.click(guideButton);

    expect(screen.getByText('Patients Status Guide')).toBeInTheDocument(); // from StatusGuideModal
  });

  it('renders empty state when no patients found', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No patients found.')).toBeInTheDocument();
    });
  });
});
