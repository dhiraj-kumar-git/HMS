import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminBilling from './AdminBilling';
import { rupees, categoryLabel } from './billStatusStyles';

jest.mock('axios');
jest.mock('../../utils/utils', () => ({
  ...jest.requireActual('../../utils/utils'),
  getDateISTString: () => '2026-10-25',
}));

const paid = (i, over = {}) => ({
  kind: 'bill', key: `INV-${i}`, date: `2026-10-${String(10 + (i % 10)).padStart(2, '0')}T10:00`, status: 'paid', invoice_no: `INV-${i}`,
  institute_id: `H${100 + i}`, patient_name: `PATIENT ${i}`, patient_type: 'Faculty', doctor_name: 'Dr. X', category: 'medicine',
  payment_mode: 'UPI', item_count: 3, total_amount: 1234.5, reimbursed_amount: 1111.05, self_paid_amount: 123.45, ...over,
});
const unpaid = (i, status, over = {}) => ({
  kind: 'order', key: `v${i}`, date: '2026-10-20T11:00', status, invoice_no: null, institute_id: `H${200 + i}`, patient_name: `OTHER ${i}`,
  patient_type: 'Student', doctor_name: 'Dr. Y', category: 'both', payment_mode: null, item_count: 4,
  total_amount: null, reimbursed_amount: null, self_paid_amount: null, ...over,
});
const SUMMARY = { counts: { paid: 3, pending: 2, cancelled: 1, total: 6 }, paid_amount: { total: 1234567.5, reimbursed: 1000000, self_paid: 234567.5 } };
const page = (rows, over = {}) => ({ page: 1, limit: 25, total: rows.length, total_pages: 1, export_limit: 10000, summary: SUMMARY, rows, filters: {}, ...over });
const OPTIONS = { doctors: ['Dr. X', 'Dr. Y'], payment_modes: ['Cash', 'UPI'], patient_types: ['Faculty', 'Student'] };

let responses;
const route = () => axios.get.mockImplementation((url, config) => {
  if (url.includes('/billing/filters')) return Promise.resolve({ data: OPTIONS });
  if (url.includes('/billing/search')) {
    const next = typeof responses === 'function' ? responses(config.params) : responses;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: next });
  }
  return Promise.reject(new Error(`unmocked ${url}`));
});
const searchCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/billing/search'));
const lastSearch = () => searchCalls().at(-1)[1].params;

const open = async (response = page([paid(1), unpaid(2, 'pending')])) => {
  responses = response;
  route();
  render(<ChakraProvider><AdminBilling /></ChakraProvider>);
  await screen.findByText(/^[0-9,]+ bills?$/);
};
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));

describe('money formatting', () => {
  it.each([[0, '₹0.00'], [5, '₹5.00'], [999.5, '₹999.50'], [1000, '₹1,000.00'], [12345.678, '₹12,345.68'], [123456, '₹1,23,456.00'],
           [1234567.5, '₹12,34,567.50'], [12345678, '₹1,23,45,678.00'], [-2500.5, '-₹2,500.50']])('%s -> %s', (n, text) => {
    expect(rupees(n)).toBe(text);
  });
  it('shows a dash when there is no amount', () => {
    expect([rupees(null), rupees(undefined), rupees('x')]).toEqual(['—', '—', '—']);
  });
  it('category names', () => {
    expect([categoryLabel('medicine'), categoryLabel('lab_test'), categoryLabel('both'), categoryLabel(undefined)])
      .toEqual(['Medicines', 'Lab tests', 'Medicines + lab tests', '—']);
  });
});

describe('Admin Billing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('opens on the last 30 days with no other filter, sending the login token', async () => {
    await open();
    expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', page: 1, limit: 25 });
    expect(searchCalls()[0][1].headers.Authorization).toBe('Bearer admin-token');
    expect(screen.getByRole('heading', { name: 'Billing' })).toBeInTheDocument();
  });

  it('shows a card for each status and the amounts collected', async () => {
    await open();
    const card = (label) => screen.getByText(label, { selector: 'p' }).closest('button');
    expect(card('All bills').textContent).toContain('6');
    expect(card('Paid').textContent).toContain('3');
    expect(card('Pending').textContent).toContain('2');
    expect(card('Cancelled').textContent).toContain('1');
    expect(screen.getByText('₹12,34,567.50')).toBeInTheDocument();
    expect(screen.getByText('₹10,00,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹2,34,567.50')).toBeInTheDocument();
    expect(screen.getAllByText(/3 paid bills/)).toHaveLength(3);
  });

  it('says plainly that pending and cancelled are not part of the totals', async () => {
    await open();
    expect(screen.getByText(/Pending and cancelled bills have no amount yet, so they are only counted/)).toBeInTheDocument();
  });

  it('a paid bill shows its invoice, payment and amounts', async () => {
    await open(page([paid(1)]));
    expect(bodyRows()[0].slice(1, 12)).toEqual(['PAID', 'INV-1', 'Patient 1Faculty', 'H101', 'Dr. X', 'Medicines', 'UPI', '3', '₹1,234.50', '₹1,111.05', '₹123.45']);
  });

  it('pending and cancelled bills show dashes instead of amounts', async () => {
    await open(page([unpaid(2, 'pending'), unpaid(3, 'cancelled', { category: 'lab_test', item_count: 1 })]));
    const [pending, cancelled] = bodyRows();
    expect(pending.slice(1, 12)).toEqual(['PENDING', '—', 'Other 2Student', 'H202', 'Dr. Y', 'Medicines + lab tests', '—', '4', '—', '—', '—']);
    expect(cancelled.slice(1, 2)).toEqual(['CANCELLED']);
    expect(cancelled.slice(6, 12)).toEqual(['Lab tests', '—', '1', '—', '—', '—']);
  });

  it('copes with an unknown patient or doctor', async () => {
    await open(page([paid(1, { patient_name: null, patient_type: null, doctor_name: null })]));
    expect(screen.getByText('Unknown patient')).toBeInTheDocument();
  });

  it('hides what was billed and says so', async () => {
    await open();
    expect(screen.getByText(/What was billed \(medicine and test names\) stays hidden/)).toBeInTheDocument();
    expect(axios.get.mock.calls.every(([u]) => !u.includes('/details') && !u.includes('/items'))).toBe(true);
  });

  it('fills the drop-downs from the data', async () => {
    await open();
    await waitFor(() => expect(within(screen.getByLabelText('Payment mode')).getByRole('option', { name: 'Cash' })).toBeInTheDocument());
    expect(within(screen.getByLabelText('Doctor')).getByRole('option', { name: 'Dr. Y' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Patient type')).getByRole('option', { name: 'Student' })).toBeInTheDocument();
  });

  it('works without the drop-down lists', async () => {
    axios.get.mockImplementation((url) => url.includes('/filters') ? Promise.reject(new Error('x')) : Promise.resolve({ data: page([paid(1)]) }));
    render(<ChakraProvider><AdminBilling /></ChakraProvider>);
    expect(await screen.findByText('Patient 1')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Doctor')).getAllByRole('option')).toHaveLength(1);
  });

  it('applies filters only when Search is pressed, sending only the ones that are set', async () => {
    await open();
    await waitFor(() => expect(within(screen.getByLabelText('Doctor')).getByRole('option', { name: 'Dr. X' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paid' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'lab_test' } });
    fireEvent.change(screen.getByLabelText('Payment mode'), { target: { value: 'UPI' } });
    fireEvent.change(screen.getByLabelText('Patient type'), { target: { value: 'Faculty' } });
    fireEvent.change(screen.getByLabelText('Doctor'), { target: { value: 'Dr. X' } });
    fireEvent.change(screen.getByLabelText('Patient name, ID or invoice'), { target: { value: ' INV-1 ' } });
    expect(searchCalls()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(searchCalls()).toHaveLength(2));
    expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', status: 'paid', category: 'lab_test',
      payment_mode: 'UPI', patient_type: 'Faculty', doctor: 'Dr. X', q: 'INV-1', page: 1, limit: 25 });
  });

  it('explains why pending and cancelled vanish when a payment mode is chosen', async () => {
    await open();
    await waitFor(() => expect(within(screen.getByLabelText('Payment mode')).getByRole('option', { name: 'Cash' })).toBeInTheDocument());
    expect(screen.queryByText(/which have none\) are left out/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Payment mode'), { target: { value: 'Cash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/which have none\) are left out/)).toBeInTheDocument();
  });

  it('clicking a card narrows to that status and keeps the other filters', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Patient name, ID or invoice'), { target: { value: 'ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastSearch().q).toBe('ann'));
    fireEvent.click(screen.getByText('Pending', { selector: 'p' }).closest('button'));
    await waitFor(() => expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', status: 'pending', q: 'ann', page: 1, limit: 25 }));
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
    expect(screen.getByText('Pending', { selector: 'p' }).closest('button')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('All bills').closest('button'));
    await waitFor(() => expect(lastSearch().status).toBeUndefined());
  });

  it('Reset puts everything back', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cancelled' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastSearch().status).toBe('cancelled'));
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    await waitFor(() => expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', page: 1, limit: 25 }));
  });

  it.each([
    [{ from: '2026-11-01', to: '2026-10-01' }, 'The From date must not be after the To date.'],
    [{ from: '', to: '2026-10-01' }, 'Please choose both a From and a To date.'],
  ])('refuses %j without asking the server', async ({ from, to }, message) => {
    await open();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: from } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: to } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(searchCalls()).toHaveLength(1);
  });

  it('empty results, and the singular', async () => {
    await open(page([], { total: 0, summary: { counts: { paid: 0, pending: 0, cancelled: 0, total: 0 }, paid_amount: { total: 0, reimbursed: 0, self_paid: 0 } } }));
    expect(screen.getByText('No bills match these filters.')).toBeInTheDocument();
    expect(screen.getAllByText('₹0.00')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeDisabled();
  });

  it('says "1 bill" for a single result', async () => {
    await open(page([paid(1)], { total: 1, summary: { ...SUMMARY, counts: { paid: 1, pending: 0, cancelled: 0, total: 1 } } }));
    expect(screen.getByText('1 bill')).toBeInTheDocument();
    expect(screen.getAllByText(/1 paid bill(?!s)/).length).toBeGreaterThan(0);
  });

  describe('paging', () => {
    const big = (p) => page(Array.from({ length: Math.min(25, 61 - (p - 1) * 25) }, (_, i) => paid(i + 1 + (p - 1) * 25)), { page: p, total: 61, total_pages: 3 });

    it('moves through pages with the applied filters', async () => {
      await open(big(1));
      responses = (params) => big(params.page);
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });          // typed, not applied
      expect(screen.getByText('Showing 1–25 of 61')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Showing 26–50 of 61');
      expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', page: 2, limit: 25 });
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Showing 51–61 of 61');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });
  });

  describe('errors', () => {
    it('shows the server message and retries', async () => {
      axios.get.mockImplementation((url) => url.includes('/filters') ? Promise.resolve({ data: OPTIONS })
        : Promise.reject({ response: { status: 500, data: { error: 'Could not load the billing information' } } }));
      render(<ChakraProvider><AdminBilling /></ChakraProvider>);
      expect(await screen.findByText('Could not load the billing information')).toBeInTheDocument();
      axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/filters') ? OPTIONS : page([paid(1)]) }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Patient 1')).toBeInTheDocument();
    });

    it('plain message when offline', async () => {
      axios.get.mockImplementation(() => Promise.reject(new Error('Network Error')));
      render(<ChakraProvider><AdminBilling /></ChakraProvider>);
      expect(await screen.findByText('Could not load the billing information.')).toBeInTheDocument();
    });
  });

  describe('CSV download', () => {
    let link;
    beforeEach(() => {
      global.URL.createObjectURL = jest.fn(() => 'blob:csv');
      global.URL.revokeObjectURL = jest.fn();
      const real = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = real(tag);
        if (tag === 'a') { link = el; el.click = jest.fn(); }
        return el;
      });
    });
    afterEach(() => jest.restoreAllMocks());

    const withExport = (response) => {
      const base = axios.get.getMockImplementation();
      axios.get.mockImplementation((url, config) => url.includes('/billing/export') ? Promise.resolve(response) : base(url, config));
    };
    const exportCall = () => axios.get.mock.calls.find(([u]) => u.includes('/billing/export'));
    const csv = (headers = {}) => ({ data: new Blob(['x']), headers: { 'content-disposition': 'attachment; filename="billing_2026-09-26_to_2026-10-25.csv"', ...headers } });

    it('downloads the server-named file for the filters that were applied', async () => {
      await open();
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });      // typed, not applied
      withExport(csv());
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      await waitFor(() => expect(link.click).toHaveBeenCalled());
      expect(link.download).toBe('billing_2026-09-26_to_2026-10-25.csv');
      expect(exportCall()[1].params).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25' });
      expect(exportCall()[1].headers.Authorization).toBe('Bearer admin-token');
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    });

    it('warns up front and after when the file is cut short', async () => {
      await open(page([paid(1)], { total: 12345, total_pages: 494 }));
      expect(screen.getByText(/CSV holds at most the 10,000 newest/)).toBeInTheDocument();
      withExport(csv({ 'x-export-truncated': 'true' }));
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      expect(await screen.findByText(/only the first 10,000 rows/)).toBeInTheDocument();
    });

    it('says so when the download fails', async () => {
      await open();
      const base = axios.get.getMockImplementation();
      axios.get.mockImplementation((url, config) => url.includes('/billing/export') ? Promise.reject(new Error('x')) : base(url, config));
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      expect(await screen.findByText('Could not download the file. Please try again.')).toBeInTheDocument();
    });
  });

  it('only reads: it never posts, puts or deletes anything', async () => {
    await open();
    fireEvent.click(screen.getByText('Patient 1'));
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(axios.delete).not.toHaveBeenCalled();
  });
});
