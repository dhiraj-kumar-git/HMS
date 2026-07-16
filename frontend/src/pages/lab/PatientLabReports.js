import React, { useEffect, useState, useMemo } from "react";
import {
  Box, Flex, Text, Heading, Spinner, Button, IconButton, useToast,
  Table, Thead, Tbody, Tr, Th, Td, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, ModalFooter, useDisclosure,
  useColorModeValue, Input, InputGroup, InputLeftElement,
  HStack, Stack,
} from "@chakra-ui/react";
import { FiSearch, FiCalendar, FiRefreshCw, FiEye, FiMail, FiExternalLink } from "react-icons/fi";
import axios from "axios";
import BASE_URL from "../../utils/Config";
import "jspdf-autotable";
import { formatDateTimeIST, toTitleCase } from "../../utils/utils";

const PAGE_SIZE = 10;

export default function PatientLabReports() {
  const toast = useToast();
  const tableHeaderBg = useColorModeValue("gray.100", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");

  const [reports, setReports] = useState([]);
  const [configTests, setConfigTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [emailingId, setEmailingId] = useState(null);
  const [viewingFileKey, setViewingFileKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  const fetchReports = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/lab/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports(res.data);
    } catch {
      toast({ title: "Failed to load reports", status: "error", duration: 3000 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchConfigTests = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/dropdown/labtests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConfigTests(res.data || []);
    } catch (e) {
      console.error("Error fetching config tests:", e);
    }
  };

  useEffect(() => {
    fetchReports();
    fetchConfigTests();
  }, []); // eslint-disable-line

  const getTestParameters = (testName) => {
    if (!configTests || configTests.length === 0) return [];
    const cfg = configTests.find(
      (ct) => ct.test_name?.toLowerCase() === testName.toLowerCase() || ct.test_id === testName
    );
    if (!cfg) return [];

    const params = new Set();
    if (cfg.sub_tests) {
      cfg.sub_tests.forEach((st) => {
        params.add(st.name.toLowerCase());
        const subCfg = configTests.find((ct) => ct.test_name?.toLowerCase() === st.name.toLowerCase());
        const refRange = subCfg?.reference_range || st.reference_range || "";
        if (refRange.includes(",")) {
          refRange.split(",").forEach((ref) => {
            const label = ref.split(":")[0]?.trim();
            if (label) params.add(label.toLowerCase());
          });
        }
      });
    } else if (cfg.test_id?.toLowerCase().startsWith("group")) {
      const match = cfg.test_name?.match(/\(([^)]+)\)/);
      const legacyNames = match && match[1] ? match[1].split(",").map((s) => s.trim()) : [];
      legacyNames.forEach((ln) => {
        params.add(ln.toLowerCase());
        const subCfg = configTests.find((ct) => ct.test_name?.toLowerCase() === ln.toLowerCase());
        const refRange = subCfg?.reference_range || "";
        if (refRange.includes(",")) {
          refRange.split(",").forEach((ref) => {
            const label = ref.split(":")[0]?.trim();
            if (label) params.add(label.toLowerCase());
          });
        }
      });
    } else if (cfg.reference_range && cfg.reference_range.includes(",")) {
      cfg.reference_range.split(",").forEach((ref) => {
        const label = ref.split(":")[0]?.trim();
        if (label) params.add(label.toLowerCase());
      });
    } else {
      params.add(cfg.test_name?.toLowerCase());
    }

    return Array.from(params);
  };

  const visitRows = useMemo(() => {
    const rows = reports.flatMap((patient) =>
      (patient.appointments || [])
        .filter((appt) => (appt.lab_reports || []).length > 0)
        .map((appt) => {
          const labReports = appt.lab_reports || [];
          const timestamps = labReports.map((r) => r.timestamp).filter(Boolean).sort().reverse();
          return {
            patientName: patient.name,
            instituteId: patient.institute_id,
            age: patient.age,
            gender: patient.gender,
            email: patient.email,
            patientType: patient.patient_type,
            visitId: appt.visit_id,
            doctorName: appt.doctor_name,
            visitDate: appt.booked_at,
            labReports,
            totalReports: labReports.length,
            fileCount: labReports.filter((r) => !!r.s3_key).length,
            enteredCount: labReports.filter((r) => r.results && Object.keys(r.results).length > 0).length,
            testNames: labReports.map((r) => r.test_name).filter(Boolean),
            latestTimestamp: timestamps[0] || appt.booked_at || "",
          };
        })
    );
    rows.sort((a, b) => new Date(b.latestTimestamp) - new Date(a.latestTimestamp));
    return rows;
  }, [reports]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return visitRows.filter((row) => {
      const matchesSearch =
        !q ||
        row.patientName?.toLowerCase().includes(q) ||
        row.instituteId?.toLowerCase().includes(q) ||
        row.testNames.some((t) => t.toLowerCase().includes(q)) ||
        row.doctorName?.toLowerCase().includes(q);
      const rowDate = new Date(row.latestTimestamp);
      const matchesStart = !startDate || rowDate >= new Date(startDate);
      const matchesEnd = !endDate || rowDate <= new Date(endDate + "T23:59:59");
      return matchesSearch && matchesStart && matchesEnd;
    });
  }, [visitRows, searchQuery, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchQuery, startDate, endDate]);

  const openDetail = (row) => { setSelectedRow(row); onDetailOpen(); };

  const handleViewFile = async (s3Key) => {
    setViewingFileKey(s3Key);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${BASE_URL}/s3/view-url`, { s3_key: s3Key }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      window.open(res.data.url, "_blank");
    } catch {
      toast({ title: "Could not open file", status: "error", duration: 3000 });
    } finally {
      setViewingFileKey(null);
    }
  };

  const handleEmail = async (row) => {
    if (!row) return;
    const manualReports = row.labReports.filter((r) => r.results && Object.keys(r.results).length > 0);
    const fileReports = row.labReports.filter((r) => !!r.s3_key);
    if (!row.email) {
      toast({ title: "No email registered for this patient", status: "warning", duration: 3000 });
      return;
    }
    if (manualReports.length === 0 && fileReports.length > 0) {
      toast({
        title: "Cannot email uploaded report files",
        description: "For patient data security, uploaded report files cannot be shared via email. Please provide the patient with a physical copy.",
        status: "info",
        duration: 6000,
        isClosable: true,
      });
      return;
    }
    setEmailingId(row.visitId);
    try {
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
      doc.text(`Name         : ${toTitleCase(row.patientName)}`, 14, 40);
      doc.text(`Institute ID : ${row.instituteId}`, 14, 47);
      doc.text(`Age / Gender : ${row.age} yrs / ${row.gender}`, 14, 54);
      doc.text(`Doctor       : ${row.doctorName || "N/A"}`, 14, 61);
      doc.text(`Date         : ${formatDateTimeIST(row.latestTimestamp)}`, 14, 68);
      doc.line(14, 73, 196, 73);
      let y = 82;
      manualReports.forEach((report, rIdx) => {
        if (rIdx > 0) { doc.line(14, y, 196, y); y += 8; }
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

        const testParams = getTestParameters(report.test_name);
        const entries = Object.entries(report.results || {});
        const filteredEntries = testParams.length > 0
          ? entries.filter(([param]) => testParams.includes(param.toLowerCase()))
          : entries;

        filteredEntries.forEach(([param, val]) => {
          const value = typeof val === "object" ? String(val.value ?? "") : String(val);
          const ref = typeof val === "object" ? String(val.reference_range ?? "N/A") : "N/A";
          const units = typeof val === "object" ? String(val.units ?? "N/A") : "N/A";
          doc.text(param, 14, y);
          doc.text(value, 85, y);
          doc.text(ref, 120, y);
          doc.text(units, 176, y);
          y += 7;
          if (y > 270) { doc.addPage(); y = 20; }
        });
        if (report.remarks) {
          doc.setFont("helvetica", "italic");
          doc.text(`Remarks: ${report.remarks}`, 14, y);
          y += 8;
          doc.setFont("helvetica", "normal");
        }
        y += 4;
      });
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const formattedDate = new Date(row.latestTimestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      let bodyHtml = `<p>Dear ${toTitleCase(row.patientName)},</p><p>Please find attached your lab test results from your visit on <strong>${formattedDate}</strong>.</p><p>The attached PDF contains the following test results:</p><ul>${manualReports.map((r) => `<li>${r.test_name || "Lab Test"}</li>`).join("")}</ul>`;
      if (fileReports.length > 0) {
        bodyHtml += `<p><strong>Note:</strong> The following tests (${fileReports.map((r) => r.test_name).join(", ")}) have report files that cannot be shared electronically for security reasons. Please collect these reports in person from the Medical Centre.</p>`;
      }
      bodyHtml += `<p>Regards,<br><strong>BITS Pilani Medical Centre</strong></p>`;
      const token = localStorage.getItem("token");
      await axios.post(`${BASE_URL}/lab/send_email`, {
        recipient_email: row.email,
        subject: `Lab Reports - ${toTitleCase(row.patientName)} - ${formattedDate}`,
        body: bodyHtml,
        pdf_base64: pdfBase64,
        filename: `${row.patientName.replace(/\s+/g, "_")}_LabReport_${formattedDate}.pdf`,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast({ title: "Email sent successfully!", description: `Lab report PDF sent to ${row.email}`, status: "success", duration: 3000 });
    } catch (err) {
      toast({ title: "Failed to send email", description: err.response?.data?.error || err.message, status: "error", duration: 3000 });
    } finally {
      setEmailingId(null);
    }
  };

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="gray.50">
        <Spinner size="xl" color="blue.500" />
      </Flex>
    );
  }

  return (
    <Box px={{ base: 4, md: 8 }} py={6} bg="gray.50" minH="100vh">
      <Flex align="center" mb={6} justify="space-between" flexWrap="wrap" gap={3}>
        <Box>
          <Heading as="h2" size="md" color="gray.800">Patient Lab Reports History</Heading>
          <Text fontSize="xs" color="gray.500" mt={0.5}>Complete history of all completed lab visits, grouped by visit</Text>
        </Box>
        <IconButton icon={<FiRefreshCw />} aria-label="Refresh" variant="ghost" size="sm" onClick={fetchReports} isLoading={refreshing} />
      </Flex>

      <Box bg={cardBg} borderRadius="lg" boxShadow="md" p={{ base: 4, md: 6 }}>
        <Flex mb={5} gap={3} flexWrap="wrap" align="center" justify="space-between">
          <HStack spacing={3} flexWrap="wrap" width={{ base: "100%", md: "auto" }}>
            <InputGroup maxW="230px" size="sm">
              <InputLeftElement pointerEvents="none"><FiSearch color="gray" /></InputLeftElement>
              <Input placeholder="Search name, ID, test..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} bg="white" borderRadius="md" />
            </InputGroup>
            <HStack spacing={2} align="center">
              <InputGroup maxW="150px" size="sm">
                <InputLeftElement pointerEvents="none"><FiCalendar color="gray" /></InputLeftElement>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} bg="white" />
              </InputGroup>
              <Text fontSize="sm" color="gray.500">to</Text>
              <InputGroup maxW="150px" size="sm">
                <InputLeftElement pointerEvents="none"><FiCalendar color="gray" /></InputLeftElement>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} bg="white" />
              </InputGroup>
            </HStack>
          </HStack>
        </Flex>

        <Box overflowX="auto">
          <Table variant="simple" size="sm" fontSize="sm">
            <Thead bg={tableHeaderBg}>
            <Tr>
              <Th whiteSpace="nowrap">Date & Time</Th>
              <Th>Patient</Th>
              <Th>Doctor</Th>
              <Th>Tests Covered</Th>
              <Th textAlign="center">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pagedRows.length === 0 ? (
              <Tr>
                <Td colSpan={5} textAlign="center" py={10}>
                  <Text color="gray.400" fontSize="sm">No lab report history found.</Text>
                </Td>
              </Tr>
            ) : (
              pagedRows.map((row, i) => (
                <Tr key={`${row.visitId}-${i}`} _hover={{ bg: "gray.50" }}>
                  <Td whiteSpace="nowrap" fontSize="xs" color="gray.700">{formatDateTimeIST(row.latestTimestamp)}</Td>
                  <Td>
                    <Text fontWeight="semibold" color="blue.900" fontSize="sm">{toTitleCase(row.patientName)}</Text>
                    <Text fontSize="xs" color="gray.500">{row.instituteId} &middot; {row.age} yrs &middot; {row.gender}</Text>
                  </Td>
                  <Td fontSize="xs" color="gray.700">{row.doctorName || "—"}</Td>
                  <Td fontSize="xs" color="gray.700">
                    <Stack spacing={1} align="start">
                      {row.testNames.map((testName, idx) => (
                        <Text key={idx} fontWeight="medium">• {testName}</Text>
                      ))}
                    </Stack>
                  </Td>
                  <Td>
                    <HStack spacing={2} justify="center">
                      <Button size="xs" leftIcon={<FiEye />} colorScheme="gray" variant="outline" borderRadius="full" onClick={() => openDetail(row)}>View Details</Button>
                      <Button size="xs" leftIcon={<FiMail />} colorScheme="blue" borderRadius="full" onClick={() => handleEmail(row)} isLoading={emailingId === row.visitId} isDisabled={row.enteredCount === 0} title={row.enteredCount === 0 ? "Only file-upload reports - cannot email for patient data security" : `Email manually-entered results as PDF to ${row.email}`}>Email</Button>
                    </HStack>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
        </Box>
        <Flex justify="space-between" mt={4} align="center">
          <Text fontSize="sm" color="gray.500">Showing {pagedRows.length} of {filteredRows.length} visit{filteredRows.length !== 1 ? "s" : ""}</Text>
          <HStack>
            <IconButton aria-label="Previous page" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>} size="sm" variant="outline" isDisabled={page === 1} onClick={() => setPage((p) => p - 1)} />
            <Text fontSize="sm" color="gray.700" minW="90px" textAlign="center">Page {page} of {totalPages}</Text>
            <IconButton aria-label="Next page" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>} size="sm" variant="outline" isDisabled={page === totalPages} onClick={() => setPage((p) => p + 1)} />
          </HStack>
        </Flex>
      </Box>

      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="3xl" isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent borderRadius="2xl" overflow="hidden">
          <ModalHeader bg="blue.600" color="white" py={4}>
            <Text fontSize="md" fontWeight="bold">{toTitleCase(selectedRow?.patientName)}</Text>
            <Text fontSize="xs" fontWeight="normal" opacity={0.85} mt={0.5}>
              ID: {selectedRow?.instituteId} &middot; {selectedRow?.age} yrs &middot; {selectedRow?.gender}{selectedRow?.patientType ? ` \u00b7 ${selectedRow.patientType}` : ""}
            </Text>
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody bg="gray.50" p={5}>
            {selectedRow && (
              <Stack spacing={3}>
                <Box bg="white" p={3} borderRadius="md" border="1px solid" borderColor="gray.200" boxShadow="xs">
                  <Text fontSize="xs" color="gray.600">
                    <strong>Visit ID:</strong> {selectedRow.visitId}&nbsp;|&nbsp;<strong>Doctor:</strong> {selectedRow.doctorName || "N/A"}&nbsp;|&nbsp;<strong>Date:</strong> {formatDateTimeIST(selectedRow.latestTimestamp)}
                  </Text>
                </Box>
                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">
                  Lab Reports ({selectedRow.totalReports})
                </Text>
                <Stack spacing={2}>
                  {selectedRow.labReports.map((report, idx) => {
                    const isFile = !!report.s3_key;
                    return (
                      <Box key={idx} bg="white" p={3} borderRadius="md" border="1px solid" borderColor="gray.200" borderLeft={isFile ? "3px solid #38A169" : "3px solid #3182CE"} boxShadow="xs">
                        <Flex justify="space-between" align="center" mb={isFile ? 1.5 : 2}>
                          <Text fontWeight="bold" fontSize="xs" color="gray.800" maxW="65%" noOfLines={2}>{report.test_name || "Lab Test"}</Text>
                          <Flex align="center" gap={1.5} px={2.5} py={0.5} borderRadius="full" border="1px solid" borderColor={isFile ? "green.300" : "blue.300"} bg={isFile ? "green.50" : "blue.50"}>
                            <Box w={1.5} h={1.5} borderRadius="full" bg={isFile ? "#38A169" : "#3182CE"} flexShrink={0} />
                            <Text fontSize="2xs" fontWeight="semibold" color={isFile ? "green.700" : "blue.700"} whiteSpace="nowrap">{isFile ? "File Uploaded" : "Results Entered"}</Text>
                          </Flex>
                        </Flex>
                        {isFile ? (
                          <Flex align="center" justify="space-between" bg="gray.50" px={2} py={1} borderRadius="sm">
                            <Text fontSize="2xs" color="gray.600" isTruncated maxW="65%">📎 <strong>{report.file_name}</strong></Text>
                            <Button size="xs" colorScheme="blue" variant="ghost" fontSize="2xs" px={2} h={5} leftIcon={<FiExternalLink size={10} />} isLoading={viewingFileKey === report.s3_key} onClick={() => handleViewFile(report.s3_key)}>View File</Button>
                          </Flex>
                        ) : (
                          (() => {
                            const testParams = getTestParameters(report.test_name);
                            const entries = Object.entries(report.results || {});
                            const filteredEntries = testParams.length > 0
                              ? entries.filter(([param]) => testParams.includes(param.toLowerCase()))
                              : entries;

                            return (
                              <Table variant="simple" size="xs" mt={1}>
                                <Thead>
                                  <Tr>
                                    <Th fontSize="2xs" color="gray.500" py={1} px={1}>Parameter</Th>
                                    <Th fontSize="2xs" color="gray.500" py={1} px={1}>Value</Th>
                                    <Th fontSize="2xs" color="gray.500" py={1} px={1}>Reference</Th>
                                    <Th fontSize="2xs" color="gray.500" py={1} px={1}>Units</Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {filteredEntries.map(([param, val]) => {
                                    const value = typeof val === "object" ? (val.value ?? "—") : (val || "—");
                                    const ref = typeof val === "object" ? (val.reference_range ?? "N/A") : "N/A";
                                    const units = typeof val === "object" ? (val.units ?? "N/A") : "N/A";
                                    return (
                                      <Tr key={param}>
                                        <Td fontSize="2xs" py={0.5} px={1} color="gray.700">{param}</Td>
                                        <Td fontSize="2xs" py={0.5} px={1} fontWeight="bold" color="blue.700">{String(value)}</Td>
                                        <Td fontSize="2xs" py={0.5} px={1} color="gray.600">{String(ref)}</Td>
                                        <Td fontSize="2xs" py={0.5} px={1} color="gray.500">{String(units)}</Td>
                                      </Tr>
                                    );
                                  })}
                                </Tbody>
                              </Table>
                            );
                          })()
                        )}
                        {report.remarks && <Text mt={1} fontSize="2xs" color="gray.500" fontStyle="italic">Remarks: {report.remarks}</Text>}
                        {report.timestamp && <Text mt={0.5} fontSize="2xs" color="gray.400" textAlign="right">Saved: {formatDateTimeIST(report.timestamp)}</Text>}
                      </Box>
                    );
                  })}
                </Stack>
                {selectedRow.fileCount > 0 && selectedRow.enteredCount === 0 && (
                  <Box bg="orange.50" p={3} borderRadius="md" border="1px solid" borderColor="orange.200">
                    <Text fontSize="xs" color="orange.800">🔒 This visit only contains uploaded file reports. For patient data security, uploaded files cannot be shared via email. Please provide the patient with a physical copy.</Text>
                  </Box>
                )}
              </Stack>
            )}
          </ModalBody>
          <ModalFooter bg="gray.50" gap={3}>
            <Button onClick={onDetailClose} size="sm" variant="ghost">Close</Button>
            <Button colorScheme="blue" size="sm" leftIcon={<FiMail />} isDisabled={!selectedRow || selectedRow.enteredCount === 0} isLoading={emailingId === selectedRow?.visitId} onClick={() => { onDetailClose(); handleEmail(selectedRow); }} title={selectedRow?.enteredCount === 0 ? "No manually-entered results to email" : "Send manually-entered results as PDF"}>Email Results PDF</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
