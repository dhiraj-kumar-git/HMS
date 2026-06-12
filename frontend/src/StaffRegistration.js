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
  useToast,
  Icon,
  SimpleGrid,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  IconButton,
  Divider,
  HStack,
  Text
} from '@chakra-ui/react';
import { FiArrowLeft, FiUserCheck, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import BASE_URL from './Config';

const RELATION_OPTIONS = [
  "Spouse", "Son", "Daughter", "Father", "Mother",
  "Father-in-law", "Mother-in-law", "Other"
];

const StaffRegistration = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  // Tab 1 State
  const [primary, setPrimary] = useState({
    psrn_id: '',
    name: '',
    email: '',
    date_of_birth: '',
    gender: '',
    contact_no: '',
    patient_type: '',
    address: ''
  });

  const [dependants, setDependants] = useState([]);

  // Tab 2 State
  const [existingPsrn, setExistingPsrn] = useState('');
  const [singleDependant, setSingleDependant] = useState({
    name: '',
    date_of_birth: '',
    gender: '',
    relation: '',
    custom_relation: ''
  });

  const handlePrimaryChange = (e) => {
    setPrimary({ ...primary, [e.target.name]: e.target.value });
  };

  const handleDependantChange = (index, field, value) => {
    const newDeps = [...dependants];
    newDeps[index][field] = value;
    setDependants(newDeps);
  };

  const addDependantRow = () => {
    setDependants([...dependants, { name: '', date_of_birth: '', gender: '', relation: '', custom_relation: '' }]);
  };

  const removeDependantRow = (index) => {
    const newDeps = dependants.filter((_, i) => i !== index);
    setDependants(newDeps);
  };

  const submitNewRegistration = async (e) => {
    e.preventDefault();
    setLoading(true);

    const processedDependants = dependants.map(dep => ({
      ...dep,
      relation: dep.relation === 'Other' ? dep.custom_relation : dep.relation
    }));

    try {
      const response = await axios.post(`${BASE_URL}/api/public/register_staff`, {
        primary,
        dependants: processedDependants
      });
      toast({
        title: "Registration Successful",
        description: `Staff and Dependants registered successfully.`,
        status: "success",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      setTimeout(() => {
        navigate('/portal/book-appointment', { state: { autoFillInstituteId: primary.psrn_id } });
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

  const submitAddDependant = async (e) => {
    e.preventDefault();
    setLoading(true);

    const processedDep = {
      ...singleDependant,
      relation: singleDependant.relation === 'Other' ? singleDependant.custom_relation : singleDependant.relation
    };

    try {
      const response = await axios.post(`${BASE_URL}/api/public/add_dependant`, {
        psrn_id: existingPsrn,
        dependant: processedDep
      });
      toast({
        title: "Dependant Added Successfully",
        description: `Dependant assigned ID: ${response.data.institute_id}`,
        status: "success",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      setSingleDependant({ name: '', date_of_birth: '', gender: '', relation: '', custom_relation: '' });
      setExistingPsrn('');
    } catch (err) {
      toast({
        title: "Failed to Add Dependant",
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
    <Flex minH="100vh" bg="gray.50" align="flex-start" justify="center" p={6}>
      <Box w="100%" maxW="900px" bg="white" borderRadius="2xl" boxShadow="xl" p={8} mt={8}>
        <Button
          leftIcon={<FiArrowLeft />}
          variant="ghost"
          colorScheme="blue"
          mb={6}
          onClick={() => navigate('/portal')}
        >
          Back to Portal
        </Button>

        <Flex align="center" mb={6}>
          <Icon as={FiUserCheck} w={8} h={8} color="blue.500" mr={3} />
          <Heading as="h2" size="xl" color="gray.800">
            Faculty & Staff Registration
          </Heading>
        </Flex>

        <Tabs isFitted variant="enclosed" colorScheme="blue">
          <TabList mb="1em">
            <Tab>New Registration</Tab>
            <Tab>Add New Dependant</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <form onSubmit={submitNewRegistration}>
                <VStack spacing={6} align="stretch">
                  <Heading size="md" color="blue.600">Primary Member Details</Heading>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl isRequired>
                      <FormLabel>PSRN ID</FormLabel>
                      <Input name="psrn_id" placeholder="e.g. P1999" value={primary.psrn_id} onChange={handlePrimaryChange} focusBorderColor="blue.500" />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Full Name</FormLabel>
                      <Input name="name" placeholder="Full Name" value={primary.name} onChange={handlePrimaryChange} focusBorderColor="blue.500" />
                    </FormControl>
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl isRequired>
                      <FormLabel>Email</FormLabel>
                      <Input name="email" type="email" placeholder="Email Address" value={primary.email} onChange={handlePrimaryChange} focusBorderColor="blue.500" />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Patient Type</FormLabel>
                      <Select name="patient_type" placeholder="Select Type" value={primary.patient_type} onChange={handlePrimaryChange} focusBorderColor="blue.500">
                        <option value="Faculty">Faculty</option>
                        <option value="Staff">Staff</option>
                      </Select>
                    </FormControl>
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                    <FormControl isRequired>
                      <FormLabel>Date of Birth</FormLabel>
                      <Input name="date_of_birth" type="date" max={new Date().toISOString().split('T')[0]} value={primary.date_of_birth} onChange={handlePrimaryChange} focusBorderColor="blue.500" />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Gender</FormLabel>
                      <Select name="gender" placeholder="Gender" value={primary.gender} onChange={handlePrimaryChange} focusBorderColor="blue.500">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </Select>
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Contact Number</FormLabel>
                      <Input name="contact_no" type="tel" maxLength={10} placeholder="Contact No." value={primary.contact_no} onChange={handlePrimaryChange} focusBorderColor="blue.500" />
                    </FormControl>
                  </SimpleGrid>

                  <FormControl isRequired>
                    <FormLabel>Address / Quarters</FormLabel>
                    <Input name="address" placeholder="Address" value={primary.address} onChange={handlePrimaryChange} focusBorderColor="blue.500" />
                  </FormControl>

                  <Divider my={4} />

                  <Flex justify="space-between" align="center">
                    <Heading size="md" color="blue.600">Dependants</Heading>
                    <Button leftIcon={<FiPlus />} colorScheme="green" variant="outline" size="sm" onClick={addDependantRow}>
                      Add Dependant
                    </Button>
                  </Flex>

                  {dependants.map((dep, index) => (
                    <Box key={index} p={4} borderWidth="1px" borderRadius="md" position="relative">
                      <IconButton
                        icon={<FiTrash2 />}
                        colorScheme="red"
                        variant="ghost"
                        size="sm"
                        position="absolute"
                        top={2}
                        right={2}
                        onClick={() => removeDependantRow(index)}
                      />
                      <Text fontWeight="bold" mb={4}>Dependant #{index + 1}</Text>
                      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                        <FormControl isRequired>
                          <FormLabel>Name</FormLabel>
                          <Input value={dep.name} onChange={(e) => handleDependantChange(index, 'name', e.target.value)} />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>Date of Birth</FormLabel>
                          <Input type="date" max={new Date().toISOString().split('T')[0]} value={dep.date_of_birth} onChange={(e) => handleDependantChange(index, 'date_of_birth', e.target.value)} />
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel>Gender</FormLabel>
                          <Select placeholder="Gender" value={dep.gender} onChange={(e) => handleDependantChange(index, 'gender', e.target.value)}>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </Select>
                        </FormControl>
                      </SimpleGrid>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mt={4}>
                        <FormControl isRequired>
                          <FormLabel>Relation</FormLabel>
                          <Select placeholder="Select Relation" value={dep.relation} onChange={(e) => handleDependantChange(index, 'relation', e.target.value)}>
                            {RELATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </Select>
                        </FormControl>
                        {dep.relation === 'Other' && (
                          <FormControl isRequired>
                            <FormLabel>Specify Relation</FormLabel>
                            <Input value={dep.custom_relation} onChange={(e) => handleDependantChange(index, 'custom_relation', e.target.value)} />
                          </FormControl>
                        )}
                      </SimpleGrid>
                    </Box>
                  ))}

                  <Button type="submit" colorScheme="blue" size="lg" w="100%" borderRadius="xl" isLoading={loading} mt={4}>
                    Register Staff & Dependants
                  </Button>
                </VStack>
              </form>
            </TabPanel>

            <TabPanel>
              <form onSubmit={submitAddDependant}>
                <VStack spacing={6} align="stretch">
                  <FormControl isRequired>
                    <FormLabel>Existing PSRN ID</FormLabel>
                    <Input placeholder="Enter the PSRN ID of the primary staff member" value={existingPsrn} onChange={(e) => setExistingPsrn(e.target.value)} focusBorderColor="blue.500" />
                  </FormControl>

                  <Divider my={2} />
                  <Heading size="md" color="blue.600">New Dependant Details</Heading>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl isRequired>
                      <FormLabel>Full Name</FormLabel>
                      <Input value={singleDependant.name} onChange={(e) => setSingleDependant({ ...singleDependant, name: e.target.value })} focusBorderColor="blue.500" />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Date of Birth</FormLabel>
                      <Input type="date" max={new Date().toISOString().split('T')[0]} value={singleDependant.date_of_birth} onChange={(e) => setSingleDependant({ ...singleDependant, date_of_birth: e.target.value })} focusBorderColor="blue.500" />
                    </FormControl>
                  </SimpleGrid>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                    <FormControl isRequired>
                      <FormLabel>Gender</FormLabel>
                      <Select placeholder="Select Gender" value={singleDependant.gender} onChange={(e) => setSingleDependant({ ...singleDependant, gender: e.target.value })} focusBorderColor="blue.500">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </Select>
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Relation</FormLabel>
                      <Select placeholder="Select Relation" value={singleDependant.relation} onChange={(e) => setSingleDependant({ ...singleDependant, relation: e.target.value })} focusBorderColor="blue.500">
                        {RELATION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </Select>
                    </FormControl>
                  </SimpleGrid>

                  {singleDependant.relation === 'Other' && (
                    <FormControl isRequired>
                      <FormLabel>Specify Relation</FormLabel>
                      <Input value={singleDependant.custom_relation} onChange={(e) => setSingleDependant({ ...singleDependant, custom_relation: e.target.value })} focusBorderColor="blue.500" />
                    </FormControl>
                  )}

                  <Button type="submit" colorScheme="green" size="lg" w="100%" borderRadius="xl" isLoading={loading} mt={4}>
                    Add Dependant
                  </Button>
                </VStack>
              </form>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Flex>
  );
};

export default StaffRegistration;
