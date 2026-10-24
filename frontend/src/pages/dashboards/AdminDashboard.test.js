import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminDashboard from './AdminDashboard';

// Mock Recharts to avoid ResponsiveContainer errors in JSDOM
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    AreaChart: () => <div>AreaChart</div>,
    BarChart: () => <div>BarChart</div>,
  };
});

// Mock axios for DashboardHome API call
jest.mock('axios');

// Mock child components to isolate AdminDashboard testing
jest.mock('../auth/CreateUser', () => () => <div>Mock CreateUser</div>);
jest.mock('../staff/UsersList', () => () => <div>Mock UsersList</div>);
jest.mock('../patients/PatientsList', () => () => <div>Mock PatientsList</div>);
jest.mock('../patients/BulkRegistration', () => () => <div>Mock BulkRegistration</div>);
jest.mock('../staff/ManageSchedule', () => () => <div>Mock ManageSchedule</div>);
jest.mock('../staff/DoctorSchedulePage', () => () => <div>Mock DoctorSchedulePage</div>);

describe('AdminDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderDashboard = (initialRoute = '/admin') => {
    return render(
      <ChakraProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/admin/*" element={<AdminDashboard username="Test Admin" onLogout={jest.fn()} />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders Sidebar and Header correctly', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard();

    expect(screen.getByText('BITS MED-C')).toBeInTheDocument();
    expect(screen.getByText('Welcome, Test Admin')).toBeInTheDocument();
  });

  it('shows the real overview by default instead of the old demo numbers', async () => {
    axios.get.mockResolvedValueOnce({ data: {
      date: '2026-10-25', generated_at: '2026-10-25T08:00:00+00:00', errors: [],
      appointments_today: { total: 7, open: 3, completed: 3, cancelled: 1, other: 0 },
      revenue: { today: 1500, bills_today: 4, yesterday: 900, bills_yesterday: 2 },
      trend: [], pending_bills: { total: 2, oldest_days: 9, over_7_days: 1 },
      lab_orders: { open: 1, by_status: { awaiting_payment: 1, pending: 0, in_progress: 0, partially_completed: 0 }, days: 30 },
      patients: { total: 40, new_this_week: 5, by_type: [{ name: 'Student', count: 40 }] },
      staff: { total: 6, by_role: { doctor: 3, receptionist: 1, lab_staff: 1, medical_store: 1 } },
      new_patients: [{ name: 'JOHN DOE', institute_id: '123', patient_type: 'Student', registered: '2026-10-25T09:00' }],
      attention: [],
    } });
    renderDashboard();

    expect(await screen.findByText("Today's appointments")).toBeInTheDocument();
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(axios.get.mock.calls[0][0]).toMatch(/\/api\/admin\/dashboard$/);
    // the made-up content is gone
    ['Hospital Survey', 'Patient Categories', 'Hospital Earning', 'New Patient List'].forEach((t) => expect(screen.queryByText(t)).not.toBeInTheDocument());
    // and the page no longer downloads every patient
    expect(axios.get.mock.calls.some(([u]) => /\/patients$/.test(u))).toBe(false);
  });

  it('navigates to create-user route', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard('/admin/create-user');
    expect(screen.getByText('Mock CreateUser')).toBeInTheDocument();
  });

  it('navigates to users-list route', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard('/admin/users-list');
    expect(screen.getByText('Mock UsersList')).toBeInTheDocument();
  });
  it('opens the Appointments page from the sidebar route instead of a blank screen', async () => {
    axios.get.mockResolvedValue({ data: {
      date: '2026-10-24', generated_at: 'x',
      counts: { booked: 1, confirmed: 0, checked_in: 0, consultation: 0, completed: 0, cancelled: 0, other: 0, total: 1 },
      active: [{ visit_id: 'v1', time: '2026-10-24T09:00', status: 'booked', institute_id: 'H1', patient_name: 'ANN LEE',
                 patient_type: 'Student', doctor_name: 'Dr. X', doctor_username: 'drx', booked_by: 'patient' }],
    } });
    renderDashboard('/admin/appointments');
    expect(await screen.findByText('Total today')).toBeInTheDocument();
    expect(screen.getByText('Ann Lee')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appointments' })).toBeInTheDocument();
  });
  it('opens the Lab Reports page from the Reports route instead of a blank screen', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/doctors') ? [] : {
      page: 1, limit: 25, total: 1, total_pages: 1, export_limit: 10000,
      summary: { awaiting_payment: 0, pending: 1, in_progress: 0, partially_completed: 0, completed: 0, cancelled: 0, total: 1 },
      rows: [{ visit_id: 'v1', time: '2026-10-24T09:00', status: 'pending', institute_id: 'H1', patient_name: 'ANN LEE', patient_type: 'Student',
               doctor_name: 'Dr. X', doctor_username: 'drx', tests_total: 2, tests_completed: 0, tests_cancelled: 0, report_files: 0, report_typed: 0 }],
    } }));
    renderDashboard('/admin/reports');
    expect(await screen.findByText('Ann Lee')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lab Reports' })).toBeInTheDocument();
  });
  it('opens the Billing page from the Billing route instead of a blank screen', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/filters') ? { doctors: [], payment_modes: [], patient_types: [] } : {
      page: 1, limit: 25, total: 1, total_pages: 1, export_limit: 10000,
      summary: { counts: { paid: 1, pending: 0, cancelled: 0, total: 1 }, paid_amount: { total: 50, reimbursed: 0, self_paid: 50 } },
      rows: [{ kind: 'bill', key: 'INV-1', date: '2026-10-24T09:00', status: 'paid', invoice_no: 'INV-1', institute_id: 'H1', patient_name: 'ANN LEE',
               patient_type: 'Student', doctor_name: 'Dr. X', category: 'medicine', payment_mode: 'UPI', item_count: 2,
               total_amount: 50, reimbursed_amount: 0, self_paid_amount: 50 }],
    } }));
    renderDashboard('/admin/billing');
    expect(await screen.findByText('Ann Lee')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Billing' })).toBeInTheDocument();
  });
});
