import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  FormControl,
  FormLabel,
  Select,
  Input,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  useToast,
  Spinner,
  Icon,
  HStack
} from "@chakra-ui/react";
import { FiCalendar, FiTrash2, FiUser, FiPlusCircle } from "react-icons/fi";
import axios from "axios";
import BASE_URL from "../../utils/Config";

export default function ManageLeaves() {
  const [doctors, setDoctors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const toast = useToast();

  const fetchDoctorsAndLeaves = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch doctors
      const docsRes = await axios.get(`${BASE_URL}/doctors`, { headers });
      setDoctors(docsRes.data);

      // Fetch leaves
      const leavesRes = await axios.get(`${BASE_URL}/api/receptionist/leaves`, { headers });
      setLeaves(leavesRes.data);
    } catch (err) {
      toast({
        title: "Error fetching data",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorsAndLeaves();
  }, []);

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    if (!selectedDoctor || !startDate || !endDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        status: "warning",
        duration: 2000,
        isClosable: true
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/api/receptionist/leaves`,
        {
          doctor_username: selectedDoctor,
          start_date: startDate,
          end_date: endDate,
          reason
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: "Success",
        description: "Leave recorded successfully.",
        status: "success",
        duration: 2000,
        isClosable: true
      });

      // Clear form
      setSelectedDoctor("");
      setStartDate("");
      setEndDate("");
      setReason("");

      // Refresh list
      fetchDoctorsAndLeaves();
    } catch (err) {
      toast({
        title: "Error recording leave",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!window.confirm("Are you sure you want to cancel/delete this leave?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${BASE_URL}/api/receptionist/leaves/${leaveId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast({
        title: "Success",
        description: "Leave record deleted successfully.",
        status: "success",
        duration: 2000,
        isClosable: true
      });

      // Refresh list
      fetchDoctorsAndLeaves();
    } catch (err) {
      toast({
        title: "Error deleting leave",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    }
  };

  return (
    <Box p={{ base: 4, md: 6 }} w="100%">
      <Heading size="md" color="blue.800" mb={6} display="flex" alignItems="center">
        <Icon as={FiCalendar} mr={3} /> Manage Doctor Leaves
      </Heading>

      <Flex direction={{ base: "column", lg: "row" }} gap={8} alignItems="start">
        {/* Left Side: Create Leave Card */}
        <Box
          flex="1"
          w="100%"
          bg="white"
          p={6}
          borderRadius="lg"
          boxShadow="sm"
          border="1px solid"
          borderColor="gray.200"
        >
          <Heading size="xs" color="gray.700" mb={4} display="flex" alignItems="center">
            <Icon as={FiPlusCircle} mr={2} /> Record Doctor Leave
          </Heading>
          <form onSubmit={handleCreateLeave}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="bold">Select Doctor</FormLabel>
                <Select
                  placeholder="Choose Doctor"
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  focusBorderColor="blue.500"
                >
                  {doctors.map((doc) => (
                    <option key={doc.username} value={doc.username}>
                      {doc.display_name} ({doc.department || "No Department"})
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="bold">Start Date</FormLabel>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  focusBorderColor="blue.500"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="bold">End Date</FormLabel>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  focusBorderColor="blue.500"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="bold">Reason / Notes</FormLabel>
                <Input
                  placeholder="e.g. Health checkup, Medical conference"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  focusBorderColor="blue.500"
                />
              </FormControl>

              <Button
                type="submit"
                colorScheme="blue"
                isLoading={submitting}
                loadingText="Saving..."
                mt={2}
              >
                Mark Doctor On Leave
              </Button>
            </VStack>
          </form>
        </Box>

        {/* Right Side: Leaves List Table */}
        <Box
          flex="2"
          w="100%"
          bg="white"
          p={6}
          borderRadius="lg"
          boxShadow="sm"
          border="1px solid"
          borderColor="gray.200"
          overflowX="auto"
        >
          <Heading size="xs" color="gray.700" mb={4}>
            Leave Records List
          </Heading>

          {loading ? (
            <Flex justify="center" align="center" py={10}>
              <Spinner size="md" color="blue.500" />
            </Flex>
          ) : leaves.length === 0 ? (
            <Text color="gray.500" fontSize="sm" textAlign="center" py={10}>
              No leave records found.
            </Text>
          ) : (
            <Table variant="simple" size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Doctor</Th>
                  <Th>Start Date</Th>
                  <Th>End Date</Th>
                  <Th>Reason / Remarks</Th>
                  <Th textAlign="center">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {leaves.map((leave) => (
                  <Tr key={leave.leave_id}>
                    <Td fontWeight="medium">
                      <HStack spacing={2}>
                        <Icon as={FiUser} color="blue.500" />
                        <Text fontSize="xs">{leave.doctor_name}</Text>
                      </HStack>
                    </Td>
                    <Td fontSize="xs">{leave.start_date}</Td>
                    <Td fontSize="xs">{leave.end_date}</Td>
                    <Td fontSize="xs" color="gray.600">
                      {leave.reason || <Text as="span" color="gray.400" fontStyle="italic">-</Text>}
                    </Td>
                    <Td textAlign="center">
                      <IconButton
                        icon={<FiTrash2 />}
                        colorScheme="red"
                        variant="ghost"
                        size="sm"
                        aria-label="Delete leave"
                        onClick={() => handleDeleteLeave(leave.leave_id)}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>
      </Flex>
    </Box>
  );
}
