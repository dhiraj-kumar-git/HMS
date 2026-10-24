import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Flex, Text, Input, Select, Button, FormControl, FormLabel, Table, Thead, Tbody, Tr, Th, Td, Badge,
  Spinner, Alert, AlertIcon, AlertDescription,
} from '@chakra-ui/react';
import { FiSearch, FiDownload, FiRotateCcw } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatReceptionistDateTime, toTitleCase, getDateISTString } from '../../utils/utils';
import { STATUS, statusInfo } from './appointmentStatus';

const PAGE_SIZE = 25;
const DEFAULT_RANGE_DAYS = 30;

const defaultFilters = () => {
  const end = getDateISTString();
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
  return { start_date: start.toISOString().slice(0, 10), end_date: end, status: 'all', doctor: 'all', booked_by: 'all', q: '' };
};

// Only send the filters that are actually set
const toParams = (f) => {
  const params = { start_date: f.start_date, end_date: f.end_date };
  if (f.status !== 'all') params.status = f.status;
  if (f.doctor !== 'all') params.doctor = f.doctor;
  if (f.booked_by !== 'all') params.booked_by = f.booked_by;
  if (f.q.trim()) params.q = f.q.trim();
  return params;
};

export default function AppointmentSearch() {
  const [filters, setFilters] = useState(defaultFilters);
  const applied = useRef(filters);             // the filters the results on screen belong to
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState(null);

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
      const res = await axios.get(`${BASE_URL}/api/admin/appointments/search`, {
        headers: authHeaders(),
        params: { ...toParams(f), page, limit: PAGE_SIZE },
      });
      applied.current = f;
      setResult(res.data);
      setError('');
      setExportNote(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not search appointments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(filters, 1);
    (async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/admin/appointments/doctors`, { headers: authHeaders() });
        setDoctors(Array.isArray(res.data) ? res.data : []);
      } catch {
        setDoctors([]);   // the doctor filter just stays on "All doctors"
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

  const exportCsv = async () => {
    setExporting(true);
    setExportNote(null);
    try {
      const res = await axios.get(`${BASE_URL}/api/admin/appointments/export`, {
        headers: authHeaders(),
        params: toParams(applied.current),
        responseType: 'blob',
      });
      const disposition = res.headers?.['content-disposition'] || '';
      const filename = (disposition.match(/filename="?([^";]+)"?/) || [])[1] || 'appointments.csv';
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (res.headers?.['x-export-truncated'] === 'true') {
        setExportNote({ status: 'warning', text: `The file holds only the first ${result?.export_limit?.toLocaleString('en-IN') || ''} appointments. Narrow the dates to get the rest.` });
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
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + rows.length;
  const overExportLimit = result && total > result.export_limit;

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
          <FormControl maxW="160px">
            <FormLabel fontSize="xs">STATUS</FormLabel>
            <Select size="sm" aria-label="Status" value={filters.status} onChange={setField('status')}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="200px">
            <FormLabel fontSize="xs">DOCTOR</FormLabel>
            <Select size="sm" aria-label="Doctor" value={filters.doctor} onChange={setField('doctor')}>
              <option value="all">All doctors</option>
              {doctors.map((d) => <option key={d.username} value={d.username}>{d.name}</option>)}
            </Select>
          </FormControl>
          <FormControl maxW="150px">
            <FormLabel fontSize="xs">BOOKED BY</FormLabel>
            <Select size="sm" aria-label="Booked by" value={filters.booked_by} onChange={setField('booked_by')}>
              <option value="all">Anyone</option>
              <option value="patient">Patient</option>
              <option value="receptionist">Receptionist</option>
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

      {error && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          <AlertDescription flex="1">{error}</AlertDescription>
          <Button size="xs" onClick={() => runSearch(applied.current, page)}>Try again</Button>
        </Alert>
      )}

      <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
        <Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={2}>
          <Text fontWeight="bold">
            {result ? `${total.toLocaleString('en-IN')} appointment${total === 1 ? '' : 's'} found` : 'Appointments'}
          </Text>
          <Button size="sm" leftIcon={<FiDownload />} onClick={exportCsv} isLoading={exporting}
            isDisabled={!result || total === 0 || loading}>
            Download CSV
          </Button>
        </Flex>
        {overExportLimit && (
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
                <Tr><Th>Date & Time</Th><Th>Patient</Th><Th>Institute ID</Th><Th>Doctor</Th><Th>Booked by</Th><Th>Status</Th></Tr>
              </Thead>
              <Tbody>
                {rows.length === 0 && (
                  <Tr><Td colSpan={6}><Text color="gray.500" py={6} textAlign="center">No appointments match these filters.</Text></Td></Tr>
                )}
                {rows.map((a) => {
                  const info = statusInfo(a.status);
                  return (
                    <Tr key={a.visit_id}>
                      <Td fontWeight="bold" whiteSpace="nowrap">{formatReceptionistDateTime(a.time)}</Td>
                      <Td>
                        <Text fontWeight="bold">{a.patient_name ? toTitleCase(a.patient_name) : 'Unknown patient'}</Text>
                        {a.patient_type && <Text fontSize="xs" color="gray.500">{a.patient_type}</Text>}
                      </Td>
                      <Td>{a.institute_id}</Td>
                      <Td>{a.doctor_name || a.doctor_username}</Td>
                      <Td>{a.booked_by ? toTitleCase(a.booked_by) : '—'}</Td>
                      <Td><Badge colorScheme={info.color}>{info.label.toUpperCase()}</Badge></Td>
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
    </Box>
  );
}
