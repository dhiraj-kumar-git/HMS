import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import axios from 'axios';
import BASE_URL from './Config';

import {
  Box,
  Flex,
  Heading,
  Text,
  Spinner,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
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
  VStack,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  Grid
} from '@chakra-ui/react';

import {
  FiSearch,
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
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


export default function PatientHistory() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue("white", "gray.700");
  const timelineColor = useColorModeValue("blue.500", "blue.300");
  const expandedBg = useColorModeValue("gray.50", "gray.600");
  const panelBg = useColorModeValue("gray.50", "gray.700");
  const textColor = useColorModeValue("gray.700", "white");
  const subTextColor = useColorModeValue("gray.600", "gray.300");

  useEffect(() => {
    const fetchPatientHistory = async () => {
      try {
        const token = localStorage.getItem("token");

        const res = await axios.get(
          `${BASE_URL}/get_patient/${id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        setPatient(res.data);
      } catch (error) {
        console.error("Error fetching patient history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientHistory();
  }, [id]);

  // 🔷 Loading State
  if (loading) {
    return (
      <Flex justify="center" align="center" height="100vh">
        <Spinner size="xl" />
      </Flex>
    );
  }

  // 🔷 Error State
  if (!patient) {
    return (
      <Flex justify="center" align="center" height="100vh">
        <Text>Patient not found</Text>
      </Flex>
    );
  }

  return (
    <Box p={6}>
      {/* 🔷 Header */}
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg">Patient History</Heading>

        <Button colorScheme="blue" onClick={() => {
            if (window.history.length > 1) {
                navigate(-1);
            } else {
                navigate("/doctor");
            }
            }}>
          Back
        </Button>
      </Flex>

      {/* 🔷 Patient Info */}
      <Box
        bg={cardBg}
        p={5}
        borderRadius="lg"
        boxShadow="md"
        mb={6}
      >
        <Heading size="md">{patient.name}</Heading>
        <Text mt={2}>ID: {patient.institute_id}</Text>
      </Box>

      {/* 🔷 Accordion History */}
      <Box>
        {patient.appointments && patient.appointments.filter(a => a.status === 'completed').length > 0 ? (
          <Accordion allowMultiple>
            {patient.appointments.filter(a => a.status === 'completed').slice().reverse().map((app, idx) => (
              <AccordionItem key={idx} borderRadius="md" border="1px solid" borderColor="gray.200" mb={3} bg={cardBg}>
                <h2>
                  <AccordionButton _expanded={{ bg: expandedBg }}>
                    <Box flex="1" textAlign="left" fontWeight="bold" color={textColor}>
                      {app.time ? new Date(app.time.split('T')[0]).toLocaleDateString() : 'Unknown Date'} {app.time && app.time.includes('T') ? `at ${app.time.split('T')[1]}` : ''} - {app.doctor_name || 'Doctor'}
                    </Box>
                    <Badge colorScheme="green" mr={3} textTransform="none">Completed</Badge>
                    <AccordionIcon />
                  </AccordionButton>
                </h2>
                <AccordionPanel pb={4} bg={panelBg}>
                  <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                    <Box>
                      <Text fontWeight="bold" fontSize="sm" color={subTextColor} mb={1}>Medicines Prescribed</Text>
                      {app.prescription_summary && app.prescription_summary.length > 0 ? (
                        <VStack align="start" spacing={1}>
                          {app.prescription_summary.map((p, i) => p && <Text key={i} fontSize="sm">• {p}</Text>)}
                        </VStack>
                      ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                    </Box>
                    <Box>
                      <Text fontWeight="bold" fontSize="sm" color={subTextColor} mb={1}>Prescription Remarks</Text>
                      {app.prescription_remarks_summary && app.prescription_remarks_summary.length > 0 ? (
                        <VStack align="start" spacing={1}>
                          {app.prescription_remarks_summary.map((r, i) => r && <Text key={i} fontSize="sm">• {r}</Text>)}
                        </VStack>
                      ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                    </Box>
                    <Box gridColumn={{ md: "span 2" }}>
                      <Text fontWeight="bold" fontSize="sm" color={subTextColor} mb={1}>Diagnosis Notes</Text>
                      {app.diagnosis_note && app.diagnosis_note.length > 0 ? (
                        <VStack align="start" spacing={1}>
                          {app.diagnosis_note.map((d, i) => d && <Text key={i} fontSize="sm">• {d}</Text>)}
                        </VStack>
                      ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                    </Box>
                    <Box gridColumn={{ md: "span 2" }}>
                      <Text fontWeight="bold" fontSize="sm" color={subTextColor} mb={1}>Lab Tests Overview</Text>
                      {app.lab_test_summary && app.lab_test_summary.length > 0 ? (
                        <VStack align="start" spacing={1}>
                          {app.lab_test_summary.map((l, i) => l && <Text key={i} fontSize="sm">• {l}</Text>)}
                        </VStack>
                      ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                    </Box>
                  </Grid>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Text>No history available</Text>
        )}
      </Box>
    </Box>
  );
}