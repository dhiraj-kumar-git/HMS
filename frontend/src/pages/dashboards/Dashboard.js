import React from 'react';
import { Navigate } from 'react-router-dom';
import { Flex, Box, Spinner, Heading } from '@chakra-ui/react';

function Dashboard({ role }) {
  if (!role) {
    return (
      <Flex align="center" justify="center" minHeight="100vh">
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (role === 'admin') {
      return <Navigate to="/admin" />;
    }
  if (role === 'receptionist') {
    return <Navigate to="/receptionist" />;
  }
  if (role === 'doctor') {
    return <Navigate to="/doctor" />;
  }
  if (role === 'medical_store') {
    return <Navigate to="/medical_counter" />;
  }
  if (role === 'lab_staff') {
    return <Navigate to="/lab" />;
  }

  return (
    <Flex align="center" justify="center" minHeight="100vh">
      <Box
        p={10}
        bg="white"
        borderRadius="2xl"
        boxShadow="dark-lg"
        textAlign="center"
        transition="transform 0.3s ease, box-shadow 0.3s ease"
        _hover={{ transform: "scale(1.05)", boxShadow: "2xl" }}
      >
        <Heading as="h2" size="lg" color="red.500">
          Unauthorized Access
        </Heading>
      </Box>
    </Flex>
  );
}

export default Dashboard;
