import React from "react";
import {
  Box,
  Heading,
  Text,
  Stack,
  Divider,
  Flex,
  Badge,
  Button,
} from "@chakra-ui/react";

function PatientDashboard() {
  const patient = {
    name: "John Doe",
    email: "john.doe@email.com",
    psr_no: "202601310001",
  };

  const prescriptions = [
    {
      date: "2026-01-29",
      doctor: "Dr. Doctor Name",
      medicines: [
        "Paracetamol 500mg - Twice a day",
        "Amoxicillin 250mg - Thrice a day",
      ],
    },
    {
      date: "2026-01-15",
      doctor: "Dr. Doctor Name",
      medicines: ["Vitamin D – Once a day"],
    },
  ];

  const labReports = [
    {
      test: "Blood Sugar",
      value: "92 mg/dL",
      status: "Normal",
      date: "2026-01-28",
    },
    {
      test: "Hemoglobin",
      value: "13.9 g/dL",
      status: "Normal",
      date: "2026-01-28",
    },
  ];

  return (
    <Box bg="gray.50" minH="100vh" p={{ base: 4, md: 8 }}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg" color="brand.500">
          Patient Dashboard
        </Heading>
        <Button
          colorScheme="red"
          variant="outline"
          onClick={() => {
            localStorage.clear();
            window.location.href = "/";
          }}
        >
          Logout
        </Button>
      </Flex>

      <Box bg="white" p={5} borderRadius="md" boxShadow="sm" mb={6}>
        <Heading size="md" mb={2}>
          Patient Information
        </Heading>
        <Text>
          <strong>Name:</strong> {patient.name}
        </Text>
        <Text>
          <strong>Email:</strong> {patient.email}
        </Text>
        <Text>
          <strong>PSR No:</strong> {patient.psr_no}
        </Text>
      </Box>

      <Box bg="white" p={5} borderRadius="md" boxShadow="sm" mb={6}>
        <Heading size="md" mb={4}>
          Prescriptions
        </Heading>

        <Stack spacing={4}>
          {prescriptions.map((p, index) => (
            <Box key={index}>
              <Flex justify="space-between">
                <Text fontWeight="bold">{p.date}</Text>
                <Badge colorScheme="blue">{p.doctor}</Badge>
              </Flex>
              <Stack mt={2} pl={4}>
                {p.medicines.map((med, i) => (
                  <Text key={i}>• {med}</Text>
                ))}
              </Stack>
              <Divider mt={3} />
            </Box>
          ))}
        </Stack>
      </Box>

      <Box bg="white" p={5} borderRadius="md" boxShadow="sm">
        <Heading size="md" mb={4}>
          Lab Reports
        </Heading>

        <Stack spacing={3}>
          {labReports.map((r, index) => (
            <Flex
              key={index}
              justify="space-between"
              align="center"
              p={3}
              bg="gray.100"
              borderRadius="md"
            >
              <Box>
                <Text fontWeight="bold">{r.test}</Text>
                <Text fontSize="sm" color="gray.600">
                  {r.date}
                </Text>
              </Box>
              <Box textAlign="right">
                <Text>{r.value}</Text>
                <Badge colorScheme="green">{r.status}</Badge>
              </Box>
            </Flex>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

export default PatientDashboard;