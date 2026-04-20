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
} from '@chakra-ui/react';
import { FiUploadCloud, FiDownload, FiCheckCircle, FiAlertCircle, FiFile } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from './Config';

export default function PatientsList() {
  const [patients, setPatients]   = useState([]);
  const [search, setSearch]       = useState('');
  const toast                     = useToast();
  const { isOpen, onOpen, onClose: closeModal } = useDisclosure();
  const fileInputRef              = useRef(null);

  // --- Upload flow state ---
  const [selectedFile, setSelectedFile]       = useState(null);
  const [clientRowCount, setClientRowCount]   = useState(0);
  const [uploading, setUploading]             = useState(false);
  const [uploadResult, setUploadResult]       = useState(null); // { total, success, failed, errors[] }
  const [fileError, setFileError]             = useState('');

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${BASE_URL}/patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPatients(data);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error loading patients', status: 'error', duration: 3000, isClosable: true });
    }
  };

  // Filter by institute_id, name, or contact_no
  const filtered = patients.filter(p =>
    (p.institute_id && p.institute_id.toString().toLowerCase().includes(search.toLowerCase())) ||
    (p.name         && p.name.toLowerCase().includes(search.toLowerCase())) ||
    (p.contact_no   && p.contact_no.includes(search))
  );

  // ---- Template Download ----
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BASE_URL}/admin/bulk_register/template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href    = url;
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
    const text  = await file.text();
    const lines = text
      .split('\n')
      .filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
    const dataRows = Math.max(0, lines.length - 1); // subtract header

    // Check required headers
    const header = lines[0]?.toLowerCase() || '';
    const requiredHeaders = ['institute_id', 'name', 'email', 'date_of_birth', 'gender', 'contact_no', 'patient_type', 'address'];
    const missingHeaders  = requiredHeaders.filter(h => !header.includes(h));
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
      const token    = localStorage.getItem('token');
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
    const a   = document.createElement('a');
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
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
        <Heading size="lg" color="blue.800">Patients List</Heading>
        <HStack spacing={3}>
          <Button
            leftIcon={<FiDownload />}
            variant="outline"
            colorScheme="blue"
            size="sm"
            onClick={handleDownloadTemplate}
          >
            Download Template
          </Button>
          <Button
            leftIcon={<FiUploadCloud />}
            colorScheme="blue"
            size="sm"
            onClick={onOpen}
          >
            Upload CSV
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
        <Table variant="simple" size="md">
          <Thead bg="gray.100">
            <Tr>
              <Th>Institute ID</Th>
              <Th>Name</Th>
              <Th>Contact No</Th>
              <Th>Age</Th>
              <Th>Patient Type</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((p) => (
              <Tr key={p.institute_id} _hover={{ bg: 'gray.50' }}>
                <Td fontFamily="mono" fontSize="sm">{p.institute_id}</Td>
                <Td>{p.name}</Td>
                <Td>{p.contact_no}</Td>
                <Td>{p.age ?? '—'}</Td>
                <Td>
                  <Badge colorScheme={p.patient_type === 'Student' ? 'blue' : p.patient_type === 'Faculty' ? 'purple' : 'gray'}>
                    {p.patient_type}
                  </Badge>
                </Td>
                <Td>
                  <Badge colorScheme={p.workflow_status === 'active' ? 'green' : 'red'}>
                    {p.workflow_status}
                  </Badge>
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={6} textAlign="center" py="6" color="gray.400">
                  No patients found.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      {/* ===== Bulk Upload Modal ===== */}
      <Modal isOpen={isOpen} onClose={handleModalClose} isCentered size="xl">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent borderRadius="xl">
          <ModalHeader>
            <Flex align="center" gap={2}>
              <Icon as={FiUploadCloud} color="blue.500" boxSize={5} />
              Bulk Student Registration
            </Flex>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody pb={6}>
            <VStack spacing={5} align="stretch">

              {/* ---- Drop zone / File picker ---- */}
              {!uploadResult && (
                <>
                  <Box
                    border="2px dashed"
                    borderColor={fileError ? 'red.400' : selectedFile ? 'green.400' : 'blue.300'}
                    borderRadius="lg"
                    p={8}
                    textAlign="center"
                    bg={selectedFile ? 'green.50' : 'blue.50'}
                    cursor="pointer"
                    onClick={() => fileInputRef.current?.click()}
                    _hover={{ bg: selectedFile ? 'green.100' : 'blue.100' }}
                    transition="all 0.2s"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e.target.files[0])}
                    />
                    {selectedFile ? (
                      <VStack spacing={2}>
                        <Icon as={FiFile} boxSize={8} color="green.500" />
                        <Text fontWeight="semibold" color="green.700">{selectedFile.name}</Text>
                        <Text fontSize="sm" color="green.600">
                          {clientRowCount} student record{clientRowCount !== 1 ? 's' : ''} detected
                        </Text>
                        <Text fontSize="xs" color="gray.500">Click to change file</Text>
                      </VStack>
                    ) : (
                      <VStack spacing={2}>
                        <Icon as={FiUploadCloud} boxSize={10} color="blue.400" />
                        <Text fontWeight="medium" color="blue.700">
                          Click to browse or drag & drop your CSV
                        </Text>
                        <Text fontSize="sm" color="gray.500">
                          Max: 5 MB · Only .csv files accepted
                        </Text>
                        <Badge colorScheme="orange" variant="subtle" mt={1}>
                          Pro-tip: Save your Excel template as .csv before uploading
                        </Badge>
                      </VStack>
                    )}
                  </Box>

                  {fileError && (
                    <Alert status="error" borderRadius="md" fontSize="sm">
                      <AlertIcon />
                      {fileError}
                    </Alert>
                  )}

                  {/* Progress bar during upload */}
                  {uploading && (
                    <Box>
                      <Text fontSize="sm" color="gray.600" mb={2}>
                        Processing {clientRowCount} records, please wait…
                      </Text>
                      <Progress size="sm" isIndeterminate colorScheme="blue" borderRadius="full" />
                    </Box>
                  )}
                </>
              )}

              {/* ---- Results Panel ---- */}
              {uploadResult && (
                <VStack spacing={4} align="stretch">
                  <Alert
                    status={uploadResult.failed === 0 ? 'success' : uploadResult.success === 0 ? 'error' : 'warning'}
                    borderRadius="lg"
                    flexDirection="column"
                    alignItems="flex-start"
                    p={4}
                  >
                    <Flex align="center" mb={2}>
                      <AlertIcon />
                      <AlertTitle mr={2}>
                        {uploadResult.failed === 0 ? 'Upload Complete!' : 'Upload Finished with Errors'}
                      </AlertTitle>
                    </Flex>
                    <AlertDescription w="full">
                      <Flex gap={6} flexWrap="wrap">
                        <Text><strong>Total rows:</strong> {uploadResult.total}</Text>
                        <Text color="green.600"><strong>✅ Added:</strong> {uploadResult.success}</Text>
                        <Text color="red.600"><strong>❌ Skipped:</strong> {uploadResult.failed}</Text>
                      </Flex>
                    </AlertDescription>
                  </Alert>

                  {uploadResult.errors?.length > 0 && (
                    <>
                      <Divider />
                      <Flex justify="space-between" align="center">
                        <Text fontWeight="semibold" fontSize="sm">Error Details</Text>
                        <Button
                          size="xs"
                          leftIcon={<FiDownload />}
                          variant="outline"
                          colorScheme="red"
                          onClick={handleDownloadErrors}
                        >
                          Download Error Report
                        </Button>
                      </Flex>
                      <Box
                        overflowX="auto"
                        overflowY="auto"
                        maxH="220px"
                        border="1px solid"
                        borderColor="red.100"
                        borderRadius="md"
                      >
                        <Table size="sm" variant="simple">
                          <Thead bg="red.50" position="sticky" top={0}>
                            <Tr>
                              <Th>Row</Th>
                              <Th>Institute ID</Th>
                              <Th>Reason</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {uploadResult.errors.map((e, i) => (
                              <Tr key={i}>
                                <Td color="gray.500">{e.row}</Td>
                                <Td fontFamily="mono" fontSize="xs">{e.institute_id}</Td>
                                <Td color="red.600" fontSize="sm">{e.reason}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    </>
                  )}
                </VStack>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter gap={3}>
            {!uploadResult ? (
              <>
                <Button variant="ghost" onClick={handleModalClose} isDisabled={uploading}>
                  Cancel
                </Button>
                <Button
                  colorScheme="blue"
                  leftIcon={<FiUploadCloud />}
                  onClick={handleUpload}
                  isDisabled={!selectedFile || uploading || !!fileError}
                  isLoading={uploading}
                  loadingText={`Processing ${clientRowCount} records…`}
                >
                  Validate &amp; Upload
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadResult(null);
                    setSelectedFile(null);
                    setClientRowCount(0);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Upload Another
                </Button>
                <Button colorScheme="blue" onClick={handleModalClose}>
                  Done
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
