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
    expect(screen.getByText('Book an Appointment')).toBeInTheDocument();
  });



  it('navigates to book appointment page when Book Appointment is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Book Appointment'));
    expect(mockNavigate).toHaveBeenCalledWith('/portal/book-appointment');
  });



  it('navigates to login page when Clinic Staff Login is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByText('Clinic Staff Login'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
