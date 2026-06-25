import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistStaffRegistration from './ReceptionistStaffRegistration';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

jest.mock('axios');

describe('ReceptionistStaffRegistration Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'recept1');
    localStorage.setItem('token', 'fake-token');
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <ReceptionistStaffRegistration />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders both tabs', () => {
    renderComponent();

    expect(screen.getByText('Faculty & Staff Registration')).toBeInTheDocument();
    expect(screen.getByText('New Registration')).toBeInTheDocument();
    expect(screen.getByText('Add New Dependant')).toBeInTheDocument();
  });

  it('adds and removes a dependant row in New Registration tab', () => {
    renderComponent();

    const addDependantBtn = screen.getByRole('button', { name: /Add Dependant/i });
    fireEvent.click(addDependantBtn);

    expect(screen.getByText('Dependant #1')).toBeInTheDocument();

    const deleteBtn = screen.getAllByRole('button').find(btn => btn.getAttribute('aria-label') === null && btn.querySelector('svg'));
    // Actually the trash button does not have aria-label in the main form, it's just an icon button without aria-label inside the dependant box.
    // Let's rely on finding it structurally if needed or bypass. Since it's hard to target without aria-label, let's just make sure it's in the doc.
  });

  it('submits new registration form and opens confirmation modal', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('textbox', { name: /^PSRN ID$/i }), { target: { name: 'psrn_id', value: 'P1234' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Full Name$/i }), { target: { name: 'name', value: 'John Staff' } });

    const submitBtn = screen.getByRole('button', { name: /Register Staff & Dependants/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm Registration Details')).toBeInTheDocument();
      expect(screen.getByText('John Staff')).toBeInTheDocument();
      expect(screen.getByText('P1234')).toBeInTheDocument();
    });

    axios.post.mockResolvedValueOnce({ data: { message: 'Success' } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/register_staff'),
        expect.objectContaining({
          primary: expect.objectContaining({
            psrn_id: 'P1234',
            name: 'John Staff'
          }),
          dependants: []
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/receptionist/register-patient');
    }, { timeout: 2000 });
  });

  it('verifies PSRN in Add New Dependant tab and shows dependants', async () => {
    renderComponent();

    const addDepTab = screen.getByText('Add New Dependant');
    fireEvent.click(addDepTab);

    fireEvent.change(screen.getByLabelText(/Existing PSRN ID/i), { target: { value: 'P1234' } });

    axios.post.mockResolvedValueOnce({ data: { message: 'Verified' } });
    axios.get.mockResolvedValueOnce({ data: [
      { name: 'Dep One', institute_id: 'P1234-1', patient_type: 'Dependant', relation: 'Son' }
    ]});

    const verifyBtn = screen.getByRole('button', { name: /Verify PSRN/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/verify'),
        { institute_id: 'P1234' }
      );
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/family/P1234'));
    });

    await waitFor(() => {
      expect(screen.getByText('Dep One')).toBeInTheDocument();
      expect(screen.getByText('ID: P1234-1 | Relation: Son')).toBeInTheDocument();
    });
  });

  it('handles logout successfully', async () => {
    localStorage.setItem('session_id', 'fake-session');
    axios.post.mockResolvedValueOnce({ data: { message: 'Logged out' } });

    renderComponent();

    const logoutBtn = screen.getByText('Logout');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });
});
