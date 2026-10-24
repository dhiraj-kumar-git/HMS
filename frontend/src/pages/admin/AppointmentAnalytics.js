import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Text, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Button, ButtonGroup, Input, FormControl,
  FormLabel, Spinner, Alert, AlertIcon, AlertDescription, Table, Thead, Tbody, Tr, Th, Td,
} from '@chakra-ui/react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { getDateISTString, toTitleCase } from '../../utils/utils';
import { STATUS } from './appointmentStatus';

// One colour per thing, the same everywhere (validated categorical slots 1-3)
const COLORS = { total: '#2a78d6', completed: '#1baf7a', cancelled: '#eb6834', bar: '#2a78d6' };
const GRID = '#e2e8f0';
const AXIS = '#4a5568';
const PRESETS = [{ days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' }, { days: 90, label: 'Last 90 days' }];
const MAX_DAYS = 366;

// ---------------------------------------------------------------- helpers

const daysBetween = (start, end) => Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1;

const presetRange = (days) => {
  const end = getDateISTString();
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start_date: start.toISOString().slice(0, 10), end_date: end };
};

// fixed names (not toLocaleDateString) so the text is identical in every browser
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
const pct = (n) => (n === null || n === undefined ? '—' : `${n}%`);

export const formatMinutes = (m) => {
  if (m === null || m === undefined) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

export const formatLead = (hours) => {
  if (hours === null || hours === undefined) return '—';
  return hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours} h`;
};

// ---------------------------------------------------------------- a chart that can also be read as a table

function ChartCard({ title, note, columns, rows, children, chartLabel }) {
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
        <Box maxH="260px" overflowY="auto">
          <Table size="sm" aria-label={`${title} (table)`}>
            <Thead><Tr>{columns.map((c) => <Th key={c} isNumeric={c !== columns[0]}>{c}</Th>)}</Tr></Thead>
            <Tbody>
              {rows.map((r, i) => (
                <Tr key={i}>{r.map((cell, j) => <Td key={j} isNumeric={j > 0}>{cell}</Td>)}</Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      ) : (
        <Box role="img" aria-label={chartLabel || title} h="260px">{children}</Box>
      )}
    </Box>
  );
}

// single-series bars, vertical or horizontal, with a count label on each bar
function CountBars({ data, nameKey, horizontal = false, height }) {
  const common = { data, margin: { top: 16, right: 24, bottom: 4, left: 4 } };
  const bar = (
    <Bar dataKey="count" name="Appointments" fill={COLORS.bar} maxBarSize={24} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
      <LabelList dataKey="count" position={horizontal ? 'right' : 'top'} fill={AXIS} fontSize={11} />
    </Bar>
  );
  return (
    <ResponsiveContainer width="100%" height={height || 260}>
      {horizontal ? (
        <BarChart {...common} layout="vertical">
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} width={110} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f7fafc' }} />
          {bar}
        </BarChart>
      ) : (
        <BarChart {...common}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={nameKey} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
          <Tooltip cursor={{ fill: '#f7fafc' }} />
          {bar}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- the page

export default function AppointmentAnalytics() {
  const [preset, setPreset] = useState(30);                       // 7 | 30 | 90 | 'custom'
  const [range, setRange] = useState(() => presetRange(30));
  const [custom, setCustom] = useState(() => presetRange(30));
  const [formError, setFormError] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (r) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/admin/appointments/analytics`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        params: { start_date: r.start_date, end_date: r.end_date },
      });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  const choosePreset = (days) => {
    setPreset(days);
    setFormError('');
    const r = presetRange(days);
    setCustom(r);
    setRange(r);
  };

  const applyCustom = () => {
    if (!custom.start_date || !custom.end_date) return setFormError('Please choose both a From and a To date.');
    if (custom.start_date > custom.end_date) return setFormError('The From date must not be after the To date.');
    if (daysBetween(custom.start_date, custom.end_date) > MAX_DAYS) return setFormError(`Please choose a period of ${MAX_DAYS} days or less.`);
    setFormError('');
    setPreset('custom');
    setRange({ ...custom });
  };

  const t = data?.totals;
  const hasData = t && t.total > 0;

  const cards = () => {
    const prev = data.previous;
    const change = prev.change_pct;
    return [
      { label: 'Appointments', value: t.total.toLocaleString('en-IN'),
        help: change === null ? 'none in the previous period to compare' : `${change > 0 ? '▲' : change < 0 ? '▼' : '='} ${Math.abs(change)}% vs previous ${data.range.days} days (${prev.total.toLocaleString('en-IN')})` },
      { label: 'Patients', value: data.patients.unique.toLocaleString('en-IN'), help: `${data.patients.new} new · ${data.patients.returning} returning` },
      { label: 'Completion rate', value: pct(data.rates.completion), help: `${t.completed} of ${t.resolved} finished` },
      { label: 'Cancellation rate', value: pct(data.rates.cancellation), help: `${t.cancelled} of ${t.resolved} finished` },
      { label: 'No-show rate', value: pct(data.rates.no_show), help: `${t.no_show} of ${t.resolved} finished` },
      { label: 'Still open', value: t.open.toLocaleString('en-IN'), help: 'booked, confirmed, checked in or in consultation' },
      { label: 'Booked ahead by', value: formatLead(data.timing.avg_lead_hours), help: 'average, booking to appointment' },
      { label: 'Scheduled start to done', value: formatMinutes(data.timing.avg_turnaround_minutes),
        help: data.timing.turnaround_samples ? `average · median ${formatMinutes(data.timing.median_turnaround_minutes)} · ${data.timing.turnaround_samples} visits` : 'no completed visits with times' },
      { label: 'Busiest day', value: data.busiest.day ? shortDate(data.busiest.day.date) : '—', help: data.busiest.day ? `${data.busiest.day.total} appointments` : ' ' },
      { label: 'Busiest hour', value: data.busiest.hour ? hourLabel(data.busiest.hour.hour) : '—', help: data.busiest.hour ? `${data.busiest.hour.count} appointments` : ' ' },
    ];
  };

  // hours with nothing at either end are trimmed so the chart is not mostly empty
  const hoursWithData = data ? data.by_hour.filter((h) => h.count > 0) : [];
  const firstHour = hoursWithData.length ? hoursWithData[0].hour : 0;
  const lastHour = hoursWithData.length ? hoursWithData[hoursWithData.length - 1].hour : 23;
  const hourData = data ? data.by_hour.filter((h) => h.hour >= firstHour && h.hour <= lastHour).map((h) => ({ ...h, label: hourLabel(h.hour) })) : [];

  return (
    <Box>
      <Flex gap={3} wrap="wrap" align="flex-end" bg="white" p={4} borderRadius="lg" boxShadow="sm" mb={4}>
        <ButtonGroup size="sm" isAttached variant="outline">
          {PRESETS.map((p) => (
            <Button key={p.days} onClick={() => choosePreset(p.days)} isActive={preset === p.days}
              colorScheme={preset === p.days ? 'blue' : undefined} aria-pressed={preset === p.days}>{p.label}</Button>
          ))}
        </ButtonGroup>
        <FormControl maxW="160px">
          <FormLabel fontSize="xs">FROM</FormLabel>
          <Input size="sm" type="date" aria-label="From date" value={custom.start_date}
            onChange={(e) => setCustom((c) => ({ ...c, start_date: e.target.value }))} />
        </FormControl>
        <FormControl maxW="160px">
          <FormLabel fontSize="xs">TO</FormLabel>
          <Input size="sm" type="date" aria-label="To date" value={custom.end_date}
            onChange={(e) => setCustom((c) => ({ ...c, end_date: e.target.value }))} />
        </FormControl>
        <Button size="sm" colorScheme={preset === 'custom' ? 'blue' : undefined} variant={preset === 'custom' ? 'solid' : 'outline'} onClick={applyCustom}>
          Apply dates
        </Button>
        {data && <Text fontSize="sm" color="gray.600">{longDate(data.range.start_date)} – {longDate(data.range.end_date)}</Text>}
      </Flex>
      {formError && <Text color="red.500" fontSize="sm" mb={3}>{formError}</Text>}

      {error && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          <AlertDescription flex="1">{error}</AlertDescription>
          <Button size="xs" onClick={() => load(range)}>Try again</Button>
        </Alert>
      )}

      {loading && !data && <Flex justify="center" py={16}><Spinner size="lg" color="blue.500" /></Flex>}

      {data && (
        <Box opacity={loading ? 0.5 : 1}>
          {!hasData ? (
            <Box bg="white" p={10} borderRadius="lg" boxShadow="sm" textAlign="center">
              <Text color="gray.500">No appointments in this period.</Text>
            </Box>
          ) : (
            <>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 5 }} spacing={3} mb={5}>
                {cards().map((c) => (
                  <Stat key={c.label} bg="white" p={3} borderRadius="lg" boxShadow="sm">
                    <StatLabel fontSize="xs" color="gray.600">{c.label}</StatLabel>
                    <StatNumber fontSize="xl">{c.value}</StatNumber>
                    <StatHelpText fontSize="xs" mb={0}>{c.help}</StatHelpText>
                  </Stat>
                ))}
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
                <Box gridColumn={{ xl: 'span 2' }}>
                  <ChartCard title="Appointments per day" note="Total, completed and cancelled"
                    columns={['Date', 'Total', 'Completed', 'Cancelled']}
                    rows={data.daily.map((d) => [longDate(d.date), d.total, d.completed, d.cancelled])}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={data.daily} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip labelFormatter={longDate} />
                        <Legend verticalAlign="top" height={28} />
                        <Line type="monotone" dataKey="total" name="Total" stroke={COLORS.total} strokeWidth={2} dot={data.daily.length <= 31 ? { r: 4 } : false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="completed" name="Completed" stroke={COLORS.completed} strokeWidth={2} dot={data.daily.length <= 31 ? { r: 4 } : false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke={COLORS.cancelled} strokeWidth={2} dot={data.daily.length <= 31 ? { r: 4 } : false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </Box>

                <ChartCard title="Outcome of appointments" note="Every appointment in the period, by status"
                  columns={['Status', 'Appointments']}
                  rows={data.status.map((s) => [(STATUS[s.status]?.label || toTitleCase(s.status)), s.count])}>
                  <CountBars horizontal nameKey="label" data={data.status.map((s) => ({ label: STATUS[s.status]?.label || toTitleCase(s.status), count: s.count }))} />
                </ChartCard>

                <ChartCard title="Busiest hours" note="By scheduled time"
                  columns={['Hour', 'Appointments']} rows={hourData.map((h) => [h.label, h.count])}>
                  <CountBars nameKey="label" data={hourData} />
                </ChartCard>

                <ChartCard title="Busiest days of the week" columns={['Day', 'Appointments']}
                  rows={data.by_weekday.map((d) => [d.weekday, d.count])}>
                  <CountBars nameKey="short" data={data.by_weekday.map((d) => ({ ...d, short: d.weekday.slice(0, 3) }))} />
                </ChartCard>

                <ChartCard title="Who books" columns={['Booked by', 'Appointments']}
                  rows={data.booked_by.map((b) => [toTitleCase(b.booked_by), b.count])}>
                  <CountBars horizontal nameKey="label" data={data.booked_by.map((b) => ({ label: toTitleCase(b.booked_by), count: b.count }))} />
                </ChartCard>

                <ChartCard title="Patient type" note="Appointments by the type of patient"
                  columns={['Patient type', 'Appointments']} rows={data.patient_types.map((p) => [p.type, p.count])}>
                  <CountBars horizontal nameKey="type" data={data.patient_types} />
                </ChartCard>
              </SimpleGrid>

              <Box bg="white" p={4} borderRadius="lg" boxShadow="sm" mt={4}>
                <Text fontWeight="bold" mb={3}>Doctors</Text>
                <Box overflowX="auto">
                  <Table size="sm" aria-label="Doctors">
                    <Thead>
                      <Tr>
                        <Th>Doctor</Th><Th isNumeric>Appointments</Th><Th>Share of all</Th><Th isNumeric>Completed</Th>
                        <Th isNumeric>Cancelled</Th><Th isNumeric>No-show</Th><Th isNumeric>Completion rate</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {data.doctors.map((d) => (
                        <Tr key={d.username}>
                          <Td fontWeight="bold">{d.name}</Td>
                          <Td isNumeric>{d.total}</Td>
                          <Td>
                            <Flex align="center" gap={2}>
                              <Box w="90px" h="6px" bg="gray.100" borderRadius="full" overflow="hidden">
                                <Box w={`${d.share_pct || 0}%`} h="100%" bg={COLORS.bar} />
                              </Box>
                              <Text fontSize="xs">{pct(d.share_pct)}</Text>
                            </Flex>
                          </Td>
                          <Td isNumeric>{d.completed}</Td>
                          <Td isNumeric>{d.cancelled}</Td>
                          <Td isNumeric>{d.no_show}</Td>
                          <Td isNumeric>{pct(d.completion_rate)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
                <Text fontSize="xs" color="gray.500" mt={2}>
                  Rates are over finished appointments (completed, cancelled and no-show); upcoming and in-progress ones are not counted in them.
                </Text>
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
