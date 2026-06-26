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

  it('handles beforeprint and afterprint events for successful print', async () => {
    const onClose = jest.fn();
    let beforePrintCb = null;
    let afterPrintCb = null;

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query) => {
      if (query === 'print') {
        return {
          addListener: (cb) => { beforePrintCb = cb; },
          removeListener: jest.fn(),
        };
      }
      return originalMatchMedia(query);
    });

    const originalAddEventListener = window.addEventListener;
    const originalRemoveEventListener = window.removeEventListener;

    window.addEventListener = jest.fn().mockImplementation((event, cb) => {
      if (event === 'afterprint') afterPrintCb = cb;
      else originalAddEventListener(event, cb);
    });
    window.removeEventListener = jest.fn().mockImplementation((event, cb) => {
      if (event === 'afterprint') return;
      originalRemoveEventListener(event, cb);
    });

    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    const printBtn = screen.getByRole('button', { name: /Print Prescription/i });
    fireEvent.click(printBtn);

    expect(window.print).toHaveBeenCalledTimes(1);
    
    // Trigger events
    if (beforePrintCb) beforePrintCb(); // simulates beforeprint
    if (afterPrintCb) afterPrintCb();   // simulates afterprint

    // Should show success toast
    expect(await screen.findByText('Print Completed')).toBeInTheDocument();

    // Restore
    window.matchMedia = originalMatchMedia;
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
  });

  it('handles afterprint event for cancelled print', async () => {
    const onClose = jest.fn();
    let afterPrintCb = null;

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query) => {
      if (query === 'print') {
        return {
          addListener: jest.fn(), // We don't trigger beforePrintCb to simulate cancellation
          removeListener: jest.fn(),
        };
      }
      return originalMatchMedia(query);
    });

    const originalAddEventListener = window.addEventListener;
    const originalRemoveEventListener = window.removeEventListener;

    window.addEventListener = jest.fn().mockImplementation((event, cb) => {
      if (event === 'afterprint') afterPrintCb = cb;
      else originalAddEventListener(event, cb);
    });
    window.removeEventListener = jest.fn().mockImplementation((event, cb) => {
      if (event === 'afterprint') return;
      originalRemoveEventListener(event, cb);
    });

    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    const printBtn = screen.getByRole('button', { name: /Print Prescription/i });
    fireEvent.click(printBtn);

    if (afterPrintCb) afterPrintCb();   // simulates afterprint without beforeprint

    // Should show cancelled toast
    expect(await screen.findByText('Print Cancelled')).toBeInTheDocument();

    // Restore
    window.matchMedia = originalMatchMedia;
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
  });

  it('handles print error correctly', async () => {
    const mockPrint = jest.spyOn(window, 'print').mockImplementation(() => {
      throw new Error('Print failed');
    });

    const onClose = jest.fn();
    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    const printBtn = screen.getByRole('button', { name: /Print Prescription/i });
    fireEvent.click(printBtn);

    expect(await screen.findByText('Print Error')).toBeInTheDocument();

    mockPrint.mockRestore();
  });

  it('closes when close button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ isOpen: true, onClose, prescriptionData: mockPrescriptionData });

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
