import React from "react";
import { Box, Flex, Heading, Text, VStack, HStack, SimpleGrid, Icon, IconButton, Menu, MenuButton, MenuList, MenuItem, Avatar, Button } from "@chakra-ui/react";
import { FiUsers, FiUserCheck, FiBell, FiMail, FiUser, FiLogOut } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from "../../utils/Config";

const RegistrationTile = ({ title, description, icon, onClick, colorScheme }) => {
  return (
    <Box
      as="button"
      onClick={onClick}
      w="100%"
      p={8}
      bg="white"
      borderRadius="xl"
      boxShadow="lg"
      transition="all 0.3s ease"
      borderTop="4px solid"
      borderTopColor={`${colorScheme}.500`}
      _hover={{ transform: "translateY(-5px)", boxShadow: "2xl" }}
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      gap={4}
    >
      <Flex
        w={16}
        h={16}
        borderRadius="full"
        bg={`${colorScheme}.100`}
        color={`${colorScheme}.600`}
        align="center"
        justify="center"
      >
        <Icon as={icon} boxSize={8} />
      </Flex>
      <VStack spacing={2}>
        <Heading size="md" color="gray.700">
          {title}
        </Heading>
        <Text color="gray.500" fontSize="sm">
          {description}
        </Text>
      </VStack>
    </Box>
  );
};

export default function ReceptionistRegistration() {
  const navigate = useNavigate();
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
          Register Patient
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
      <Box p={{ base: "4", md: "8" }} flex="1" overflowY="auto">
        <VStack spacing={8} maxW="1000px" mx="auto" w="100%">
          <Box textAlign="center" mb={4}>
            <Heading size="lg" color="gray.800" mb={2}>
              Select Registration Type
            </Heading>
            <Text color="gray.600">
              Please choose the category for the patient you are registering today.
            </Text>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8} w="100%">
            <RegistrationTile
              title="Student & Visitors"
              description="Register a new student, alumni, or general visitor into the system."
              icon={FiUsers}
              colorScheme="blue"
              onClick={() => navigate("/receptionist/register-student")}
            />
            <RegistrationTile
              title="Faculty & Staff"
              description="Register a faculty/staff member and add their dependants."
              icon={FiUserCheck}
              colorScheme="teal"
              onClick={() => navigate("/receptionist/register-staff")}
            />
          </SimpleGrid>
        </VStack>
      </Box>
    </Flex>
  );
}
