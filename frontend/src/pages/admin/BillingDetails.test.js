import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import AdminBilling from './AdminBilling';

jest.mock('axios');
jest.mock('../../utils/utils', () => ({
  ...jest.requireActual('../../utils/utils'),
  getDateISTString: () => '2026-10-25',
}));

const PAID = {
  kind: 'bill', key: 'INV-1', date: '2026-10-20T10:00', status: 'paid', invoice_no: 'INV-1', institute_id: 'H1', patient_name: 'ANN LEE',
  patient_type: 'Faculty', doctor_name: 'Dr. X', category: 'medicine', payment_mode: 'UPI', item_count: 2,
  total_amount: 110, reimbursed_amount: 99.36, self_paid_amount: 10.64,
};
const ORDER = {
  kind: 'order', key: 'v7', date: '2026-10-19T11:00', status: 'pending', invoice_no: null, institute_id: 'H2', patient_name: 'BOB ROY',
  patient_type: 'Student', doctor_name: 'Dr. Y', category: 'both', payment_mode: null, item_count: 2,
  total_amount: null, reimbursed_amount: null, self_paid_amount: null,
};
const LIST = {
  page: 1, limit: 25, total: 2, total_pages: 1, export_limit: 10000,
  summary: { counts: { paid: 1, pending: 1, cancelled: 0, total: 2 }, paid_amount: { total: 110, reimbursed: 99.36, self_paid: 10.64 } },
  rows: [PAID, ORDER],
};
const BILL_DETAIL = {
  kind: 'bill', status: 'paid', key: 'INV-1', invoice_no: 'INV-1', date: '2026-10-20T10:00', institute_id: 'H1', patient_name: 'ANN LEE',
  patient_type: 'Faculty', doctor_name: 'Dr. X', category: 'medicine', payment_mode: 'UPI',
  items: [
    { type: 'medicine', name: 'Paracetamol 500', quantity: 5, rate: 10, gross: 50, discount: 0, discount_amount: 0, cgst: 1.5, sgst: 1.5, item_total: 53 },
    { type: 'lab_test', name: 'Complete Blood Count', quantity: null, rate: 0, gross: 100, discount: 50, discount_amount: 50, cgst: 0, sgst: 0, item_total: 50 },
  ],
  totals: { items_total: 103, gst: 3, discount: 50, round_off: 0.4, total: 103.4, reimbursed: 92.7, self_paid: 10.7 },
};
const ORDER_DETAIL = {
  kind: 'order', status: 'pending', key: 'v7', invoice_no: null, date: '2026-10-19T11:00', institute_id: 'H2', patient_name: 'BOB ROY',
  patient_type: 'Student', doctor_name: 'Dr. Y',
  items: [{ type: 'medicine', name: 'Syrup X', quantity: '2' }, { type: 'lab_test', name: 'Lipid Profile', quantity: '1' }], totals: null,
};

const DETAILS = /\/api\/admin\/billing\/(bill|order)\/.+\/details/;
let detailsReply;
const detailCalls = () => axios.get.mock.calls.filter(([u]) => DETAILS.test(u));

const setup = async () => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/billing/filters')) return Promise.resolve({ data: { doctors: [], payment_modes: [], patient_types: [] } });
    if (url.includes('/billing/search')) return Promise.resolve({ data: LIST });
    if (DETAILS.test(url)) return typeof detailsReply === 'function' ? detailsReply(url) : Promise.resolve({ data: detailsReply });
    return Promise.reject(new Error(`unmocked ${url}`));
  });
  render(<ChakraProvider><AdminBilling /></ChakraProvider>);
  await screen.findByText('Ann Lee');
};
const viewButton = (name) => screen.getByRole('button', { name: `View details of ${name}` });
const typeAndUnlock = async (password = 'secret') => {
  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
};
const closeDialog = async () => {
  fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })[0]);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
};

describe('Billing details behind the password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
    sessionStorage.clear();
    detailsReply = { ...BILL_DETAIL };
  });
  afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('asks for the password first and fetches nothing', async () => {
    await setup();
    fireEvent.click(viewButton('INV-1'));
    expect(await screen.findByText(/Enter your password/)).toBeInTheDocument();
    expect(screen.getByText(/which medicines and tests were billed/)).toBeInTheDocument();
    expect(detailCalls()).toHaveLength(0);
    expect(screen.queryByText('Paracetamol 500')).not.toBeInTheDocument();
  });

  it('a wrong password shows an error and stays locked', async () => {
    axios.post.mockRejectedValue({ response: { status: 403, data: { code: 'INCORRECT_PASSWORD' } } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    await typeAndUnlock('nope');
    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
    expect(detailCalls()).toHaveLength(0);
    expect(screen.queryByText(/Billing details are unlocked/)).not.toBeInTheDocument();
  });

  it('too many wrong passwords shows the server message', async () => {
    axios.post.mockRejectedValue({ response: { status: 429, data: { error: 'Too many wrong passwords. Please try again in 15 minutes.' } } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    await typeAndUnlock();
    expect(await screen.findByText(/Too many wrong passwords/)).toBeInTheDocument();
  });

  it('the right password goes to the shared unlock (hashed), then the lines and totals are shown', async () => {
    axios.post.mockResolvedValue({ data: { unlocked: true, expires_in: 600 } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    await typeAndUnlock('secret');
    expect(await screen.findByText('Paracetamol 500')).toBeInTheDocument();
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toMatch(/\/api\/admin\/lab-reports\/unlock$/);
    expect(body).toEqual({ password: CryptoJS.SHA256('secret').toString(CryptoJS.enc.Hex) });
    expect(config.headers.Authorization).toBe('Bearer admin-token');
    expect(detailCalls().map(([u]) => u)).toEqual([expect.stringMatching(/\/api\/admin\/billing\/bill\/INV-1\/details$/)]);

    const modal = within(screen.getByRole('dialog'));
    expect(modal.getByText('Complete Blood Count')).toBeInTheDocument();
    expect(modal.getByText('50% (₹50.00)')).toBeInTheDocument();
    expect(modal.getByText('Bill total').parentElement).toHaveTextContent('₹103.40');
    expect(modal.getByText('of which GST').parentElement).toHaveTextContent('₹3.00');
    expect(modal.getByText('Round off').parentElement).toHaveTextContent('₹0.40');
    expect(screen.getByText(/Billing details are unlocked · (10:00|9:5\d) left/)).toBeInTheDocument();
  });

  it('while unlocked the next bill opens without asking again; a pending bill shows names but no prices', async () => {
    axios.post.mockResolvedValue({ data: { expires_in: 600 } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    await typeAndUnlock();
    await screen.findByText('Paracetamol 500');
    await closeDialog();

    detailsReply = { ...ORDER_DETAIL };
    fireEvent.click(viewButton('BOB ROY'));
    expect(await screen.findByText('Syrup X')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(1);
    const modal = within(screen.getByRole('dialog'));
    expect(modal.getByText('Lipid Profile')).toBeInTheDocument();
    expect(modal.getByText('Not billed yet')).toBeInTheDocument();
    expect(modal.getByText(/no invoice, so there are no prices/)).toBeInTheDocument();
    expect(modal.queryByText('Bill total')).not.toBeInTheDocument();
    expect(modal.queryByRole('columnheader', { name: 'Rate' })).not.toBeInTheDocument();
    expect(detailCalls().map(([u]) => u).pop()).toMatch(/\/billing\/order\/v7\/details$/);
  });

  it('an open window from Lab Reports is reused: no second password', async () => {
    sessionStorage.setItem('lab_view_unlocked_until', String(Date.now() + 5 * 60 * 1000));
    await setup();
    expect(screen.getByText(/Billing details are unlocked/)).toBeInTheDocument();
    fireEvent.click(viewButton('INV-1'));
    expect(await screen.findByText('Paracetamol 500')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('when the server says the window ended, it asks for the password again', async () => {
    sessionStorage.setItem('lab_view_unlocked_until', String(Date.now() + 5 * 60 * 1000));
    detailsReply = () => Promise.reject({ response: { status: 403, data: { code: 'LAB_VIEW_LOCKED' } } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.getAllByText(/Your 10 minutes have ended/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Billing details are unlocked/)).not.toBeInTheDocument();
  });

  it('shows plain errors for a missing bill and for a failure', async () => {
    sessionStorage.setItem('lab_view_unlocked_until', String(Date.now() + 5 * 60 * 1000));
    detailsReply = () => Promise.reject({ response: { status: 404 } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    expect(await screen.findByText('This bill was not found.')).toBeInTheDocument();
    await closeDialog();
    detailsReply = () => Promise.reject(new Error('boom'));
    fireEvent.click(viewButton('INV-1'));
    expect(await screen.findByText('Could not load the bill. Please try again.')).toBeInTheDocument();
  });

  it('"Lock now" hides the lines at once and tells the server', async () => {
    axios.post.mockResolvedValue({ data: { expires_in: 600 } });
    await setup();
    fireEvent.click(viewButton('INV-1'));
    await typeAndUnlock();
    await screen.findByText('Paracetamol 500');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Lock now/ }));
    await waitFor(() => expect(screen.queryByText('Paracetamol 500')).not.toBeInTheDocument());
    expect(axios.post.mock.calls.at(-1)[0]).toMatch(/\/api\/admin\/lab-reports\/lock$/);
    expect(screen.getByText('Billing details are locked.')).toBeInTheDocument();
    expect(sessionStorage.getItem('lab_view_unlocked_until')).toBeNull();
  });

  it('cancelling the password prompt fetches nothing', async () => {
    await setup();
    fireEvent.click(viewButton('INV-1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Password')).not.toBeInTheDocument());
    expect(detailCalls()).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('never asks the server for the lines when the list loads', async () => {
    await setup();
    expect(detailCalls()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Paracetamol|Complete Blood Count/);
  });
});
