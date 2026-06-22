import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import ReceptionistDashboard from './ReceptionistDashboard';

jest.mock('./ReceptionistQueue', () => () => <div data-testid="mock-queue">Receptionist Queue</div>);

describe('ReceptionistDashboard Component', () => {
  beforeEach(() => {
    localStorage.setItem('username', 'recept1');
    localStorage.setItem('role', 'receptionist');
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
});
