import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  Spinner,
  Stack,
  Grid,
  useToast,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Divider,
  Input,
  InputGroup,
  InputLeftElement,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  SimpleGrid,
} from '@chakra-ui/react';
import { FiSearch, FiBell, FiMail, FiUser, FiLogOut } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from './Config';

// Utility to convert numbers to words (up to 9999)
const numberToWords = (num) => {
  const a = [
    'Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'
  ];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (num < 20) return a[num];
  if (num < 100) return b[Math.floor(num/10)] + (num%10 ? ' ' + a[num%10] : '');
  if (num < 1000) return a[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' ' + numberToWords(num%100) : '');
  return a[Math.floor(num/1000)] + ' Thousand' + (num%1000 ? ' ' + numberToWords(num%1000) : '');
};

function MedicalCounterDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [billGenerated, setBillGenerated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [labTestsConfig, setLabTestsConfig] = useState([]); // New state for lab tests config

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const printRef = useRef(null);

  // Colors for styling
  const cardBg = useColorModeValue('white', 'gray.800');
  const modalBg = useColorModeValue('white', 'gray.700');
  const headerBg = useColorModeValue('white', 'gray.800');
  const bodyBg = useColorModeValue('gray.50', 'gray.900');
  const tableHeaderBg = useColorModeValue('gray.100', 'gray.700');

  // Default logout function
  const defaultLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
  };

  const loginUsername = localStorage.getItem('username') || 'User';

  useEffect(() => {
    fetchRegistrations();
  }, []);

  useEffect(() => {
    // Filter registrations based on search query (matching name, PSRN, or age)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const filtered = registrations.filter(
        (patient) =>
          (patient.name && patient.name.toLowerCase().includes(q)) ||
          (patient.psr_no && patient.psr_no.toLowerCase().includes(q)) ||
          (patient.age && String(patient.age).toLowerCase().includes(q))
      );
      setFilteredRegistrations(filtered);
    } else {
      setFilteredRegistrations(registrations);
    }
  }, [searchQuery, registrations]);

  const fetchRegistrations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BASE_URL}/active_registrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRegistrations(response.data);
      setFilteredRegistrations(response.data);
    } catch (error) {
      console.error('Error fetching registrations:', error);
      toast({
        title: 'Error fetching registrations',
        description: error.response?.data?.error || 'Something went wrong',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch lab tests configuration from the backend
    useEffect(() => {
      const fetchLabTestsConfig = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get(`${BASE_URL}/dropdown/labtests`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setLabTestsConfig(response.data);
        } catch (error) {
          console.error('Error fetching lab tests config:', error);
        }
      };
      fetchLabTestsConfig();
    }, []);
    
  // When a patient row is clicked, open the modal and reset preview flag
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setBillGenerated(false);
    onOpen();
  };

  // New getTestPrice function that returns the last rate from config
  const getTestPrice = (testName) => {
    if (!testName) return 0;
    const config = labTestsConfig.find(
      (item) => item.test_name.toLowerCase() === testName.toLowerCase()
    );
    if (config && Array.isArray(config.rates) && config.rates.length > 0) {
      return config.rates[config.rates.length - 1];
    }
    return 0;
  };

  const calculateTotal = () => {
    let total = 0;
    if (selectedPatient && selectedPatient.lab_tests) {
      selectedPatient.lab_tests.forEach((testObj) => {
        total += getTestPrice(testObj.lab_test);
      });
    }
    return total;
  };

  // When generate receipt preview is clicked, only show the receipt preview.
  const handleGenerateReceiptPreview = () => {
    if (!selectedPatient) return;
    setBillGenerated(true);
  };

  // Only on Print is the API called to update status (which removes the patient from active list)
  const handlePrintReceipt = async () => {
    if (!selectedPatient) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${BASE_URL}/submit_lab_tests`,
        {
          psr_no: selectedPatient.psr_no,
          lab_tests: selectedPatient.lab_tests,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Build HTML for printing
        const total = calculateTotal();
      const html = `
          <html>
          <head>
            <title>Payment Receipt</title>
            <style>
              body { font-family: Arial, sans-serif; margin:0; padding:10mm; }
              .header { text-align:center; font-size:12px; }
              .header h2 { margin:0; font-size:16px; }
              .title { text-align:center; font-weight:bold; margin:10px 0; }
              table { width:100%; border-collapse: collapse; font-size:11px; }
              table th, table td { border:1px solid #000; padding:4px; }
              table th { font-weight:bold; }
              .small-table td { border:none; padding:2px; }
              .amount-words { margin-top:10px; font-weight:bold; text-transform: uppercase; }
              .footer { text-align:center; margin-top:20px; font-size:12px; }
              @page { size: A4 portrait; margin:10mm; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>Birla Institute of Technology & Science</h2>
              <div>MEDICAL CENTRE</div>
              <div>Vidya Vihar, Pilani, RAJASTHAN</div>
              <div>Contact: 01596-515525 | medc@pilani.bits-pilani.ac.in | Fax:01596-244183</div>
              <div>Date/Time: ${new Date().toLocaleString()}</div>
            </div>
            <hr style="border:1px solid #000; margin:8px 0;" />

            <div class="title">* PAYMENT RECEIPT *</div>

            <!-- ← and another one here -->
            <hr style="border:1px solid #000; margin:8px 0;" />

            <table class="small-table" style="margin-bottom:10px;">
            <table class="small-table" style="margin-bottom:10px;">
              <tr>
                <td>Invoice No.:</td>
                <td>${selectedPatient.invoice_no || ''}</td>
                <td>PSRN/ID No:</td>
                <td>${selectedPatient.psr_no}</td>
              </tr>
              <tr>
                <td>UMR:</td>
                <td>${selectedPatient.umrn || ''}</td>
                <td>Age/Gender:</td>
                <td>${selectedPatient.age}/${selectedPatient.gender}</td>
              </tr>
              <tr>
                <td>Patient:</td>
                <td>${selectedPatient.name}</td>
                <td>Payment No.:</td>
                <td>${selectedPatient.payment_no || ''}</td>
              </tr>
              <tr>
                <td>Ref. Doctor:</td>
                <td>${selectedPatient.doctor_assigned || ''}</td>
                <td></td><td></td>
              </tr>
            </table>
            <table>
              <thead>
                <tr>
                  <th>S.No.</th><th>Service</th><th>Gross Amt</th>
                  <th>Disc(%)</th><th>Disc</th><th>Remb(%)</th>
                  <th>Remb Amt</th><th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${selectedPatient.lab_tests.map((t,i) => {
                  const gross = getTestPrice(t.lab_test);
                  const discPerc = t.discount || 0;
                  const discAmt = (gross * discPerc / 100).toFixed(2);
                  const rembPerc = t.rembPerc || 0;
                  const rembAmt = (gross * rembPerc / 100).toFixed(2);
                  const amt = (gross - discAmt - rembAmt).toFixed(2);
                  return `
                <tr>
                  <td>${i+1}</td>
                  <td>${t.lab_test}</td>
                  <td>${gross.toFixed(2)}</td>
                  <td>${discPerc}</td>
                  <td>${discAmt}</td>
                  <td>${rembPerc}</td>
                  <td>${rembAmt}</td>
                  <td>${amt}</td>
                </tr>`;
                }).join('')}
              </tbody>
            </table>
            <table class="small-table" style="margin-top:10px;">
              <tr>
                <td>Total :</td>
                <td style="text-align:right;">${total.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Payment Mode:</td>
                <td style="text-align:right;">${selectedPatient.payment_mode || 'Other'}</td>
              </tr>
            </table>
            <div class="amount-words">${numberToWords(Math.round(total))} Rupees Only</div>
            <div class="footer">
              Treated By: ${selectedPatient.treated_by || ''}<br/>
              * PLEASE KEEP YOUR HOSPITAL CLEAN *<br/>
              Page 1 of 1
            </div>
          </body>
          </html>
`;

      // Print
      const w = window.open('', '_blank');
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.print();
      w.close();

      // Refresh list
      fetchRegistrations();
      // Close modal after printing
      onClose();
    } catch (error) {
      toast({
        title: 'Print Error',
        description: error.response?.data?.error || 'Failed to update bill status',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // On-screen receipt preview
    const ReceiptPreview = () => {
      const total = calculateTotal();
      return (
        <Box p={4} borderWidth="1px" borderRadius="md">
          <Box textAlign="center" mb={2}>
            <Heading size="md">Birla Institute of Technology & Science</Heading>
            <Text>MEDICAL CENTRE, Pilani, Rajasthan</Text>
            <Text>Date/Time: {new Date().toLocaleString()}</Text>
            <Divider borderColor="black" borderWidth="1px" my={2} />
          </Box>
          <Divider mb={2} />
          <Text fontWeight="bold" textAlign="center" mb={2}>* PAYMENT RECEIPT *</Text>
          <Divider borderColor="black" borderWidth="1px" my={2} />
          <Grid templateColumns="1fr 1fr" gap={2} fontSize="sm" mb={2}>
            <Text>Invoice No.: {selectedPatient.invoice_no}</Text>
            <Text>PSRN/ID No: {selectedPatient.psr_no}</Text>
            <Text>UMR: {selectedPatient.umrn}</Text>
            <Text>Age/Gender: {selectedPatient.age}/{selectedPatient.gender}</Text>
            <Text>Patient: {selectedPatient.name}</Text>
            <Text>Payment No.: {selectedPatient.payment_no}</Text>
            <Text>Ref. Doctor: {selectedPatient.doctor_assigned}</Text>
          </Grid>
          <Divider my={4} />
          <Table size="sm" mb={2}>
            <Thead>
              <Tr>
                <Th>S.No.</Th><Th>Service</Th><Th>Gross</Th>
                <Th>Disc(%)</Th><Th>Disc</Th><Th>Remb(%)</Th>
                <Th>Remb Amt</Th><Th>Amt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {selectedPatient.lab_tests.map((t,i) => {
                const gross = getTestPrice(t.lab_test);
                const discPerc = t.discount || 0;
                const discAmt = (gross * discPerc / 100).toFixed(2);
                const rembPerc = t.rembPerc || 0;
                const rembAmt = (gross * rembPerc / 100).toFixed(2);
                const amt = (gross - discAmt - rembAmt).toFixed(2);
                return (
                  <Tr key={i}>
                    <Td>{i+1}</Td>
                    <Td>{t.lab_test}</Td>
                    <Td>{gross.toFixed(2)}</Td>
                    <Td>{discPerc}</Td>
                    <Td>{discAmt}</Td>
                    <Td>{rembPerc}</Td>
                    <Td>{rembAmt}</Td>
                    <Td>{amt}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          <Grid templateColumns="1fr 1fr" gap={2} fontSize="sm">
            <Text>Total :</Text>
            <Text textAlign="right">{total.toFixed(2)}</Text>
            <Text>Payment Mode:</Text>
            <Text textAlign="right">{selectedPatient.payment_mode || 'Other'}</Text>
          </Grid>
          <Text mt={2} fontWeight="bold">
            {numberToWords(Math.round(total))} Rupees Only
          </Text>
        </Box>
      );
    };
  

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="100vh" bg={bodyBg}>
        <Spinner size="xl" />
      </Flex>
    );
  }

  return (
    <Flex direction="column" minH="100vh" bg={bodyBg}>
      {/* Header */}
      <Flex
        as="header"
        w="100%"
        h="64px"
        px={{ base: 4, md: 6 }}
        align="center"
        justify="space-between"
        bg={headerBg}
        boxShadow="sm"
      >
        <Heading size="lg" color="blue.800">
          Medical Counter
        </Heading>
        <HStack spacing={4}>
          <IconButton
            icon={<FiBell size={18} />}
            variant="ghost"
            size="sm"
            aria-label="Notifications"
            onClick={() => alert('Notifications')}
          />
          <IconButton
            icon={<FiMail size={18} />}
            variant="ghost"
            size="sm"
            aria-label="Messages"
            onClick={() => alert('Messages')}
          />
          <Menu>
            <MenuButton as={Button} variant="ghost" size="sm" rightIcon={<Avatar size="sm" name={loginUsername} />}>
              {loginUsername}
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiUser size={16} />} onClick={() => alert('Profile clicked')}>
                Profile
              </MenuItem>
              <MenuItem icon={<FiLogOut size={16} />} onClick={defaultLogout}>
                Logout
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" flex="1" overflowY="auto" p={{ base: 4, md: 6 }}>
        <Box
          w="full"
          maxW="1200px"
          mx="auto"
          bg={cardBg}
          boxShadow="md"
          borderRadius="lg"
          p={{ base: 4, md: 6 }}
        >
          <Heading fontSize="xl" mb={4} color="blue.800">
            Active Patients
          </Heading>

          {/* Search Bar */}
          <InputGroup mb={4} maxW="300px">
            <InputLeftElement pointerEvents="none">
              <FiSearch color="gray" />
            </InputLeftElement>
            <Input
              placeholder="Search by name, PSRN or age"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>

          {/* Table list of patients with Age column */}
          <Box overflowX="auto">
            <Table variant="simple">
              <Thead bg={tableHeaderBg}>
                <Tr>
                  <Th>PSRN No</Th>
                  <Th>Name</Th>
                  <Th>Age</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistrations.map((patient) => (
                  <Tr
                    key={patient.psr_no}
                    _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                    onClick={() => handleSelectPatient(patient)}
                  >
                    <Td>{patient.psr_no}</Td>
                    <Td>{patient.name}</Td>
                    <Td>{patient.age || 'N/A'}</Td>
                  </Tr>
                ))}
                {filteredRegistrations.length === 0 && (
                  <Tr>
                    <Td colSpan={3} textAlign="center">
                      No active patients found.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </Box>

        {/* Redesigned Modal */}
        <Modal
          isOpen={isOpen}
          onClose={() => {
            onClose();
            setBillGenerated(false);
          }}
          isCentered
          size="xl"
        >
          <ModalOverlay />
          <ModalContent bg={modalBg} maxW="800px" borderRadius="2xl" overflow="hidden">
            {/* Modal Header with patient basic info */}
            <Box bg="blue.800" color="white" p={4}>
              {selectedPatient && (
                <Flex direction="column" align="center">
                  <Heading size="md">
                    {selectedPatient.name} (PSRN: {selectedPatient.psr_no})
                  </Heading>
                  <Text fontSize="sm">Age: {selectedPatient.age || 'N/A'}</Text>
                </Flex>
              )}
            </Box>
            <ModalCloseButton color="white" />
            {/* Panelled Modal Body */}
            <ModalBody p={4}>
              {billGenerated ? (
                // Only show receipt preview when preview is generated.
                <ReceiptPreview />
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  {/* Left Panel - Prescribed Medicines */}
                  <Box p={3} borderWidth="1px" borderRadius="md" borderColor="blue.200">
                    <Heading size="md" mb={2} color="blue.800">
                      Prescribed Medicines
                    </Heading>
                    {selectedPatient && selectedPatient.prescriptions && selectedPatient.prescriptions.length > 0 ? (
                      selectedPatient.prescriptions.map((pres, i) => (
                        <Text key={i} fontSize="md">
                          {pres.note}
                        </Text>
                      ))
                    ) : (
                      <Text fontSize="md">No medicines prescribed</Text>
                    )}
                  </Box>
                  {/* Right Panel - Prescribed Lab Tests */}
                  <Box p={3} borderWidth="1px" borderRadius="md" borderColor="blue.200">
                    <Heading size="md" mb={2} color="blue.800">
                      Prescribed Lab Tests
                    </Heading>
                    {selectedPatient && selectedPatient.lab_tests && selectedPatient.lab_tests.length > 0 ? (
                      selectedPatient.lab_tests.map((test, index) => (
                        <Text key={index} fontSize="md">
                          {test.lab_test || 'Unknown Test'}: Rs. {getTestPrice(test.lab_test)}
                        </Text>
                      ))
                    ) : (
                      <Text fontSize="md">No lab tests prescribed</Text>
                    )}
                  </Box>
                </SimpleGrid>
              )}
            </ModalBody>
            {/* Footer with actions */}
            <ModalFooter p={4}>
              {!billGenerated ? (
                <>
                  <Button
                    colorScheme="green"
                    mr={3}
                    onClick={handleGenerateReceiptPreview}
                    fontSize="md"
                    px={6}
                    py={2}
                  >
                    Generate Receipt Preview
                  </Button>
                  <Button variant="ghost" onClick={onClose} fontSize="md" px={4} py={2}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    colorScheme="blue"
                    mr={3}
                    onClick={handlePrintReceipt}
                    fontSize="md"
                    px={6}
                    py={2}
                  >
                    Print Receipt
                  </Button>
                  <Button variant="ghost" onClick={onClose} fontSize="md" px={4} py={2}>
                    Close
                  </Button>
                </>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Box>
    </Flex>
  );
}

export default MedicalCounterDashboard;
