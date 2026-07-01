import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import InventoryList from './InventoryList';

jest.mock('axios');

const mockInventory = [
  { medicine_id: 'M001', item_name: 'Paracetamol', manufacturer: 'GSK', sale_rate: 10, qty: 100, expiry_date: '2027-01-01' },
  { medicine_id: 'M002', item_name: 'Amoxicillin', manufacturer: 'Pfizer', sale_rate: 50, qty: 50, expiry_date: '2026-05-01' }
];

describe('InventoryList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'fake-token');
    Storage.prototype.removeItem = jest.fn();
    delete window.location;
    window.location = { href: '' };
    window.alert = jest.fn();
    Element.prototype.scrollTo = jest.fn();
  });

  const renderComponent = () => {
    return render(
      <ChakraProvider>
        <MemoryRouter>
          <InventoryList />
        </MemoryRouter>
      </ChakraProvider>
    );
  };

  it('renders and fetches inventory', async () => {
    axios.get.mockResolvedValueOnce({ data: mockInventory });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Inventory List')).toBeInTheDocument();
      expect(screen.getByText('Paracetamol')).toBeInTheDocument();
      expect(screen.getByText('GSK')).toBeInTheDocument();
      expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
      expect(screen.getByText('Pfizer')).toBeInTheDocument();
    });
  });

  it('filters inventory based on search query', async () => {
    axios.get.mockResolvedValueOnce({ data: mockInventory });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by ID, name or manufacturer');
    
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'GSK' } });
    });

    expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    expect(screen.queryByText('Amoxicillin')).not.toBeInTheDocument();
    
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Amox' } });
    });

    expect(screen.queryByText('Paracetamol')).not.toBeInTheDocument();
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
  });

  it('displays no items found when search query does not match', async () => {
    axios.get.mockResolvedValueOnce({ data: mockInventory });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Paracetamol')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search by ID, name or manufacturer');
    
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Unknown' } });
    });

    expect(screen.getByText('No inventory items found.')).toBeInTheDocument();
  });

  it('handles header interactions (notifications, messages, logout)', async () => {
    axios.get.mockResolvedValueOnce({ data: mockInventory });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('Inventory List')).toBeInTheDocument();
    });

    const notifBtn = screen.getByRole('button', { name: /Notifications/i });
    await act(async () => {
      fireEvent.click(notifBtn);
    });
    expect(window.alert).toHaveBeenCalledWith('Notifications');

    const msgBtn = screen.getByRole('button', { name: /Messages/i });
    await act(async () => {
      fireEvent.click(msgBtn);
    });
    expect(window.alert).toHaveBeenCalledWith('Messages');

    const menuBtnText = screen.getByText('fake-token');
    const menuBtn = menuBtnText.closest('button');
    await act(async () => {
      fireEvent.click(menuBtn);
    });

    const logoutBtn = screen.getByRole('menuitem', { name: /Logout/i });
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('token');
    expect(window.location.href).toBe('/login');
  });

  it('handles error fetching inventory', async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { error: 'Failed to fetch' } } });

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => {
      expect(screen.getByText('No inventory items found.')).toBeInTheDocument();
    });
  });
});
