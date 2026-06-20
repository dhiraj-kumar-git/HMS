import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateUser from './CreateUser';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';

jest.mock('axios');

describe('CreateUser Component', () => {
  const renderComponent = () => {
    render(
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
});
