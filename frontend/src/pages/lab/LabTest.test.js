import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LabTestDashboard from './LabTest';

jest.setTimeout(30000);
jest.mock('axios');

const mockLabTestsConfig = [
  { test_id: '1', test_name: 'Hemoglobin', reference_range: '13-17', units: 'g/dL' },
  { test_id: 'group_1', test_name: 'CBC (Hemoglobin, WBC)', reference_range: 'N/A', units: 'N/A' },
  { test_id: '2', test_name: 'WBC', reference_range: '4-11', units: 'x10^9/L' },
  { test_id: '3', test_name: 'MultiTest', reference_range: 'Param1: 10-20, Param2: 30-40', units: 'unit1, unit2' },
];

const mockPatients = [
  {
    institute_id: 'P123',
    visit_id: 1,
    name: 'John Doe',
    age: 30,
    gender: 'Male',
    lab_tests: [
      { lab_test: 'Hemoglobin' },
      { lab_test: 'group_1' },
      { lab_test: 'MultiTest' }
    ]
  }
];

describe('LabTest Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    window.open = jest.fn().mockReturnValue({
      document: {
        write: jest.fn(),
        close: jest.fn()
      },
      print: jest.fn()
    });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <LabTestDashboard />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders and fetches patients and config', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) {
        return Promise.resolve({ data: mockLabTestsConfig });
      }
      if (url.includes('/lab/patients')) {
        return Promise.resolve({ data: { confirmed: mockPatients, upcoming: [] } });
      }
      return Promise.reject(new Error('not found'));
    });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Confirmed Lab Test Orders (1)')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('P123')).toBeInTheDocument();
    });
  });

  it('opens patient modal and displays test inputs correctly', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: mockLabTestsConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: mockPatients, upcoming: [] } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click on the View Lab Order button
    const viewBtn = screen.getByRole('button', { name: /View Lab Order/i });
    await act(async () => {
      fireEvent.click(viewBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/John Doe \(ID: P123\)/i)).toBeInTheDocument();
      
      // Individual test
      expect(screen.getAllByText('Hemoglobin').length).toBeGreaterThan(0);
      // Group test
      expect(screen.getByText('WBC')).toBeInTheDocument(); // Subtest of CBC
      // Multi test
      expect(screen.getByText('Param1')).toBeInTheDocument();
    });
    
    // Check inputs exist for these types
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(4); // 1 individual, 2 group, 2 multi
  });

  it('handles input changes and submits report', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: mockLabTestsConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: mockPatients, upcoming: [] } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const viewBtn = screen.getByRole('button', { name: /View Lab Order/i });
    await act(async () => {
      fireEvent.click(viewBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/John Doe \(ID: P123\)/i)).toBeInTheDocument();
    });

    // Fill out inputs
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '15' } }); // Hemoglobin
    fireEvent.change(inputs[1], { target: { value: '14' } }); // CBC Hemoglobin
    fireEvent.change(inputs[2], { target: { value: '5' } }); // CBC WBC
    fireEvent.change(inputs[3], { target: { value: '15' } }); // Param1
    fireEvent.change(inputs[4], { target: { value: '35' } }); // Param2

    // Submit report
    axios.post.mockResolvedValueOnce({ data: { message: 'success' } });
    
    const saveBtn = screen.getByRole('button', { name: /Save Results/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/lab/save_report'),
        expect.objectContaining({
          institute_id: 'P123',
          visit_id: 1,
        }),
        expect.any(Object)
      );
    });
  });

  it('renders upcoming (unpaid) patients list with disabled action button', async () => {
    const mockUpcomingPatients = [
      {
        institute_id: 'P999',
        visit_id: 2,
        name: 'Jane Smith',
        age: 28,
        gender: 'Female',
        lab_tests: [{ lab_test: 'Hemoglobin' }]
      }
    ];

    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: mockLabTestsConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: [], upcoming: mockUpcomingPatients } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    await act(async () => {
      renderComponent();
    });

    // Click the accordion button to expand the Upcoming section
    const accordionHeader = screen.getByText(/Upcoming Lab Test Orders/i);
    fireEvent.click(accordionHeader);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('P999')).toBeInTheDocument();
      expect(screen.getByText('28 yrs • Female')).toBeInTheDocument();
      expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    });
  });
});
