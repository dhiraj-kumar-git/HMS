import React from "react";
import { Box, Flex, Heading, Text, Button } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

export default function DoctorSchedulePage() {
  const navigate = useNavigate();

  const schedule = {
    Monday: [{ name: "Dr. Pooja Shah (ENT)", time: "5:30 PM – 6:30 PM" }],
    Tuesday: [{ name: "Dr. Kishore Singh (Dermatologist)", time: "6:00 PM – 7:30 PM" }],
    Wednesday: [
        { name: "Dr. Ramesh P Jajoo (Ayurvedic)", time: "8:00 AM – 10:00 AM" },
        { name: "Dr. Preety Maan (Dentist)", time: "5:00 PM – 6:30 PM" },
        { name: "Dr. Karan Singh Beniwal (Paediatrician)", time: "6:00 PM – 7:00 PM" },
        { name: "Dr. Prashant Singh (Orthopaedics)", time: "7:00 PM – 8:00 PM" },
        { name: "Dr. Rinku Singh (Gynaecology)", time: "7:00 PM – 8:00 PM" },
    ],
    Thursday: [{ name: "Dr. Pooja Shah (ENT)", time: "5:30 PM – 6:30 PM" }],
    Friday: [
        { name: "Dr. Karan Singh Beniwal (Paediatrician)", time: "6:00 PM – 7:00 PM" },
        { name: "Dr. Prashant Singh (Orthopaedics)", time: "7:00 PM – 8:00 PM" },
        { name: "Dr. Rinku Singh (Gynaecology)", time: "7:00 PM – 8:00 PM" },
    ],
    Saturday: [
        { name: "Dr. Diwakar Pathak (Homeopathic)", time: "5:30 PM – 6:30 PM" },
        { name: "Dr. Preety Maan (Dentist)", time: "5:00 PM – 6:30 PM" },
    ],
    Sunday: [{ name: "Dr. Ramesh P Jajoo (Ayurvedic)", time: "8:00 AM – 10:00 AM" },
    ],
  };

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <Heading textAlign="center" mb={6}>
        Visiting Doctor Schedule
      </Heading>

      <Flex gap={4}>
        {days.map((day) => (
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
            <Text fontWeight="bold" fontSize="lg" textAlign="center" mb={2} color="blue.600">
              {day}
            </Text>
            {schedule[day].length > 0 ? (
              schedule[day].map((event, i) => (
                <Box
                  key={i}
                  bg="blue.100"
                  borderLeft="4px solid"
                  borderColor="blue.500"
                  borderRadius="md"
                  p={2}
                  mb={2}
                >
                  <Text fontSize="sm" fontWeight="bold">{event.time}</Text>
                  <Text fontSize="sm">{event.name}</Text>
                </Box>
              ))
            ) : (
              <Text fontSize="sm" color="gray.400" textAlign="center">
                No Doctors
              </Text>
            )}
          </Box>
        ))}
      </Flex>

      <Box textAlign="center" mt={6}>
        <Button colorScheme="blue" onClick={() => navigate("/")}>
          Go Back
        </Button>
      </Box>
    </Box>
  );
}
