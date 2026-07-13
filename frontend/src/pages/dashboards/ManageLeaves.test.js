import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import ManageLeaves from './ManageLeaves';
import axios from 'axios';

jest.mock('axios');

describe('ManageLeaves Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem("token", "mock-token");
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctors')) {
        return Promise.resolve({ data: [{ username: 'doc1', display_name: 'Dr. House', department: 'General' }] });
      }
      if (url.includes('/receptionist/leaves')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error('not found'));
    });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <ManageLeaves />
      </ChakraProvider>
    );
  };

  it('renders components and fetches doctors', async () => {
    renderComponent();
    expect(screen.getByText('Manage Doctor Leaves')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Dr. House (General)')).toBeInTheDocument();
    });
  });

  it('validates leave registration form submission', async () => {
    const { container } = renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Dr. House (General)')).toBeInTheDocument();
    });
    
    axios.post.mockResolvedValueOnce({ data: { message: 'Leave recorded' } });
    
    // Submit form
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'doc1' } });
    
    // Select dates using label or native selectors
    const startDateInput = container.querySelector('input[type="date"]:first-of-type') || screen.getByLabelText(/Start Date/i);
    const endDateInput = container.querySelector('input[type="date"]:last-of-type') || screen.getByLabelText(/End Date/i);
    
    fireEvent.change(startDateInput, { target: { value: '2026-07-15' } });
    fireEvent.change(endDateInput, { target: { value: '2026-07-20' } });
    
    fireEvent.click(screen.getByText('Mark Doctor On Leave'));
  });
});
