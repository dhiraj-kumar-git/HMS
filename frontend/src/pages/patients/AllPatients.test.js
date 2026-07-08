import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import AllPatients from './AllPatients';

// Mock axios
jest.mock('axios');

// Mock child components that might use complicated Chakra hooks or canvas
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('AllPatients Component', () => {
  const mockPatientsData = [
    {
      institute_id: 'INST001',
      name: 'John Doe',
      age: 30,
      gender: 'Male',
      workflow_status: 'active',
      appointments: [
        {
          status: 'completed',
          doctor_username: 'test_doc',
          time: new Date('2023-01-01T10:00:00Z').toISOString(),
        }
      ]
    },
    {
      institute_id: 'INST002',
      name: 'Jane Smith',
      age: 25,
      gender: 'Female',
      workflow_status: 'inactive',
      appointments: [
        {
          status: 'completed',
          doctor_username: 'test_doc',
          time: new Date('2023-01-02T10:00:00Z').toISOString(),
        }
      ]
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'token') return 'mock-token';
      if (key === 'username') return 'test_doc';
      if (key === 'display_name') return 'Dr. Test';
      return null;
    });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <AllPatients />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders loading spinner initially', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderComponent();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('fetches and renders patients', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Patient Visit History/i)).toBeInTheDocument();
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('INST001')).toBeInTheDocument();
    expect(screen.getByText('INST002')).toBeInTheDocument();
  });

  it('filters patients by search query', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search.../i);
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('navigates to patient history when action button is clicked', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const viewHistoryButtons = screen.getAllByRole('button', { name: /View History/i });
    fireEvent.click(viewHistoryButtons[0]); // Click the first one (John Doe)

    expect(mockNavigate).toHaveBeenCalledWith('/doctor/patient-history/INST001');
  });

  it('renders empty state when no patients match', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/No patient history available/i)).toBeInTheDocument();
    });
  });

  it('filters by date and status', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();
    await screen.findByText('John Doe');

    // Filter by status 'active'
    const statusSelect = screen.getAllByRole('combobox')[0]; // Status
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();

    // Reset status
    fireEvent.change(statusSelect, { target: { value: '' } });

    // Filter by Date (Jane has 2023-01-02, John has 2023-01-01)
    const dateNode = document.querySelector('input[type="date"]');
    
    if (dateNode) {
      fireEvent.change(dateNode, { target: { value: '2023-01-02' } });
    }
  });

  it('sorts by date', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();
    await screen.findByText('John Doe');

    // Sort
    const sortSelect = screen.getAllByRole('combobox')[1]; // Sort
    fireEvent.change(sortSelect, { target: { value: 'date' } });
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('handles pagination', async () => {
    const manyPatients = Array.from({ length: 15 }, (_, i) => ({
      institute_id: `INST${i}`,
      name: `Patient ${i}`,
      age: 20,
      gender: 'Male',
      workflow_status: 'active',
      appointments: []
    }));
    
    axios.get.mockResolvedValueOnce({ data: manyPatients });
    renderComponent();
    await screen.findByText('Patient 0');

    expect(screen.queryByText('Patient 14')).not.toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText('Patient 14')).toBeInTheDocument();
    expect(screen.queryByText('Patient 0')).not.toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /Previous/i });
    fireEvent.click(prevBtn);

    expect(screen.getByText('Patient 0')).toBeInTheDocument();
  });

  it('handles API error during fetch', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    renderComponent();

    // Just verifying it doesn't crash
    await screen.findByText(/No patient history available/i);
  });

  it('handles default logout', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientsData });
    renderComponent();
    await screen.findByText('John Doe');

    // Original window.location
    const originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };

    const menuBtnText = screen.getByText('Dr. Test');
    const menuBtn = menuBtnText.closest('button');
    fireEvent.click(menuBtn);

    // Wait for menu to open
    const logoutBtn = await screen.findByRole('menuitem', { name: /Logout/i });
    fireEvent.click(logoutBtn);

    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
    expect(window.location.href).toBe('/login');

    // Restore window.location
    window.location = originalLocation;
  });

  it('shows patients with cancelled visits in the list and formats last visit date', async () => {
    const mockCancelledData = [
      {
        institute_id: 'INST003',
        name: 'Bob Ross',
        age: 40,
        gender: 'Male',
        workflow_status: 'completed',
        appointments: [
          {
            status: 'cancelled',
            time: '2023-03-01T10:00:00Z',
            doctor_username: 'doc1',
            doctor_name: 'Dr. Test'
          }
        ]
      }
    ];
    axios.get.mockResolvedValueOnce({ data: mockCancelledData });
    renderComponent();

    await screen.findByText('Bob Ross');
    expect(screen.getByText('01/03/2023')).toBeInTheDocument();
  });
});
