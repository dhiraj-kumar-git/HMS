import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SidebarComponent from './Sidebar';

describe('SidebarComponent', () => {
  const renderSidebar = (props) => {
    return render(
      <BrowserRouter>
        <SidebarComponent {...props} />
      </BrowserRouter>
    );
  };

  it('renders nothing besides header if not logged in', () => {
    renderSidebar({ isLoggedIn: false, role: 'admin' });
    expect(screen.getByText('BITS MED-C')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders admin links when role is admin', () => {
    renderSidebar({ isLoggedIn: true, role: 'admin' });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Create User')).toBeInTheDocument();
    expect(screen.getByText('Users List')).toBeInTheDocument();
    expect(screen.getByText('Patients List')).toBeInTheDocument();
    expect(screen.getByText('Visiting Doctor Schedule')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders medical store links when role is medical_store', () => {
    renderSidebar({ isLoggedIn: true, role: 'medical_store' });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Bill History')).toBeInTheDocument();
    expect(screen.getByText('Add Medicine')).toBeInTheDocument();
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    
    // Ensure admin links aren't there
    expect(screen.queryByText('Create User')).not.toBeInTheDocument();
  });

  it('renders doctor links when role is doctor', () => {
    renderSidebar({ isLoggedIn: true, role: 'doctor' });
    expect(screen.getByText('Doctor Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patient Visit History')).toBeInTheDocument();

    // Ensure medical store links aren't there
    expect(screen.queryByText('Add Medicine')).not.toBeInTheDocument();
  });

  it('renders lab_staff links when role is lab_staff', () => {
    renderSidebar({ isLoggedIn: true, role: 'lab_staff' });
    expect(screen.getByText('Lab Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patient Lab Reports')).toBeInTheDocument();
    expect(screen.getByText('Upload Lab Reports')).toBeInTheDocument();
  });
});
