import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import DoctorSchedulePage from './DoctorSchedulePage';

jest.mock('axios');
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockDoctors = [
  {
    display_name: 'Dr. John',
    department: 'Cardio',
    schedule: [
      {
        duty_days: ['Monday', 'Tuesday'],
        start_time: '10:00 AM',
        end_time: '02:00 PM'
      }
    ]
  },
  {
    display_name: 'Dr. Smith',
    department: 'Neuro',
    schedule: [
      {
        duty_days: ['Monday'],
        start_time: '03:00 PM',
        end_time: '06:00 PM'
      }
    ]
  }
];

describe('DoctorSchedulePage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = (initialState = {}) => {
    return render(
      <ChakraProvider>
        <MemoryRouter initialEntries={[{ pathname: '/schedule', state: initialState }]}>
          <Routes>
            <Route path="/schedule" element={<DoctorSchedulePage />} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders and fetches doctors in calendar view', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    expect(screen.getByText('Visiting Doctor Schedule')).toBeInTheDocument();

    // Switch to calendar view since the component defaults to list view
    const calendarViewBtn = screen.getByRole('button', { name: /Calendar View/i });
    fireEvent.click(calendarViewBtn);

    await waitFor(() => {
      // Calendar view shows Dr. John on Monday and Tuesday
      const johnTexts = screen.getAllByText('Dr. John (Cardio)');
      expect(johnTexts.length).toBe(2);
      
      const smithTexts = screen.getAllByText('Dr. Smith (Neuro)');
      expect(smithTexts.length).toBe(1);
    });
  });

  it('handles empty schedules gracefully', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderComponent();

    // Switch to calendar view to see per-day "No Doctors" text
    // (component defaults to list view which shows "No doctors found" instead)
    const calendarViewBtn = screen.getByRole('button', { name: /Calendar View/i });
    fireEvent.click(calendarViewBtn);

    await waitFor(() => {
      const emptyTexts = screen.getAllByText('No Doctors');
      expect(emptyTexts.length).toBe(7); // 7 days of the week
    });
  });

  it('toggles to list view', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    // Component starts in list view — switch to calendar first
    const calendarViewBtn = screen.getByRole('button', { name: /Calendar View/i });
    fireEvent.click(calendarViewBtn);

    await waitFor(() => {
      // Calendar view shows Dr. John on Monday AND Tuesday (two instances)
      expect(screen.getAllByText('Dr. John (Cardio)').length).toBe(2);
    });

    // Now toggle to list view
    const listViewBtn = screen.getByRole('button', { name: /List View/i });
    fireEvent.click(listViewBtn);

    await waitFor(() => {
      // In list view, it's grouped by doctor — one entry per doctor
      expect(screen.getByText('Dr. John (Cardio)')).toBeInTheDocument();
      expect(screen.getByText('Monday: 10:00 AM - 02:00 PM')).toBeInTheDocument();
      expect(screen.getByText('Tuesday: 10:00 AM - 02:00 PM')).toBeInTheDocument();

      expect(screen.getByText('Dr. Smith (Neuro)')).toBeInTheDocument();
      expect(screen.getByText('Monday: 03:00 PM - 06:00 PM')).toBeInTheDocument();
    });
  });

  it('filters doctors by search term in calendar view', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    // Switch to calendar view since the component defaults to list view
    const calendarViewBtn = screen.getByRole('button', { name: /Calendar View/i });
    fireEvent.click(calendarViewBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Dr. John (Cardio)')[0]).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by doctor name or department.../i);
    fireEvent.change(searchInput, { target: { value: 'Neuro' } });

    await waitFor(() => {
      expect(screen.queryByText('Dr. John (Cardio)')).not.toBeInTheDocument();
      expect(screen.getByText('Dr. Smith (Neuro)')).toBeInTheDocument();
    });
  });

  it('filters doctors by search term in list view', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Dr. John (Cardio)')[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /List View/i }));

    const searchInput = screen.getByPlaceholderText(/Search by doctor name or department.../i);
    fireEvent.change(searchInput, { target: { value: 'Neuro' } });

    await waitFor(() => {
      expect(screen.queryByText('Dr. John (Cardio)')).not.toBeInTheDocument();
      expect(screen.getByText('Dr. Smith (Neuro)')).toBeInTheDocument();
    });

    // Test empty search result in list view
    fireEvent.change(searchInput, { target: { value: 'InvalidSearch' } });
    await waitFor(() => {
      expect(screen.getByText('No doctors found')).toBeInTheDocument();
    });
  });

  it('displays back button when fromDashboard is true', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent({ fromDashboard: true });

    const backButton = await screen.findByRole('button', { name: /Back to Register Patient/i });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('does not display back button when fromDashboard is false', async () => {
    axios.get.mockResolvedValueOnce({ data: mockDoctors });
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Dr. John (Cardio)')[0]).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Back to Register Patient/i })).not.toBeInTheDocument();
  });
});
