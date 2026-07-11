import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  IconButton
} from '@chakra-ui/react';
import { FiRefreshCw, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { getDateISTString, toTitleCase } from '../../utils/utils';
import PrescriptionModal from '../../components/PrescriptionModal';

export default function ReceptionistQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookedPage, setBookedPage] = useState(1);
  const [confirmedPage, setConfirmedPage] = useState(1);

  // Get today's date formatted as YYYY-MM-DD in IST
  const today = getDateISTString();

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('active'); // active, all, completed, cancelled, etc.

  const [isNoShowModalOpen, setIsNoShowModalOpen] = useState(false);
  const [selectedVisitIdForNoShow, setSelectedVisitIdForNoShow] = useState(null);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [updatingVisitId, setUpdatingVisitId] = useState(null);

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
    setBookedPage(1);
    setConfirmedPage(1);
  }, [startDate, endDate, statusFilter]);

  const handleStatusChange = async (visitId, status) => {
    setUpdatingVisitId(visitId);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${BASE_URL}/api/receptionist/appointment/${visitId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (status === 'confirmed') {
        if (res.data && res.data.email_error) {
          toast({
            title: "Email Notification Warning",
            description: `Appointment confirmed, but failed to send email: ${res.data.email_error}`,
            status: "warning",
            duration: 5000,
            isClosable: true,
          });
        }
      } else {
        toast({
          title: `Status updated to ${status}`,
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      }

      if (status === 'checked_in') {
        const appointment = queue.find(q => q.visit_id === visitId);
        if (appointment) {
          setPrintData(appointment);
          setIsPrintModalOpen(true);
        }
      }

      setIsNoShowModalOpen(false);
      setSelectedVisitIdForNoShow(null);
      fetchQueue();
    } catch (err) {
      toast({
        title: "Error updating status",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setUpdatingVisitId(null);
    }
  };

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

  const renderTable = (title, data, currentPage = 1, setPage = () => { }, isPaginated = false) => {
    if (data.length === 0 && title !== "Booked Appointments" && title !== "Confirmed Appointments") return null;
    const itemsPerPage = 5;
    const paginatedData = isPaginated
      ? data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
      : data;

    return (
      <Box mb={6}>
        {title && <Text fontSize="md" fontWeight="bold" mb={2} color="gray.700">{title}</Text>}
        <Box overflowX="auto" bg="white" p={4} borderRadius="md" shadow="sm">
          {data.length === 0 ? (
            <Text color="gray.500" fontStyle="italic">No {title.toLowerCase()} found.</Text>
          ) : (
            <>
              <Table variant="simple" size="sm" sx={{ tableLayout: 'fixed' }}>
                <Thead>
                  <Tr>
                    <Th w="15%">Date & Time</Th>
                    <Th w="25%">Patient Info</Th>
                    <Th w="15%">Institute ID</Th>
                    <Th w="15%">Doctor</Th>
                    <Th w="10%" textAlign="center">Status</Th>
                    <Th w="20%" textAlign="center">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {paginatedData.map((appointment) => (
                    <Tr key={appointment.visit_id}>
                      <Td fontWeight="bold">
                        {new Date(appointment.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
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
                      <Td textAlign="center">
                        <Badge colorScheme={getStatusBadgeColor(appointment.status)}>
                          {appointment.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </Td>
                      <Td textAlign="center">
                        <HStack spacing={2} justify="center">
                          {appointment.status === 'booked' && (
                            <Button
                              size="xs"
                              colorScheme="blue"
                              isLoading={updatingVisitId === appointment.visit_id}
                              isDisabled={updatingVisitId !== null}
                              onClick={() => handleStatusChange(appointment.visit_id, 'confirmed')}
                            >
                              Confirm
                            </Button>
                          )}
                          {appointment.status === 'confirmed' && (
                            <Button
                              size="xs"
                              colorScheme="green"
                              isLoading={updatingVisitId === appointment.visit_id}
                              isDisabled={updatingVisitId !== null}
                              onClick={() => handleStatusChange(appointment.visit_id, 'checked_in')}
                            >
                              Check-in
                            </Button>
                          )}
                          {(appointment.status === 'booked' || appointment.status === 'confirmed') && (
                            <Button
                              size="xs"
                              colorScheme="orange"
                              isDisabled={updatingVisitId !== null}
                              onClick={() => {
                                setSelectedVisitIdForNoShow(appointment.visit_id);
                                setIsNoShowModalOpen(true);
                              }}
                            >
                              No Show
                            </Button>
                          )}
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {isPaginated && data.length > itemsPerPage && (
                <Flex justify="space-between" align="center" mt={4}>
                  <Text fontSize="sm" color="gray.500">
                    Showing {paginatedData.length} of {data.length} entries
                  </Text>
                  <HStack>
                    <IconButton
                      icon={<FiChevronLeft />}
                      size="sm"
                      isDisabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                      aria-label="Previous Page"
                    />
                    <Text fontSize="sm">
                      Page {currentPage} of {Math.ceil(data.length / itemsPerPage)}
                    </Text>
                    <IconButton
                      icon={<FiChevronRight />}
                      size="sm"
                      isDisabled={currentPage * itemsPerPage >= data.length}
                      onClick={() => setPage(currentPage + 1)}
                      aria-label="Next Page"
                    />
                  </HStack>
                </Flex>
              )}
            </>
          )}
        </Box>
      </Box>
    );
  };

  return (
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
              data-testid="start-date-input"
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
              data-testid="end-date-input"
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
              data-testid="status-filter-select"
              size="sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              bg="white"
              minW="150px"
            >
              <option value="active">Active (Pending)</option>
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
        ) : (
          <Box>
            {renderTable("Booked Appointments", queue.filter(a => a.status === 'booked'), bookedPage, setBookedPage, true)}
            {renderTable("Confirmed Appointments", queue.filter(a => a.status === 'confirmed'), confirmedPage, setConfirmedPage, true)}
            {renderTable(
              (statusFilter !== 'booked' && statusFilter !== 'confirmed' && statusFilter !== 'active') ? "Other Appointments" : "",
              queue.filter(a => a.status !== 'booked' && a.status !== 'confirmed')
            )}
          </Box>
        )}</Box>

      {/* No Show Confirmation Modal */}
      <Modal isOpen={isNoShowModalOpen} onClose={() => setIsNoShowModalOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm No Show</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Are you sure you want to mark this patient as a No Show? This action cannot be undone.
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setIsNoShowModalOpen(false)}>
              Cancel
            </Button>
            <Button colorScheme="orange" onClick={() => handleStatusChange(selectedVisitIdForNoShow, 'no_show')}>
              Confirm No Show
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {printData && (
        <PrescriptionModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          prescriptionData={printData}
        />
      )}

    </VStack>
  );
}
