import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Flex, Text, SimpleGrid, Button, Spinner, Alert, AlertIcon, AlertDescription, Table, Thead, Tbody, Tr, Th, Td, Badge,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatReceptionistDateTime, toTitleCase } from '../../utils/utils';
import { rupees } from './billStatusStyles';
import { shortRupees } from './BillingAnalytics';

// One colour per thing, the same everywhere (validated categorical slots 1-2)
const COLORS = { appointments: '#2a78d6', revenue: '#1baf7a', bar: '#2a78d6' };
const GRID = '#e2e8f0';
const AXIS = '#4a5568';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
// the server's clock time shown in India time
const clockIST = (iso) => {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const ist = new Date(t.getTime() + 330 * 60000);
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
};
const num = (n) => Number(n).toLocaleString('en-IN');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- pieces

function ChartCard({ title, note, columns, rows, children }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="flex-start" mb={2} gap={2}>
        <Box>
          <Text fontWeight="bold">{title}</Text>
          {note && <Text fontSize="xs" color="gray.500">{note}</Text>}
        </Box>
        <Button size="xs" variant="ghost" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'View as chart' : 'View as table'}
        </Button>
      </Flex>
      {asTable ? (
        <Box maxH="220px" overflowY="auto">
          <Table size="sm" aria-label={`${title} (table)`}>
            <Thead><Tr>{columns.map((c) => <Th key={c} isNumeric={c !== columns[0]}>{c}</Th>)}</Tr></Thead>
            <Tbody>{rows.map((r, i) => <Tr key={i}>{r.map((cell, j) => <Td key={j} isNumeric={j > 0}>{cell}</Td>)}</Tr>)}</Tbody>
          </Table>
        </Box>
      ) : (
        <Box role="img" aria-label={title} h="220px">{children}</Box>
      )}
    </Box>
  );
}

function Unavailable({ what }) {
  return <Text fontSize="sm" color="gray.500" py={6} textAlign="center">{what} could not be loaded.</Text>;
}

function LineCard({ title, note, data, dataKey, name, color, format, tickFormat, columns, rowOf }) {
  return (
    <ChartCard title={title} note={note} columns={columns} rows={data.map(rowOf)}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis allowDecimals={false} tickFormatter={tickFormat} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip labelFormatter={longDate} formatter={(v) => [format(v), name]} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------- the page

export default function DashboardOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setData(res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {});
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const a = data?.appointments_today;
  const rev = data?.revenue;
  const pend = data?.pending_bills;
  const lab = data?.lab_orders;
  const pat = data?.patients;
  const staff = data?.staff;
  const trend = data?.trend;
  const attention = data?.attention || [];
  const newPatients = data?.new_patients;
  const allClear = attention.length > 0 && attention.every((i) => i.count === 0);

  const cards = data ? [
    { key: 'appointments', label: "Today's appointments", to: '/admin/appointments', value: a && num(a.total),
      help: a && `${num(a.open)} still open · ${num(a.completed)} completed · ${num(a.cancelled)} cancelled` },
    { key: 'revenue', label: 'Revenue today', to: '/admin/billing', value: rev && rupees(rev.today),
      help: rev && `${plural(rev.bills_today, 'paid bill', 'paid bills')} · yesterday ${rupees(rev.yesterday)}` },
    { key: 'pending', label: 'Pending bills', to: '/admin/billing', value: pend && num(pend.total),
      help: pend && (pend.total ? `oldest ${plural(pend.oldest_days, 'day', 'days')} · ${num(pend.over_7_days)} over a week` : 'nothing waiting to be billed') },
    { key: 'lab', label: 'Lab orders needing action', to: '/admin/reports', value: lab && num(lab.open),
      help: lab && `${num(lab.by_status.awaiting_payment)} waiting for payment · last ${lab.days} days` },
    { key: 'patients', label: 'Patients', to: '/admin/patients-list', value: pat && num(pat.total),
      help: pat && `${num(pat.new_this_week)} new this week` },
    { key: 'staff', label: 'Staff accounts', to: '/admin/users-list', value: staff && num(staff.total),
      help: staff && `${num(staff.by_role.doctor)} doctors · ${num(staff.by_role.receptionist)} reception · ${num(staff.by_role.lab_staff)} lab · ${num(staff.by_role.medical_store)} store` },
  ] : [];

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Box>
          <Text fontSize="lg" fontWeight="bold">Overview</Text>
          {data?.date && (
            <Text fontSize="sm" color="gray.600">
              {longDate(data.date)}{data.generated_at && clockIST(data.generated_at) ? ` · updated ${clockIST(data.generated_at)}` : ''}
            </Text>
          )}
        </Box>
        <Button size="sm" variant="outline" leftIcon={<FiRefreshCw />} onClick={load} isLoading={loading && !!data}>Refresh</Button>
      </Flex>

      {error && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          <AlertDescription flex="1">{error}</AlertDescription>
          <Button size="xs" onClick={load}>Try again</Button>
        </Alert>
      )}

      {loading && !data && <Flex justify="center" py={16}><Spinner size="lg" color="blue.500" /></Flex>}

      {data && (
        <Box opacity={loading ? 0.5 : 1}>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={3} mb={5}>
            {cards.map((c) => (
              <Box key={c.key} as="button" type="button" textAlign="left" bg="white" p={4} borderRadius="lg" boxShadow="sm"
                aria-label={`${c.label}: open`} onClick={() => navigate(c.to)} _hover={{ boxShadow: 'md' }}>
                <Text fontSize="xs" color="gray.600">{c.label}</Text>
                <Text fontSize="2xl" fontWeight="bold">{c.value ?? '—'}</Text>
                <Text fontSize="xs" color="gray.500">{c.help ?? 'Could not be loaded'}</Text>
              </Box>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4} mb={4}>
            {trend ? (
              <LineCard title="Appointments, last 14 days" note="All appointments, by day" data={trend} dataKey="appointments" name="Appointments"
                color={COLORS.appointments} format={num} columns={['Date', 'Appointments']} rowOf={(d) => [longDate(d.date), d.appointments]} />
            ) : <Box bg="white" p={4} borderRadius="lg" boxShadow="sm"><Unavailable what="The appointment trend" /></Box>}
            {trend ? (
              <LineCard title="Revenue, last 14 days" note="Paid bills, by the day they were paid" data={trend} dataKey="revenue" name="Revenue"
                color={COLORS.revenue} format={rupees} tickFormat={shortRupees} columns={['Date', 'Revenue', 'Paid bills']}
                rowOf={(d) => [longDate(d.date), rupees(d.revenue), d.bills]} />
            ) : <Box bg="white" p={4} borderRadius="lg" boxShadow="sm"><Unavailable what="The revenue trend" /></Box>}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4} mb={4}>
            {pat ? (
              <ChartCard title="Patients by type" note="Everyone registered, archived accounts left out"
                columns={['Patient type', 'Patients']} rows={pat.by_type.map((t) => [t.name, num(t.count)])}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pat.by_type} layout="vertical" margin={{ top: 8, right: 48, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f7fafc' }} />
                    <Bar dataKey="count" name="Patients" fill={COLORS.bar} maxBarSize={24} radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" fill={AXIS} fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            ) : <Box bg="white" p={4} borderRadius="lg" boxShadow="sm"><Unavailable what="Patients by type" /></Box>}

            <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
              <Text fontWeight="bold" mb={2}>Needs attention</Text>
              {allClear ? (
                <Text fontSize="sm" color="green.600" py={4}>All clear. Nothing is waiting.</Text>
              ) : (
                <Flex direction="column" gap={2}>
                  {attention.map((item) => (
                    <Flex key={item.key} as="button" type="button" align="center" gap={3} p={2} borderRadius="md" textAlign="left"
                      _hover={{ bg: 'gray.50' }} onClick={() => navigate(`/admin/${item.link}`)} aria-label={`${item.label}: open`}>
                      <Badge colorScheme={item.count === null ? 'gray' : item.count > 0 ? 'orange' : 'green'} minW="36px" textAlign="center" fontSize="sm">
                        {item.count === null ? '—' : num(item.count)}
                      </Badge>
                      <Text fontSize="sm" flex="1">{item.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              )}
              <Text fontSize="xs" color="gray.500" mt={3}>Counts only. Open the page to see the details.</Text>
            </Box>
          </SimpleGrid>

          <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
            <Flex justify="space-between" align="center" mb={2}>
              <Text fontWeight="bold">Newest patients</Text>
              <Button size="sm" variant="outline" onClick={() => navigate('/admin/patients-list')}>View all patients</Button>
            </Flex>
            {newPatients ? (
              <Box overflowX="auto">
                <Table size="sm" aria-label="Newest patients">
                  <Thead><Tr><Th>Name</Th><Th>Institute ID</Th><Th>Type</Th><Th>Registered</Th></Tr></Thead>
                  <Tbody>
                    {newPatients.length === 0 && (
                      <Tr><Td colSpan={4}><Text color="gray.500" py={4} textAlign="center">No patients registered yet.</Text></Td></Tr>
                    )}
                    {newPatients.map((p) => (
                      <Tr key={p.institute_id}>
                        <Td fontWeight="bold">{p.name ? toTitleCase(p.name) : 'Unknown patient'}</Td>
                        <Td>{p.institute_id}</Td>
                        <Td>{p.patient_type || '—'}</Td>
                        <Td whiteSpace="nowrap">{p.registered ? formatReceptionistDateTime(p.registered) : '—'}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            ) : <Unavailable what="The newest patients" />}
          </Box>
        </Box>
      )}
    </Box>
  );
}
