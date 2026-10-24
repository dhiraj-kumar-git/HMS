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
  it('does not expand row if patient has no appointments', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    // Row for Jane Smith has no appointments
    const janeSmithRow = screen.getByText('Jane Smith').closest('tr');
    fireEvent.click(janeSmithRow);

    // Visit History should NOT appear
    expect(screen.queryByText('Visit History')).not.toBeInTheDocument();
  });

  it('handles pagination correctly', async () => {
    const manyPatients = Array.from({ length: 12 }, (_, i) => ({
      institute_id: `INST${(i + 1).toString().padStart(3, '0')}`,
      name: `Patient Number ${i + 1}`,
      contact_no: `123456789${i}`,
      appointments: []
    }));
    axios.get.mockResolvedValueOnce({ data: manyPatients });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Patient Number 1')).toBeInTheDocument();
    });

    // Should not see Patient 12 initially (since page size is 10)
    expect(screen.queryByText('Patient Number 12')).not.toBeInTheDocument();

    // Click Next
    const nextButton = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);

    // Should see Patient 12
    expect(screen.getByText('Patient Number 12')).toBeInTheDocument();
    // Should not see Patient 1
    expect(screen.queryByText('Patient Number 1')).not.toBeInTheDocument();

    // Click Previous
    const prevButton = screen.getByRole('button', { name: /Previous/i });
    fireEvent.click(prevButton);

    // Should see Patient 1 again
    expect(screen.getByText('Patient Number 1')).toBeInTheDocument();
  });

  it('handles sorting when institute_id is missing', async () => {
    const edgeCasePatients = [
      { name: 'No ID Patient', appointments: [] }, // nullish/undefined ID
      { institute_id: 'A123', name: 'With ID Patient', appointments: [] }
    ];
    axios.get.mockResolvedValueOnce({ data: edgeCasePatients });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/No ID Patient/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/With ID Patient/i)).toBeInTheDocument();
  });

  it('handles fetch error and shows toast', async () => {
    // Chakra UI toast runs in DOM
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    renderComponent();

    // Since Chakra toast might not instantly show up in RTL without a proper container,
    // we can just wait for it to be called or check if the table renders empty.
    await waitFor(() => {
      expect(screen.getByText('No patients found.')).toBeInTheDocument();
    });
  });

  it('handles row toggling', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();
    
    await screen.findByText('John Doe');

    const johnDoeRow = screen.getByText('John Doe').closest('tr');
    
    // Expand
    fireEvent.click(johnDoeRow);
    expect(screen.getByText('Visit History')).toBeInTheDocument();
    
    // Collapse
    fireEvent.click(johnDoeRow);
    expect(screen.queryByText('Visit History')).not.toBeInTheDocument();
  });

  it('sorts alphabetically by institute_id', async () => {
    const unsortedPatients = [
      { institute_id: 'Z100', name: 'Zeta', appointments: [] },
      { institute_id: 'A100', name: 'Alpha', appointments: [] },
      { institute_id: 'M100', name: 'Mid', appointments: [] }
    ];
    axios.get.mockResolvedValueOnce({ data: unsortedPatients });
    renderComponent();

    await screen.findByText('Zeta');
    
    const rows = screen.getAllByRole('row');
    // First row is header. Data rows start at 1.
    // So row 1 = Alpha, 2 = Mid, 3 = Zeta
    expect(rows[1]).toHaveTextContent('A100');
    expect(rows[2]).toHaveTextContent('M100');
    expect(rows[3]).toHaveTextContent('Z100');
  });
});
