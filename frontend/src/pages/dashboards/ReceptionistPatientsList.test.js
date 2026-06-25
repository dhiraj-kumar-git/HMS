import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistPatientsList from './ReceptionistPatientsList';

jest.mock('axios');
jest.mock('../patients/PatientsList', () => () => <div data-testid="patients-list-mock">Patients List Mock</div>);

describe('ReceptionistPatientsList Component', () => {
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
        <ReceptionistPatientsList />
      </ChakraProvider>
    );
  };

  it('renders header and patients list mock correctly', () => {
    renderComponent();

    expect(screen.getByText('Patient Directory')).toBeInTheDocument();
    expect(screen.getByText('Welcome, recept1')).toBeInTheDocument();
    expect(screen.getByTestId('patients-list-mock')).toBeInTheDocument();
  });

  it('handles logout successfully', async () => {
    localStorage.setItem('session_id', 'fake-session');
    axios.post.mockResolvedValueOnce({ data: { message: 'Logged out' } });

    renderComponent();

    const logoutBtn = screen.getByText('Logout');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/logout'),
        { session_id: 'fake-session' },
        expect.objectContaining({
          headers: { Authorization: 'Bearer fake-token' }
        })
      );
      expect(localStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });

  it('handles logout error gracefully', async () => {
    localStorage.setItem('session_id', 'fake-session');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    axios.post.mockRejectedValueOnce(new Error('Logout failed server'));

    renderComponent();

    const logoutBtn = screen.getByText('Logout');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Logout failed:', expect.any(Error));
      expect(localStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    consoleSpy.mockRestore();
  });
});
