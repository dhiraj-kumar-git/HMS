import React, { useState, useEffect } from 'react';
import {
  Box,
  Input,
  Button,
  Stack,
  Heading,
  FormControl,
  FormLabel,
  useToast,
  Flex,
  Textarea,
  Select,
  HStack,
} from '@chakra-ui/react';
import axios from 'axios';
import PrescriptionModal from './PrescriptionModal';

function ReceptionistDashboard() {
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
  const [isPrescriptionOpen, setIsPrescriptionOpen] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const toast = useToast();

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:5000/doctors', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDoctors(response.data);
      } catch (error) {
        console.error('Error fetching doctors:', error);
      }
    };
    fetchDoctors();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'name') {
      // Only allow letters and spaces
      if (/^[a-zA-Z\s]*$/.test(value)) {
        setPatient((prev) => ({ ...prev, [name]: value }));
      }
    } else if (name === 'age') {
      // Only allow numeric values
      if (/^\d*$/.test(value)) {
        setPatient((prev) => ({ ...prev, [name]: value }));
      }
    } else if (name === 'contact_no') {
      // Only allow digits, limit to 10 digits
      if (/^\d{0,10}$/.test(value)) {
        setPatient((prev) => ({ ...prev, [name]: value }));
      }
    } else if (name === 'patient_type' && value === 'Other') {
      setPatient((prev) => ({ ...prev, [name]: value, psrn_id: '' }));
    } else {
      setPatient((prev) => ({ ...prev, [name]: value }));
    }
  };
  const validateForm = () => {
    if (!patient.name || !/^[a-zA-Z\s]+$/.test(patient.name)) {
      toast({
        title: 'Invalid Name',
        description: 'Name should only contain letters and spaces.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }

    if (!patient.age || isNaN(patient.age)) {
      toast({
        title: 'Invalid Age',
        description: 'Age should only contain numbers.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }

    if (!patient.contact_no || !/^\d{10}$/.test(patient.contact_no)) {
      toast({
        title: 'Invalid Contact Number',
        description: 'Contact number should be 10 digits.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return false;
    }

    return true;
  };



  // 🔄 Modify this function to validate before sending data
  const registerPatient = async () => {
    if (!validateForm()) return;

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:5000/register_patient',
        patient,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.status === 201) {
        setOpdNumber(response.data.psr_no);
        setIsPrescriptionOpen(true);
        toast({
          title: 'Patient Registered',
          description: `PSR No: ${response.data.psr_no}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Something went wrong!',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Flex align="center" justify="center" minHeight="100vh" bgGradient="linear(to-r, blue.900, blue.700)">
      <Box
        p={6}
        maxWidth="700px"
        w="full"
        bg="white"
        borderRadius="2xl"
        boxShadow="dark-lg"
      >
        <Heading as="h2" size="lg" color="blue.800" mb={4} textAlign="center">
          Register Patient
        </Heading>

        <Stack spacing={3}>
          <FormControl isRequired>
            <FormLabel>Name</FormLabel>
            <Input name="name" value={patient.name} onChange={handleChange} />
          </FormControl>

          <HStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Age</FormLabel>
              <Input type="number" name="age" value={patient.age} onChange={handleChange} />
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

          <HStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Contact No</FormLabel>
              <Input name="contact_no" value={patient.contact_no} onChange={handleChange} />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Patient Type</FormLabel>
              <Select name="patient_type" value={patient.patient_type} onChange={handleChange}>
                <option value="">Select</option>
                <option value="Student">Student</option>
                <option value="Faculty">Faculty</option>
                <option value="Other">Other</option>
              </Select>
            </FormControl>


            {patient.patient_type !== 'Other' && (
              <FormControl>
                <FormLabel>PSRN/ID No</FormLabel>
                <Input name="psrn_id" value={patient.psrn_id} onChange={handleChange} />
              </FormControl>
            )}

          </HStack>

          <FormControl isRequired>
            <FormLabel>Address</FormLabel>
            <Textarea name="address" value={patient.address} onChange={handleChange} rows={2} />
          </FormControl>

          <FormControl isRequired>
            <FormLabel> Select Doctor</FormLabel>
            <Select name="doctor_assigned" value={patient.doctor_assigned} onChange={handleChange}>
              <option value="">Select Doctor</option>
              {doctors.map((doc, index) => (
                <option key={index} value={doc.username}>
                  {doc.username}
                </option>
              ))}
            </Select>
          </FormControl>

       

          <Button colorScheme="blue" onClick={registerPatient} mt={2}>
            Register Patient
          </Button>
        </Stack>
      </Box>
      {isPrescriptionOpen && (
        <PrescriptionModal
          isOpen={isPrescriptionOpen}
          onClose={() => setIsPrescriptionOpen(false)}
          prescriptionData={{
            ...patient,
            opdNumber,
            psrn_id: patient.patient_type === 'Other' ? undefined : patient.psrn_id,
          }}

        />
      )}
    </Flex>
  );
}
export default ReceptionistDashboard;
