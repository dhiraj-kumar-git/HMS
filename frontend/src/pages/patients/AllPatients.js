import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatDateIST, getDateISTString, toTitleCase } from '../../utils/utils';
import {
 Box,
 Flex,
 Heading,
 Text,
 Button,
 Table,
 Thead,
 Tbody,
 Tr,
 Th,
 Td,
 Input,
 Select,
 HStack,
 InputGroup,
 InputLeftElement,
 useColorModeValue,
 IconButton,
 Menu,
 MenuButton,
 MenuList,
 MenuItem,
 Avatar,
} from '@chakra-ui/react';

import {
 FiSearch,
 FiBell,
 FiMail,
 FiUser,
 FiLogOut,
 FiFileText,
} from 'react-icons/fi';

// Custom Spinner Component Using Provided CSS Animation
function CustomSpinner() {
 const spinnerStyles = `
  .spinner {
   margin: 100px auto 0;
   width: 70px;
   text-align: center;
  }
  .spinner > div {
   width: 18px;
   height: 18px;
   background-color: #3182CE;
   border-radius: 100%;
   display: inline-block;
   -webkit-animation: sk-bouncedelay 1.4s infinite ease-in-out both;
   animation: sk-bouncedelay 1.4s infinite ease-in-out both;
  }
  .spinner .bounce1 {
   -webkit-animation-delay: -0.32s;
   animation-delay: -0.32s;
  }
  .spinner .bounce2 {
   -webkit-animation-delay: -0.16s;
   animation-delay: -0.16s;
  }
  @-webkit-keyframes sk-bouncedelay {
   0%, 80%, 100% { -webkit-transform: scale(0); }
   40% { -webkit-transform: scale(1.0); }
  }
  @keyframes sk-bouncedelay {
   0%, 80%, 100% { 
    -webkit-transform: scale(0);
    transform: scale(0);
   } 40% { 
    -webkit-transform: scale(1.0);
    transform: scale(1.0);
   }
  }
 `;

 return (
  <>
   <style>{spinnerStyles}</style>
   <div className="spinner">
    <div className="bounce1"></div>
    <div className="bounce2"></div>
    <div className="bounce3"></div>
   </div>
  </>
 );
}

export default function AllPatients({ onLogout }) {
 const navigate = useNavigate();

 // Username
 const loginUsername = localStorage.getItem('username') || 'Doctor';
 const displayName = localStorage.getItem('display_name') || 'Doctor';

 // Optionally define a default logout in case one is not provided.
 const defaultLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('display_name');
  localStorage.removeItem('role');
  localStorage.removeItem('session_id');
  window.location.href = '/login';
 };
 // Use the provided onLogout prop or fallback to defaultLogout.
 const handleLogout = onLogout || defaultLogout;

 const [patients, setPatients] = useState([]);
 const [filteredPatients, setFilteredPatients] = useState([]);
 const [loading, setLoading] = useState(true);

 // Filter states
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState('');
 const [dateFilter, setDateFilter] = useState('');
 const [sortBy, setSortBy] = useState('');
 const [currentPage, setCurrentPage] = useState(1);
 const itemsPerPage = 10;

 // Colors (matching the Admin Dashboard)
 const containerBg = useColorModeValue('gray.50', 'gray.700');
 const cardBg = useColorModeValue('white', 'gray.800');

 // Helper function to return style props based on status
 function getStatusStyles(status) {
  const s = status?.toLowerCase() || '';
  if (s === 'active') {
   // Active: light green background, green text
   return { bg: 'green.50', color: 'green.600' };
  } else if (s === 'completed' || s === 'completem') {
   // Completed (or completem): light red background, red text
   return { bg: 'red.50', color: 'red.600' };
  } else {
   // Default fallback styles
   return { bg: 'gray.50', color: 'gray.800' };
  }
 }

 // Helper function to format status text: capitalizes the first letter
 function formatStatus(status) {
  if (!status) return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
 }

 // Fetch patients on mount
 useEffect(() => {
  const fetchAllPatients = async () => {
   try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${BASE_URL}/doctor/all_patients`, {
     headers: { Authorization: `Bearer ${token}` },
    });
    setPatients(response.data);
    setFilteredPatients(response.data);
   } catch (error) {
    console.error('Error fetching all patients:', error);
   } finally {
    setLoading(false);
   }
  };
  fetchAllPatients();
 }, []);

 // Re-filter on search, status, date, or sort changes
 useEffect(() => {
  let tempList = [...patients];

  // Note: The backend endpoint (/doctor/all_patients) now securely filters 
  // and returns ONLY the historical completed patients for this specific doctor.

  // Search by name or Institute ID
  if (searchQuery) {
   const q = searchQuery.toLowerCase();
   tempList = tempList.filter((p) =>
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.institute_id && p.institute_id.toLowerCase().includes(q))
   );
  }

  // Filter by status (active/inactive)
  if (statusFilter) {
   tempList = tempList.filter(
    (p) => p.workflow_status && p.workflow_status.toLowerCase() === statusFilter.toLowerCase()
   );
  }

  // Helper to get the last visit time for a patient
  const getLastVisitTime = (p) => {
   const completedAppts = p.appointments?.filter(a =>
    a.status === 'completed' &&
    (a.doctor_username === loginUsername || a.doctor_name === displayName)
   ) || [];
   if (completedAppts.length === 0) return 0;
   const latest = completedAppts[completedAppts.length - 1];
   return latest.time ? new Date(latest.time).getTime() : 0;
  };

  // Filter by selected date (Last Visit Date)
  if (dateFilter) {
   tempList = tempList.filter((p) => {
    const lastTime = getLastVisitTime(p);
    if (lastTime === 0) return false;

    // Convert timestamp back to YYYY-MM-DD for comparison with HTML input
    const lastVisitDateStr = getDateISTString(lastTime);
    return lastVisitDateStr === dateFilter;
   });
  }

  // Sort
  if (sortBy === 'name') {
   tempList.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'date') {
   tempList.sort((a, b) => {
    const dateA = getLastVisitTime(a);
    const dateB = getLastVisitTime(b);
    return dateB - dateA; // descending order
   });
  }

  setFilteredPatients(tempList);
  setCurrentPage(1);
 }, [searchQuery, statusFilter, dateFilter, sortBy, patients]);

 if (loading) {
  return (
   <Flex justify="center" align="center" minH="100vh" bg={containerBg}>
    <CustomSpinner />
   </Flex>
  );
 }

 return (
  <Flex direction="column" minH="100vh" bg={containerBg}>
   {/* Header */}
   <Flex
    as="header"
    w="100%"
    h="64px"
    px={{ base: 2, md: 3 }}
    align="center"
    justify="flex-end"
    bg="white"
    boxShadow="sm"
   >
    <HStack spacing={{ base: 2, md: 3 }}>
     <IconButton
      icon={<FiBell size={18} />}
      variant="ghost"
      size="sm"
      aria-label="Notifications"
      onClick={() => alert('Notifications')}
     />
     <IconButton
      icon={<FiMail size={18} />}
      variant="ghost"
      size="sm"
      aria-label="Messages"
      onClick={() => alert('Messages')}
     />
     <Menu>
      <MenuButton
       as={Button}
       variant="ghost"
       size="sm"
       rightIcon={<Avatar size="xs" name={displayName || loginUsername} />}
      >
       <Text fontWeight="medium" display={{ base: 'none', md: 'block' }} fontSize="sm">
        {displayName || loginUsername}
       </Text>
      </MenuButton>
      <MenuList>
       <MenuItem icon={<FiUser size={16} />} onClick={() => alert('Profile clicked')}>
        Profile
       </MenuItem>
       <MenuItem icon={<FiLogOut size={16} />} onClick={handleLogout}>
        Logout
       </MenuItem>
      </MenuList>
     </Menu>
    </HStack>
   </Flex>

   {/* Main Content */}
   <Box as="main" flex="1" display="flex" flexDirection="column" p={{ base: 4, md: 6 }}>
    <Box
     w="full"
     maxW="1200px"
     mx="auto"
     bg={cardBg}
     boxShadow="md"
     borderRadius="lg"
     p={{ base: 4, md: 6 }}
     display="flex"
     flexDirection="column"
     h="100%"
     flex="1"
    >
     <Heading fontSize="xl" mb={4} color="blue.800">
      Patient Visit History
     </Heading>

     {/* Filter Bar */}
     <Box
      display="flex"
      flexDir={{ base: 'column', md: 'row' }}
      alignItems={{ base: 'flex-start', md: 'center' }}
      justifyContent="space-between"
      mb={4}
      gap={4}
     >
      <Flex flex="1" align="center" gap={4} flexWrap="wrap">
       <Text fontSize="sm" fontWeight="medium" color="gray.600" minW="50px">
        FILTER
       </Text>

       {/* Search */}
       <InputGroup w={{ base: '100%', sm: '200px', md: '250px' }}>
        <InputLeftElement pointerEvents="none">
         <FiSearch color="gray" />
        </InputLeftElement>
        <Input
         placeholder="Search..."
         value={searchQuery}
         onChange={(e) => setSearchQuery(e.target.value)}
        />
       </InputGroup>

       {/* Date Filter */}
       <Flex align="center" gap={2}>
        <Text fontSize="sm" color="gray.600">
         Date
        </Text>
        <Input
         type="date"
         w={{ base: '150px', md: '200px' }}
         value={dateFilter}
         onChange={(e) => setDateFilter(e.target.value)}
        />
       </Flex>

       {/* Status Filter */}
       <Flex align="center" gap={2}>
        <Text fontSize="sm" color="gray.600">
         Status
        </Text>
        <Select
         placeholder="Default"
         w={{ base: '120px', md: '150px' }}
         value={statusFilter}
         onChange={(e) => setStatusFilter(e.target.value)}
        >
         <option value="active">Active</option>
         <option value="inactive">Inactive</option>
        </Select>
       </Flex>
      </Flex>

      {/* Sort By */}
      <Flex align="center" gap={2}>
       <Text fontSize="sm" color="gray.600">
        Sort By
       </Text>
       <Select
        placeholder="Default"
        w={{ base: '100px', md: '150px' }}
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value)}
       >
        <option value="name">Name</option>
        <option value="date">Date</option>
       </Select>
      </Flex>
     </Box>

     {/* Table Section */}
     <Box flex="1" overflowY="auto">
      <Box overflowX="auto">
       <Table variant="simple">
        <Thead bg="gray.100">
         <Tr>
          <Th>Institute ID</Th>
          <Th>Patient Info</Th>
          <Th>Last Visit Date</Th>
          <Th>Action</Th>
         </Tr>
        </Thead>
        <Tbody>
         {filteredPatients.length === 0 ? (
          <Tr>
           <Td colSpan={4} py={10}>
            <Text fontSize="lg" color="gray.500">No patient history available.</Text>
           </Td>
          </Tr>
         ) : (
          filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((patient) => {
           const completedAppts = patient.appointments?.filter(a =>
            a.status === 'completed' &&
            (a.doctor_username === loginUsername || a.doctor_name === displayName)
           ) || [];
           let lastVisit = 'No History';
           if (completedAppts.length > 0) {
            const latest = completedAppts[completedAppts.length - 1];
            if (latest.time) {
             lastVisit = formatDateIST(latest.time);
            }
           }

           return (
            <Tr
             key={patient.institute_id}
             _hover={{ bg: 'gray.50' }}
            >
             <Td fontWeight="medium">{patient.institute_id}</Td>
             <Td>
              <Box>
               <Text fontWeight="bold">{toTitleCase(patient.name)}</Text>
               <Text fontSize="sm" color="gray.500">{patient.age} yrs • {patient.gender}</Text>
              </Box>
             </Td>
             <Td>{lastVisit}</Td>
             <Td>
              <Button
               leftIcon={<FiFileText />}
               size="sm"
               colorScheme="blue"
               variant="outline"
               onClick={() => navigate(`/doctor/patient-history/${patient.institute_id}`)}
              >
               View History
              </Button>
             </Td>
            </Tr>
           );
          })
         )}
        </Tbody>
       </Table>
      </Box>

      {/* Pagination Controls */}
      {filteredPatients.length > itemsPerPage && (
       <Flex justify="space-between" align="center" mt={4} p={4} bg={cardBg} borderRadius="md" boxShadow="sm">
        <Button
         onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
         isDisabled={currentPage === 1}
         colorScheme="blue" variant="outline" size="sm"
        >
         Previous
        </Button>
        <Text fontSize="sm" color="gray.600">
         Page {currentPage} of {Math.ceil(filteredPatients.length / itemsPerPage)}
        </Text>
        <Button
         onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredPatients.length / itemsPerPage)))}
         isDisabled={currentPage === Math.ceil(filteredPatients.length / itemsPerPage)}
         colorScheme="blue" variant="outline" size="sm"
        >
         Next
        </Button>
       </Flex>
      )}

     </Box>
    </Box>
   </Box>
  </Flex>
 );
}
