import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistDashboard from './ReceptionistDashboard';

// Mock axios
jest.setTimeout(30000);
jest.mock('axios');



describe('ReceptionistDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'recept1');
    localStorage.setItem('token', 'fake-token');

    axios.get.mockResolvedValue({
      data: [
        { username: 'doc1', display_name: 'Dr. John', department: 'General' }
      ]
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDashboard = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <ReceptionistDashboard />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders correctly and fetches doctors', async () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: /Register Patient/i })).toBeInTheDocument();
    
    await waitFor(() => {
      // The option for the doctor should be populated
      expect(screen.getByText('Dr. John (General)')).toBeInTheDocument();
    });
  });

  it('handles input changes and submits the form', async () => {
    axios.post.mockResolvedValueOnce({ data: { institute_id: 'OPD-12345' } });

    renderDashboard();

    // Fill form
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { name: 'name', value: 'Test Patient' } });
    fireEvent.change(screen.getByLabelText(/Date of Birth/i), { target: { name: 'date_of_birth', value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { name: 'gender', value: 'Male' } });
    fireEvent.change(screen.getByLabelText(/Contact No/i), { target: { name: 'contact_no', value: '1234567890' } });
    fireEvent.change(screen.getByLabelText(/Patient Type/i), { target: { name: 'patient_type', value: 'Student' } });
    
    // Institute ID appears if Student
    await waitFor(() => expect(screen.getByLabelText(/Institute ID/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Institute ID/i), { target: { name: 'institute_id', value: 'f20201234' } });

    fireEvent.change(screen.getByLabelText(/Email ID/i), { target: { name: 'email', value: 'f20201234' } });
    fireEvent.change(screen.getByLabelText(/Address/i), { target: { name: 'address', value: 'Hostel' } });
    fireEvent.change(screen.getByLabelText(/Assign Doctor/i), { target: { name: 'doctor_assigned', value: 'doc1' } });

    const registerBtn = screen.getByRole('button', { name: /Register Patient/i });
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/register_patient'),
        expect.objectContaining({
          name: 'Test Patient',
          email: 'f20201234@pilani.bits-pilani.ac.in',
          doctor_assigned: 'doc1'
        }),
        expect.any(Object)
      );
    });

    // Check if Prescription modal opens (looking for print button)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Print Prescription/i })).toBeInTheDocument();
    });
  });
});
