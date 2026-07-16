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

    // Click "Save Report Details" — should open the confirmation modal
    const saveBtn = screen.getByRole('button', { name: /Save Report Details/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Confirmation modal should now be visible
    await waitFor(() => {
      expect(screen.getByText(/Confirm Save Report Details/i)).toBeInTheDocument();
      expect(screen.getByText(/Have you entered all the required fields before saving/i)).toBeInTheDocument();
    });

    // Click "Confirm & Save" to actually trigger the save
    axios.post.mockResolvedValueOnce({ data: { message: 'success' } });
    const confirmSaveBtn = screen.getByRole('button', { name: /Confirm & Save/i });
    await act(async () => {
      fireEvent.click(confirmSaveBtn);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/lab/save_draft'),
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

  it('verifies report completion workflow checkmark visibility, modal display, and API submission', async () => {
    const customConfig = [
      { test_id: 'hb_id', test_name: 'Hemoglobin', reference_range: '13-17', units: 'g/dL' }
    ];

    const customPatients = [
      {
        institute_id: 'P_INCOMPLETE',
        visit_id: 101,
        name: 'Incomplete Patient',
        age: 30,
        gender: 'Male',
        lab_tests: [{ lab_test: 'Hemoglobin' }],
        lab_results_draft: {}, // empty
        lab_reports: []
      },
      {
        institute_id: 'P_COMPLETE_VAL',
        visit_id: 102,
        name: 'Complete Val Patient',
        age: 40,
        gender: 'Female',
        lab_tests: [{ lab_test: 'Hemoglobin' }],
        lab_results_draft: { 'Hemoglobin': { value: '14.5', reference_range: '13-17', units: 'g/dL' } },
        lab_reports: []
      },
      {
        institute_id: 'P_COMPLETE_FILE',
        visit_id: 103,
        name: 'Complete File Patient',
        age: 50,
        gender: 'Male',
        lab_tests: [{ lab_test: 'Hemoglobin' }],
        lab_results_draft: {},
        lab_reports: [{ test_name: 'Hemoglobin', file_name: 'hb.pdf', s3_key: 'key1' }]
      }
    ];

    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: customConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: customPatients, upcoming: [] } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    axios.post.mockResolvedValue({ data: { message: 'Lab report completed successfully' } });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Incomplete Patient')).toBeInTheDocument();
      expect(screen.getByText('Complete Val Patient')).toBeInTheDocument();
      expect(screen.getByText('Complete File Patient')).toBeInTheDocument();
    });

    // Checkmark button (labeled 'Complete Lab Test Report' via aria-label/title)
    // should NOT render for Incomplete Patient (only P_COMPLETE_VAL and P_COMPLETE_FILE)
    const checkBtns = screen.getAllByRole('button', { name: /Complete Lab Test Report/i });
    expect(checkBtns.length).toBe(2); // One for P_COMPLETE_VAL, one for P_COMPLETE_FILE

    // Click checkmark button for P_COMPLETE_VAL
    await act(async () => {
      fireEvent.click(checkBtns[0]);
    });

    // Verify modal is shown
    await waitFor(() => {
      expect(screen.getByText('Confirm Lab Test Report Completion')).toBeInTheDocument();
      expect(screen.getAllByText('Complete Val Patient').length).toBeGreaterThan(0);
      expect(screen.getByText('Results Entered')).toBeInTheDocument();
    });

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Complete Report/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/lab/complete_patient_report'),
        expect.objectContaining({
          institute_id: 'P_COMPLETE_VAL',
          visit_id: 102
        }),
        expect.any(Object)
      );
    });
  });

  it('verifies exclusivity rules, checkmark headers, and file view/delete operations', async () => {
    const customConfig = [
      { test_id: 'hb_id', test_name: 'Hemoglobin', reference_range: '13-17', units: 'g/dL' },
      { test_id: 'tlc_id', test_name: 'WBC', reference_range: '4000-11000', units: '/cumm' }
    ];

    const customPatients = [
      {
        institute_id: 'P_EXCLUSIVITY',
        visit_id: 104,
        name: 'Exclusivity Patient',
        age: 32,
        gender: 'Male',
        lab_tests: [
          { lab_test: 'Hemoglobin', status: 'pending' },
          { lab_test: 'WBC', status: 'pending' }
        ],
        lab_results_draft: {
          'Hemoglobin': { value: '15.0', reference_range: '13-17', units: 'g/dL' }
        },
        lab_reports: [
          { test_name: 'WBC', file_name: 'wbc.pdf', s3_key: 'wbc-key' }
        ]
      }
    ];

    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) return Promise.resolve({ data: customConfig });
      if (url.includes('/lab/patients')) return Promise.resolve({ data: { confirmed: customPatients, upcoming: [] } });
      return Promise.resolve({ data: { confirmed: [], upcoming: [] } });
    });

    axios.delete.mockResolvedValue({ data: { message: 'Lab report file deleted successfully' } });

    await act(async () => {
      renderComponent();
    });

    // 1. Open View Lab Order Modal
    const viewBtn = screen.getByRole('button', { name: /View Lab Order/i });
    await act(async () => {
      fireEvent.click(viewBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText('Hemoglobin').length).toBeGreaterThan(0);
      expect(screen.getAllByText('WBC').length).toBeGreaterThan(0);
    });

    // Check complete badges on accordion headers
    // Hemoglobin is complete due to draft value
    // WBC is complete due to S3 file upload
    const completeBadges = screen.getAllByText('Complete');
    expect(completeBadges.length).toBe(2);

    // WBC has a file, so its inputs should be disabled
    // Let's find the inputs inside the WBC accordion panel.
    // In our mock, Hemoglobin input should be enabled, and WBC input should be disabled.
    const inputs = screen.getAllByRole('textbox');
    // The Hemoglobin input is first, WBC input is second
    expect(inputs[0]).not.toBeDisabled();
    expect(inputs[1]).toBeDisabled();

    // Check presence of View File button inside WBC panel
    expect(screen.getByRole('button', { name: /View File/i })).toBeInTheDocument();

    // Close the View Lab Order Modal
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);

    // 2. Open Upload Lab Report Modal
    const uploadBtn = screen.getByRole('button', { name: /Upload Lab Report/i });
    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => {
      // Hemoglobin has draft values, so it should display the note:
      expect(screen.getByText(/All values were entered manually. Clear values inside 'View Lab Order' first to upload a file./i)).toBeInTheDocument();
      
      // WBC has a file uploaded, so it should show the file name and the Delete File option
      expect(screen.getByText(/wbc.pdf/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Delete File/i })).toBeInTheDocument();
    });

    // 3. Delete the file
    const deleteBtn = screen.getByRole('button', { name: /Delete File/i });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Confirm File Deletion')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm Delete/i })).toBeInTheDocument();
    });

    const confirmDeleteBtn = screen.getByRole('button', { name: /Confirm Delete/i });
    await act(async () => {
      fireEvent.click(confirmDeleteBtn);
    });

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/lab/delete_report'),
        expect.objectContaining({
          data: expect.objectContaining({
            visit_id: 104,
            s3_key: 'wbc-key',
            test_name: 'WBC'
          })
        })
      );
    });
  });
});
