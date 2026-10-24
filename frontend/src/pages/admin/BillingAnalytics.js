import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Text, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Button, ButtonGroup, Input, FormControl,
  FormLabel, Spinner, Alert, AlertIcon, AlertDescription, Table, Thead, Tbody, Tr, Th, Td,
} from '@chakra-ui/react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { getDateISTString } from '../../utils/utils';
import { rupees, categoryLabel } from './billStatusStyles';

// One colour per thing, the same everywhere (validated categorical slots 1-3)
const COLORS = { bar: '#2a78d6', medicine: '#2a78d6', lab_test: '#1baf7a', reimbursed: '#eb6834', self_paid: '#2a78d6' };
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
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// short money for chart axes: 1.2K, 3.5L (lakh), 2Cr (crore)
export const shortRupees = (n) => {
  const v = Math.abs(Number(n) || 0);
  const sign = Number(n) < 0 ? '-' : '';
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (v >= 1e7) return `${sign}₹${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `${sign}₹${trim(v / 1e5)}L`;
  if (v >= 1e3) return `${sign}₹${trim(v / 1e3)}K`;
  return `${sign}₹${trim(v)}`;
};

export const changeText = (now, before, periodDays, money = false) => {
  if (!before) return 'nothing in the previous period to compare';
  const change = Math.round(((now - before) / before) * 1000) / 10;
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '=';
  return `${arrow} ${Math.abs(change)}% vs previous ${periodDays} days (${money ? rupees(before) : before.toLocaleString('en-IN')})`;
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

// bars with a value label on each; `colorOf` lets a bar keep the colour of the thing it stands for
function Bars({ data, nameKey, valueKey, valueName, format, horizontal = false, colorOf }) {
  const common = { data, margin: { top: 16, right: horizontal ? 64 : 24, bottom: 4, left: 4 } };
  const bar = (
    <Bar dataKey={valueKey} name={valueName} fill={COLORS.bar} maxBarSize={24} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
      {colorOf && data.map((d, i) => <Cell key={i} fill={colorOf(d)} />)}
      <LabelList dataKey={valueKey} position={horizontal ? 'right' : 'top'} formatter={format} fill={AXIS} fontSize={11} />
    </Bar>
  );
  const tip = <Tooltip cursor={{ fill: '#f7fafc' }} formatter={(v) => [format(v), valueName]} />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      {horizontal ? (
        <BarChart {...common} layout="vertical">
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={format === shortRupees || format === rupees ? shortRupees : undefined} allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} width={120} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
          {tip}
          {bar}
        </BarChart>
      ) : (
        <BarChart {...common}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={nameKey} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis allowDecimals={false} tickFormatter={format === rupees ? shortRupees : undefined} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          {tip}
          {bar}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

const count = (n) => Number(n).toLocaleString('en-IN');
const share = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—');

// ---------------------------------------------------------------- the page

export default function BillingAnalytics() {
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
      const res = await axios.get(`${BASE_URL}/api/admin/billing/analytics`, {
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

  const k = data?.kpis;
  const hasData = k && (k.bills > 0 || data.unpaid_in_period.pending > 0 || data.unpaid_in_period.cancelled > 0 || data.pending_backlog.total > 0);

  const cards = () => {
    const prev = data.previous;
    const n = data.day_count;
    return [
      { label: 'Revenue', value: rupees(k.revenue), help: changeText(k.revenue, prev.revenue, n, true) },
      { label: 'Paid bills', value: count(k.bills), help: changeText(k.bills, prev.bills, n) },
      { label: 'Average bill', value: k.bills ? rupees(k.average_bill) : '—', help: changeText(k.average_bill, prev.average_bill, n, true) },
      { label: 'Reimbursed by the institute', value: rupees(k.reimbursed), help: `${share(k.reimbursed, k.revenue)} of revenue` },
      { label: 'Paid by patients', value: rupees(k.self_paid), help: `${share(k.self_paid, k.revenue)} of revenue` },
      { label: 'GST collected', value: rupees(data.tax_and_discount.gst_collected), help: 'included in the bill totals' },
      { label: 'Lab discounts given', value: rupees(data.tax_and_discount.lab_discounts), help: 'on lab tests, already taken off' },
      { label: 'Round-off', value: rupees(data.tax_and_discount.round_off), help: 'net, from rounding bills to whole rupees' },
      { label: 'Pending in this period', value: count(data.unpaid_in_period.pending), help: 'visits not billed yet (counted, no amount)' },
      { label: 'Cancelled in this period', value: count(data.unpaid_in_period.cancelled), help: 'bills cancelled (counted, no amount)' },
    ];
  };

  const daily = data?.revenue_per_day || [];
  const showDots = daily.length <= 31;
  const doctors = data?.by_doctor.top || [];
  const others = data?.by_doctor.others;
  const doctorRows = others && others.doctors > 0
    ? [...doctors, { name: `${others.doctors} other doctor${others.doctors === 1 ? '' : 's'}`, revenue: others.revenue, bills: others.bills }]
    : doctors;
  const split = k ? [
    { key: 'reimbursed', label: 'Reimbursed by the institute', value: k.reimbursed },
    { key: 'self_paid', label: 'Paid by patients', value: k.self_paid },
  ] : [];
  const backlog = data?.pending_backlog;

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
        {data && <Text fontSize="sm" color="gray.600">{longDate(data.start_date)} – {longDate(data.end_date)}</Text>}
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
              <Text color="gray.500">No bills in this period.</Text>
            </Box>
          ) : (
            <>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 5 }} spacing={3} mb={2}>
                {cards().map((c) => (
                  <Stat key={c.label} bg="white" p={3} borderRadius="lg" boxShadow="sm">
                    <StatLabel fontSize="xs" color="gray.600">{c.label}</StatLabel>
                    <StatNumber fontSize="xl">{c.value}</StatNumber>
                    <StatHelpText fontSize="xs" mb={0}>{c.help}</StatHelpText>
                  </Stat>
                ))}
              </SimpleGrid>
              <Text fontSize="xs" color="gray.500" mb={5}>
                Money figures count paid bills only, by the day they were paid. Pending and cancelled bills are only counted.
              </Text>

              <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
                <Box gridColumn={{ xl: 'span 2' }}>
                  <ChartCard title="Revenue per day" note="Paid bills, by the day they were paid"
                    columns={['Date', 'Revenue', 'Paid bills']}
                    rows={daily.map((d) => [longDate(d.date), rupees(d.revenue), d.bills])}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={daily} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
                        <YAxis tickFormatter={shortRupees} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                        <Tooltip labelFormatter={longDate} formatter={(v) => [rupees(v), 'Revenue']} />
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.bar} strokeWidth={2} dot={showDots ? { r: 4 } : false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </Box>

                <ChartCard title="Medicines and lab tests" note="Revenue by kind of bill"
                  columns={['Kind', 'Revenue', 'Paid bills']}
                  rows={data.by_category.map((c) => [c.label, rupees(c.revenue), c.bills])}>
                  <Bars horizontal nameKey="label" valueKey="revenue" valueName="Revenue" format={rupees} data={data.by_category}
                    colorOf={(d) => COLORS[d.name]} />
                </ChartCard>

                <ChartCard title="By payment mode" note="Revenue by how the bill was paid"
                  columns={['Payment mode', 'Revenue', 'Paid bills']}
                  rows={data.by_payment_mode.map((c) => [c.name, rupees(c.revenue), c.bills])}>
                  <Bars horizontal nameKey="name" valueKey="revenue" valueName="Revenue" format={rupees} data={data.by_payment_mode} />
                </ChartCard>

                <ChartCard title="Reimbursed and paid by patients" note="Who paid for the revenue"
                  columns={['Paid by', 'Amount', 'Share']}
                  rows={split.map((s) => [s.label, rupees(s.value), share(s.value, k.revenue)])} chartLabel="Reimbursed and paid by patients">
                  <Box pt={10}>
                    <Flex h="28px" borderRadius="md" overflow="hidden" bg="gray.100">
                      {split.map((s) => (
                        <Box key={s.key} data-testid={`split-${s.key}`} w={`${k.revenue ? (s.value / k.revenue) * 100 : 0}%`} bg={COLORS[s.key]}
                          borderRight={s.key === 'reimbursed' ? '2px solid white' : undefined} />
                      ))}
                    </Flex>
                    <Flex mt={4} direction="column" gap={2}>
                      {split.map((s) => (
                        <Flex key={s.key} align="center" gap={2} fontSize="sm">
                          <Box w="12px" h="12px" borderRadius="sm" bg={COLORS[s.key]} />
                          <Text flex="1">{s.label}</Text>
                          <Text fontWeight="bold">{rupees(s.value)}</Text>
                          <Text color="gray.500" w="56px" textAlign="right">{share(s.value, k.revenue)}</Text>
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                </ChartCard>

                <ChartCard title="By patient type" note="Revenue by the type of patient"
                  columns={['Patient type', 'Revenue', 'Paid bills']}
                  rows={data.by_patient_type.map((c) => [c.name, rupees(c.revenue), c.bills])}>
                  <Bars horizontal nameKey="name" valueKey="revenue" valueName="Revenue" format={rupees} data={data.by_patient_type} />
                </ChartCard>

                <ChartCard title="Revenue by doctor"
                  note={others && others.doctors > 0 ? `The ${doctors.length} highest; the rest are added together` : 'Paid bills, by the doctor who treated'}
                  columns={['Doctor', 'Revenue', 'Paid bills']}
                  rows={doctorRows.map((c) => [c.name, rupees(c.revenue), c.bills])}>
                  <Bars horizontal nameKey="name" valueKey="revenue" valueName="Revenue" format={rupees} data={doctorRows} />
                </ChartCard>

                <ChartCard title="Bills waiting to be paid"
                  note={`${count(backlog.total)} pending now, by how long ago the visit was${backlog.oldest_days !== null ? ` · oldest ${backlog.oldest_days} days` : ''}`}
                  columns={['Waiting for', 'Bills']} rows={backlog.buckets.map((b) => [b.label, b.count])}>
                  <Bars nameKey="label" valueKey="count" valueName="Pending bills" format={count} data={backlog.buckets} />
                </ChartCard>
              </SimpleGrid>
              <Text fontSize="xs" color="gray.500" mt={3}>
                {categoryLabel('medicine')} and {categoryLabel('lab_test').toLowerCase()} are billed separately, so one visit can make two bills.
                The pending list is as of now, whatever period is chosen.
              </Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
