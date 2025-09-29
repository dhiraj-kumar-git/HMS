import React, { useState } from "react";
import {
  Box,
  Button,
  Input,
  Stack,
  Heading,
  FormControl,
  FormLabel,
  Select,
  useToast,
} from "@chakra-ui/react";
import axios from "axios";

export default function CreateUser() {
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "",
    display_name: "",
  });
  const toast = useToast();

  const handleAddUser = async () => {
    const { username, password, role, display_name } = newUser;
    if (!username || !password || !role || !display_name) {
      return toast({
        title: "All fields are required!",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post("http://localhost:5000/create_user", newUser, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({
        title: "User created successfully!",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setNewUser({ username: "", password: "", role: "", display_name: "" });
    } catch (error) {
      toast({
        title: "Error adding user",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Box
      bg="white"
      p="8"
      borderRadius="lg"
      boxShadow="md"
      maxW="600px"
      w="full"
      mx="auto"
    >
      <Heading size="lg" mb="6" color="brand.700">
        Create User
      </Heading>

      {/* New Display Name Field */}
      <FormControl>
        <FormLabel>Display Name</FormLabel>
        <Input
          size="lg"
          placeholder="Enter display name (e.g. Dr. Doctor Name)"
          value={newUser.display_name}
          onChange={(e) =>
            setNewUser({ ...newUser, display_name: e.target.value })
          }
        />
      </FormControl>

      <Stack spacing="5">
        <FormControl>
          <FormLabel>Username</FormLabel>
          <Input
            size="lg"
            placeholder="Enter username"
            value={newUser.username}
            onChange={(e) =>
              setNewUser({ ...newUser, username: e.target.value })
            }
          />
        </FormControl>

        <FormControl>
          <FormLabel>Password</FormLabel>
          <Input
            size="lg"
            type="password"
            placeholder="Enter password"
            value={newUser.password}
            onChange={(e) =>
              setNewUser({ ...newUser, password: e.target.value })
            }
          />
        </FormControl>

        <FormControl>
          <FormLabel>Role</FormLabel>
          <Select
            size="lg"
            placeholder="Select role"
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
          >
            <option value="receptionist">Receptionist</option>
            <option value="doctor">Doctor</option>
            <option value="medical_store">Medical Store</option>
            <option value="lab_staff">Lab Staff</option>
          </Select>
        </FormControl>

        <Button
          size="lg"
          colorScheme="brand"
          onClick={handleAddUser}
          _hover={{ transform: "scale(1.02)" }}
          transition="all 0.2s"
        >
          Add User
        </Button>
      </Stack>
    </Box>
  );
}
