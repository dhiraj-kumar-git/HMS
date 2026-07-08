import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  Spinner,
  Grid,
  useToast,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
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
  Badge,
  Icon,
  Select,
  Checkbox,
} from '@chakra-ui/react';
import { FiSearch, FiBell, FiMail, FiUser, FiLogOut, FiRefreshCw, FiHelpCircle, FiPrinter } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import StatusGuideModal from '../../components/StatusGuideModal';
import { calculateAge, formatDateTimeIST, numberToWords, toTitleCase } from '../../utils/utils';

function MedicalCounterDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [billGenerated, setBillGenerated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [labTestsConfig, setLabTestsConfig] = useState([]);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [selectedLabs, setSelectedLabs] = useState([]);
  const [selectedMedicines, setSelectedMedicines] = useState([]);
  const [editedMedicines, setEditedMedicines] = useState([]);

  // History state removed

  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isGuideOpen, onOpen: onGuideOpen, onClose: onGuideClose } = useDisclosure();
  const printRef = useRef(null);

  // Colors for styling
  const cardBg = useColorModeValue('white', 'gray.800');
  const modalBg = useColorModeValue('white', 'gray.700');
  const headerBg = useColorModeValue('white', 'gray.800');
  const bodyBg = useColorModeValue('gray.50', 'gray.900');
  const tableHeaderBg = useColorModeValue('gray.100', 'gray.700');
  const modalFooterBg = useColorModeValue('gray.50', 'gray.800');

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
          (patient.institute_id && patient.institute_id.toLowerCase().includes(q)) ||
          (patient.age && String(patient.age).toLowerCase().includes(q))
      );
      const sorted = filtered.sort((a, b) => {
        const timeA = new Date(a.consultation_completed_time || a.booked_at || 0).getTime();
        const timeB = new Date(b.consultation_completed_time || b.booked_at || 0).getTime();
        return timeA - timeB;
      });
      setFilteredRegistrations(sorted);
    } else {
      const sorted = [...registrations].sort((a, b) => {
        const timeA = new Date(a.consultation_completed_time || a.booked_at || 0).getTime();
        const timeB = new Date(b.consultation_completed_time || b.booked_at || 0).getTime();
        return timeA - timeB;
      });
      setFilteredRegistrations(sorted);
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
    setPaymentStatus('pending');
    setPaymentMode('UPI');
    setBillGenerated(false);

    // Initialize all items as selected by default
    setSelectedLabs((patient.lab_tests || []).map((_, i) => i));
    setSelectedMedicines((patient.prescriptions || []).map((_, i) => i));
    setEditedMedicines(patient.prescriptions ? JSON.parse(JSON.stringify(patient.prescriptions)) : []);

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
      selectedPatient.lab_tests.forEach((testObj, idx) => {
        if (selectedLabs.includes(idx)) {
          total += getTestPrice(testObj.lab_test);
        }
      });
    }
    return total;
  };

  const handleConfirmPayment = async () => {
    if (!selectedPatient) return;
    setPaymentStatus('processing');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${BASE_URL}/pay_bill`,
        {
          institute_id: selectedPatient.institute_id,
          visit_id: selectedPatient.visit_id,
          payment_mode: paymentMode,
          selected_labs: selectedLabs,
          selected_medicines: selectedMedicines.map(idx => editedMedicines[idx]),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSelectedPatient(prev => ({ ...prev, invoice_no: response.data.invoice_no }));
      setPaymentStatus('completed');
      fetchRegistrations(); // Refresh list to remove from queue behind the modal
    } catch (error) {
      setPaymentStatus('pending');
      toast({
        title: 'Payment Error',
        description: error.response?.data?.error || 'Failed to update bill status',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleCancelBill = async () => {
    if (!selectedPatient) return;
    setPaymentStatus('processing');
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${BASE_URL}/cancel_bill`,
        {
          institute_id: selectedPatient.institute_id,
          visit_id: selectedPatient.visit_id,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Bill Cancelled',
        description: 'Patient has been removed from the billing queue.',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
      onClose();
      fetchRegistrations();
    } catch (error) {
      setPaymentStatus('pending');
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to cancel bill',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handlePrintReceipt = () => {
    if (!selectedPatient) return;
    try {
      let finalInvoiceNo = selectedPatient.invoice_no || '';
      let finalTotal = calculateTotal();

      let itemIndex = 1;
      let printItemsHtml = '';

      // Map Medicines
      (selectedPatient.prescriptions || []).forEach((med, i) => {
        if (selectedMedicines.includes(i)) {
          printItemsHtml += `<tr><td>${itemIndex++}</td><td>${med.note || med}</td><td colspan="5">Medicine</td><td>0.00</td></tr>`;
        }
      });

      // Map Lab Tests
      (selectedPatient.lab_tests || []).forEach((t, i) => {
        if (selectedLabs.includes(i)) {
          const gross = getTestPrice(t.lab_test);
          const discPerc = t.discount || 0;
          const discAmt = (gross * discPerc / 100).toFixed(2);
          const rembPerc = t.rembPerc || 0;
          const rembAmt = (gross * rembPerc / 100).toFixed(2);
          const amt = (gross - discAmt - rembAmt).toFixed(2);
          printItemsHtml += `<tr><td>${itemIndex++}</td><td>${t.lab_test}</td><td>${gross.toFixed(2)}</td><td>${discPerc}</td><td>${discAmt}</td><td>${rembPerc}</td><td>${rembAmt}</td><td>${amt}</td></tr>`;
        }
      });

      // Build HTML for printing
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
              <div>Date/Time: ${formatDateTimeIST(new Date())}</div>
            </div>
            <hr style="border:1px solid #000; margin:8px 0;" />
            <div class="title">* PAYMENT RECEIPT *</div>
            <hr style="border:1px solid #000; margin:8px 0;" />
            <table class="small-table" style="margin-bottom:10px;">
              <tr>
                <td>Invoice No.:</td><td>${finalInvoiceNo}</td>
                <td>Institute ID:</td><td>${selectedPatient.institute_id}</td>
              </tr>
              <tr>
                <td>UMR:</td><td>${selectedPatient.umrn || ''}</td>
                <td>Age/Gender:</td><td>${calculateAge(selectedPatient.age)}/${selectedPatient.gender || 'N/A'}</td>
              </tr>
              <tr>
                <td>Patient:</td><td>${toTitleCase(selectedPatient.name || selectedPatient.patient_name || '')}</td>
                <td>Payment No.:</td><td>${selectedPatient.payment_no || ''}</td>
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
                ${printItemsHtml}
              </tbody>
            </table>
            <table class="small-table" style="margin-top:10px;">
              <tr><td>Total :</td><td style="text-align:right;">${finalTotal.toFixed(2)}</td></tr>
              <tr><td>Payment Mode:</td><td style="text-align:right;">${paymentMode}</td></tr>
            </table>
            <div class="amount-words">${numberToWords(Math.round(finalTotal))} Rupees Only</div>
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

    } catch (error) {
      toast({
        title: 'Print Error',
        description: error.message || 'Failed to print receipt',
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
          <Text>Date/Time: {formatDateTimeIST(new Date())}</Text>
          <Divider borderColor="black" borderWidth="1px" my={2} />
        </Box>
        <Divider mb={2} />
        <Text fontWeight="bold" textAlign="center" mb={2}>* PAYMENT RECEIPT *</Text>
        <Divider borderColor="black" borderWidth="1px" my={2} />
        <Grid templateColumns="1fr 1fr" gap={2} fontSize="sm" mb={2}>
          <Text>Invoice No.: {selectedPatient.invoice_no}</Text>
          <Text>Institute ID: {selectedPatient.institute_id}</Text>
          <Text>UMR: {selectedPatient.umrn}</Text>
          <Text>Age/Gender: {calculateAge(selectedPatient.age)}/{selectedPatient.gender || 'N/A'}</Text>
          <Text>Patient: {toTitleCase(selectedPatient.name || selectedPatient.patient_name)}</Text>
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
            {(selectedPatient.prescriptions || []).map((med, i) => (
              <Tr key={`med-${i}`}>
                <Td>{i + 1}</Td><Td>{med.note || med}</Td><Td colSpan={5}>Medicine</Td><Td>0.00</Td>
              </Tr>
            ))}
            {(selectedPatient.lab_tests || []).map((t, i) => {
              const gross = getTestPrice(t.lab_test);
              const discPerc = t.discount || 0;
              const discAmt = (gross * discPerc / 100).toFixed(2);
              const rembPerc = t.rembPerc || 0;
              const rembAmt = (gross * rembPerc / 100).toFixed(2);
              const amt = (gross - discAmt - rembAmt).toFixed(2);
              return (
                <Tr key={i}>
                  <Td>{(selectedPatient.prescriptions || []).length + i + 1}</Td>
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
          <Text textAlign="right">{selectedPatient.payment_mode || 'Cash'}</Text>
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
          <Flex align="center" justify="space-between" mb={4}>
            <Flex align="center">
              <Heading fontSize="xl" color="blue.800" mr={2}>
                Active Patients
              </Heading>
              <IconButton
                aria-label="Refresh patients"
                icon={<FiRefreshCw />}
                variant="ghost"
                size="sm"
                onClick={fetchRegistrations}
              />
            </Flex>
            <Button
              leftIcon={<FiHelpCircle />}
              variant="ghost"
              colorScheme="blue"
              size="sm"
              onClick={onGuideOpen}
            >
              Status Guide
            </Button>
          </Flex>

          {/* Search Bar */}
          <InputGroup mb={4} maxW="300px">
            <InputLeftElement pointerEvents="none">
              <FiSearch color="gray" />
            </InputLeftElement>
            <Input
              placeholder="Search by name, Institute ID or age"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>

          {/* Table list of patients with Full Status details */}
          <Box overflowX="auto">
            <Table variant="simple" size="sm" fontSize="sm">
              <Thead bg={tableHeaderBg}>
                <Tr>
                  <Th>Institute ID</Th>
                  <Th>Name</Th>
                  <Th>Age</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Bill</Th>
                  <Th>Lab</Th>
                  <Th>Completed Time</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistrations.map((patient) => (
                  <Tr
                    key={patient.institute_id}
                    _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                    onClick={() => handleSelectPatient(patient)}
                  >
                    <Td>{patient.institute_id}</Td>
                    <Td>{toTitleCase(patient.name)}</Td>
                    <Td>{calculateAge(patient.age)}</Td>
                    <Td>
                      <Badge fontSize="10px" colorScheme={patient.patient_type === 'Student' ? 'blue' : patient.patient_type === 'Faculty' ? 'purple' : 'gray'}>
                        {patient.patient_type}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant="subtle"
                        fontSize="10px"
                        colorScheme={
                          patient.workflow_status === 'active' ? 'green' :
                            patient.workflow_status === 'consultation' ? 'orange' :
                              patient.workflow_status === 'consultation completed' ? 'blue' :
                                patient.workflow_status === 'lab test pending' ? 'purple' : 'gray'
                        }
                      >
                        {patient.workflow_status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        colorScheme={patient.bill_status === 'paid' ? 'green' : patient.bill_status === 'pending' ? 'red' : 'gray'}
                      >
                        {patient.bill_status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        colorScheme={patient.lab_status === 'completed' ? 'green' : patient.lab_status === 'pending' ? 'blue' : patient.lab_status === 'active' ? 'orange' : 'gray'}
                      >
                        {patient.lab_status}
                      </Badge>
                    </Td>
                    <Td fontSize="xs">
                      {patient.consultation_completed_time ? formatDateTimeIST(patient.consultation_completed_time) : formatDateTimeIST(patient.booked_at || Date.now())}
                    </Td>
                  </Tr>
                ))}
                {filteredRegistrations.length === 0 && (
                  <Tr>
                    <Td colSpan={8} textAlign="center">
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
                    {toTitleCase(selectedPatient.name || selectedPatient.patient_name || '')} (ID: {selectedPatient.institute_id})
                  </Heading>
                  <Text fontSize="sm">Age: {calculateAge(selectedPatient.age)}</Text>
                  {selectedPatient.booked_at && (
                    <Text fontSize="xs" mt={1}>Order Date: {formatDateTimeIST(selectedPatient.booked_at)}</Text>
                  )}
                </Flex>
              )}
            </Box>
            <ModalCloseButton color="white" />
            {/* Panelled Modal Body */}
            <ModalBody p={4}>
              {paymentStatus === 'completed' ? (
                <Box textAlign="center" py={6}>
                  <Icon as={FiPrinter} boxSize={12} color="green.500" mb={4} />
                  <Heading size="md" color="green.600" mb={2}>Payment Received</Heading>
                  <Text mb={4}>Invoice No: {selectedPatient?.invoice_no}</Text>
                  <Button colorScheme="blue" onClick={handlePrintReceipt} leftIcon={<FiPrinter />} size="lg">
                    Print Receipt
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Table variant="simple" size="sm" mb={4}>
                    <Thead>
                      <Tr>
                        <Th width="40px">Incl.</Th>
                        <Th>Item</Th>
                        <Th>Type</Th>
                        <Th isNumeric>Amount (Rs)</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {editedMedicines.map((pres, i) => (
                        <Tr key={`pres-${i}`}>
                          <Td>
                            <Checkbox
                              isChecked={selectedMedicines.includes(i)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedMedicines(prev => [...prev, i]);
                                else setSelectedMedicines(prev => prev.filter(idx => idx !== i));
                              }}
                            />
                          </Td>
                          <Td>
                            <Text fontWeight="bold">{pres.note || pres.drug}</Text>
                            {pres.dose && <Text fontSize="xs" color="gray.500">{pres.dose} | {pres.route} | {pres.frequency} {pres.duration && `| ${pres.duration}`}</Text>}
                            <Flex align="center" mt={1}>
                              <Text fontSize="xs" mr={2}>Qty:</Text>
                              <Input
                                size="xs"
                                width="60px"
                                value={pres.quantity || ''}
                                onChange={(e) => {
                                  const newMeds = [...editedMedicines];
                                  newMeds[i].quantity = e.target.value;
                                  setEditedMedicines(newMeds);
                                }}
                              />
                            </Flex>
                          </Td>
                          <Td>Medicine</Td>
                          <Td isNumeric>0.00</Td>
                        </Tr>
                      ))}
                      {(selectedPatient?.lab_tests || []).map((test, i) => (
                        <Tr key={`test-${i}`}>
                          <Td>
                            <Checkbox
                              isChecked={selectedLabs.includes(i)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedLabs(prev => [...prev, i]);
                                else setSelectedLabs(prev => prev.filter(idx => idx !== i));
                              }}
                            />
                          </Td>
                          <Td>{test.lab_test || 'Unknown Test'}</Td>
                          <Td>Lab Test</Td>
                          <Td isNumeric>{getTestPrice(test.lab_test).toFixed(2)}</Td>
                        </Tr>
                      ))}
                      {(!selectedPatient?.prescriptions?.length && !selectedPatient?.lab_tests?.length) && (
                        <Tr>
                          <Td colSpan={3} textAlign="center">No billable items</Td>
                        </Tr>
                      )}
                      <Tr fontWeight="bold" bg="gray.100">
                        <Td colSpan={3} textAlign="right">Total Due:</Td>
                        <Td isNumeric>{calculateTotal().toFixed(2)}</Td>
                      </Tr>
                    </Tbody>
                  </Table>

                  <Box p={4} bg="blue.50" borderRadius="md" mt={4}>
                    <Heading size="sm" mb={3} color="blue.800">Payment Collection</Heading>
                    <Flex align="center" gap={4}>
                      <Text fontWeight="bold" whiteSpace="nowrap">Payment Mode:</Text>
                      <Select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        bg="white"
                        size="md"
                        maxW="200px"
                      >
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                      </Select>
                    </Flex>
                  </Box>
                </Box>
              )}
            </ModalBody>
            {/* Footer with actions */}
            <ModalFooter p={4} borderTopWidth="1px" bg={modalFooterBg}>
              {paymentStatus !== 'completed' && (
                <>
                  <Button
                    colorScheme="green"
                    mr={3}
                    onClick={handleConfirmPayment}
                    isLoading={paymentStatus === 'processing'}
                    fontSize="md"
                    px={6}
                    py={2}
                  >
                    Confirm Payment & Mark as Paid
                  </Button>
                  <Button
                    colorScheme="red"
                    onClick={handleCancelBill}
                    isLoading={paymentStatus === 'processing'}
                    fontSize="md"
                    px={4}
                    py={2}
                    mr={3}
                  >
                    Cancel Entire Bill
                  </Button>
                  <Button variant="ghost" onClick={onClose} fontSize="md" px={4} py={2}>
                    Close
                  </Button>
                </>
              )}
              {paymentStatus === 'completed' && (
                <Button variant="ghost" onClick={onClose} colorScheme="blue">
                  Close
                </Button>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* ===== Status Guide Modal ===== */}
        <StatusGuideModal isOpen={isGuideOpen} onClose={onGuideClose} />
      </Box>
    </Flex>
  );
}

export default MedicalCounterDashboard;
