import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Heading,
  Flex,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  HStack,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Progress,
  Badge,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  useDisclosure,
  Icon,
  VStack,
  Divider,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
} from '@chakra-ui/react';
import { FiSearch, FiRefreshCw, FiTrash2, FiChevronDown, FiChevronUp, FiActivity, FiUploadCloud, FiFileText, FiDownload, FiAlertCircle, FiFile, FiHelpCircle, FiInfo, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import StatusGuideModal from '../../components/StatusGuideModal';
import { formatDateTimeIST, toTitleCase } from '../../utils/utils';

export default function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const toast = useToast();
  const { isOpen, onOpen, onClose: closeModal } = useDisclosure();
  const { isOpen: isGuideOpen, onOpen: onGuideOpen, onClose: onGuideClose } = useDisclosure();
  const fileInputRef = useRef(null);

  // --- Upload flow state ---
  const [selectedFile, setSelectedFile] = useState(null);
  const [clientRowCount, setClientRowCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // { total, success, failed, errors[] }
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // --- Pagination state ---
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 10;

  // --- Expandable rows state ---
  const [expandedRows, setExpandedRows] = useState(new Set());

  const toggleRow = (id) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${BASE_URL}/patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Sort patients by institute_id alphabetically
      const sortedData = data.sort((a, b) => {
        const idA = (a.institute_id || "").toString().toLowerCase();
        const idB = (b.institute_id || "").toString().toLowerCase();
        return idA.localeCompare(idB);
      });

      setPatients(sortedData);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error loading patients', status: 'error', duration: 3000, isClosable: true });
    }
  };

  // Filter by institute_id, name, or contact_no
  const filtered = patients.filter(p =>
    (p.institute_id && p.institute_id.toString().toLowerCase().includes(search.toLowerCase())) ||
    (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
    (p.contact_no && p.contact_no.includes(search))
  );

  // Pagination logic
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filtered.length / patientsPerPage);
  const indexOfLast = currentPage * patientsPerPage;
  const indexOfFirst = indexOfLast - patientsPerPage;
  const currentPatients = filtered.slice(indexOfFirst, indexOfLast);

  // ---- Template Download ----
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BASE_URL}/admin/bulk_register/template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student_bulk_registration_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Failed to download template', status: 'error', duration: 3000, isClosable: true });
    }
  };

  // ---- File Selection & Client-side Validation ----
  const handleFileSelect = async (file) => {
    setFileError('');
    setUploadResult(null);

    if (!file) { setSelectedFile(null); return; }

    // Extension check
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Only .csv files are accepted.');
      setSelectedFile(null);
      return;
    }

    // Size check (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setFileError('File size exceeds the 5 MB limit.');
      setSelectedFile(null);
      return;
    }

    // Count data rows (client-side, ignoring comment lines)
    const text = await file.text();
    const lines = text
      .split('\n')
      .filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
    const dataRows = Math.max(0, lines.length - 1); // subtract header

    // Check required headers
    const header = lines[0]?.toLowerCase() || '';
    const requiredHeaders = ['institute_id', 'name', 'email', 'date_of_birth', 'gender', 'contact_no', 'patient_type', 'address'];
    const missingHeaders = requiredHeaders.filter(h => !header.includes(h));
    if (missingHeaders.length > 0) {
      setFileError(`Missing required columns: ${missingHeaders.join(', ')}`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setClientRowCount(dataRows);
  };

  // ---- Upload Handler ----
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      const { data } = await axios.post(`${BASE_URL}/admin/bulk_register`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadResult(data);
      if (data.success > 0) fetchPatients(); // auto-refresh table
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed. Please try again.';
      toast({ title: 'Upload Error', description: msg, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setUploading(false);
    }
  };

  // ---- Download Error Report (client-side) ----
  const handleDownloadErrors = () => {
    if (!uploadResult?.errors?.length) return;
    const csv = [
      'Row,Institute ID,Reason',
      ...uploadResult.errors.map(e => `${e.row},${e.institute_id},"${e.reason}"`)
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'upload_errors.csv';
    a.click();
  };

  // ---- Reset modal state on close ----
  const handleModalClose = () => {
    setSelectedFile(null);
    setClientRowCount(0);
    setUploadResult(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    closeModal();
  };

  return (
    <Box bg="white" p="8" borderRadius="lg" boxShadow="md" maxW="1000px" w="full" mx="auto">
      {/* Header Row */}
      <Flex mb="6" align="center" justify="space-between" flexWrap="wrap" gap={3}>
        <Flex align="center">
          <Heading size="lg" color="blue.800" mr="2">Patients List</Heading>
          <IconButton
            aria-label="Refresh list"
            icon={<FiRefreshCw />}
            size="sm"
            variant="ghost"
            onClick={fetchPatients}
          />
        </Flex>
        <HStack spacing={3}>
          <Button
            leftIcon={<FiHelpCircle />}
            variant="ghost"
            colorScheme="blue"
            size="sm"
            onClick={onGuideOpen}
          >
            Status Guide
          </Button>
        </HStack>
      </Flex>

      {/* Search Bar */}
      <Flex mb="4">
        <Input
          placeholder="Search by Institute ID, name, or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          bg="gray.50"
        />
      </Flex>

      {/* Patients Table */}
      <Box overflowX="auto">
        <Table variant="simple" size="sm" fontSize="sm">
          <Thead bg="gray.100">
            <Tr>
              <Th w="40px"></Th>
              <Th>Institute ID</Th>
              <Th>Name</Th>
              <Th>Contact No</Th>
              <Th>Age</Th>
              <Th>Patient Type</Th>
              <Th>Status</Th>
              <Th>Bill</Th>
              <Th>Lab</Th>
            </Tr>
          </Thead>
          <Tbody>
            {currentPatients.map((p) => {
              const isExpanded = expandedRows.has(p.institute_id);
              const hasAppointments = p.appointments && p.appointments.length > 0;
              return (
                <React.Fragment key={p.institute_id}>
                  <Tr
                    _hover={{ bg: 'gray.50', cursor: hasAppointments ? 'pointer' : 'default' }}
                    onClick={() => hasAppointments && toggleRow(p.institute_id)}
                  >
                    <Td>
                      {hasAppointments && (
                        <Icon as={isExpanded ? FiChevronDown : FiChevronRight} />
                      )}
                    </Td>
                    <Td>{p.institute_id}</Td>
                    <Td>{toTitleCase(p.name)}</Td>
                    <Td>{p.contact_no}</Td>
                    <Td>{p.age ?? '-'}</Td>
                    <Td>
                      <Badge fontSize="10px" colorScheme={p.patient_type === 'Student' ? 'blue' : p.patient_type === 'Faculty' ? 'purple' : 'gray'}>
                        {p.patient_type}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant="subtle"
                        fontSize="10px"
                        colorScheme={
                          p.workflow_status === 'active' ? 'green' :
                            p.workflow_status === 'consultation' ? 'orange' :
                              p.workflow_status === 'consultation completed' ? 'blue' :
                                p.workflow_status === 'lab test pending' ? 'purple' : 'gray'
                        }
                      >
                        {p.workflow_status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        colorScheme={p.bill_status === 'paid' ? 'green' : p.bill_status === 'pending' ? 'red' : 'gray'}
                      >
                        {p.bill_status}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        colorScheme={p.lab_status === 'completed' ? 'green' : p.lab_status === 'pending' ? 'blue' : p.lab_status === 'active' ? 'orange' : 'gray'}
                      >
                        {p.lab_status}
                      </Badge>
                    </Td>
                  </Tr>
                  {isExpanded && hasAppointments && (
                    <Tr>
                      <Td colSpan={9} p={0} borderBottom="1px solid" borderColor="gray.200">
                        <Box bg="gray.50" py={3} px={6} boxShadow="inner">
                          <Text fontWeight="semibold" fontSize="sm" mb={2} color="gray.700">Visit History</Text>
                          <Table variant="unstyled" size="sm" fontSize="xs">
                            <Thead borderBottom="1px solid" borderColor="gray.300">
                              <Tr>
                                <Th color="gray.600">Date & Time</Th>
                                <Th color="gray.600">Doctor</Th>
                                <Th color="gray.600">Status</Th>
                                <Th color="gray.600">Bill</Th>
                                <Th color="gray.600">Lab</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {p.appointments.map((appt, idx) => (
                                <Tr key={idx} borderBottom="1px solid" borderColor="gray.100">
                                  <Td color="gray.600">{formatDateTimeIST(appt.booked_at)}</Td>
                                  <Td color="gray.600">{toTitleCase(appt.doctor_name)}</Td>
                                  <Td>
                                    <Badge
                                      variant="subtle"
                                      fontSize="9px"
                                      colorScheme={
                                        appt.v_workflow_status === 'active' ? 'green' :
                                          appt.v_workflow_status === 'consultation' ? 'orange' :
                                            appt.v_workflow_status === 'consultation completed' ? 'blue' :
                                              appt.v_workflow_status === 'lab test pending' ? 'purple' : 'gray'
                                      }
                                    >
                                      {appt.v_workflow_status}
                                    </Badge>
                                  </Td>
                                  <Td>
                                    <Badge
                                      variant="outline"
                                      fontSize="9px"
                                      colorScheme={appt.v_bill_status === 'paid' ? 'green' : appt.v_bill_status === 'pending' ? 'red' : 'gray'}
                                    >
                                      {appt.v_bill_status}
                                    </Badge>
                                  </Td>
                                  <Td>
                                    <Badge
                                      variant="outline"
                                      fontSize="9px"
                                      colorScheme={appt.v_lab_status === 'completed' ? 'green' : appt.v_lab_status === 'pending' ? 'blue' : appt.v_lab_status === 'active' ? 'orange' : 'gray'}
                                    >
                                      {appt.v_lab_status}
                                    </Badge>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      </Td>
                    </Tr>
                  )}
                </React.Fragment>
              );
            })}
            {currentPatients.length === 0 && (
              <Tr>
                <Td colSpan={9} textAlign="center" py="6" color="gray.400">
                  No patients found.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Flex justify="center" mt="8" align="center" gap="5">
          <Button
            size="sm"
            variant="outline"
            colorScheme="blue"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            isDisabled={currentPage === 1}
          >
            Previous
          </Button>
          <Text fontSize="sm" fontWeight="semibold" color="gray.600">
            Page {currentPage} of {totalPages}
          </Text>
          <Button
            size="sm"
            variant="outline"
            colorScheme="blue"
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            isDisabled={currentPage === totalPages}
          >
            Next
          </Button>
        </Flex>
      )}



      {/* ===== Status Guide Modal ===== */}
      <StatusGuideModal isOpen={isGuideOpen} onClose={onGuideClose} />
    </Box>
  );
}
