import React from "react";
import { Box, Flex, Heading, Text, IconButton, HStack, Menu, MenuButton, MenuList, MenuItem, Button, Avatar } from "@chakra-ui/react";
import { FiBell, FiMail, FiUser, FiLogOut } from "react-icons/fi";
import axios from "axios";
import BASE_URL from "../../utils/Config";
import ReceptionistQueue from "./ReceptionistQueue";

export default function ReceptionistDashboard() {
  const username = localStorage.getItem("username");

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("token");
      const session_id = localStorage.getItem("session_id");
      if (token && session_id) {
        await axios.post(
          `${BASE_URL}/logout`,
          { session_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      localStorage.removeItem("role");
      localStorage.removeItem("session_id");
      window.location.href = "/login";
    }
  };

  return (
    <Flex direction="column" h="100vh" bg="gray.50" overflow="hidden">
      {/* HEADER */}
      <Flex
        as="header"
        w="100%"
        h="64px"
        bg="white"
        boxShadow="sm"
        align="center"
        px="4"
        justify="space-between"
      >
        <Heading size="md" color="blue.800">
          Receptionist Dashboard
        </Heading>
        <HStack spacing="4">
          <IconButton icon={<FiBell />} variant="ghost" aria-label="Notifications" />
          <IconButton icon={<FiMail />} variant="ghost" aria-label="Messages" />
          <Menu>
            <MenuButton as={Button} variant="ghost" rightIcon={<Avatar size="sm" name={username} />}>
              <Text fontWeight="medium">Welcome, {username}</Text>
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiUser />}>Profile</MenuItem>
              <MenuItem icon={<FiLogOut />} onClick={handleLogout}>Logout</MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      {/* Main Content Area */}
      <Box p={{ base: "4", md: "6" }} flex="1" overflowY="auto">
        <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
          <Heading size="md" mb={4}>Appointments Dashboard</Heading>
          <ReceptionistQueue />
        </Box>
      </Box>
    </Flex>
  );
}
