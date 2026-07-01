import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import AdminDashboard from './AdminDashboard';

// Mock Recharts to avoid ResponsiveContainer errors in JSDOM
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    AreaChart: () => <div>AreaChart</div>,
    BarChart: () => <div>BarChart</div>,
  };
});

// Mock axios for DashboardHome API call
jest.mock('axios');

// Mock child components to isolate AdminDashboard testing
jest.mock('../auth/CreateUser', () => () => <div>Mock CreateUser</div>);
jest.mock('../staff/UsersList', () => () => <div>Mock UsersList</div>);
jest.mock('../patients/PatientsList', () => () => <div>Mock PatientsList</div>);
jest.mock('../patients/BulkRegistration', () => () => <div>Mock BulkRegistration</div>);
jest.mock('../staff/ManageSchedule', () => () => <div>Mock ManageSchedule</div>);
jest.mock('../staff/DoctorSchedulePage', () => () => <div>Mock DoctorSchedulePage</div>);

describe('AdminDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderDashboard = (initialRoute = '/admin') => {
    return render(
      <ChakraProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/admin/*" element={<AdminDashboard username="Test Admin" onLogout={jest.fn()} />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders Sidebar and Header correctly', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard();

    expect(screen.getByText('BITS MED-C')).toBeInTheDocument();
    expect(screen.getByText('Welcome, Test Admin')).toBeInTheDocument();
  });

  it('renders DashboardHome by default and fetches new patients', async () => {
    const mockPatients = [
      { institute_id: '123', name: 'John Doe', address: 'Pilani', disease: 'Fever', workflow_status: 'inactive' },
      { institute_id: '124', name: 'Jane Doe', address: 'Delhi', disease: 'Cold', workflow_status: 'active' },
    ];
    axios.get.mockResolvedValueOnce({ data: mockPatients });

    renderDashboard();

    expect(screen.getByText('New Patients')).toBeInTheDocument();
    expect(screen.getByText('Hospital Survey')).toBeInTheDocument();
    expect(screen.getByText('Patient Categories')).toBeInTheDocument();

    // Only 'inactive' patients should be set as new patients
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    // Jane Doe is 'active' so she shouldn't be in the new patients list
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('opens and closes the View All modal for new patients', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard();

    const viewAllBtn = screen.getByRole('button', { name: /View All/i });
    fireEvent.click(viewAllBtn);

    expect(screen.getByText('All New Patients')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('All New Patients')).not.toBeInTheDocument();
    });
  });

  it('navigates to create-user route', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard('/admin/create-user');
    expect(screen.getByText('Mock CreateUser')).toBeInTheDocument();
  });

  it('navigates to users-list route', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderDashboard('/admin/users-list');
    expect(screen.getByText('Mock UsersList')).toBeInTheDocument();
  });
});
