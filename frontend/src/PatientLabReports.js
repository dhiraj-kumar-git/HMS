import React, { useEffect, useState } from "react";
import {
  Box,
  Flex,
  Text,
  Heading,
  Spinner,
  Avatar,
  Button,
  IconButton,
  useToast,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  useBreakpointValue,
} from "@chakra-ui/react";
import { FiMail, FiCopy, FiRefreshCw, FiEye } from "react-icons/fi";
import axios from "axios";

export default function PatientLabReports() {
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  const {
    isOpen: isViewOpen,
    onOpen: onViewOpen,
    onClose: onViewClose,
  } = useDisclosure();

  const fetchReports = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("https://hms-backend-18lk.onrender.com/lab/reports", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports(res.data);
    } catch (err) {
      toast({
        title: "Failed to load reports",
        status: "error",
        duration: 3000,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  // Auto-refresh when new reports are saved
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === "refreshReports" && event.newValue === "true") {
        fetchReports();
        localStorage.setItem("refreshReports", "false");
        toast({
          title: "New report added",
          description: "Patient Lab Reports have been updated.",
          status: "info",
          duration: 2500,
        });
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleEmail = async (patient) => {
    const latest = patient.lab_reports[patient.lab_reports.length - 1];
    if (!latest) {
      toast({
        title: "No report found",
        description: "This patient has no saved lab reports.",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("BITS Pilani Medical Centre", 105, 20, { align: "center" });
      doc.setFontSize(12);
      doc.text("Lab Test Report", 105, 28, { align: "center" });

      // Patient Info
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Name: ${patient.name}`, 14, 40);
      doc.text(`PSR No.: ${patient.psr_no}`, 14, 46);
      doc.text(`Age / Gender: ${patient.age} / ${patient.gender}`, 14, 52);
      doc.text(
        `Date: ${new Date(latest.timestamp).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        14,
        58
      );

      // Table header
      let y = 70;
      doc.setFont("helvetica", "bold");
      doc.text("Parameter", 14, y);
      doc.text("Result", 90, y);
      doc.text("Reference Range", 150, y);
      doc.line(14, y + 2, 200, y + 2);

      // Table data
      y += 8;
      doc.setFont("helvetica", "normal");
      Object.entries(latest.results || {}).forEach(([param, val]) => {
        const resultValue = typeof val === "object" ? val.value || val : val;
        const refRange =
          typeof val === "object" && val.reference_range
            ? val.reference_range
            : "N/A";

        doc.text(param, 14, y);
        doc.text(String(resultValue), 90, y);
        doc.text(refRange, 150, y);
        y += 7;

        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });

      // Remarks
      doc.line(14, y, 200, y);
      doc.text(`Remarks: ${latest.remarks || "None"}`, 14, y + 10);

      // Convert to Base64
      const pdfBase64 = doc.output("datauristring").split(",")[1];

      const token = localStorage.getItem("token");

      await axios.post(
        "https://hms-backend-18lk.onrender.com/lab/send_email",
        {
          recipient_email: patient.email,
          subject: `Lab Report for ${patient.name} - ${latest.test_name}`,
          body: `Dear ${patient.name},\n\nPlease find attached your latest lab test report.\n\nRegards,\nBITS Pilani Medical Centre`,
          pdf_base64: pdfBase64,
          filename: `${patient.name}_LabReport.pdf`,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: "Email sent successfully!",
        description: `Report PDF sent to ${patient.email}`,
        status: "success",
        duration: 3000,
      });
    } catch (err) {
      console.error("Error emailing report:", err);
      toast({
        title: "Failed to send email",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
      });
    }
  };

  const openViewModal = (patient) => {
    setSelectedPatient(patient);
    onViewOpen();
  };

  const compactFont = useBreakpointValue({ base: "xs", md: "sm" });
  const compactPadding = useBreakpointValue({ base: "2", md: "3" });

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="gray.50">
        <Spinner size="xl" color="blue.500" />
      </Flex>
    );
  }

  return (
    <Box px={{ base: 4, md: 8 }} py={6} bg="gray.50" minH="100vh">
      <Flex align="center" mb={6} justify="space-between" flexWrap="wrap">
        <Heading as="h2" size="md" color="gray.800" mb={{ base: 2, md: 0 }}>
          Patient Lab Reports
        </Heading>
        <IconButton
          icon={<FiRefreshCw />}
          aria-label="Refresh"
          variant="ghost"
          size="sm"
          onClick={fetchReports}
          isLoading={refreshing}
        />
      </Flex>

      <Box
        bg="white"
        borderRadius="lg"
        boxShadow="sm"
        overflowX="auto"
        py={2}
        px={1}
      >
        <Flex
          px={3}
          py={2}
          fontSize={compactFont}
          fontWeight="semibold"
          color="gray.600"
          borderBottom="1px solid"
          borderColor="gray.200"
          minW="720px"
        >
          <Box flex="1.5">Name</Box>
          <Box flex="1.3">PSR No.</Box>
          <Box flex="0.7" textAlign="center">
            Age
          </Box>
          <Box flex="0.9" textAlign="center">
            Gender
          </Box>
          <Box flex="1.5">Test Name</Box>
          <Box flex="1.5">Last Updated</Box>
          <Box flex="1.2" textAlign="center">
            Action
          </Box>
        </Flex>

        {reports.length === 0 ? (
          <Flex h="100px" align="center" justify="center">
            <Text color="gray.500" fontSize="sm">
              No lab reports available yet.
            </Text>
          </Flex>
        ) : (
          reports.map((patient, i) => {
            const last = patient.lab_reports[patient.lab_reports.length - 1];
            return (
              <Flex
                key={i}
                align="center"
                px={3}
                py={compactPadding}
                fontSize={compactFont}
                borderBottom="1px solid"
                borderColor="gray.100"
                minW="720px"
                _hover={{
                  bg: "gray.50",
                  boxShadow: "sm",
                  borderColor: "blue.200",
                }}
              >
                <Box flex="1.5" display="flex" alignItems="center" gap="2">
                  <Avatar
                    size="sm"
                    name={patient.name}
                    bg="blue.100"
                    color="blue.800"
                  />
                  <Text fontWeight="medium">{patient.name}</Text>
                </Box>

                <Box flex="1.3" display="flex" alignItems="center">
                  <Text>{patient.psr_no}</Text>
                  <IconButton
                    aria-label="Copy PSR"
                    icon={<FiCopy size={12} />}
                    size="xs"
                    ml="1"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(patient.psr_no);
                      toast({
                        title: "Copied PSR No.",
                        status: "success",
                        duration: 1000,
                      });
                    }}
                  />
                </Box>

                <Box flex="0.7" textAlign="center">
                  {patient.age}
                </Box>
                <Box flex="0.9" textAlign="center">
                  {patient.gender}
                </Box>

                <Box flex="1.5" fontWeight="semibold" color="blue.700">
                  {last?.test_name || "—"}
                </Box>

                <Box flex="1.5">
                  {last?.timestamp
                    ? new Date(last.timestamp).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "N/A"}
                </Box>

                <Box
                  flex="1.2"
                  display="flex"
                  justifyContent="center"
                  gap={{ base: 1, md: 2 }}
                  flexWrap="wrap"
                >
                  <Button
                    leftIcon={<FiEye />}
                    size="sm"
                    variant="outline"
                    colorScheme="gray"
                    borderRadius="full"
                    px={3}
                    onClick={() => openViewModal(patient)}
                  >
                    View Report
                  </Button>
                  <Button
                    colorScheme="blue"
                    size="sm"
                    leftIcon={<FiMail />}
                    borderRadius="full"
                    px={3}
                    onClick={() => handleEmail(patient)}
                  >
                    Email
                  </Button>
                </Box>
              </Flex>
            );
          })
        )}
      </Box>

      {/* ─── View Report Modal ─── */}
      <Modal isOpen={isViewOpen} onClose={onViewClose} size="3xl" isCentered>
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent borderRadius="2xl" overflow="hidden">
          <ModalHeader bg="blue.600" color="white">
            {selectedPatient?.name} (PSR: {selectedPatient?.psr_no})
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody bg="gray.50" p={6}>
            {selectedPatient ? (
              (() => {
                const latestReport =
                  selectedPatient.lab_reports[
                    selectedPatient.lab_reports.length - 1
                  ];

                if (!latestReport) {
                  return <Text>No reports available</Text>;
                }

                return (
                  <Box bg="white" borderRadius="lg" boxShadow="md" p={4} mb={4}>
                    <Text
                      fontWeight="bold"
                      fontSize="md"
                      color="blue.700"
                      mb={3}
                    >
                      {latestReport.test_name}
                    </Text>
                    <Table variant="simple" size="sm">
                      <Thead bg="gray.100">
                        <Tr>
                          <Th>Parameter</Th>
                          <Th>Result</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {Object.entries(latestReport.results || {}).map(
                          ([key, value]) => (
                            <Tr key={key}>
                              <Td>{key}</Td>
                              <Td>{value || "—"}</Td>
                            </Tr>
                          )
                        )}
                      </Tbody>
                    </Table>
                    <Text mt={3} fontSize="sm" color="gray.600">
                      <strong>Remarks:</strong> {latestReport.remarks || "None"}
                    </Text>
                    <Text
                      mt={1}
                      fontSize="xs"
                      color="gray.500"
                      textAlign="right"
                    >
                      Saved on:{" "}
                      {new Date(latestReport.timestamp).toLocaleString(
                        "en-IN",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </Text>
                  </Box>
                );
              })()
            ) : (
              <Text>No reports available</Text>
            )}
          </ModalBody>

          <ModalFooter bg="gray.50">
            <Button onClick={onViewClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
