import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminReports from './AdminReports';

jest.mock('axios');
jest.mock('../../utils/utils', () => ({
  ...jest.requireActual('../../utils/utils'),
  getDateISTString: () => '2026-10-25',
}));

const row = (i, over = {}) => ({
  visit_id: `v${i}`, time: `2026-10-${String(10 + (i % 10)).padStart(2, '0')}T09:00`, status: 'completed',
  institute_id: `H${100 + i}`, patient_name: `PATIENT ${i}`, patient_type: 'Student', doctor_username: 'drx',
  doctor_name: 'Dr. X', tests_total: 2, tests_completed: 2, tests_cancelled: 0, report_files: 1, report_typed: 1, ...over,
});

const SUMMARY = { awaiting_payment: 2, pending: 3, in_progress: 1, partially_completed: 4, completed: 10, cancelled: 1, total: 21 };
const page = (rows, over = {}) => ({
  page: 1, limit: 25, total: rows.length, total_pages: 1, export_limit: 10000, summary: SUMMARY, rows, filters: {}, ...over,
});
const DOCTORS = [{ username: 'drx', name: 'Dr. X' }, { username: 'dry', name: 'Dr. Y' }];

let responses;
const route = () => axios.get.mockImplementation((url, config) => {
  if (url.includes('/lab-reports/doctors')) return Promise.resolve({ data: DOCTORS });
  if (url.includes('/lab-reports/search')) {
    const next = typeof responses === 'function' ? responses(config.params) : responses;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: next });
  }
  return Promise.reject(new Error(`unmocked ${url}`));
});
const searchCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/lab-reports/search'));
const lastSearch = () => searchCalls().at(-1)[1].params;

const open = async (response = page([row(1), row(2)])) => {
  responses = response;
  route();
  render(<ChakraProvider><AdminReports /></ChakraProvider>);
  await screen.findByText(/lab orders?$/);
};

const table = () => screen.getByRole('table');

describe('Admin Reports - lab order statuses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('opens on the last 30 days with no other filter, sending the login token', async () => {
    await open();
    expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', page: 1, limit: 25 });
    expect(searchCalls()[0][1].headers.Authorization).toBe('Bearer admin-token');
    expect(screen.getByRole('heading', { name: 'Lab Reports' })).toBeInTheDocument();
  });

  it('shows each order with the number of tests done and the kind of reports, never names or results', async () => {
    await open(page([
      row(1),
      row(2, { status: 'partially_completed', tests_total: 3, tests_completed: 1, report_files: 0, report_typed: 1 }),
      row(3, { status: 'cancelled', tests_total: 2, tests_completed: 0, tests_cancelled: 2, report_files: 0, report_typed: 0 }),
    ]));
    const rows = within(table()).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows[0].slice(1, 7)).toEqual(['Patient 1Student', 'H101', 'Dr. X', '2 of 2', '1 file · 1 typed', 'COMPLETED']);
    expect(rows[1].slice(4, 7)).toEqual(['1 of 3', '1 typed', 'PARTIALLY COMPLETED']);
    expect(rows[2].slice(4, 7)).toEqual(['0 of 2 (2 cancelled)', '—', 'CANCELLED']);
    expect(screen.getByText('Test names and results are hidden. They need your password.')).toBeInTheDocument();
  });

  it('shows all six statuses with their own text', async () => {
    const statuses = ['awaiting_payment', 'pending', 'in_progress', 'partially_completed', 'completed', 'cancelled'];
    await open(page(statuses.map((s, i) => row(i + 1, { status: s }))));
    for (const label of ['AWAITING PAYMENT', 'PENDING', 'IN PROGRESS', 'PARTIALLY COMPLETED', 'COMPLETED', 'CANCELLED']) {
      expect(within(table()).getByText(label)).toBeInTheDocument();
    }
  });

  it('shows a count card for every status', async () => {
    await open();
    const card = (label) => screen.getByText(label, { selector: 'p' }).closest('button');
    expect(card('All orders').textContent).toContain('21');
    expect(card('Awaiting payment').textContent).toContain('2');
    expect(card('Pending').textContent).toContain('3');
    expect(card('In progress').textContent).toContain('1');
    expect(card('Partially completed').textContent).toContain('4');
    expect(card('Completed').textContent).toContain('10');
    expect(card('Cancelled').textContent).toContain('1');
  });

  it('clicking a card shows just that status, keeping the other filters on screen', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Patient name or ID'), { target: { value: 'ann' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastSearch().q).toBe('ann'));
    fireEvent.click(screen.getByText('Pending', { selector: 'p' }).closest('button'));
    await waitFor(() => expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', status: 'pending', q: 'ann', page: 1, limit: 25 }));
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
    expect(screen.getByText('Pending', { selector: 'p' }).closest('button')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('All orders').closest('button'));
    await waitFor(() => expect(lastSearch().status).toBeUndefined());
  });

  it('says so when nothing matches, and singular for one order', async () => {
    await open(page([], { total: 0, summary: { ...SUMMARY, total: 0 } }));
    expect(screen.getByText('No lab orders match these filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeDisabled();
  });

  it('says "1 lab order" for a single result', async () => {
    await open(page([row(1)], { total: 1 }));
    expect(screen.getByText('1 lab order')).toBeInTheDocument();
  });

  it('fills the doctor list from the server', async () => {
    await open();
    await waitFor(() => expect(within(screen.getByLabelText('Doctor')).getByRole('option', { name: 'Dr. Y' })).toBeInTheDocument());
  });

  it('has no filter for test names', async () => {
    await open();
    expect(screen.queryByLabelText(/test/i)).not.toBeInTheDocument();
  });

  it('applies filters only when Search is pressed', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_progress' } });
    await waitFor(() => expect(within(screen.getByLabelText('Doctor')).getByRole('option', { name: 'Dr. X' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Doctor'), { target: { value: 'drx' } });
    fireEvent.change(screen.getByLabelText('Patient name or ID'), { target: { value: ' H105 ' } });
    expect(searchCalls()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(searchCalls()).toHaveLength(2));
    expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', status: 'in_progress', doctor: 'drx', q: 'H105', page: 1, limit: 25 });
  });

  it('Reset puts everything back', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cancelled' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastSearch().status).toBe('cancelled'));
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    await waitFor(() => expect(lastSearch()).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25', page: 1, limit: 25 }));
    expect(screen.getByLabelText('Status')).toHaveValue('all');
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

  describe('paging', () => {
    const big = (p) => page(Array.from({ length: Math.min(25, 61 - (p - 1) * 25) }, (_, i) => row(i + 1 + (p - 1) * 25)),
      { page: p, total: 61, total_pages: 3 });

    it('moves through pages with the applied filters, not half-typed ones', async () => {
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

    it('no pager for one page', async () => {
      await open();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });
  });

  describe('errors', () => {
    it('shows the server message and retries', async () => {
      axios.get.mockImplementation((url) => url.includes('/doctors') ? Promise.resolve({ data: [] })
        : Promise.reject({ response: { status: 500, data: { error: 'Could not load the lab reports' } } }));
      render(<ChakraProvider><AdminReports /></ChakraProvider>);
      expect(await screen.findByText('Could not load the lab reports')).toBeInTheDocument();
      axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/doctors') ? [] : page([row(1)]) }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Patient 1')).toBeInTheDocument();
    });

    it('plain message when offline, and the page still works without the doctor list', async () => {
      axios.get.mockImplementation(() => Promise.reject(new Error('Network Error')));
      render(<ChakraProvider><AdminReports /></ChakraProvider>);
      expect(await screen.findByText('Could not load the lab reports.')).toBeInTheDocument();
      expect(within(screen.getByLabelText('Doctor')).getAllByRole('option')).toHaveLength(1);
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
      axios.get.mockImplementation((url, config) => url.includes('/lab-reports/export') ? Promise.resolve(response) : base(url, config));
    };
    const exportCall = () => axios.get.mock.calls.find(([u]) => u.includes('/lab-reports/export'));
    const csv = (headers = {}) => ({ data: new Blob(['x']), headers: { 'content-disposition': 'attachment; filename="lab_reports_2026-09-26_to_2026-10-25.csv"', ...headers } });

    it('downloads the server-named file for the applied filters and cleans up', async () => {
      await open();
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });      // typed, not applied
      withExport(csv());
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      await waitFor(() => expect(link.click).toHaveBeenCalled());
      expect(link.download).toBe('lab_reports_2026-09-26_to_2026-10-25.csv');
      expect(exportCall()[1].params).toEqual({ start_date: '2026-09-26', end_date: '2026-10-25' });
      expect(exportCall()[1].headers.Authorization).toBe('Bearer admin-token');
      expect(exportCall()[1].responseType).toBe('blob');
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    });

    it('warns up front and after when the file is cut short', async () => {
      await open(page([row(1)], { total: 12345, total_pages: 494 }));
      expect(screen.getByText(/CSV holds at most the 10,000 newest/)).toBeInTheDocument();
      withExport(csv({ 'x-export-truncated': 'true' }));
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      expect(await screen.findByText(/only the first 10,000 orders/)).toBeInTheDocument();
    });

    it('says so when the download fails', async () => {
      await open();
      const base = axios.get.getMockImplementation();
      axios.get.mockImplementation((url, config) => url.includes('/lab-reports/export') ? Promise.reject(new Error('x')) : base(url, config));
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      expect(await screen.findByText('Could not download the file. Please try again.')).toBeInTheDocument();
      expect(link.click).not.toHaveBeenCalled();
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
