import React, { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Badge,
} from '@chakra-ui/react';
import axios from 'axios';
import BASE_URL from './Config';
import { clearDoctorAccessSession, saveDoctorAccessSession } from './accessSession';

export default function DoctorAccessSession() {
  const toast = useToast();
  const token = localStorage.getItem('token');
  const doctorUsername = localStorage.getItem('username') || '';

  const [patientPsrNo, setPatientPsrNo] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [lastSession, setLastSession] = useState(null);

  const requestOtp = async () => {
    if (!doctorUsername) {
      toast({ title: 'Missing doctor login', status: 'error' });
      return;
    }

    if (!patientPsrNo.trim()) {
      toast({ title: 'Enter patient PSR number', status: 'warning' });
      return;
    }

    setRequestLoading(true);
    try {
      const response = await axios.post(
        `${BASE_URL}/api/patient-access/request-otp`,
        {
          doctor_username: doctorUsername,
          patient_psr_no: patientPsrNo.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'OTP requested',
        description: response.data?.message || 'OTP sent to patient email',
        status: 'success',
      });
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.error || error.message;
      toast({ title: 'OTP request failed', description: message, status: 'error' });
    } finally {
      setRequestLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!patientPsrNo.trim() || !otpCode.trim()) {
      toast({ title: 'Enter patient PSR and OTP', status: 'warning' });
      return;
    }

    setVerifyLoading(true);
    try {
      const response = await axios.post(
        `${BASE_URL}/api/patient-access/verify-otp`,
        {
          otp_code: otpCode.trim(),
          patient_psr_no: patientPsrNo.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const accessSessionId = response.data?.access_session_id || response.data?.session_id;
      if (accessSessionId) {
        saveDoctorAccessSession(accessSessionId, response.data?.expires_at || null);
      }
      if (response.data?.expires_at) {
        sessionStorage.setItem('access_session_expiry', response.data.expires_at);
      }

      setLastSession(response.data || null);
      toast({
        title: 'Access session created',
        description: response.data?.message || '30-minute patient consent session active',
        status: 'success',
      });
    } catch (error) {
      const message = error?.response?.data?.detail || error?.response?.data?.error || error.message;
      toast({ title: 'OTP verify failed', description: message, status: 'error' });
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <Flex minH="100vh" bg="gray.50" align="center" justify="center" p={4}>
      <Card w="full" maxW="720px" boxShadow="xl" borderRadius="2xl">
        <CardHeader>
          <Heading size="lg">Patient Consent OTP Access</Heading>
          <Text mt={2} color="gray.600">
            Doctor login is used for identity. This screen creates the separate 30-minute patient consent session.
          </Text>
        </CardHeader>
        <CardBody>
          <Stack spacing={5}>
            <Box>
              <Text fontWeight="semibold" mb={2}>Doctor</Text>
              <Badge colorScheme="blue" px={3} py={1} borderRadius="full">
                {doctorUsername || 'Not logged in'}
              </Badge>
            </Box>

            <Divider />

            <Box>
              <Heading size="sm" mb={3}>1. Request OTP from patient consent flow</Heading>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
                <Input
                  placeholder="Patient PSR / Institute ID"
                  value={patientPsrNo}
                  onChange={(e) => setPatientPsrNo(e.target.value)}
                />
                <Button
                  colorScheme="blue"
                  onClick={requestOtp}
                  isLoading={requestLoading}
                  minW={{ base: 'full', md: '180px' }}
                >
                  Request OTP
                </Button>
              </Stack>
            </Box>

            <Box>
              <Heading size="sm" mb={3}>2. Enter OTP received by patient</Heading>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
                <Input
                  placeholder="6-digit OTP"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                />
                <Button
                  colorScheme="green"
                  onClick={verifyOtp}
                  isLoading={verifyLoading}
                  minW={{ base: 'full', md: '180px' }}
                >
                  Verify OTP
                </Button>
              </Stack>
            </Box>

            {lastSession && (
              <Box bg="green.50" p={4} borderRadius="lg" borderWidth="1px" borderColor="green.200">
                <Heading size="sm" mb={2}>Active access session created</Heading>
                <Text fontSize="sm"><strong>access_session_id:</strong> {lastSession.access_session_id || lastSession.session_id}</Text>
                <Text fontSize="sm"><strong>patient_psr_no:</strong> {lastSession.patient_psr_no}</Text>
                <Text fontSize="sm"><strong>expires_at:</strong> {lastSession.expires_at}</Text>
                <Text fontSize="sm"><strong>access_reason:</strong> {lastSession.access_reason}</Text>
              </Box>
            )}

            <Button
              variant="outline"
              onClick={() => {
                clearDoctorAccessSession();
                setLastSession(null);
                toast({ title: 'Patient consent session cleared', status: 'info' });
              }}
            >
              Clear Consent Session
            </Button>
          </Stack>
        </CardBody>
      </Card>
    </Flex>
  );
}
