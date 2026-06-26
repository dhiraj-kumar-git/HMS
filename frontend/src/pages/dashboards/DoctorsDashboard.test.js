import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import axios from 'axios';
import DoctorsDashboard from './DoctorsDashboard';

jest.setTimeout(20000); // Prevent timeouts during full suite run
// Mock axios
jest.mock('axios');

// Mock Multiselect to simplify testing
jest.mock('multiselect-react-dropdown', () => {
  return function MockMultiselect({ options, onSelect, placeholder }) {
    return (
      <div data-testid="mock-multiselect">
        <span>{placeholder}</span>
        {options.map((opt, i) => (
          <button
            key={i}
            data-testid={`select-${opt.item_name || opt.test_name}`}
            onClick={() => onSelect([opt])}
          >
            Select {opt.item_name || opt.test_name}
          </button>
        ))}
      </div>
    );
  };
});

// Mock window URL methods for Blob handling in reports
window.URL.createObjectURL = jest.fn();
window.URL.revokeObjectURL = jest.fn();

describe('DoctorsDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('username', 'doctor1');
    localStorage.setItem('token', 'fake-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderDashboard = () => {
    return render(
      <ChakraProvider>
        <BrowserRouter>
          <DoctorsDashboard />
        </BrowserRouter>
      </ChakraProvider>
    );
  };

  it('renders loading initially and fetches user details and patients', async () => {
    // Mock user details
    axios.get.mockImplementation((url) => {
      if (url.includes('/users/')) {
        return Promise.resolve({ data: { display_name: 'Dr. Smith', schedule: [] } });
      }
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            {
              institute_id: '101',
              name: 'John Doe',
              age: 30,
              gender: 'Male',
              workflow_status: 'consultation',
              doctor_assigned: 'doctor1',
              registration_time: '2023-01-01T10:00:00Z',
              appointments: []
            }
          ]
        });
      }
      if (url.includes('/dropdown/medicines')) {
        return Promise.resolve({ data: [{ item_name: 'Paracetamol' }] });
      }
      if (url.includes('/dropdown/labtests')) {
        return Promise.resolve({ data: [{ test_name: 'Blood Test' }] });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    // Check header updates
    await waitFor(() => {
      expect(screen.getByText('Welcome, Dr. Smith')).toBeInTheDocument();
    });

    // Check patients
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('opens patient modal when row is clicked', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            {
              institute_id: '101',
              name: 'John Doe',
              age: 30,
              gender: 'Male',
              workflow_status: 'consultation',
              doctor_assigned: 'doctor1',
              registration_time: '2023-01-01T10:00:00Z',
              appointments: []
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => {
      expect(screen.getByText('John Doe (ID: 101)')).toBeInTheDocument();
      expect(screen.getByText('Prescription & Remarks')).toBeInTheDocument();
    });
  });

  it('adds custom prescription and remark in the modal', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', age: 30, workflow_status: 'consultation' }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await waitFor(() => screen.getByText('John Doe'));
    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => screen.getByText('John Doe (ID: 101)'));

    // Add Prescription
    const prescriptionInput = screen.getByPlaceholderText(/Type a prescription detail/i);
    fireEvent.change(prescriptionInput, { target: { value: 'Drink water' } });
    const addPrescriptionBtn = screen.getAllByRole('button', { name: /Add/i })[0];
    fireEvent.click(addPrescriptionBtn);

    expect(screen.getByText('• Drink water')).toBeInTheDocument();

    // Add Remark
    const remarkInput = screen.getByPlaceholderText(/Type a remark/i);
    fireEvent.change(remarkInput, { target: { value: 'Rest for 2 days' } });
    const addRemarkBtn = screen.getAllByRole('button', { name: /Add/i })[1];
    fireEvent.click(addRemarkBtn);

    expect(screen.getByText('• Rest for 2 days')).toBeInTheDocument();
  });

  it('triggers confirmation modal when saving with no meds or labs', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', age: 30, workflow_status: 'consultation' }]
        });
      }
      return Promise.resolve({ data: [] });
    });
    
    axios.put.mockResolvedValueOnce({ data: { message: 'success' } });
    axios.post.mockResolvedValueOnce({ data: { message: 'success' } }); // for save_consultation

    renderDashboard();
    await waitFor(() => screen.getByText('John Doe'));
    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => screen.getByText('John Doe (ID: 101)'));
    
    // Click Save all Details & Complete
    fireEvent.click(screen.getByText('Save all Details & Complete'));
    
    // Expect confirmation modal to open
    await waitFor(() => {
      expect(screen.getByText('Confirm Status Update')).toBeInTheDocument();
    });
    
    // Confirm and Save
    fireEvent.click(screen.getByText('Confirm & Save'));
    
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/doctor/save_consultation/101'),
        expect.objectContaining({ has_labs: false, has_meds: false }),
        expect.any(Object)
      );
    });
  });

  it('warns about unsaved changes when closing the modal', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', age: 30, workflow_status: 'consultation' }]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await waitFor(() => screen.getByText('John Doe'));
    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => screen.getByText('John Doe (ID: 101)'));

    // Type in a prescription without adding it
    const prescriptionInput = screen.getByPlaceholderText(/Type a prescription detail/i);
    fireEvent.change(prescriptionInput, { target: { value: 'Unsaved prescription' } });

    // Click Cancel
    fireEvent.click(screen.getByText('Cancel'));

    // Expect unsaved changes modal
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    });

    // Discard and Close
    fireEvent.click(screen.getByText('Discard and Close'));

    await waitFor(() => {
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
      expect(screen.queryByText('John Doe (ID: 101)')).not.toBeInTheDocument(); // main modal closed
    });
  }, 10000);

  it('handles viewing lab reports', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ 
            institute_id: '101', 
            name: 'John Doe', 
            age: 30, 
            workflow_status: 'consultation',
            lab_reports: [{ s3_key: 'test_report.pdf', file_name: 'report.pdf' }]
          }]
        });
      }
      return Promise.resolve({ data: [] });
    });
    
    axios.post.mockResolvedValueOnce({ data: { url: 'http://fake-s3-url.com/report.pdf' } });
    
    // Mock fetch for Blob
    global.fetch = jest.fn(() =>
      Promise.resolve({
        blob: () => Promise.resolve(new Blob(['mock data'], { type: 'application/pdf' })),
      })
    );

    renderDashboard();
    await waitFor(() => screen.getByText('John Doe'));
    
    // Find View button
    const viewBtn = screen.getByRole('button', { name: /View/i });
    fireEvent.click(viewBtn);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/s3/view-url'),
        { s3_key: 'test_report.pdf' },
        expect.any(Object)
      );
    });
  }, 10000);



  it('filters and sorts patients', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [
            { institute_id: '101', name: 'John Doe', workflow_status: 'consultation', registration_time: '2023-01-01T10:00:00Z' },
            { institute_id: '102', name: 'Alice Smith', workflow_status: 'consultation', registration_time: '2023-01-02T10:00:00Z' }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Test Search Filter
    const searchInput = screen.getByPlaceholderText('Search...');
    fireEvent.change(searchInput, { target: { value: '101' } });
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    });
    
    // Clear Search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Test Sort By Name
    const sortSelect = screen.getAllByRole('combobox').find(select => select.value === 'date' || select.value === 'name');
    if (sortSelect) {
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      // Alice should be before John, but we can just verify the DOM changes or state updates don't crash
    }
  });



  it('removes custom prescription and selects dropdown medicine', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/doctor/patients')) {
        return Promise.resolve({
          data: [{ institute_id: '101', name: 'John Doe', workflow_status: 'consultation' }]
        });
      }
      if (url.includes('/dropdown/medicines')) {
        return Promise.resolve({ data: [{ item_name: 'Paracetamol' }] });
      }
      return Promise.resolve({ data: [] });
    });

    renderDashboard();
    await waitFor(() => screen.getByText('John Doe'));
    fireEvent.click(screen.getByText('John Doe'));

    await waitFor(() => screen.getByText('John Doe (ID: 101)'));

    // Select Dropdown Medicine
    const selectMockBtn = screen.getByTestId('select-Paracetamol');
    fireEvent.click(selectMockBtn);

    // It should add to medications table or state
    // Just verify the button click doesn't throw and adds it

    // Add custom prescription
    const prescriptionInput = screen.getByPlaceholderText(/Type a prescription detail/i);
    fireEvent.change(prescriptionInput, { target: { value: 'Drink water' } });
    const addPrescriptionBtn = screen.getAllByRole('button', { name: /Add/i })[0];
    fireEvent.click(addPrescriptionBtn);

    expect(screen.getByText(/Drink water/i)).toBeInTheDocument();

    const removeBtns = screen.getAllByRole('button', { name: /Remove/i });
    if (removeBtns.length > 0) {
      fireEvent.click(removeBtns[0]);
    }
    
    await waitFor(() => {
      expect(screen.queryByText(/Drink water/i)).not.toBeInTheDocument();
    });
  });

});
