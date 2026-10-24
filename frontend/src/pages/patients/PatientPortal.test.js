import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import PatientPortal from './PatientPortal';
import axios from 'axios';

jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('PatientPortal Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({ data: [] });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <PatientPortal />
      </ChakraProvider>
    );
  };

  it('renders correctly', async () => {
    renderComponent();
    expect(screen.getByText('Welcome to BITS Medical Center Patient Portal')).toBeInTheDocument();
    expect(screen.getByText('Book an Appointment')).toBeInTheDocument();
    await screen.findByText('Medical Center Information Board');
  });

  it('navigates to book appointment page when Login to Patient Portal is clicked', async () => {
    renderComponent();
    await screen.findByText('Medical Center Information Board');
    fireEvent.click(screen.getByText('Login to Patient Portal'));
    expect(mockNavigate).toHaveBeenCalledWith('/portal/book-appointment');
  });

  it('navigates to login page when Clinic Staff Login is clicked', async () => {
    renderComponent();
    await screen.findByText('Medical Center Information Board');
    fireEvent.click(screen.getByText('Clinic Staff Login'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
