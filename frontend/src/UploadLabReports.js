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
  const [instituteId, setInstituteId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [uploadedReports, setUploadedReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const toast = useToast();

  const token = localStorage.getItem("token");

  // Fetch doctors from backend
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/public/doctors");

        if (!res.ok) throw new Error("Failed to fetch doctors");

        const data = await res.json();

        // backend returns: display_name
        const doctorNames = data.map((doc) => doc.display_name);
        setDoctors(doctorNames);

      } catch (err) {
        console.error(err);
        toast({
          title: "Failed to load doctors",
          status: "error",
        });
      }
    };

    fetchDoctors();
  }, []);

  // Load reports from localStorage
  useEffect(() => {
    const savedReports = JSON.parse(localStorage.getItem("labReports")) || [];
    setUploadedReports(savedReports);
  }, []);

  // Save reports
  useEffect(() => {
    localStorage.setItem("labReports", JSON.stringify(uploadedReports));
  }, [uploadedReports]);

  const validate = () => {
    const newErrors = {};
    if (!instituteId.trim()) newErrors.instituteId = "Institute ID is required";
    if (!doctorName.trim()) newErrors.doctorName = "Doctor name is required";
    if (!file) newErrors.file = "Lab report file is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // FULLY FIXED upload flow
  const handleUpload = async () => {
    if (!validate()) return;
    setIsUploading(true);

    try {
      // 1. Get presigned URL
      const res = await fetch("http://localhost:5000/s3/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          instituteId: instituteId
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get upload URL");

      const { upload_url, key } = data;

      // 2. Upload to S3
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("S3 upload failed");

      await fetch("http://localhost:5000/s3/save-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instituteId,
          key,
          filename: file.name
        }),
      });

      // 3. Preview (local only)
      const previewUrl = URL.createObjectURL(file);

      const newReport = {
        instituteId,
        doctorName,
        previewUrl,
        fileName: file.name,
        uploadedAt: new Date().toLocaleString(),
        s3Key: key, // Adding S3 key
      };

      setUploadedReports([...uploadedReports, newReport]);

      toast({
        title: "Report uploaded successfully",
        status: "success",
      });

      // Reset
      setInstituteId("");
      setDoctorName("");
      setFile(null);

    } catch (err) {
      console.error(err);
      toast({
        title: "Upload failed",
        description: err.message,
        status: "error",
      });
    } finally {
      setIsUploading(false);
    }
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
          <FormControl isInvalid={errors.instituteId}>
            <FormLabel>Patient Institute ID</FormLabel>
            <Input
              placeholder="Enter Institute ID"
              value={instituteId}
              onChange={(e) => setInstituteId(e.target.value)}
            />
            {errors.instituteId && (
              <FormErrorMessage>{errors.instituteId}</FormErrorMessage>
            )}
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
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {errors.file && (
              <FormErrorMessage>{errors.file}</FormErrorMessage>
            )}
          </FormControl>

          <Button colorScheme="blue" onClick={handleUpload} isLoading={isUploading}>
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
                    ID: {report.instituteId} | Doctor: {report.doctorName}
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