import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  useToast,
  Text,
  Spinner,
  Flex,
  HStack,
  Input,
  Select,
  FormControl,
  FormLabel,
  VStack,
  Heading,
  Button,
  IconButton
} from '@chakra-ui/react';
import { FiRefreshCw, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { getDateISTString, toTitleCase, formatReceptionistDateTime } from '../../utils/utils';
import PrescriptionModal from '../../components/PrescriptionModal';

export default function ReceptionistHistory() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Get today's date formatted as YYYY-MM-DD in IST
  const today = getDateISTString();

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('all'); // all, completed, cancelled, no_show, etc.

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState(null);

  const toast = useToast();

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BASE_URL}/api/receptionist/queue`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          start_date: startDate,
          end_date: endDate,
          status: statusFilter
        }
      });
      setQueue(res.data);
    } catch (err) {
      toast({
        title: "Error fetching queue",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [startDate, endDate, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, statusFilter]);

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'booked': return 'yellow';
      case 'confirmed': return 'green';
      case 'checked_in': return 'blue';
      case 'completed': return 'purple';
      case 'cancelled': return 'red';
      case 'no_show': return 'orange';
      default: return 'gray';
    }
  };

  const ITEMS_PER_PAGE = 10;
  const paginatedQueue = queue.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(queue.length / ITEMS_PER_PAGE);

  return (
    <Box p={{ base: "4", md: "6" }} flex="1" overflowY="auto">
      <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
        <Heading size="md" mb={4}>Appointment History</Heading>
        <VStack spacing={4} align="stretch">
          {/* Controls / Filters */}
          <Flex
            bg="gray.50"
            p={4}
            borderRadius="md"
            border="1px solid"
            borderColor="gray.200"
            justify="space-between"
            align="flex-end"
            wrap="wrap"
            gap={4}
          >
            <HStack spacing={4} wrap="wrap">
              <FormControl w="auto">
                <FormLabel htmlFor="start-date" fontSize="sm" mb={1}>Start Date</FormLabel>
                <Input
                  id="start-date"
                  type="date"
                  size="sm"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  bg="white"
                />
              </FormControl>
              <FormControl w="auto">
                <FormLabel htmlFor="end-date" fontSize="sm" mb={1}>End Date</FormLabel>
                <Input
                  id="end-date"
                  type="date"
                  size="sm"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  bg="white"
                />
              </FormControl>
              <FormControl w="auto">
                <FormLabel htmlFor="status-filter" fontSize="sm" mb={1}>Status</FormLabel>
                <Select
                  id="status-filter"
                  size="sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  bg="white"
                  minW="150px"
                >
                  <option value="all">All Statuses</option>
                  <option value="booked">Booked</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">Checked In</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No Show</option>
                </Select>
              </FormControl>
            </HStack>
            <Button
              leftIcon={<FiRefreshCw />}
              colorScheme="blue"
              size="sm"
              onClick={fetchQueue}
              variant="outline"
              bg="white"
            >
              Refresh
            </Button>
          </Flex>

          <Box overflowX="auto">
            {loading ? (
              <Flex justify="center" align="center" h="200px">
                <Spinner size="xl" />
              </Flex>
            ) : queue.length === 0 ? (
              <Box p={6} bg="white" borderRadius="md" shadow="sm" textAlign="center">
                <Text color="gray.500">No appointments found for the selected criteria.</Text>
              </Box>
            ) : (
              <Box overflowX="auto" bg="white" p={4} borderRadius="md" shadow="sm">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Date & Time</Th>
                      <Th>Patient Info</Th>
                      <Th>Institute ID</Th>
                      <Th>Doctor</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {paginatedQueue.map((appointment) => (
                      <Tr
                        key={appointment.visit_id}
                        onClick={() => {
                          const normalizedStatus = appointment.status?.toLowerCase().replace(' ', '_');
                          if (normalizedStatus === 'checked_in') {
                            setPrintData(appointment);
                            setIsPrintModalOpen(true);
                          }
                        }}
                        style={{ cursor: appointment.status?.toLowerCase().replace(' ', '_') === 'checked_in' ? 'pointer' : 'default' }}
                        _hover={appointment.status?.toLowerCase().replace(' ', '_') === 'checked_in' ? { bg: "gray.50" } : {}}
                        title={appointment.status?.toLowerCase().replace(' ', '_') === 'checked_in' ? "Click to reprint Consultation Slip" : ""}
                      >
                        <Td fontWeight="bold">
                          {formatReceptionistDateTime(appointment.time)}
                        </Td>
                        <Td>
                          <Flex align="center" justify="flex-start">
                            <Box textAlign="left">
                              <Text fontWeight="bold">{toTitleCase(appointment.name)}</Text>
                              {appointment.age && appointment.gender ? (
                                <Text fontSize="sm" color="gray.500">{appointment.age} yrs • {appointment.gender}</Text>
                              ) : (
                                <Text fontSize="sm" color="gray.500">Info not available</Text>
                              )}
                            </Box>
                          </Flex>
                        </Td>
                        <Td>{appointment.institute_id}</Td>
                        <Td>{appointment.doctor_name || appointment.doctor_username}</Td>
                        <Td>
                          <Badge colorScheme={getStatusBadgeColor(appointment.status)}>
                            {appointment.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {totalPages > 1 && (
                  <Flex justify="space-between" align="center" mt={4}>
                    <Text fontSize="sm" color="gray.500">
                      Showing {paginatedQueue.length} of {queue.length} entries
                    </Text>
                    <HStack>
                      <IconButton
                        icon={<FiChevronLeft />}
                        size="sm"
                        isDisabled={currentPage === 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                        aria-label="Previous Page"
                      />
                      <Text fontSize="sm">
                        Page {currentPage} of {totalPages}
                      </Text>
                      <IconButton
                        icon={<FiChevronRight />}
                        size="sm"
                        isDisabled={currentPage * ITEMS_PER_PAGE >= queue.length}
                        onClick={() => setCurrentPage(currentPage + 1)}
                        aria-label="Next Page"
                      />
                    </HStack>
                  </Flex>
                )}
              </Box>
            )}</Box>
        </VStack>
      </Box>

      {printData && (
        <PrescriptionModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          prescriptionData={printData}
        />
      )}
    </Box>
  );
}
