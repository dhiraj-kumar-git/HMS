import React from 'react';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminReports from './AdminReports';
import { hashPassword } from '../../utils/labViewAccess';

jest.mock('axios');
jest.mock('../../utils/utils', () => ({
  ...jest.requireActual('../../utils/utils'),
  getDateISTString: () => '2026-10-25',
}));

const row = (i) => ({
  visit_id: `v${i}`, time: '2026-10-20T09:00', status: 'partially_completed', institute_id: `H${100 + i}`,
  patient_name: `PATIENT ${i}`, patient_type: 'Student', doctor_username: 'drx', doctor_name: 'Dr. X',
  tests_total: 2, tests_completed: 1, tests_cancelled: 0, report_files: 1, report_typed: 1,
});
const SEARCH = {
  page: 1, limit: 25, total: 2, total_pages: 1, export_limit: 10000, filters: {}, rows: [row(1), row(2)],
  summary: { awaiting_payment: 0, pending: 0, in_progress: 0, partially_completed: 2, completed: 0, cancelled: 0, total: 2 },
};
const DETAIL = {
  visit_id: 'v1', time: '2026-10-20T10:00', status: 'partially_completed', institute_id: 'H101', patient_name: 'ANN LEE',
  patient_type: 'Student', gender: 'Female', doctor_name: 'Dr. X',
  tests: [{ name: 'Hemoglobin', status: 'completed', ordered_at: '' }, { name: 'Blood Sugar', status: 'pending', ordered_at: '' }],
  reports: [
    { index: 0, kind: 'file', test_name: 'Hemoglobin', file_name: 'hb.pdf', saved_at: '2026-10-20T05:00:00+00:00', uploaded_by: 'lab1' },
    { index: 1, kind: 'typed', test_name: 'Blood Sugar', saved_at: '2026-10-20T05:30:00+00:00', uploaded_by: null, remarks: 'fasting sample',
      results: [{ name: 'Glucose', value: '99', reference_range: '70-110', units: 'mg/dl' }] },
  ],
};
const UNTIL_KEY = 'lab_view_unlocked_until';

const failure = (status, data) => ({ response: { status, data } });
let handlers;
const wire = (over = {}) => {
  handlers = {
    unlock: () => Promise.resolve({ data: { unlocked: true, expires_in: 600 } }),
    lock: () => Promise.resolve({ data: { locked: true } }),
    details: () => Promise.resolve({ data: DETAIL }),
    file: () => Promise.resolve({ data: new Blob(['%PDF']) }),
    ...over,
  };
  axios.get.mockImplementation((url, config) => {
    if (url.includes('/lab-reports/doctors')) return Promise.resolve({ data: [] });
    if (url.includes('/lab-reports/search')) return Promise.resolve({ data: SEARCH });
    if (url.includes('/details')) return handlers.details(url, config);
    if (url.includes('/file/')) return handlers.file(url, config);
    return Promise.reject(new Error(`unmocked ${url}`));
  });
  axios.post.mockImplementation((url, body, config) => {
    if (url.includes('/lab-reports/unlock')) return handlers.unlock(url, body, config);
    if (url.includes('/lab-reports/lock')) return handlers.lock(url, body, config);
    return Promise.reject(new Error(`unmocked ${url}`));
  });
};
const detailCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/details'));
const fileCalls = () => axios.get.mock.calls.filter(([u]) => u.includes('/file/'));
const unlockCalls = () => axios.post.mock.calls.filter(([u]) => u.includes('/unlock'));

const openPage = async () => {
  render(<ChakraProvider><AdminReports /></ChakraProvider>);
  await screen.findByText('Patient 1');
};
const viewDetailsOf = (name) => fireEvent.click(screen.getByRole('button', { name: `View details of ${name}` }));
const typePassword = (value) => fireEvent.change(screen.getByPlaceholderText('Your admin password'), { target: { value } });
const submitPassword = () => fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
const unlockWith = async (value = 'secret') => {
  typePassword(value);
  submitPassword();
};

describe('Admin Reports - password-protected results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'admin-token');
    sessionStorage.clear();
    window.open = jest.fn();
    global.URL.createObjectURL = jest.fn(() => 'blob:report');
    wire();
  });
  afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

  describe('before the password', () => {
    it('lists the orders with a button on each, and asks the server for no details', async () => {
      await openPage();
      expect(screen.getAllByRole('button', { name: /View details of/ })).toHaveLength(2);
      expect(detailCalls()).toHaveLength(0);
      expect(screen.queryByText(/unlocked/i)).not.toBeInTheDocument();
    });

    it('clicking a row button asks for the password and shows nothing yet', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      expect(await screen.findByText('Enter your password')).toBeInTheDocument();
      expect(screen.getByText(/stay available for 10 minutes/)).toBeInTheDocument();
      expect(detailCalls()).toHaveLength(0);
      expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument();
    });

    it('Cancel closes the prompt and loads nothing', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByPlaceholderText('Your admin password')).not.toBeInTheDocument());
      expect(detailCalls()).toHaveLength(0);
      expect(unlockCalls()).toHaveLength(0);
    });

    it('asks for a password before sending one', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      submitPassword();
      expect(await screen.findByText('Please enter your password.')).toBeInTheDocument();
      expect(unlockCalls()).toHaveLength(0);
    });
  });

  describe('entering the password', () => {
    it('sends the same SHA-256 value the login page sends, never the raw password', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith('MyPassw0rd');
      await waitFor(() => expect(unlockCalls()).toHaveLength(1));
      const [, body, config] = unlockCalls()[0];
      expect(body).toEqual({ password: hashPassword('MyPassw0rd') });
      expect(hashPassword('secret')).toBe('2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b');
      expect(JSON.stringify(body)).not.toContain('MyPassw0rd');
      expect(config.headers.Authorization).toBe('Bearer admin-token');
    });

    it('a wrong password shows a message, clears the field and shows nothing', async () => {
      wire({ unlock: () => Promise.reject(failure(403, { code: 'INCORRECT_PASSWORD', error: 'Incorrect password' })) });
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith('wrong');
      expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Your admin password')).toHaveValue('');
      expect(detailCalls()).toHaveLength(0);
      expect(screen.queryByText(/unlocked/i)).not.toBeInTheDocument();
    });

    it('too many wrong passwords shows the server message', async () => {
      wire({ unlock: () => Promise.reject(failure(429, { error: 'Too many wrong passwords. Please try again in 15 minutes.' })) });
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith();
      expect(await screen.findByText('Too many wrong passwords. Please try again in 15 minutes.')).toBeInTheDocument();
    });

    it('any other failure gets a plain message', async () => {
      wire({ unlock: () => Promise.reject(new Error('Network Error')) });
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith();
      expect(await screen.findByText('Could not check the password. Please try again.')).toBeInTheDocument();
    });

    it('the right password opens the order the admin clicked, with names and results', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith();
      const dialog = await screen.findByRole('dialog', { name: /Ann Lee/i });
      expect(detailCalls()[0][0]).toMatch(/\/api\/admin\/lab-reports\/v1\/details$/);
      expect(detailCalls()[0][1].headers.Authorization).toBe('Bearer admin-token');
      const tests = within(within(dialog).getByRole('table', { name: 'Tests ordered' }));
      expect(tests.getByText('Hemoglobin')).toBeInTheDocument();
      expect(tests.getByText('Blood Sugar')).toBeInTheDocument();
      expect(tests.getByText('COMPLETED')).toBeInTheDocument();
      expect(tests.getByText('PENDING')).toBeInTheDocument();
      const results = within(within(dialog).getByRole('table', { name: 'Results of Blood Sugar' }));
      expect(results.getByText('Glucose')).toBeInTheDocument();
      expect(results.getByText('99')).toBeInTheDocument();
      expect(results.getByText('70-110')).toBeInTheDocument();
      expect(results.getByText('mg/dl')).toBeInTheDocument();
      expect(within(dialog).getByText('fasting sample')).toBeInTheDocument();
      expect(within(dialog).getByText(/File: hb.pdf/)).toBeInTheDocument();
      expect(within(dialog).getByText('H101')).toBeInTheDocument();
      expect(within(dialog).getByText('Student · Female')).toBeInTheDocument();
    });

    it('once unlocked, other orders open without asking again', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith();
      await screen.findByRole('dialog', { name: /Ann Lee/i });
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));       // the footer button (the corner X has the same name)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      viewDetailsOf('PATIENT 2');
      await waitFor(() => expect(detailCalls()).toHaveLength(2));
      expect(detailCalls()[1][0]).toMatch(/\/v2\/details$/);
      expect(screen.queryByPlaceholderText('Your admin password')).not.toBeInTheDocument();
      expect(unlockCalls()).toHaveLength(1);
    });

    it('shows how long is left', async () => {
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByText('Enter your password');
      await unlockWith();
      expect(await screen.findByText(/Lab results are unlocked · 10:00 left|Lab results are unlocked · 9:5\d left/)).toBeInTheDocument();
    });
  });

  describe('the 10 minutes', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const startUnlocked = async () => {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + 10 * 60 * 1000));
      render(<ChakraProvider><AdminReports /></ChakraProvider>);
      await act(async () => { await Promise.resolve(); });
      await screen.findByText('Patient 1');
    };
    const openFirst = async () => {
      await act(async () => { viewDetailsOf('PATIENT 1'); });
      await screen.findByRole('dialog', { name: /Ann Lee/i });
    };

    it('counts down', async () => {
      await startUnlocked();
      expect(screen.getByText(/10:00 left/)).toBeInTheDocument();
      await act(async () => { jest.advanceTimersByTime(61 * 1000); });
      expect(screen.getByText(/8:59 left/)).toBeInTheDocument();
    });

    it('a window already open on arrival needs no password', async () => {
      await startUnlocked();
      await openFirst();
      expect(unlockCalls()).toHaveLength(0);
      expect(screen.getAllByText('Blood Sugar').length).toBeGreaterThan(0);
    });

    it('when the 10 minutes end, the results vanish from the screen at once', async () => {
      await startUnlocked();
      await openFirst();
      expect(screen.getByText('Glucose')).toBeInTheDocument();
      await act(async () => { jest.advanceTimersByTime(10 * 60 * 1000 + 1000); });
      await waitFor(() => expect(screen.queryByText('Glucose')).not.toBeInTheDocument());
      expect(screen.queryByText('Blood Sugar')).not.toBeInTheDocument();
      expect(screen.queryByText('Hemoglobin')).not.toBeInTheDocument();
      expect(screen.getByText('Your 10 minutes have ended. Lab results are locked again.')).toBeInTheDocument();
      expect(screen.queryByText(/unlocked/i)).not.toBeInTheDocument();
      expect(sessionStorage.getItem(UNTIL_KEY)).toBeNull();
    });

    it('after that the password is needed again', async () => {
      await startUnlocked();
      await act(async () => { jest.advanceTimersByTime(10 * 60 * 1000 + 1000); });
      await act(async () => { viewDetailsOf('PATIENT 2'); });
      expect(await screen.findByText('Enter your password')).toBeInTheDocument();
      expect(detailCalls()).toHaveLength(0);
    });

    it('an old window left in the browser is ignored', async () => {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() - 1000));
      render(<ChakraProvider><AdminReports /></ChakraProvider>);
      await act(async () => { await Promise.resolve(); });
      await screen.findByText('Patient 1');
      expect(screen.queryByText(/unlocked/i)).not.toBeInTheDocument();
    });

    it('Lock now ends it, tells the server, and asks again next time', async () => {
      await startUnlocked();
      await openFirst();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Lock now/ })); });
      await waitFor(() => expect(axios.post.mock.calls.some(([u]) => u.includes('/lab-reports/lock'))).toBe(true));
      await waitFor(() => expect(screen.queryByText('Glucose')).not.toBeInTheDocument());
      expect(screen.getByText('Lab results are locked.')).toBeInTheDocument();
      expect(sessionStorage.getItem(UNTIL_KEY)).toBeNull();
      await act(async () => { viewDetailsOf('PATIENT 1'); });
      expect(await screen.findByText('Enter your password')).toBeInTheDocument();
    });

    it('Lock now still locks the screen if the server cannot be reached', async () => {
      wire({ lock: () => Promise.reject(new Error('offline')) });
      await startUnlocked();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Lock now/ })); });
      await waitFor(() => expect(screen.getByText('Lab results are locked.')).toBeInTheDocument());
    });

    it('stops its clock when the page is left', async () => {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + 10 * 60 * 1000));
      const { unmount } = render(<ChakraProvider><AdminReports /></ChakraProvider>);
      await act(async () => { await Promise.resolve(); });
      await screen.findByText('Patient 1');
      const running = jest.getTimerCount();
      unmount();
      expect(jest.getTimerCount()).toBeLessThan(running);
    });
  });

  describe('when the server says the window is closed', () => {
    it('asks for the password again and then continues with the same order', async () => {
      let first = true;
      wire({ details: () => (first ? (first = false, Promise.reject(failure(403, { code: 'LAB_VIEW_LOCKED' }))) : Promise.resolve({ data: DETAIL })) });
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));      // the browser thinks it is still open
      await openPage();
      viewDetailsOf('PATIENT 1');
      expect(await screen.findByText('Enter your password')).toBeInTheDocument();
      expect(screen.getAllByText('Your 10 minutes have ended. Please enter your password again.').length).toBeGreaterThan(0);
      await unlockWith();
      await screen.findByRole('dialog', { name: /Ann Lee/i });
      expect(detailCalls().map(([u]) => u.match(/\/(v\d)\//)[1])).toEqual(['v1', 'v1']);
    });
  });

  describe('files', () => {
    const openDetails = async () => {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));
      await openPage();
      viewDetailsOf('PATIENT 1');
      await screen.findByRole('dialog', { name: /Ann Lee/i });
    };

    it('opens an uploaded file from its position, never a storage key', async () => {
      await openDetails();
      fireEvent.click(screen.getByRole('button', { name: 'View file' }));
      await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:report', '_blank'));
      const [url, config] = fileCalls()[0];
      expect(url).toMatch(/\/api\/admin\/lab-reports\/v1\/file\/0$/);
      expect(config.responseType).toBe('blob');
      expect(config.headers.Authorization).toBe('Bearer admin-token');
    });

    it('typed results have no file button', async () => {
      await openDetails();
      expect(screen.getAllByRole('button', { name: 'View file' })).toHaveLength(1);
    });

    it('a file that cannot be opened says so and keeps the results on screen', async () => {
      wire({ file: () => Promise.reject(failure(500, { error: 'Could not open the report file' })) });
      await openDetails();
      fireEvent.click(screen.getByRole('button', { name: 'View file' }));
      expect(await screen.findByText('Could not open the file. Please try again.')).toBeInTheDocument();
      expect(screen.getByText('Glucose')).toBeInTheDocument();
      expect(window.open).not.toHaveBeenCalled();
    });

    it('a file request after the window closed asks for the password again', async () => {
      wire({ file: () => Promise.reject(failure(403, { code: 'LAB_VIEW_LOCKED' })) });
      await openDetails();
      fireEvent.click(screen.getByRole('button', { name: 'View file' }));
      expect(await screen.findByText('Enter your password')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Glucose')).not.toBeInTheDocument());
    });
  });

  describe('problems loading an order', () => {
    const open = async () => {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));
      await openPage();
      viewDetailsOf('PATIENT 1');
    };

    it('not found', async () => {
      wire({ details: () => Promise.reject(failure(404, { error: 'Lab order not found' })) });
      await open();
      expect(await screen.findByText('This lab order was not found.')).toBeInTheDocument();
    });

    it('server or network failure', async () => {
      wire({ details: () => Promise.reject(new Error('Network Error')) });
      await open();
      expect(await screen.findByText('Could not load the lab report. Please try again.')).toBeInTheDocument();
    });

    it('an order with no saved report yet', async () => {
      wire({ details: () => Promise.resolve({ data: { ...DETAIL, reports: [] } }) });
      await open();
      expect(await screen.findByText('No report has been saved for this order yet.')).toBeInTheDocument();
    });

    it('a typed report with no values', async () => {
      wire({ details: () => Promise.resolve({ data: { ...DETAIL, reports: [{ ...DETAIL.reports[1], results: [], remarks: '' }] } }) });
      await open();
      expect(await screen.findByText('No values were saved.')).toBeInTheDocument();
    });

    it('blank values show a dash', async () => {
      wire({ details: () => Promise.resolve({ data: { ...DETAIL, reports: [{ ...DETAIL.reports[1], results: [{ name: 'Glucose', value: '', reference_range: '', units: '' }] }] } }) });
      await open();
      const table = within(await screen.findByRole('table', { name: 'Results of Blood Sugar' }));
      expect(table.getAllByText('—')).toHaveLength(3);
    });
  });

  it('the status list itself still never contains names or results', async () => {
    await openPage();
    const text = document.body.textContent;
    for (const word of ['Hemoglobin', 'Blood Sugar', 'Glucose', 'hb.pdf']) expect(text).not.toContain(word);
  });
});
