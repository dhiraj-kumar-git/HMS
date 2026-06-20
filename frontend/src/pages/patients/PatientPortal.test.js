import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import PatientPortal from './PatientPortal';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('PatientPortal Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <PatientPortal />
      </ChakraProvider>
    );
  };

  it('renders correctly', () => {
    renderComponent();
    expect(screen.getByText('Welcome to BITS Medical Center Patient Portal')).toBeInTheDocument();
    expect(screen.getByText('New Visitors')).toBeInTheDocument();
    expect(screen.getByText('Returning Patients')).toBeInTheDocument();
    expect(screen.getByText('Faculty & Staff')).toBeInTheDocument();
  });

  it('navigates to registration page when Register Now is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Register Now'));
    expect(mockNavigate).toHaveBeenCalledWith('/portal/register');
  });

  it('navigates to book appointment page when Book Appointment is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Book Appointment'));
    expect(mockNavigate).toHaveBeenCalledWith('/portal/book-appointment');
  });

  it('navigates to staff registration page when Register Family is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Register Family'));
    expect(mockNavigate).toHaveBeenCalledWith('/portal/staff-register');
  });

  it('navigates to login page when Clinic Staff Login is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Clinic Staff Login'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
