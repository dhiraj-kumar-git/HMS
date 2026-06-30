import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistStudentRegistration from './ReceptionistStudentRegistration';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

jest.mock('axios');

describe('ReceptionistStudentRegistration Component', () => {
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
          <ReceptionistStudentRegistration />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders form fields correctly', () => {
    renderComponent();

    expect(screen.getByText('Student & Visitors Registration')).toBeInTheDocument();
    expect(screen.getByLabelText(/BITS Institute ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/BITS Email ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Patient Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date of Birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Address \/ Hostel/i)).toBeInTheDocument();
  });

  it('shows custom address input when "Other" is selected', () => {
    renderComponent();

    const addressSelect = screen.getByLabelText(/Address \/ Hostel/i);
    fireEvent.change(addressSelect, { target: { name: 'address', value: 'Other' } });

    expect(screen.getByLabelText(/Custom Address Details/i)).toBeInTheDocument();
  });

  it('hides Institute ID and alters fields for Temporary guest', () => {
    renderComponent();

    const typeSelect = screen.getByLabelText(/Patient Type/i);
    fireEvent.change(typeSelect, { target: { name: 'patient_type', value: 'Temporary' } });

    expect(screen.queryByLabelText(/BITS Institute ID/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Email ID/i)).toBeInTheDocument(); // The BITS prefix is dropped
    expect(screen.getByLabelText(/Address \/ Hostel/i).value).toBe('Other');
  });

  it('submits form successfully', async () => {
    axios.post.mockResolvedValueOnce({ data: { institute_id: '12345' } });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/BITS Institute ID/i), { target: { name: 'institute_id', value: 'H20201' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { name: 'name', value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/BITS Email ID/i), { target: { name: 'email', value: 'jane@bits.com' } });
    fireEvent.change(screen.getByLabelText(/Patient Type/i), { target: { name: 'patient_type', value: 'Student' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { name: 'gender', value: 'Female' } });
    fireEvent.change(screen.getByLabelText(/Contact Number/i), { target: { name: 'contact_no', value: '9999999999' } });
    fireEvent.change(screen.getByLabelText(/Address \/ Hostel/i), { target: { name: 'address', value: 'Meera Bhawan' } });

    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/register_patient'),
        expect.objectContaining({
          institute_id: 'H20201',
          name: 'Jane Doe',
          email: 'jane@bits.com',
          patient_type: 'Student',
          gender: 'Female',
          contact_no: '9999999999',
          address: 'Meera Bhawan'
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer fake-token' }
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/receptionist/register-patient');
    }, { timeout: 2000 });
  });

  it('submits temporary guest form successfully', async () => {
    axios.post.mockResolvedValueOnce({ data: { institute_id: 'TEMP-12345' } });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/Patient Type/i), { target: { name: 'patient_type', value: 'Temporary' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { name: 'name', value: 'John Guest' } });
    fireEvent.change(screen.getByLabelText(/Email ID/i), { target: { name: 'email', value: 'guest@email.com' } });
    fireEvent.change(screen.getByLabelText(/Date of Birth/i), { target: { name: 'date_of_birth', value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { name: 'gender', value: 'Male' } });
    fireEvent.change(screen.getByLabelText(/Contact Number/i), { target: { name: 'contact_no', value: '8888888888' } });
    // address defaults to 'Other' and is disabled, institute_id is hidden

    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/register_patient'),
        expect.objectContaining({
          institute_id: '',
          name: 'John Guest',
          email: 'guest@email.com',
          date_of_birth: '1990-01-01',
          patient_type: 'Temporary',
          gender: 'Male',
          contact_no: '8888888888',
          address: '',
          customAddress: ''
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer fake-token' }
        })
      );
    });
  });

  it('handles submission error', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Registration failed' } } });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/BITS Institute ID/i), { target: { name: 'institute_id', value: 'H20201' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { name: 'name', value: 'Jane Doe' } });
    const submitBtn = screen.getByRole('button', { name: /Complete Registration/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
      // Chakra UI toast is hard to test directly without mocking useToast, but we can verify it doesn't navigate
      expect(mockNavigate).not.toHaveBeenCalled();
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
