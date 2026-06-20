import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Flex,
  Input,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Badge,
  Text,
} from '@chakra-ui/react';
import { FiTrash2, FiPlus, FiEdit, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { useNavigate } from 'react-router-dom';

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const toast = useToast();
  const navigate = useNavigate();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(data);
    } catch (err) {
      console.error(err);
      toast({ title: 'Could not load users', status: 'error', duration: 3000, isClosable: true });
    }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${BASE_URL}/delete_user/${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: 'User deleted', status: 'success', duration: 2000, isClosable: true });
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error deleting user', status: 'error', duration: 3000, isClosable: true });
    }
  };

  const handleOpenPasswordModal = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    onOpen();
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      toast({ title: 'Password cannot be empty', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/update_password/${selectedUser.username}`,
        { new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: 'Password updated successfully', status: 'success', duration: 3000, isClosable: true });
      onClose();
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to update password', status: 'error', duration: 3000, isClosable: true });
    }
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filtered.length / usersPerPage);
  const indexOfLast = currentPage * usersPerPage;
  const indexOfFirst = indexOfLast - usersPerPage;
  const currentUsers = filtered.slice(indexOfFirst, indexOfLast);

  return (
    <Box bg="white" p="8" borderRadius="lg" boxShadow="md" maxW="1000px" w="full" mx="auto">
      <Flex mb="6" align="center" justify="space-between" flexWrap="wrap" gap={3}>
        <Flex align="center">
          <Heading size="lg" color="blue.800" mr="2">Users List</Heading>
          <IconButton
            aria-label="Refresh list"
            icon={<FiRefreshCw />}
            size="sm"
            variant="ghost"
            onClick={fetchUsers}
          />
        </Flex>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="blue"
          size="sm"
          onClick={() => navigate('/admin/create-user')}
        >
          Add User
        </Button>
      </Flex>

      <Flex mb="4">
        <Input
          placeholder="Search by username or role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          bg="gray.50"
        />
      </Flex>

      <Box overflowX="auto">
        <Table variant="simple" size="sm" fontSize="sm">
          <Thead bg="gray.100">
            <Tr>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th textAlign="right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {currentUsers.map(user => (
              <Tr key={user.username} _hover={{ bg: 'gray.50' }}>
                <Td>{user.username}</Td>
                <Td>
                  <Badge
                    fontSize="10px"
                    colorScheme={
                      user.role === 'admin' ? 'red' :
                        user.role === 'doctor' ? 'green' :
                          user.role === 'receptionist' ? 'purple' :
                            user.role === 'medical_store' ? 'yellow' : 'blue'
                    }
                  >
                    {user.role.replace('_', ' ')}
                  </Badge>
                </Td>
                <Td>{user.department || '-'}</Td>
                <Td textAlign="right">
                  <IconButton
                    icon={<FiEdit />}
                    colorScheme="blue"
                    variant="ghost"
                    size="sm"
                    aria-label="Change password"
                    onClick={() => handleOpenPasswordModal(user)}
                    mr="2"
                  />
                  <IconButton
                    icon={<FiTrash2 />}
                    colorScheme="red"
                    variant="ghost"
                    size="sm"
                    aria-label="Delete user"
                    onClick={() => handleDelete(user.username)}
                  />
                </Td>
              </Tr>
            ))}
            {currentUsers.length === 0 && (
              <Tr>
                <Td colSpan={4} textAlign="center" py="6" color="gray.400">
                  No users found.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Flex justify="center" mt="8" align="center" gap="5">
          <Button
            size="sm"
            variant="outline"
            colorScheme="blue"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            isDisabled={currentPage === 1}
          >
            Previous
          </Button>
          <Text fontSize="sm" fontWeight="semibold" color="gray.600">
            Page {currentPage} of {totalPages}
          </Text>
          <Button
            size="sm"
            variant="outline"
            colorScheme="blue"
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            isDisabled={currentPage === totalPages}
          >
            Next
          </Button>
        </Flex>
      )}

      {/* Password Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Change Password for {selectedUser?.username}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              bg="gray.50"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={handleChangePassword}>
              Update Password
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
