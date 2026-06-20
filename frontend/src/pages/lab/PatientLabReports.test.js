import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import PatientLabReports from './PatientLabReports';

jest.mock('axios');

const mockReports = [
  {
    institute_id: 'P123',
    name: 'John Doe',
    age: 30,
    gender: 'Male',
    email: 'john@example.com',
    lab_reports: [
      {
        test_name: 'CBC',
        timestamp: '2026-06-20T10:00:00Z',
        results: {
          WBC: { value: 5.5, reference_range: '4-11', units: '10^9/L' },
          RBC: { value: 4.8, reference_range: '4.5-5.5', units: '10^12/L' }
        },
        remarks: 'Normal'
      }
    ]
  },
  {
    institute_id: 'P124',
    name: 'Jane Doe',
    age: 25,
    gender: 'Female',
    email: 'jane@example.com',
    lab_reports: []
  }
];

describe('PatientLabReports Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    Storage.prototype.setItem = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <PatientLabReports />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders and fetches reports', async () => {
    axios.get.mockResolvedValueOnce({ data: mockReports });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Patient Lab Reports')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('CBC')).toBeInTheDocument();
    });
  });

  it('opens view report modal and displays report details', async () => {
    axios.get.mockResolvedValueOnce({ data: mockReports });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click 'View Report' for John Doe
    const viewBtns = screen.getAllByRole('button', { name: /View Report/i });
    await act(async () => {
      fireEvent.click(viewBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/John Doe \(ID: P123\)/i)).toBeInTheDocument();
      expect(screen.getByText('WBC')).toBeInTheDocument();
      expect(screen.getByText('5.5')).toBeInTheDocument();
      expect(screen.getByText('4-11')).toBeInTheDocument();
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });
  });

  it('handles email report functionality', async () => {
    axios.get.mockResolvedValueOnce({ data: mockReports });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Mock successful email
    axios.post.mockResolvedValueOnce({ data: { message: 'success' } });

    // Click 'Email' for John Doe
    const emailBtns = screen.getAllByRole('button', { name: /Email/i });
    await act(async () => {
      fireEvent.click(emailBtns[0]);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/lab/send_email'),
        expect.objectContaining({
          recipient_email: 'john@example.com',
          subject: 'Lab Report for John Doe - CBC',
        }),
        expect.any(Object)
      );
    });
  });

  it('handles storage event for auto-refresh', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('No lab reports available yet.')).toBeInTheDocument();
    });

    // Simulate storage event
    axios.get.mockResolvedValueOnce({ data: mockReports });

    await act(async () => {
      const event = new StorageEvent('storage', {
        key: 'refreshReports',
        newValue: 'true'
      });
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('refreshReports', 'false');
    });
  });

  it('handles refresh button click', async () => {
    axios.get.mockResolvedValueOnce({ data: mockReports });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click refresh button
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    axios.get.mockResolvedValueOnce({ data: [] });

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('No lab reports available yet.')).toBeInTheDocument();
    });
  });
});
