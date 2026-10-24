import React from 'react';
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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
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
  FiUploadCloud,
  FiBookOpen,
} from 'react-icons/fi';



import CreateUser from '../auth/CreateUser';
import UsersList from '../staff/UsersList';
import PatientsList from '../patients/PatientsList';
import DoctorSchedulePage from "../staff/DoctorSchedulePage";
import ManageSchedule from "../staff/ManageSchedule";
import BulkRegistration from '../patients/BulkRegistration';
import AdminAppointments from '../admin/AdminAppointments';
import AdminReports from '../admin/AdminReports';
import AdminBilling from '../admin/AdminBilling';
import DashboardOverview from '../admin/DashboardOverview';
import { clearLabViewUnlock } from '../../utils/labViewAccess';

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

export default function AdminDashboard({ username = 'Dr. Doctor Name', onLogout }) {
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
            BITS MED-C
          </Text>
        </Box>
        <SidebarItem icon={FiHome} label="Dashboard" to="/admin" />
        <SidebarItem icon={FiUserPlus} label="Create User" to="/admin/create-user" />
        <SidebarItem icon={FiUsers} label="Users List" to="/admin/users-list" />
        <SidebarItem icon={FiUsers} label="Patients List" to="/admin/patients-list" />
        <SidebarItem icon={FiUploadCloud} label="Bulk Registration" to="/admin/bulk-registration" />
        <SidebarItem icon={FiCalendar} label="Manage Schedules" to="/admin/manage-schedule" />
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
                  icon={<FiBookOpen />}
                  onClick={() => window.open('/guides/admin.html', '_blank', 'noopener,noreferrer')}
                >
                  User Guide
                </MenuItem>
                <MenuItem
                  icon={<FiLogOut />}
                  onClick={() => {
                    clearLabViewUnlock();
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
            <Route path="/" element={<DashboardOverview />} />
            <Route path="create-user" element={<CreateUser />} />
            <Route path="users-list" element={<UsersList />} />
            <Route path="patients-list" element={<PatientsList />} />
            <Route path="bulk-registration" element={<BulkRegistration />} />
            <Route path="manage-schedule" element={<ManageSchedule />} />
            <Route path="schedule" element={<DoctorSchedulePage />} />
            <Route path="appointments" element={<AdminAppointments />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="billing" element={<AdminBilling />} />
            <Route path="*" element={<Navigate to="" />} />
          </Routes>
        </Box>
      </Flex>
    </Flex>
  );
}
