import React, { useState, useEffect } from 'react';
import {
  Box, Flex, Heading, Text, Button, Spinner, Grid, useToast, useColorModeValue,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton,
  useDisclosure, Divider, Input, InputGroup, InputLeftElement, Table, Thead, Tbody, Tr, Th, Td,
  HStack, Avatar, Menu, MenuButton, MenuList, MenuItem, IconButton, Stat, StatLabel, StatNumber, StatHelpText
} from '@chakra-ui/react';
import { FiSearch, FiBell, FiMail, FiUser, FiLogOut, FiCalendar, FiPrinter, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatDateIST, formatDateTimeIST, toTitleCase, numberToWords } from '../../utils/utils';

function BillHistory() {
  const [billHistory, setBillHistory] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [billHistoryTotalCount, setBillHistoryTotalCount] = useState(0);
  const [billPage, setBillPage] = useState(1);
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [billLoading, setBillLoading] = useState(false);
  
  const [selectedPatient, setSelectedPatient] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.800');
  const modalBg = useColorModeValue('white', 'gray.700');
  const tableHeaderBg = useColorModeValue('gray.100', 'gray.700');

  const loginUsername = localStorage.getItem('username') || 'User';
  const defaultLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
  };

  useEffect(() => {
    fetchBillHistory();
    fetchBillStats();
  }, [billPage, billSearchQuery, startDate, endDate]);

  const fetchBillHistory = async () => {
    setBillLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = {
        page: billPage,
        limit: 10,
        search: billSearchQuery,
        start_date: startDate ? new Date(startDate).toISOString() : '',
        end_date: endDate ? new Date(endDate).toISOString() : ''
      };
      const response = await axios.get(`${BASE_URL}/medical_store/bills`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setBillHistory(response.data.bills);
      setBillHistoryTotalCount(response.data.total);
    } catch (error) {
      console.error('Error fetching bill history:', error);
    } finally {
      setBillLoading(false);
    }
  };

  const fetchBillStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = {
        start_date: startDate ? new Date(startDate).toISOString() : '',
        end_date: endDate ? new Date(endDate).toISOString() : ''
      };
      const response = await axios.get(`${BASE_URL}/medical_store/bills/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setTotalRevenue(response.data.total_revenue || 0);
    } catch (error) {
      console.error('Error fetching bill stats:', error);
    }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    onOpen();
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const ReceiptPreview = () => {
    if (!selectedPatient) return null;
    return (
      <Box p={4} borderWidth="1px" borderRadius="md">
        <Box textAlign="center" mb={2}>
          <Text fontWeight="bold" fontSize="lg">Birla Institute of Technology & Science</Text>
          <Text>MEDICAL CENTRE, Pilani, Rajasthan</Text>
          <Text>Date/Time: {formatDateTimeIST(selectedPatient.payment_date)}</Text>
          <Divider borderColor="black" borderWidth="1px" my={2} />
        </Box>
        <Divider mb={2} />
        <Flex justify="space-between" mb={2} fontSize="sm">
          <Box>
            <Text><strong>Invoice No:</strong> {selectedPatient.invoice_no}</Text>
            <Text><strong>Patient Name:</strong> {toTitleCase(selectedPatient.patient_name)}</Text>
          </Box>
          <Box textAlign="right">
            <Text><strong>Institute ID:</strong> {selectedPatient.institute_id}</Text>
            <Text><strong>Type:</strong> {selectedPatient.patient_type}</Text>
          </Box>
        </Flex>
        <Divider mb={2} />
        <Table size="sm" mb={4}>
          <Thead>
            <Tr>
              <Th>S.No.</Th><Th>Items</Th><Th>Gross</Th><Th>Disc(%)</Th><Th>DiscAmt</Th><Th>Remb(%)</Th><Th>RembAmt</Th><Th>Amount</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(selectedPatient.items || []).map((item, i) => {
              if (item.type === 'medicine') {
                return (
                  <Tr key={i}>
                    <Td>{i+1}</Td><Td>{item.name}</Td><Td colSpan={5}>Medicine</Td><Td>0.00</Td>
                  </Tr>
                );
              }
              return (
                <Tr key={i}>
                  <Td>{i+1}</Td><Td>{item.name}</Td>
                  <Td>{item.gross?.toFixed(2) || '0.00'}</Td><Td>{item.discount || 0}</Td>
                  <Td>{item.discount_amount?.toFixed(2) || '0.00'}</Td><Td>{item.rembursement || 0}</Td>
                  <Td>{item.rembursement_amount?.toFixed(2) || '0.00'}</Td><Td>{item.amount?.toFixed(2) || '0.00'}</Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
        <Flex justify="space-between" fontWeight="bold">
          <Text>Total Amount</Text>
          <Text>₹{selectedPatient.total_amount?.toFixed(2)}</Text>
        </Flex>
      </Box>
    );
  };

  return (
    <Flex h="100vh" direction="column">
      {/* Header */}
      <Flex as="header" align="center" justify="space-between" bg="white" p={4} borderBottom="1px solid" borderColor="gray.200" boxShadow="sm">
        <Heading size="md" color="blue.700">Medical Store Dashboard - Bill History</Heading>
        <HStack spacing={4}>
          <Menu>
            <MenuButton as={Button} variant="ghost" size="sm" rightIcon={<Avatar size="sm" name={loginUsername} />}>
              {loginUsername}
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiLogOut size={16} />} onClick={defaultLogout}>Logout</MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      <Box as="main" flex="1" overflowY="auto" p={{ base: 4, md: 6 }}>
        <Box w="full" maxW="1200px" mx="auto" bg={cardBg} boxShadow="md" borderRadius="lg" p={{ base: 4, md: 6 }}>
          <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4} mb={6}>
            <Box>
              <Heading fontSize="xl" color="blue.800" mb={4}>Bill History</Heading>
              <HStack spacing={2} mb={4}>
                <InputGroup maxW="200px" size="sm">
                  <InputLeftElement pointerEvents="none"><FiSearch color="gray" /></InputLeftElement>
                  <Input placeholder="Search..." value={billSearchQuery} onChange={(e) => setBillSearchQuery(e.target.value)} />
                </InputGroup>
                <InputGroup maxW="150px" size="sm">
                  <InputLeftElement pointerEvents="none"><FiCalendar color="gray" /></InputLeftElement>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </InputGroup>
                <Text fontSize="sm">to</Text>
                <InputGroup maxW="150px" size="sm">
                  <InputLeftElement pointerEvents="none"><FiCalendar color="gray" /></InputLeftElement>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </InputGroup>
              </HStack>
            </Box>
            <Box display="flex" justifyContent={{ base: "flex-start", md: "flex-end" }} alignItems="center">
              <Stat maxW="200px" bg="green.50" p={3} borderRadius="md" border="1px solid" borderColor="green.200">
                <StatLabel fontSize="xs" color="green.700">Total Revenue</StatLabel>
                <StatNumber fontSize="2xl" color="green.800">₹{totalRevenue.toFixed(2)}</StatNumber>
                <StatHelpText m={0} fontSize="xs">for selected period</StatHelpText>
              </Stat>
            </Box>
          </Grid>

          <Box overflowX="auto">
            {billLoading ? (
              <Flex justify="center" p={8}><Spinner /></Flex>
            ) : (
              <>
                <Table variant="simple" size="sm" fontSize="sm">
                  <Thead bg={tableHeaderBg}>
                    <Tr>
                      <Th>Date</Th><Th>Invoice No</Th><Th>Patient Name</Th><Th>Institute ID</Th><Th isNumeric>Items</Th><Th isNumeric>Amount</Th><Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {billHistory.map((bill) => (
                      <Tr key={bill._id}>
                        <Td>{formatDateIST(bill.payment_date)}</Td>
                        <Td>{bill.invoice_no}</Td>
                        <Td>{toTitleCase(bill.patient_name)}</Td>
                        <Td>{bill.institute_id}</Td>
                        <Td isNumeric>{bill.items ? bill.items.length : 0}</Td>
                        <Td isNumeric>₹{bill.total_amount.toFixed(2)}</Td>
                        <Td textAlign="right">
                          <Button size="xs" leftIcon={<FiPrinter />} colorScheme="blue" onClick={() => handleSelectPatient(bill)}>View/Print</Button>
                        </Td>
                      </Tr>
                    ))}
                    {billHistory.length === 0 && (
                      <Tr>
                        <Td colSpan={7} textAlign="center">No bills found.</Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
                <Flex justify="space-between" mt={4} align="center">
                  <Text fontSize="sm" color="gray.500">Showing {billHistory.length} of {billHistoryTotalCount} bills</Text>
                  <HStack>
                    <IconButton icon={<FiChevronLeft />} size="sm" isDisabled={billPage === 1} onClick={() => setBillPage(billPage - 1)} aria-label="Previous" />
                    <Text fontSize="sm">Page {billPage}</Text>
                    <IconButton icon={<FiChevronRight />} size="sm" isDisabled={billHistory.length < 10} onClick={() => setBillPage(billPage + 1)} aria-label="Next" />
                  </HStack>
                </Flex>
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg={modalBg} maxW="800px" borderRadius="2xl" overflow="hidden">
          <ModalHeader borderBottom="1px solid" borderColor="gray.100" py={4}>
            Bill Details
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody p={6} className="print-section">
            <style>
              {`
                @media print {
                  body * { visibility: hidden; }
                  .print-section, .print-section * { visibility: visible; }
                  .print-section { position: absolute; left: 0; top: 0; width: 100%; }
                }
              `}
            </style>
            <ReceiptPreview />
          </ModalBody>
          <ModalFooter bg="gray.50" borderTop="1px solid" borderColor="gray.100" py={4}>
            <Button variant="ghost" mr={3} onClick={onClose}>Close</Button>
            <Button colorScheme="blue" leftIcon={<FiPrinter />} onClick={handlePrintReceipt}>Print Receipt</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}

export default BillHistory;
