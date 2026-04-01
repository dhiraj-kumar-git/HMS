import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Flex,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
} from '@chakra-ui/react';
import axios from 'axios';

export default function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch]     = useState('');
  const toast                   = useToast();

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('https://hms-backend-18lk.onrender.com/patients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPatients(data);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error loading patients',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // filter by psr_no, name, or contact_no
  const filtered = patients.filter(p =>
    p.psr_no.toString().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.contact_no.includes(search)
  );

  return (
    <Box
      bg="white"
      p="8"
      borderRadius="lg"
      boxShadow="md"
      maxW="1000px"
      w="full"
      mx="auto"
    >
      {/* Heading + (optional) Add Patient button */}
      <Flex mb="6" align="center" justify="space-between">
        <Heading size="lg" color="brand.700">
          Patients List
        </Heading>
        {/* If you have an Add Patient page, you can add a button here:
        <Button colorScheme="brand" onClick={() => navigate('/admin/add-patient')}>
          Add Patient
        </Button>
        */}
      </Flex>

      {/* Search bar */}
      <Flex mb="4">
        <Input
          placeholder="Search by PSR No, name, or contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          bg="gray.50"
        />
      </Flex>

      {/* Table */}
      <Box overflowX="auto">
        <Table variant="simple" size="md">
          <Thead bg="gray.100">
            <Tr>
              <Th>PSR No</Th>
              <Th>Name</Th>
              <Th>Contact No</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((p) => (
              <Tr key={p.psr_no}>
                <Td>{p.psr_no}</Td>
                <Td>{p.name}</Td>
                <Td>{p.contact_no}</Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={3} textAlign="center" py="6">
                  No patients found.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
}
