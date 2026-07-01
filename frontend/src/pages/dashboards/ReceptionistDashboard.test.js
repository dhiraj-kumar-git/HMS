import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistDashboard from './ReceptionistDashboard';

jest.mock('axios');
jest.mock('./ReceptionistQueue', () => () => <div data-testid="mock-queue">Receptionist Queue</div>);

describe('ReceptionistDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'recept1');
    localStorage.setItem('role', 'receptionist');
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('session_id', 'fake-session');
    
    // Mock window.location.href
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDashboard = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <ReceptionistDashboard />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders the ReceptionistDashboard layout with Queue', () => {
    renderDashboard();

    expect(screen.getByText(/Receptionist Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Appointments Dashboard/i)).toBeInTheDocument();
    expect(screen.getByTestId('mock-queue')).toBeInTheDocument();
  });

  it('handles logout successfully', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: 'Logged out' } });

    renderDashboard();

    const profileMenu = screen.getByText(/Welcome, recept1/i);
    profileMenu.click(); // Open menu

    const logoutButton = screen.getByText(/Logout/i);
    logoutButton.click();

    await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async operations

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/logout'),
      { session_id: 'fake-session' },
      { headers: { Authorization: 'Bearer fake-token' } }
    );

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('username')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
    expect(localStorage.getItem('session_id')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('handles logout failure gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    axios.post.mockRejectedValueOnce(new Error('Network Error'));

    renderDashboard();

    const profileMenu = screen.getByText(/Welcome, recept1/i);
    profileMenu.click(); // Open menu

    const logoutButton = screen.getByText(/Logout/i);
    logoutButton.click();

    await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async operations

    expect(consoleSpy).toHaveBeenCalledWith('Logout failed:', expect.any(Error));
    
    // Even on failure, it should clear local storage and redirect
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
    
    consoleSpy.mockRestore();
  });
});
