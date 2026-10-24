import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Flex, Text, Input, Select, Button, FormControl, FormLabel, Table, Thead, Tbody, Tr, Th, Td, Badge,
  Spinner, Alert, AlertIcon, AlertDescription, SimpleGrid, useDisclosure,
} from '@chakra-ui/react';
import { FiSearch, FiDownload, FiRotateCcw, FiUnlock, FiLock } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatReceptionistDateTime, toTitleCase, getDateISTString } from '../../utils/utils';
import { PasswordPrompt } from './LabResultViewer';
import BillDetailsModal from './BillDetailsModal';
import {
  getUnlockedUntil, clearLabViewUnlock, lockLabView, fetchBillDetails, isLabViewLocked,
} from '../../utils/labViewAccess';
import { BILL_STATUS, billStatusInfo, categoryLabel, rupees } from './billStatusStyles';

const PAGE_SIZE = 25;
const DEFAULT_RANGE_DAYS = 30;

const defaultFilters = () => {
  const end = getDateISTString();
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
  return {
    start_date: start.toISOString().slice(0, 10), end_date: end, status: 'all', category: 'all',
    payment_mode: 'all', patient_type: 'all', doctor: 'all', q: '',
  };
};

// Only send the filters that are actually set
const toParams = (f) => {
  const params = { start_date: f.start_date, end_date: f.end_date };
  ['status', 'category', 'payment_mode', 'patient_type', 'doctor'].forEach((key) => {
    if (f[key] !== 'all') params[key] = f[key];
  });
  if (f.q.trim()) params.q = f.q.trim();
  return params;
};

export default function BillingStatus() {
  const [filters, setFilters] = useState(defaultFilters);
  const applied = useRef(filters);               // the filters the results on screen belong to
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [options, setOptions] = useState({ doctors: [], payment_modes: [], patient_types: [] });
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState(null);

  // ---- the 10-minute password window (the same one as for lab results) for seeing what was billed
  const [unlockedUntil, setUnlockedUntil] = useState(getUnlockedUntil);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(Math.ceil((getUnlockedUntil() - Date.now()) / 1000), 0));
  const [lockedNote, setLockedNote] = useState('');
  const passwordPrompt = useDisclosure();
  const detailsModal = useDisclosure();
  const wantedBill = useRef(null);                // the bill the admin clicked before being asked for the password
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const unlocked = unlockedUntil > 0;

  // the lines disappear from the screen the moment the window ends or is closed
  const relock = useCallback((message = '') => {
    clearLabViewUnlock();
    setUnlockedUntil(0);
    setSecondsLeft(0);
    setDetail(null);
    setDetailError('');
    detailsModal.onClose();
    setLockedNote(message);
  }, [detailsModal]);

  useEffect(() => {
    if (!unlockedUntil) return undefined;
    const tick = () => {
      const left = Math.ceil((unlockedUntil - Date.now()) / 1000);
      if (left <= 0) relock('Your 10 minutes have ended. Billing details are locked again.');
      else setSecondsLeft(left);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [unlockedUntil, relock]);

  const loadDetails = async (bill) => {
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    detailsModal.onOpen();
    try {
      setDetail(await fetchBillDetails(bill.kind, bill.key));
    } catch (err) {
      if (isLabViewLocked(err)) {
        wantedBill.current = bill;
        relock('Your 10 minutes have ended. Please enter your password again.');
        passwordPrompt.onOpen();
      } else {
        setDetailError(err.response?.status === 404 ? 'This bill was not found.' : 'Could not load the bill. Please try again.');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const viewDetails = (bill) => {
    setLockedNote('');
    if (unlocked) {
      loadDetails(bill);
    } else {
      wantedBill.current = bill;
      passwordPrompt.onOpen();
    }
  };

  const handleUnlocked = (until) => {
    setUnlockedUntil(until);
    setSecondsLeft(Math.ceil((until - Date.now()) / 1000));
    setLockedNote('');
    passwordPrompt.onClose();
    if (wantedBill.current) {
      const bill = wantedBill.current;
      wantedBill.current = null;
      loadDetails(bill);
    }
  };

  const lockNow = async () => {
    await lockLabView();
    relock('Billing details are locked.');
  };

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const runSearch = useCallback(async (f, page = 1) => {
    if (!f.start_date || !f.end_date) {
      setFormError('Please choose both a From and a To date.');
      return;
    }
    if (f.start_date > f.end_date) {
      setFormError('The From date must not be after the To date.');
      return;
    }
    setFormError('');
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/admin/billing/search`, {
        headers: authHeaders(),
        params: { ...toParams(f), page, limit: PAGE_SIZE },
      });
      applied.current = f;
      setResult(res.data);
      setError('');
      setExportNote(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the billing information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(filters, 1);
    (async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/admin/billing/filters`, { headers: authHeaders() });
        setOptions({ doctors: res.data?.doctors || [], payment_modes: res.data?.payment_modes || [], patient_types: res.data?.patient_types || [] });
      } catch {
        /* the drop-downs just keep their "All" choice */
      }
    })();
    // first load only: later searches start from the buttons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const submit = (e) => {
    e?.preventDefault();
    runSearch(filters, 1);
  };
  const reset = () => {
    const fresh = defaultFilters();
    setFilters(fresh);
    runSearch(fresh, 1);
  };
  // clicking a status card narrows the list to that status, keeping the other filters that are on screen
  const pickStatus = (status) => {
    const next = { ...applied.current, status };
    setFilters(next);
    runSearch(next, 1);
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportNote(null);
    try {
      const res = await axios.get(`${BASE_URL}/api/admin/billing/export`, {
        headers: authHeaders(),
        params: toParams(applied.current),
        responseType: 'blob',
      });
      const disposition = res.headers?.['content-disposition'] || '';
      const filename = (disposition.match(/filename="?([^";]+)"?/) || [])[1] || 'billing.csv';
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (res.headers?.['x-export-truncated'] === 'true') {
        setExportNote({ status: 'warning', text: `The file holds only the first ${result?.export_limit?.toLocaleString('en-IN') || ''} rows. Narrow the dates to get the rest.` });
      }
    } catch (err) {
      setExportNote({ status: 'error', text: 'Could not download the file. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const rows = result?.rows || [];
  const page = result?.page || 1;
  const total = result?.total || 0;
  const summary = result?.summary;
  const counts = summary?.counts;
  const money = summary?.paid_amount;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + rows.length;
  const activeStatus = applied.current.status;
  const paymentModeOn = applied.current.payment_mode !== 'all';

  const statusCard = (key, label, color, value) => (
    <Box key={key} as="button" type="button" onClick={() => pickStatus(key)} aria-pressed={activeStatus === key}
      textAlign="left" bg="white" p={3} borderRadius="lg" boxShadow="sm" borderTop="3px solid" borderColor={`${color}.400`}
      outline={activeStatus === key ? '2px solid' : 'none'} outlineColor="blue.400">
      <Text fontSize="xs" color="gray.600">{label}</Text>
      <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    </Box>
  );

  return (
    <Box>
      <Box as="form" onSubmit={submit} bg="white" p={4} borderRadius="lg" boxShadow="sm" mb={4}>
        <Flex gap={3} wrap="wrap" align="flex-end">
          <FormControl maxW="160px">
            <FormLabel fontSize="xs">FROM</FormLabel>
            <Input size="sm" type="date" aria-label="From date" value={filters.start_date} onChange={setField('start_date')} />
          </FormControl>
          <FormControl maxW="160px">
            <FormLabel fontSize="xs">TO</FormLabel>
            <Input size="sm" type="date" aria-label="To date" value={filters.end_date} onChange={setField('end_date')} />
          </FormControl>
          <FormControl maxW="150px">
            <FormLabel fontSize="xs">STATUS</FormLabel>
            <Select size="sm" aria-label="Status" value={filters.status} onChange={setField('status')}>
              <option value="all">All statuses</option>
              {Object.entries(BILL_STATUS).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="150px">
            <FormLabel fontSize="xs">CATEGORY</FormLabel>
            <Select size="sm" aria-label="Category" value={filters.category} onChange={setField('category')}>
              <option value="all">All</option>
              <option value="medicine">Medicines</option>
              <option value="lab_test">Lab tests</option>
            </Select>
          </FormControl>
          <FormControl maxW="150px">
            <FormLabel fontSize="xs">PAYMENT MODE</FormLabel>
            <Select size="sm" aria-label="Payment mode" value={filters.payment_mode} onChange={setField('payment_mode')}>
              <option value="all">Any</option>
              {options.payment_modes.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="150px">
            <FormLabel fontSize="xs">PATIENT TYPE</FormLabel>
            <Select size="sm" aria-label="Patient type" value={filters.patient_type} onChange={setField('patient_type')}>
              <option value="all">Any</option>
              {options.patient_types.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="190px">
            <FormLabel fontSize="xs">DOCTOR</FormLabel>
            <Select size="sm" aria-label="Doctor" value={filters.doctor} onChange={setField('doctor')}>
              <option value="all">All doctors</option>
              {options.doctors.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="250px">
            <FormLabel fontSize="xs">PATIENT NAME, ID OR INVOICE</FormLabel>
            <Input size="sm" aria-label="Patient name, ID or invoice" maxLength={100} value={filters.q} onChange={setField('q')} placeholder="e.g. Ann, 2025H1120147P or INV-20261024-0001" />
          </FormControl>
          <Button type="submit" size="sm" colorScheme="blue" leftIcon={<FiSearch />} isLoading={loading}>Search</Button>
          <Button size="sm" variant="outline" leftIcon={<FiRotateCcw />} onClick={reset}>Reset</Button>
        </Flex>
        {formError && <Text color="red.500" fontSize="sm" mt={2}>{formError}</Text>}
      </Box>

      {summary && (
        <>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={3}>
            {statusCard('all', 'All bills', 'gray', counts.total)}
            {Object.entries(BILL_STATUS).map(([key, info]) => statusCard(key, info.label, info.color, counts[key] ?? 0))}
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mb={2}>
            {[['Collected', money.total, 'All paid bills'], ['Reimbursed by the institute', money.reimbursed, 'Faculty, staff and dependants'], ['Paid by patients', money.self_paid, 'After reimbursement']].map(([label, value, note]) => (
              <Box key={label} bg="white" p={3} borderRadius="lg" boxShadow="sm">
                <Text fontSize="xs" color="gray.600">{label}</Text>
                <Text fontSize="xl" fontWeight="bold">{rupees(value)}</Text>
                <Text fontSize="xs" color="gray.500">{note} · {counts.paid} paid bill{counts.paid === 1 ? '' : 's'}</Text>
              </Box>
            ))}
          </SimpleGrid>
          <Text fontSize="xs" color="gray.500" mb={4}>
            Pending and cancelled bills have no amount yet, so they are only counted and are never part of these totals.
            {paymentModeOn && ' A payment mode is chosen, so pending and cancelled bills (which have none) are left out.'}
          </Text>
        </>
      )}

      {unlocked ? (
        <Alert status="success" borderRadius="md" mb={4} variant="subtle">
          <AlertIcon as={FiUnlock} />
          <AlertDescription flex="1">
            Billing details are unlocked · {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
          </AlertDescription>
          <Button size="xs" leftIcon={<FiLock />} onClick={lockNow}>Lock now</Button>
        </Alert>
      ) : lockedNote ? (
        <Alert status="info" borderRadius="md" mb={4} variant="subtle"><AlertIcon />{lockedNote}</Alert>
      ) : null}

      {error && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          <AlertDescription flex="1">{error}</AlertDescription>
          <Button size="xs" onClick={() => runSearch(applied.current, page)}>Try again</Button>
        </Alert>
      )}

      <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
        <Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={2}>
          <Box>
            <Text fontWeight="bold">{result ? `${total.toLocaleString('en-IN')} bill${total === 1 ? '' : 's'}` : 'Bills'}</Text>
            <Text fontSize="xs" color="gray.500">What was billed (medicine and test names) stays hidden. It needs your password.</Text>
          </Box>
          <Button size="sm" leftIcon={<FiDownload />} onClick={exportCsv} isLoading={exporting} isDisabled={!result || total === 0 || loading}>
            Download CSV
          </Button>
        </Flex>
        {result && total > result.export_limit && (
          <Text fontSize="xs" color="orange.600" mb={2}>
            The CSV holds at most the {result.export_limit.toLocaleString('en-IN')} newest of these. Narrow the dates to export everything.
          </Text>
        )}
        {exportNote && (
          <Alert status={exportNote.status} borderRadius="md" mb={3} fontSize="sm">
            <AlertIcon />{exportNote.text}
          </Alert>
        )}

        {loading && !result ? (
          <Flex justify="center" py={10}><Spinner size="lg" color="blue.500" /></Flex>
        ) : (
          <Box overflowX="auto" opacity={loading ? 0.5 : 1}>
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Date & Time</Th><Th>Status</Th><Th>Invoice</Th><Th>Patient</Th><Th>Institute ID</Th><Th>Doctor</Th>
                  <Th>Category</Th><Th>Payment</Th><Th isNumeric>Items</Th><Th isNumeric>Total</Th><Th isNumeric>Reimbursed</Th><Th isNumeric>Paid by patient</Th><Th>Details</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.length === 0 && (
                  <Tr><Td colSpan={13}><Text color="gray.500" py={6} textAlign="center">No bills match these filters.</Text></Td></Tr>
                )}
                {rows.map((r) => {
                  const info = billStatusInfo(r.status);
                  return (
                    <Tr key={`${r.kind}-${r.key}`}>
                      <Td fontWeight="bold" whiteSpace="nowrap">{formatReceptionistDateTime(r.date)}</Td>
                      <Td><Badge colorScheme={info.color}>{info.label.toUpperCase()}</Badge></Td>
                      <Td whiteSpace="nowrap">{r.invoice_no || '—'}</Td>
                      <Td>
                        <Text fontWeight="bold">{r.patient_name ? toTitleCase(r.patient_name) : 'Unknown patient'}</Text>
                        {r.patient_type && <Text fontSize="xs" color="gray.500">{r.patient_type}</Text>}
                      </Td>
                      <Td>{r.institute_id}</Td>
                      <Td>{r.doctor_name || '—'}</Td>
                      <Td whiteSpace="nowrap">{categoryLabel(r.category)}</Td>
                      <Td>{r.payment_mode || '—'}</Td>
                      <Td isNumeric>{r.item_count}</Td>
                      <Td isNumeric fontWeight="bold" whiteSpace="nowrap">{rupees(r.total_amount)}</Td>
                      <Td isNumeric whiteSpace="nowrap">{rupees(r.reimbursed_amount)}</Td>
                      <Td isNumeric whiteSpace="nowrap">{rupees(r.self_paid_amount)}</Td>
                      <Td>
                        <Button size="xs" colorScheme="teal" variant="outline" leftIcon={unlocked ? <FiUnlock /> : <FiLock />}
                          aria-label={`View details of ${r.invoice_no || r.patient_name || r.institute_id}`} onClick={() => viewDetails(r)}>
                          View details
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
        )}

        {result && result.total_pages > 1 && (
          <Flex justify="space-between" align="center" mt={4}>
            <Text fontSize="sm" color="gray.500">Showing {first}–{last} of {total.toLocaleString('en-IN')}</Text>
            <Flex gap={2} align="center">
              <Button size="sm" isDisabled={page <= 1 || loading} onClick={() => runSearch(applied.current, page - 1)}>Previous</Button>
              <Text fontSize="sm">Page {page} of {result.total_pages}</Text>
              <Button size="sm" isDisabled={page >= result.total_pages || loading} onClick={() => runSearch(applied.current, page + 1)}>Next</Button>
            </Flex>
          </Flex>
        )}
      </Box>

      <PasswordPrompt isOpen={passwordPrompt.isOpen} notice={lockedNote}
        message="Billing details show which medicines and tests were billed. Enter your admin password to see them. They stay available for 10 minutes."
        onClose={() => { wantedBill.current = null; passwordPrompt.onClose(); }} onUnlocked={handleUnlocked} />

      {detailsModal.isOpen && (
        <BillDetailsModal isOpen onClose={detailsModal.onClose} detail={detail} loading={detailLoading}
          error={detailError} onLockNow={lockNow} />
      )}
    </Box>
  );
}
