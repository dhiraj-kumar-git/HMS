import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistRegistration from './ReceptionistRegistration';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

jest.mock('axios');
jest.setTimeout(30000);

describe('ReceptionistRegistration Component', () => {
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

  const renderRegistration = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <ReceptionistRegistration />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders registration tiles correctly', () => {
    renderRegistration();

    expect(screen.getByText('Select Registration Type')).toBeInTheDocument();
    expect(screen.getByText('Student & Visitors')).toBeInTheDocument();
    expect(screen.getByText('Faculty & Staff')).toBeInTheDocument();
  });

  it('navigates to student registration on click', () => {
    renderRegistration();
    
    const studentTile = screen.getByText('Student & Visitors').closest('button');
    fireEvent.click(studentTile);
    expect(mockNavigate).toHaveBeenCalledWith('/receptionist/register-student');
  });

  it('navigates to staff registration on click', () => {
    renderRegistration();
    
    const staffTile = screen.getByText('Faculty & Staff').closest('button');
    fireEvent.click(staffTile);
    expect(mockNavigate).toHaveBeenCalledWith('/receptionist/register-staff');
  });

  it('handles logout', async () => {
    localStorage.setItem('session_id', 'fake-session');
    axios.post.mockResolvedValueOnce({ data: { message: 'Logged out' } });
    
    renderRegistration();
    
    const logoutBtn = screen.getByText('Logout');
    fireEvent.click(logoutBtn);
    
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/logout'),
        { session_id: 'fake-session' },
        expect.any(Object)
      );
      expect(localStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });
});
