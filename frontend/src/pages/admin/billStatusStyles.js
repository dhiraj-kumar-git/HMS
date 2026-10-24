// Labels and colours for the status and kind of a bill.
export const BILL_STATUS = {
  paid: { label: 'Paid', color: 'green' },
  pending: { label: 'Pending', color: 'yellow' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const billStatusInfo = (status) =>
  BILL_STATUS[status] || { label: String(status || 'Unknown').replace(/_/g, ' '), color: 'gray' };

export const BILL_CATEGORY = {
  medicine: 'Medicines',
  lab_test: 'Lab tests',
  both: 'Medicines + lab tests',
};

export const categoryLabel = (category) => BILL_CATEGORY[category] || '—';

// Indian digit grouping (12,34,567.50), written out by hand so it looks the same in every browser
export const rupees = (amount) => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  const value = Number(amount);
  const [whole, cents] = Math.abs(value).toFixed(2).split('.');
  const head = whole.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}` : whole;
  return `${value < 0 ? '-' : ''}₹${grouped}.${cents}`;
};
