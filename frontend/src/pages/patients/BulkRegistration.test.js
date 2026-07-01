import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import BulkRegistration from './BulkRegistration';

jest.mock('axios');

describe('BulkRegistration Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <BulkRegistration />
      </ChakraProvider>
    );
  };

  it('renders both tabs', () => {
    renderComponent();
    expect(screen.getAllByText('Student Bulk Registration').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Faculty & Staff Bulk Registration').length).toBeGreaterThan(0);
  });

  it('downloads the template successfully', async () => {
    const mockBlob = new Blob(['mock data'], { type: 'text/csv' });
    axios.get.mockResolvedValueOnce({ data: mockBlob });

    renderComponent();

    // The first "Download Template" button for students
    const downloadBtns = screen.getAllByText('Download Template');
    fireEvent.click(downloadBtns[0]);

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/admin/bulk_register/template'),
        expect.any(Object)
      );
    });
  });

  it('shows error for invalid file type', () => {
    renderComponent();

    const fileInput = document.querySelector('input[type="file"]');
    const invalidFile = new File(['mock content'], 'test.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(screen.getByText('Please upload a valid .csv or .xlsx file.')).toBeInTheDocument();
  });

  it('handles valid file selection and upload successfully', async () => {
    axios.post.mockResolvedValueOnce({
      data: { total: 2, success: 2, failed: 0, errors: [] }
    });

    renderComponent();

    const fileInput = document.querySelector('input[type="file"]');
    const validFile = new File(['dummy content'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    // Ensure validate & upload button is enabled
    const uploadBtns = await screen.findAllByText(/Validate & Upload/i);
    expect(uploadBtns[0]).not.toBeDisabled();

    fireEvent.click(uploadBtns[0]);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
      expect(screen.getByText(/Upload Complete!/i)).toBeInTheDocument();
    });
  });

  it('handles partial success and displays errors', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        total: 2,
        success: 1,
        failed: 1,
        errors: [{ row: 2, institute_id: '123', reason: 'Duplicate ID' }]
      }
    });

    renderComponent();

    const fileInput = document.querySelector('input[type="file"]');
    const validFile = new File(['dummy content'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const uploadBtns = await screen.findAllByText(/Validate & Upload/i);
    fireEvent.click(uploadBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Upload Finished with Errors/i)).toBeInTheDocument();
      expect(screen.getByText('Duplicate ID')).toBeInTheDocument();
    });

    // Test error report download
    const downloadErrBtn = screen.getByText(/Download Error Report/i);
    fireEvent.click(downloadErrBtn);
  });

  it('allows resetting the uploader', async () => {
    axios.post.mockResolvedValueOnce({
      data: { total: 1, success: 1, failed: 0, errors: [] }
    });

    renderComponent();

    const fileInput = document.querySelector('input[type="file"]');
    const validFile = new File(['dummy content'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    const uploadBtns = await screen.findAllByText(/Validate & Upload/i);
    fireEvent.click(uploadBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Upload Complete!/i)).toBeInTheDocument();
    });

    const resetBtn = screen.getByText(/Upload Another File/i);
    fireEvent.click(resetBtn);

    expect(screen.queryByText(/Upload Complete!/i)).not.toBeInTheDocument();
  });
});
