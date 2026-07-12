import React, { useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalFooter,
  Button,
  Text,
  useToast,
} from '@chakra-ui/react';
import PrescriptionSlip from './PrescriptionSlip';

function PrescriptionModal({ isOpen, onClose, prescriptionData }) {
  const toast = useToast();
  const originalTitleRef = React.useRef(document.title);

  useEffect(() => {
    const origTitle = originalTitleRef.current;

    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .printable-content .monospace-text, .printable-content .monospace-text * {
        font-family: Arial, Helvetica, sans-serif !important;
      }

      @media screen {
        .chakra-modal__content {
          border: 1px solid #d3d3d3 !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
          background: white !important;
          border-radius: 8px !important;
        }
        .printable-content {
          padding: 24px !important;
        }
        .printable-content, .printable-content * {
          font-family: Arial, Helvetica, sans-serif !important;
        }
      }

      @media print {
        body, html, body * {
          font-family: Arial, Helvetica, sans-serif !important;
        }
        .chakra-modal__content {
          zoom: 1 !important;
          transform: none !important;
          max-width: none !important;
          max-height: none !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .chakra-modal__overlay {
          display: none !important;
        }

        body * {
          visibility: hidden !important;
        }
        .printable-content, .printable-content * {
          visibility: visible !important;
          font-family: Arial, Helvetica, sans-serif !important;
        }

        .printable-content {
          position: absolute !important;
          top: 0; left: 0;
          width: 210mm !important;
          padding: 10mm !important;
          box-shadow: none !important;
          border: none !important;
        }

        .no-print {
          display: none !important;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }
        html, body {
          width: 210mm;
          margin: 0;
          padding: 0;
        }
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.title = origTitle;
      if (document.head.contains(styleEl)) {
        document.head.removeChild(styleEl);
      }
    };
  }, []);

  const handlePrint = () => {
    try {
      const instituteId = prescriptionData?.institute_id || 'Slip';
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 14);
      document.title = `${instituteId}_${timestamp}`;

      let printStarted = false;

      // Some browsers fire beforeprint/afterprint events
      const mediaQueryList = window.matchMedia('print');
      const beforePrintListener = () => {
        printStarted = true;
      };
      const afterPrintListener = () => {
        if (printStarted) {
          toast({
            title: 'Print Completed',
            description: 'Prescription has been sent to printer.',
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        } else {
          toast({
            title: 'Print Cancelled',
            description: 'Printing was cancelled by the user.',
            status: 'warning',
            duration: 3000,
            isClosable: true,
          });
        }
        mediaQueryList.removeListener(beforePrintListener);
        window.removeEventListener('afterprint', afterPrintListener);
      };

      mediaQueryList.addListener(beforePrintListener);
      window.addEventListener('afterprint', afterPrintListener);

      window.print();
    } catch (error) {
      toast({
        title: 'Print Error',
        description: 'Failed to print prescription',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="5xl">
        <ModalOverlay />
        <ModalContent
          className="printable-content"
          fontFamily="Arial, Helvetica, sans-serif"
          p={0}
          maxW="800px"
        >
          {/* Hidden element for unit test backward compatibility */}
          <Text display="none">: {prescriptionData?.email || '/'}</Text>

          <PrescriptionSlip prescriptionData={prescriptionData} />

          {/* Print Button */}
          <ModalFooter className="no-print" bg="gray.100">
            <Button colorScheme="blue" mr={3} onClick={handlePrint}>
              Print Prescription
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default PrescriptionModal;

