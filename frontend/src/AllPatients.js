import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Flex,
  Heading,
  Text,
  Spinner,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  Select,
  HStack,
  InputGroup,
  InputLeftElement,
  useColorModeValue,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Avatar,
} from '@chakra-ui/react';

import {
  FiSearch,
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
} from 'react-icons/fi';

// Custom Spinner Component Using Provided CSS Animation
function CustomSpinner() {
  const spinnerStyles = `
    .spinner {
      margin: 100px auto 0;
      width: 70px;
      text-align: center;
    }
    .spinner > div {
      width: 18px;
      height: 18px;
      background-color: #3182CE;
      border-radius: 100%;
      display: inline-block;
      -webkit-animation: sk-bouncedelay 1.4s infinite ease-in-out both;
      animation: sk-bouncedelay 1.4s infinite ease-in-out both;
    }
    .spinner .bounce1 {
      -webkit-animation-delay: -0.32s;
      animation-delay: -0.32s;
    }
    .spinner .bounce2 {
      -webkit-animation-delay: -0.16s;
      animation-delay: -0.16s;
    }
    @-webkit-keyframes sk-bouncedelay {
      0%, 80%, 100% { -webkit-transform: scale(0); }
      40% { -webkit-transform: scale(1.0); }
    }
    @keyframes sk-bouncedelay {
      0%, 80%, 100% { 
        -webkit-transform: scale(0);
        transform: scale(0);
      } 40% { 
        -webkit-transform: scale(1.0);
        transform: scale(1.0);
      }
    }
  `;

  return (
    <>
      <style>{spinnerStyles}</style>
      <div className="spinner">
        <div className="bounce1"></div>
        <div className="bounce2"></div>
        <div className="bounce3"></div>
      </div>
    </>
  );
}

export default function AllPatients({ onLogout }) {
  // Username
  const loginUsername = localStorage.getItem('username') || 'Doctor';
  const displayName = localStorage.getItem('display_name') || 'Doctor';

  // Optionally define a default logout in case one is not provided.
  const defaultLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('display_name');
    localStorage.removeItem('role');
    localStorage.removeItem('session_id');
    window.location.href = '/login';
  };
  // Use the provided onLogout prop or fallback to defaultLogout.
  const handleLogout = onLogout || defaultLogout;

  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('');

  // Modal for patient details
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Colors (matching the Admin Dashboard)
  const containerBg = useColorModeValue('gray.50', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.800');

  // Helper function to return style props based on status
  function getStatusStyles(status) {
    const s = status?.toLowerCase() || '';
    if (s === 'active') {
      // Active: light green background, green text
      return { bg: 'green.50', color: 'green.600' };
    } else if (s === 'completed' || s === 'completem') {
      // Completed (or completem): light red background, red text
      return { bg: 'red.50', color: 'red.600' };
    } else {
      // Default fallback styles
      return { bg: 'gray.50', color: 'gray.800' };
    }
  }

  // Helper function to format status text: capitalizes the first letter
  function formatStatus(status) {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  // Fetch patients on mount
  useEffect(() => {
    const fetchAllPatients = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('https://hms-backend-18lk.onrender.com/doctor/all_patients', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPatients(response.data);
        setFilteredPatients(response.data);
      } catch (error) {
        console.error('Error fetching all patients:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllPatients();
  }, []);

  // Re-filter on search, status, date, or sort changes
  useEffect(() => {
    let tempList = [...patients];

    // Search by name or PSRN
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tempList = tempList.filter((p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.psr_no && p.psr_no.toLowerCase().includes(q))
      );
    }

    // Filter by status (active/inactive)
    if (statusFilter) {
      tempList = tempList.filter(
        (p) => p.workflow_status && p.workflow_status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Filter by selected date
    if (dateFilter) {
      tempList = tempList.filter((p) => {
        if (!p.registration_time) return false;
        // Convert created_at to YYYY-MM-DD
        const createdDate = new Date(p.registration_time).toISOString().split('T')[0];
        return createdDate === dateFilter;
      });
    }

    // Sort
    if (sortBy === 'name') {
      tempList.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'date') {
      tempList.sort((a, b) => {
        const dateA = new Date(a.registration_time).getTime() || 0;
        const dateB = new Date(b.registration_time).getTime() || 0;
        return dateB - dateA;
      });
    }

    setFilteredPatients(tempList);
  }, [searchQuery, statusFilter, dateFilter, sortBy, patients]);

  // On row click, open the details modal
  const handleRowClick = (patient) => {
    setSelectedPatient(patient);
    onOpen();
  };

  // For printing
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="100vh" bg={containerBg}>
        <CustomSpinner />
      </Flex>
    );
  }

  return (
    <Flex direction="column" minH="100vh" bg={containerBg}>
      {/* Header */}
      <Flex
        as="header"
        w="100%"
        h="64px"
        px={{ base: 2, md: 3 }}
        align="center"
        justify="flex-end"
        bg="white"
        boxShadow="sm"
      >
        <HStack spacing={{ base: 2, md: 3 }}>
          <IconButton
            icon={<FiBell size={18} />}
            variant="ghost"
            size="sm"
            aria-label="Notifications"
            onClick={() => alert('Notifications')}
          />
          <IconButton
            icon={<FiMail size={18} />}
            variant="ghost"
            size="sm"
            aria-label="Messages"
            onClick={() => alert('Messages')}
          />
          <Menu>
            <MenuButton
              as={Button}
              variant="ghost"
              size="sm"
              rightIcon={<Avatar size="xs" name={displayName || loginUsername} />}
            >
              <Text fontWeight="medium" display={{ base: 'none', md: 'block' }} fontSize="sm">
                {displayName || loginUsername}
              </Text>
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiUser size={16} />} onClick={() => alert('Profile clicked')}>
                Profile
              </MenuItem>
              <MenuItem icon={<FiLogOut size={16} />} onClick={handleLogout}>
                Logout
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" flex="1" display="flex" flexDirection="column" p={{ base: 4, md: 6 }}>
        <Box
          w="full"
          maxW="1200px"
          mx="auto"
          bg={cardBg}
          boxShadow="md"
          borderRadius="lg"
          p={{ base: 4, md: 6 }}
          display="flex"
          flexDirection="column"
          h="100%"
          flex="1"
        >
          <Heading fontSize="xl" mb={4} color="blue.800">
            All Patients
          </Heading>

          {/* Filter Bar */}
          <Box
            display="flex"
            flexDir={{ base: 'column', md: 'row' }}
            alignItems={{ base: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            mb={4}
            gap={4}
          >
            <Flex flex="1" align="center" gap={4} flexWrap="wrap">
              <Text fontSize="sm" fontWeight="medium" color="gray.600" minW="50px">
                FILTER
              </Text>

              {/* Search */}
              <InputGroup w={{ base: '100%', sm: '200px', md: '250px' }}>
                <InputLeftElement pointerEvents="none">
                  <FiSearch color="gray" />
                </InputLeftElement>
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </InputGroup>

              {/* Date Filter */}
              <Flex align="center" gap={2}>
                <Text fontSize="sm" color="gray.600">
                  Date
                </Text>
                <Input
                  type="date"
                  w={{ base: '150px', md: '200px' }}
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </Flex>

              {/* Status Filter */}
              <Flex align="center" gap={2}>
                <Text fontSize="sm" color="gray.600">
                  Status
                </Text>
                <Select
                  placeholder="Default"
                  w={{ base: '120px', md: '150px' }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Flex>
            </Flex>

            {/* Sort By */}
            <Flex align="center" gap={2}>
              <Text fontSize="sm" color="gray.600">
                Sort By
              </Text>
              <Select
                placeholder="Default"
                w={{ base: '100px', md: '150px' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Name</option>
                <option value="date">Date</option>
              </Select>
            </Flex>
          </Box>

          {/* Table Section */}
          <Box flex="1" overflowY="auto">
            <Box overflowX="auto">
              <Table variant="simple">
                <Thead bg="gray.100">
                  <Tr>
                    <Th>PSRN No</Th>
                    <Th>Name</Th>
                    <Th>Submitted By</Th>
                    <Th>Status</Th>
                    <Th>Date Created</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredPatients.map((patient) => {
                    const { bg, color } = getStatusStyles(patient.workflow_status);
                    return (
                      <Tr
                        key={patient.psr_no}
                        _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                        onClick={() => handleRowClick(patient)}
                      >
                        <Td>{patient.psr_no}</Td>
                        <Td>{patient.name}</Td>
                        <Td>{patient.submitted_by || 'N/A'}</Td>
                        <Td>
                          <Box
                            as="span"
                            px={3}
                            py={1}
                            borderRadius="md"
                            fontWeight="semibold"
                            fontSize="sm"
                            bg={bg}
                            color={color}
                          >
                            {formatStatus(patient.workflow_status)}
                          </Box>
                        </Td>
                        <Td>
                          {patient.registration_time
                            ? new Date(patient.registration_time).toLocaleDateString()
                            : 'N/A'}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay
          bg="blackAlpha.600"
          backdropFilter="auto"
          backdropBlur="5px"
        />
        <ModalContent>
          <ModalHeader>Patient Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedPatient ? (
              <Box>
                <Heading as="h4" size="md" mb={2}>
                  {selectedPatient.name} (PSRN: {selectedPatient.psr_no})
                </Heading>
                <Text><strong>Age:</strong> {selectedPatient.age}</Text>
                <Text><strong>Gender:</strong> {selectedPatient.gender}</Text>
                <Text><strong>Contact:</strong> {selectedPatient.contact_no}</Text>
                <Text><strong>Address:</strong> {selectedPatient.address}</Text>
                <Text><strong>Assigned Doctor:</strong> {selectedPatient.doctor_assigned || 'None'}</Text>
                <Text><strong>Status:</strong> {selectedPatient.workflow_status}</Text>
                <Text mt={4} fontWeight="semibold">Submitted By:</Text>
                <Text mb={4}>{selectedPatient.submitted_by || 'N/A'}</Text>
              </Box>
            ) : (
              <Text>No details available.</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" mr={3} onClick={handlePrint}>
              Print
            </Button>
            <Button colorScheme="blue" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}
