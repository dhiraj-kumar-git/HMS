import React, { useState } from 'react';
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
  SimpleGrid,
  Textarea
} from '@chakra-ui/react';
import { FiArrowLeft, FiUserCheck } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import BASE_URL from './Config';

const PatientRegistration = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const hostels = ["Ashok Bhawan", "Bhagirath Bhawan", "Budh Bhawan",
    "CVR Bhawan", "Gandhi Bhawan", "Krishna Bhawan", "Malviya Studio Apartment (MSA)",
    "Malviya Bhawan - A block", "Malviya Bhawan - B block", "Malviya Bhawan - C block",
    "Meera Bhawan", "Ram Bhawan", "Rana Pratap Bhawan", "Shankar Bhawan", "Vishwakarma Bhawan", "Vyas Bhawan"];
  const [formData, setFormData] = useState({
    institute_id: '',
    name: '',
    email: '',
    date_of_birth: '',
    gender: '',
    contact_no: '',
    patient_type: '',
    address: '',
    customAddress: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Process final address
    const finalAddress = formData.address === 'Other' ? formData.customAddress : formData.address;
    const submissionData = {
      ...formData,
      address: finalAddress
    };

    try {
      const response = await axios.post(`${BASE_URL}/api/public/register`, submissionData);
      toast({
        title: "Registration Successful",
        description: `Your Institute ID is ${response.data.institute_id}. Directing to booking...`,
        status: "success",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      // Transition automatically to Booking
      setTimeout(() => {
        navigate('/portal/book-appointment', { state: { autoFillInstituteId: formData.institute_id } });
      }, 1500);
    } catch (err) {
      toast({
        title: "Registration Failed",
        description: err.response?.data?.error || "An error occurred.",
        status: "error",
        duration: 4000,
        isClosable: true,
        position: 'top'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex minH="100vh" bg="gray.50" align="center" justify="center" p={6}>
      <Box w="100%" maxW="800px" bg="white" borderRadius="2xl" boxShadow="xl" p={8}>
        <Button
          leftIcon={<FiArrowLeft />}
          variant="ghost"
          colorScheme="blue"
          mb={6}
          onClick={() => navigate('/portal')}
        >
          Back to Portal
        </Button>

        <Flex align="center" mb={8}>
          <Icon as={FiUserCheck} w={8} h={8} color="blue.500" mr={3} />
          <Heading as="h2" size="xl" color="gray.800">
            Self Registration
          </Heading>
        </Flex>

        <form onSubmit={handleSubmit}>
          <VStack spacing={6}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="100%">
              <FormControl isRequired>
                <FormLabel color="gray.700">BITS Institute ID</FormLabel>
                <Input
                  name="institute_id"
                  placeholder="e.g. 2025H1120147P"
                  value={formData.institute_id}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="gray.700">Full Name</FormLabel>
                <Input
                  name="name"
                  placeholder="e.g. Dhiraj Kumar"
                  value={formData.name}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                />
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="100%">
              <FormControl isRequired>
                <FormLabel color="gray.700">BITS Email ID</FormLabel>
                <Input
                  name="email"
                  type="email"
                  placeholder="e.g. h20250147@pilani.bits-pilani.ac.in"
                  value={formData.email}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="gray.700">Patient Type</FormLabel>
                <Select
                  name="patient_type"
                  placeholder="Select Type"
                  value={formData.patient_type}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                >
                  <option value="Student">Student</option>
                  <option value="Faculty">Faculty</option>
                  <option value="Staff">Staff</option>
                  <option value="Dependent">Dependent</option>
                  <option value="Other">Other</option>
                </Select>
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} w="100%">
              <FormControl isRequired>
                <FormLabel color="gray.700">Date of Birth</FormLabel>
                <Input
                  name="date_of_birth"
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="gray.700">Gender</FormLabel>
                <Select
                  name="gender"
                  placeholder="Select Gender"
                  value={formData.gender}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="gray.700">Contact Number</FormLabel>
                <Input
                  name="contact_no"
                  type="tel"
                  maxLength={10}
                  placeholder="e.g. 9876543210"
                  value={formData.contact_no}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                />
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: formData.address === 'Other' ? 2 : 1 }} spacing={6} w="100%">
              <FormControl isRequired w="100%">
                <FormLabel color="gray.700">Address / Hostel</FormLabel>
                <Select
                  name="address"
                  placeholder="Select Address / Hostel"
                  value={formData.address}
                  onChange={handleChange}
                  focusBorderColor="blue.500"
                >
                  {hostels.map((hostel) => (
                    <option key={hostel} value={hostel}>
                      {hostel}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </Select>
              </FormControl>

              {formData.address === 'Other' && (
                <FormControl isRequired w="100%">
                  <FormLabel color="gray.700">Custom Address Details</FormLabel>
                  <Input
                    name="customAddress"
                    placeholder="e.g. Details..."
                    value={formData.customAddress}
                    onChange={handleChange}
                    focusBorderColor="blue.500"
                  />
                </FormControl>
              )}
            </SimpleGrid>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              w="100%"
              borderRadius="xl"
              isLoading={loading}
              loadingText="Registering..."
              mt={4}
            >
              Complete Registration
            </Button>
          </VStack>
        </form>
      </Box>
    </Flex>
  );
};

export default PatientRegistration;
