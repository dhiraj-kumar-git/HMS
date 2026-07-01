import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import UploadLabReports from './UploadLabReports';

const mockDoctors = [
  { display_name: 'Dr. Smith' },
  { display_name: 'Dr. Jones' }
];

describe('UploadLabReports Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn((key) => {
      if (key === 'labReports') return null;
      return 'fake-token';
    });
    Storage.prototype.setItem = jest.fn();
    
    // Mock URL.createObjectURL
    global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-url');

    // Mock fetch
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/public/doctors')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDoctors)
        });
      }
      if (url.includes('/s3/upload-url')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ upload_url: 'http://mock-s3-url', key: 'mock-key' })
        });
      }
      if (url.includes('mock-s3-url')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/s3/save-metadata')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error('not found'));
    });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <UploadLabReports />
      </ChakraProvider>
    );
  };

  it('renders and fetches doctors', async () => {
    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Upload Lab Reports')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Dr. Smith' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Dr. Jones' })).toBeInTheDocument();
    });
  });

  it('validates form inputs', async () => {
    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Upload Lab Reports')).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload/i });

    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Institute ID is required')).toBeInTheDocument();
      expect(screen.getByText('Doctor name is required')).toBeInTheDocument();
      expect(screen.getByText('Lab report file is required')).toBeInTheDocument();
    });
  });

  it('handles file upload successfully', async () => {
    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Dr. Smith' })).toBeInTheDocument();
    });

    // Fill inputs
    const instituteIdInput = screen.getByPlaceholderText('Enter Institute ID');
    const doctorSelect = screen.getByRole('combobox', { name: /Doctor Name/i });
    
    // We need to query by label or some other way for the file input
    // The label is "Upload Lab Report"
    const fileInput = screen.getByLabelText('Upload Lab Report');

    await act(async () => {
      fireEvent.change(instituteIdInput, { target: { value: 'P123' } });
      fireEvent.change(doctorSelect, { target: { value: 'Dr. Smith' } });
      
      const file = new File(['dummy content'], 'report.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const uploadBtn = screen.getByRole('button', { name: /Upload/i });
    
    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/s3/upload-url'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'http://mock-s3-url',
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/s3/save-metadata'),
        expect.any(Object)
      );
      expect(screen.getByText('Uploaded Reports (Preview)')).toBeInTheDocument();
      expect(screen.getByText(/ID: P123 \| Doctor: Dr. Smith/i)).toBeInTheDocument();
    });
  });

  it('loads previously uploaded reports from localStorage', async () => {
    const savedReports = [
      {
        instituteId: 'P999',
        doctorName: 'Dr. Jones',
        previewUrl: 'blob:http://localhost/old-url',
        fileName: 'old-report.pdf',
        uploadedAt: '2026-06-20 10:00 AM'
      }
    ];
    Storage.prototype.getItem = jest.fn((key) => {
      if (key === 'labReports') return JSON.stringify(savedReports);
      return 'fake-token';
    });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Uploaded Reports (Preview)')).toBeInTheDocument();
      expect(screen.getByText(/ID: P999 \| Doctor: Dr. Jones/i)).toBeInTheDocument();
    });
  });
});
