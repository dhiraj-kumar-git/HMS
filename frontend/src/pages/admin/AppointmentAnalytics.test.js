import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminAppointments from './AdminAppointments';
import { formatMinutes, formatLead } from './AppointmentAnalytics';

jest.mock('axios');
jest.mock('../../utils/utils', () => ({
  ...jest.requireActual('../../utils/utils'),
  getDateISTString: () => '2026-10-25',
}));
// draw the real charts at a fixed size (jsdom has no layout)
jest.mock('recharts', () => {
  const original = jest.requireActual('recharts');
  const ReactInMock = jest.requireActual('react');
  return {
    ...original,
    ResponsiveContainer: ({ children, height }) => ReactInMock.cloneElement(children, { width: 800, height: height || 260 }),
  };
});

// The same week the backend tests work out by hand: Mon 19 - Sun 25 Oct 2026
const DATA = {
  range: { start_date: '2026-10-19', end_date: '2026-10-25', days: 7 },
  totals: { total: 9, resolved: 5, open: 3, completed: 3, cancelled: 1, no_show: 1 },
  rates: { completion: 60.0, cancellation: 20.0, no_show: 20.0 },
  previous: { start_date: '2026-10-12', end_date: '2026-10-18', total: 6, change_pct: 50.0 },
  patients: { unique: 6, new: 5, returning: 1 },
  timing: { avg_lead_hours: 24.5, avg_turnaround_minutes: 25, median_turnaround_minutes: 25, turnaround_samples: 2 },
  status: [
    { status: 'booked', count: 1 }, { status: 'confirmed', count: 1 }, { status: 'checked_in', count: 1 },
    { status: 'consultation', count: 0 }, { status: 'completed', count: 3 }, { status: 'cancelled', count: 1 },
    { status: 'no_show', count: 1 }, { status: 'other', count: 1 },
  ],
  daily: [
    { date: '2026-10-19', total: 2, completed: 2, cancelled: 0 }, { date: '2026-10-20', total: 2, completed: 0, cancelled: 1 },
    { date: '2026-10-21', total: 2, completed: 0, cancelled: 0 }, { date: '2026-10-22', total: 1, completed: 0, cancelled: 0 },
    { date: '2026-10-23', total: 1, completed: 0, cancelled: 0 }, { date: '2026-10-24', total: 0, completed: 0, cancelled: 0 },
    { date: '2026-10-25', total: 1, completed: 1, cancelled: 0 },
  ],
  by_hour: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: { 9: 2, 10: 2, 11: 1, 12: 1, 14: 2, 16: 1 }[h] || 0 })),
  by_weekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((weekday, i) => ({ weekday, count: [2, 2, 2, 1, 1, 0, 1][i] })),
  booked_by: [{ booked_by: 'patient', count: 7 }, { booked_by: 'receptionist', count: 2 }],
  patient_types: [{ type: 'Student', count: 4 }, { type: 'Faculty', count: 2 }, { type: 'Staff', count: 1 }, { type: 'Dependant', count: 1 }, { type: 'Unknown', count: 1 }],
  doctors: [
    { username: 'drx', name: 'Dr. X', total: 5, completed: 3, cancelled: 0, no_show: 0, share_pct: 55.6, completion_rate: 100.0 },
    { username: 'dry', name: 'Dr. Y', total: 4, completed: 0, cancelled: 1, no_show: 1, share_pct: 44.4, completion_rate: 0.0 },
  ],
  busiest: { day: { date: '2026-10-19', total: 2, completed: 2, cancelled: 0 }, hour: { hour: 9, count: 2 } },
};
const EMPTY = {
  ...DATA, totals: { total: 0, resolved: 0, open: 0, completed: 0, cancelled: 0, no_show: 0 },
  rates: { completion: null, cancellation: null, no_show: null }, previous: { ...DATA.previous, total: 0, change_pct: null },
  patients: { unique: 0, new: 0, returning: 0 }, doctors: [], busiest: { day: null, hour: null },
};

const analyticsCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/appointments/analytics'));
const lastParams = () => analyticsCalls().at(-1)[1].params;

const openAnalytics = async (payload = DATA) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/appointments/analytics')) return payload instanceof Error ? Promise.reject(payload) : Promise.resolve({ data: payload });
    if (url.includes('/appointments/today')) return Promise.resolve({ data: { date: '2026-10-25', counts: {}, active: [] } });
    return Promise.resolve({ data: [] });
  });
  const view = render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
  fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
  if (!(payload instanceof Error)) await screen.findByText('Appointments', { selector: 'p, div, dt' }).catch(() => null);
  return view;
};

const card = (label) => screen.getByText(label, { selector: 'dt, .chakra-stat__label' }).closest('.chakra-stat');

describe('Admin Appointments - Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('loads nothing until the tab is opened, then the last 30 days ending today', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/appointments/analytics') ? DATA : { date: '2026-10-25', counts: {}, active: [] } }));
    render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
    await screen.findByText(/Active appointments/);
    expect(analyticsCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    await waitFor(() => expect(analyticsCalls()).toHaveLength(1));
    expect(lastParams()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25' });
    expect(analyticsCalls()[0][1].headers.Authorization).toBe('Bearer admin-token');
  });

  it('shows the headline figures', async () => {
    await openAnalytics();
    await screen.findByText('Completion rate', { selector: 'dt' });
    const text = (label) => card(label).textContent;
    expect(text('Appointments')).toContain('9');
    expect(text('Appointments')).toContain('▲ 50% vs previous 7 days (6)');
    expect(text('Patients')).toContain('6');
    expect(text('Patients')).toContain('5 new · 1 returning');
    expect(text('Completion rate')).toContain('60%');
    expect(text('Completion rate')).toContain('3 of 5 finished');
    expect(text('Cancellation rate')).toContain('20%');
    expect(text('No-show rate')).toContain('1 of 5 finished');
    expect(text('Still open')).toContain('3');
    expect(text('Booked ahead by')).toContain('24.5 h');
    expect(text('Scheduled start to done')).toContain('25 min');
    expect(text('Scheduled start to done')).toContain('median 25 min · 2 visits');
    expect(text('Busiest day')).toContain('19 Oct');
    expect(text('Busiest hour')).toContain('9 AM');
  });

  it('says so when the previous period had nothing to compare with, and when the count fell', async () => {
    await openAnalytics({ ...DATA, previous: { ...DATA.previous, total: 0, change_pct: null } });
    await screen.findByText('none in the previous period to compare');
  });

  it('shows a fall with a down arrow', async () => {
    await openAnalytics({ ...DATA, previous: { ...DATA.previous, total: 12, change_pct: -25 } });
    await screen.findByText('▼ 25% vs previous 7 days (12)');
  });

  it('draws the charts with a legend for the three lines', async () => {
    const { container } = await openAnalytics();
    await screen.findByText('Appointments per day');
    expect(container.querySelectorAll('svg.recharts-surface').length).toBeGreaterThanOrEqual(5);
    const legend = container.querySelector('.recharts-legend-wrapper');
    expect(legend.textContent).toContain('Total');
    expect(legend.textContent).toContain('Completed');
    expect(legend.textContent).toContain('Cancelled');
  });

  describe('every chart can be read as a table', () => {
    const toTable = (title) => {
      const heading = screen.getByText(title);
      const box = heading.closest('div[class*="css"]').parentElement.parentElement;
      fireEvent.click(within(box).getByRole('button', { name: 'View as table' }));
      return within(box).getByRole('table');
    };
    const cells = (table) => within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));

    beforeEach(async () => { await openAnalytics(); await screen.findByText('Appointments per day'); });

    it('daily appointments', () => {
      const rows = cells(toTable('Appointments per day'));
      expect(rows).toHaveLength(7);
      expect(rows[0]).toEqual(['Mon, 19 Oct 2026', '2', '2', '0']);
      expect(rows[1]).toEqual(['Tue, 20 Oct 2026', '2', '0', '1']);
      expect(rows[5]).toEqual(['Sat, 24 Oct 2026', '0', '0', '0']);
    });

    it('outcomes, with readable status names', () => {
      const rows = cells(toTable('Outcome of appointments'));
      expect(rows).toContainEqual(['Checked in', '1']);
      expect(rows).toContainEqual(['Completed', '3']);
      expect(rows).toContainEqual(['No show', '1']);
      expect(rows).toContainEqual(['In consultation', '0']);
    });

    it('busiest hours only run from the first to the last busy hour', () => {
      const rows = cells(toTable('Busiest hours'));
      expect(rows.map((r) => r[0])).toEqual(['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM']);
      expect(rows[0]).toEqual(['9 AM', '2']);
      expect(rows[4]).toEqual(['1 PM', '0']);
    });

    it('days of the week, Monday first, quiet days included', () => {
      const rows = cells(toTable('Busiest days of the week'));
      expect(rows[0]).toEqual(['Monday', '2']);
      expect(rows[5]).toEqual(['Saturday', '0']);
      expect(rows).toHaveLength(7);
    });

    it('who books and patient type', () => {
      expect(cells(toTable('Who books'))).toEqual([['Patient', '7'], ['Receptionist', '2']]);
      expect(cells(toTable('Patient type'))[0]).toEqual(['Student', '4']);
    });

    it('switches back to the chart', () => {
      const table = toTable('Who books');
      expect(table).toBeInTheDocument();
      const box = screen.getByText('Who books').closest('div[class*="css"]').parentElement.parentElement;
      fireEvent.click(within(box).getByRole('button', { name: 'View as chart' }));
      expect(within(box).queryByRole('table')).not.toBeInTheDocument();
    });
  });

  it('lists each doctor with share and completion rate', async () => {
    await openAnalytics();
    const table = await screen.findByRole('table', { name: 'Doctors' });
    const rows = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows[0]).toEqual(['Dr. X', '5', '55.6%', '3', '0', '0', '100%']);
    expect(rows[1]).toEqual(['Dr. Y', '4', '44.4%', '0', '1', '1', '0%']);
    expect(screen.getByText(/Rates are over finished appointments/)).toBeInTheDocument();
  });

  it('shows dashes instead of rates when nothing has finished yet', async () => {
    await openAnalytics({ ...DATA, totals: { ...DATA.totals, resolved: 0, completed: 0, cancelled: 0, no_show: 0 },
      rates: { completion: null, cancellation: null, no_show: null }, timing: { avg_lead_hours: null, avg_turnaround_minutes: null, median_turnaround_minutes: null, turnaround_samples: 0 } });
    await screen.findByText('Completion rate', { selector: 'dt' });
    expect(card('Completion rate').textContent).toContain('—');
    expect(card('Scheduled start to done').textContent).toContain('no completed visits with times');
    expect(card('Booked ahead by').textContent).toContain('—');
  });

  it('says so when the period is empty and shows no charts', async () => {
    const { container } = await openAnalytics(EMPTY);
    expect(await screen.findByText('No appointments in this period.')).toBeInTheDocument();
    expect(container.querySelector('svg.recharts-surface')).toBeNull();
  });

  describe('choosing the period', () => {
    beforeEach(async () => { await openAnalytics(); await screen.findByText('Completion rate', { selector: 'dt' }); });

    it('has the 30-day button selected at first', () => {
      expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'false');
    });

    it.each([[7, '2026-10-19'], [90, '2026-07-28']])('the %i-day button asks for that period', async (days, start) => {
      fireEvent.click(screen.getByRole('button', { name: `Last ${days} days` }));
      await waitFor(() => expect(lastParams()).toEqual({ start_date: start, end_date: '2026-10-25' }));
      expect(screen.getByRole('button', { name: `Last ${days} days` })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('From date')).toHaveValue(start);
    });

    it('custom dates are only used after Apply', async () => {
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
      fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-01-31' } });
      expect(analyticsCalls()).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
      await waitFor(() => expect(lastParams()).toEqual({ start_date: '2026-01-01', end_date: '2026-01-31' }));
      expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'false');
    });

    it.each([
      [{ s: '2026-11-01', e: '2026-10-01' }, 'The From date must not be after the To date.'],
      [{ s: '', e: '2026-10-01' }, 'Please choose both a From and a To date.'],
      [{ s: '2024-01-01', e: '2026-10-01' }, 'Please choose a period of 366 days or less.'],
    ])('refuses %j without asking the server', async ({ s, e }, message) => {
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: s } });
      fireEvent.change(screen.getByLabelText('To date'), { target: { value: e } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(analyticsCalls()).toHaveLength(1);
    });

    it('accepts exactly one year', async () => {
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2025-10-25' } });
      fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
      await waitFor(() => expect(analyticsCalls()).toHaveLength(2));
    });
  });

  describe('errors', () => {
    it('shows the server message and recovers on retry', async () => {
      axios.get.mockImplementation((url) => url.includes('/analytics')
        ? Promise.reject({ response: { status: 500, data: { error: 'Could not load the analytics' } } })
        : Promise.resolve({ data: { date: '2026-10-25', counts: {}, active: [] } }));
      render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
      fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
      expect(await screen.findByText('Could not load the analytics')).toBeInTheDocument();
      axios.get.mockImplementation(() => Promise.resolve({ data: DATA }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Completion rate', { selector: 'dt' })).toBeInTheDocument();
      expect(screen.queryByText('Could not load the analytics')).not.toBeInTheDocument();
    });

    it('uses a plain message when offline', async () => {
      await openAnalytics(new Error('Network Error'));
      expect(await screen.findByText('Could not load the analytics.')).toBeInTheDocument();
    });

    it('keeps the last good figures when a new period fails to load', async () => {
      await openAnalytics();
      await screen.findByText('Completion rate', { selector: 'dt' });
      axios.get.mockImplementation(() => Promise.reject(new Error('offline')));
      fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
      expect(await screen.findByText('Could not load the analytics.')).toBeInTheDocument();
      expect(screen.getByText('Completion rate', { selector: 'dt' })).toBeInTheDocument();
    });
  });

  it('is read-only', async () => {
    await openAnalytics();
    await screen.findByText('Completion rate', { selector: 'dt' });
    for (const label of [/confirm/i, /cancel/i, /delete/i, /edit/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('formatting', () => {
  it('minutes', () => {
    expect([formatMinutes(null), formatMinutes(0), formatMinutes(25), formatMinutes(60), formatMinutes(65), formatMinutes(125)])
      .toEqual(['—', '0 min', '25 min', '1 h', '1 h 5 min', '2 h 5 min']);
  });
  it('lead time switches to days from two days up', () => {
    expect([formatLead(undefined), formatLead(0.5), formatLead(24.5), formatLead(47.9), formatLead(48), formatLead(72)])
      .toEqual(['—', '0.5 h', '24.5 h', '47.9 h', '2.0 days', '3.0 days']);
  });
});
