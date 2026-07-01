import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import PatientRegistration from './PatientRegistration';

jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('PatientRegistration Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <PatientRegistration />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders the form correctly', () => {
    renderComponent();

    expect(screen.getByText('Self Registration')).toBeInTheDocument();
    expect(screen.getByLabelText(/BITS Institute ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/BITS Email ID/i)).toBeInTheDocument();
  });

  it('handles form submission successfully', async () => {
    axios.post.mockResolvedValueOnce({ data: { institute_id: '12345' } });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/BITS Institute ID/i), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/BITS Email ID/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Patient Type/i), { target: { value: 'Student' } });
    fireEvent.change(screen.getByLabelText(/Date of Birth/i), { target: { value: '2000-01-01' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { value: 'Male' } });
    fireEvent.change(screen.getByLabelText(/Contact Number/i), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText(/Address \/ Hostel/i), { target: { value: 'Ashok Bhawan' } });

    const submitBtn = screen.getByText('Complete Registration');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/register'),
        expect.objectContaining({
          institute_id: '12345',
          name: 'John Doe',
          address: 'Ashok Bhawan',
        })
      );
    });
  });

  it('handles custom address correctly', async () => {
    axios.post.mockResolvedValueOnce({ data: { institute_id: '12345' } });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/Address \/ Hostel/i), { target: { value: 'Other' } });

    // Custom Address should appear
    await waitFor(() => expect(screen.getByLabelText(/Custom Address Details/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Custom Address Details/i), { target: { value: 'My Custom Home' } });

    fireEvent.click(screen.getByText('Complete Registration'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/public/register'),
        expect.objectContaining({
          address: 'My Custom Home',
        })
      );
    });
  });

  it('handles API error during submission', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Registration failed' } } });

    renderComponent();

    const submitBtn = screen.getByText('Complete Registration');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });
  });

  it('navigates back to portal', () => {
    renderComponent();

    const backBtn = screen.getByText('Back to Portal');
    fireEvent.click(backBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/portal');
  });
});
