// Labels and colours for the status of a lab order (in the order an order moves through them).
export const LAB_STATUS = {
  awaiting_payment: { label: 'Awaiting payment', color: 'yellow' },
  pending: { label: 'Pending', color: 'gray' },
  in_progress: { label: 'In progress', color: 'blue' },
  partially_completed: { label: 'Partially completed', color: 'teal' },
  completed: { label: 'Completed', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const labStatusInfo = (status) =>
  LAB_STATUS[status] || { label: String(status || 'Unknown').replace(/_/g, ' '), color: 'gray' };

// Status of one test inside an order
export const TEST_STATUS = {
  completed: { label: 'Completed', color: 'green' },
  pending: { label: 'Pending', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const testStatusInfo = (status) =>
  TEST_STATUS[status] || { label: String(status || 'Pending').replace(/_/g, ' '), color: 'gray' };
