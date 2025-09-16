import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  IconButton,
  Avatar,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  useToast,
  Heading,
  FormControl,
  FormLabel,
  Stack,
  Textarea,
  Select,
  Input,
  useDisclosure,
} from '@chakra-ui/react';
import {
  FiBell,
  FiMail,
  FiUser,
  FiLogOut
} from 'react-icons/fi';
import axios from 'axios';
import PrescriptionModal from './PrescriptionModal';

const headerHeight = 64; // same header height as AdminDashboard

export default function ReceptionistDashboard() {
  const toast = useToast();
  const username = localStorage.getItem('username');

  const [patient, setPatient] = useState({
    name: '',
    age: '',
    gender: '',
    contact_no: '',
    address: '',
    psrn_id: '',
    doctor_assigned: '',
    patient_type: '',
  });
  const [opdNumber, setOpdNumber] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Doctor visiting schedule
  const schedule = {
    Monday: [],
    Tuesday: [
      { name: "Dr. Kishore Singh (Dermato)", time: "6:00 PM – 7:30 PM" },
    ],
    Wednesday: [
      { name: "Dr. Karan Singh (Pediatrician)", time: "6:00 PM – 7:00 PM" },
      { name: "Dr. Ramesh P. Jajoo (Ayurved)", time: "8:00 AM – 10:00 AM" },
      { name: "Dr. Rinku Singh (Gyno)", time: "7:00 PM – 8:00 PM" },
      { name: "Dr. Prashant Singh (Ortho)", time: "7:00 PM – 8:00 PM" },
      { name: "Dr. Preeti Maan (Dentist)", time: "5:00 PM – 6:30 PM" },
    ],
    Thursday: [
      { name: "Dr. Pooja Shah (ENT)", time: "5:30 PM – 6:30 PM" },
    ],
    Friday: [
      { name: "Dr. Karan Singh (Pediatrician)", time: "6:00 PM – 7:00 PM" },
      { name: "Dr. Rinku Singh (Gyno)", time: "7:00 PM – 8:00 PM" },
      { name: "Dr. Prashant Singh (Ortho)", time: "7:00 PM – 8:00 PM" },
    ],
    Saturday: [
      { name: "Dr. Diwakar Pathak (Homeo)", time: "5:30 PM – 6:30 PM" },
      { name: "Dr. Preeti Maan (Dentist)", time: "5:00 PM – 6:30 PM" },
    ],
    Sunday: [
      { name: "Dr. Ramesh P. Jajoo (Ayurved)", time: "8:00 AM – 10:00 AM" },
      { name: "Dr. Pooja Shah (ENT)", time: "5:30 PM – 6:30 PM" },
      { name: "Dr. Soumya PM", time: "2:00 PM – 5:00 PM" },
    ],
  };

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Fetch doctors list
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('http://localhost:5000/doctors', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctors(res.data);
      } catch (err) {
        console.error('Error fetching doctors:', err);
      }
    })();
  }, []);

  const handleChange = (e) => {
    setPatient(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const registerPatient = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        'http://localhost:5000/register_patient',
        patient,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOpdNumber(res.data.psr_no);
      toast({
        title: 'Patient Registered',
        description: `PSR No: ${res.data.psr_no}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setIsPrescriptionOpen(true);
      onOpen();
    } catch (err) {
      toast({
        title: 'Error',
        description: err.response?.data?.error || 'Something went wrong!',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      const session_id = localStorage.getItem('session_id');
      if (token && session_id) {
        await axios.post(
          'http://localhost:5000/logout',
          { session_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
      localStorage.removeItem('session_id');
      window.location.href = '/login';
    }
  };

  return (
    <Flex w="100vw" h="100vh" bg="gray.50" overflow="hidden">
      <Flex direction="column" flex="1" overflow="hidden">
        {/* Header */}
        <Flex
          as="header"
          flexShrink="0"
          justify="space-between"
          align="center"
          p={{ base: '3', md: '4' }}
          bg="white"
          boxShadow="sm"
          h={`${headerHeight}px`}
        >
          <Text fontSize="2xl" fontWeight="bold" color="blue.800">
            Bitsmed
          </Text>
          <HStack spacing={{ base: '3', md: '4' }}>
            <IconButton icon={<FiBell />} variant="ghost" aria-label="Notifications" />
            <IconButton icon={<FiMail />} variant="ghost" aria-label="Messages" />
            <Menu>
              <MenuButton
                as={Button}
                variant="ghost"
                rightIcon={<Avatar size="sm" name={username} ml="2" />}
              >
                <Text fontWeight="medium" mr="2">Welcome, {username}</Text>
              </MenuButton>
              <MenuList>
                <MenuItem icon={<FiUser />}>Profile</MenuItem>
                <MenuItem icon={<FiLogOut />} onClick={handleLogout}>
                  Logout
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>

        {/* Main Content: Split Form (left) and Calendar (right) */}
        <Flex
          as="main"
          flex="1"
          p={{ base: '3', md: '4' }}
          overflowY="auto"
          h={`calc(100vh - ${headerHeight}px)`}
          gap={6}
        >
          {/* Left: Registration Form */}
          <Box
            flex="1"
            bg="white"
            p={{ base: '4', md: '6' }}
            borderRadius="lg"
            boxShadow="md"
          >
            <Heading as="h2" size="lg" mb="4" textAlign="center">
              Register Patient
            </Heading>
            <Stack spacing="4">
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input name="name" value={patient.name} onChange={handleChange} />
              </FormControl>
              <HStack spacing="4">
                <FormControl isRequired>
                  <FormLabel>Age</FormLabel>
                  <Input
                    type="number"
                    name="age"
                    value={patient.age}
                    onChange={handleChange}
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Gender</FormLabel>
                  <Select name="gender" value={patient.gender} onChange={handleChange}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </Select>
                </FormControl>
              </HStack>
              <HStack spacing="4">
                <FormControl isRequired>
                  <FormLabel>Contact No</FormLabel>
                  <Input
                    name="contact_no"
                    value={patient.contact_no}
                    onChange={handleChange}
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Patient Type</FormLabel>
                  <Select
                    name="patient_type"
                    value={patient.patient_type}
                    onChange={handleChange}
                  >
                    <option value="">Select</option>
                    <option value="Student">Student</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Other">Other</option>
                  </Select>
                </FormControl>
                {patient.patient_type !== 'Other' && (
                  <FormControl>
                    <FormLabel>PSRN/ID No</FormLabel>
                    <Input
                      name="psrn_id"
                      value={patient.psrn_id}
                      onChange={handleChange}
                    />
                  </FormControl>
                )}
              </HStack>
              <FormControl isRequired>
                <FormLabel>Address</FormLabel>
                <Textarea
                  name="address"
                  value={patient.address}
                  onChange={handleChange}
                  rows={2}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Assign Doctor</FormLabel>
                <Select
                  name="doctor_assigned"
                  value={patient.doctor_assigned}
                  onChange={handleChange}
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((doc, i) => (
                    <option key={i} value={doc.username}>
                      {doc.username}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <Button colorScheme="blue" size="lg" onClick={registerPatient}>
                Register Patient
              </Button>
            </Stack>
          </Box>

          {/* Right: Calendar */}
          <Box
            flex="1"
            bg="white"
            p={{ base: '4', md: '6' }}
            borderRadius="lg"
            boxShadow="md"
            overflow="auto"
          >
            <Heading as="h2" size="lg" mb="4" textAlign="center">
              Doctor Schedule
            </Heading>
            <Flex gap={4}>
              {days.map((day) => (
                <Box
                  key={day}
                  flex="1"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  p={3}
                  minW="150px"
                  bg="gray.50"
                >
                  <Text
                    fontWeight="bold"
                    fontSize="md"
                    textAlign="center"
                    mb={2}
                    color="blue.700"
                  >
                    {day}
                  </Text>
                  {schedule[day].length > 0 ? (
                    schedule[day].map((event, i) => (
                      <Box
                        key={i}
                        bg="blue.100"
                        borderLeft="4px solid"
                        borderColor="blue.500"
                        borderRadius="md"
                        p={2}
                        mb={2}
                      >
                        <Text fontSize="sm" fontWeight="bold">
                          {event.time}
                        </Text>
                        <Text fontSize="sm">{event.name}</Text>
                      </Box>
                    ))
                  ) : (
                    <Text fontSize="sm" color="gray.400" textAlign="center">
                      No Doctors
                    </Text>
                  )}
                </Box>
              ))}
            </Flex>
          </Box>
        </Flex>
      </Flex>

      {/* Prescription modal */}
      {isPrescriptionOpen && (
        <PrescriptionModal
          isOpen={isPrescriptionOpen}
          onClose={() => {
            setIsPrescriptionOpen(false);
            onClose();
          }}
          prescriptionData={{
            ...patient,
            opdNumber,
            psrn_id:
              patient.patient_type === 'Other' ? undefined : patient.psrn_id,
          }}
        />
      )}
    </Flex>
  );
}
