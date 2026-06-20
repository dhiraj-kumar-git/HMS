import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import PrescriptionModal from './PrescriptionModal';

// Rely on the global matchMedia mock from setupTests.js
beforeAll(() => {
  window.print = jest.fn();
});

describe('PrescriptionModal Component', () => {
  const renderModal = (props) => {
    return render(
      <ChakraProvider>
        <PrescriptionModal {...props} />
      </ChakraProvider>
    );
  };

  const mockPrescriptionData = {
    name: 'John Doe',
    gender: 'Male',
    age: 30,
    contact_no: '1234567890',
    email: 'john@example.com',
    address: '123 Test St',
    opdNumber: 'OPD-123',
    institute_id: 'ID-456'
  };

  it('renders correctly when open', () => {
    const onClose = jest.fn();
    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    // Header details
    expect(screen.getByText('Birla Institute of Technology & Science')).toBeInTheDocument();
    expect(screen.getByText('OPD CARD / SLIP')).toBeInTheDocument();
    
    // Patient details
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/MALE \/ 30Yr/i)).toBeInTheDocument();
    expect(screen.getByText(/: 1234567890/i)).toBeInTheDocument();
    expect(screen.getByText(/: john@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/: 123 Test St/i)).toBeInTheDocument();
    expect(screen.getByText(/: OPD-123/i)).toBeInTheDocument();
    expect(screen.getByText(/: ID-456/i)).toBeInTheDocument();
  });

  it('triggers print function when Print Prescription is clicked', () => {
    const onClose = jest.fn();
    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    const printBtn = screen.getByRole('button', { name: /Print Prescription/i });
    fireEvent.click(printBtn);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('closes when close button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
