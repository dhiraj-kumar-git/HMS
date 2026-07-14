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

    // Fill out inputs (Hemoglobin is deduplicated as it is part of CBC)
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '14' } }); // CBC HB
    fireEvent.change(inputs[1], { target: { value: '5' } }); // CBC WBC
    fireEvent.change(inputs[2], { target: { value: '15' } }); // Param1
    fireEvent.change(inputs[3], { target: { value: '35' } }); // Param2

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

  it('comprehensively verifies redundancy deduplication rules for group, sub-group, and legacy group tests', async () => {
    const customConfig = [
      { test_id: 'group_1', test_name: 'CBC', reference_range: 'N/A', units: 'N/A', sub_tests: [
        { name: 'BLOOD Hb', reference_range: '13-17', units: 'g/dL' },
        { name: 'BLOOD TLC', reference_range: '4000-11000', units: '/cumm' },
        { name: 'BLOOD DLC', reference_range: 'Neutrophils: 40-75, Lymphocytes: 20-45', units: '%, %' }
      ]},
      { test_id: 'hb_id', test_name: 'BLOOD Hb', reference_range: '13-17', units: 'g/dL' },
      { test_id: 'tlc_id', test_name: 'BLOOD TLC', reference_range: '4000-11000', units: '/cumm' },
      { test_id: 'dlc_id', test_name: 'BLOOD DLC', reference_range: 'Neutrophils: 40-75, Lymphocytes: 20-45', units: '%, %' },
      { test_id: 'neut_id', test_name: 'Neutrophils', reference_range: '40-75', units: '%' },
      { test_id: 'group_legacy', test_name: 'LIPID PROFILE (CHOLESTEROL, TRIGLYCERIDES)', reference_range: 'N/A', units: 'N/A' },
      { test_id: 'chol_id', test_name: 'CHOLESTEROL', reference_range: '130-200', units: 'mg/dL' },
      { test_id: 'other_id', test_name: 'Urine Routine', reference_range: 'Normal', units: 'N/A' }
    ];

    const customPatients = [
      {
        institute_id: 'P100',
        visit_id: 10,
        name: 'Deduplication Test Patient',
        age: 45,
        gender: 'Male',
        lab_tests: [
          { lab_test: 'CBC' },
          { lab_test: 'BLOOD Hb' }, // Redundant! Covered under CBC
          { lab_test: 'Neutrophils' }, // Redundant! Covered under BLOOD DLC which is under CBC
          { lab_test: 'LIPID PROFILE (CHOLESTEROL, TRIGLYCERIDES)' },
          { lab_test: 'CHOLESTEROL' }, // Redundant! Covered under LIPID PROFILE legacy naming
          { lab_test: 'Urine Routine' } // Not redundant!
        ]
      }
    ];

    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: customConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: customPatients, upcoming: [] } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    await act(async () => {
      renderComponent();
    });

    // Expand the patient modal
    const viewBtn = screen.getByRole('button', { name: /View Lab Order/i });
    await act(async () => {
      fireEvent.click(viewBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Deduplication Test Patient \(ID: P100\)/i)).toBeInTheDocument();
      
      // Group tests themselves must be present
      expect(screen.getAllByText('CBC').length).toBeGreaterThan(0);
      expect(screen.getAllByText('LIPID PROFILE (CHOLESTEROL, TRIGLYCERIDES)').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Urine Routine').length).toBeGreaterThan(0);

      // Verify that the redundant standalone tests (BLOOD Hb, CHOLESTEROL) only render once
      // (within their parent groups) instead of having separate standalone entry headers.
      expect(screen.getAllByText('BLOOD Hb').length).toBe(1);
      expect(screen.getAllByText('CHOLESTEROL').length).toBe(1);
    });
  });

  it('verifies per-test report upload options in the upload modal', async () => {
    const customConfig = [
      { test_id: 'group_1', test_name: 'CBC (Hemoglobin, WBC)', reference_range: 'N/A', units: 'N/A' },
      { test_id: 'hb_id', test_name: 'Hemoglobin', reference_range: '13-17', units: 'g/dL' },
      { test_id: 'other_id', test_name: 'Urine Routine', reference_range: 'Normal', units: 'N/A' }
    ];

    const customPatients = [
      {
        institute_id: 'P102',
        visit_id: 11,
        name: 'Upload Test Patient',
        age: 35,
        gender: 'Female',
        lab_tests: [
          { lab_test: 'CBC (Hemoglobin, WBC)', status: 'pending' },
          { lab_test: 'Urine Routine', status: 'completed' }
        ]
      }
    ];

    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: customConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: customPatients, upcoming: [] } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('/s3/upload-url')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ upload_url: 'http://fake-s3/upload', key: 'report-key' })
        });
      }
      if (url.includes('/s3/save-metadata')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('http://fake-s3/upload')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error('Fetch error'));
    });

    await act(async () => {
      renderComponent();
    });

    // Find and click the Upload Lab Report button
    const uploadBtn = screen.getByRole('button', { name: /Upload Lab Report/i });
    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText('Upload Lab Report').length).toBeGreaterThan(0);
      // Should show both tests
      expect(screen.getByText('CBC (Hemoglobin, WBC)')).toBeInTheDocument();
      expect(screen.getByText('Urine Routine')).toBeInTheDocument();

      // Urine Routine is completed, so it should show Completed badge and not have file input/upload button
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });
});
