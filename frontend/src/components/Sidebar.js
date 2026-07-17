// Sidebar.js
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Box, Flex, Text, Image } from "@chakra-ui/react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiHome,
  FiUserPlus,
  FiUsers,
  FiCalendar,
  FiFileText,
  FiLogOut,
  FiList,
  FiClock
} from "react-icons/fi";
import bitsLogo from "../assets/bits-logo.png";

const SidebarItem = ({ icon, label, to, collapsed }) => (
  <NavLink to={to} end style={{ textDecoration: "none" }}>
    {({ isActive }) => (
      <Flex
        align="center"
        justify={collapsed ? "center" : "flex-start"}
        p={{ base: "3", md: "4" }}
        bg={isActive ? "blue.100" : "transparent"}
        borderLeft={isActive ? "4px solid #3182CE" : "4px solid transparent"}
        cursor="pointer"
        _hover={{ bg: "blue.50" }}
        transition="all 0.2s"
        title={collapsed ? label : undefined}
      >
        <Box as={icon} mr={collapsed ? "0" : "3"} fontSize="lg" />
        {!collapsed && (
          <Text fontWeight="medium" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
            {label}
          </Text>
        )}
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

  return (
    <Box
      w={collapsed ? "75px" : { base: "200px", md: "250px" }}
      bg="white"
      boxShadow="md"
      position="sticky"
      top="0"
      h="100vh"
      display="flex"
      flexDirection="column"
      transition="width 0.2s ease-in-out"
      zIndex="10"
    >
      {/* Scrollable Navigation items container */}
      <Box flex="1" overflowY="auto" pb="60px">
        {/* HEADER SLOT */}
        <Box position="relative" h="60px" px={collapsed ? "2" : "4"} mb="4" borderBottom="1px solid" borderColor="gray.100">
          <Flex align="center" justify={collapsed ? "center" : "flex-start"} h="100%">
            <Image
              src={bitsLogo}
              alt="BITS Pilani"
              boxSize="32px"
              mr={collapsed ? 0 : 2}
            />
            {!collapsed && (
              <Text fontSize={{ base: "md", md: "lg" }} fontWeight="bold" whiteSpace="nowrap" color="blue.800">
                BITS MED-C
              </Text>
            )}
          </Flex>
        </Box>

        {/* Sidebar Navigation Items */}
        {isLoggedIn && role === "admin" && (
          <>
            <SidebarItem icon={FiHome} label="Dashboard" to="/admin" collapsed={collapsed} />
            <SidebarItem icon={FiUserPlus} label="Create User" to="/admin/create-user" collapsed={collapsed} />
            <SidebarItem icon={FiUsers} label="Users List" to="/admin/users-list" collapsed={collapsed} />
            <SidebarItem icon={FiUsers} label="Patients List" to="/admin/patients-list" collapsed={collapsed} />
            <SidebarItem icon={FiCalendar} label="Visiting Doctor Schedule" to="/admin/schedule" collapsed={collapsed} />
            <SidebarItem icon={FiCalendar} label="Appointments" to="/admin/appointments" collapsed={collapsed} />
            <SidebarItem icon={FiFileText} label="Reports" to="/admin/reports" collapsed={collapsed} />
          </>
        )}
        {isLoggedIn && role === "medical_store" && (
          <>
            <SidebarItem icon={FiHome} label="Dashboard" to="/medical_counter" collapsed={collapsed} />
            <SidebarItem icon={FiFileText} label="Bill History" to="/bill_history" collapsed={collapsed} />
            <SidebarItem icon={FiUserPlus} label="Add Medicine" to="/add-medicine" collapsed={collapsed} />
            <SidebarItem icon={FiUsers} label="Inventory" to="/inventory" collapsed={collapsed} />
          </>
        )}
        {isLoggedIn && role === "doctor" && (
          <>
            <SidebarItem icon={FiHome} label="Doctor Dashboard" to="/doctor" collapsed={collapsed} />
            <SidebarItem icon={FiUsers} label="Patient Visit History" to="/doctor/all-patients" collapsed={collapsed} />
          </>
        )}
        {isLoggedIn && role === "lab_staff" && (
          <>
            <SidebarItem icon={FiHome} label="Lab Dashboard" to="/lab" collapsed={collapsed} />
            <SidebarItem icon={FiFileText} label="Patient Lab Reports" to="/lab/all-reports" collapsed={collapsed} />
          </>
        )}
        {isLoggedIn && role === "receptionist" && (
          <>
            <SidebarItem icon={FiList} label="Booked Appointments" to="/receptionist" collapsed={collapsed} />
            <SidebarItem icon={FiClock} label="Appointment History" to="/receptionist/history" collapsed={collapsed} />
            <SidebarItem icon={FiUserPlus} label="Register Patient" to="/receptionist/register-patient" collapsed={collapsed} />
            <SidebarItem icon={FiUsers} label="Patient Directory" to="/receptionist/patient-directory" collapsed={collapsed} />
            <SidebarItem icon={FiCalendar} label="Visiting Doctor Schedule" to="/receptionist/schedule" collapsed={collapsed} />
            <SidebarItem icon={FiLogOut} label="Manage Doctor Leaves" to="/receptionist/leaves" collapsed={collapsed} />
          </>
        )}
      </Box>

      {/* Sticky Bottom Toggle Button */}
      <Flex
        h="50px"
        bg="gray.50"
        borderTop="1px solid"
        borderColor="gray.200"
        align="center"
        justify={collapsed ? "center" : "flex-end"}
        px="4"
        cursor="pointer"
        _hover={{ bg: "gray.100" }}
        onClick={toggleCollapse}
        transition="background-color 0.2s"
      >
        {collapsed ? <FiChevronRight size={20} color="#4A5568" /> : <FiChevronLeft size={20} color="#4A5568" />}
      </Flex>
    </Box>
  );
}

export default SidebarComponent;
