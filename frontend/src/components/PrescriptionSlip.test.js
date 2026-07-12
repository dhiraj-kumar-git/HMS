import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import PrescriptionSlip from './PrescriptionSlip';

describe('PrescriptionSlip Component', () => {
  const renderComponent = (props) => {
    return render(
      <ChakraProvider>
        <PrescriptionSlip {...props} />
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
    institute_id: 'ID-456',
    emr_data: {
      subjective: {
        chief_complaints: 'High Fever, Dry Cough',
        history_of_present_illness: 'Symptoms for 3 days',
        allergies: 'NKDA'
      },
      objective: {
        vitals: {
          blood_pressure: '120/80',
          pulse: '72',
          temperature: '98.6'
        },
        general_examination: 'General condition stable'
      },
      assessment: {
        provisional_diagnosis: 'Viral Fever'
      },
      plan: {
        medications: [
          { drug: 'Paracetamol 500mg', dose: '1-0-1', route: 'Oral', frequency: 'Twice daily', duration: '5 days', quantity: '10' }
        ],
        investigations: ['CBC'],
        advice: 'Drink warm water'
      }
    }
  };

  it('renders patient and clinic header details correctly', () => {
    renderComponent({ prescriptionData: mockPrescriptionData });

    expect(screen.getByText('Birla Institute of Technology & Science')).toBeInTheDocument();
    expect(screen.getByText('MEDICAL CENTRE')).toBeInTheDocument();
    expect(screen.getByText('OPD CARD / SLIP')).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/MALE \/ 30Yr/i)).toBeInTheDocument();
    expect(screen.getByText(/: 123 Test St/i)).toBeInTheDocument();
  });

  it('renders EMR subjective and objective details correctly', () => {
    renderComponent({ prescriptionData: mockPrescriptionData });

    expect(screen.getByText(/High Fever, Dry Cough/i)).toBeInTheDocument();
    expect(screen.getByText(/Viral Fever/i)).toBeInTheDocument();
    expect(screen.getByText(/NKDA/i)).toBeInTheDocument();
    expect(screen.getByText(/BP: 120\/80 mmHg/i)).toBeInTheDocument();
    expect(screen.getByText(/Pulse: 72 bpm/i)).toBeInTheDocument();
    expect(screen.getByText(/General condition stable/i)).toBeInTheDocument();
  });

  it('renders prescribed medications and investigations correctly', () => {
    renderComponent({ prescriptionData: mockPrescriptionData });

    expect(screen.getByText(/1. Paracetamol 500mg/i)).toBeInTheDocument();
    expect(screen.getByText(/Qty: 10/i)).toBeInTheDocument();
    expect(screen.getByText(/• CBC/i)).toBeInTheDocument();
    expect(screen.getByText(/Drink warm water/i)).toBeInTheDocument();
  });

  it('splits into page 2 if medications list exceeds page 1 threshold', () => {
    const dataWithManyMeds = {
      ...mockPrescriptionData,
      emr_data: {
        ...mockPrescriptionData.emr_data,
        plan: {
          ...mockPrescriptionData.emr_data.plan,
          medications: [
            { drug: 'M1', dose: '1', route: 'O', frequency: 'D', duration: '5', quantity: '5' },
            { drug: 'M2', dose: '1', route: 'O', frequency: 'D', duration: '5', quantity: '5' },
            { drug: 'M3', dose: '1', route: 'O', frequency: 'D', duration: '5', quantity: '5' },
            { drug: 'M4', dose: '1', route: 'O', frequency: 'D', duration: '5', quantity: '5' },
            { drug: 'M5', dose: '1', route: 'O', frequency: 'D', duration: '5', quantity: '5' },
            { drug: 'M6', dose: '1', route: 'O', frequency: 'D', duration: '5', quantity: '5' }
          ]
        }
      }
    };

    renderComponent({ prescriptionData: dataWithManyMeds });

    // Should render two pages (Page 1 of 2, Page 2 of 2)
    expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText(/PRESCRIPTION CONTINUATION SHEET/i)).toBeInTheDocument();

    // Check first and last drugs are on their respective pages
    expect(screen.getByText(/1. M1/i)).toBeInTheDocument();
    expect(screen.getByText(/5. M5/i)).toBeInTheDocument();
    expect(screen.getByText(/6. M6/i)).toBeInTheDocument();
  });
});
