import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import axios from 'axios';
import DashboardOverview from './DashboardOverview';

jest.mock('axios');
// draw the real charts at a fixed size (jsdom has no layout)
jest.mock('recharts', () => {
  const original = jest.requireActual('recharts');
  const ReactInMock = jest.requireActual('react');
  return {
    ...original,
    ResponsiveContainer: ({ children, height }) => ReactInMock.cloneElement(children, { width: 800, height: height || 220 }),
  };
});

const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 12 + i));
  return { date: d.toISOString().slice(0, 10), appointments: i % 3, revenue: i * 100.5, bills: i % 2 };
});
const DATA = {
  date: '2026-10-25', generated_at: '2026-10-25T08:00:00+00:00', errors: [],
  appointments_today: { total: 5, open: 2, completed: 1, cancelled: 1, other: 1 },
  revenue: { today: 1234567.5, bills_today: 1, yesterday: 900, bills_yesterday: 2 },
  trend: days,
  pending_bills: { total: 3, oldest_days: 60, over_7_days: 2 },
  lab_orders: { open: 2, by_status: { awaiting_payment: 1, pending: 1, in_progress: 0, partially_completed: 0 }, days: 30 },
  patients: { total: 10, new_this_week: 3, by_type: [{ name: 'Student', count: 6 }, { name: 'Faculty', count: 3 }, { name: 'Unknown', count: 1 }] },
  staff: { total: 5, by_role: { doctor: 2, receptionist: 1, lab_staff: 1, medical_store: 1 } },
  new_patients: [
    { name: 'DI EVE', institute_id: 'H4', patient_type: 'Staff', registered: '2026-10-25T09:30' },
    { name: null, institute_id: 'H7', patient_type: null, registered: '' },
  ],
  attention: [
    { key: 'left_open', label: 'Appointments from the last 30 days still open', count: 3, link: 'appointments' },
    { key: 'old_bills', label: 'Bills pending for more than 7 days', count: 2, link: 'billing' },
    { key: 'lab_unpaid', label: 'Lab orders waiting for payment', count: 1, link: 'reports' },
  ],
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const open = async (payload = DATA) => {
  axios.get.mockImplementation(() => (payload instanceof Error ? Promise.reject(payload) : Promise.resolve({ data: payload })));
  render(
    <ChakraProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<DashboardOverview />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>
  );
  if (!(payload instanceof Error)) await screen.findByText("Today's appointments");
};
const card = (label) => screen.getByText(label, { selector: 'p' }).closest('button');

describe('Admin Dashboard overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('asks the server once, with the login token', async () => {
    await open();
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][0]).toMatch(/\/api\/admin\/dashboard$/);
    expect(axios.get.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token');
  });

  it('shows the date and when it was updated, in India time', async () => {
    await open();
    expect(screen.getByText('Sun, 25 Oct 2026 · updated 13:30')).toBeInTheDocument();
  });

  it('shows the six headline cards', async () => {
    await open();
    expect(card("Today's appointments")).toHaveTextContent('5');
    expect(card("Today's appointments")).toHaveTextContent('2 still open · 1 completed · 1 cancelled');
    expect(card('Revenue today')).toHaveTextContent('₹12,34,567.50');
    expect(card('Revenue today')).toHaveTextContent('1 paid bill · yesterday ₹900.00');
    expect(card('Pending bills')).toHaveTextContent('3');
    expect(card('Pending bills')).toHaveTextContent('oldest 60 days · 2 over a week');
    expect(card('Lab orders needing action')).toHaveTextContent('2');
    expect(card('Lab orders needing action')).toHaveTextContent('1 waiting for payment · last 30 days');
    expect(card('Patients')).toHaveTextContent('10');
    expect(card('Patients')).toHaveTextContent('3 new this week');
    expect(card('Staff accounts')).toHaveTextContent('5');
    expect(card('Staff accounts')).toHaveTextContent('2 doctors · 1 reception · 1 lab · 1 store');
  });

  it('says so when nothing is pending', async () => {
    await open({ ...DATA, pending_bills: { total: 0, oldest_days: null, over_7_days: 0 } });
    expect(card('Pending bills')).toHaveTextContent('nothing waiting to be billed');
  });

  it.each([
    ["Today's appointments", '/admin/appointments'], ['Revenue today', '/admin/billing'], ['Pending bills', '/admin/billing'],
    ['Lab orders needing action', '/admin/reports'], ['Patients', '/admin/patients-list'], ['Staff accounts', '/admin/users-list'],
  ])('the %s card opens %s', async (label, path) => {
    await open();
    fireEvent.click(card(label));
    expect(await screen.findByTestId('where')).toHaveTextContent(path);
  });

  it('draws the two 14-day lines and the patient-type bars', async () => {
    await open();
    expect(screen.getByRole('img', { name: 'Appointments, last 14 days' }).querySelectorAll('.recharts-line-curve')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Revenue, last 14 days' }).querySelectorAll('.recharts-line-curve')).toHaveLength(1);
    expect(document.querySelectorAll('svg.recharts-surface')).toHaveLength(3);
  });

  describe('charts can be read as tables', () => {
    const asTable = (title) => {
      const section = screen.getByText(title, { selector: 'p' }).closest('div').parentElement;
      fireEvent.click(within(section).getByRole('button', { name: 'View as table' }));
      return within(screen.getByRole('table', { name: `${title} (table)` }));
    };
    const cellsOf = (t) => t.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));

    it('appointments', async () => {
      await open();
      const rows = cellsOf(asTable('Appointments, last 14 days'));
      expect(rows).toHaveLength(14);
      expect(rows[0]).toEqual(['Mon, 12 Oct 2026', '0']);
      expect(rows[13]).toEqual(['Sun, 25 Oct 2026', '1']);
    });
    it('revenue, with the bills that made it', async () => {
      await open();
      const rows = cellsOf(asTable('Revenue, last 14 days'));
      expect(rows[1]).toEqual(['Tue, 13 Oct 2026', '₹100.50', '1']);
      expect(rows[13]).toEqual(['Sun, 25 Oct 2026', '₹1,306.50', '1']);
    });
    it('patient types', async () => {
      await open();
      expect(cellsOf(asTable('Patients by type'))).toEqual([['Student', '6'], ['Faculty', '3'], ['Unknown', '1']]);
    });
  });

  describe('needs attention', () => {
    it('lists the counts and opens the page that has the details', async () => {
      await open();
      const row = screen.getByRole('button', { name: 'Bills pending for more than 7 days: open' });
      expect(row).toHaveTextContent('2');
      expect(screen.getByRole('button', { name: 'Appointments from the last 30 days still open: open' })).toHaveTextContent('3');
      fireEvent.click(row);
      expect(await screen.findByTestId('where')).toHaveTextContent('/admin/billing');
    });
    it('says all clear when every count is zero', async () => {
      await open({ ...DATA, attention: DATA.attention.map((i) => ({ ...i, count: 0 })) });
      expect(screen.getByText('All clear. Nothing is waiting.')).toBeInTheDocument();
    });
    it('shows a dash, not a zero, for a number that could not be worked out', async () => {
      await open({ ...DATA, attention: [{ ...DATA.attention[0], count: null }, DATA.attention[1]] });
      expect(screen.getByRole('button', { name: 'Appointments from the last 30 days still open: open' })).toHaveTextContent('—');
      expect(screen.queryByText('All clear. Nothing is waiting.')).not.toBeInTheDocument();
    });
  });

  describe('newest patients', () => {
    it('lists them with name, ID, type and when they registered', async () => {
      await open();
      const rows = within(screen.getByRole('table', { name: 'Newest patients' })).getAllByRole('row').slice(1);
      expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Di Eve', 'H4', 'Staff', expect.stringContaining('25')]);
      expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Unknown patient', 'H7', '—', '—']);
    });
    it('shows no address, disease or phone, and has a link to the full list', async () => {
      await open();
      expect(within(screen.getByRole('table', { name: 'Newest patients' })).queryByRole('columnheader', { name: /address|disease|phone/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'View all patients' }));
      expect(await screen.findByTestId('where')).toHaveTextContent('/admin/patients-list');
    });
    it('says so when there are none', async () => {
      await open({ ...DATA, new_patients: [] });
      expect(screen.getByText('No patients registered yet.')).toBeInTheDocument();
    });
  });

  describe('when part of it fails', () => {
    it('shows the other parts and says which could not be loaded', async () => {
      await open({ ...DATA, revenue: null, trend: null, patients: null, errors: ['trend', 'patients'] });
      expect(card('Revenue today')).toHaveTextContent('—');
      expect(card('Revenue today')).toHaveTextContent('Could not be loaded');
      expect(screen.getByText('The appointment trend could not be loaded.')).toBeInTheDocument();
      expect(screen.getByText('The revenue trend could not be loaded.')).toBeInTheDocument();
      expect(screen.getByText('Patients by type could not be loaded.')).toBeInTheDocument();
      expect(card("Today's appointments")).toHaveTextContent('5');
      expect(screen.getByText('Di Eve')).toBeInTheDocument();
    });
  });

  describe('refresh and errors', () => {
    it('Refresh asks again', async () => {
      await open();
      fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
      await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    });

    it('shows the server message and recovers on retry', async () => {
      axios.get.mockImplementation(() => Promise.reject({ response: { status: 500, data: { error: 'Could not load the dashboard' } } }));
      render(<ChakraProvider><MemoryRouter><DashboardOverview /></MemoryRouter></ChakraProvider>);
      expect(await screen.findByText('Could not load the dashboard')).toBeInTheDocument();
      axios.get.mockImplementation(() => Promise.resolve({ data: DATA }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText("Today's appointments")).toBeInTheDocument();
      expect(screen.queryByText('Could not load the dashboard')).not.toBeInTheDocument();
    });

    it('uses a plain message when offline', async () => {
      await open(new Error('Network Error'));
      expect(await screen.findByText('Could not load the dashboard.')).toBeInTheDocument();
    });

    it('keeps the last good figures when a refresh fails', async () => {
      await open();
      axios.get.mockImplementation(() => Promise.reject(new Error('x')));
      fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
      expect(await screen.findByText('Could not load the dashboard.')).toBeInTheDocument();
      expect(card("Today's appointments")).toHaveTextContent('5');
    });

    it('copes with an unexpected reply', async () => {
      await open([]);
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(card('Patients')).toHaveTextContent('Could not be loaded');
    });
  });

  it('only reads: it never posts, puts or deletes anything', async () => {
    await open();
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.delete).not.toHaveBeenCalled();
  });
});
