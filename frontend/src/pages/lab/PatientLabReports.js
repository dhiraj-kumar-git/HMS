import React, { useEffect, useState } from "react";
import {
 Box,
 Flex,
 Text,
 Heading,
 Spinner,
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
 useColorModeValue,
} from "@chakra-ui/react";
import { FiMail, FiCopy, FiRefreshCw, FiEye } from "react-icons/fi";
import axios from "axios";
import BASE_URL from '../../utils/Config';
import 'jspdf-autotable';
import { formatDateTimeIST, toTitleCase } from '../../utils/utils';

export default function PatientLabReports() {
 const toast = useToast();
 const tableHeaderBg = useColorModeValue('gray.100', 'gray.700');
 const [reports, setReports] = useState([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [selectedPatient, setSelectedPatient] = useState(null);
 const [emailingPatientId, setEmailingPatientId] = useState(null);

 const {
  isOpen: isViewOpen,
  onOpen: onViewOpen,
  onClose: onViewClose,
 } = useDisclosure();

 const fetchReports = async () => {
  setRefreshing(true);
  try {
   const token = localStorage.getItem("token");
   const res = await axios.get(`${BASE_URL}/lab/reports`, {
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

  setEmailingPatientId(patient.institute_id);
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
   doc.text(`Name: ${toTitleCase(patient.name)}`, 14, 40);
   doc.text(`Institute ID: ${patient.institute_id}`, 14, 46);
   doc.text(`Age / Gender: ${patient.age} / ${patient.gender}`, 14, 52);
   doc.text(
    `Date: ${formatDateTimeIST(latest.timestamp)}`,
    14,
    58
   );

   // Table header
   let y = 70;
   doc.setFont("helvetica", "bold");
   doc.text("Parameter", 14, y);
   doc.text("Result", 90, y);
   doc.text("Ref Range", 130, y);
   doc.text("Units", 180, y);
   doc.line(14, y + 2, 200, y + 2);

   // Table data
   y += 8;
   doc.setFont("helvetica", "normal");
   Object.entries(latest.results || {}).forEach(([param, val]) => {
    // Handle both old string format and new object format
    const resultValue = typeof val === "object" ? (val.value ?? "") : val;
    const refRange = typeof val === "object" ? (val.reference_range ?? "N/A") : "N/A";
    const units = typeof val === "object" ? (val.units ?? "N/A") : "N/A";

    doc.text(param, 14, y);
    doc.text(String(resultValue), 90, y);
    doc.text(String(refRange), 130, y);
    doc.text(String(units), 180, y);
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

   await axios.post(`${BASE_URL}/lab/send_email`, { recipient_email: patient.email, subject: `Lab Report for ${toTitleCase(patient.name)} - ${latest.test_name}`, body: `Dear ${toTitleCase(patient.name)},\n\nPlease find attached your latest lab test report.\n\nRegards,\nBITS Pilani Medical Centre`, pdf_base64: pdfBase64, filename: `${patient.name}_LabReport.pdf` }, { headers: { Authorization: `Bearer ${token}` } });

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
  } finally {
   setEmailingPatientId(null);
  }
 };

 const openViewModal = (patient) => {
  setSelectedPatient(patient);
  onViewOpen();
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
     boxShadow="md"
     overflowX="auto"
     p={{ base: 4, md: 6 }}
    >
     <Table variant="simple" size="sm" fontSize="sm">
      <Thead bg={tableHeaderBg}>
       <Tr>
        <Th>Institute ID</Th>
        <Th>Patient Details</Th>
        <Th>Test Name</Th>
        <Th>Last Updated</Th>
        <Th textAlign="center">Action</Th>
       </Tr>
      </Thead>
      <Tbody>
       {reports.length === 0 ? (
        <Tr>
         <Td colSpan={5} textAlign="center" py={6}>
          <Text color="gray.500" fontSize="sm">
           No lab reports available yet.
          </Text>
         </Td>
        </Tr>
       ) : (
        reports.map((patient, i) => {
         const last = patient.lab_reports[patient.lab_reports.length - 1];
         return (
          <Tr key={i} _hover={{ bg: "gray.50" }}>
           <Td fontWeight="medium">
            <Flex align="center" gap={1}>
             <Text>{patient.institute_id}</Text>
             <IconButton
              aria-label="Copy ID"
              icon={<FiCopy size={12} />}
              size="xs"
              variant="ghost"
              onClick={() => {
               navigator.clipboard.writeText(patient.institute_id);
               toast({
                title: "Copied Institute ID",
                status: "success",
                duration: 1000,
               });
              }}
             />
            </Flex>
           </Td>
           <Td>
            <Box>
             <Text fontWeight="semibold" color="blue.900">
              {toTitleCase(patient.name)}
             </Text>
             <Text fontSize="xs" color="gray.500">
              {patient.age} yrs • {patient.gender}
             </Text>
            </Box>
           </Td>
           <Td fontWeight="semibold" color="blue.700">
            {last?.test_name || "—"}
           </Td>
           <Td>
            {last?.timestamp
             ? formatDateTimeIST(last.timestamp)
             : "N/A"}
           </Td>
           <Td>
            <Flex justify="center" gap={2}>
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
              isLoading={emailingPatientId === patient.institute_id}
             >
              Email
             </Button>
            </Flex>
           </Td>
          </Tr>
         );
        })
       )}
      </Tbody>
     </Table>
   </Box>

   {/* ─── View Report Modal ─── */}
   <Modal isOpen={isViewOpen} onClose={onViewClose} size="3xl" isCentered>
    <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
    <ModalContent borderRadius="2xl" overflow="hidden">
     <ModalHeader bg="blue.600" color="white">
      {toTitleCase(selectedPatient?.name)} (ID: {selectedPatient?.institute_id})
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
             <Th>Ref Range</Th>
             <Th>Units</Th>
            </Tr>
           </Thead>
           <Tbody>
            {Object.entries(latestReport.results || {}).map(
             ([key, val]) => {
              const resultValue = typeof val === "object" ? (val.value ?? "") : val;
              return (
               <Tr key={key}>
                <Td>{key}</Td>
                <Td fontWeight="bold">{resultValue || "—"}</Td>
                <Td fontSize="xs" color="gray.500">
                 {typeof val === "object" ? val.reference_range : "N/A"}
                </Td>
                <Td fontSize="xs" color="gray.500">
                 {typeof val === "object" ? val.units : "N/A"}
                </Td>
               </Tr>
              );
             }
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
           {formatDateTimeIST(latestReport.timestamp)}
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
