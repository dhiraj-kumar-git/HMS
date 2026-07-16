import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import PatientLabReports from './PatientLabReports';

jest.mock('axios');

const mockDropdownConfig = [
  { test_name: 'CBC', test_id: 'CBC', reference_range: 'WBC:4-11,RBC:4.5-5.5', units: '10^9/L' },
  { test_name: 'Lipid Profile', test_id: 'Lipid Profile', reference_range: 'Cholesterol:<200', units: 'mg/dL' },
  { test_name: 'Thyroid Panel', test_id: 'Thyroid Panel', reference_range: 'TSH:0.4-4.0', units: 'mIU/L' }
];

// Mock data: two patients, three visits total with lab_reports
const mockReports = [
  {
    institute_id: 'P123',
    name: 'John Doe',
    age: 30,
    gender: 'Male',
    email: 'john@example.com',
    patient_type: 'Student',
    appointments: [
      {
        visit_id: 'V001',
        doctor_name: 'Dr. Smith',
        booked_at: '2026-06-01T08:00:00Z',
        lab_reports: [
          {
            test_name: 'CBC',
            timestamp: '2026-06-01T10:00:00Z',
            results: {
              WBC: { value: 5.5, reference_range: '4-11', units: '10^9/L' },
              RBC: { value: 4.8, reference_range: '4.5-5.5', units: '10^12/L' },
            },
            remarks: 'Normal results',
          },
        ],
      },
      {
        visit_id: 'V002',
        doctor_name: 'Dr. Jones',
        booked_at: '2026-07-10T09:00:00Z',
        lab_reports: [
          {
            test_name: 'Lipid Profile',
            timestamp: '2026-07-10T11:00:00Z',
            s3_key: 'reports/lipid.pdf',
            file_name: 'lipid_profile.pdf',
          },
        ],
      },
    ],
  },
  {
    institute_id: 'P124',
    name: 'Jane Doe',
    age: 25,
    gender: 'Female',
    email: 'jane@example.com',
    patient_type: 'Faculty',
    appointments: [
      {
        visit_id: 'V003',
        doctor_name: 'Dr. Smith',
        booked_at: '2026-07-05T08:00:00Z',
        lab_reports: [
          {
            test_name: 'Thyroid Panel',
            timestamp: '2026-07-05T10:00:00Z',
            results: {
              TSH: { value: 2.1, reference_range: '0.4-4.0', units: 'mIU/L' },
            },
            remarks: '',
          },
        ],
      },
    ],
  },
  {
    institute_id: 'P125',
    name: 'No Reports Patient',
    age: 40,
    gender: 'Male',
    email: 'noreport@example.com',
    patient_type: 'Student',
    appointments: [
      {
        visit_id: 'V004',
        doctor_name: 'Dr. Jones',
        booked_at: '2026-07-01T08:00:00Z',
        lab_reports: [],
      },
    ],
  },
];

describe('PatientLabReports Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    Storage.prototype.setItem = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) {
        return Promise.resolve({ data: mockDropdownConfig });
      }
      if (url.includes('/lab/reports')) {
        return Promise.resolve({ data: mockReports });
      }
      return Promise.reject(new Error('Unknown URL: ' + url));
    });
  });

  const renderComponent = () =>
    render(
      <ChakraProvider>
        <MemoryRouter>
          <PatientLabReports />
        </MemoryRouter>
      </ChakraProvider>
    );

  // ── 1. Renders page heading and fetches data ──────────────────────────────
  it('renders page heading and fetches visit rows', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getByText('Patient Lab Reports History')).toBeInTheDocument();
    });

    // Three visits with lab_reports (V001, V002, V003) — V004 has empty lab_reports and is excluded
    await waitFor(() => {
      const johnRows = screen.getAllByText('John Doe');
      expect(johnRows.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  // ── 2. One row per visit — patient with no lab_reports excluded ──────────
  it('renders one row per visit and excludes patients with no lab reports', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      // John Doe has 2 visits with lab_reports → 2 rows
      const johnRows = screen.getAllByText('John Doe');
      expect(johnRows.length).toBe(2);
      // 'No Reports Patient' should not appear (V004 has empty lab_reports)
      expect(screen.queryByText('No Reports Patient')).not.toBeInTheDocument();
    });
  });

  // ── 3. Report type badges in Detail Modal ─────────────────────────────────
  it('shows correct report type badges for file uploads and entered results in detail modal', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBe(2);
    });

    // Click View Details on first row (newest: V002 - Lipid, file)
    const viewBtns = screen.getAllByRole('button', { name: /View Details/i });
    await act(async () => {
      fireEvent.click(viewBtns[0]);
    });

    await waitFor(() => {
      // File upload badge in modal
      expect(screen.getByText('File Uploaded')).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByText('Close');
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // Click View Details on oldest row (oldest: V001 - CBC, entered)
    await act(async () => {
      fireEvent.click(viewBtns[viewBtns.length - 1]);
    });

    await waitFor(() => {
      // Results entered badge in modal
      expect(screen.getByText('Results Entered')).toBeInTheDocument();
    });
  });

  // ── 4. Search filter ──────────────────────────────────────────────────────
  it('filters rows by patient name search', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/Search name, ID, test/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Jane' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  // ── 5. Search filter by institute ID ────────────────────────────────────
  it('filters rows by institute ID', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/Search name, ID, test/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'P124' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  // ── 6. Opens detail modal and shows visit info strip ─────────────────────
  it('opens the detail modal with visit info when View Details is clicked', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    const viewBtns = screen.getAllByRole('button', { name: /View Details/i });
    await act(async () => {
      fireEvent.click(viewBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Visit ID:/i)).toBeInTheDocument();
      const labReportsTexts = screen.getAllByText(/Lab Reports/i);
      expect(labReportsTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 7. Detail modal — manually entered results table ────────────────────
  it('shows results table in detail modal for manually-entered reports', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    // V001 is CBC (manually entered). Sort is newest first so V002 (Lipid, file) row is row 0.
    // Find the CBC row specifically by test name in the table
    await waitFor(() => {
      expect(screen.getByText(/CBC/)).toBeInTheDocument();
    });

    // Open oldest row which should be CBC (entered)
    const viewBtns = screen.getAllByRole('button', { name: /View Details/i });
    await act(async () => {
      fireEvent.click(viewBtns[viewBtns.length - 1]);
    });

    await waitFor(() => {
      expect(screen.getByText('WBC')).toBeInTheDocument();
      expect(screen.getByText('5.5')).toBeInTheDocument();
      expect(screen.getByText('4-11')).toBeInTheDocument();
      expect(screen.getByText('Results Entered')).toBeInTheDocument();
    });
  });

  // ── 8. Detail modal — file upload rows show View File button ────────────
  it('shows View File button in detail modal for file-upload reports', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    // First row (newest) is V002 = Lipid Profile (file upload)
    const viewBtns = screen.getAllByRole('button', { name: /View Details/i });
    await act(async () => {
      fireEvent.click(viewBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/File Uploaded/i)).toBeInTheDocument();
      expect(screen.getByText(/lipid_profile\.pdf/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View File/i })).toBeInTheDocument();
    });
  });

  // ── 9. Email button disabled for file-only rows ──────────────────────────
  it('disables the Email button for rows with only file-upload reports', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    // V002 = Lipid Profile file only → Email should be disabled
    // V001 = CBC entered → Email should be enabled
    const emailBtns = screen.getAllByRole('button', { name: /^Email$/i });
    const disabledEmailBtns = emailBtns.filter((btn) => btn.hasAttribute('disabled'));
    expect(disabledEmailBtns.length).toBeGreaterThanOrEqual(1);
  });

  // ── 10. Email sends PDF for manually-entered results ─────────────────────
  it('sends email with PDF for visits with manually-entered results', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: 'success' } });

    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    const emailBtns = screen.getAllByRole('button', { name: /^Email$/i });
    const enabledEmailBtn = emailBtns.find((btn) => !btn.hasAttribute('disabled'));
    expect(enabledEmailBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(enabledEmailBtn);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/lab/send_email'),
        expect.objectContaining({
          recipient_email: 'jane@example.com',
          subject: expect.stringContaining('Lab Reports'),
          pdf_base64: expect.any(String),
        }),
        expect.any(Object)
      );
    });
  });

  // ── 11. Refresh button triggers re-fetch ─────────────────────────────────
  it('refresh button triggers a new data fetch', async () => {
    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
    });

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    axios.get.mockImplementationOnce((url) => Promise.resolve({ data: [] }));

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/No lab report history found/i)).toBeInTheDocument();
    });
  });

  // ── 12. Empty state ───────────────────────────────────────────────────────
  it('shows empty state when no lab reports exist', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/dropdown/labtests')) {
        return Promise.resolve({ data: mockDropdownConfig });
      }
      return Promise.resolve({ data: [] });
    });

    await act(async () => { renderComponent(); });

    await waitFor(() => {
      expect(screen.getByText(/No lab report history found/i)).toBeInTheDocument();
    });
  });
});
