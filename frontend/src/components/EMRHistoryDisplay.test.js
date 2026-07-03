import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EMRHistoryDisplay from './EMRHistoryDisplay';
import { ChakraProvider } from '@chakra-ui/react';

const renderWithChakra = (ui) => {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
};

describe('EMRHistoryDisplay', () => {
  it('renders legacy view if no emrData is provided', () => {
    const legacyApp = {
      doctor_name: "Dr. Smith",
      diagnosis_note: ["Some legacy note"],
      prescription_summary: ["Paracetamol"],
      lab_test_summary: ["CBC"]
    };
    renderWithChakra(<EMRHistoryDisplay legacyApp={legacyApp} />);
    
    expect(screen.getByText(/Medicines Prescribed/i)).toBeInTheDocument();
    expect(screen.getByText(/Some legacy note/i)).toBeInTheDocument();
    expect(screen.getByText(/Paracetamol/i)).toBeInTheDocument();
    expect(screen.getByText(/CBC/i)).toBeInTheDocument();
  });

  it('renders EMR data layout with provided values', () => {
    const emrData = {
      subjective: {
        chief_complaints: "Fever",
        past_medical_history: "None",
        allergies: "Peanuts"
      },
      objective: {
        vitals: {
          blood_pressure: "120/80"
        }
      },
      assessment: {
        provisional_diagnosis: "Viral fever"
      },
      plan: {
        medications: [{ drug: "Dolo", quantity: "10", dose: "650mg" }],
        investigations: ["CBC"],
        advice: "Rest",
        follow_up_date: "2026-07-10"
      }
    };
    
    renderWithChakra(<EMRHistoryDisplay emrData={emrData} legacyApp={{}} />);
    
    expect(screen.getByText(/Chief Complaints/i)).toBeInTheDocument();
    expect(screen.getByText("Fever")).toBeInTheDocument();
    expect(screen.getByText("Peanuts")).toBeInTheDocument();
    expect(screen.getByText("BP: 120/80")).toBeInTheDocument();
    expect(screen.getByText("Viral fever")).toBeInTheDocument();
    expect(screen.getByText("Dolo")).toBeInTheDocument();
    expect(screen.getByText("• CBC")).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("2026-07-10")).toBeInTheDocument();
  });

  it('renders placeholders for empty fields', () => {
    const emrData = {
      subjective: {},
      objective: {},
      assessment: {},
      plan: {}
    };
    
    renderWithChakra(<EMRHistoryDisplay emrData={emrData} legacyApp={{}} />);
    
    expect(screen.getByText(/Chief Complaints/i)).toBeInTheDocument();
    // Since many fields are empty, there should be multiple "-" texts
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThan(5);
  });
});
