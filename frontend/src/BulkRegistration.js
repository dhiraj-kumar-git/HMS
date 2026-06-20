import React, { useState, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  useToast,
  Card,
  CardHeader,
  CardBody,
  Divider,
  Alert,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Flex,
  Icon,
  Badge,
  Progress,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td
} from '@chakra-ui/react';
import { FiDownload, FiUploadCloud, FiFile } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from './Config';

function BulkUploader({ title, description, badgeText, templateRoute, uploadRoute, templateName }) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [clientRowCount, setClientRowCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BASE_URL}${templateRoute}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = templateName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Error", description: "Failed to download template.", status: "error", duration: 3000 });
    }
  };

  const handleFileSelect = (file) => {
    setFileError(null);
    setUploadResult(null);

    if (!file) {
      setSelectedFile(null);
      setClientRowCount(0);
      return;
    }

    const isCsv = file.name.endsWith(".csv");
    const isXlsx = file.name.endsWith(".xlsx");

    if (!isCsv && !isXlsx) {
      setFileError("Please upload a valid .csv or .xlsx file.");
      setSelectedFile(null);
      setClientRowCount(0);
      return;
    }

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        const rowCount = Math.max(0, lines.length - 1);
        if (rowCount === 0) {
          setFileError("The uploaded CSV appears to be empty or has no data rows.");
        }
        setClientRowCount(rowCount);
      };
      reader.onerror = () => {
        setFileError("Could not read file locally.");
      };
      reader.readAsText(file);
    } else {
      setClientRowCount("multiple");
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(`${BASE_URL}${uploadRoute}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });

      setUploadResult({
        total: data.total || (data.success + data.failed),
        success: data.success,
        failed: data.failed,
        errors: data.errors || []
      });

      if (data.failed > 0) {
        toast({
          title: "Partial Success",
          description: `${data.success} rows added. ${data.failed} rows failed.`,
          status: "warning",
          duration: 6000,
          isClosable: true
        });
      } else {
        toast({
          title: "Success",
          description: `All ${data.success} records were successfully registered!`,
          status: "success",
          duration: 3000,
        });
      }
    } catch (err) {
      toast({
        title: "Upload Failed",
        description: err.response?.data?.error || "Could not complete bulk upload.",
        status: "error",
        duration: 4000,
      });
      setFileError(err.response?.data?.error || "Could not complete bulk upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!uploadResult || !uploadResult.errors) return;
    const header = "Row,InstituteID,Reason\n";
    const csvContent = uploadResult.errors.map(e => `"${e.row}","${e.institute_id}","${e.reason.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([header + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "upload_errors.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetUploader = () => {
    setUploadResult(null);
    setSelectedFile(null);
    setClientRowCount(0);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card variant="outline" shadow="sm">
      <CardHeader>
        <Heading size="md">{title}</Heading>
      </CardHeader>
      <Divider />
      <CardBody>
        <Text mb={4} color="gray.600">
          {description}
        </Text>

        {badgeText && (
          <Alert status="info" mb={6} borderRadius="md">
            <AlertIcon />
            {badgeText}
          </Alert>
        )}

        <HStack spacing={4} mb={6}>
          <Button leftIcon={<FiDownload />} onClick={handleDownloadTemplate} colorScheme="blue" variant="outline">
            Download Template
          </Button>
        </HStack>

        {!uploadResult ? (
          <VStack spacing={4} align="stretch">
            <Box
              border="2px dashed"
              borderColor={isDragging ? 'blue.400' : selectedFile ? 'green.400' : 'gray.300'}
              borderRadius="lg"
              p={8}
              textAlign="center"
              bg={isDragging ? 'blue.50' : selectedFile ? 'green.50' : 'gray.50'}
              cursor="pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              _hover={{ bg: selectedFile ? 'green.100' : 'blue.50' }}
              transition="all 0.2s"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />
              {selectedFile ? (
                <VStack spacing={2}>
                  <Icon as={FiFile} boxSize={8} color="green.500" />
                  <Text fontWeight="semibold" color="green.700">{selectedFile.name}</Text>
                  <Text fontSize="sm" color="green.600">
                    {clientRowCount} record{clientRowCount !== 1 && clientRowCount !== 'multiple' ? 's' : ''} detected
                  </Text>
                  <Text fontSize="xs" color="gray.500">Click to change file</Text>
                </VStack>
              ) : (
                <VStack spacing={2}>
                  <Icon as={FiUploadCloud} boxSize={10} color="blue.400" />
                  <Text fontWeight="medium" color="blue.700">
                    Click to browse or drag & drop your CSV/Excel file
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Max: 5 MB - .csv or .xlsx files accepted
                  </Text>
                </VStack>
              )}
            </Box>

            {fileError && (
              <Alert status="error" borderRadius="md" fontSize="sm">
                <AlertIcon />
                {fileError}
              </Alert>
            )}

            {uploading && (
              <Box>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Processing records, please wait…
                </Text>
                <Progress size="sm" isIndeterminate colorScheme="blue" borderRadius="full" />
              </Box>
            )}

            <Button
              colorScheme="teal"
              leftIcon={<FiUploadCloud />}
              onClick={handleUpload}
              isDisabled={!selectedFile || uploading || !!fileError}
              isLoading={uploading}
              loadingText={`Uploading...`}
            >
              Validate &amp; Upload
            </Button>
          </VStack>
        ) : (
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
                          <Td>{e.institute_id}</Td>
                          <Td color="red.600">{e.reason}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              </>
            )}

            <Button
              variant="outline"
              onClick={resetUploader}
            >
              Upload Another File
            </Button>
          </VStack>
        )}
      </CardBody>
    </Card>
  );
}

function BulkRegistration() {
  return (
    <Box maxW="900px" mx="auto" mt={4}>
      <Heading size="lg" mb={6}>Bulk Registration</Heading>
      <Tabs isFitted variant="enclosed" colorScheme="blue">
        <TabList mb="1em">
          <Tab>Student Bulk Registration</Tab>
          <Tab>Faculty & Staff Bulk Registration</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <BulkUploader
              title="Student Bulk Registration"
              description="Download the template, fill it with student data, and upload it back. The system will automatically ignore duplicates based on Institute ID."
              templateRoute="/admin/bulk_register/template"
              uploadRoute="/admin/bulk_register"
              templateName="student_bulk_registration_template.xlsx"
            />
          </TabPanel>
          <TabPanel>
            <BulkUploader
              title="Faculty/Staff & Dependants Bulk Registration"
              description="Upload Faculty/Staff and their Dependants together. Ensure the primary member's ID matches the dependant's primary_psrn_id column."
              badgeText="Dependants will automatically inherit missing contact details from their Primary Member. For Faculty/Staff, relation must be 'Self' or blank. For dependants, relation is mandatory and MUST NOT be 'Self'."
              templateRoute="/admin/bulk_register_staff/template"
              uploadRoute="/admin/bulk_register_staff"
              templateName="staff_bulk_registration_template.xlsx"
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

export default BulkRegistration;
