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
} from '@chakra-ui/react';
import { FiTrash2, FiPlus, FiEdit } from 'react-icons/fi';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const toast = useToast();
  const navigate = useNavigate();
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get('http://localhost:5000/users', {
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
      await axios.delete(`http://localhost:5000/delete_user/${username}`, {
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
        `http://localhost:5000/update_password/${selectedUser.username}`,
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

  return (
    <Box bg="white" p="8" borderRadius="lg" boxShadow="md" maxW="1000px" w="full" mx="auto">
      <Flex mb="6" align="center" justify="space-between">
        <Heading size="lg" color="brand.700">
          Users List
        </Heading>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="brand"
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
        <Table variant="simple" size="md">
          <Thead bg="gray.100">
            <Tr>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th textAlign="right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map(user => (
              <Tr key={user.username}>
                <Td>{user.username}</Td>
                <Td textTransform="capitalize">{user.role.replace('_', ' ')}</Td>
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
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={3} textAlign="center" py="6">
                  No users found.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

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
