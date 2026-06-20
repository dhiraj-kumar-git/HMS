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
});
