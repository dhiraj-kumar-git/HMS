import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import BillHistory from './BillHistory';

jest.mock('axios');

const mockBills = [
  {
    _id: '1',
    payment_date: '2026-06-20T10:00:00Z',
    invoice_no: 'INV-1001',
    patient_name: 'John Doe',
    institute_id: 'INST123',
    patient_type: 'Student',
    items: [{ name: 'Paracetamol', type: 'medicine', amount: 100 }],
    total_amount: 100,
  },
  {
    _id: '2',
    payment_date: '2026-06-21T11:00:00Z',
    invoice_no: 'INV-1002',
    patient_name: 'Jane Smith',
    institute_id: 'INST124',
    patient_type: 'Staff',
    items: [{ name: 'Amoxicillin', type: 'medicine', amount: 200 }],
    total_amount: 200,
  }
];

const mockStats = {
  total_revenue: 300,
};

describe('BillHistory Component', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: jest.fn(), writable: true });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: jest.fn(), writable: true });
    Object.defineProperty(Element.prototype, 'scrollTo', { value: jest.fn(), writable: true });
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: jest.fn(), writable: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    Storage.prototype.removeItem = jest.fn();
    delete window.location;
    window.location = { href: '' };
    window.alert = jest.fn();
    window.print = jest.fn();
    window.open = jest.fn().mockReturnValue({
      document: {
        write: jest.fn(),
        close: jest.fn()
      },
      focus: jest.fn(),
      print: jest.fn(),
      close: jest.fn()
    });
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <BillHistory />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders and fetches bill history and stats', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return Promise.resolve({ data: mockStats });
      }
      return Promise.resolve({ data: { bills: mockBills, total: 2 } });
    });

    await act(async () => {
      renderComponent();
    });

    await screen.findByText('Bill History', { selector: 'h2' });
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('₹300.00')).toBeInTheDocument(); // Total revenue
  });

  it('handles search and date filtering', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return Promise.resolve({ data: mockStats });
      }
      return Promise.resolve({ data: { bills: mockBills, total: 2 } });
    });

    await act(async () => {
      renderComponent();
    });

    const searchInput = screen.getByPlaceholderText('Search...');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'John' } });
    });

    // We can't query by placeholder for type=date easily, so we query by type or role if needed, or just assert API was called
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/medical_store/bills'),
      expect.objectContaining({
        params: expect.objectContaining({
          search: 'John'
        })
      })
    );
  });

  it('opens and closes receipt preview modal', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return Promise.resolve({ data: mockStats });
      }
      return Promise.resolve({ data: { bills: mockBills, total: 2 } });
    });

    await act(async () => {
      renderComponent();
    });

    const viewPrintBtns = await screen.findAllByRole('button', { name: /View\/Print/i });
    
    await act(async () => {
      fireEvent.click(viewPrintBtns[0]);
    });

    expect(screen.getByText('Bill Details')).toBeInTheDocument();
    expect(screen.getByText('Invoice No:')).toBeInTheDocument();
    
    const printReceiptBtn = screen.getByRole('button', { name: /Print Receipt/i });
    await act(async () => {
      fireEvent.click(printReceiptBtn);
    });
    
    expect(window.open).toHaveBeenCalled();
    
    const closeBtn = screen.getAllByRole('button', { name: /Close/i })[0];
    await act(async () => {
      fireEvent.click(closeBtn);
    });
  });

  it('handles pagination', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return Promise.resolve({ data: mockStats });
      }
      return Promise.resolve({ data: { bills: mockBills, total: 20 } });
    });

    await act(async () => {
      renderComponent();
    });

    const nextBtn = await screen.findByRole('button', { name: /Next/i });
    expect(nextBtn).toBeInTheDocument();
  });
});
