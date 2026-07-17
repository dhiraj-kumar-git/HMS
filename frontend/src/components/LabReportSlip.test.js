import React from 'react';
import { render, screen } from '@testing-library/react';
import LabReportSlip from './LabReportSlip';
import { ChakraProvider } from '@chakra-ui/react';

const renderWithChakra = (ui) => {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
};

describe('LabReportSlip Component', () => {
  const patientInfo = {
    patientName: 'SHARWAN KUMAR VAJPAYEE',
    instituteId: '202500003662',
    gender: 'MALE',
    age: 54,
    doctorName: 'DR. GURU PRASAD BURNWAL',
    address: '119, MEERA MARG BITS',
    regDate: '2025-11-07T08:14:00Z',
    visitId: 'visit_12345',
    uhid: '201805300011'
  };

  const manualReports = [
    {
      test_name: 'Diabetic Profile',
      timestamp: '2026-07-17T12:52:00Z',
      results: {
        'GLUCOSE FASTING': { value: '161.00', reference_range: '60-110', units: 'mg/dl' },
        'GLUCOSE PP': { value: '187.00', reference_range: '80-140', units: 'mg/dl' },
        'HB A1C': { value: '8.00', reference_range: '4.20-6.20', units: '%' }
      },
      remarks: 'Patient needs medication adjustment.'
    }
  ];

  it('renders BITS Medical Centre institutional headers', () => {
    renderWithChakra(<LabReportSlip patientInfo={patientInfo} manualReports={manualReports} />);
    
    expect(screen.getByText('Birla Institute of Technology & Science')).toBeInTheDocument();
    expect(screen.getByText('MEDICAL CENTRE')).toBeInTheDocument();
    expect(screen.getByText('01596-515525')).toBeInTheDocument();
    expect(screen.getByText('medc@pilani.bits-pilani.ac.in')).toBeInTheDocument();
    expect(screen.getByText('www.bits-pilani.ac.in')).toBeInTheDocument();
  });

  it('renders patient demographic details correctly', () => {
    renderWithChakra(<LabReportSlip patientInfo={patientInfo} manualReports={manualReports} />);
    
    expect(screen.getByText(/: DR. GURU PRASAD BURNWAL/i)).toBeInTheDocument();
    expect(screen.getByText(/: SHARWAN KUMAR VAJPAYEE/i)).toBeInTheDocument();
    expect(screen.getAllByText(/: 202500003662/i)).toHaveLength(2);
    expect(screen.getByText(/: 54Y \/ MALE/i)).toBeInTheDocument();
    expect(screen.getByText(/: 119, MEERA MARG BITS/i)).toBeInTheDocument();
    expect(screen.getByText(/: 201805300011/i)).toBeInTheDocument();
  });

  it('renders lab profile categories, parameter rows, units and ranges', () => {
    renderWithChakra(<LabReportSlip patientInfo={patientInfo} manualReports={manualReports} />);
    
    expect(screen.getByText('DIABETIC PROFILE')).toBeInTheDocument();
    expect(screen.getByText('GLUCOSE FASTING')).toBeInTheDocument();
    expect(screen.getByText('161.00 *')).toBeInTheDocument(); // Abnormal result highlighted with *
    expect(screen.getByText('GLUCOSE PP')).toBeInTheDocument();
    expect(screen.getByText('187.00 *')).toBeInTheDocument(); // Abnormal result highlighted with *
    expect(screen.getByText('HB A1C')).toBeInTheDocument();
    
    // Check reference ranges
    expect(screen.getAllByText('mg/dl')).toHaveLength(2);
    expect(screen.getByText('60-110')).toBeInTheDocument();
    expect(screen.getByText('80-140')).toBeInTheDocument();
    expect(screen.getByText('4.20-6.20')).toBeInTheDocument();
    
    // Check remarks
    expect(screen.getByText(/Patient needs medication adjustment/i)).toBeInTheDocument();
  });

  it('renders signature line and barcode identifiers in footer', () => {
    renderWithChakra(<LabReportSlip patientInfo={patientInfo} manualReports={manualReports} />);
    
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByText('TEST No.')).toBeInTheDocument();
    expect(screen.getByText('UHID No.')).toBeInTheDocument();
    expect(screen.getByText('(visit_12345)')).toBeInTheDocument();
    expect(screen.getByText('(201805300011)')).toBeInTheDocument();
  });
});
