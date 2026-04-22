import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalFooter,
  Button,
  Text,
  Box,
  Flex,
  useToast
} from '@chakra-ui/react';

function PrescriptionModal({ isOpen, onClose, prescriptionData }) {
  const toast = useToast();

  const currentDateTime = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });


  const handlePrint = () => {
    try {
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
      <style>
        {`
  @media screen {
    .chakra-modal__content {
      zoom: 0.65;
      transform-origin: top center;
    }
  }

  @media print {
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
    }

    .printable-content {
      position: absolute !important;
      top: 0; left: 0;
      width: 210mm !important;
      height: 297mm !important;
      padding: 10mm !important;
      box-shadow: none !important;
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
      height: 297mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  }
`}
      </style>

      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent
          className="printable-content"
          fontFamily="Arial"
          p={0}
          maxW="800px"
        >
          {/* Header Section */}
          <Box textAlign="center" p={4} borderBottom="1px solid black">
            <Text fontSize="18px" fontWeight="bold">
              Birla Institute of Technology & Science
            </Text>
            <Text fontSize="14px">
              Pilani (Rajasthan) 333 031, India
            </Text>
            <Text fontSize="16px" fontWeight="bold">
              MEDICAL CENTRE
            </Text>
            <Text fontSize="14px" mb={2}>
              Vidya Vihar, Pilani, RAJASTHAN
            </Text>
            <Flex justify="space-between" fontSize="13px">
              <Box textAlign="left">
                <Text>Contact No.: 01596-515525</Text>
                <Text>Email: medc@pilani.bits-pilani.ac.in</Text>
                <Text>WebSite: www.bits-pilani.ac.in</Text>
              </Box>
              <Box textAlign="right">
                <Text>Fax: 01596-244183</Text>
                <Text>Date & Time: {currentDateTime}</Text>
              </Box>
            </Flex>
          </Box>

          {/* Title */}
          <Box textAlign="center" my={4}>
            <Text fontSize="16px" fontWeight="bold" textDecoration="underline">
              OPD CARD / SLIP
            </Text>
          </Box>

          {/* Patient Details */}
          <Box px={4} mt={-2} border="1px solid black" borderRadius="md" py={4}>
            <Flex justifyContent="space-between" alignItems="flex-start">
              <Box width="60%" textAlign="left">
                <Flex mb={1}>
                  <Text width="90px">Name</Text>
                  <Text>
                    : {prescriptionData?.name?.toUpperCase() || ''}
                  </Text>
                </Flex>
                <Flex mb={1}>
                  <Text width="90px">Sex & Age</Text>
                  <Text>
                    : {prescriptionData?.gender?.toUpperCase() || ''} / {prescriptionData?.age || ''}Yr
                  </Text>
                </Flex>
                <Flex mb={1}>
                  <Text width="90px">Ph/Mob No</Text>
                  <Text>: {prescriptionData?.contact_no || '/'}</Text>
                </Flex>
                <Flex mb={1}>
                  <Text width="90px">Email ID</Text>
                  <Text>: {prescriptionData?.email || '/'}</Text>
                </Flex>
                <Flex mb={1}>
                  <Text width="90px">Address</Text>
                  <Text>: {prescriptionData?.address || ''}</Text>
                </Flex>
              </Box>
              <Box width="40%">
                <Flex mb={1}>
                  <Text width="100px">O.P.D No</Text>
                  <Text>: {prescriptionData?.opdNumber || ''}</Text>
                </Flex>
                <Flex mb={1}>
                  <Text width="100px">Institute ID</Text>
                  <Text>: {prescriptionData?.institute_id || ''}</Text>
                </Flex>
                <Flex mb={1}>
                  <Text width="100px">Date & Time</Text>
                  <Text>: {currentDateTime}</Text>
                </Flex>
              </Box>
            </Flex>
          </Box>

          {/* Clinical and Treatment Section */}
          <Box px={6} mt={4}>
            <Flex>
              <Box width="50%" pr={2} position="relative">
                <Text fontWeight="bold" mb={1}>Complaint and Clinical Exam</Text>
                <Box height="300px"></Box>
                <Box
                  position="absolute"
                  top="0"
                  right="100px"
                  height="500px"
                  borderRight="2px solid black"
                />
              </Box>
              <Box width="50%" pl={6}>
                <Text fontWeight="bold" mb={1}>Treatment</Text>
                <Box height="200px"></Box>
              </Box>
            </Flex>
          </Box>

          {/* Investigations */}
          <Box px={6} mt={4} mb={6}>
            <Text fontWeight="bold" mb={1}>Investigations</Text>
            <Box height="150px"></Box>
          </Box>

          {/* Barcode Section */}
          <Flex px={6} mb={2} justify="space-between">
            {['INSID No.', 'OPD No.'].map(label => (
              <Box key={label} width="32%">
                <Box
                  height="40px"
                  bgImage="repeating-linear-gradient(90deg, #000, #000 1px, transparent 1px, transparent 3px)"
                />
                <Text fontSize="12px" mt={1}>{label}</Text>
              </Box>
            ))}
          </Flex>

          {/* Footer Note */}
          <Box textAlign="center" mb={4} mt={2}>
            <Text fontSize="20px" fontStyle="italic" fontWeight="bold">
              * Please bring this prescription for next time *
            </Text>
          </Box>

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
