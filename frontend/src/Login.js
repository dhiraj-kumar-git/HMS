import React, { useState } from 'react';
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
  InputLeftElement
} from '@chakra-ui/react';
import { FaLock, FaUser } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const headerHeight = 64; // same as AdminDashboard header :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const navigate                = useNavigate();

  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:5000/login', { username, password });
      if (response.status === 200) {
        const { access_token, role, session_id } = response.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('username', username);
        localStorage.setItem('role', role);
        localStorage.setItem('session_id', session_id);
        onLogin(username, role, session_id);
        navigate('/dashboard');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Invalid username or password');
      } else {
        setError('An error occurred. Please try again.');
      }
    }
  };

  return (
    <Flex direction="column" w="100vw" h="100vh" bg="gray.50" overflow="hidden">
      {/* Header bar matching AdminDashboard :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3} */}
      <Flex
        as="header"
        align="center"
        justify="center"
        bg="white"
        boxShadow="sm"
        h={`${headerHeight}px`}
      >
        <Text fontSize="xl" fontWeight="bold">
          BitsMed
        </Text>
      </Flex>

      {/* Main content: centered login form */}
      <Flex flex="1" align="center" justify="center">
        <Box
          bg="white"
          borderRadius="lg"
          boxShadow="md"
          p={{ base: '4', md: '6' }}
          maxW="md"
          w="full"
        >
          <Heading size="lg" mb="6" textAlign="center" color="brand.500">
            Login to BitsMed
          </Heading>

          {error && (
            <Text color="red.500" mb="4" fontWeight="bold" textAlign="center">
              {error}
            </Text>
          )}

          <Stack spacing="4">
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

            <Button colorScheme="brand" size="lg" onClick={handleLogin}>
              Login
            </Button>
          </Stack>
        </Box>
      </Flex>
    </Flex>
  );
}

export default Login;
