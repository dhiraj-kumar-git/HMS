import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Checkbox,
  Textarea,
  Heading,
  VStack,
  Flex,
  IconButton,
  HStack,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useToast,
  useColorModeValue,
  Text
} from '@chakra-ui/react';
import { FiBell, FiMail, FiLogOut, FiUser } from 'react-icons/fi';
import axios from 'axios';

function AddMedicine() {
  // Initial form state for adding medicine
  const [formData, setFormData] = useState({
    item_name: '',
    unit: '',
    unit_detail: '',
    item_no: '',
    sale_rate: '',
    hsn: '',
    gst_rate: '',
    cess: '',
    gst_category: '',
    nil_rated: false,
    non_gst_item: false,
    for_web: false,
    manufacturer: '',
    location: '',
    schedule: '',
    main_image1: '',
    main_image2: '',
    detail: '',
    ean_bar_code: '',
    no_med_rem: false,
    linked_item_store: '',
    qty: '',
    medicine_type: '',
    manufacture_date: '',
    expiry_date: '',
    batch_number: '',
    storage_conditions: '',
  });

  const toast = useToast();

  // Get logged in username (or fallback)
  const loginUsername = localStorage.getItem('username') || 'User';

  // Change handling for form inputs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle submission with axios POST call to add medicine, showing a toast on success/error.
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:5000/inventory/add', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({
        title: 'Medicine Added',
        description: `Medicine added successfully with ID: ${response.data.medicine_id}`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      // Reset form after success
      setFormData({
        item_name: '',
        unit: '',
        unit_detail: '',
        item_no: '',
        sale_rate: '',
        hsn: '',
        gst_rate: '',
        cess: '',
        gst_category: '',
        nil_rated: false,
        non_gst_item: false,
        for_web: false,
        manufacturer: '',
        location: '',
        schedule: '',
        main_image1: '',
        main_image2: '',
        detail: '',
        ean_bar_code: '',
        no_med_rem: false,
        linked_item_store: '',
        qty: '',
        medicine_type: '',
        manufacture_date: '',
        expiry_date: '',
        batch_number: '',
        storage_conditions: '',
      });
    } catch (error) {
      toast({
        title: 'Error Adding Medicine',
        description: error.response?.data?.error || 'An error occurred',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Header logout handling
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
  };

  // Define header height and colors for consistency.
  const headerHeight = 64;
  const bgColor = useColorModeValue('gray.50', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.800');

  return (
    <Flex direction="column" minH="100vh" bg={bgColor}>
      {/* Sticky Header Section */}
      <Flex
        as="header"
        position="sticky"
        top="0"
        left="0"
        w="100%"
        h={`${headerHeight}px`}
        px={{ base: '2', md: '3' }}
        align="center"
        justify="flex-end"
        bg="white"
        boxShadow="sm"
        zIndex={1000}
      >
        <HStack spacing={{ base: '2', md: '3' }}>
          <IconButton
            icon={<FiBell size={18} />}
            variant="ghost"
            size="sm"
            onClick={() => alert('Notifications')}
            aria-label="Notifications"
          />
          <IconButton
            icon={<FiMail size={18} />}
            variant="ghost"
            size="sm"
            onClick={() => alert('Messages')}
            aria-label="Messages"
          />
          <Menu>
            <MenuButton as={Button} variant="ghost" size="sm" rightIcon={<Avatar size="xs" name={loginUsername} />}>
              <Text fontWeight="medium" display={{ base: 'none', md: 'block' }} fontSize="sm">
                {loginUsername}
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

      {/* Main Content Container */}
      <Box as="main" flex="1" p={{ base: '4', md: '6' }}>
        {/* Card Container with its own scrolling */}
        <Box
          maxW="container.md"
          mx="auto"
          bg={cardBg}
          boxShadow="md"
          borderRadius="2xl"
          p={8}
          maxH="calc(100vh - 100px)"
          overflowY="auto"
        >
          <Heading mb={6} textAlign="center" color="blue.800">
            Add Medicine
          </Heading>
          <form onSubmit={handleSubmit}>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Item Name</FormLabel>
                <Input name="item_name" value={formData.item_name} onChange={handleChange} placeholder="Item Name" />
              </FormControl>
              <FormControl>
                <FormLabel>Unit</FormLabel>
                <Input name="unit" value={formData.unit} onChange={handleChange} placeholder="Unit" />
              </FormControl>
              <FormControl>
                <FormLabel>Unit Detail</FormLabel>
                <Input name="unit_detail" value={formData.unit_detail} onChange={handleChange} placeholder="Unit Detail" />
              </FormControl>
              <FormControl>
                <FormLabel>Item No</FormLabel>
                <Input name="item_no" value={formData.item_no} onChange={handleChange} placeholder="Item Number" />
              </FormControl>
              <FormControl>
                <FormLabel>Sale Rate</FormLabel>
                <Input name="sale_rate" value={formData.sale_rate} onChange={handleChange} placeholder="Sale Rate" type="number" />
              </FormControl>
              <FormControl>
                <FormLabel>HSN</FormLabel>
                <Input name="hsn" value={formData.hsn} onChange={handleChange} placeholder="HSN" />
              </FormControl>
              <FormControl>
                <FormLabel>GST Rate</FormLabel>
                <Input name="gst_rate" value={formData.gst_rate} onChange={handleChange} placeholder="GST Rate" type="number" />
              </FormControl>
              <FormControl>
                <FormLabel>Cess</FormLabel>
                <Input name="cess" value={formData.cess} onChange={handleChange} placeholder="Cess" type="number" />
              </FormControl>
              <FormControl>
                <FormLabel>GST Category</FormLabel>
                <Input name="gst_category" value={formData.gst_category} onChange={handleChange} placeholder="GST Category" />
              </FormControl>
              <FormControl>
                <Checkbox name="nil_rated" isChecked={formData.nil_rated} onChange={handleChange}>
                  Nil Rated?
                </Checkbox>
              </FormControl>
              <FormControl>
                <Checkbox name="non_gst_item" isChecked={formData.non_gst_item} onChange={handleChange}>
                  Non GST Item?
                </Checkbox>
              </FormControl>
              <FormControl>
                <Checkbox name="for_web" isChecked={formData.for_web} onChange={handleChange}>
                  For Web?
                </Checkbox>
              </FormControl>
              <FormControl>
                <FormLabel>Manufacturer</FormLabel>
                <Input name="manufacturer" value={formData.manufacturer} onChange={handleChange} placeholder="Manufacturer" />
              </FormControl>
              <FormControl>
                <FormLabel>Location</FormLabel>
                <Input name="location" value={formData.location} onChange={handleChange} placeholder="Location" />
              </FormControl>
              <FormControl>
                <FormLabel>Schedule</FormLabel>
                <Input name="schedule" value={formData.schedule} onChange={handleChange} placeholder="Schedule" />
              </FormControl>
              <FormControl>
                <FormLabel>Main Image 1</FormLabel>
                <Input name="main_image1" value={formData.main_image1} onChange={handleChange} placeholder="Main Image 1 URL" />
              </FormControl>
              <FormControl>
                <FormLabel>Main Image 2</FormLabel>
                <Input name="main_image2" value={formData.main_image2} onChange={handleChange} placeholder="Main Image 2 URL" />
              </FormControl>
              <FormControl>
                <FormLabel>Detail</FormLabel>
                <Textarea name="detail" value={formData.detail} onChange={handleChange} placeholder="Detail" />
              </FormControl>
              <FormControl>
                <FormLabel>EAN/Bar Code</FormLabel>
                <Input name="ean_bar_code" value={formData.ean_bar_code} onChange={handleChange} placeholder="EAN/Bar Code" />
              </FormControl>
              <FormControl>
                <Checkbox name="no_med_rem" isChecked={formData.no_med_rem} onChange={handleChange}>
                  No Med Rem?
                </Checkbox>
              </FormControl>
              <FormControl>
                <FormLabel>Linked Item (Store)</FormLabel>
                <Input name="linked_item_store" value={formData.linked_item_store} onChange={handleChange} placeholder="Linked Item" />
              </FormControl>
              <FormControl>
                <FormLabel>Quantity</FormLabel>
                <Input name="qty" value={formData.qty} onChange={handleChange} placeholder="Quantity" type="number" />
              </FormControl>
              <FormControl>
                <FormLabel>Medicine Type</FormLabel>
                <Input
                  name="medicine_type"
                  value={formData.medicine_type}
                  onChange={handleChange}
                  placeholder="e.g. Narcotics, Psychotropics"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Manufacture Date</FormLabel>
                <Input name="manufacture_date" value={formData.manufacture_date} onChange={handleChange} placeholder="YYYY-MM-DD" />
              </FormControl>
              <FormControl>
                <FormLabel>Expiry Date</FormLabel>
                <Input name="expiry_date" value={formData.expiry_date} onChange={handleChange} placeholder="YYYY-MM-DD" />
              </FormControl>
              <FormControl>
                <FormLabel>Batch Number</FormLabel>
                <Input name="batch_number" value={formData.batch_number} onChange={handleChange} placeholder="Batch Number" />
              </FormControl>
              <FormControl>
                <FormLabel>Storage Conditions</FormLabel>
                <Input name="storage_conditions" value={formData.storage_conditions} onChange={handleChange} placeholder="Storage Conditions" />
              </FormControl>
              <Button colorScheme="blue" type="submit" width="full">
                Add Medicine
              </Button>
            </VStack>
          </form>
        </Box>
      </Box>
    </Flex>
  );
}

export default AddMedicine;
