import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Input,
  Stack,
  Image,
  Heading,
  useToast,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Select,
  Text,
} from "@chakra-ui/react";

function UploadLabReports() {
  const [psrNo, setPsrNo] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [uploadedReports, setUploadedReports] = useState([]);
  const toast = useToast();

  // Fake doctors list (later can be fetched from backend)
  const doctors = ["Dr. dr1", "Dr. doctor1"];

  // Load reports from localStorage on mount
  useEffect(() => {
    const savedReports = JSON.parse(localStorage.getItem("labReports")) || [];
    setUploadedReports(savedReports);
  }, []);

  // Save reports to localStorage whenever updated
  useEffect(() => {
    localStorage.setItem("labReports", JSON.stringify(uploadedReports));
  }, [uploadedReports]);

  const validate = () => {
    const newErrors = {};
    if (!psrNo.trim()) newErrors.psrNo = "PSRN No. is required";
    if (!doctorName.trim()) newErrors.doctorName = "Doctor name is required";
    if (!file) newErrors.file = "Lab report file is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpload = () => {
    if (!validate()) return;

    // Create temporary image URL for preview
    const previewUrl = URL.createObjectURL(file);

    const newReport = {
      psrNo,
      doctorName,
      previewUrl,
      fileName: file.name,
      uploadedAt: new Date().toLocaleString(),
    };

    setUploadedReports([...uploadedReports, newReport]);

    toast({ title: "Report uploaded successfully", status: "success" });

    // Reset form
    setPsrNo("");
    setDoctorName("");
    setFile(null);
  };

  return (
    <Box p={6} display="flex" justifyContent="center">
      <Box
        bg="white"
        shadow="md"
        rounded="lg"
        p={6}
        w="100%"
        maxW="lg"
        border="1px solid #e2e8f0"
      >
        <Heading size="lg" mb={6} textAlign="center">
          Upload Lab Reports
        </Heading>

        <Stack spacing={4} mb={6}>
          <FormControl isInvalid={errors.psrNo}>
            <FormLabel>Patient PSRN No.</FormLabel>
            <Input
              placeholder="Enter PSRN No."
              value={psrNo}
              onChange={(e) => setPsrNo(e.target.value)}
            />
            {errors.psrNo && <FormErrorMessage>{errors.psrNo}</FormErrorMessage>}
          </FormControl>

          <FormControl isInvalid={errors.doctorName}>
            <FormLabel>Doctor Name</FormLabel>
            <Select
              placeholder="Select Doctor"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
            >
              {doctors.map((doc, idx) => (
                <option key={idx} value={doc}>
                  {doc}
                </option>
              ))}
            </Select>
            {errors.doctorName && (
              <FormErrorMessage>{errors.doctorName}</FormErrorMessage>
            )}
          </FormControl>

          <FormControl isInvalid={errors.file}>
            <FormLabel>Upload Lab Report</FormLabel>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {errors.file && <FormErrorMessage>{errors.file}</FormErrorMessage>}
          </FormControl>

          <Button colorScheme="blue" onClick={handleUpload}>
            Upload
          </Button>
        </Stack>

        {uploadedReports.length > 0 && (
          <Box mt={6}>
            <Heading size="md" mb={4}>
              Uploaded Reports (Preview)
            </Heading>
            <Stack spacing={4}>
              {uploadedReports.map((report, idx) => (
                <Box
                  key={idx}
                  border="1px solid #ddd"
                  rounded="md"
                  p={3}
                  shadow="sm"
                >
                  <Text fontWeight="bold" mb={2}>
                    PSR: {report.psrNo} | Doctor: {report.doctorName}
                  </Text>
                  <Text fontSize="sm" color="gray.500" mb={2}>
                    Uploaded at: {report.uploadedAt}
                  </Text>
                  <Image
                    src={report.previewUrl}
                    alt={report.fileName}
                    maxH="200px"
                    objectFit="contain"
                    rounded="md"
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default UploadLabReports;
