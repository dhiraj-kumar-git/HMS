import React, { useState, useEffect } from 'react';
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  IconButton,
  Avatar,
  Input,
  InputGroup,
  InputLeftElement,
  HStack,
  Divider,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from '@chakra-ui/react';
import {
  FiSearch,
  FiBell,
  FiMail,
  FiHome,
  FiUserPlus,
  FiUsers,
  FiCalendar,
  FiFileText,
  FiCreditCard,
  FiMail as FiMailbox,
  FiLogOut,
  FiUser,
} from 'react-icons/fi';
import {
  AreaChart,
  Area,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from 'recharts';
import axios from 'axios';

import CreateUser from './CreateUser';
import UsersList from './UsersList';
import PatientsList from './PatientsList';
import DoctorSchedulePage from "./DoctorSchedulePage";

// Reusable component for the sidebar nav items
const SidebarItem = ({ icon, label, to }) => (
  <NavLink to={to} end style={{ textDecoration: 'none' }}>
    {({ isActive }) => (
      <Flex
        align="center"
        p={{ base: '3', md: '4' }}
        bg={isActive ? 'blue.100' : 'transparent'}
        borderLeft={isActive ? '4px solid #3182CE' : '4px solid transparent'}
        cursor="pointer"
        _hover={{ bg: 'blue.50' }}
        transition="all 0.2s"
      >
        <Box as={icon} mr="3" />
        <Text fontWeight="medium">{label}</Text>
      </Flex>
    )}
  </NavLink>
);

// A custom card for top stats
const StatCard = ({ title, value, icon, bgGradient }) => (
  <Box
    p={{ base: '3', md: '4' }}
    borderRadius="lg"
    color="white"
    bgGradient={bgGradient}
    boxShadow="md"
    position="relative"
    overflow="hidden"
  >
    <Stat>
      <Flex align="center" justify="space-between">
        <Box>
          <StatLabel fontWeight="medium" fontSize={{ base: 'sm', md: 'md' }}>
            {title}
          </StatLabel>
          <StatNumber fontSize={{ base: 'xl', md: '2xl' }} mt="2">
            {value}
          </StatNumber>
          <StatHelpText mt="1" opacity={0.8} fontSize={{ base: 'xs', md: 'sm' }}>
            {title === 'Hospital Earning' ? 'Last 24 hrs' : 'Update now'}
          </StatHelpText>
        </Box>
        <Box as={icon} boxSize={{ base: '6', md: '8' }} opacity={0.9} />
      </Flex>
    </Stat>
  </Box>
);

// Demo data for the line chart
const hospitalSurveyData = [
  { name: 'Jan', General: 100, Private: 80 },
  { name: 'Feb', General: 120, Private: 90 },
  { name: 'Mar', General: 140, Private: 100 },
  { name: 'Apr', General: 110, Private: 70 },
  { name: 'May', General: 160, Private: 120 },
  { name: 'Jun', General: 180, Private: 130 },
];

// Demo data for the bar chart (Student, Staff, Other)
const patientTypeData = [
  { category: 'Student', count: 635 },
  { category: 'Staff', count: 930 },
  { category: 'Other', count: 1250 }
];

export default function AdminDashboard({ username = 'Dr. David Wilson', onLogout }) {
  const navigate = useNavigate();
  const headerHeight = 64; // Define header height (in pixels)

  return (
    <Flex w="100vw" h="100vh" bg="gray.50" overflow="hidden">
      {/* Sidebar */}
      <Box
            w={{ base: '200px', md: '250px' }}
            bg="white"
            boxShadow="md"
            position="sticky"
            top="0"
            h="100vh"
            overflowY="auto"
          >
            {/* HEADER SLOT */}
            <Box position="relative" h="48px" px="4" mb="4">
              <Text
                position="absolute"
                top="60%"
                transform="translateY(-50%)"
                fontSize={{ base: 'xl', md: '2xl' }}
                fontWeight="bold"
              >
                BitsMed
              </Text>
            </Box>
        <SidebarItem icon={FiHome} label="Dashboard" to="/admin" />
        <SidebarItem icon={FiUserPlus} label="Create User" to="/admin/create-user" />
        <SidebarItem icon={FiUsers} label="Users List" to="/admin/users-list" />
        <SidebarItem icon={FiUsers} label="Patients List" to="/admin/patients-list" />
        <SidebarItem icon={FiCalendar} label="Visiting Doctor Schedule" to="/admin/schedule" />
        <SidebarItem icon={FiCalendar} label="Appointments" to="/admin/appointments" />
        <SidebarItem icon={FiFileText} label="Reports" to="/admin/reports" />
        <SidebarItem icon={FiCreditCard} label="Billing" to="/admin/billing" />
        <SidebarItem icon={FiMailbox} label="Mailbox" to="/admin/mailbox" />
        <Divider my="6" />
      </Box>

      {/* Main Content */}
      <Flex direction="column" flex="1" overflow="hidden">
        {/* Top Bar */}
        <Flex
          as="header"
          flexShrink="0"
          justify="space-between"
          align="center"
          p={{ base: '3', md: '4' }}
          bg="white"
          boxShadow="sm"
          h={`${headerHeight}px`}
        >
          <InputGroup w={{ base: '200px', md: '300px' }}>
            <InputLeftElement pointerEvents="none" children={<FiSearch />} />
            <Input placeholder="Search..." bg="gray.100" />
          </InputGroup>
          <HStack spacing={{ base: '3', md: '4' }}>
            <IconButton icon={<FiBell />} variant="ghost" aria-label="Notifications" />
            <IconButton icon={<FiMail />} variant="ghost" aria-label="Messages" />
            <Menu>
              <MenuButton
                as={Button}
                variant="ghost"
                rightIcon={<Avatar size={{ base: 'sm', md: 'sm' }} name={username} ml="2" />}
              >
                <Text fontWeight="medium" mr="2">
                  Welcome, {username}
                </Text>
              </MenuButton>
              <MenuList>
                <MenuItem icon={<FiUser />} onClick={() => alert('Profile clicked!')}>
                  Profile
                </MenuItem>
                <MenuItem
                  icon={<FiLogOut />}
                  onClick={() => {
                    onLogout();
                    navigate('/login');
                  }}
                >
                  Logout
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>

        {/* Content Area with dynamic height */}
        <Box
          as="main"
          flex="1"
          p={{ base: '3', md: '4' }}
          overflowY="auto"
          h={`calc(100vh - ${headerHeight}px)`}
        >
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="create-user" element={<CreateUser />} />
            <Route path="users-list" element={<UsersList />} />
            <Route path="patients-list" element={<PatientsList />} />
            <Route path="schedule" element={<DoctorSchedulePage />} />
            <Route path="*" element={<Navigate to="" />} />
          </Routes>
        </Box>
      </Flex>
    </Flex>
  );
}

// A separate component for the main “dashboard” content
function DashboardHome() {
  // We add a modal for viewing all New Patients
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [newPatients, setNewPatients] = useState([]);
  
  // Fetch new patients from the backend when DashboardHome mounts.
  useEffect(() => {
    const fetchNewPatients = async () => {
      try {
        const token = localStorage.getItem('token');
        // Fetch all patients via the admin endpoint.
        const response = await axios.get("https://hms-backend-18lk.onrender.com/patients", {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Optionally, filter for active patients (assuming new patients are those with workflow_status === "active")
        const activePatients = response.data.filter(patient => patient.workflow_status === "active");
        setNewPatients(activePatients);
      } catch (error) {
        console.error("Error fetching new patients:", error);
      }
    };
    fetchNewPatients();
  }, []);

  return (
    <>
      {/* Top row: Stats Cards */}
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={{ base: '4', md: '6' }} mb="8">
        <StatCard
          title="New Patients"
          value={newPatients.length}
          icon={FiUsers}
          bgGradient="linear(to-r, teal.400, blue.400)"
        />
        <StatCard
          title="Our Doctors"
          value="12"
          icon={FiUserPlus}
          bgGradient="linear(to-r, green.400, green.600)"
        />
        <StatCard
          title="Today's Operation"
          value="05"
          icon={FiCalendar}
          bgGradient="linear(to-r, orange.400, orange.500)"
        />
        <StatCard
          title="Hospital Earning"
          value="₹​ 36,546"
          icon={FiCreditCard}
          bgGradient="linear(to-r, gray.600, gray.700)"
        />
      </SimpleGrid>

      {/* Middle row: Hospital Survey on left and a right column with New Patient List & Bar Chart */}
      <Flex flexDir={{ base: 'column', lg: 'row' }} gap={{ base: '4', md: '6' }} mb="6">
        {/* Left: Hospital Survey (Line Chart) */}
        <Box
          flex="1"
          p={{ base: '3', md: '4' }}
          bg="white"
          boxShadow="md"
          borderRadius="lg"
        >
          <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="semibold" mb="2">
            Hospital Survey
          </Text>
          <Text fontSize={{ base: 'sm', md: 'sm' }} color="gray.500" mb="4">
            General & Private
          </Text>
          <Box width="100%" height={{ base: '20vh', md: '25vh' }}>
            <ResponsiveContainer>
              <AreaChart data={hospitalSurveyData}>
                <defs>
                  <linearGradient id="colorGeneral" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPrivate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="General"
                  stroke="#8884d8"
                  fill="url(#colorGeneral)"
                />
                <Area
                  type="monotone"
                  dataKey="Private"
                  stroke="#82ca9d"
                  fill="url(#colorPrivate)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        {/* Right Column: New Patient List Table and Patient Categories (Bar Chart) */}
        <Flex direction="column" flex="1" gap={{ base: '4', md: '6' }}>
          {/* New Patient List Table */}
          <Box
            p={{ base: '3', md: '4' }}
            bg="white"
            boxShadow="md"
            borderRadius="lg"
          >
            <Flex align="center" justify="space-between" mb="2">
              <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="semibold">
                New Patient List
              </Text>
              {/* "View All" Button */}
              <Button variant="outline" size="sm" onClick={onOpen}>
                View All
              </Button>
            </Flex>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Address</Th>
                  <Th>Disease</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {newPatients.slice(0, 3).map((p) => (
                  <Tr key={p.psr_no}>
                    <Td>{p.name}</Td>
                    <Td>{p.address}</Td>
                    <Td>{p.disease}</Td>
                    <Td>{p.workflow_status}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>

          {/* Stats for Patient Categories (Bar Chart) */}
          <Box
            p={{ base: '3', md: '4' }}
            bg="white"
            boxShadow="md"
            borderRadius="lg"
            flex="1"
          >
            <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="semibold" mb="2">
              Patient Categories
            </Text>
            <Box width="100%" height={{ base: '15vh', md: '20vh' }}>
              <ResponsiveContainer>
                <BarChart data={patientTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#3182CE" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Flex>
      </Flex>

      {/* Modal for viewing all new patients */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent maxW={{ base: '90%', md: '800px' }}>
          <ModalHeader>All New Patients</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Address</Th>
                  <Th>Disease</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {newPatients.map((p) => (
                  <Tr key={p.psr_no}>
                    <Td>{p.name}</Td>
                    <Td>{p.address}</Td>
                    <Td>{p.disease}</Td>
                    <Td>{p.workflow_status}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
