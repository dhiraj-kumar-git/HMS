import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  VStack,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Select,
  Button,
  Text,
  useToast,
  Icon,
  Divider,
} from '@chakra-ui/react';
import { FiArrowLeft, FiCheckCircle, FiCalendar } from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import BASE_URL from './Config';

const PatientBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [instituteId, setInstituteId] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const [doctors, setDoctors] = useState([]);
  const [bookingData, setBookingData] = useState({
    doctor_username: '',
    time: ''
  });
  const [bookingLoading, setBookingLoading] = useState(false);

  // Check if we came directly from registration
  useEffect(() => {
    if (location.state && location.state.autoFillInstituteId) {
      setInstituteId(location.state.autoFillInstituteId);
      handleVerify(location.state.autoFillInstituteId);
    }
  }, [location]);

  useEffect(() => {
    if (verifiedPatient) {
      fetchDoctors();
    }
  }, [verifiedPatient]);

  const fetchDoctors = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/public/doctors`);
      setDoctors(response.data);
    } catch (err) {
      console.error("Failed to fetch doctors", err);
    }
  };

  const handleVerify = async (idToVerify) => {
    const id = idToVerify || instituteId;
    if (!id) return;
    setVerifying(true);
    try {
      const response = await axios.post(`${BASE_URL}/api/public/verify`, { institute_id: id });
      setVerifiedPatient(response.data);
      toast({
        title: "Verified",
        description: `Welcome back, ${response.data.name}`,
        status: "success",
        duration: 2000,
        position: 'top',
        isClosable: true,
      });
    } catch (err) {
      setVerifiedPatient(null);
      toast({
        title: "Verification Failed",
        description: err.response?.data?.error || "Institute ID not found.",
        status: "error",
        duration: 3000,
        position: 'top',
        isClosable: true,
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!bookingData.doctor_username || !bookingData.time) {
      toast({
        title: "Error",
        description: "Please select a doctor and time.",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      return;
    }

    setBookingLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/public/book`, {
        psr_no: verifiedPatient.psr_no,
        doctor_username: bookingData.doctor_username,
        time: bookingData.time
      });

      toast({
        title: "Appointment Confirmed",
        description: "Your slot has been successfully booked.",
        status: "success",
        duration: 4000,
        position: 'top',
        isClosable: true,
      });

      // Clear the form after success
      setBookingData({ doctor_username: '', time: '' });
      setTimeout(() => navigate('/portal'), 2000);
      
    } catch (err) {
      toast({
        title: "Booking Failed",
        description: err.response?.data?.error || "Could not book appointment.",
        status: "error",
        duration: 3000,
        position: 'top',
        isClosable: true,
      });
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <Flex minH="100vh" bg="gray.50" align="center" justify="center" p={6}>
      <Box w="100%" maxW="600px" bg="white" borderRadius="2xl" boxShadow="xl" p={8}>
        <Button
          leftIcon={<FiArrowLeft />}
          variant="ghost"
          colorScheme="teal"
          mb={6}
          onClick={() => navigate('/portal')}
        >
          Back to Portal
        </Button>

        <Flex align="center" mb={6}>
          <Icon as={FiCalendar} w={8} h={8} color="teal.500" mr={3} />
          <Heading as="h2" size="xl" color="gray.800">
            Book Appointment
          </Heading>
        </Flex>

        {!verifiedPatient ? (
          <VStack spacing={6}>
            <Text color="gray.600" w="100%">
              Enter your Institute ID to fetch your patient record and book an appointment.
            </Text>
            <FormControl>
              <FormLabel color="gray.700">Institute ID</FormLabel>
              <Input
                placeholder="e.g. 2021A7PS0001G"
                value={instituteId}
                onChange={(e) => setInstituteId(e.target.value)}
                focusBorderColor="teal.500"
                size="lg"
              />
            </FormControl>
            <Button
              colorScheme="teal"
              size="lg"
              w="100%"
              borderRadius="xl"
              isLoading={verifying}
              onClick={() => handleVerify(instituteId)}
            >
              Verify Patient
            </Button>
          </VStack>
        ) : (
          <VStack spacing={6} align="stretch">
            <Flex align="center" p={4} bg="teal.50" borderRadius="xl" border="1px solid" borderColor="teal.200">
              <Icon as={FiCheckCircle} w={6} h={6} color="teal.500" mr={3} />
              <Box>
                <Text fontSize="sm" color="teal.700" fontWeight="bold">Verified Profile</Text>
                <Text fontSize="lg" color="teal.900">{verifiedPatient.name}</Text>
                <Text fontSize="xs" color="teal.600">PSR: {verifiedPatient.psr_no}</Text>
              </Box>
            </Flex>

            <Divider />

            <form onSubmit={handleBooking}>
              <VStack spacing={5}>
                <FormControl isRequired>
                  <FormLabel color="gray.700">Select Doctor</FormLabel>
                  <Select
                    placeholder="Choose an available doctor"
                    value={bookingData.doctor_username}
                    onChange={(e) => setBookingData({ ...bookingData, doctor_username: e.target.value })}
                    focusBorderColor="teal.500"
                    size="lg"
                  >
                    {doctors.map((doc, idx) => (
                      <option key={idx} value={doc.username}>
                        {doc.display_name}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color="gray.700">Appointment Time</FormLabel>
                  {/* Since doctors dashboard accepts free form time currently, we use datetime-local or text. We use text string similar to existing flow, or datetime-local */}
                  <Input
                    type="datetime-local"
                    value={bookingData.time}
                    onChange={(e) => setBookingData({ ...bookingData, time: e.target.value })}
                    focusBorderColor="teal.500"
                    size="lg"
                  />
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="teal"
                  size="lg"
                  w="100%"
                  borderRadius="xl"
                  mt={4}
                  isLoading={bookingLoading}
                  loadingText="Confirming..."
                >
                  Confirm Appointment
                </Button>
              </VStack>
            </form>
          </VStack>
        )}
      </Box>
    </Flex>
  );
};

export default PatientBooking;
