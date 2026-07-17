import React, { useEffect, useState, useMemo } from "react";
import {
  Box, Flex, Text, Heading, Spinner, Button, IconButton, useToast,
  Table, Thead, Tbody, Tr, Th, Td, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, ModalFooter, useDisclosure,
  useColorModeValue, Input, InputGroup, InputLeftElement,
  HStack, VStack, Stack, Grid, GridItem, Badge,
} from "@chakra-ui/react";
import { FiSearch, FiRefreshCw, FiEye, FiMail, FiExternalLink } from "react-icons/fi";
import axios from "axios";
import BASE_URL from "../../utils/Config";
import "jspdf-autotable";
import { formatDateTimeIST, toTitleCase } from "../../utils/utils";

const PAGE_SIZE = 10;

export default function PatientLabReports() {
  const toast = useToast();
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

  const matchesParam = (param, testParams) => {
    if (!testParams || testParams.length === 0) return true;
    const paramLower = param.toLowerCase();
    if (testParams.includes(paramLower)) return true;
    if (param.includes(" - ")) {
      const parts = param.split(" - ");
      const prefix = parts[0].toLowerCase();
      const suffix = parts.slice(1).join(" - ").toLowerCase();
      return testParams.includes(prefix) && testParams.includes(suffix);
    }
    return false;
  };

  const cleanTestName = (name) => {
    if (!name) return "";
    const idx = name.indexOf("(");
    if (idx !== -1) {
      return name.substring(0, idx).trim();
    }
    return name.trim();
  };

  const formatDateTimeSplit = (timestamp) => {
    const formatted = formatDateTimeIST(timestamp);
    if (formatted.includes(", ")) {
      const parts = formatted.split(", ");
      return (
        <Box>
          <Text fontSize="xs" fontWeight="semibold" color="gray.700">{parts[0]}</Text>
          <Text fontSize="2xs" color="gray.500" mt={0.5}>{parts[1]}</Text>
        </Box>
      );
    }
    return <Text fontSize="xs" fontWeight="semibold" color="gray.700">{formatted}</Text>;
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
    return visitRows.filter((row) => {
      const matchesSearch =
        row.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.instituteId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (row.doctorName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.testNames.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && new Date(row.latestTimestamp) >= new Date(startDate + "T00:00:00");
      }
      if (endDate) {
        matchesDate = matchesDate && new Date(row.latestTimestamp) <= new Date(endDate + "T23:59:59");
      }
      return matchesSearch && matchesDate;
    });
  }, [visitRows, searchQuery, startDate, endDate]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  useEffect(() => { setPage(1); }, [searchQuery, startDate, endDate]);

  const openDetail = (row) => { setSelectedRow(row); onDetailOpen(); };

  const handleViewFile = async (s3Key) => {
    setViewingFileKey(s3Key);
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${BASE_URL}/s3/view-url`, { s3_key: s3Key }, { headers });
      if (res.data && res.data.url) {
        let targetUrl = res.data.url;
        if (targetUrl.includes("/s3/proxy-download")) {
          const path = targetUrl.substring(targetUrl.indexOf("/s3/proxy-download"));
          targetUrl = `${BASE_URL}${path}`;
        }
        const fileRes = await axios.get(targetUrl, {
          headers,
          responseType: "blob"
        });
        const fileUrl = URL.createObjectURL(fileRes.data);
        window.open(fileUrl, "_blank");
      }
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
          ? entries.filter(([param]) => matchesParam(param, testParams))
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

      let manualReportsListHtml = "";
      if (manualReports.length > 0) {
        manualReportsListHtml = `
        <div style="margin: 15px 0; background-color: #f7fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #3182ce;">
          <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #2b6cb0; font-family: sans-serif;">Included in Attached PDF</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #4a5568; line-height: 1.5; font-family: sans-serif;">
            ${manualReports.map((r) => `<li><strong>${cleanTestName(r.test_name)}</strong></li>`).join("")}
          </ul>
        </div>`;
      }

      let fileReportsListHtml = "";
      if (fileReports.length > 0) {
        fileReportsListHtml = `
        <div style="margin: 15px 0; background-color: #fffaf0; padding: 15px; border-radius: 6px; border-left: 4px solid #dd6b20;">
          <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #dd6b20; font-family: sans-serif;">Physical Reports Pending Collection</h3>
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #4a5568; line-height: 1.4; font-family: sans-serif;">The following reports contain files/scans that cannot be shared electronically for security and privacy reasons. Please collect them in person from the Medical Centre:</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #4a5568; line-height: 1.5; font-family: sans-serif;">
            ${fileReports.map((r) => `<li><strong>${cleanTestName(r.test_name)}</strong></li>`).join("")}
          </ul>
        </div>`;
      }

      const bodyHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #2d3748;">
        <div style="background-color: #3182ce; padding: 15px; border-radius: 6px 6px 0 0; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 18px; font-family: sans-serif;">BITS Pilani Medical Centre</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9; font-family: sans-serif;">Lab Test Report Delivery</p>
        </div>
        <div style="padding: 20px; line-height: 1.6;">
          <p style="font-size: 14px; margin-top: 0; font-family: sans-serif;">Dear <strong>${toTitleCase(row.patientName)}</strong>,</p>
          <p style="font-size: 14px; font-family: sans-serif;">Please find attached your lab test results from your visit on <strong>${formattedDate}</strong>.</p>
          
          ${manualReportsListHtml}
          ${fileReportsListHtml}
          
          <p style="font-size: 14px; margin-top: 25px; font-family: sans-serif;">Regards,<br><strong>BITS Pilani Medical Centre</strong></p>
          <p style="font-size: 11px; color: #a0aec0; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 15px; font-family: sans-serif; text-align: center;">
            This is an automated email. Please do not reply directly to this message.
          </p>
        </div>
      </div>`;
      const token = localStorage.getItem("token");
      await axios.post(`${BASE_URL}/lab/send_email`, {
        recipient_email: row.email,
        subject: `Lab Reports - ${toTitleCase(row.patientName)} - ${formattedDate}`,
        body: bodyHtml,
        pdf_base64: pdfBase64,
        filename: `${row.patientName.replace(/\s+/g, "_")}_LabReport_${formattedDate}.pdf`,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast({ title: "Email sent successfully", status: "success", duration: 3000 });
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to send email", status: "error", duration: 3000 });
    } finally {
      setEmailingId(null);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" h="100vh">
        <Spinner size="xl" color="blue.500" thickness="4px" />
      </Flex>
    );
  }

  return (
    <Box p={6} maxW="1600px" mx="auto" w="100%">
      <Flex justify="space-between" align="center" mb={6}>
        <Box>
          <Heading size="lg" color="blue.900" fontWeight="bold">Patient Lab Reports History</Heading>
          <Text fontSize="sm" color="gray.500" mt={1}>Complete history of all completed lab visits, grouped by visit</Text>
        </Box>
        <IconButton
          aria-label="Refresh"
          icon={<FiRefreshCw className={refreshing ? "spin-animation" : ""} />}
          onClick={fetchReports}
          isLoading={refreshing}
          variant="outline"
          borderRadius="full"
          colorScheme="blue"
        />
      </Flex>

      <Box bg={cardBg} borderRadius="2xl" boxShadow="md" border="1px solid" borderColor="gray.200" p={6}>
        <Flex direction={{ base: "column", lg: "row" }} justify="space-between" gap={4} mb={6} align={{ base: "stretch", lg: "center" }}>
          <InputGroup maxW={{ base: "100%", lg: "380px" }}>
            <InputLeftElement pointerEvents="none">
              <FiSearch color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search patient, ID, test, or doctor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              bg="gray.50"
              borderRadius="xl"
              border="1px solid"
              borderColor="gray.200"
              _focus={{ borderColor: "blue.400", bg: "white" }}
            />
          </InputGroup>
          <Flex
            direction={{ base: "column", sm: "row" }}
            align={{ base: "stretch", sm: "center" }}
            gap={3}
            wrap="wrap"
          >
            <HStack spacing={2} align="center" justify="space-between">
              <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" whiteSpace="nowrap">Filter Date:</Text>
              <HStack spacing={2} align="center">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  w="140px"
                  bg="gray.50"
                  borderRadius="xl"
                  border="1px solid"
                  borderColor="gray.200"
                  size="sm"
                />
                <Text fontSize="xs" color="gray.400">to</Text>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  w="140px"
                  bg="gray.50"
                  borderRadius="xl"
                  border="1px solid"
                  borderColor="gray.200"
                  size="sm"
                />
              </HStack>
            </HStack>
            {(startDate || endDate || searchQuery) && (
              <Button size="xs" colorScheme="gray" variant="ghost" onClick={() => { setStartDate(""); setEndDate(""); setSearchQuery(""); }} alignSelf={{ base: "flex-end", sm: "center" }}>
                Clear Filters
              </Button>
            )}
          </Flex>
        </Flex>

        <Box borderRadius="xl" border="1px solid" borderColor="gray.200" overflowX="auto" boxShadow="xs" bg="white" mb={4}>
          <Table variant="simple" size="md" minW="900px">
            <Thead bg="gray.50">
              <Tr>
                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="12%">Date & Time</Th>
                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="18%">Patient</Th>
                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="15%">Institute ID</Th>
                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="15%">Doctor</Th>
                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="27%">Tests Covered</Th>
                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="13%" textAlign="center">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedRows.length === 0 ? (
                <Tr>
                  <Td colSpan={6} textAlign="center" py={12}>
                    <Text color="gray.400" fontSize="sm" fontWeight="medium">No lab report history found matching criteria.</Text>
                  </Td>
                </Tr>
              ) : (
                pagedRows.map((row, i) => (
                  <Tr key={`${row.visitId}-${i}`} _hover={{ bg: "blue.50/20" }} transition="background-color 0.15s">
                    <Td py={3}>{formatDateTimeSplit(row.latestTimestamp)}</Td>
                    <Td py={3}>
                      <Text fontWeight="bold" color="blue.900" fontSize="sm">{toTitleCase(row.patientName)}</Text>
                      <Text fontSize="2xs" color="gray.500" mt={0.5}>{row.age} yrs &middot; {row.gender}</Text>
                    </Td>
                    <Td py={3} fontSize="xs" fontWeight="semibold" color="gray.700">
                      {row.instituteId}
                    </Td>
                    <Td py={3} fontSize="xs" color="gray.700" fontWeight="medium"> {row.doctorName || "—"}</Td>
                    <Td py={3}>
                      <Flex wrap="wrap" gap={1.5} py={1}>
                        {row.testNames.map((testName, idx) => (
                          <Badge key={idx} colorScheme="blue" variant="subtle" fontSize="2xs" px={2} py={0.5} borderRadius="md">
                            {cleanTestName(testName)}
                          </Badge>
                        ))}
                      </Flex>
                    </Td>
                    <Td py={3}>
                      <VStack spacing={1.5} align="center" justify="center" w="100%">
                        <Button size="xs" leftIcon={<FiEye />} colorScheme="blue" variant="outline" borderRadius="lg" w="max-content" onClick={() => openDetail(row)}>View Details</Button>
                        <Button size="xs" leftIcon={<FiMail />} colorScheme="blue" borderRadius="lg" w="max-content" onClick={() => handleEmail(row)} isLoading={emailingId === row.visitId} isDisabled={row.enteredCount === 0} title={row.enteredCount === 0 ? "Only file-upload reports - cannot email for patient data security" : `Email manually-entered results as PDF to ${row.email}`}>Email</Button>
                      </VStack>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </Box>

        <Flex justify="space-between" mt={4} align="center">
          <Text fontSize="xs" fontWeight="bold" color="gray.500">Showing {pagedRows.length} of {filteredRows.length} visit{filteredRows.length !== 1 ? "s" : ""}</Text>
          <HStack>
            <IconButton aria-label="Previous page" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>} size="sm" variant="outline" borderRadius="md" isDisabled={page === 1} onClick={() => setPage((p) => p - 1)} />
            <Text fontSize="xs" fontWeight="bold" color="gray.700" minW="90px" textAlign="center">Page {page} of {totalPages}</Text>
            <IconButton aria-label="Next page" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>} size="sm" variant="outline" borderRadius="md" isDisabled={page === totalPages} onClick={() => setPage((p) => p + 1)} />
          </HStack>
        </Flex>
      </Box>

      {/* DETAIL VIEW MODAL */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="4xl" isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(6px)" />
        <ModalContent borderRadius="2xl" overflow="hidden" boxShadow="2xl">
          <ModalHeader bg="blue.600" color="white" py={5} px={6}>
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="lg" fontWeight="bold">{toTitleCase(selectedRow?.patientName)}</Text>
                <Text fontSize="xs" fontWeight="medium" opacity={0.9} mt={0.5}>
                  Institute ID: {selectedRow?.instituteId} &middot; {selectedRow?.age} yrs &middot; {selectedRow?.gender}{selectedRow?.patientType ? ` \u00b7 ${toTitleCase(selectedRow.patientType)}` : ""}
                </Text>
              </Box>
            </Flex>
          </ModalHeader>
          <ModalCloseButton color="white" top="20px" right="20px" />

          <ModalBody bg="gray.50" p={6}>
            {selectedRow && (
              <Grid templateColumns={{ base: "1fr", md: "280px 1fr" }} gap={6} alignItems="start">
                {/* Left Column: Demographics & Visit Meta */}
                <GridItem>
                  <Stack spacing={4}>
                    <Box bg="white" p={4} borderRadius="xl" border="1px solid" borderColor="gray.200" boxShadow="xs">
                      <Heading size="xs" color="blue.800" mb={3.5} textTransform="uppercase" letterSpacing="wider" fontWeight="bold">Visit Summary</Heading>
                      <Stack spacing={3}>
                        <Box>
                          <Text fontSize="2xs" color="gray.400" fontWeight="bold" textTransform="uppercase">Attending Physician</Text>
                          <Text fontSize="xs" fontWeight="semibold" color="gray.700"> {selectedRow.doctorName || "N/A"}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="2xs" color="gray.400" fontWeight="bold" textTransform="uppercase">Completed Date</Text>
                          <Text fontSize="xs" fontWeight="semibold" color="gray.700">{formatDateTimeIST(selectedRow.latestTimestamp)}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="2xs" color="gray.400" fontWeight="bold" textTransform="uppercase">Report Breakdown</Text>
                          <HStack mt={1} spacing={1.5}>
                            <Badge colorScheme="blue" fontSize="2xs" px={2} py={0.5} borderRadius="md">{selectedRow.enteredCount} Entered</Badge>
                            <Badge colorScheme="green" fontSize="2xs" px={2} py={0.5} borderRadius="md">{selectedRow.fileCount} File{selectedRow.fileCount !== 1 ? "s" : ""}</Badge>
                          </HStack>
                        </Box>
                      </Stack>
                    </Box>
                  </Stack>
                </GridItem>

                {/* Right Column: Dynamic Reports List */}
                <GridItem>
                  <Stack spacing={4}>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500" textTransform="uppercase" letterSpacing="wider">
                      Detailed Test Results
                    </Text>
                    <Stack spacing={4}>
                      {selectedRow.labReports.map((report, idx) => {
                        const isFile = !!report.s3_key;
                        return (
                          <Box
                            key={idx}
                            bg="white"
                            p={4}
                            borderRadius="xl"
                            border="1px solid"
                            borderColor="gray.200"
                            borderLeft={isFile ? "4px solid #48BB78" : "4px solid #3182CE"}
                            boxShadow="xs"
                          >
                            <Flex justify="space-between" align="center" mb={3}>
                              <Text fontWeight="bold" fontSize="sm" color="blue.900">
                                {cleanTestName(report.test_name)}
                              </Text>
                              <Flex
                                align="center"
                                gap={1.5}
                                px={2.5}
                                py={0.5}
                                borderRadius="full"
                                border="1px solid"
                                borderColor={isFile ? "green.200" : "blue.200"}
                                bg={isFile ? "green.50" : "blue.50"}
                              >
                                <Box w={1.5} h={1.5} borderRadius="full" bg={isFile ? "#48BB78" : "#3182CE"} flexShrink={0} />
                                <Text fontSize="2xs" fontWeight="bold" color={isFile ? "green.700" : "blue.700"} whiteSpace="nowrap">
                                  {isFile ? "File Uploaded" : "Results Entered"}
                                </Text>
                              </Flex>
                            </Flex>

                            {isFile ? (
                              <Flex align="center" justify="space-between" bg="gray.50" px={3} py={2} borderRadius="xl" border="1px solid" borderColor="gray.100">
                                <Text fontSize="xs" color="gray.600" isTruncated maxW="70%">
                                  📎 <strong>{report.file_name}</strong>
                                </Text>
                                <Button
                                  size="xs"
                                  colorScheme="blue"
                                  variant="solid"
                                  borderRadius="md"
                                  leftIcon={<FiExternalLink size={12} />}
                                  isLoading={viewingFileKey === report.s3_key}
                                  onClick={() => handleViewFile(report.s3_key)}
                                >
                                  View Scan
                                </Button>
                              </Flex>
                            ) : (
                              (() => {
                                const testParams = getTestParameters(report.test_name);
                                const entries = Object.entries(report.results || {});
                                const filteredEntries = testParams.length > 0
                                  ? entries.filter(([param]) => matchesParam(param, testParams))
                                  : entries;

                                return (
                                  <Box borderRadius="xl" border="1px solid" borderColor="gray.200" overflow="hidden" mt={1}>
                                    <Table variant="simple" size="sm">
                                      <Thead bg="gray.50">
                                        <Tr>
                                          <Th fontSize="2xs" color="gray.600" py={2} px={3} textTransform="uppercase" fontWeight="bold">Parameter</Th>
                                          <Th fontSize="2xs" color="gray.600" py={2} px={3} textTransform="uppercase" fontWeight="bold">Value</Th>
                                          <Th fontSize="2xs" color="gray.600" py={2} px={3} textTransform="uppercase" fontWeight="bold">Reference Range</Th>
                                          <Th fontSize="2xs" color="gray.600" py={2} px={3} textTransform="uppercase" fontWeight="bold">Units</Th>
                                        </Tr>
                                      </Thead>
                                      <Tbody>
                                        {filteredEntries.map(([param, val]) => {
                                          const value = typeof val === "object" ? (val.value ?? "—") : (val || "—");
                                          const ref = typeof val === "object" ? (val.reference_range ?? "N/A") : "N/A";
                                          const units = typeof val === "object" ? (val.units ?? "N/A") : "N/A";
                                          return (
                                            <Tr key={param} _hover={{ bg: "gray.50" }}>
                                              <Td fontSize="xs" py={2} px={3} color="gray.850" fontWeight="medium">{param}</Td>
                                              <Td fontSize="xs" py={2} px={3} fontWeight="bold" color="blue.600">{String(value)}</Td>
                                              <Td fontSize="xs" py={2} px={3} color="gray.600">{String(ref)}</Td>
                                              <Td fontSize="xs" py={2} px={3} color="gray.500">{String(units)}</Td>
                                            </Tr>
                                          );
                                        })}
                                      </Tbody>
                                    </Table>
                                  </Box>
                                );
                              })()
                            )}
                            {report.remarks && (
                              <Box mt={2.5} p={2.5} bg="gray.50" borderRadius="md" borderLeft="2px solid" borderColor="gray.300">
                                <Text fontSize="xs" color="gray.600" fontStyle="italic"><strong>Remarks:</strong> {report.remarks}</Text>
                              </Box>
                            )}
                            {report.timestamp && (
                              <Text mt={2} fontSize="2xs" color="gray.400" textAlign="right">
                                Saved: {formatDateTimeIST(report.timestamp)}
                              </Text>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                    {selectedRow.fileCount > 0 && selectedRow.enteredCount === 0 && (
                      <Box bg="orange.50" p={3.5} borderRadius="xl" border="1px solid" borderColor="orange.200">
                        <Text fontSize="xs" color="orange.800" fontWeight="medium">
                          🔒 This visit only contains uploaded scan files. For patient security, scans cannot be shared via email. Please provide the patient with a printed/physical copy.
                        </Text>
                      </Box>
                    )}
                  </Stack>
                </GridItem>
              </Grid>
            )}
          </ModalBody>
          <ModalFooter bg="gray.50" gap={3} py={4} px={6} borderTop="1px solid" borderColor="gray.200">
            <Button onClick={onDetailClose} size="sm" variant="outline" borderRadius="xl">Close</Button>
            <Button colorScheme="blue" size="sm" borderRadius="xl" leftIcon={<FiMail />} isDisabled={!selectedRow || selectedRow.enteredCount === 0} isLoading={emailingId === selectedRow?.visitId} onClick={() => { onDetailClose(); handleEmail(selectedRow); }} title={selectedRow?.enteredCount === 0 ? "No manually-entered results to email" : "Send manually-entered results as PDF"}>Email Results PDF</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
