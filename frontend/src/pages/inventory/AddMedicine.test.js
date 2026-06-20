import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import AddMedicine from './AddMedicine';

jest.mock('axios');

describe('AddMedicine Component', () => {
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
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <AddMedicine />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders correctly', async () => {
    await act(async () => {
      renderComponent();
    });

    await screen.findByText('Add Medicine', { selector: 'h2' });
    expect(screen.getByLabelText('Item Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Medicine' })).toBeInTheDocument();
  });

  it('handles input changes', async () => {
    await act(async () => {
      renderComponent();
    });

    const itemNameInput = screen.getByLabelText('Item Name');
    const nilRatedCheckbox = screen.getByLabelText('Nil Rated?');

    await act(async () => {
      fireEvent.change(itemNameInput, { target: { value: 'Paracetamol' } });
      fireEvent.click(nilRatedCheckbox);
    });

    expect(itemNameInput.value).toBe('Paracetamol');
    expect(nilRatedCheckbox.checked).toBe(true);
  });

  it('submits form successfully', async () => {
    axios.post.mockResolvedValueOnce({ data: { medicine_id: 'M001' } });

    await act(async () => {
      renderComponent();
    });

    const itemNameInput = screen.getByLabelText('Item Name');
    const saleRateInput = screen.getByLabelText('Sale Rate');
    const submitBtn = screen.getByRole('button', { name: 'Add Medicine' });

    await act(async () => {
      fireEvent.change(itemNameInput, { target: { value: 'Paracetamol' } });
      fireEvent.change(saleRateInput, { target: { value: '10' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/inventory/add'),
        expect.objectContaining({
          item_name: 'Paracetamol',
          sale_rate: '10'
        }),
        expect.any(Object)
      );
      // Form should be reset after successful submission
      expect(itemNameInput.value).toBe('');
      expect(saleRateInput.value).toBe('');
    });
  });

  it('handles error during form submission', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { error: 'Failed to add medicine' } } });

    await act(async () => {
      renderComponent();
    });

    const itemNameInput = screen.getByLabelText('Item Name');
    const submitBtn = screen.getByRole('button', { name: 'Add Medicine' });

    await act(async () => {
      fireEvent.change(itemNameInput, { target: { value: 'Error Med' } });
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled();
      // Form should NOT be reset after failure
      expect(itemNameInput.value).toBe('Error Med');
    });
  });

});
