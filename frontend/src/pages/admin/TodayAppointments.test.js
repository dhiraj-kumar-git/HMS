import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminAppointments from './AdminAppointments';

jest.mock('axios');

const row = (i, over = {}) => ({
  visit_id: `v${i}`, time: `2026-10-24T${String(8 + (i % 10)).padStart(2, '0')}:00`, status: 'confirmed',
  institute_id: `H${100 + i}`, patient_name: `PATIENT ${i}`, patient_type: 'Student',
  doctor_username: 'drx', doctor_name: 'Dr. X', booked_by: 'patient', ...over,
});

const payload = (over = {}) => ({
  date: '2026-10-24', generated_at: '2026-10-24T06:00:00+00:00',
  counts: { booked: 2, confirmed: 3, checked_in: 1, consultation: 1, completed: 4, cancelled: 1, other: 0, total: 12 },
  active: [row(1, { status: 'booked' }), row(2, { status: 'consultation', booked_by: 'receptionist' })],
  ...over,
});

const renderPage = () => render(<ChakraProvider><AdminAppointments /></ChakraProvider>);

describe('Admin Appointments - Today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
  });
  afterEach(() => localStorage.clear());

  it('asks the admin-only endpoint with the login token', async () => {
    axios.get.mockResolvedValue({ data: payload() });
    renderPage();
    await screen.findByText(/Active appointments/);
    const [url, config] = axios.get.mock.calls[0];
    expect(url).toMatch(/\/api\/admin\/appointments\/today$/);
    expect(config.headers.Authorization).toBe('Bearer admin-token');
  });

  it('shows the date and a counter for every status', async () => {
    axios.get.mockResolvedValue({ data: payload() });
    renderPage();
    expect(await screen.findByText('Saturday, 24 October 2026')).toBeInTheDocument();
    const card = (label) => screen.getByText(label).closest('.chakra-stat');
    const value = (label) => within(card(label)).getByText(/^\d+$/).textContent;
    expect(value('Total today')).toBe('12');
    expect(value('Booked')).toBe('2');
    expect(value('Confirmed')).toBe('3');
    expect(value('Checked in')).toBe('1');
    expect(value('In consultation')).toBe('1');
    expect(value('Completed')).toBe('4');
    expect(value('Cancelled')).toBe('1');
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('shows an Other counter only when there is something in it', async () => {
    axios.get.mockResolvedValue({ data: payload({ counts: { ...payload().counts, other: 2 } }) });
    renderPage();
    expect(await screen.findByText('Other')).toBeInTheDocument();
  });

  it('lists active appointments with patient, doctor, who booked and status', async () => {
    axios.get.mockResolvedValue({ data: payload() });
    renderPage();
    expect(await screen.findByText('Patient 1')).toBeInTheDocument();
    expect(screen.getByText('H101')).toBeInTheDocument();
    expect(screen.getAllByText('Dr. X')).toHaveLength(2);
    expect(screen.getByText('Receptionist')).toBeInTheDocument();
    expect(screen.getByText('BOOKED')).toBeInTheDocument();
    expect(screen.getByText('IN CONSULTATION')).toBeInTheDocument();
    expect(screen.getByText('Active appointments (2)')).toBeInTheDocument();
  });

  it('copes with an unknown patient and a missing doctor name', async () => {
    axios.get.mockResolvedValue({ data: payload({ active: [row(1, { patient_name: null, patient_type: null, doctor_name: null })] }) });
    renderPage();
    expect(await screen.findByText('Unknown patient')).toBeInTheDocument();
    expect(screen.getByText('drx')).toBeInTheDocument();
  });

  it('says so when nothing is active', async () => {
    axios.get.mockResolvedValue({ data: payload({ active: [] }) });
    renderPage();
    expect(await screen.findByText('No active appointments right now.')).toBeInTheDocument();
    expect(screen.getByText('Active appointments (0)')).toBeInTheDocument();
  });

  it('is read-only: no way to confirm, check in or cancel', async () => {
    axios.get.mockResolvedValue({ data: payload() });
    renderPage();
    await screen.findByText('Patient 1');
    for (const label of [/confirm/i, /check.?in$/i, /cancel/i, /reprint/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Patient 1'));
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('pages through long lists', async () => {
    axios.get.mockResolvedValue({ data: payload({ active: Array.from({ length: 23 }, (_, i) => row(i + 1)) }) });
    renderPage();
    await screen.findByText('Patient 1');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.queryByText('Patient 11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Patient 11')).toBeInTheDocument();
    expect(screen.getByText('Showing 10 of 23 entries')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 3 of 23 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('shows the server message with a retry when loading fails', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 500, data: { error: 'Could not load today\'s appointments' } } });
    renderPage();
    expect(await screen.findByText('Could not load today\'s appointments')).toBeInTheDocument();
    axios.get.mockResolvedValue({ data: payload() });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Patient 1')).toBeInTheDocument();
    expect(screen.queryByText('Could not load today\'s appointments')).not.toBeInTheDocument();
  });

  it('falls back to a plain message when there is no network', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    renderPage();
    expect(await screen.findByText(/Could not load today's appointments\./)).toBeInTheDocument();
  });

  it('Refresh button reloads', async () => {
    axios.get.mockResolvedValue({ data: payload() });
    renderPage();
    await screen.findByText('Patient 1');
    axios.get.mockResolvedValue({ data: payload({ active: [row(9, { patient_name: 'NEW ARRIVAL' })] }) });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText('New Arrival')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('a failed refresh keeps showing the last good data', async () => {
    axios.get.mockResolvedValueOnce({ data: payload() });
    renderPage();
    await screen.findByText('Patient 1');
    axios.get.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText(/Could not load/)).toBeInTheDocument();
    expect(screen.getByText('Patient 1')).toBeInTheDocument();
  });

  describe('automatic refresh', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('reloads every minute and stops after leaving the page', async () => {
      axios.get.mockResolvedValue({ data: payload() });
      const { unmount } = renderPage();
      await act(async () => { await Promise.resolve(); });
      expect(axios.get).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(60 * 1000); });
      expect(axios.get).toHaveBeenCalledTimes(2);
      await act(async () => { jest.advanceTimersByTime(60 * 1000); });
      expect(axios.get).toHaveBeenCalledTimes(3);
      unmount();
      await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000); });
      expect(axios.get).toHaveBeenCalledTimes(3);
    });
  });
});
