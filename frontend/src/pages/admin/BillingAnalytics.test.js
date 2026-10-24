import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminBilling from './AdminBilling';
import { shortRupees, changeText } from './BillingAnalytics';

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

// the same numbers the backend tests work out by hand (4 bills, 2 to 6 Oct)
const DATA = {
  start_date: '2026-10-02', end_date: '2026-10-06', day_count: 5,
  kpis: { revenue: 375.5, bills: 4, average_bill: 93.88, reimbursed: 270, self_paid: 105.5 },
  previous: { start_date: '2026-09-27', end_date: '2026-10-01', revenue: 250, bills: 2, average_bill: 125 },
  revenue_per_day: [
    { date: '2026-10-02', revenue: 100, bills: 1 }, { date: '2026-10-03', revenue: 50, bills: 1 }, { date: '2026-10-04', revenue: 225.5, bills: 2 },
    { date: '2026-10-05', revenue: 0, bills: 0 }, { date: '2026-10-06', revenue: 0, bills: 0 },
  ],
  by_category: [
    { name: 'medicine', label: 'Medicines', revenue: 300, bills: 2 }, { name: 'lab_test', label: 'Lab tests', revenue: 75.5, bills: 2 },
  ],
  by_payment_mode: [{ name: 'UPI', revenue: 325.5, bills: 3 }, { name: 'Cash', revenue: 50, bills: 1 }],
  by_patient_type: [{ name: 'Faculty', revenue: 300, bills: 2 }, { name: 'Student', revenue: 50, bills: 1 }, { name: 'Not recorded', revenue: 25.5, bills: 1 }],
  tax_and_discount: { gst_collected: 36, lab_discounts: 75.5, round_off: -0.2 },
  by_doctor: { top: [{ name: 'Dr. X', revenue: 300, bills: 2 }, { name: 'Dr. Y', revenue: 50, bills: 1 }], others: { doctors: 0, revenue: 0, bills: 0 } },
  unpaid_in_period: { pending: 3, cancelled: 1 },
  pending_backlog: {
    total: 8, oldest_days: 31,
    buckets: [{ label: '0–2 days', count: 2 }, { label: '3–7 days', count: 2 }, { label: '8–14 days', count: 1 }, { label: '15–30 days', count: 2 }, { label: 'Over 30 days', count: 1 }],
  },
};
const EMPTY = {
  ...DATA, kpis: { revenue: 0, bills: 0, average_bill: 0, reimbursed: 0, self_paid: 0 }, previous: { ...DATA.previous, revenue: 0, bills: 0, average_bill: 0 },
  revenue_per_day: DATA.revenue_per_day.map((d) => ({ ...d, revenue: 0, bills: 0 })), by_payment_mode: [], by_patient_type: [],
  by_category: DATA.by_category.map((c) => ({ ...c, revenue: 0, bills: 0 })), tax_and_discount: { gst_collected: 0, lab_discounts: 0, round_off: 0 },
  by_doctor: { top: [], others: { doctors: 0, revenue: 0, bills: 0 } }, unpaid_in_period: { pending: 0, cancelled: 0 },
  pending_backlog: { total: 0, oldest_days: null, buckets: DATA.pending_backlog.buckets.map((b) => ({ ...b, count: 0 })) },
};

const analyticsCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/billing/analytics'));
const lastParams = () => analyticsCalls().at(-1)[1].params;

const openAnalytics = async (payload = DATA) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/billing/analytics')) return payload instanceof Error ? Promise.reject(payload) : Promise.resolve({ data: payload });
    if (url.includes('/billing/search')) {
      return Promise.resolve({ data: { page: 1, limit: 25, total: 0, total_pages: 1, export_limit: 10000, rows: [],
        summary: { counts: { paid: 0, pending: 0, cancelled: 0, total: 0 }, paid_amount: { total: 0, reimbursed: 0, self_paid: 0 } } } });
    }
    return Promise.resolve({ data: { doctors: [], payment_modes: [], patient_types: [] } });
  });
  const view = render(<ChakraProvider><AdminBilling /></ChakraProvider>);
  fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
  if (!(payload instanceof Error)) await waitFor(() => expect(analyticsCalls().length).toBeGreaterThan(0));
  return view;
};
const card = (label) => screen.getByText(label, { selector: 'dt, .chakra-stat__label' }).closest('.chakra-stat');

describe('Admin Billing - Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('loads nothing until the tab is opened, then the last 30 days ending today', async () => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/search')
      ? { page: 1, limit: 25, total: 0, total_pages: 1, export_limit: 10000, rows: [], summary: { counts: { paid: 0, pending: 0, cancelled: 0, total: 0 }, paid_amount: { total: 0, reimbursed: 0, self_paid: 0 } } }
      : { doctors: [], payment_modes: [], patient_types: [] } }));
    render(<ChakraProvider><AdminBilling /></ChakraProvider>);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(analyticsCalls()).toHaveLength(0);
    axios.get.mockImplementation(() => Promise.resolve({ data: DATA }));
    fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
    await waitFor(() => expect(analyticsCalls()).toHaveLength(1));
    expect(lastParams()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25' });
    expect(analyticsCalls()[0][1].headers.Authorization).toBe('Bearer admin-token');
  });

  it('shows the headline figures with how they compare to the period before', async () => {
    await openAnalytics();
    expect(await screen.findByText('₹375.50')).toBeInTheDocument();
    expect(card('Revenue')).toHaveTextContent('▲ 50.2% vs previous 5 days (₹250.00)');
    expect(card('Paid bills')).toHaveTextContent('4');
    expect(card('Paid bills')).toHaveTextContent('▲ 100% vs previous 5 days (2)');
    expect(card('Average bill')).toHaveTextContent('₹93.88');
    expect(card('Average bill')).toHaveTextContent('▼ 24.9% vs previous 5 days (₹125.00)');
    expect(card('Reimbursed by the institute')).toHaveTextContent('₹270.00');
    expect(card('Reimbursed by the institute')).toHaveTextContent('71.9% of revenue');
    expect(card('Paid by patients')).toHaveTextContent('₹105.50');
    expect(card('Paid by patients')).toHaveTextContent('28.1% of revenue');
  });

  it('shows GST, lab discounts, round-off and the pending and cancelled counts', async () => {
    await openAnalytics();
    await screen.findByText('₹375.50');
    expect(card('GST collected')).toHaveTextContent('₹36.00');
    expect(card('Lab discounts given')).toHaveTextContent('₹75.50');
    expect(card('Round-off')).toHaveTextContent('-₹0.20');
    expect(card('Pending in this period')).toHaveTextContent('3');
    expect(card('Cancelled in this period')).toHaveTextContent('1');
    expect(screen.getByText(/Money figures count paid bills only/)).toBeInTheDocument();
  });

  it('says there is nothing to compare when the previous period was empty', async () => {
    await openAnalytics({ ...DATA, previous: { ...DATA.previous, revenue: 0, bills: 0, average_bill: 0 } });
    await screen.findByText('₹375.50');
    expect(card('Revenue')).toHaveTextContent('nothing in the previous period to compare');
  });

  it('draws the daily revenue line', async () => {
    await openAnalytics();
    await screen.findByText('₹375.50');
    const img = screen.getByRole('img', { name: 'Revenue per day' });
    expect(img.querySelectorAll('.recharts-line-curve')).toHaveLength(1);
    expect(document.querySelectorAll('svg.recharts-surface')).toHaveLength(6);      // daily line + five bar charts
  });

  describe('every chart can be read as a table', () => {
    const asTable = async (title) => {
      await openAnalytics();
      await screen.findByText('₹375.50');
      const section = screen.getByText(title, { selector: 'p' }).closest('div').parentElement;
      fireEvent.click(within(section).getByRole('button', { name: 'View as table' }));
      return within(screen.getByRole('table', { name: `${title} (table)` }));
    };
    const cellsOf = (t) => t.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));

    it('daily revenue, quiet days included', async () => {
      const t = await asTable('Revenue per day');
      expect(cellsOf(t)).toEqual([['Fri, 2 Oct 2026', '₹100.00', '1'], ['Sat, 3 Oct 2026', '₹50.00', '1'], ['Sun, 4 Oct 2026', '₹225.50', '2'],
        ['Mon, 5 Oct 2026', '₹0.00', '0'], ['Tue, 6 Oct 2026', '₹0.00', '0']]);
    });
    it('medicines and lab tests', async () => {
      expect(cellsOf(await asTable('Medicines and lab tests'))).toEqual([['Medicines', '₹300.00', '2'], ['Lab tests', '₹75.50', '2']]);
    });
    it('payment mode', async () => {
      expect(cellsOf(await asTable('By payment mode'))).toEqual([['UPI', '₹325.50', '3'], ['Cash', '₹50.00', '1']]);
    });
    it('reimbursed and paid by patients, with shares', async () => {
      expect(cellsOf(await asTable('Reimbursed and paid by patients'))).toEqual([
        ['Reimbursed by the institute', '₹270.00', '71.9%'], ['Paid by patients', '₹105.50', '28.1%']]);
    });
    it('patient type', async () => {
      expect(cellsOf(await asTable('By patient type'))).toEqual([['Faculty', '₹300.00', '2'], ['Student', '₹50.00', '1'], ['Not recorded', '₹25.50', '1']]);
    });
    it('doctors', async () => {
      expect(cellsOf(await asTable('Revenue by doctor'))).toEqual([['Dr. X', '₹300.00', '2'], ['Dr. Y', '₹50.00', '1']]);
    });
    it('waiting bills by age', async () => {
      expect(cellsOf(await asTable('Bills waiting to be paid'))).toEqual([['0–2 days', '2'], ['3–7 days', '2'], ['8–14 days', '1'], ['15–30 days', '2'], ['Over 30 days', '1']]);
    });
    it('switches back to the chart', async () => {
      await asTable('By payment mode');
      const section = screen.getByText('By payment mode', { selector: 'p' }).closest('div').parentElement;
      fireEvent.click(within(section).getByRole('button', { name: 'View as chart' }));
      expect(screen.queryByRole('table', { name: 'By payment mode (table)' })).not.toBeInTheDocument();
    });
  });

  it('draws the reimbursed / paid-by-patients bar in proportion', async () => {
    await openAnalytics();
    await screen.findByText('₹375.50');
    expect(screen.getByTestId('split-reimbursed')).toHaveStyle({ width: `${(270 / 375.5) * 100}%` });
    expect(screen.getByTestId('split-self_paid')).toHaveStyle({ width: `${(105.5 / 375.5) * 100}%` });
  });

  it('describes the backlog and sums the doctors beyond the top ten', async () => {
    await openAnalytics({ ...DATA, by_doctor: { top: DATA.by_doctor.top, others: { doctors: 3, revenue: 267, bills: 3 } } });
    await screen.findByText('₹375.50');
    expect(screen.getByText('8 pending now, by how long ago the visit was · oldest 31 days')).toBeInTheDocument();
    expect(screen.getByText('The 2 highest; the rest are added together')).toBeInTheDocument();
    const section = screen.getByText('Revenue by doctor', { selector: 'p' }).closest('div').parentElement;
    fireEvent.click(within(section).getByRole('button', { name: 'View as table' }));
    expect(within(screen.getByRole('table', { name: 'Revenue by doctor (table)' })).getByText('3 other doctors')).toBeInTheDocument();
  });

  it('an empty period says so and draws no charts', async () => {
    await openAnalytics(EMPTY);
    expect(await screen.findByText('No bills in this period.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('still shows the pending backlog when nothing was paid in the period', async () => {
    await openAnalytics({ ...EMPTY, pending_backlog: DATA.pending_backlog });
    expect(await screen.findByText('Bills waiting to be paid')).toBeInTheDocument();
    expect(card('Average bill')).toHaveTextContent('—');
  });

  describe('choosing the period', () => {
    it('has the 30-day button selected at first, and a preset reloads', async () => {
      await openAnalytics();
      await screen.findByText('₹375.50');
      expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
      await waitFor(() => expect(lastParams()).toEqual({ start_date: '2026-10-19', end_date: '2026-10-25' }));
      expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('custom dates are only used after Apply', async () => {
      await openAnalytics();
      await screen.findByText('₹375.50');
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-10-01' } });
      fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-10' } });
      expect(analyticsCalls()).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
      await waitFor(() => expect(lastParams()).toEqual({ start_date: '2026-10-01', end_date: '2026-10-10' }));
    });

    it.each([
      [{ from: '2026-11-01', to: '2026-10-01' }, 'The From date must not be after the To date.'],
      [{ from: '', to: '2026-10-01' }, 'Please choose both a From and a To date.'],
      [{ from: '2025-01-01', to: '2026-10-01' }, 'Please choose a period of 366 days or less.'],
    ])('refuses %j without asking the server', async ({ from, to }, message) => {
      await openAnalytics();
      await screen.findByText('₹375.50');
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: from } });
      fireEvent.change(screen.getByLabelText('To date'), { target: { value: to } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(analyticsCalls()).toHaveLength(1);
    });

    it('accepts exactly one year', async () => {
      await openAnalytics();
      await screen.findByText('₹375.50');
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2025-10-25' } });
      fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
      await waitFor(() => expect(lastParams()).toEqual({ start_date: '2025-10-25', end_date: '2026-10-25' }));
    });
  });

  describe('errors', () => {
    it('shows the server message and recovers on retry', async () => {
      axios.get.mockImplementation((url) => (url.includes('/billing/analytics')
        ? Promise.reject({ response: { status: 500, data: { error: 'Could not load the billing analytics' } } })
        : Promise.resolve({ data: { doctors: [], payment_modes: [], patient_types: [], rows: [], total: 0, total_pages: 1, page: 1, export_limit: 10000,
            summary: { counts: { paid: 0, pending: 0, cancelled: 0, total: 0 }, paid_amount: { total: 0, reimbursed: 0, self_paid: 0 } } } })));
      render(<ChakraProvider><AdminBilling /></ChakraProvider>);
      fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
      expect(await screen.findByText('Could not load the billing analytics')).toBeInTheDocument();
      axios.get.mockImplementation(() => Promise.resolve({ data: DATA }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('₹375.50')).toBeInTheDocument();
    });

    it('uses a plain message when offline', async () => {
      await openAnalytics(new Error('Network Error'));
      expect(await screen.findByText('Could not load the analytics.')).toBeInTheDocument();
    });

    it('keeps the last good figures when a new period fails to load', async () => {
      await openAnalytics();
      await screen.findByText('₹375.50');
      axios.get.mockImplementation(() => Promise.reject(new Error('x')));
      fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
      expect(await screen.findByText('Could not load the analytics.')).toBeInTheDocument();
      expect(screen.getByText('₹375.50')).toBeInTheDocument();
    });
  });

  it('only reads: it never posts, puts or deletes anything', async () => {
    await openAnalytics();
    await screen.findByText('₹375.50');
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.delete).not.toHaveBeenCalled();
  });
});

describe('formatting', () => {
  it.each([[0, '₹0'], [999, '₹999'], [1000, '₹1K'], [1250, '₹1.3K'], [99999, '₹100K'], [100000, '₹1L'], [345000, '₹3.5L'], [10000000, '₹1Cr'], [-2500, '-₹2.5K'], [null, '₹0']])(
    'short money %s -> %s', (n, text) => expect(shortRupees(n)).toBe(text));

  it('change text', () => {
    expect(changeText(150, 100, 7)).toBe('▲ 50% vs previous 7 days (100)');
    expect(changeText(50, 100, 7, true)).toBe('▼ 50% vs previous 7 days (₹100.00)');
    expect(changeText(100, 100, 7)).toBe('= 0% vs previous 7 days (100)');
    expect(changeText(5, 0, 7)).toBe('nothing in the previous period to compare');
  });
});
