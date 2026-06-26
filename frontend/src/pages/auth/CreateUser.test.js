import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateUser from './CreateUser';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';

jest.setTimeout(20000); // Prevent timeouts during full suite run
jest.mock('axios');

describe('CreateUser Component', () => {
  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <CreateUser />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders create user form', () => {
    renderComponent();
    expect(screen.getByText(/Create User/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter password/i)).toBeInTheDocument();
  });

  it('shows error if fields are missing', async () => {
    renderComponent();
    
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Display Name required/i)).toBeInTheDocument();
    });
  });

  it('shows error if other fields are missing', async () => {
    renderComponent();
    
    fireEvent.change(screen.getByPlaceholderText(/Enter Display Name/i), { target: { value: 'Test User' } });
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/All fields are required!/i)).toBeInTheDocument();
    });
  });

  it('submits form successfully', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { message: 'Success' }
    });

    renderComponent();
    
    // Select role
    const roleSelect = screen.getByRole('combobox');
    fireEvent.change(roleSelect, { target: { value: 'receptionist' } });

    fireEvent.change(screen.getByPlaceholderText(/Enter Display Name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/User created successfully!/i)).toBeInTheDocument();
    });
  });

  it('shows error if doctor name is missing', async () => {
    renderComponent();
    
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'doctor' } });
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Doctor Name required/i)).toBeInTheDocument();
    });
  });

  it('shows error if doctor department is missing', async () => {
    renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'doctor' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Doctor Name/i), { target: { value: 'Test Doc' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testdoc' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });

    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/All fields are required!/i)).toBeInTheDocument();
    });
  });

  it('shows error if doctor schedule is incomplete', async () => {
    renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'doctor' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Doctor Name/i), { target: { value: 'Test Doc' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Department Name/i }), { target: { value: 'Dentist' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testdoc' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });

    // Try submitting without selecting any duty days
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Incomplete Schedule/i)).toBeInTheDocument();
    });
  });

  it('shows error if shift end time is before start time', async () => {
    renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'doctor' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Doctor Name/i), { target: { value: 'Test Doc' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Department Name/i }), { target: { value: 'Dentist' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testdoc' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });

    // Select Monday
    const checkbox = screen.getAllByRole('checkbox')[0]; // Monday
    fireEvent.click(checkbox);

    // Set Start Time to 05:00 PM
    const selects = screen.getAllByRole('combobox');
    // selects[0] = Role
    // selects[1] = Department
    // selects[2] = Start Hr
    // selects[3] = Start Min
    // selects[4] = Start AMPM
    // selects[5] = End Hr
    // selects[6] = End Min
    // selects[7] = End AMPM
    fireEvent.change(selects[2], { target: { value: '05' } });
    fireEvent.change(selects[4], { target: { value: 'PM' } });

    // Set End Time to 09:00 AM (which is before 05:00 PM)
    fireEvent.change(selects[5], { target: { value: '09' } });
    fireEvent.change(selects[7], { target: { value: 'AM' } });

    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid Shift Timing/i)).toBeInTheDocument();
    });
  });

  it('shows error if shifts overlap', async () => {
    const { container } = renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'doctor' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Doctor Name/i), { target: { value: 'Test Doc' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Department Name/i }), { target: { value: 'Dentist' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testdoc' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });

    // Check Monday for shift 1
    let checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Monday

    // Add another shift
    fireEvent.click(screen.getByRole('button', { name: /Add Shift/i }));

    // Now there are 14 checkboxes (7 for shift 1, 7 for shift 2)
    checkboxes = screen.getAllByRole('checkbox');
    // Check Monday for shift 2 as well
    fireEvent.click(checkboxes[7]); // Monday for Shift 2

    // Both are 09:00 AM to 05:00 PM by default, so they overlap
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Overlapping Shifts Detected/i)).toBeInTheDocument();
    });
  });

  it('submits doctor form successfully and handles shift removal', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { message: 'Success' }
    });

    const { container } = renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'doctor' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Doctor Name/i), { target: { value: 'Test Doc' } });
    fireEvent.change(screen.getByRole('combobox', { name: /Department Name/i }), { target: { value: 'Dentist' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testdoc' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });

    // Check Monday
    let checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // Monday (Check)
    fireEvent.click(checkboxes[0]); // Monday (Uncheck - covers line 337)
    fireEvent.click(checkboxes[0]); // Monday (Check again)

    // Change Start Minute and End Minute to cover lines 367-370, 406-409
    const selects = screen.getAllByRole('combobox');
    // selects[0] = Role, selects[1] = Department
    // selects[2] = Start Hr, selects[3] = Start Min, selects[4] = Start AMPM
    // selects[5] = End Hr, selects[6] = End Min, selects[7] = End AMPM
    fireEvent.change(selects[3], { target: { value: '30' } }); // Start Min
    fireEvent.change(selects[6], { target: { value: '45' } }); // End Min
    
    // Add shift
    fireEvent.click(screen.getByRole('button', { name: /Add Shift/i }));

    // Check Tuesday for Shift 2
    checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[8]); // Tuesday for Shift 2
    
    // Delete shift 1 (find the IconButton which has no text)
    const allButtons = Array.from(container.querySelectorAll('button'));
    const trashBtn = allButtons.find(b => b.textContent.trim() === '');
    fireEvent.click(trashBtn);

    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/User created successfully!/i)).toBeInTheDocument();
    });
  });

  it('shows user already exists error', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { error: 'User already exists' } }
    });

    renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'receptionist' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Display Name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Username already exists/i)).toBeInTheDocument();
    });
  });

  it('handles general API errors', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { message: 'Database failure' } }
    });

    renderComponent();
    
    fireEvent.change(screen.getByRole('combobox', { name: /Role/i }), { target: { value: 'receptionist' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter Display Name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'pass123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));

    await waitFor(() => {
      expect(screen.getByText(/Database failure/i)).toBeInTheDocument();
    });
  });
});
