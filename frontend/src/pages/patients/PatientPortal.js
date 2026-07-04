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
import { FiCalendar } from 'react-icons/fi';
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
      position="relative"
    >
      <VStack spacing={8} maxW="1100px" w="100%">
        <Box textAlign="center">
          <Heading
            as="h1"
            size="xl"
            bgGradient="linear(to-r, blue.500, teal.400)"
            bgClip="text"
            fontWeight="extrabold"
            mb={4}
          >
            Welcome to BITS Medical Center Patient Portal
          </Heading>
          <Text fontSize="lg" color="gray.600">
            Book an appointment with a doctor for your medical consultation.
          </Text>
          <Text fontSize="sm" color="gray.500" mt={2}>
            Note: If you are not registered in the system, please visit the reception desk first.
          </Text>
        </Box>

        <Flex
          w="100%"
          flexDir={{ base: 'column', md: 'row' }}
          gap={8}
          justify="center"
          align="center"
        >
          {/* Returning Patient Card */}
          <Flex
            bg={cardBg}
            p={8}
            borderRadius="2xl"
            boxShadow="xl"
            w="100%"
            maxW="450px"
            direction="column"
            justify="space-between"
            transition="all 0.3s ease"
            _hover={{ transform: 'translateY(-5px)', boxShadow: '2xl' }}
            textAlign="center"
          >
            <Box>
              <Icon as={FiCalendar} w={12} h={12} color="teal.500" mb={4} />
              <Heading as="h3" size="lg" mb={4} color="gray.700">
                Book an Appointment
              </Heading>
              <Text color="gray.500" mb={4} fontSize="md">
                Registered patients can book a new appointment using their Institute ID.
                After booking, please visit the reception desk where the receptionist will confirm your appointment with the doctor and provide you with a prescription slip printout.
              </Text>
            </Box>
            <Button
              size="lg"
              colorScheme="teal"
              w="100%"
              borderRadius="xl"
              onClick={() => navigate('/portal/book-appointment')}
            >
              Book Appointment
            </Button>
          </Flex>
        </Flex>
      </VStack>
      <Button
        mt={12}
        variant="ghost"
        colorScheme="gray"
        onClick={() => navigate('/login')}
        size="sm"
        _hover={{ bg: useColorModeValue('gray.200', 'gray.700') }}
      >
        Clinic Staff Login
      </Button>
    </Flex>
  );
};

export default PatientPortal;
