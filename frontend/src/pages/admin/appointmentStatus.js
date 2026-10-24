// Labels and colours for appointment statuses, matching the receptionist screens.
export const STATUS = {
  booked: { label: 'Booked', color: 'yellow' },
  confirmed: { label: 'Confirmed', color: 'green' },
  checked_in: { label: 'Checked in', color: 'blue' },
  consultation: { label: 'In consultation', color: 'teal' },
  completed: { label: 'Completed', color: 'purple' },
  cancelled: { label: 'Cancelled', color: 'red' },
  no_show: { label: 'No show', color: 'orange' },
};

export const statusInfo = (status) =>
  STATUS[status] || { label: String(status || 'Unknown').replace('_', ' '), color: 'gray' };
