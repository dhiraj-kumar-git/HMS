import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EMRHistoryDisplay from './EMRHistoryDisplay';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';

jest.mock('axios');

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
    expect(screen.getByText("BP: 120/80 mmHg")).toBeInTheDocument();
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

  it('renders a warning banner if the legacy visit has cancelled status', () => {
    const legacyApp = {
      doctor_name: "Dr. Smith",
      status: "cancelled",
      prescription_summary: ["Paracetamol"]
    };
    renderWithChakra(<EMRHistoryDisplay legacyApp={legacyApp} />);
    expect(screen.getByText("Bill Cancelled")).toBeInTheDocument();
    expect(screen.getByText("The entire bill for this visit has been cancelled.")).toBeInTheDocument();
  });

  it('renders a warning banner in EMR data view if the visit has cancelled status', () => {
    const emrData = {
      subjective: { chief_complaints: "Fever" }
    };
    const legacyApp = {
      status: "cancelled"
    };
    renderWithChakra(<EMRHistoryDisplay emrData={emrData} legacyApp={legacyApp} />);
    expect(screen.getByText("Bill Cancelled")).toBeInTheDocument();
    expect(screen.getByText("The entire bill for this visit has been cancelled.")).toBeInTheDocument();
  });

  it('renders uploaded lab reports and handles download', async () => {
    const legacyApp = {
      lab_reports: [
        {
          test_name: "Lipid Profile",
          file_name: "lipid_report.pdf",
          s3_key: "reports/patient123/lipid.pdf",
          uploaded_at: "2026-07-15T12:00:00Z"
        }
      ]
    };
    axios.post.mockResolvedValue({ data: { url: "http://mock-s3-presigned-url" } });
    window.open = jest.fn();

    renderWithChakra(<EMRHistoryDisplay legacyApp={legacyApp} />);

    expect(screen.getByText("Uploaded Lab Reports (Files)")).toBeInTheDocument();
    expect(screen.getByText("Lipid Profile")).toBeInTheDocument();
    expect(screen.getByText(/lipid_report.pdf/)).toBeInTheDocument();

    const downloadBtn = screen.getByRole('button', { name: /Download/i });
    expect(downloadBtn).toBeInTheDocument();
    
    const fireEvent = require('@testing-library/react').fireEvent;
    await fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/s3/view-url'),
        { s3_key: "reports/patient123/lipid.pdf" },
        expect.any(Object)
      );
      expect(window.open).toHaveBeenCalledWith("http://mock-s3-presigned-url", "_blank");
    });
  });

  it('shows descriptive alert with HTTP status when download API call fails', async () => {
    const legacyApp = {
      lab_reports: [
        {
          test_name: "Blood Test",
          file_name: "blood.pdf",
          s3_key: "reports/patient/blood.pdf",
          uploaded_at: "2026-07-15T12:00:00Z"
        }
      ]
    };
    const mockError = { response: { status: 422, data: { msg: "Missing Authorization Header" } } };
    axios.post.mockRejectedValue(mockError);
    window.alert = jest.fn();

    renderWithChakra(<EMRHistoryDisplay legacyApp={legacyApp} />);

    const fireEvent = require('@testing-library/react').fireEvent;
    const downloadBtn = screen.getByRole('button', { name: /Download/i });
    await fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('422')
      );
    });
  });

  it('shows specific alert when s3_key is missing on a report', async () => {
    const legacyApp = {
      lab_reports: [
        {
          test_name: "ECG",
          file_name: "ecg.pdf",
          s3_key: null, // missing key
          uploaded_at: "2026-07-15T12:00:00Z"
        }
      ]
    };
    window.alert = jest.fn();

    renderWithChakra(<EMRHistoryDisplay legacyApp={legacyApp} />);

    const fireEvent = require('@testing-library/react').fireEvent;
    const downloadBtn = screen.getByRole('button', { name: /Download/i });
    await fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('No S3 key available')
      );
      // Should NOT have made any API call
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
