import React, { useState } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  HStack,
  Input,
} from "@chakra-ui/react";
import { useNavigate, useLocation } from "react-router-dom";

export default function DoctorSchedulePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromDashboard = location.state?.fromDashboard || false; // check flag
  const [viewMode, setViewMode] = useState("calendar"); // "calendar" | "list"
  const [searchTerm, setSearchTerm] = useState("");

  // Doctor schedule by days
  const schedule = {
    Monday: [{ name: "Dr. Pooja Shah (ENT)", time: "5:30 PM – 6:30 PM" }],
    Tuesday: [
      { name: "Dr. Kishore Singh (Dermatologist)", time: "6:00 PM – 7:30 PM" },
    ],
    Wednesday: [
      { name: "Dr. Ramesh P Jajoo (Ayurvedic)", time: "8:00 AM – 10:00 AM" },
      { name: "Dr. Preety Maan (Dentist)", time: "5:00 PM – 6:30 PM" },
      {
        name: "Dr. Karan Singh Beniwal (Paediatrician)",
        time: "6:00 PM – 7:00 PM",
      },
      { name: "Dr. Prashant Singh (Orthopaedics)", time: "7:00 PM – 8:00 PM" },
      { name: "Dr. Rinku Singh (Gynaecology)", time: "7:00 PM – 8:00 PM" },
    ],
    Thursday: [{ name: "Dr. Pooja Shah (ENT)", time: "5:30 PM – 6:30 PM" }],
    Friday: [
      {
        name: "Dr. Karan Singh Beniwal (Paediatrician)",
        time: "6:00 PM – 7:00 PM",
      },
      { name: "Dr. Prashant Singh (Orthopaedics)", time: "7:00 PM – 8:00 PM" },
      { name: "Dr. Rinku Singh (Gynaecology)", time: "7:00 PM – 8:00 PM" },
    ],
    Saturday: [
      { name: "Dr. Diwakar Pathak (Homeopathic)", time: "5:30 PM – 6:30 PM" },
      { name: "Dr. Preety Maan (Dentist)", time: "5:00 PM – 6:30 PM" },
    ],
    Sunday: [
      { name: "Dr. Ramesh P Jajoo (Ayurvedic)", time: "8:00 AM – 10:00 AM" },
    ],
  };

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // Convert schedule into doctor-based list
  const doctorList = [];
  days.forEach((day) => {
    schedule[day].forEach((entry) => {
      doctorList.push({ ...entry, day });
    });
  });

  const groupedByDoctor = doctorList.reduce((acc, entry) => {
    if (!acc[entry.name]) acc[entry.name] = [];
    acc[entry.name].push({ day: entry.day, time: entry.time });
    return acc;
  }, {});
  const sortedDoctors = Object.keys(groupedByDoctor).sort();

  // Filter function for search (matches name or department)
  const matchesSearch = (text) =>
    text.toLowerCase().includes(searchTerm.toLowerCase());

  // Filtered doctors for list view
  const filteredDoctors = sortedDoctors.filter((docName) =>
    matchesSearch(docName)
  );

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <Flex justify="space-between" align="center" mb={6}>
        <Heading>Visiting Doctor Schedule</Heading>
        <HStack spacing={3}>
          <Button
            colorScheme={viewMode === "calendar" ? "blue" : "gray"}
            onClick={() => setViewMode("calendar")}
          >
            Calendar View
          </Button>
          <Button
            colorScheme={viewMode === "list" ? "blue" : "gray"}
            onClick={() => setViewMode("list")}
          >
            List View
          </Button>
        </HStack>
      </Flex>

      {/* Search field shown in both views */}
      <Box mb={4}>
        <Input
          placeholder="Search by doctor name or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          bg="white"
        />
      </Box>

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <Box overflowX="auto">
          <Flex gap={4} minW="1200px">
            {days.map((day) => {
              const filteredEvents = schedule[day].filter((event) =>
                matchesSearch(event.name)
              );
              return (
                <Box
                  key={day}
                  flex="1"
                  border="1px solid"
                  borderColor="gray.300"
                  borderRadius="md"
                  p={3}
                  bg="white"
                  minW="160px"
                >
                  <Text
                    fontWeight="bold"
                    fontSize="lg"
                    textAlign="center"
                    mb={2}
                    color="blue.600"
                  >
                    {day}
                  </Text>
                  {filteredEvents.length > 0 ? (
                    filteredEvents.map((event, i) => (
                      <Box
                        key={i}
                        bg="blue.100"
                        borderLeft="4px solid"
                        borderColor="blue.500"
                        borderRadius="md"
                        p={2}
                        mb={2}
                      >
                        <Text fontSize="sm" fontWeight="bold">
                          {event.time}
                        </Text>
                        <Text fontSize="sm">{event.name}</Text>
                      </Box>
                    ))
                  ) : (
                    <Text fontSize="sm" color="gray.400" textAlign="center">
                      No Doctors
                    </Text>
                  )}
                </Box>
              );
            })}
          </Flex>
        </Box>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
          p={4}
        >
          {filteredDoctors.length > 0 ? (
            filteredDoctors.map((docName) => (
              <Box key={docName} mb={4} borderBottom="1px solid #eee" pb={2}>
                <Text fontWeight="bold" fontSize="md" color="blue.700" mb={2}>
                  {docName}
                </Text>
                {groupedByDoctor[docName].map((entry, idx) => (
                  <Text key={idx} fontSize="sm" mb={1}>
                    {entry.day}: {entry.time}
                  </Text>
                ))}
              </Box>
            ))
          ) : (
            <Text fontSize="sm" color="gray.500" textAlign="center">
              No doctors found
            </Text>
          )}
        </Box>
      )}

      {fromDashboard && (
        <Box textAlign="center" mt={6}>
          <Button colorScheme="blue" onClick={() => navigate("/")}>
            Back to Register Patient
          </Button>
        </Box>
      )}
    </Box>
  );
}
