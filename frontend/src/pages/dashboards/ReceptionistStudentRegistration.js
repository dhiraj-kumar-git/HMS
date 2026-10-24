import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  VStack,
  Heading,
  useToast,
  Flex,
  SimpleGrid,
  Icon,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Avatar,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton
} from '@chakra-ui/react';
import { FiArrowLeft, FiUserCheck, FiBell, FiMail, FiUser, FiLogOut } from 'react-icons/fi';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import BASE_URL from '../../utils/Config';
import { getDateISTString } from '../../utils/utils';

const ReceptionistStudentRegistration = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [registeredPatientData, setRegisteredPatientData] = useState(null);
  const username = localStorage.getItem("username");

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

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (name === 'institute_id') {
      value = value.toUpperCase().slice(0, 13);
    }
    if (name === 'name') {
      value = value.replace(/[^a-zA-Z\s']/g, '').slice(0, 40);
    }
    if (name === 'email') {
      value = value.slice(0, 60);
    }

    if (name === 'patient_type' && value === 'Temporary') {
      setFormData({ ...formData, [name]: value, address: 'Other', institute_id: '' });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.email && !formData.email.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address containing '@'.",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      return;
    }
    setLoading(true);

    // Process final address
    const finalAddress = formData.address === 'Other' ? formData.customAddress : formData.address;
    const submissionData = {
      ...formData,
      address: finalAddress
    };

    try {
      const token = localStorage.getItem("token");
      // Use receptionist register patient route
      const response = await axios.post(`${BASE_URL}/register_patient`, submissionData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast({
        title: "Registration Successful",
        description: `Patient registered successfully. Institute ID is ${response.data.institute_id}.`,
        status: "success",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      setRegisteredPatientData({
        institute_id: response.data.institute_id,
        name: formData.name,
        patient_type: formData.patient_type,
        gender: formData.gender,
        bill_status: 'none'
      });
      setShowBookingModal(true);
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
        <Box w="100%" maxW="800px" mx="auto" bg="white" borderRadius="2xl" boxShadow="xl" p={8}>
          <Button
            leftIcon={<FiArrowLeft />}
            variant="ghost"
            colorScheme="blue"
            mb={6}
            onClick={() => navigate('/receptionist/register-patient')}
          >
            Back
          </Button>

          <Flex align="center" mb={8}>
            <Icon as={FiUserCheck} w={8} h={8} color="blue.500" mr={3} />
            <Heading as="h2" size="xl" color="gray.800">
              Student & Visitors Registration
            </Heading>
          </Flex>

          <form onSubmit={handleSubmit}>
            <VStack spacing={6}>
              <SimpleGrid columns={{ base: 1, md: formData.patient_type === 'Temporary' ? 1 : 2 }} spacing={6} w="100%">
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
                    <option value="Other">Other</option>
                    <option value="Temporary">Temporary (Guest)</option>
                  </Select>
                </FormControl>

                {formData.patient_type !== 'Temporary' && (
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
                )}
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="100%">
                <FormControl isRequired>
                  <FormLabel color="gray.700">Full Name</FormLabel>
                  <Input
                    name="name"
                    placeholder="e.g. Dhiraj Kumar"
                    value={formData.name}
                    onChange={handleChange}
                    textTransform="capitalize"
                    focusBorderColor="blue.500"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color="gray.700">{formData.patient_type === 'Temporary' ? 'Email ID' : 'BITS Email ID'}</FormLabel>
                  <Input
                    name="email"
                    type="email"
                    placeholder="e.g. h20250147@pilani.bits-pilani.ac.in"
                    value={formData.email}
                    onChange={handleChange}
                    focusBorderColor="blue.500"
                  />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} w="100%">
                <FormControl isRequired>
                  <FormLabel color="gray.700">Date of Birth</FormLabel>
                  <Input
                    name="date_of_birth"
                    type="date"
                    max={getDateISTString()}
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
                <FormControl isRequired={formData.patient_type !== 'Temporary'} w="100%">
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
                  <FormControl isRequired={formData.patient_type !== 'Temporary'} w="100%">
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
      </Box>

      {/* Booking Prompt Modal */}
      <Modal isOpen={showBookingModal} onClose={() => navigate('/receptionist/register-patient')} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Book Appointment?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>Would you like to proceed with booking an appointment for the newly registered patient immediately?</Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => navigate('/receptionist/register-patient')}>
              No, return to dashboard
            </Button>
            <Button colorScheme="blue" onClick={() => navigate('/portal/book-appointment', { state: { skipOtp: true, verifiedPatientData: registeredPatientData } })}>
              Yes, book appointment
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </Flex>
  );
};

export default ReceptionistStudentRegistration;
