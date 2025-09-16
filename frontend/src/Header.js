import React from 'react';
import { Flex, Box, Button, Heading, Link as ChakraLink } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

function Header({ isLoggedIn, username, role, onLogout }) {
  return (
    <Flex
      bgGradient="linear(to-r, blue.900, blue.700, blue.500)"
      p={4}
      justify="space-between"
      align="center"
      color="white"
      boxShadow="lg"
    >
      <Heading as="h1" size="lg" letterSpacing="wide">
        Hospital Management System
      </Heading>

      {isLoggedIn ? (
        <Flex align="center">
          {role === 'admin' && (
            <>
              <ChakraLink
                as={RouterLink}
                to="/admin/create-user"
                color="white"
                fontWeight="bold"
                mr={4}
                _hover={{ textDecoration: 'underline' }}
              >
                Create User
              </ChakraLink>
              <ChakraLink
                as={RouterLink}
                to="/admin/users-list"
                color="white"
                fontWeight="bold"
                mr={4}
                _hover={{ textDecoration: 'underline' }}
              >
                Users List
              </ChakraLink>
              <ChakraLink
                as={RouterLink}
                to="/admin/patients-list"
                color="white"
                fontWeight="bold"
                mr={4}
                _hover={{ textDecoration: 'underline' }}
              >
                Patients List
              </ChakraLink>
            </>
          )}
          {role === 'medical_store' && (
            <>
              <ChakraLink
                as={RouterLink}
                to="/medical_counter"
                color="white"
                fontWeight="bold"
                mr={4}
                _hover={{ textDecoration: 'underline' }}
              >
                Dashboard
              </ChakraLink>
              <ChakraLink
                as={RouterLink}
                to="/add-medicine"
                color="white"
                fontWeight="bold"
                mr={4}
                _hover={{ textDecoration: 'underline' }}
              >
                Add Medicine
              </ChakraLink>
              <ChakraLink
                as={RouterLink}
                to="/inventory"
                color="white"
                fontWeight="bold"
                mr={4}
                _hover={{ textDecoration: 'underline' }}
              >
                Inventory
              </ChakraLink>
            </>
          )}
          <Box mr={4} fontWeight="bold">
            Welcome, {username}
          </Box>
          <Button
            colorScheme="red"
            variant="solid"
            onClick={onLogout}
            _hover={{ bg: 'red.500', transform: 'scale(1.05)' }}
            transition="all 0.2s ease"
            borderRadius="full"
          >
            Logout
          </Button>
        </Flex>
      ) : (
        <Button colorScheme="green" variant="solid" onClick={() => (window.location.href = '/login')}>
          Login
        </Button>
      )}
    </Flex>
  );
}

export default Header;
