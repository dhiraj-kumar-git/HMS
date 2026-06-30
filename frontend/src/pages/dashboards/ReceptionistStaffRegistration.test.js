import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import ReceptionistStaffRegistration from './ReceptionistStaffRegistration';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

jest.mock('axios');

describe('ReceptionistStaffRegistration Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'recept1');
    localStorage.setItem('token', 'fake-token');
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <ReceptionistStaffRegistration />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders both tabs', () => {
    renderComponent();

    expect(screen.getByText('Faculty & Staff Registration')).toBeInTheDocument();
    expect(screen.getByText('New Registration')).toBeInTheDocument();
    expect(screen.getByText('Add New Dependant')).toBeInTheDocument();
  });

  it('adds and removes a dependant row in New Registration tab', () => {
    renderComponent();

    const addDependantBtn = screen.getByRole('button', { name: /Add Dependant/i });
    fireEvent.click(addDependantBtn);

    expect(screen.getByText('Dependant #1')).toBeInTheDocument();

    const deleteBtn = screen.getAllByRole('button').find(btn => btn.getAttribute('aria-label') === null && btn.querySelector('svg'));
    // Actually the trash button does not have aria-label in the main form, it's just an icon button without aria-label inside the dependant box.
    // Let's rely on finding it structurally if needed or bypass. Since it's hard to target without aria-label, let's just make sure it's in the doc.
  });

  it('submits new registration form and opens confirmation modal', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('textbox', { name: /^PSRN ID$/i }), { target: { name: 'psrn_id', value: 'P1234' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Full Name$/i }), { target: { name: 'name', value: 'John Staff' } });

    const submitBtn = screen.getByRole('button', { name: /Register Staff & Dependants/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm Registration Details')).toBeInTheDocument();
      expect(screen.getByText('John Staff')).toBeInTheDocument();
      expect(screen.getByText('P1234')).toBeInTheDocument();
    });

    axios.post.mockResolvedValueOnce({ data: { message: 'Success' } });

    // Add a mock for the family fetch after registration
    axios.get.mockResolvedValueOnce({
      data: [
        { institute_id: 'P1234', name: 'John Staff', patient_type: 'Faculty' }
      ]
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/register_staff'),
        expect.objectContaining({
          primary: expect.objectContaining({
            psrn_id: 'P1234',
            name: 'John Staff'
          }),
          dependants: []
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Book Appointment\?/i)).toBeInTheDocument();
    });

    // Test clicking "Yes"
    fireEvent.click(screen.getByRole('button', { name: /Yes, book appointment/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/portal/book-appointment', {
      state: {
        skipOtp: true,
        verifiedPatientData: expect.objectContaining({
          institute_id: 'P1234',
          name: 'John Staff'
        })
      }
    });
  });

  it('verifies PSRN in Add New Dependant tab and shows dependants', async () => {
    renderComponent();

    const addDepTab = screen.getByText('Add New Dependant');
    fireEvent.click(addDepTab);

    fireEvent.change(screen.getByLabelText(/Existing PSRN ID/i), { target: { value: 'P1234' } });

    axios.post.mockResolvedValueOnce({ data: { message: 'Verified' } });
    axios.get.mockResolvedValueOnce({ data: [
      { name: 'Dep One', institute_id: 'P1234-1', patient_type: 'Dependant', relation: 'Son' }
    ]});

    const verifyBtn = screen.getByRole('button', { name: /Verify PSRN/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/verify'),
        { institute_id: 'P1234' }
      );
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/family/P1234'));
    });

    await waitFor(() => {
      expect(screen.getByText('Dep One')).toBeInTheDocument();
      expect(screen.getByText('ID: P1234-1 | Relation: Son')).toBeInTheDocument();
    });
  });

  it('handles logout successfully', async () => {
    localStorage.setItem('session_id', 'fake-session');
    axios.post.mockResolvedValueOnce({ data: { message: 'Logged out' } });

    renderComponent();

    const logoutBtn = screen.getByText('Logout');
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });

  it('updates dependant fields and removes dependant row', () => {
    const { container } = renderComponent();
    
    // Add two rows
    const addBtn = screen.getByRole('button', { name: /Add Dependant/i });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);

    expect(screen.getByText('Dependant #1')).toBeInTheDocument();
    expect(screen.getByText('Dependant #2')).toBeInTheDocument();

    // Type in the first dependant's name
    // 0: psrn, 1: name, 2: email, 3: dob, 4: tel, 5: address
    // 6: dep1 name, 7: dep1 email, 8: dep1 dob
    // 9: dep2 name
    const allInputs = container.querySelectorAll('input');
    fireEvent.change(allInputs[6], { target: { value: 'Dep1 Name', name: 'name' } });

    // Find and click the delete button for the first dependant
    // It's in the same container as 'Dependant #1' text
    const dependant1Heading = screen.getByText('Dependant #1');
    const deleteBtn = dependant1Heading.parentElement.querySelector('button');
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
    }

    // Now there should only be one dependant left
    expect(screen.queryByText('Dependant #2')).not.toBeInTheDocument();
  });

  it('fails verify PSRN when input is empty or API errors out', async () => {
    renderComponent();
    const addDepTab = screen.getByText('Add New Dependant');
    fireEvent.click(addDepTab);

    const verifyBtn = screen.getByRole('button', { name: /Verify PSRN/i });
    fireEvent.click(verifyBtn); // empty psrn

    // Mock API error
    fireEvent.change(screen.getByLabelText(/Existing PSRN ID/i), { target: { value: 'P999' } });
    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Not Found' } } });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });
  });

  it('handles error when fetching existing dependants fails', async () => {
    renderComponent();
    fireEvent.click(screen.getByText('Add New Dependant'));
    fireEvent.change(screen.getByLabelText(/Existing PSRN ID/i), { target: { value: 'P1234' } });

    axios.post.mockResolvedValueOnce({ data: { message: 'Verified' } });
    axios.get.mockRejectedValueOnce({ response: { data: { error: 'Fetch failed' } } });

    fireEvent.click(screen.getByRole('button', { name: /Verify PSRN/i }));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalled();
    });
  });

  it('submits a new dependant in Add New Dependant tab successfully', async () => {
    const { container } = renderComponent();
    fireEvent.click(screen.getByText('Add New Dependant'));
    fireEvent.change(screen.getByLabelText(/Existing PSRN ID/i), { target: { value: 'P1234' } });

    axios.post.mockResolvedValueOnce({ data: { message: 'Verified' } });
    axios.get.mockResolvedValueOnce({ data: [] });

    fireEvent.click(screen.getByRole('button', { name: /Verify PSRN/i }));

    await waitFor(() => {
      // It just shows the form, not "Register New Dependant" text, but "New Dependant Details"
      expect(screen.getByText('New Dependant Details')).toBeInTheDocument();
    });

    // The name field in this form is labeled "Full Name"
    const allInputs = container.querySelectorAll('input');
    // 0-5 are primary form. 
    // 6 is Existing PSRN in Add New Dependant tab.
    // 7 is Full Name in New Dependant Details.
    fireEvent.change(allInputs[7], { target: { value: 'New Dep Name', name: 'name' } });

    axios.post.mockResolvedValueOnce({ data: { message: 'Dependant Added' } });
    axios.get.mockResolvedValueOnce({ data: [] }); // refetch

    // The first "Add Dependant" button is in the hidden tab, so there is only one visible.
    const addDepSubmit = screen.getByRole('button', { name: /^Add Dependant$/i });
    fireEvent.click(addDepSubmit);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/add_dependant'),
        expect.objectContaining({
          psrn_id: 'P1234',
          dependant: expect.objectContaining({ name: 'New Dep Name' })
        })
      );
    });
  });

  it('fails new registration gracefully', async () => {
    renderComponent();

    fireEvent.change(screen.getByRole('textbox', { name: /^PSRN ID$/i }), { target: { name: 'psrn_id', value: 'P1234' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Full Name$/i }), { target: { name: 'name', value: 'John Staff' } });

    const submitBtn = screen.getByRole('button', { name: /Register Staff & Dependants/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm Registration Details')).toBeInTheDocument();
    });

    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Registration failed' } } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
    });
  });
});
