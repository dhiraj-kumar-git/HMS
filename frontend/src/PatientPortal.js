import React from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  Button,
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { FiUserPlus, FiCalendar } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const PatientPortal = () => {
  const navigate = useNavigate();
  const bg = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');

  return (
    <Flex
      minH="100vh"
      w="100%"
      bg={bg}
      align="center"
      justify="center"
      p={6}
      flexDir="column"
    >
      <VStack spacing={8} maxW="800px" w="100%">
        <Box textAlign="center">
          <Heading
            as="h1"
            size="2xl"
            bgGradient="linear(to-r, blue.500, teal.400)"
            bgClip="text"
            fontWeight="extrabold"
            mb={4}
          >
            Welcome to the Patient Portal
          </Heading>
          <Text fontSize="lg" color="gray.600">
            Self-service platform for seamless registration and appointment booking.
          </Text>
        </Box>

        <Flex
          w="100%"
          flexDir={{ base: 'column', md: 'row' }}
          gap={8}
          justify="center"
        >
          {/* New Patient Card */}
          <Box
            bg={cardBg}
            p={8}
            borderRadius="2xl"
            boxShadow="xl"
            flex="1"
            transition="all 0.3s ease"
            _hover={{ transform: 'translateY(-5px)', boxShadow: '2xl' }}
            textAlign="center"
          >
            <Icon as={FiUserPlus} w={12} h={12} color="blue.500" mb={4} />
            <Heading as="h3" size="lg" mb={4} color="gray.700">
              New Visitors
            </Heading>
            <Text color="gray.500" mb={8}>
              First time here? Register seamlessly into our system using your Institute ID to get started.
            </Text>
            <Button
              size="lg"
              colorScheme="blue"
              w="100%"
              borderRadius="xl"
              onClick={() => navigate('/portal/register')}
            >
              Register Now
            </Button>
          </Box>

          {/* Returning Patient Card */}
          <Box
            bg={cardBg}
            p={8}
            borderRadius="2xl"
            boxShadow="xl"
            flex="1"
            transition="all 0.3s ease"
            _hover={{ transform: 'translateY(-5px)', boxShadow: '2xl' }}
            textAlign="center"
          >
            <Icon as={FiCalendar} w={12} h={12} color="teal.500" mb={4} />
            <Heading as="h3" size="lg" mb={4} color="gray.700">
              Returning Patients
            </Heading>
            <Text color="gray.500" mb={8}>
              Already registered? Book a new appointment quickly with your Institute ID.
            </Text>
            <Button
              size="lg"
              colorScheme="teal"
              w="100%"
              borderRadius="xl"
              onClick={() => navigate('/portal/book')}
            >
              Book Appointment
            </Button>
          </Box>
        </Flex>
      </VStack>
    </Flex>
  );
};

export default PatientPortal;
