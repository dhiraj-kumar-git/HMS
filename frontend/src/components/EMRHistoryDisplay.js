import React, { useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Badge,
  HStack,
  Divider,
  SimpleGrid,
  GridItem,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Button,
  Icon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  FormControl,
  FormLabel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  useToast,
  Flex
} from '@chakra-ui/react';
import { FiFileText, FiMail, FiEye, FiSend, FiCheckCircle } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../utils/Config';

const Field = ({ label, value, isDiagnosis }) => (
  <Box mb={2}>
    <Text fontSize="10px" fontWeight="bold" color={isDiagnosis ? "red.700" : "gray.600"}>{label}</Text>
    <Text fontSize="xs" whiteSpace="pre-wrap" color={isDiagnosis ? "red.700" : "gray.800"}>{value || "-"}</Text>
  </Box>
);

const EMRHistoryDisplay = ({ emrData, legacyApp, hideCancelledAlert = false }) => {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [emailTarget, setEmailTarget] = useState('');
  const [emailingReport, setEmailingReport] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [isManualPdfLoading, setIsManualPdfLoading] = useState(false);

  const cleanTestName = (name) => {
    if (!name) return "";
    const idx = name.indexOf("(");
    if (idx !== -1) {
      return name.substring(0, idx).trim();
    }
    return name.trim();
  };

  const isOutOfRange = (valueStr, refRangeStr) => {
    if (!refRangeStr || refRangeStr === "N/A" || refRangeStr === "Normal") return false;
    const val = parseFloat(valueStr);
    if (isNaN(val)) return false;

    if (refRangeStr.startsWith("<")) {
      const limit = parseFloat(refRangeStr.substring(1));
      return !isNaN(limit) && val >= limit;
    }
    if (refRangeStr.startsWith(">")) {
      const limit = parseFloat(refRangeStr.substring(1));
      return !isNaN(limit) && val <= limit;
    }
    if (refRangeStr.includes("-")) {
      const parts = refRangeStr.split("-").map(p => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return val < parts[0] || val > parts[1];
      }
    }
    return false;
  };

  const formatDateTimeIST = (timestamp) => {
    if (!timestamp) return "—";
    try {
      const date = new Date(timestamp);
      return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    } catch {
      return timestamp;
    }
  };

  const fetchBlobAsBase64 = async (s3Key) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.post(`${BASE_URL}/s3/view-url`, { s3_key: s3Key }, { headers });
    if (!res.data || !res.data.url) {
      throw new Error("Failed to get proxy URL");
    }
    let targetUrl = res.data.url;
    if (targetUrl.includes("/s3/proxy-download")) {
      const path = targetUrl.substring(targetUrl.indexOf("/s3/proxy-download"));
      targetUrl = `${BASE_URL}${path}`;
    }
    const fileRes = await axios.get(targetUrl, {
      headers,
      responseType: 'blob'
    });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileRes.data);
    });
  };

  const handleDownload = async (s3Key) => {
    if (!s3Key) {
      toast({ title: "No S3 key available for this report.", status: "warning", duration: 3000 });
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${BASE_URL}/s3/view-url`, { s3_key: s3Key }, { headers });
      if (res.data && res.data.url) {
        let targetUrl = res.data.url;
        if (targetUrl.includes("/s3/proxy-download")) {
          const path = targetUrl.substring(targetUrl.indexOf("/s3/proxy-download"));
          targetUrl = `${BASE_URL}${path}`;
          const fileRes = await axios.get(targetUrl, {
            headers,
            responseType: 'blob'
          });
          const fileUrl = URL.createObjectURL(fileRes.data);
          window.open(fileUrl, '_blank');
        } else {
          window.open(targetUrl, '_blank');
        }
      } else {
        toast({ title: "Failed to get download link: server returned no URL.", status: "error", duration: 3000 });
      }
    } catch (err) {
      console.error("Download link error:", err);
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.error || err?.response?.data?.msg || err.message;
      toast({ title: `Error downloading (HTTP ${status || 'network error'}): ${serverMsg || 'Unknown error'}`, status: "error", duration: 3000 });
    }
  };

  const openEmailModal = (reportOrReports) => {
    setEmailingReport(reportOrReports);
    const defaultEmail = legacyApp?.email || legacyApp?.patient_email || localStorage.getItem("email") || "";
    setEmailTarget(defaultEmail);
    onOpen();
  };

  const handleSendEmail = async () => {
    if (!emailTarget.trim()) {
      toast({ title: "Please enter a valid email address.", status: "warning", duration: 3000 });
      return;
    }
    setEmailLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      let payload = {};
      if (Array.isArray(emailingReport)) {
        const doc = await generateManualPdfDocument(emailingReport);
        const base64Data = doc.output("datauristring").split(",")[1];
        payload = {
          recipient_email: emailTarget,
          subject: "Lab Test Results Summary (Manual)",
          body: "<p>Please find attached your combined manually-entered lab test results summary.</p>",
          pdf_base64: base64Data,
          filename: "LabResultsSummary.pdf"
        };
      } else {
        let subj = `Lab Report - ${cleanTestName(emailingReport.test_name)}`;
        let bodyHtml = `<p>Please find attached your lab report file for <strong>${cleanTestName(emailingReport.test_name)}</strong>.</p>`;
        
        payload = {
          recipient_email: emailTarget,
          subject: subj,
          body: bodyHtml,
        };

        if (emailingReport.s3_key) {
          const base64Data = await fetchBlobAsBase64(emailingReport.s3_key);
          payload.pdf_base64 = base64Data;
          payload.filename = emailingReport.file_name || `${emailingReport.test_name}.pdf`;
        } else {
          const doc = await generateManualPdfDocument([emailingReport]);
          const base64Data = doc.output("datauristring").split(",")[1];
          payload.pdf_base64 = base64Data;
          payload.filename = `LabResults_${cleanTestName(emailingReport.test_name).replace(/\s+/g, '_')}.pdf`;
        }
      }

      await axios.post(`${BASE_URL}/lab/send_email`, payload, { headers });
      toast({ title: "Email sent successfully!", status: "success", duration: 3000 });
      onClose();
    } catch (err) {
      console.error("Email send error:", err);
      toast({ title: "Failed to send email.", description: err.message, status: "error", duration: 4000 });
    } finally {
      setEmailLoading(false);
    }
  };

  const generateManualPdfDocument = async (reports) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("BITS Pilani Medical Centre", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text("Lab Test Report", 105, 28, { align: "center" });
    doc.line(14, 32, 196, 32);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const patientName = legacyApp?.patientName || legacyApp?.name || "Patient";
    const instId = legacyApp?.instituteId || legacyApp?.institute_id || "N/A";
    const age = legacyApp?.age || "N/A";
    const gender = legacyApp?.gender || "N/A";
    const doctor = legacyApp?.doctorName || legacyApp?.doctor_name || "N/A";
    const dateStr = formatDateTimeIST(reports[0]?.timestamp || legacyApp?.time || new Date().toISOString());

    doc.text(`Name         : ${toTitleCase(patientName)}`, 14, 40);
    doc.text(`Institute ID : ${instId}`, 14, 47);
    doc.text(`Age / Gender : ${age} yrs / ${gender}`, 14, 54);
    doc.text(`Doctor       : ${doctor}`, 14, 61);
    doc.text(`Date         : ${dateStr}`, 14, 68);
    doc.line(14, 73, 196, 73);

    let y = 82;
    reports.forEach((report, index) => {
      if (y > 240) {
        doc.addPage();
        y = 20;
      } else if (index > 0) {
        y += 10;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(report.test_name || "Lab Test", 14, y);
      y += 5;
      doc.line(14, y, 196, y);
      y += 5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Parameter", 14, y);
      doc.text("Result", 85, y);
      doc.text("Reference Range", 120, y);
      doc.text("Units", 176, y);
      y += 3;
      doc.line(14, y, 196, y);
      y += 5;
      doc.setFont("helvetica", "normal");

      const entries = Object.entries(report.results || {});
      entries.forEach(([param, val]) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("Parameter", 14, y);
          doc.text("Result", 85, y);
          doc.text("Reference Range", 120, y);
          doc.text("Units", 176, y);
          y += 3;
          doc.line(14, y, 196, y);
          y += 5;
          doc.setFont("helvetica", "normal");
        }
        
        const value = typeof val === "object" ? String(val.value ?? "") : String(val);
        const ref = typeof val === "object" ? String(val.reference_range ?? "N/A") : "N/A";
        const units = typeof val === "object" ? String(val.units ?? "N/A") : "N/A";
        doc.text(param, 14, y);
        doc.text(value, 85, y);
        doc.text(ref, 120, y);
        doc.text(units, 176, y);
        y += 7;
      });

      if (report.remarks) {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.text("Remarks:", 14, y);
        doc.setFont("helvetica", "normal");
        doc.text(report.remarks, 32, y);
        y += 5;
      }
      y += 3;
      doc.line(14, y, 196, y);
    });

    return doc;
  };

  const handleViewManualPdf = async (reports) => {
    setIsManualPdfLoading(true);
    try {
      const doc = await generateManualPdfDocument(reports);
      window.open(doc.output("bloburl"), "_blank");
    } catch (err) {
      console.error("PDF preview error:", err);
      toast({ title: "Failed to generate PDF.", status: "error", duration: 3000 });
    } finally {
      setIsManualPdfLoading(false);
    }
  };

  const toTitleCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const renderLabReportsSection = () => {
    const labReports = legacyApp?.lab_reports || [];
    const prescribedTests = legacyApp?.lab_tests || [];
    const hasPrescribedTests = (prescribedTests.length > 0) || 
      (legacyApp?.lab_test_summary && legacyApp.lab_test_summary.length > 0) || 
      (emrData?.plan?.investigations && emrData.plan.investigations.length > 0);

    if (labReports.length === 0) {
      if (hasPrescribedTests) {
        return (
          <Box mt={3} p={4} bg="orange.50/50" borderRadius="2xl" border="1px solid" borderColor="orange.200" w="100%">
            <Alert status="info" variant="subtle" p={3} borderRadius="xl" colorScheme="orange">
              <AlertIcon />
              <Box>
                <AlertTitle fontSize="xs" fontWeight="bold" color="orange.800">Lab Reports Pending</AlertTitle>
                <AlertDescription fontSize="11px" color="orange.700">
                  Your prescribed lab tests are currently being processed. Results will be visible here once completed by the lab staff.
                </AlertDescription>
              </Box>
            </Alert>
          </Box>
        );
      }
      return null;
    }

    const fileReports = labReports.filter((r) => !!r.s3_key || !!r.file_name);
    const manualReports = labReports.filter((r) => !r.s3_key && !r.file_name && r.results && Object.keys(r.results).length > 0);

    return (
      <VStack align="stretch" spacing={4} w="100%" mt={3}>
        {/* 1. File Uploads Section */}
        {fileReports.length > 0 && (
          <Box p={4} bg="green.50/40" borderRadius="2xl" border="1px solid" borderColor="green.100" w="100%">
            <Text fontWeight="bold" fontSize="sm" color="green.800" mb={3} display="flex" alignItems="center">
              <Icon as={FiFileText} mr={1.5} /> Uploaded Lab Reports (Files)
            </Text>
            <VStack align="stretch" spacing={3} w="100%">
              {fileReports.map((report, idx) => (
                <HStack key={idx} justify="space-between" bg="white" p={3} borderRadius="xl" border="1px solid" borderColor="gray.100" w="100%">
                  <VStack align="start" spacing={0.5}>
                    <Text fontSize="xs" fontWeight="bold" color="blue.900">
                      {cleanTestName(report.test_name || "Lab Report")}
                    </Text>
                    <Text fontSize="2xs" color="gray.500">
                      File: {report.file_name} • Uploaded {new Date(report.uploaded_at || report.timestamp).toLocaleDateString()}
                    </Text>
                  </VStack>
                  <HStack spacing={2}>
                    <Button
                      size="xs"
                      colorScheme="teal"
                      variant="outline"
                      borderRadius="lg"
                      leftIcon={<FiEye />}
                      onClick={() => handleDownload(report.s3_key)}
                    >
                      View
                    </Button>
                    <Button
                      size="xs"
                      colorScheme="teal"
                      borderRadius="lg"
                      leftIcon={<FiMail />}
                      onClick={() => openEmailModal(report)}
                    >
                      Email
                    </Button>
                  </HStack>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}

        {/* 2. Manually Entered Results Section */}
        {manualReports.length > 0 && (
          <Box p={4} bg="blue.50/30" borderRadius="2xl" border="1px solid" borderColor="blue.100" w="100%">
            <Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={2}>
              <Text fontWeight="bold" fontSize="sm" color="blue.900" display="flex" alignItems="center">
                <Icon as={FiCheckCircle} mr={1.5} /> Lab Test Results (Manual)
              </Text>
              <HStack spacing={2}>
                <Button
                  size="xs"
                  colorScheme="blue"
                  variant="outline"
                  borderRadius="md"
                  leftIcon={<FiEye />}
                  onClick={() => handleViewManualPdf(manualReports)}
                  isLoading={isManualPdfLoading}
                >
                  View PDF
                </Button>
                <Button
                  size="xs"
                  colorScheme="blue"
                  borderRadius="md"
                  leftIcon={<FiMail />}
                  onClick={() => openEmailModal(manualReports)}
                >
                  Email Results
                </Button>
              </HStack>
            </Flex>
            <VStack align="stretch" spacing={4} w="100%">
              {manualReports.map((report, idx) => (
                <Box key={idx} bg="white" p={4} borderRadius="xl" border="1px solid" borderColor="gray.100" w="100%">
                  <Flex justify="space-between" align="center" mb={2}>
                    <Text fontSize="xs" fontWeight="bold" color="blue.900">
                      {cleanTestName(report.test_name)}
                    </Text>
                  </Flex>

                  <Box borderRadius="lg" border="1px solid" borderColor="gray.200" overflow="hidden">
                    <Table variant="simple" size="sm">
                      <Thead bg="gray.50">
                        <Tr>
                          <Th fontSize="3xs" color="gray.500" py={1.5} px={2} textTransform="uppercase" fontWeight="bold">Parameter</Th>
                          <Th fontSize="3xs" color="gray.500" py={1.5} px={2} textTransform="uppercase" fontWeight="bold">Result</Th>
                          <Th fontSize="3xs" color="gray.500" py={1.5} px={2} textTransform="uppercase" fontWeight="bold">Reference Range</Th>
                          <Th fontSize="3xs" color="gray.500" py={1.5} px={2} textTransform="uppercase" fontWeight="bold">Units</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {Object.entries(report.results || {}).map(([param, val]) => {
                          const value = typeof val === "object" ? (val.value ?? "—") : (val || "—");
                          const ref = typeof val === "object" ? (val.reference_range ?? "N/A") : "N/A";
                          const units = typeof val === "object" ? (val.units ?? "N/A") : "N/A";
                          const isAbnormal = isOutOfRange(String(value), String(ref));
                          return (
                            <Tr key={param}>
                              <Td fontSize="2xs" py={1.5} px={2} color="gray.700" fontWeight="medium">{param}</Td>
                              <Td fontSize="2xs" py={1.5} px={2} fontWeight="bold" color={isAbnormal ? "red.600" : "blue.600"}>
                                {String(value)} {isAbnormal && "⚠️"}
                              </Td>
                              <Td fontSize="2xs" py={1.5} px={2} color="gray.500">{String(ref)}</Td>
                              <Td fontSize="2xs" py={1.5} px={2} color="gray.500">{String(units)}</Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>

                  {report.remarks && (
                    <Box mt={2} p={2} bg="gray.50" borderRadius="md" borderLeft="2px solid" borderColor="gray.300">
                      <Text fontSize="2xs" color="gray.600" fontStyle="italic"><strong>Remarks:</strong> {report.remarks}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </VStack>
          </Box>
        )}

        {/* Email Modal Dialog */}
        <Modal isOpen={isOpen} onClose={onClose} size="xs" isCentered>
          <ModalOverlay />
          <ModalContent borderRadius="xl">
            <ModalHeader fontSize="xs" fontWeight="bold">Send Report via Email</ModalHeader>
            <ModalCloseButton size="sm" />
            <ModalBody pb={4}>
              <FormControl>
                <FormLabel fontSize="2xs" fontWeight="bold" color="gray.500">RECIPIENT EMAIL</FormLabel>
                <Input
                  type="email"
                  size="sm"
                  borderRadius="md"
                  placeholder="Enter email address"
                  value={emailTarget}
                  onChange={(e) => setEmailTarget(e.target.value)}
                />
              </FormControl>
            </ModalBody>
            <ModalFooter>
              <Button size="xs" colorScheme="gray" variant="ghost" mr={2} onClick={onClose}>Cancel</Button>
              <Button
                size="xs"
                colorScheme="blue"
                leftIcon={<FiSend />}
                isLoading={emailLoading}
                onClick={handleSendEmail}
              >
                Send
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </VStack>
    );
  };

  // Graceful fallback for legacy appointments without emrData
  if (!emrData || Object.keys(emrData).length === 0) {
    return (
      <VStack align="stretch" spacing={3} w="100%">
        {legacyApp?.status === 'cancelled' && !hideCancelledAlert && (
          <Alert status="error" borderRadius="md" p={2}>
            <AlertIcon />
            <Box>
              <AlertTitle mr={2} fontSize="xs">Bill Cancelled</AlertTitle>
              <AlertDescription fontSize="10px">The entire bill for this visit has been cancelled.</AlertDescription>
            </Box>
          </Alert>
        )}
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} w="100%">
          <Box>
            <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Medicines Prescribed</Text>
            {legacyApp?.prescription_summary && legacyApp.prescription_summary.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.prescription_summary.map((p, i) => p && <Text key={i} fontSize="xs">• {p}</Text>)}
              </VStack>
            ) : <Text fontSize="xs" color="gray.400">None recorded.</Text>}
          </Box>
          <Box>
            <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Prescription Remarks</Text>
            {legacyApp?.prescription_remarks_summary && legacyApp.prescription_remarks_summary.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.prescription_remarks_summary.map((r, i) => r && <Text key={i} fontSize="xs">• {r}</Text>)}
              </VStack>
            ) : <Text fontSize="xs" color="gray.400">None recorded.</Text>}
          </Box>
          <Box gridColumn={{ md: "span 2" }}>
            <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Diagnosis Notes</Text>
            {legacyApp?.diagnosis_note && legacyApp.diagnosis_note.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.diagnosis_note.map((d, i) => d && <Text key={i} fontSize="xs">• {typeof d === 'string' ? d : d.note || JSON.stringify(d)}</Text>)}
              </VStack>
            ) : <Text fontSize="xs" color="gray.400">None recorded.</Text>}
          </Box>
          <Box gridColumn={{ md: "span 2" }}>
            <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Lab Tests Overview</Text>
            {legacyApp?.lab_test_summary && legacyApp.lab_test_summary.length > 0 ? (
              <Flex wrap="wrap" gap={2} mt={1}>
                {legacyApp.lab_test_summary.map((l, i) => l && (
                  <Badge key={i} colorScheme="blue" borderRadius="lg" px={2.5} py={0.5} fontSize="2xs" fontWeight="bold">
                    {cleanTestName(l)}
                  </Badge>
                ))}
              </Flex>
            ) : <Text fontSize="xs" color="gray.400">None recorded.</Text>}
          </Box>
        </SimpleGrid>
        {renderLabReportsSection()}
      </VStack>
    );
  }

  const emrDataObj = emrData || {};
  const subjective = emrDataObj.subjective || {};
  const objective = emrDataObj.objective || {};
  const assessment = emrDataObj.assessment || {};
  const plan = emrDataObj.plan || {};

  // Support both legacy flat 'vitals' and new 'objective.vitals'
  const vitals = emrDataObj.vitals || objective.vitals || {};
  
  const meds = plan.medications || [];
  const labs = plan.investigations || [];

  // Vitals Mapping
  const bp = vitals.blood_pressure || vitals.bp || '';
  const pulse = vitals.pulse || '';
  const temp = vitals.temperature || vitals.temp || '';
  const oxygen = vitals.spO2 || vitals.oxygen || '';
  const rr = vitals.respiratory_rate || vitals.resp_rate || '';
  const wt = vitals.weight || '';
  const ht = vitals.height || '';

  const hasVitals = bp || pulse || temp || oxygen || rr || wt || ht;

  return (
    <VStack align="stretch" spacing={3}>
      {legacyApp?.status === 'cancelled' && !hideCancelledAlert && (
        <Alert status="error" borderRadius="md" p={2}>
          <AlertIcon />
          <Box>
            <AlertTitle mr={2} fontSize="xs">Bill Cancelled</AlertTitle>
            <AlertDescription fontSize="10px">The entire bill for this visit has been cancelled.</AlertDescription>
          </Box>
        </Alert>
      )}
      {/* Vitals */}
      {hasVitals && (
        <Box>
          <Text fontWeight="bold" fontSize="xs" color="blue.700" mb={1.5}>Vitals</Text>
          <HStack spacing={1.5} wrap="wrap">
            {bp && <Badge colorScheme="blue" fontSize="9px">BP: {bp} mmHg</Badge>}
            {pulse && <Badge colorScheme="red" fontSize="9px">Pulse: {pulse} bpm</Badge>}
            {temp && <Badge colorScheme="orange" fontSize="9px">Temp: {temp} °F</Badge>}
            {oxygen && <Badge colorScheme="cyan" fontSize="9px">SpO2: {oxygen}%</Badge>}
            {rr && <Badge colorScheme="gray" fontSize="9px">RR: {rr}/min</Badge>}
            {wt && <Badge colorScheme="green" fontSize="9px">Wt: {wt} kg</Badge>}
            {ht && <Badge colorScheme="purple" fontSize="9px">Ht: {ht} cm</Badge>}
          </HStack>
        </Box>
      )}

      {/* Clinical Notes (Subjective + Objective) */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Box>
          <Text fontWeight="bold" fontSize="xs" color="gray.700" mb={2} borderBottom="1px solid" borderColor="gray.200" pb={1}>Subjective</Text>
          <Field label="Chief Complaints" value={subjective.chief_complaints} />
          <Field label="History of Present Illness (HPI)" value={subjective.history_of_present_illness || subjective.hpi} />
          <Field label="Past Medical / Family History" value={subjective.past_medical_history || subjective.past_history} />
          <Field label="Allergies" value={subjective.allergies} />
        </Box>
        <Box>
          <Text fontWeight="bold" fontSize="xs" color="gray.700" mb={2} borderBottom="1px solid" borderColor="gray.200" pb={1}>Objective & Assessment</Text>
          <Field label="General Examination" value={objective.general_examination || objective.general_exam} />
          <Field label="Systemic Examination" value={objective.systemic_examination || objective.systemic_exam} />
          <Field label="Local Examination" value={objective.local_examination || objective.local_exam} />
          <Field label="Provisional Diagnosis" value={assessment.provisional_diagnosis} isDiagnosis />
        </Box>
      </SimpleGrid>

      <Divider />

      {/* Plan */}
      <Box>
        <Text fontWeight="bold" fontSize="xs" color="gray.700" mb={1.5}>Plan</Text>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          {/* Medications */}
          <GridItem>
            <Text fontWeight="bold" fontSize="10px" color="gray.600" mb={1}>Medications</Text>
            {meds.length > 0 ? (
              <VStack align="stretch" spacing={1.5}>
                {meds.map((m, i) => (
                  <Box key={i} p={1.5} bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" boxShadow="sm">
                    <HStack justify="space-between">
                      <Text fontWeight="bold" fontSize="xs" color="green.700">{m.drug}</Text>
                      <Badge colorScheme="gray" fontSize="9px">{m.quantity || 'N/A'} Qty</Badge>
                    </HStack>
                    <Text fontSize="10px" color="gray.600">{m.dose || 'N/A'} • {m.route || 'N/A'} • {m.frequency || 'N/A'} • {m.duration || 'N/A'}</Text>
                  </Box>
                ))}
              </VStack>
            ) : <Text fontSize="xs" color="gray.400">-</Text>}
          </GridItem>

          {/* Investigations */}
          <GridItem>
            <Text fontWeight="bold" fontSize="10px" color="gray.600" mb={1}>Investigations (Labs)</Text>
            {labs.length > 0 ? (
              <Flex wrap="wrap" gap={2} mt={1}>
                {labs.map((l, i) => l && (
                  <Badge key={i} colorScheme="blue" borderRadius="lg" px={2.5} py={0.5} fontSize="2xs" fontWeight="bold">
                    {cleanTestName(l)}
                  </Badge>
                ))}
              </Flex>
            ) : <Text fontSize="xs" color="gray.400">-</Text>}
          </GridItem>

          {/* Advice & Follow-up */}
          <GridItem>
            <VStack align="stretch" spacing={3}>
              <Box>
                <Text fontWeight="bold" fontSize="10px" color="gray.600" mb={1}>Advice / Remarks</Text>
                <Text fontSize="xs" color="gray.700" whiteSpace="pre-wrap">{plan.advice || "-"}</Text>
              </Box>
              <Box>
                <Text fontWeight="bold" fontSize="10px" color="gray.600" mb={1}>Follow-up Date</Text>
                <Text fontSize="xs" color="gray.700">{plan.follow_up_date || "-"}</Text>
              </Box>
            </VStack>
          </GridItem>
        </SimpleGrid>
      </Box>
      {renderLabReportsSection()}
    </VStack>
  );
};

export default EMRHistoryDisplay;
