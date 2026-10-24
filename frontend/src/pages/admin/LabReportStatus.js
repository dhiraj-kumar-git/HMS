import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Flex, Text, Input, Select, Button, FormControl, FormLabel, Table, Thead, Tbody, Tr, Th, Td, Badge,
  Spinner, Alert, AlertIcon, AlertDescription, SimpleGrid, useDisclosure,
} from '@chakra-ui/react';
import { FiSearch, FiDownload, FiRotateCcw, FiUnlock, FiLock } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatReceptionistDateTime, toTitleCase, getDateISTString } from '../../utils/utils';
import { LAB_STATUS, labStatusInfo } from './labStatusStyles';
import { PasswordPrompt, LabDetailsModal } from './LabResultViewer';
import {
  getUnlockedUntil, clearLabViewUnlock, lockLabView, fetchLabDetails, openLabFile, isLabViewLocked,
} from '../../utils/labViewAccess';

const PAGE_SIZE = 25;
const DEFAULT_RANGE_DAYS = 30;

const defaultFilters = () => {
  const end = getDateISTString();
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
  return { start_date: start.toISOString().slice(0, 10), end_date: end, status: 'all', doctor: 'all', q: '' };
};

// Only send the filters that are actually set
const toParams = (f) => {
  const params = { start_date: f.start_date, end_date: f.end_date };
  if (f.status !== 'all') params.status = f.status;
  if (f.doctor !== 'all') params.doctor = f.doctor;
  if (f.q.trim()) params.q = f.q.trim();
  return params;
};

const reportSummary = (r) => {
  const parts = [];
  if (r.report_files) parts.push(`${r.report_files} file${r.report_files === 1 ? '' : 's'}`);
  if (r.report_typed) parts.push(`${r.report_typed} typed`);
  return parts.length ? parts.join(' · ') : '—';
};

export default function LabReportStatus() {
  const [filters, setFilters] = useState(defaultFilters);
  const applied = useRef(filters);               // the filters the results on screen belong to
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState(null);

  // ---- the 10-minute window for seeing test names and results
  const [unlockedUntil, setUnlockedUntil] = useState(getUnlockedUntil);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(Math.ceil((getUnlockedUntil() - Date.now()) / 1000), 0));
  const [lockedNote, setLockedNote] = useState('');
  const passwordPrompt = useDisclosure();
  const detailsModal = useDisclosure();
  const wantedVisit = useRef(null);               // the order the admin clicked before being asked for the password
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [fileError, setFileError] = useState('');
  const unlocked = unlockedUntil > 0;

  // results disappear from the screen the moment the window ends or is closed
  const relock = useCallback((message = '') => {
    clearLabViewUnlock();
    setUnlockedUntil(0);
    setSecondsLeft(0);
    setDetail(null);
    setDetailError('');
    setFileError('');
    detailsModal.onClose();
    setLockedNote(message);
  }, [detailsModal]);

  useEffect(() => {
    if (!unlockedUntil) return undefined;
    const tick = () => {
      const left = Math.ceil((unlockedUntil - Date.now()) / 1000);
      if (left <= 0) relock('Your 10 minutes have ended. Lab results are locked again.');
      else setSecondsLeft(left);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [unlockedUntil, relock]);

  const loadDetails = async (visitId) => {
    setDetail(null);
    setDetailError('');
    setFileError('');
    setDetailLoading(true);
    detailsModal.onOpen();
    try {
      setDetail(await fetchLabDetails(visitId));
    } catch (err) {
      if (isLabViewLocked(err)) {
        // the server's window ended (or never existed): ask for the password again
        wantedVisit.current = visitId;
        relock('Your 10 minutes have ended. Please enter your password again.');
        passwordPrompt.onOpen();
      } else {
        setDetailError(err.response?.status === 404 ? 'This lab order was not found.' : 'Could not load the lab report. Please try again.');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const viewDetails = (visitId) => {
    setLockedNote('');
    if (unlocked) {
      loadDetails(visitId);
    } else {
      wantedVisit.current = visitId;
      passwordPrompt.onOpen();
    }
  };

  const handleUnlocked = (until) => {
    setUnlockedUntil(until);
    setSecondsLeft(Math.ceil((until - Date.now()) / 1000));
    setLockedNote('');
    passwordPrompt.onClose();
    if (wantedVisit.current) {
      const visitId = wantedVisit.current;
      wantedVisit.current = null;
      loadDetails(visitId);
    }
  };

  const lockNow = async () => {
    await lockLabView();
    relock('Lab results are locked.');
  };

  const viewFile = async (index) => {
    setFileError('');
    try {
      await openLabFile(detail.visit_id, index);
    } catch (err) {
      if (isLabViewLocked(err)) {
        wantedVisit.current = detail.visit_id;
        relock('Your 10 minutes have ended. Please enter your password again.');
        passwordPrompt.onOpen();
      } else {
        setFileError('Could not open the file. Please try again.');
      }
    }
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
      const res = await axios.get(`${BASE_URL}/api/admin/lab-reports/search`, {
        headers: authHeaders(),
        params: { ...toParams(f), page, limit: PAGE_SIZE },
      });
      applied.current = f;
      setResult(res.data);
      setError('');
      setExportNote(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the lab reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(filters, 1);
    (async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/admin/lab-reports/doctors`, { headers: authHeaders() });
        setDoctors(Array.isArray(res.data) ? res.data : []);
      } catch {
        setDoctors([]);
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
      const res = await axios.get(`${BASE_URL}/api/admin/lab-reports/export`, {
        headers: authHeaders(),
        params: toParams(applied.current),
        responseType: 'blob',
      });
      const disposition = res.headers?.['content-disposition'] || '';
      const filename = (disposition.match(/filename="?([^";]+)"?/) || [])[1] || 'lab_reports.csv';
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (res.headers?.['x-export-truncated'] === 'true') {
        setExportNote({ status: 'warning', text: `The file holds only the first ${result?.export_limit?.toLocaleString('en-IN') || ''} orders. Narrow the dates to get the rest.` });
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
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + rows.length;
  const activeStatus = applied.current.status;

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
          <FormControl maxW="190px">
            <FormLabel fontSize="xs">STATUS</FormLabel>
            <Select size="sm" aria-label="Status" value={filters.status} onChange={setField('status')}>
              <option value="all">All statuses</option>
              {Object.entries(LAB_STATUS).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="200px">
            <FormLabel fontSize="xs">ORDERING DOCTOR</FormLabel>
            <Select size="sm" aria-label="Doctor" value={filters.doctor} onChange={setField('doctor')}>
              <option value="all">All doctors</option>
              {doctors.map((d) => <option key={d.username} value={d.username}>{d.name}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="240px">
            <FormLabel fontSize="xs">PATIENT NAME OR ID</FormLabel>
            <Input size="sm" aria-label="Patient name or ID" maxLength={100} value={filters.q} onChange={setField('q')} placeholder="e.g. Ann or 2025H1120147P" />
          </FormControl>
          <Button type="submit" size="sm" colorScheme="blue" leftIcon={<FiSearch />} isLoading={loading}>Search</Button>
          <Button size="sm" variant="outline" leftIcon={<FiRotateCcw />} onClick={reset}>Reset</Button>
        </Flex>
        {formError && <Text color="red.500" fontSize="sm" mt={2}>{formError}</Text>}
      </Box>

      {summary && (
        <SimpleGrid columns={{ base: 2, md: 4, lg: 7 }} spacing={3} mb={4}>
          <Box as="button" type="button" onClick={() => pickStatus('all')} aria-pressed={activeStatus === 'all'}
            textAlign="left" bg="white" p={3} borderRadius="lg" boxShadow="sm" borderTop="3px solid" borderColor="gray.400"
            outline={activeStatus === 'all' ? '2px solid' : 'none'} outlineColor="blue.400">
            <Text fontSize="xs" color="gray.600">All orders</Text>
            <Text fontSize="2xl" fontWeight="bold">{summary.total}</Text>
          </Box>
          {Object.entries(LAB_STATUS).map(([key, info]) => (
            <Box key={key} as="button" type="button" onClick={() => pickStatus(key)} aria-pressed={activeStatus === key}
              textAlign="left" bg="white" p={3} borderRadius="lg" boxShadow="sm" borderTop="3px solid" borderColor={`${info.color}.400`}
              outline={activeStatus === key ? '2px solid' : 'none'} outlineColor="blue.400">
              <Text fontSize="xs" color="gray.600">{info.label}</Text>
              <Text fontSize="2xl" fontWeight="bold">{summary[key] ?? 0}</Text>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {unlocked ? (
        <Alert status="success" borderRadius="md" mb={4} variant="subtle">
          <AlertIcon as={FiUnlock} />
          <AlertDescription flex="1">
            Lab results are unlocked · {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
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
            <Text fontWeight="bold">
              {result ? `${total.toLocaleString('en-IN')} lab order${total === 1 ? '' : 's'}` : 'Lab orders'}
            </Text>
            <Text fontSize="xs" color="gray.500">Test names and results are hidden. They need your password.</Text>
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
                <Tr><Th>Date & Time</Th><Th>Patient</Th><Th>Institute ID</Th><Th>Doctor</Th><Th>Tests done</Th><Th>Reports</Th><Th>Status</Th><Th /></Tr>
              </Thead>
              <Tbody>
                {rows.length === 0 && (
                  <Tr><Td colSpan={8}><Text color="gray.500" py={6} textAlign="center">No lab orders match these filters.</Text></Td></Tr>
                )}
                {rows.map((r) => {
                  const info = labStatusInfo(r.status);
                  return (
                    <Tr key={r.visit_id}>
                      <Td fontWeight="bold" whiteSpace="nowrap">{formatReceptionistDateTime(r.time)}</Td>
                      <Td>
                        <Text fontWeight="bold">{r.patient_name ? toTitleCase(r.patient_name) : 'Unknown patient'}</Text>
                        {r.patient_type && <Text fontSize="xs" color="gray.500">{r.patient_type}</Text>}
                      </Td>
                      <Td>{r.institute_id}</Td>
                      <Td>{r.doctor_name || r.doctor_username}</Td>
                      <Td whiteSpace="nowrap">
                        {r.tests_completed} of {r.tests_total}
                        {r.tests_cancelled > 0 && <Text as="span" fontSize="xs" color="gray.500"> ({r.tests_cancelled} cancelled)</Text>}
                      </Td>
                      <Td whiteSpace="nowrap">{reportSummary(r)}</Td>
                      <Td><Badge colorScheme={info.color}>{info.label.toUpperCase()}</Badge></Td>
                      <Td isNumeric>
                        <Button size="xs" colorScheme="teal" variant="outline" leftIcon={unlocked ? <FiUnlock /> : <FiLock />}
                          aria-label={`View details of ${r.patient_name || r.institute_id}`} onClick={() => viewDetails(r.visit_id)}>
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
        onClose={() => { wantedVisit.current = null; passwordPrompt.onClose(); }} onUnlocked={handleUnlocked} />
      {/* taken off the page the moment it closes (no fade-out), so results are never left behind in the page */}
      {detailsModal.isOpen && (
        <LabDetailsModal isOpen onClose={detailsModal.onClose} detail={detail} loading={detailLoading}
          error={detailError} fileError={fileError} onOpenFile={viewFile} onLockNow={lockNow} />
      )}
    </Box>
  );
}
