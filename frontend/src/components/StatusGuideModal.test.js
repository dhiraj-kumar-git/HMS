import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import StatusGuideModal from './StatusGuideModal';

describe('StatusGuideModal Component', () => {
  const renderModal = (props) => {
    return render(
      <ChakraProvider>
        <StatusGuideModal {...props} />
      </ChakraProvider>
    );
  };

  it('renders correctly when open', () => {
    const onClose = jest.fn();
    renderModal({ isOpen: true, onClose });

    // Check if title is present
    expect(screen.getByText('Patients Status Guide')).toBeInTheDocument();

    // Check for some badges/text
    expect(screen.getByText('Workflow Statuses')).toBeInTheDocument();
    expect(screen.getByText('Billing Statuses')).toBeInTheDocument();
    expect(screen.getByText('Lab Statuses')).toBeInTheDocument();
    
    // Check if close button is present and triggers onClose
    const closeBtns = screen.getAllByRole('button', { name: /Close/i });
    expect(closeBtns.length).toBeGreaterThan(0);
    
    fireEvent.click(closeBtns[1]); // The footer button
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when not open', () => {
    const onClose = jest.fn();
    renderModal({ isOpen: false, onClose });

    // Since Chakra UI modals use portals, queryByText should return null when closed
    expect(screen.queryByText('Patients Status Guide')).not.toBeInTheDocument();
  });
});
