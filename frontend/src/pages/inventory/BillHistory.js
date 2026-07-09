import React, { useState, useEffect } from 'react';
import {
    Box, Flex, Heading, Text, Button, Spinner, Grid, useToast, useColorModeValue,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton,
    useDisclosure, Divider, Input, InputGroup, InputLeftElement, Table, Thead, Tbody, Tr, Th, Td,
    HStack, Avatar, Menu, MenuButton, MenuList, MenuItem, IconButton, Stat, StatLabel, StatNumber, StatHelpText
} from '@chakra-ui/react';
import { FiSearch, FiLogOut, FiCalendar, FiPrinter, FiChevronLeft, FiChevronRight, FiMail } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatDateIST, toTitleCase, numberToWords, generateTextReceipt } from '../../utils/utils';

function BillHistory() {
    const [billHistory, setBillHistory] = useState([]);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [billHistoryTotalCount, setBillHistoryTotalCount] = useState(0);
    const [billPage, setBillPage] = useState(1);
    const [billSearchQuery, setBillSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [billLoading, setBillLoading] = useState(false);
    const [emailLoadingId, setEmailLoadingId] = useState(null);

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

    const handleEmailReceipt = async (patient) => {
        if (!patient || !patient.institute_id) return;

        setEmailLoadingId(patient._id || patient.visit_id);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${BASE_URL}/get_patient/${patient.institute_id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const patientData = res.data;
            const recipientEmail = patientData.email;

            if (!recipientEmail) {
                toast({
                    title: 'Email not found',
                    description: 'This patient does not have an email registered.',
                    status: 'error',
                    duration: 3000,
                    isClosable: true,
                });
                return;
            }

            const receiptText = generateTextReceipt(patient, patient);
            const subject = `Sale Bill Receipt for ${toTitleCase(patientData.name)} (Invoice: ${patient.invoice_no || 'DRAFT'})`;
            const body = `Dear ${toTitleCase(patientData.name)},

Please find below the sale bill receipt for your recent visit to the BITS Pilani Medical Centre.

${receiptText}

Best regards,
Medical Centre Team
BITS Pilani
`;

            await axios.post(
                `${BASE_URL}/lab/send_email`,
                {
                    recipient_email: recipientEmail,
                    to_email: recipientEmail,
                    subject: subject,
                    body: body
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            toast({
                title: 'Email Sent Successfully',
                description: `Receipt has been sent to ${recipientEmail}`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

        } catch (error) {
            console.error('Error sending email:', error);
            toast({
                title: 'Email Error',
                description: error.response?.data?.error || error.message || 'Failed to send receipt email',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setEmailLoadingId(null);
        }
    };

    const handlePrintReceipt = () => {
        if (!selectedPatient) return;
        try {
            const isFaculty = selectedPatient.patient_type !== 'Student';
            const isFacultyStaffOrDependent = ['Faculty', 'Staff', 'Dependant'].includes(selectedPatient.patient_type || '');
            const relationCodeMap = {
                "Daughter": "D",
                "Son": "S",
                "Spouse": "Spouse",
                "Wife": "W",
                "Husband": "H",
                "Mother": "M",
                "Father": "F",
                "Self": "Self"
            };

            const relation = selectedPatient.relation || 'Self';
            const relAbbrev = relationCodeMap[relation] || relation;
            const relationSuffix = isFaculty ? ` (${relAbbrev})` : '';

            let sponsorLineHtml = '';
            if (isFacultyStaffOrDependent) {
                sponsorLineHtml = `<div>(Cr : ${selectedPatient.sponsor_name || selectedPatient.patient_name || selectedPatient.name || ''} - ${selectedPatient.sponsor_psrn || selectedPatient.primary_psrn_id || selectedPatient.institute_id || ''})</div>`;
            }

            let printItemsHtml = '';
            (selectedPatient.items || []).forEach((item, i) => {
                let nameAndBatchHtml = `<div>${toTitleCase(item.name)}</div>`;
                if (item.type === 'medicine') {
                    nameAndBatchHtml += `<div class="subtext">B - ${item.batch || '611104EC2'}, E - ${item.expiry || '02/31'}</div>`;
                }

                let rateQtyHtml = '';
                if (item.type === 'medicine') {
                    rateQtyHtml = `<div>${(item.rate || 0).toFixed(2)}</div><div class="subtext">(${item.quantity || 1})</div>`;
                } else {
                    rateQtyHtml = `<div>${(item.gross || 0).toFixed(2)}</div><div class="subtext">(1)</div>`;
                }

                let gstHtml = `<div>${(item.cgst || 0).toFixed(2)}</div><div>${(item.sgst || 0).toFixed(2)}</div>`;

                printItemsHtml += `
                    <tr>
                        <td>${i + 1}</td>
                        <td style="text-align: left;">${nameAndBatchHtml}</td>
                        <td>${rateQtyHtml}</td>
                        <td>${item.discount || 0}</td>
                        <td>${(item.amount || 0).toFixed(2)}</td>
                        <td>${gstHtml}</td>
                        <td style="text-align: right; font-weight: bold;">${(item.item_total || 0).toFixed(2)}</td>
                    </tr>
                `;
            });

            const todayStr = new Date(selectedPatient.payment_date || new Date()).toLocaleDateString('en-GB').replace(/\//g, '-');
            const invoiceNo = selectedPatient.invoice_no || 'INV-DRAFT';
            const city = 'Pilani';
            const doctorName = selectedPatient.doctor_name || selectedPatient.doctor_assigned || 'Dr. Assigned';

            // Build HTML for printing
            const html = `
                <html>
                <head>
                    <title>Sale Bill - BITS Cooperative</title>
                    <style>
                        body { font-family: monospace, Arial; margin: 0; padding: 5mm; color: #000; font-size: 11px; line-height: 1.2; }
                        .header-title { text-align: center; font-size: 13px; font-weight: bold; margin: 2px 0; }
                        .header-subtitle { text-align: center; font-size: 11px; margin-bottom: 5px; }
                        .meta-table { width: 100%; margin: 5px 0; font-size: 11px; }
                        .meta-table td { padding: 1px 0; vertical-align: top; }
                        .divider { border-top: 1px dashed #000; margin: 4px 0; }
                        table.items-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 5px; }
                        table.items-table th { border-bottom: 1px dashed #000; border-top: 1px dashed #000; padding: 4px 2px; font-weight: bold; text-align: center; }
                        table.items-table td { padding: 4px 2px; text-align: center; vertical-align: top; }
                        .subtext { font-size: 9px; color: #555; }
                        .totals-row td { border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-weight: bold; padding: 6px 2px; }
                        .amount-words { margin: 6px 0; font-weight: bold; text-transform: uppercase; }
                        .split-box { border: 1px solid #000; padding: 5px; margin: 6px 0; font-size: 10px; font-weight: bold; }
                        .footer-signature { display: flex; justify-content: space-between; margin-top: 30px; font-size: 10px; }
                        @page { size: A5 portrait; margin: 5mm; }
                    </style>
                </head>
                <body>
                    <div style="display: flex; justify-content: space-between; font-size: 10px;">
                        <div>D. L. # 4161-4162</div>
                        <div style="font-weight: bold; text-decoration: underline;">SALE BILL</div>
                        <div>GST # 08AACAB7763Q1Z2</div>
                    </div>
                    <div class="header-title">BITS Consumers Cooperative Stores Ltd.</div>
                    <div class="header-subtitle">Pilani - 333031 (Rajasthan)</div>
                    <div class="divider"></div>
                    <table class="meta-table">
                        <tr>
                            <td style="width: 60%;"><strong>Bill # :</strong> ${invoiceNo}</td>
                            <td style="text-align: right;"><strong>Date :</strong> ${todayStr}</td>
                        </tr>
                        <tr>
                            <td colspan="2"><strong>Name :</strong> ${toTitleCase(selectedPatient.patient_name || selectedPatient.name || '')}${relationSuffix}, City : ${city}</td>
                        </tr>
                        ${isFacultyStaffOrDependent ? `<tr><td colspan="2">${sponsorLineHtml}</td></tr>` : ''}
                        <tr>
                            <td colspan="2"><strong>Dr. :</strong> ${toTitleCase(doctorName).toUpperCase()}</td>
                        </tr>
                    </table>
                    
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th style="width: 5%;">SNo</th>
                                <th style="text-align: left; width: 45%;">Item</th>
                                <th style="width: 15%;">Rate<br/>Qty.</th>
                                <th style="width: 7%;">Dis</th>
                                <th style="width: 10%;">Amt.</th>
                                <th style="width: 10%;">CGST<br/>SGST</th>
                                <th style="text-align: right; width: 8%;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${printItemsHtml}
                            
                            <tr class="totals-row">
                                <td></td>
                                <td style="text-align: left;">Total</td>
                                <td></td>
                                <td></td>
                                <td>${(selectedPatient.items || []).reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}</td>
                                <td>
                                    <div>${(selectedPatient.items || []).reduce((sum, item) => sum + (item.cgst || 0), 0).toFixed(2)}</div>
                                    <div>${(selectedPatient.items || []).reduce((sum, item) => sum + (item.sgst || 0), 0).toFixed(2)}</div>
                                </td>
                                <td style="text-align: right;">${(selectedPatient.unrounded_total || selectedPatient.total_amount || 0).toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table style="width: 100%; font-size: 11px; margin-top: 5px; border-collapse: collapse;">
                        <tr>
                            <td>Round Off :</td>
                            <td style="text-align: right; font-weight: bold;">${(selectedPatient.round_off || 0).toFixed(2)}</td>
                        </tr>
                        <tr style="font-size: 12px; font-weight: bold;">
                            <td>Bill Total :</td>
                            <td style="text-align: right; border-bottom: 2px double #000; padding: 2px 0;">Rs. ${(selectedPatient.total_amount || 0).toFixed(2)}</td>
                        </tr>
                    </table>

                    <div class="amount-words">Total : Rs. ${numberToWords(selectedPatient.total_amount || 0)} Only.</div>

                    <div class="split-box">
                        ${isFaculty ? `
                            REIMBURSED: Rs. ${(selectedPatient.reimbursed_amount || 0).toFixed(2)} (90%)<br/>
                            SELF PAID (SALARY DEDUCTION): Rs. ${(selectedPatient.self_paid_amount || 0).toFixed(2)} (10%)
                        ` : `
                            REIMBURSED: Rs. 0.00 (0%)<br/>
                            SELF PAID (UPI/CASH/CARD): Rs. ${(selectedPatient.self_paid_amount || 0).toFixed(2)} (100%)
                        `}
                    </div>

                    <div style="font-size: 9px; text-align: center; margin-top: 10px;">
                        ${todayStr} - contact@bitscoop.in (${new Date().toLocaleTimeString('en-GB')})
                    </div>

                    <div class="footer-signature">
                        <div>Checked By</div>
                        <div>Authorised Signature</div>
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

        const isFaculty = selectedPatient.patient_type !== 'Student';
        const isFacultyStaffOrDependent = ['Faculty', 'Staff', 'Dependant'].includes(selectedPatient.patient_type || '');
        const relationCodeMap = {
            "Daughter": "D",
            "Son": "S",
            "Spouse": "Spouse",
            "Wife": "W",
            "Husband": "H",
            "Mother": "M",
            "Father": "F",
            "Self": "Self"
        };

        const relation = selectedPatient.relation || 'Self';
        const relAbbrev = relationCodeMap[relation] || relation;
        const relationSuffix = isFaculty ? ` (${relAbbrev})` : '';

        const todayStr = new Date(selectedPatient.payment_date || new Date()).toLocaleDateString('en-GB').replace(/\//g, '-');
        const invoiceNo = selectedPatient.invoice_no || 'INV-DRAFT';
        const city = 'Pilani';
        const doctorName = selectedPatient.doctor_name || selectedPatient.doctor_assigned || 'Dr. Assigned';

        return (
            <Box
                p={4}
                borderWidth="2px"
                borderColor="gray.800"
                borderStyle="double"
                borderRadius="md"
                bg="white"
                color="black"
                fontFamily="monospace"
                fontSize="xs"
                boxShadow="md"
                maxH="500px"
                overflowY="auto"
            >
                <Flex justify="space-between" fontSize="9px" fontWeight="bold" mb={1}>
                    <Text>D. L. # 4161-4162</Text>
                    <Text textDecoration="underline">SALE BILL</Text>
                    <Text>GST # 08AACAB7763Q1Z2</Text>
                </Flex>

                <Box textAlign="center" mb={2}>
                    <Text fontWeight="bold" fontSize="sm">BITS Consumers Cooperative Stores Ltd.</Text>
                    <Text fontSize="9px">Pilani - 333031 (Rajasthan)</Text>
                </Box>

                <Divider borderColor="gray.400" mb={2} />

                <Grid templateColumns="1fr 1fr" gap={1} mb={2}>
                    <Text><strong>Invoice No:</strong> {invoiceNo}</Text>
                    <Text textAlign="right"><strong>Date :</strong> {todayStr}</Text>
                    <Text colSpan={2} style={{ gridColumn: 'span 2' }}>
                        <strong>Name :</strong> {toTitleCase(selectedPatient.patient_name || selectedPatient.name || '')}{relationSuffix}, City : {city}
                    </Text>
                    {isFacultyStaffOrDependent && (
                        <Text colSpan={2} style={{ gridColumn: 'span 2' }}>
                            <strong>Cr :</strong> {selectedPatient.sponsor_name || selectedPatient.patient_name || selectedPatient.name || ''} - {selectedPatient.sponsor_psrn || selectedPatient.primary_psrn_id || selectedPatient.institute_id || ''}
                        </Text>
                    )}
                    <Text colSpan={2} style={{ gridColumn: 'span 2' }}>
                        <strong>Dr. :</strong> {toTitleCase(doctorName).toUpperCase()}
                    </Text>
                </Grid>

                <Divider borderColor="gray.400" mb={1} />

                <Table variant="simple" size="sm" fontSize="10px" p={0}>
                    <Thead>
                        <Tr>
                            <Th p={1} color="black" fontSize="9px">SNo</Th>
                            <Th p={1} color="black" fontSize="9px" textAlign="left">Item</Th>
                            <Th p={1} color="black" fontSize="9px" textAlign="center">Rate/Qty</Th>
                            <Th p={1} color="black" fontSize="9px" textAlign="center">Dis</Th>
                            <Th p={1} color="black" fontSize="9px" textAlign="center">Amt</Th>
                            <Th p={1} color="black" fontSize="9px" textAlign="center">CGST/SGST</Th>
                            <Th p={1} color="black" fontSize="9px" textAlign="right">Total</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {(selectedPatient.items || []).map((item, idx) => (
                            <Tr key={idx}>
                                <Td p={1}>{idx + 1}</Td>
                                <Td p={1} textAlign="left">
                                    <Text fontWeight="bold" fontSize="10px">{item.name}</Text>
                                    {item.type === 'medicine' && (
                                        <Text fontSize="8px" color="gray.600">B - {item.batch}, E - {item.expiry}</Text>
                                    )}
                                </Td>
                                <Td p={1} textAlign="center">
                                    <Text>{(item.rate || item.gross || 0).toFixed(2)}</Text>
                                    <Text fontSize="8px" color="gray.600">({item.quantity || 1})</Text>
                                </Td>
                                <Td p={1} textAlign="center">{item.discount || 0}%</Td>
                                <Td p={1} textAlign="center">{(item.amount || 0).toFixed(2)}</Td>
                                <Td p={1} textAlign="center">
                                    <Text>{(item.cgst || 0).toFixed(2)}</Text>
                                    <Text>{(item.sgst || 0).toFixed(2)}</Text>
                                </Td>
                                <Td p={1} textAlign="right" fontWeight="bold">{(item.item_total || 0).toFixed(2)}</Td>
                            </Tr>
                        ))}

                        <Tr fontWeight="bold" borderTop="1px dashed black" borderBottom="1px dashed black">
                            <Td p={1}></Td>
                            <Td p={1} textAlign="left">Total</Td>
                            <Td p={1}></Td>
                            <Td p={1}></Td>
                            <Td p={1} textAlign="center">
                                {(selectedPatient.items || []).reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                            </Td>
                            <Td p={1} textAlign="center">
                                <Text>{(selectedPatient.items || []).reduce((sum, item) => sum + (item.cgst || 0), 0).toFixed(2)}</Text>
                                <Text>{(selectedPatient.items || []).reduce((sum, item) => sum + (item.sgst || 0), 0).toFixed(2)}</Text>
                            </Td>
                            <Td p={1} textAlign="right">{(selectedPatient.unrounded_total || selectedPatient.total_amount || 0).toFixed(2)}</Td>
                        </Tr>
                    </Tbody>
                </Table>

                <Box mt={2} fontSize="11px">
                    <Flex justify="space-between">
                        <Text>Round Off :</Text>
                        <Text fontWeight="bold">{(selectedPatient.round_off || 0).toFixed(2)}</Text>
                    </Flex>
                    <Flex justify="space-between" fontSize="sm" fontWeight="bold" borderBottom="2px double black" pb={1} mt={1}>
                        <Text>Bill Total :</Text>
                        <Text>Rs. {(selectedPatient.total_amount || 0).toFixed(2)}</Text>
                    </Flex>
                </Box>

                <Text mt={2} fontWeight="bold" textTransform="uppercase" fontSize="10px">
                    Total : Rs. {numberToWords(selectedPatient.total_amount || 0)} Only.
                </Text>

                <Box mt={3} p={2} border="1px solid black" fontSize="9px" fontWeight="bold">
                    {isFaculty ? (
                        <Box>
                            <Text>REIMBURSED: Rs. {(selectedPatient.reimbursed_amount || 0).toFixed(2)} (90%)</Text>
                            <Text>SELF PAID (SALARY DEDUCTION): Rs. {(selectedPatient.self_paid_amount || 0).toFixed(2)} (10%)</Text>
                        </Box>
                    ) : (
                        <Box>
                            <Text>REIMBURSED: Rs. 0.00 (0%)</Text>
                            <Text>SELF PAID (UPI/CASH/CARD): Rs. {(selectedPatient.self_paid_amount || 0).toFixed(2)} (100%)</Text>
                        </Box>
                    )}
                </Box>
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
                                            <Th>Date</Th><Th>Invoice No</Th><Th>Patient Name</Th><Th>Institute ID</Th><Th isNumeric>Items</Th><Th isNumeric>Amount</Th><Th textAlign="center">Actions</Th>
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
                                                <Td textAlign="center">
                                                    <HStack spacing={2} justify="flex-end">
                                                        <Button size="xs" leftIcon={<FiPrinter />} colorScheme="blue" onClick={() => handleSelectPatient(bill)}>View/Print/Email</Button>
                                                    </HStack>
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
                        <Button colorScheme="blue" leftIcon={<FiPrinter />} mr={2} onClick={handlePrintReceipt}>Print Receipt</Button>
                        <Button
                            colorScheme="teal"
                            leftIcon={<FiMail />}
                            onClick={() => handleEmailReceipt(selectedPatient)}
                            isLoading={emailLoadingId === (selectedPatient?._id || selectedPatient?.visit_id)}
                        >
                            Email Receipt
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Flex>
    );
}

export default BillHistory;
