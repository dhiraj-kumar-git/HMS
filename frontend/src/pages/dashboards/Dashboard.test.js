import React from 'react';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

jest.mock('react-router-dom', () => ({
  Navigate: ({ to }) => <div>Navigated to {to}</div>
}));

describe('Dashboard Component', () => {
  const renderDashboard = (role) => {
    return render(<Dashboard role={role} />);
  };

  it('renders loading spinner if no role is provided', () => {
    // We can't directly check for Spinner but we can check if it rendered the flex container.
    // To make it easy, we know "Unauthorized Access" and navigation text won't be there.
    const { container } = renderDashboard(null);
    expect(screen.queryByText(/Unauthorized Access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin Route/i)).not.toBeInTheDocument();
    // Chakra UI spinner usually has className matching chakra-spinner
    expect(container.querySelector('.chakra-spinner')).toBeInTheDocument();
  });

  it('navigates to /admin if role is admin', () => {
    renderDashboard('admin');
    expect(screen.getByText('Navigated to /admin')).toBeInTheDocument();
  });

  it('navigates to /receptionist if role is receptionist', () => {
    renderDashboard('receptionist');
    expect(screen.getByText('Navigated to /receptionist')).toBeInTheDocument();
  });

  it('navigates to /doctor if role is doctor', () => {
    renderDashboard('doctor');
    expect(screen.getByText('Navigated to /doctor')).toBeInTheDocument();
  });

  it('navigates to /medical_counter if role is medical_store', () => {
    renderDashboard('medical_store');
    expect(screen.getByText('Navigated to /medical_counter')).toBeInTheDocument();
  });

  it('navigates to /lab if role is lab_staff', () => {
    renderDashboard('lab_staff');
    expect(screen.getByText('Navigated to /lab')).toBeInTheDocument();
  });

  it('shows Unauthorized Access if role is unknown', () => {
    renderDashboard('unknown_role');
    expect(screen.getByText(/Unauthorized Access/i)).toBeInTheDocument();
  });
});
