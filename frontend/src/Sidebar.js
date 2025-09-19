// Sidebar.js
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Box, Flex, Text, Button } from '@chakra-ui/react';
import {
  FiChevronLeft,
  FiChevronRight,
  FiLogOut,
  FiHome,
  FiUserPlus,
  FiUsers,
  FiCalendar,
  FiFileText
} from 'react-icons/fi';

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

function SidebarComponent({ isLoggedIn, username, role, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const toggleIcon = collapsed 
    ? <FiChevronRight color="#fff" /> 
    : <FiChevronLeft color="#fff" />;

  return (
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

      {/* Sidebar Navigation Items */}
      {isLoggedIn && role === 'admin' && (
        <>
          <SidebarItem icon={FiHome} label="Dashboard" to="/admin" />
          <SidebarItem icon={FiUserPlus} label="Create User" to="/admin/create-user" />
          <SidebarItem icon={FiUsers} label="Users List" to="/admin/users-list" />
          <SidebarItem icon={FiUsers} label="Patients List" to="/admin/patients-list" />
          <SidebarItem icon={FiCalendar} label="Visiting Doctor Schedule" to="/admin/schedule" />
          <SidebarItem icon={FiCalendar} label="Appointments" to="/admin/appointments" />
          <SidebarItem icon={FiFileText} label="Reports" to="/admin/reports" />
        </>
      )}
      {isLoggedIn && role === 'medical_store' && (
        <>
          <SidebarItem icon={FiHome} label="Dashboard" to="/medical_counter" />
          <SidebarItem icon={FiUserPlus} label="Add Medicine" to="/add-medicine" />
          <SidebarItem icon={FiUsers} label="Inventory" to="/inventory" />
        </>
      )}
      {isLoggedIn && role === 'doctor' && (
        <>
          <SidebarItem icon={FiHome} label="Doctor Dashboard" to="/doctor" />
          <SidebarItem icon={FiUsers} label="View All Patients" to="/doctor/all-patients" />
        </>
      )}
      {isLoggedIn && role === 'lab_staff' && (
        <SidebarItem icon={FiHome} label="Lab Dashboard" to="/lab" />
      )}

      

    
    </Box>
  );
}

export default SidebarComponent;
