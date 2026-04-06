import React, { useState } from "react";
import {
  Flex,
  Box,
  Button,
  Input,
  Stack,
  Heading,
  Text,
  Icon,
  InputGroup,
  InputLeftElement,
  Image,
  FormControl,
  FormErrorMessage,
} from "@chakra-ui/react";
import { FaLock, FaUser } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from './Config';

import bitsLogo from "./assets/bits-logo.png";
import medicalCenterBg from "./assets/medical-center.jpg";

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const hashPassword = async (password) => {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleLogin = async () => {
    let errors = {};
    if (!username.trim()) errors.username = "Username is required";
    if (!password.trim()) errors.password = "Password is required";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setError("");
    setLoading(true);
    try {
      const hashedPassword = await hashPassword(password);
      const response = await axios.post(`${BASE_URL}/login`, {
        username,
        password: hashedPassword,
      });
      if (response.status === 200) {
        const { access_token, role, session_id } = response.data;
        localStorage.setItem("token", access_token);
        localStorage.setItem("username", username);
        localStorage.setItem("role", role);
        localStorage.setItem("session_id", session_id);
        onLogin(username, role, session_id);
        navigate("/dashboard");
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Invalid username or password");
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex
      direction="column"
      w="100vw"
      h="100vh"
      bg="gray.50"
      overflow="hidden"
      bgSize="cover"
      bgPos="center"
      bgImage={`url(${medicalCenterBg})`}
    >
      <Flex flex="1" align="center" justify="center">
        <Box
          bg="white"
          borderRadius="lg"
          boxShadow="md"
          p={{ base: "4", md: "6" }}
          maxW="md"
          w="full"
        >
          <Image
            src={bitsLogo}
            alt="BITS Pilani"
            boxSize="80px"
            mx="auto"
            mb={4}
          />
          <Heading size="lg" mb="6" textAlign="center" color="brand.500">
            Login to BITS MED-C
          </Heading>

          {error && (
            <Text color="red.500" mb="4" fontWeight="bold" textAlign="center">
              {error}
            </Text>
          )}

          <Stack spacing="4">
            {/* Username Field */}
            <FormControl isInvalid={fieldErrors.username}>
              <InputGroup>
                <InputLeftElement pointerEvents="none">
                  <Icon as={FaUser} color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  bg="gray.100"
                />
              </InputGroup>
              {fieldErrors.username && (
                <FormErrorMessage>{fieldErrors.username}</FormErrorMessage>
              )}
            </FormControl>

            {/* Password Field */}
            <FormControl isInvalid={fieldErrors.password}>
              <InputGroup>
                <InputLeftElement pointerEvents="none">
                  <Icon as={FaLock} color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  bg="gray.100"
                />
              </InputGroup>
              {fieldErrors.password && (
                <FormErrorMessage>{fieldErrors.password}</FormErrorMessage>
              )}
            </FormControl>

            <Button
              colorScheme="brand"
              size="lg"
              onClick={handleLogin}
              isLoading={loading}
            >
              Login
            </Button>
          </Stack>
        </Box>
      </Flex>
    </Flex>
  );
}

export default Login;
