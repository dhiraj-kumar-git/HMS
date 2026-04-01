import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Heading, 
  Table, 
  Thead, 
  Tbody, 
  Tr, 
  Th, 
  Td, 
  Spinner, 
  useToast,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  IconButton,
  HStack,
  Avatar,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import { FiSearch, FiBell, FiMail, FiUser, FiLogOut } from 'react-icons/fi';
import axios from 'axios';

function InventoryList() {
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();
  const loginUsername = localStorage.getItem('username') || 'User';

  // Default logout function similar to AllPatients.js
  const defaultLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
  };

  const fetchInventory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('https://hms-backend-18lk.onrender.com/inventory', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInventory(response.data);
      setFilteredInventory(response.data);
      setLoading(false);
    } catch (error) {
      toast({
        title: 'Error fetching inventory',
        description: error.response?.data?.error || 'An error occurred',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Only filter using the search query (by Medicine ID, Item Name, or Manufacturer)
  useEffect(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const filtered = inventory.filter(item =>
        (item.medicine_id && item.medicine_id.toString().toLowerCase().includes(q)) ||
        (item.item_name && item.item_name.toLowerCase().includes(q)) ||
        (item.manufacturer && item.manufacturer.toLowerCase().includes(q))
      );
      setFilteredInventory(filtered);
    } else {
      setFilteredInventory(inventory);
    }
  }, [searchQuery, inventory]);

  if (loading) {
    return (
      <Box textAlign="center" mt={10}>
        <Spinner size="xl" />
      </Box>
    );
  }

  return (
    <Flex direction="column" minH="100vh" bg="gray.50">
      {/* Header (same as in AllPatients.js) */}
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
              rightIcon={<Avatar size="xs" name={loginUsername} />}
            >
              <Box display={{ base: 'none', md: 'block' }} fontSize="sm" fontWeight="medium">
                {loginUsername}
              </Box>
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiUser size={16} />} onClick={() => alert('Profile clicked')}>
                Profile
              </MenuItem>
              <MenuItem icon={<FiLogOut size={16} />} onClick={defaultLogout}>
                Logout
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      {/* Main Content */}
      <Box as="main" flex="1" overflowY="auto" p={{ base: 4, md: 6 }}>
        <Box 
          w="full" 
          maxW="1200px" 
          mx="auto" 
          bg="white" 
          boxShadow="md" 
          borderRadius="lg" 
          p={{ base: 4, md: 6 }}
        >
          <Heading fontSize="xl" mb={4} color="blue.800">
            Inventory List
          </Heading>

          {/* Search Bar */}
          <InputGroup mb={4} maxW="300px">
            <InputLeftElement pointerEvents="none">
              <FiSearch color="gray" />
            </InputLeftElement>
            <Input
              placeholder="Search by ID, name or manufacturer"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>

          {/* Inventory Table, same as AllPatients.js style */}
          <Box overflowX="auto">
            <Table variant="simple">
              <Thead bg="gray.100">
                <Tr>
                  <Th>Medicine ID</Th>
                  <Th>Item Name</Th>
                  <Th>Manufacturer</Th>
                  <Th>Sale Rate</Th>
                  <Th>Quantity</Th>
                  <Th>Expiry Date</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredInventory.map((item, index) => (
                  <Tr key={index} _hover={{ bg: "gray.50", cursor: "pointer" }}>
                    <Td>{item.medicine_id}</Td>
                    <Td>{item.item_name}</Td>
                    <Td>{item.manufacturer}</Td>
                    <Td>{item.sale_rate}</Td>
                    <Td>{item.qty}</Td>
                    <Td>{item.expiry_date}</Td>
                  </Tr>
                ))}
                {filteredInventory.length === 0 && (
                  <Tr>
                    <Td colSpan={6} textAlign="center">
                      No inventory items found.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </Box>
      </Box>
    </Flex>
  );
}

export default InventoryList;
