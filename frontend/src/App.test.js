import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock matchMedia for Chakra UI
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('App Component', () => {
  it('renders the portal successfully', async () => {
    render(<App />);
    // The App might briefly show "Loading system..." but usually resolves quickly in tests
    // so we wait for the Patient Portal to render (which is the default public route).
    await waitFor(() => {
      expect(screen.getByText(/Clinic Staff Login/i)).toBeInTheDocument();
    });
  });
});
