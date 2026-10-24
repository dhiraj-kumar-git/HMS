import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminAppointments from './AdminAppointments';

jest.mock('axios');

const TODAY = '2026-10-24';
jest.mock('../../utils/utils', () => ({
  ...jest.requireActual('../../utils/utils'),
  getDateISTString: () => '2026-10-24',
}));

const row = (i, over = {}) => ({
  visit_id: `v${i}`, time: `2026-10-${String(10 + (i % 10)).padStart(2, '0')}T09:00`, status: 'completed',
  institute_id: `H${100 + i}`, patient_name: `PATIENT ${i}`, patient_type: 'Student', doctor_username: 'drx',
  doctor_name: 'Dr. X', booked_by: 'patient', booked_at: 'x', ...over,
});

const page = (rows, over = {}) => ({
  page: 1, limit: 25, total: rows.length, total_pages: 1, export_limit: 10000, rows, filters: {}, ...over,
});

const DOCTORS = [{ username: 'drx', name: 'Dr. X' }, { username: 'dry', name: 'Dr. Y' }];

let searchResponses;
const route = () => {
  axios.get.mockImplementation((url, config) => {
    if (url.includes('/appointments/doctors')) return Promise.resolve({ data: DOCTORS });
    if (url.includes('/appointments/search')) {
      const next = typeof searchResponses === 'function' ? searchResponses(config.params) : searchResponses;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: next });
    }
    if (url.includes('/appointments/today')) return Promise.resolve({ data: { date: TODAY, counts: {}, active: [] } });
    return Promise.reject(new Error(`unmocked ${url}`));
  });
};

const searchCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/appointments/search'));
const lastSearch = () => searchCalls().at(-1)[1].params;

const openSearch = async (response = page([row(1), row(2)])) => {
  searchResponses = response;
  route();
  render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
  fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
  await screen.findByText(/appointment(s)? found/);
};

describe('Admin Appointments - Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('does not load anything until the Search tab is opened', async () => {
    searchResponses = page([]);
    route();
    render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
    await screen.findByText(/Active appointments/);
    expect(searchCalls()).toHaveLength(0);
  });

  it('starts with the last 30 days ending today and no other filter, sending the login token', async () => {
    await openSearch();
    expect(lastSearch()).toEqual({ start_date: '2026-09-25', end_date: '2026-10-24', page: 1, limit: 25 });
    expect(searchCalls()[0][1].headers.Authorization).toBe('Bearer admin-token');
    expect(screen.getByLabelText('From date')).toHaveValue('2026-09-25');
    expect(screen.getByLabelText('To date')).toHaveValue('2026-10-24');
  });

  it('lists the results with the total', async () => {
    await openSearch(page([row(1), row(2, { status: 'cancelled', booked_by: 'receptionist' })], { total: 2 }));
    expect(screen.getByText('2 appointments found')).toBeInTheDocument();
    expect(screen.getByText('Patient 1')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Receptionist')).toBeInTheDocument();
  });

  it('speaks of "1 appointment" in the singular', async () => {
    await openSearch(page([row(1)], { total: 1 }));
    expect(screen.getByText('1 appointment found')).toBeInTheDocument();
  });

  it('shows an empty message when nothing matches', async () => {
    await openSearch(page([], { total: 0 }));
    expect(screen.getByText('No appointments match these filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeDisabled();
  });

  it('fills the doctor list from the server', async () => {
    await openSearch();
    await waitFor(() => expect(within(screen.getByLabelText('Doctor')).getByRole('option', { name: 'Dr. Y' })).toBeInTheDocument());
  });

  it('keeps working if the doctor list cannot be loaded', async () => {
    searchResponses = page([row(1)]);
    axios.get.mockImplementation((url) => url.includes('/doctors')
      ? Promise.reject(new Error('x')) : Promise.resolve({ data: searchResponses }));
    render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
    expect(await screen.findByText('Patient 1')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Doctor')).getAllByRole('option')).toHaveLength(1);
  });

  it('applies filters only when Search is pressed', async () => {
    await openSearch();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cancelled' } });
    fireEvent.change(screen.getByLabelText('Booked by'), { target: { value: 'receptionist' } });
    fireEvent.change(screen.getByLabelText('Patient name or ID'), { target: { value: '  ann ' } });
    await waitFor(() => expect(within(screen.getByLabelText('Doctor')).getByRole('option', { name: 'Dr. X' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Doctor'), { target: { value: 'drx' } });
    expect(searchCalls()).toHaveLength(1);                                   // typing alone searched nothing
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(searchCalls()).toHaveLength(2));
    expect(lastSearch()).toEqual({ start_date: '2026-09-25', end_date: '2026-10-24', status: 'cancelled', doctor: 'drx',
      booked_by: 'receptionist', q: 'ann', page: 1, limit: 25 });
  });

  it('pressing Enter in the patient box searches too', async () => {
    await openSearch();
    fireEvent.change(screen.getByLabelText('Patient name or ID'), { target: { value: 'H105' } });
    fireEvent.submit(screen.getByLabelText('Patient name or ID').closest('form'));
    await waitFor(() => expect(lastSearch().q).toBe('H105'));
  });

  it('Reset puts everything back and searches again', async () => {
    await openSearch();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'booked' } });
    fireEvent.change(screen.getByLabelText('Patient name or ID'), { target: { value: 'zed' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastSearch().status).toBe('booked'));
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    await waitFor(() => expect(lastSearch()).toEqual({ start_date: '2026-09-25', end_date: '2026-10-24', page: 1, limit: 25 }));
    expect(screen.getByLabelText('Patient name or ID')).toHaveValue('');
    expect(screen.getByLabelText('Status')).toHaveValue('all');
  });

  it('refuses a From date after the To date without asking the server', async () => {
    await openSearch();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('The From date must not be after the To date.')).toBeInTheDocument();
    expect(searchCalls()).toHaveLength(1);
  });

  it('refuses a missing date', async () => {
    await openSearch();
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Please choose both a From and a To date.')).toBeInTheDocument();
    expect(searchCalls()).toHaveLength(1);
  });

  describe('paging', () => {
    const big = (p) => page(Array.from({ length: Math.min(25, 61 - (p - 1) * 25) }, (_, i) => row(i + 1 + (p - 1) * 25)), { page: p, total: 61, total_pages: 3 });

    it('moves through pages using the filters that were applied, not half-typed ones', async () => {
      await openSearch(big(1));
      searchResponses = (params) => big(params.page);
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'booked' } });   // typed, not applied
      expect(screen.getByText('Showing 1–25 of 61')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Showing 26–50 of 61');
      expect(lastSearch()).toEqual({ start_date: '2026-09-25', end_date: '2026-10-24', page: 2, limit: 25 });
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText('Showing 51–61 of 61');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(lastSearch().page).toBe(2));
    });

    it('searching again goes back to page 1', async () => {
      await openSearch(big(1));
      searchResponses = (params) => big(params.page);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await screen.findByText(/Page 2 of 3/);
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      await waitFor(() => expect(lastSearch().page).toBe(1));
    });

    it('shows no pager for a single page', async () => {
      await openSearch();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });
  });

  describe('errors', () => {
    it('shows the server message and lets the admin retry', async () => {
      searchResponses = new Error('x');
      axios.get.mockImplementation((url) => url.includes('/doctors') ? Promise.resolve({ data: [] }) :
        Promise.reject({ response: { status: 400, data: { error: 'From date must not be after To date' } } }));
      render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
      fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
      expect(await screen.findByText('From date must not be after To date')).toBeInTheDocument();
      axios.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/doctors') ? [] : page([row(1)]) }));
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Patient 1')).toBeInTheDocument();
      expect(screen.queryByText('From date must not be after To date')).not.toBeInTheDocument();
    });

    it('uses a plain message when the network is down', async () => {
      axios.get.mockImplementation((url) => url.includes('/doctors') ? Promise.resolve({ data: [] }) : Promise.reject(new Error('Network Error')));
      render(<ChakraProvider><AdminAppointments /></ChakraProvider>);
      fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
      expect(await screen.findByText('Could not search appointments.')).toBeInTheDocument();
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

    const csvResponse = (headers = {}) => ({
      data: new Blob(['x']),
      headers: { 'content-disposition': 'attachment; filename="appointments_2026-09-25_to_2026-10-24.csv"', ...headers },
    });
    const exportCall = () => axios.get.mock.calls.find(([u]) => u.includes('/appointments/export'));
    const withExport = (response) => {
      const base = axios.get.getMockImplementation();
      axios.get.mockImplementation((url, config) => url.includes('/appointments/export') ? Promise.resolve(response) : base(url, config));
    };

    it('downloads the file the server names, then cleans up', async () => {
      await openSearch();
      withExport(csvResponse());
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      await waitFor(() => expect(link.click).toHaveBeenCalled());
      expect(link.download).toBe('appointments_2026-09-25_to_2026-10-24.csv');
      expect(link.href).toBe('blob:csv');
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
      const [, config] = exportCall();
      expect(config.responseType).toBe('blob');
      expect(config.headers.Authorization).toBe('Bearer admin-token');
    });

    it('exports what is on screen, not filters that were typed but never applied', async () => {
      await openSearch();
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'booked' } });
      withExport(csvResponse());
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      await waitFor(() => expect(exportCall()).toBeTruthy());
      expect(exportCall()[1].params).toEqual({ start_date: '2026-09-25', end_date: '2026-10-24' });
    });

    it('exports the applied filters after a search', async () => {
      await openSearch();
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'booked' } });
      fireEvent.change(screen.getByLabelText('Patient name or ID'), { target: { value: 'ann' } });
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      await waitFor(() => expect(lastSearch().status).toBe('booked'));
      withExport(csvResponse());
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      await waitFor(() => expect(exportCall()).toBeTruthy());
      expect(exportCall()[1].params).toEqual({ start_date: '2026-09-25', end_date: '2026-10-24', status: 'booked', q: 'ann' });
    });

    it('warns up front when more than the export limit matches', async () => {
      await openSearch(page([row(1)], { total: 12345, total_pages: 494 }));
      expect(screen.getByText(/CSV holds at most the 10,000 newest/)).toBeInTheDocument();
    });

    it('warns after the download if the server had to cut the file short', async () => {
      await openSearch();
      withExport(csvResponse({ 'x-export-truncated': 'true' }));
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      expect(await screen.findByText(/only the first 10,000 appointments/)).toBeInTheDocument();
    });

    it('says so when the download fails', async () => {
      await openSearch();
      const base = axios.get.getMockImplementation();
      axios.get.mockImplementation((url, config) => url.includes('/appointments/export') ? Promise.reject(new Error('x')) : base(url, config));
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      expect(await screen.findByText('Could not download the file. Please try again.')).toBeInTheDocument();
      expect(link.click).not.toHaveBeenCalled();
    });

    it('falls back to a default file name', async () => {
      await openSearch();
      withExport({ data: new Blob(['x']), headers: {} });
      fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
      await waitFor(() => expect(link.click).toHaveBeenCalled());
      expect(link.download).toBe('appointments.csv');
    });
  });

  it('is read-only: no way to change an appointment from this screen', async () => {
    await openSearch();
    for (const label of [/confirm/i, /check.?in$/i, /cancel/i, /reprint/i, /delete/i, /edit/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Patient 1'));
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('Today and Search tabs coexist', async () => {
    await openSearch();
    fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
    expect(await screen.findByText(/Active appointments/)).toBeInTheDocument();
  });
});
