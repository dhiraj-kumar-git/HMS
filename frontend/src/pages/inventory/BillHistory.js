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
        if (!selectedPatient) return;
        try {
            let finalInvoiceNo = selectedPatient.invoice_no || '';
            let finalTotal = selectedPatient.total_amount || 0;
            let paymentMode = selectedPatient.payment_mode || 'N/A';
            
            let itemIndex = 1;
            let printItemsHtml = '';
            
            (selectedPatient.items || []).forEach((item) => {
                if (item.type === 'medicine') {
                    printItemsHtml += `<tr><td>${itemIndex++}</td><td>${item.name}</td><td colspan="5">Medicine</td><td>0.00</td></tr>`;
                } else {
                    const gross = item.gross || 0;
                    const discPerc = item.discount || 0;
                    const discAmt = item.discount_amount || 0;
                    const rembPerc = item.rembursement || 0;
                    const rembAmt = item.rembursement_amount || 0;
                    const amt = item.amount || 0;
                    printItemsHtml += `<tr><td>${itemIndex++}</td><td>${item.name}</td><td>${gross.toFixed(2)}</td><td>${discPerc}</td><td>${discAmt.toFixed(2)}</td><td>${rembPerc}</td><td>${rembAmt.toFixed(2)}</td><td>${amt.toFixed(2)}</td></tr>`;
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
                        <div>Date/Time: ${formatDateTimeIST(selectedPatient.payment_date || new Date())}</div>
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
                            <td>Age/Gender:</td><td>${selectedPatient.age || 'N/A'}/${selectedPatient.gender || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td>Patient:</td><td>${toTitleCase(selectedPatient.patient_name || selectedPatient.name || '')}</td>
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
                        <p>Thank you.</p>
                    </div>
                </body>
                </html>
            `;

            const printWindow = window.open('', '', 'width=800,height=600');
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        } catch (err) {
            console.error('Error printing receipt:', err);
            toast({
                title: "Error printing",
                description: "There was an error generating the print view.",
                status: "error"
            });
        }
    };

    const ReceiptPreview = () => {
        if (!selectedPatient) return null;
        return (
            <Box p={4} borderWidth="1px" borderRadius="md" bg="white">
                <Box textAlign="center" mb={4}>
                    <Text fontWeight="bold" fontSize="lg" color="blue.800">Payment Receipt Preview</Text>
                    <Text fontSize="sm" color="gray.600">Click "Print Receipt" below to view the full printable format.</Text>
                </Box>
                <Divider mb={4} />
                <Flex justify="space-between" mb={4} fontSize="sm">
                    <Box>
                        <Text><strong>Invoice No:</strong> {selectedPatient.invoice_no}</Text>
                        <Text><strong>Patient Name:</strong> {toTitleCase(selectedPatient.patient_name || selectedPatient.name || '')}</Text>
                    </Box>
                    <Box textAlign="right">
                        <Text><strong>Institute ID:</strong> {selectedPatient.institute_id}</Text>
                        <Text><strong>Total Amount:</strong> ₹{selectedPatient.total_amount?.toFixed(2)}</Text>
                    </Box>
                </Flex>
                <Table size="sm" mb={4} variant="simple">
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
                                        <Td>{i + 1}</Td><Td>{item.name}</Td><Td colSpan={5}>Medicine</Td><Td>0.00</Td>
                                    </Tr>
                                );
                            }
                            return (
                                <Tr key={i}>
                                    <Td>{i + 1}</Td><Td>{item.name}</Td>
                                    <Td>{item.gross?.toFixed(2) || '0.00'}</Td><Td>{item.discount || 0}</Td>
                                    <Td>{item.discount_amount?.toFixed(2) || '0.00'}</Td><Td>{item.rembursement || 0}</Td>
                                    <Td>{item.rembursement_amount?.toFixed(2) || '0.00'}</Td><Td>{item.amount?.toFixed(2) || '0.00'}</Td>
                                </Tr>
                            );
                        })}
                        {(selectedPatient.items || []).length === 0 && (
                            <Tr>
                                <Td colSpan={8} textAlign="center">No items found.</Td>
                            </Tr>
                        )}
                    </Tbody>
                </Table>
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
