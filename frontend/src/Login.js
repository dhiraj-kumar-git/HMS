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
  Link,
} from "@chakra-ui/react";
import { FaLock, FaUser, FaEnvelope } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import bitsLogo from "./assets/bits-logo.png";
import medicalCenterBg from "./assets/medical-center.jpg";

function Login({ onLogin }) {
  const [loginMode, setLoginMode] = useState("staff");
  const [step, setStep] = useState(1);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleStaffLogin = async () => {
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
      const response = await axios.post("http://localhost:5000/login", {
        username,
        password,
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
      setError(
        err.response?.status === 401
          ? "Invalid username or password"
          : "An error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    let errors = {};
    if (!email.trim()) errors.email = "Email is required";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setError("");
    setLoading(true);

    try {
      await axios.post("http://localhost:5000/login/patient/send-otp", {
        email,
      });
      setStep(2);
    } catch {
      setError("Email not registered");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    let errors = {};
    if (!otp.trim()) errors.otp = "OTP is required";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setError("");
    setLoading(true);

    try {
      const response = await axios.post(
        "http://localhost:5000/login/patient/verify-otp",
        { email, otp }
      );

      const { access_token } = response.data;

      localStorage.setItem("token", access_token);
      localStorage.setItem("role", "patient");
      localStorage.setItem("email", email);

      onLogin(email, "patient", null);
      navigate("/patient-dashboard");
    } catch {
      setError("Invalid or expired OTP");
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
            Login to BitsMed
          </Heading>

          {error && (
            <Text color="red.500" mb="4" fontWeight="bold" textAlign="center">
              {error}
            </Text>
          )}

          <Stack spacing="4">
            {loginMode === "staff" && (
              <>
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
                  <FormErrorMessage>
                    {fieldErrors.username}
                  </FormErrorMessage>
                </FormControl>

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
                  <FormErrorMessage>
                    {fieldErrors.password}
                  </FormErrorMessage>
                </FormControl>

                <Button
                  colorScheme="brand"
                  size="lg"
                  onClick={handleStaffLogin}
                  isLoading={loading}
                >
                  Login
                </Button>
              </>
            )}

            {loginMode === "patient" && step === 1 && (
              <>
                <FormControl isInvalid={fieldErrors.email}>
                  <InputGroup>
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FaEnvelope} color="gray.400" />
                    </InputLeftElement>
                    <Input
                      placeholder="Registered Email ID"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      bg="gray.100"
                    />
                  </InputGroup>
                  <FormErrorMessage>
                    {fieldErrors.email}
                  </FormErrorMessage>
                </FormControl>

                <Button
                  colorScheme="brand"
                  size="lg"
                  onClick={sendOtp}
                  isLoading={loading}
                >
                  Send OTP
                </Button>
              </>
            )}

            {loginMode === "patient" && step === 2 && (
              <>
                <FormControl isInvalid={fieldErrors.otp}>
                  <InputGroup>
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FaLock} color="gray.400" />
                    </InputLeftElement>
                    <Input
                      placeholder="Enter OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      bg="gray.100"
                    />
                  </InputGroup>
                  <FormErrorMessage>
                    {fieldErrors.otp}
                  </FormErrorMessage>
                </FormControl>

                <Button
                  colorScheme="brand"
                  size="lg"
                  onClick={verifyOtp}
                  isLoading={loading}
                >
                  Verify OTP
                </Button>

                <Text textAlign="center" fontSize="sm">
                  <Link
                    color="brand.500"
                    onClick={() => navigate("/patient-dashboard")}
                  >
                    Patient Dashboard
                  </Link>
                </Text>
              </>
            )}

            <Text textAlign="center" fontSize="sm">
              <Link
                color="brand.500"
                onClick={() => {
                  setLoginMode(loginMode === "staff" ? "patient" : "staff");
                  setStep(1);
                  setError("");
                  setFieldErrors({});
                }}
              >
                {loginMode === "staff"
                  ? "Already registered?"
                  : "Login as staff"}
              </Link>
            </Text>
          </Stack>
        </Box>
      </Flex>
    </Flex>
  );
}

export default Login;
