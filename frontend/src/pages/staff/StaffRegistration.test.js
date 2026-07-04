import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import StaffRegistration from './StaffRegistration';

jest.setTimeout(20000); // Prevent timeouts during full suite run
jest.mock('axios');
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('StaffRegistration Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <StaffRegistration />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders initial form and allows input in primary member details', () => {
    renderComponent();

    expect(screen.getByText(/Faculty & Staff Registration/i)).toBeInTheDocument();
    
    // Fill out PSRN
    const psrnInput = screen.getByPlaceholderText('e.g. P1999');
    fireEvent.change(psrnInput, { target: { value: 'P1234' } });
    expect(psrnInput.value).toBe('P1234');

    // Fill out Name
    const nameInput = screen.getByLabelText(/Full Name/i);
    fireEvent.change(nameInput, { target: { value: 'John Staff' } });
    expect(nameInput.value).toBe('John Staff');
  });

  it('adds and removes dependant rows in new registration tab', () => {
    renderComponent();

    const addDependantButton = screen.getByRole('button', { name: /Add Dependant/i });
    
    // Initially no dependant inputs
    expect(screen.queryByText(/Dependant #1/i)).not.toBeInTheDocument();

    // Add dependant
    fireEvent.click(addDependantButton);
    expect(screen.getByText(/Dependant #1/i)).toBeInTheDocument();

    // Add second dependant
    fireEvent.click(addDependantButton);
    expect(screen.getByText(/Dependant #2/i)).toBeInTheDocument();

    // Remove first dependant
    const removeButtons = screen.getAllByRole('button', { name: '' }); 
    // The trash icon button for dependant has no aria-label, but we can query by the icon or just grab the correct button
    // Let's find it more robustly by querying SVG or simply clicking the first 'close' like button that is ghost red.
    // However, Chakra UI IconButton usually takes aria-label. Wait, the code doesn't have aria-label for the row delete button!
    // Let's just click the first button within the dependant box.
    const firstDependantBox = screen.getByText(/Dependant #1/i).closest('div');
    const deleteBtn = firstDependantBox.querySelector('button');
    fireEvent.click(deleteBtn);

    // After removing first, the second becomes Dependant #1
    expect(screen.queryByText(/Dependant #2/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Dependant #1/i)).toBeInTheDocument();
  });

  it('handles new registration flow up to confirm modal', async () => {
    renderComponent();

    // Fill primary details
    fireEvent.change(screen.getByPlaceholderText('e.g. P1999'), { target: { value: 'P1234' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'John Staff' } });
    fireEvent.change(screen.getByLabelText(/Email/i, { selector: 'input[name="email"]' }), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Patient Type/i), { target: { value: 'Faculty' } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: /Register Staff & Dependants/i });
    fireEvent.click(submitButton);

    // Confirm Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Confirm Registration Details/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/John Staff/i)).toBeInTheDocument();
    expect(screen.getByText(/P1234/i)).toBeInTheDocument();
  });

  it('switches to Add New Dependant tab and verifies PSRN', async () => {
    renderComponent();

    const addDependantTab = screen.getByRole('tab', { name: /Add New Dependant/i });
    fireEvent.click(addDependantTab);

    const existingPsrnInput = screen.getByPlaceholderText(/Enter the PSRN ID/i);
    fireEvent.change(existingPsrnInput, { target: { value: 'P9999' } });

    // Click verify
    const verifyButton = screen.getByRole('button', { name: /Verify PSRN/i });
    
    axios.post.mockResolvedValueOnce({ data: { requires_otp: false } });
    axios.get.mockResolvedValueOnce({ data: [] }); // fetch dependants

    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/public/verify'), { institute_id: 'P9999' });
    });

    await waitFor(() => {
      expect(screen.getByText(/New Dependant Details/i)).toBeInTheDocument();
    });
  });

  it('handles OTP verification for Add New Dependant tab', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('tab', { name: /Add New Dependant/i }));

    const existingPsrnInput = screen.getByPlaceholderText(/Enter the PSRN ID/i);
    fireEvent.change(existingPsrnInput, { target: { value: 'P9999' } });

    axios.post.mockResolvedValueOnce({ data: { requires_otp: true, email: 'j***@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Verify PSRN/i }));

    // OTP Modal appears
    await waitFor(() => {
      expect(screen.getByText(/j\*\*\*@example\.com/i)).toBeInTheDocument();
    });

    const otpInput = screen.getByPlaceholderText('----');
    fireEvent.change(otpInput, { target: { value: '1234' } });

    axios.post.mockResolvedValueOnce({ data: { success: true } });
    axios.get.mockResolvedValueOnce({ data: [] });

    fireEvent.click(screen.getByRole('button', { name: /Verify OTP$/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/public/verify-otp'), { institute_id: 'P9999', otp: '1234' });
    });

    await waitFor(() => {
      expect(screen.getByText(/New Dependant Details/i)).toBeInTheDocument();
    });
  });

  it('handles completing new registration with OTP', async () => {
    renderComponent();

    // Fill primary
    fireEvent.change(screen.getByPlaceholderText('e.g. P1999'), { target: { value: 'P1234' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'John Staff' } });
    fireEvent.change(screen.getByLabelText(/Email/i, { selector: 'input[name="email"]' }), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Patient Type/i), { target: { value: 'Faculty' } });

    // Click submit
    fireEvent.click(screen.getByRole('button', { name: /Register Staff & Dependants/i }));
    
    // Confirm Modal
    await screen.findByText(/Confirm Registration Details/i);
    
    // Mock send OTP
    axios.post.mockResolvedValueOnce({ data: { message: 'OTP Sent' } });
    
    // Confirm & Send OTP
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Send OTP/i }));
    
    await screen.findByText(/Verify Your Identity/i);
    
    // Mock verify registration OTP & final register
    axios.post.mockResolvedValueOnce({ data: { success: true } }); // verify OTP
    axios.post.mockResolvedValueOnce({ data: { success: true } }); // register
    
    // Fill OTP
    const otpInput = screen.getAllByPlaceholderText('----')[1] || screen.getAllByPlaceholderText('----')[0]; 
    fireEvent.change(otpInput, { target: { value: '1234' } });
    
    // Wait for the keydown event simulation instead of button click, since OTP modal uses a button or Enter
    // Actually wait, there is no button "Verify OTP" in the Registration OTP modal? Ah! In the code: 
    // Registration OTP Modal doesn't have a verify button, it relies on Enter key!
    fireEvent.keyDown(otpInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/public/verify_registration_otp'), expect.any(Object));
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/public/register_staff'), expect.any(Object));
    });
  });

  it('handles dependant edit and delete', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('tab', { name: /Add New Dependant/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter the PSRN ID/i), { target: { value: 'P9999' } });
    
    axios.post.mockResolvedValueOnce({ data: { requires_otp: false } });
    axios.get.mockResolvedValueOnce({ 
      data: [{ institute_id: 'DEP1', name: 'Child', patient_type: 'Dependant', relation: 'Son' }] 
    });

    fireEvent.click(screen.getByRole('button', { name: /Verify PSRN/i }));

    await waitFor(() => {
      expect(screen.getByText('Child')).toBeInTheDocument();
    });

    // Delete
    axios.delete.mockResolvedValueOnce({ data: { success: true } });
    axios.get.mockResolvedValueOnce({ data: [] }); // re-fetch

    const deleteBtn = screen.getByLabelText('Delete');
    fireEvent.click(deleteBtn);

    await screen.findByText(/Delete Dependant Details/i);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith(expect.stringContaining('/api/family/dependant/DEP1'));
    });
  });

  it('handles adding new dependant with Custom relation', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('tab', { name: /Add New Dependant/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter the PSRN ID/i), { target: { value: 'P9999' } });
    
    axios.post.mockResolvedValueOnce({ data: { requires_otp: false } });
    axios.get.mockResolvedValueOnce({ data: [] });

    fireEvent.click(screen.getByRole('button', { name: /Verify PSRN/i }));

    await waitFor(() => {
      expect(screen.getByText(/New Dependant Details/i)).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getAllByLabelText(/Full Name/i)[0], { target: { value: 'Custom Dep' } });
    fireEvent.change(screen.getAllByLabelText(/Relation/i)[0], { target: { value: 'Other' } });
    
    await screen.findByLabelText(/Specify Relation/i);
    fireEvent.change(screen.getByLabelText(/Specify Relation/i), { target: { value: 'Cousin' } });

    axios.post.mockResolvedValueOnce({ data: { institute_id: 'DEP2' } });
    axios.get.mockResolvedValueOnce({ data: [] }); // refetch

    fireEvent.click(screen.getByRole('button', { name: /Add Dependant/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/api/public/add_dependant'), expect.objectContaining({
        dependant: expect.objectContaining({ relation: 'Cousin' })
      }));
    });
  });
});
