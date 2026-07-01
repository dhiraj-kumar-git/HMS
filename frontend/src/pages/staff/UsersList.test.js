import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import UsersList from './UsersList';

jest.mock('axios');
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockUsers = [
  { username: 'admin1', role: 'admin', department: null },
  { username: 'doctor1', role: 'doctor', department: 'Cardiology' },
  { username: 'recep1', role: 'receptionist', department: null },
  { username: 'store1', role: 'medical_store', department: null },
];

describe('UsersList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    window.confirm = jest.fn();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <UsersList />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders users list successfully', async () => {
    axios.get.mockResolvedValueOnce({ data: mockUsers });
    renderComponent();

    expect(screen.getByText(/Users List/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('admin1')).toBeInTheDocument();
      expect(screen.getByText('doctor1')).toBeInTheDocument();
      expect(screen.getByText('Cardiology')).toBeInTheDocument();
    });
  });

  it('handles search filtering', async () => {
    axios.get.mockResolvedValueOnce({ data: mockUsers });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('admin1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by username or role.../i);
    fireEvent.change(searchInput, { target: { value: 'doctor' } });

    expect(screen.queryByText('admin1')).not.toBeInTheDocument();
    expect(screen.getByText('doctor1')).toBeInTheDocument();
  });

  it('handles user deletion', async () => {
    axios.get.mockResolvedValueOnce({ data: mockUsers });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('admin1')).toBeInTheDocument();
    });

    // Mock confirm to return true
    window.confirm.mockReturnValueOnce(true);
    axios.delete.mockResolvedValueOnce({ data: { message: 'Deleted' } });
    axios.get.mockResolvedValueOnce({ data: mockUsers.slice(1) });

    const deleteButtons = screen.getAllByRole('button', { name: /Delete user/i });
    fireEvent.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith('Delete user "admin1"?');

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(expect.stringContaining('/delete_user/admin1'), expect.any(Object));
    });
    
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledTimes(2); // Initial fetch + fetch after delete
    });
  });

  it('cancels user deletion when confirm is false', async () => {
    axios.get.mockResolvedValueOnce({ data: mockUsers });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('admin1')).toBeInTheDocument();
    });

    window.confirm.mockReturnValueOnce(false);
    
    const deleteButtons = screen.getAllByRole('button', { name: /Delete user/i });
    fireEvent.click(deleteButtons[0]);

    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('handles changing password', async () => {
    axios.get.mockResolvedValueOnce({ data: mockUsers });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('admin1')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /Change password/i });
    fireEvent.click(editButtons[0]);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText(/Change Password for admin1/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
    fireEvent.change(passwordInput, { target: { value: 'newpass123' } });

    axios.put.mockResolvedValueOnce({ data: { message: 'Success' } });

    fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

    await waitFor(() => {
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining('/update_password/admin1'),
        { new_password: 'newpass123' },
        expect.any(Object)
      );
    });
  });

  it('navigates to add user page', () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderComponent();

    const addButton = screen.getByRole('button', { name: /Add User/i });
    fireEvent.click(addButton);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/create-user');
  });

  it('handles pagination', async () => {
    const manyUsers = Array.from({ length: 15 }, (_, i) => ({
      username: `user${i + 1}`,
      role: 'doctor',
      department: null
    }));
    axios.get.mockResolvedValueOnce({ data: manyUsers });
    
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
      expect(screen.queryByText('user11')).not.toBeInTheDocument();
    });

    const nextButton = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('user11')).toBeInTheDocument();
      expect(screen.queryByText('user1')).not.toBeInTheDocument();
    });

    const prevButton = screen.getByRole('button', { name: /Previous/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
    });
  });
});
