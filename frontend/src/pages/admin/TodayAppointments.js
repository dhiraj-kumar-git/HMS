import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Text, SimpleGrid, Stat, StatLabel, StatNumber, Button, Table, Thead, Tbody, Tr, Th, Td, Badge,
  Spinner, Alert, AlertIcon, AlertDescription,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatReceptionistDateTime, toTitleCase } from '../../utils/utils';
import { STATUS, statusInfo } from './appointmentStatus';

const REFRESH_MS = 60 * 1000;
const PAGE_SIZE = 10;

// The counters shown for today, in this order
const COUNTER_STATUSES = ['booked', 'confirmed', 'checked_in', 'consultation', 'completed', 'cancelled'];

const formatHeadingDate = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  if (!isoDate || Number.isNaN(d.getTime())) return 'Today';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export default function TodayAppointments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BASE_URL}/api/admin/appointments/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
      setError('');
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load today\'s appointments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const counts = data?.counts || {};
  const active = data?.active || [];
  const totalPages = Math.max(Math.ceil(active.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const rows = active.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const cards = [
    { key: 'total', label: 'Total today', color: 'gray', value: counts.total },
    ...COUNTER_STATUSES.map((key) => ({ key, label: STATUS[key].label, color: STATUS[key].color, value: counts[key] })),
  ];
  if (counts.other > 0) cards.push({ key: 'other', label: 'Other', color: 'gray', value: counts.other });

  if (loading) {
    return <Flex justify="center" py={16}><Spinner size="lg" color="blue.500" /></Flex>;
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Box>
          <Text fontSize="lg" fontWeight="bold">{formatHeadingDate(data?.date)}</Text>
          {updatedAt && (
            <Text fontSize="xs" color="gray.500">
              Updated {updatedAt.toLocaleTimeString('en-IN')} · refreshes every minute
            </Text>
          )}
        </Box>
        <Button size="sm" leftIcon={<FiRefreshCw />} onClick={load} variant="outline">Refresh</Button>
      </Flex>

      {error && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          <AlertDescription flex="1">{error}</AlertDescription>
          <Button size="xs" onClick={load}>Try again</Button>
        </Alert>
      )}

      {data && (
        <>
          <SimpleGrid columns={{ base: 2, md: 4, lg: 7 }} spacing={3} mb={6}>
            {cards.map((c) => (
              <Stat key={c.key} bg="white" p={3} borderRadius="lg" boxShadow="sm" borderTop="3px solid" borderColor={`${c.color}.400`}>
                <StatLabel fontSize="xs" color="gray.600">{c.label}</StatLabel>
                <StatNumber fontSize="2xl">{c.value ?? 0}</StatNumber>
              </Stat>
            ))}
          </SimpleGrid>

          <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
            <Text fontWeight="bold" mb={3}>Active appointments ({active.length})</Text>
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Date & Time</Th><Th>Patient</Th><Th>Institute ID</Th><Th>Doctor</Th><Th>Booked by</Th><Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.length === 0 && (
                    <Tr><Td colSpan={6}><Text color="gray.500" py={6} textAlign="center">No active appointments right now.</Text></Td></Tr>
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
            {totalPages > 1 && (
              <Flex justify="space-between" align="center" mt={4}>
                <Text fontSize="sm" color="gray.500">Showing {rows.length} of {active.length} entries</Text>
                <Flex gap={2} align="center">
                  <Button size="sm" onClick={() => setPage(currentPage - 1)} isDisabled={currentPage <= 1}>Previous</Button>
                  <Text fontSize="sm">Page {currentPage} of {totalPages}</Text>
                  <Button size="sm" onClick={() => setPage(currentPage + 1)} isDisabled={currentPage >= totalPages}>Next</Button>
                </Flex>
              </Flex>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
