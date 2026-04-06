import React, { useState, useEffect } from "react";
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
import axios from "axios";
import BASE_URL from "./Config";

export default function DoctorSchedulePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromDashboard = location.state?.fromDashboard || false; // check flag
  const [viewMode, setViewMode] = useState("calendar"); // "calendar" | "list"
  const [searchTerm, setSearchTerm] = useState("");

  const [schedule, setSchedule] = useState({
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/public/doctors`);
        const newSchedule = {
          Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
        };

        response.data.forEach((doc) => {
          if (doc.schedule && doc.schedule.length > 0) {
            doc.schedule.forEach((shift) => {
              shift.duty_days.forEach((day) => {
                if (newSchedule[day]) {
                  newSchedule[day].push({
                    name: `Dr. ${doc.display_name} (${doc.department})`,
                    time: `${shift.start_time} - ${shift.end_time}`,
                  });
                }
              });
            });
          }
        });
        setSchedule(newSchedule);
      } catch (err) {
        console.error("Error fetching doctor schedule", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDoctors();
  }, []);

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
