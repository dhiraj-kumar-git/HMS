import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import PatientHistory from './PatientHistory';

// Mock axios
jest.mock('axios');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('PatientHistory Component', () => {
  const mockPatientData = {
    institute_id: 'INST001',
    name: 'John Doe',
    appointments: [
      {
        status: 'completed',
        time: new Date('2023-01-01T10:00:00Z').toISOString(),
        doctor_name: 'Dr. Smith',
        prescription_summary: ['Paracetamol 500mg'],
        prescription_remarks_summary: ['Take after meals'],
        diagnosis_note: ['Fever'],
        lab_test_summary: ['Blood Test']
      },
      {
        status: 'pending', // should be filtered out
        time: new Date('2023-02-01T10:00:00Z').toISOString(),
        doctor_name: 'Dr. Adams'
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'mock-token');
  });

  const renderComponent = (initialRoute = '/doctor/patient-history/INST001') => {
    return render(
      <ChakraProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/doctor/patient-history/:id" element={<PatientHistory />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders loading state initially', () => {
    // We delay the resolution to check loading state
    axios.get.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    expect(document.querySelector('.chakra-spinner')).toBeInTheDocument();
  });

  it('renders patient not found state when no patient is returned', async () => {
    axios.get.mockResolvedValueOnce({ data: null });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Patient not found')).toBeInTheDocument();
    });
  });

  it('renders patient history with appointments', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('ID: INST001')).toBeInTheDocument();

    // Check if the completed appointment is rendered
    expect(screen.getByText(/Dr. Smith/i)).toBeInTheDocument();
    
    // Check if the pending appointment is filtered out
    expect(screen.queryByText(/Dr. Adams/i)).not.toBeInTheDocument();

    // Expand accordion to see details
    const accordionButton = screen.getByRole('button', { name: /Dr. Smith/i });
    fireEvent.click(accordionButton);

    expect(screen.getByText('• Paracetamol 500mg')).toBeInTheDocument();
    expect(screen.getByText('• Take after meals')).toBeInTheDocument();
    expect(screen.getByText('• Fever')).toBeInTheDocument();
    expect(screen.getByText('• Blood Test')).toBeInTheDocument();
  });

  it('renders no history available when there are no completed appointments', async () => {
    const patientWithNoCompleted = {
      ...mockPatientData,
      appointments: [{ status: 'pending', doctor_name: 'Dr. Adams' }]
    };
    axios.get.mockResolvedValueOnce({ data: patientWithNoCompleted });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No history available')).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked', async () => {
    axios.get.mockResolvedValueOnce({ data: mockPatientData });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /Back/i });
    
    // Mock window.history.length
    Object.defineProperty(window, 'history', {
      value: { length: 2 },
      writable: true
    });

    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
