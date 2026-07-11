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
import { FiSearch, FiBell, FiMail, FiUser, FiLogOut, FiRefreshCw, FiHelpCircle, FiPrinter, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import StatusGuideModal from '../../components/StatusGuideModal';
import { calculateAge, formatDateTimeIST, numberToWords, toTitleCase, generateTextReceipt } from '../../utils/utils';

function MedicalCounterDashboard() {
  const [registrations, setRegistrations] = useState([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState([]);
  const [activePatientsPage, setActivePatientsPage] = useState(1);
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
  const [emailLoadingId, setEmailLoadingId] = useState(null);

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

  useEffect(() => {
    setActivePatientsPage(1);
  }, [searchQuery]);

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

    const isFacultyStaffOrDependent = ['Faculty', 'Staff', 'Dependant'].includes(patient?.patient_type || '');
    setPaymentMode(isFacultyStaffOrDependent ? 'Salary' : 'UPI');

    setBillGenerated(false);

    // Initialize all items as selected by default
    setSelectedLabs((patient.lab_tests || []).map((_, i) => i));
    setSelectedMedicines((patient.prescriptions || []).map((_, i) => i));
    setEditedMedicines(patient.prescriptions ? JSON.parse(JSON.stringify(patient.prescriptions)) : []);

    onOpen();
  };

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

  const getCalculatedBillDetailsForPatient = (patient) => {
    if (!patient) return null;
    if (patient.items) return patient;
    const isFaculty = patient.patient_type !== 'Student';
    const items = [];

    // Process lab tests
    (patient.lab_tests || []).forEach((testObj, idx) => {
      const isSelected = patient.bill_status === 'paid' ? true : selectedLabs.includes(idx);
      if (isSelected) {
        const gross = getTestPrice(testObj.lab_test);
        const discount = isFaculty ? 50 : 0;
        const discountAmount = gross * (discount / 100);
        const amount = gross - discountAmount;
        items.push({
          type: 'lab_test',
          name: testObj.lab_test,
          gross: gross,
          discount: discount,
          discount_amount: discountAmount,
          cgst: 0.00,
          sgst: 0.00,
          amount: amount,
          item_total: amount
        });
      }
    });

    // Process medicines
    const medsList = patient.bill_status === 'paid' ? (patient.prescriptions || []) : editedMedicines;
    medsList.forEach((med, idx) => {
      const isSelected = patient.bill_status === 'paid' ? true : selectedMedicines.includes(idx);
      if (isSelected) {
        const rate = med.sale_rate || 12.67;
        const qty = parseFloat(med.quantity) || 1.0;
        const gst_rate = med.gst_rate || 5.0;
        const gross = rate * qty;
        const gst_amount = gross * (gst_rate / 100);
        const cgst = gst_amount / 2;
        const sgst = gst_amount / 2;
        const item_total = gross + gst_amount;

        items.push({
          type: 'medicine',
          name: med.note || med.drug || '',
          rate: rate,
          quantity: qty,
          gross: gross,
          discount: 0,
          discount_amount: 0.00,
          cgst: cgst,
          sgst: sgst,
          amount: gross,
          item_total: item_total,
          batch: med.batch_number || 'B-611104EC2',
          expiry: med.expiry_date || '02/31'
        });
      }
    });

    const total_unrounded = items.reduce((sum, item) => sum + item.item_total, 0);
    const total_rounded = Math.round(total_unrounded);
    const round_off = total_rounded - total_unrounded;

    let reimbursed = 0;
    let self_paid = 0;
    if (isFaculty) {
      reimbursed = parseFloat((total_unrounded * 0.90).toFixed(2));
      self_paid = parseFloat((total_rounded - reimbursed).toFixed(2));
    } else {
      reimbursed = 0;
      self_paid = total_rounded;
    }

    return {
      items,
      unrounded_total: total_unrounded,
      round_off: round_off,
      total_amount: total_rounded,
      reimbursed_amount: reimbursed,
      self_paid_amount: self_paid
    };
  };

  const getCalculatedBillDetails = () => {
    return getCalculatedBillDetailsForPatient(selectedPatient);
  };

  const getBillDetails = () => {
    if (selectedPatient && selectedPatient.items) {
      return {
        items: selectedPatient.items,
        unrounded_total: selectedPatient.unrounded_total || selectedPatient.total_amount,
        round_off: selectedPatient.round_off || 0,
        total_amount: selectedPatient.total_amount,
        reimbursed_amount: selectedPatient.reimbursed_amount || 0,
        self_paid_amount: selectedPatient.self_paid_amount || selectedPatient.total_amount
      };
    }
    return getCalculatedBillDetails();
  };

  const calculateTotal = () => {
    const details = getBillDetails();
    return details ? details.total_amount : 0;
  };

  const handleConfirmPayment = async () => {
    if (!selectedPatient) return;
    setPaymentStatus('processing');
    try {
      const token = localStorage.getItem('token');
      const payloadMedicines = selectedMedicines.map(idx => {
        const med = editedMedicines[idx];
        const rate = med.sale_rate || 12.67;
        const gst_rate = med.gst_rate || 5.0;
        const qty = parseFloat(med.quantity) || 1.0;
        const batch_number = med.batch_number || 'B-611104EC2';
        const expiry_date = med.expiry_date || '02/31';
        return {
          ...med,
          quantity: qty,
          sale_rate: rate,
          gst_rate: gst_rate,
          batch_number: batch_number,
          expiry_date: expiry_date
        };
      });

      const response = await axios.post(
        `${BASE_URL}/pay_bill`,
        {
          institute_id: selectedPatient.institute_id,
          visit_id: selectedPatient.visit_id,
          payment_mode: paymentMode,
          selected_labs: selectedLabs,
          selected_medicines: payloadMedicines,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSelectedPatient(prev => ({ ...prev, ...response.data }));
      setPaymentStatus('completed');
      fetchRegistrations(); // Refresh list to remove from queue behind the modal
    } catch (error) {
      setPaymentStatus('pending');
      toast({
        title: 'Payment Error',
        description: error.response?.data?.error || 'Failed to record payment',
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

  const handleEmailReceipt = async (patient, suppressToast = false) => {
    if (!patient || !patient.institute_id) return;

    setEmailLoadingId(patient.visit_id);
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

      const bill = getCalculatedBillDetailsForPatient(patient);
      if (!bill) {
        toast({
          title: 'Error generating bill',
          description: 'Unable to calculate bill details.',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      const receiptText = generateTextReceipt(patient, bill);
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

      if (!suppressToast) {
        toast({
          title: 'Email Sent Successfully',
          description: `Receipt has been sent to ${recipientEmail}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }

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
    const bill = getBillDetails();
    if (!selectedPatient || !bill) return;
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

      const todayStr = new Date(selectedPatient.payment_date || new Date()).toLocaleDateString('en-GB').replace(/\//g, '-');
      const invoiceNo = selectedPatient.invoice_no || 'INV-DRAFT';
      const city = 'Pilani';
      const doctorName = selectedPatient.doctor_name || selectedPatient.doctor_assigned || 'Dr. Assigned';

      const medItems = bill.items.filter(item => item.type === 'medicine');
      const labItems = bill.items.filter(item => item.type === 'lab_test');

      const getSubBillDetails = (items) => {
        const total_unrounded = items.reduce((sum, item) => sum + item.item_total, 0);
        const total_rounded = Math.round(total_unrounded);
        const round_off = total_rounded - total_unrounded;

        let reimbursed = 0;
        let self_paid = 0;
        if (isFaculty) {
          reimbursed = parseFloat((total_unrounded * 0.90).toFixed(2));
          self_paid = parseFloat((total_rounded - reimbursed).toFixed(2));
        } else {
          reimbursed = 0;
          self_paid = total_rounded;
        }
        return {
          items,
          unrounded_total: total_unrounded,
          round_off,
          total_amount: total_rounded,
          reimbursed_amount: reimbursed,
          self_paid_amount: self_paid
        };
      };

      const getSingleBillHtml = (subBill, categoryTitle, invoiceNoForSubBill) => {
        let printItemsHtml = '';
        subBill.items.forEach((item, i) => {
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

        return `
          <div class="receipt-section">
            <div style="display: flex; justify-content: space-between; font-size: 10px;">
              <div>D. L. # 4161-4162</div>
              <div style="font-weight: bold; text-decoration: underline;">SALE BILL (${categoryTitle})</div>
              <div>GST # 08AACAB7763Q1Z2</div>
            </div>
            <div class="header-title">BITS Consumers Cooperative Stores Ltd.</div>
            <div class="header-subtitle">Pilani - 333031 (Rajasthan)</div>
            <div class="divider"></div>
            <table class="meta-table">
              <tr>
                <td style="width: 60%;"><strong>Bill # :</strong> ${invoiceNoForSubBill}</td>
                <td style="text-align: right;"><strong>Date :</strong> ${todayStr}</td>
              </tr>
              <tr>
                <td colspan="2"><strong>Name :</strong> ${toTitleCase(selectedPatient.patient_name || selectedPatient.name || '')}${relationSuffix}, City : ${city}</td>
              </tr>
              ${isFacultyStaffOrDependent ? `<tr><td colspan="2">${sponsorLineHtml}</td></tr>` : ''}
              <tr>
                <td colspan="2"><strong>Dr. :</strong> ${toTitleCase(doctorName)}</td>
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
                  <td>${subBill.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}</td>
                  <td>
                    <div>${subBill.items.reduce((sum, item) => sum + (item.cgst || 0), 0).toFixed(2)}</div>
                    <div>${subBill.items.reduce((sum, item) => sum + (item.sgst || 0), 0).toFixed(2)}</div>
                  </td>
                  <td style="text-align: right;">${subBill.unrounded_total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <table style="width: 100%; font-size: 11px; margin-top: 5px; border-collapse: collapse;">
              <tr>
                <td>Round Off :</td>
                <td style="text-align: right; font-weight: bold;">${subBill.round_off.toFixed(2)}</td>
              </tr>
              <tr style="font-size: 12px; font-weight: bold;">
                <td>Bill Total :</td>
                <td style="text-align: right; border-bottom: 2px double #000; padding: 2px 0;">Rs. ${subBill.total_amount.toFixed(2)}</td>
              </tr>
            </table>

            <div class="amount-words">Total : Rs. ${numberToWords(subBill.total_amount)} Only.</div>

            <div class="split-box">
              ${isFaculty ? `
                REIMBURSED: Rs. ${subBill.reimbursed_amount.toFixed(2)} (90%)<br/>
                SELF PAID (SALARY DEDUCTION): Rs. ${subBill.self_paid_amount.toFixed(2)} (10%)
              ` : `
                REIMBURSED: Rs. 0.00 (0%)<br/>
                SELF PAID (UPI/CASH/CARD): Rs. ${subBill.self_paid_amount.toFixed(2)} (100%)
              `}
            </div>

            <div style="font-size: 9px; text-align: center; margin-top: 10px;">
              ${todayStr} - contact@bitscoop.in (${new Date().toLocaleTimeString('en-GB')})
            </div>

            <div class="footer-signature">
              <div>Checked By</div>
              <div>Authorised Signature</div>
            </div>
          </div>
        `;
      };

      let invMed = invoiceNo;
      let invLab = invoiceNo;
      if (invoiceNo.includes(',')) {
        const parts = invoiceNo.split(',');
        invMed = parts[0].trim();
        invLab = parts[1].trim();
      }

      let bodyHtml = '';
      if (medItems.length > 0 && labItems.length > 0) {
        const medBill = getSubBillDetails(medItems);
        const labBill = getSubBillDetails(labItems);
        bodyHtml = `
          ${getSingleBillHtml(medBill, "MEDICINES", invMed)}
          <div class="page-break"></div>
          ${getSingleBillHtml(labBill, "LAB TESTS", invLab)}
        `;
      } else {
        bodyHtml = getSingleBillHtml(bill, medItems.length > 0 ? "MEDICINES" : "LAB TESTS", invoiceNo);
      }

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
              @media print {
                .page-break { page-break-after: always; }
              }
            </style>
          </head>
          <body>
            ${bodyHtml}
          </body>
          </html>
      `;

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

  const handlePrintAndEmailReceipt = () => {
    handlePrintReceipt();
    if (selectedPatient) {
      handleEmailReceipt(selectedPatient, true);
    }
  };

  // On-screen receipt preview
  const ReceiptPreview = () => {
    const bill = getBillDetails();
    if (!selectedPatient || !bill) return null;

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

    const medItems = bill.items.filter(item => item.type === 'medicine');
    const labItems = bill.items.filter(item => item.type === 'lab_test');

    const getSubBillDetails = (items) => {
      const total_unrounded = items.reduce((sum, item) => sum + item.item_total, 0);
      const total_rounded = Math.round(total_unrounded);
      const round_off = total_rounded - total_unrounded;

      let reimbursed = 0;
      let self_paid = 0;
      if (isFaculty) {
        reimbursed = parseFloat((total_unrounded * 0.90).toFixed(2));
        self_paid = parseFloat((total_rounded - reimbursed).toFixed(2));
      } else {
        reimbursed = 0;
        self_paid = total_rounded;
      }
      return {
        items,
        unrounded_total: total_unrounded,
        round_off,
        total_amount: total_rounded,
        reimbursed_amount: reimbursed,
        self_paid_amount: self_paid
      };
    };

    const renderSingleReceipt = (subBill, categoryTitle, invoiceNoForSubBill) => {
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
          maxH="600px"
          overflowY="auto"
          w="100%"
        >
          <Flex justify="space-between" fontSize="9px" fontWeight="bold" mb={1}>
            <Text>D. L. # 4161-4162</Text>
            <Text textDecoration="underline">SALE BILL ({categoryTitle})</Text>
            <Text>GST # 08AACAB7763Q1Z2</Text>
          </Flex>

          <Box textAlign="center" mb={2}>
            <Text fontWeight="bold" fontSize="sm">BITS Consumers Cooperative Stores Ltd.</Text>
            <Text fontSize="9px">Pilani - 333031 (Rajasthan)</Text>
          </Box>

          <Divider borderColor="gray.400" mb={2} />

          <Grid templateColumns="1fr 1fr" gap={1} mb={2}>
            <Text><strong>Invoice No:</strong> {invoiceNoForSubBill}</Text>
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
              {subBill.items.map((item, idx) => (
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
                  {subBill.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                </Td>
                <Td p={1} textAlign="center">
                  <Text>{subBill.items.reduce((sum, item) => sum + (item.cgst || 0), 0).toFixed(2)}</Text>
                  <Text>{subBill.items.reduce((sum, item) => sum + (item.sgst || 0), 0).toFixed(2)}</Text>
                </Td>
                <Td p={1} textAlign="right">{subBill.unrounded_total.toFixed(2)}</Td>
              </Tr>
            </Tbody>
          </Table>

          <Box mt={2} fontSize="11px">
            <Flex justify="space-between">
              <Text>Round Off :</Text>
              <Text fontWeight="bold">{subBill.round_off.toFixed(2)}</Text>
            </Flex>
            <Flex justify="space-between" fontSize="sm" fontWeight="bold" borderBottom="2px double black" pb={1} mt={1}>
              <Text>Bill Total :</Text>
              <Text>Rs. {subBill.total_amount.toFixed(2)}</Text>
            </Flex>
          </Box>

          <Text mt={2} fontWeight="bold" textTransform="uppercase" fontSize="10px">
            Total : Rs. {numberToWords(subBill.total_amount)} Only.
          </Text>

          <Box mt={3} p={2} border="1px solid black" fontSize="9px" fontWeight="bold">
            {isFaculty ? (
              <Box>
                <Text>REIMBURSED: Rs. {subBill.reimbursed_amount.toFixed(2)} (90%)</Text>
                <Text>SELF PAID (SALARY DEDUCTION): Rs. {subBill.self_paid_amount.toFixed(2)} (10%)</Text>
              </Box>
            ) : (
              <Box>
                <Text>REIMBURSED: Rs. 0.00 (0%)</Text>
                <Text>SELF PAID (UPI/CASH/CARD): Rs. {subBill.self_paid_amount.toFixed(2)} (100%)</Text>
              </Box>
            )}
          </Box>
        </Box>
      );
    };

    let invMed = invoiceNo;
    let invLab = invoiceNo;
    if (invoiceNo.includes(',')) {
      const parts = invoiceNo.split(',');
      invMed = parts[0].trim();
      invLab = parts[1].trim();
    }

    if (medItems.length > 0 && labItems.length > 0) {
      const medBill = getSubBillDetails(medItems);
      const labBill = getSubBillDetails(labItems);
      return (
        <Flex direction={{ base: "column", xl: "row" }} gap={4} w="100%" align="stretch">
          <Flex direction="column" flex="1" gap={2}>
            <Heading size="xs" color="gray.700" textAlign="center" textTransform="uppercase">Medicine Bill Preview</Heading>
            {renderSingleReceipt(medBill, "MEDICINES", invMed)}
          </Flex>
          <Flex direction="column" flex="1" gap={2}>
            <Heading size="xs" color="gray.700" textAlign="center" textTransform="uppercase">Lab Test Bill Preview</Heading>
            {renderSingleReceipt(labBill, "LAB TESTS", invLab)}
          </Flex>
        </Flex>
      );
    } else {
      const category = medItems.length > 0 ? "MEDICINES" : "LAB TESTS";
      const title = medItems.length > 0 ? "Medicine Bill Preview" : "Lab Test Bill Preview";
      return (
        <Flex direction="column" w="100%" gap={2}>
          <Heading size="xs" color="gray.700" textAlign="center" textTransform="uppercase">{title}</Heading>
          {renderSingleReceipt(bill, category, invoiceNo)}
        </Flex>
      );
    }
  };


  if (loading) {
    return (
      <Flex justify="center" align="center" minH="100vh" bg={bodyBg}>
        <Spinner size="xl" />
      </Flex>
    );
  }

  const paginatedRegistrations = filteredRegistrations.slice((activePatientsPage - 1) * 10, activePatientsPage * 10);

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
                  <Th>Patient Details</Th>
                  <Th textAlign="center">Type</Th>
                  <Th textAlign="center">Status</Th>
                  <Th textAlign="center">Bill</Th>
                  <Th textAlign="center">Lab</Th>
                  <Th textAlign="center">Completed Time</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paginatedRegistrations.map((patient) => (
                  <Tr
                    key={patient.institute_id}
                    _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                    onClick={() => handleSelectPatient(patient)}
                  >
                    <Td>{patient.institute_id}</Td>
                    <Td>
                      <Box>
                        <Text fontWeight="bold">{toTitleCase(patient.name)}</Text>
                        <Text fontSize="xs" color="gray.500">
                          {calculateAge(patient.age)} yrs{patient.gender ? ` • ${patient.gender}` : ''}
                        </Text>
                      </Box>
                    </Td>
                    <Td textAlign="center">
                      <Badge fontSize="10px" colorScheme={patient.patient_type === 'Student' ? 'blue' : patient.patient_type === 'Faculty' ? 'purple' : 'gray'}>
                        {patient.patient_type}
                      </Badge>
                    </Td>
                    <Td textAlign="center">
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
                    <Td textAlign="center">
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        colorScheme={patient.bill_status === 'paid' ? 'green' : patient.bill_status === 'pending' ? 'red' : 'gray'}
                      >
                        {patient.bill_status}
                      </Badge>
                    </Td>
                    <Td textAlign="center">
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        colorScheme={patient.lab_status === 'completed' ? 'green' : patient.lab_status === 'pending' ? 'blue' : patient.lab_status === 'active' ? 'orange' : 'gray'}
                      >
                        {patient.lab_status}
                      </Badge>
                    </Td>
                    <Td textAlign="center" fontSize="xs">
                      {patient.consultation_completed_time ? formatDateTimeIST(patient.consultation_completed_time) : formatDateTimeIST(patient.booked_at || Date.now())}
                    </Td>
                  </Tr>
                ))}
                {filteredRegistrations.length === 0 && (
                  <Tr>
                    <Td colSpan={7} textAlign="center">
                      No active patients found.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
          <Flex justify="space-between" mt={4} align="center">
            <Text fontSize="sm" color="gray.500">
              Showing {paginatedRegistrations.length} of {filteredRegistrations.length} patients
            </Text>
            <HStack>
              <IconButton
                icon={<FiChevronLeft />}
                size="sm"
                isDisabled={activePatientsPage === 1}
                onClick={() => setActivePatientsPage(activePatientsPage - 1)}
                aria-label="Previous Page"
              />
              <Text fontSize="sm">Page {activePatientsPage} of {Math.ceil(filteredRegistrations.length / 10) || 1}</Text>
              <IconButton
                icon={<FiChevronRight />}
                size="sm"
                isDisabled={activePatientsPage * 10 >= filteredRegistrations.length}
                onClick={() => setActivePatientsPage(activePatientsPage + 1)}
                aria-label="Next Page"
              />
            </HStack>
          </Flex>
        </Box>

        {/* Redesigned Modal */}
        <Modal
          isOpen={isOpen}
          onClose={() => {
            onClose();
            setBillGenerated(false);
          }}
          isCentered
          size="5xl"
        >
          <ModalOverlay />
          <ModalContent bg={modalBg} maxW="1450px" borderRadius="2xl" overflow="hidden">
            {/* Modal Header with patient basic info */}
            <Box bg="blue.800" color="white" p={4}>
              {selectedPatient && (
                <Flex direction="column" align="center">
                  <Heading size="md">
                    {toTitleCase(selectedPatient.name || selectedPatient.patient_name || '')} (ID: {selectedPatient.institute_id})
                  </Heading>
                  <Text fontSize="sm">Patient Type: {selectedPatient.patient_type} • Age: {calculateAge(selectedPatient.age)}</Text>
                  {(selectedPatient.consultation_completed_time || selectedPatient.booked_at) && (
                    <Text fontSize="xs" mt={1}>Order Date: {formatDateTimeIST(selectedPatient.consultation_completed_time || selectedPatient.booked_at)}</Text>
                  )}
                </Flex>
              )}
            </Box>
            <ModalCloseButton color="white" />
            {/* Panelled Modal Body */}
            <ModalBody p={6}>
              <Grid templateColumns={{ base: "1fr", lg: "0.7fr 1.3fr" }} gap={6} alignItems="start">
                {/* Left Column: Input and selection controls */}
                <Box>
                  {paymentStatus === 'completed' ? (
                    <Box textAlign="center" py={12} px={6} border="1px dashed" borderColor="green.300" borderRadius="xl" bg="green.50">
                      <Icon as={FiPrinter} boxSize={16} color="green.500" mb={4} />
                      <Heading size="md" color="green.600" mb={2}>Payment Received</Heading>
                      <Text mb={4}>Invoice No: {selectedPatient?.invoice_no}</Text>
                      <Flex direction="column" gap={3} mt={4} w="100%">
                        <Button
                          colorScheme="blue"
                          onClick={handlePrintAndEmailReceipt}
                          leftIcon={<FiPrinter />}
                          size="md"
                          w="100%"
                          isLoading={emailLoadingId === selectedPatient?.visit_id}
                          loadingText="Sending Email..."
                        >
                          Print & Email Receipt
                        </Button>
                      </Flex>
                    </Box>
                  ) : (
                    <Box>
                      <Heading size="xs" color="gray.600" mb={3} textTransform="uppercase">Select Billable Items</Heading>

                      <Box maxH="350px" overflowY="auto" border="1px solid" borderColor="gray.200" borderRadius="md" p={2} mb={4} bg="white">
                        <Table variant="simple" size="sm">
                          <Thead bg="gray.50">
                            <Tr>
                              <Th width="40px">Incl.</Th>
                              <Th>Item Details</Th>
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
                                  {pres.dose && <Text fontSize="xs" color="gray.500">{pres.dose} | {pres.route}</Text>}
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
                                <Td>
                                  <Text fontWeight="bold">{test.lab_test || 'Unknown Test'}</Text>
                                  <Text fontSize="xs" color="gray.500">Lab Test | Rate: Rs. {getTestPrice(test.lab_test).toFixed(2)}</Text>
                                </Td>
                              </Tr>
                            ))}
                            {(!selectedPatient?.prescriptions?.length && !selectedPatient?.lab_tests?.length) && (
                              <Tr>
                                <Td colSpan={2} textAlign="center">No billable items found</Td>
                              </Tr>
                            )}
                          </Tbody>
                        </Table>
                      </Box>

                      <Box p={4} bg="blue.50" borderRadius="md">
                        <Heading size="xs" mb={3} color="blue.800" textTransform="uppercase">Payment Collection</Heading>
                        <Flex align="center" gap={4}>
                          <Text fontWeight="bold" fontSize="sm" whiteSpace="nowrap">Payment Mode:</Text>
                          <Select
                            value={paymentMode}
                            onChange={(e) => setPaymentMode(e.target.value)}
                            bg="white"
                            size="sm"
                            maxW="150px"
                          >
                            {['Faculty', 'Staff', 'Dependant'].includes(selectedPatient?.patient_type || '') && (
                              <option value="Salary">Salary</option>
                            )}
                            <option value="UPI">UPI</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                          </Select>
                        </Flex>
                      </Box>
                    </Box>
                  )}
                </Box>

                {/* Right Column: Live receipt preview */}
                <Box>
                  <Heading size="xs" color="gray.600" mb={3} textTransform="uppercase" textAlign="center">Invoice Receipt Preview</Heading>
                  <ReceiptPreview />
                </Box>
              </Grid>
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
                    fontSize="sm"
                    px={6}
                  >
                    Confirm Payment & Mark as Paid
                  </Button>
                  <Button
                    colorScheme="red"
                    onClick={handleCancelBill}
                    isLoading={paymentStatus === 'processing'}
                    fontSize="sm"
                    px={4}
                    mr={3}
                  >
                    Cancel Entire Bill
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onClose} px={4}>
                    Close
                  </Button>
                </>
              )}
              {paymentStatus === 'completed' && (
                <Button variant="ghost" size="sm" onClick={onClose} colorScheme="blue">
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
