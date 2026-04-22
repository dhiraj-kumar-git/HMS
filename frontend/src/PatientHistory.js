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

        // 🔥 SORT: latest first
        const sortedVisits = res.data.patient_visits?.sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );

        setPatient({
          ...res.data,
          patient_visits: sortedVisits
        });
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

      {/* 🔷 Timeline */}
      <Box position="relative" pl={6}>
        {/* Vertical Line */}
        <Box
          position="absolute"
          left="10px"
          top="0"
          bottom="0"
          width="2px"
          bg={timelineColor}
        />

        {patient.patient_visits?.length > 0 ? (
          <VStack spacing={6} align="stretch">
            {patient.patient_visits.map((visit, index) => (
              <Box key={index} position="relative">
                
                {/* Dot */}
                <Box
                  position="absolute"
                  left="-2px"
                  top="8px"
                  width="12px"
                  height="12px"
                  bg={timelineColor}
                  borderRadius="full"
                />

                {/* Card */}
                <Box
                  ml={6}
                  p={5}
                  bg={cardBg}
                  borderRadius="lg"
                  boxShadow="sm"
                >
                  <Text fontWeight="bold" mb={2}>
                    {visit.date || "No Date"}
                  </Text>

                  <Text>
                    <strong>Prescription:</strong>{" "}
                    {visit.prescription || "N/A"}
                  </Text>

                  <Text>
                    <strong>Remarks:</strong>{" "}
                    {visit.remarks || "N/A"}
                  </Text>

                  <Text mt={2}>
                    <strong>Medicines:</strong>{" "}
                    {visit.medicines?.length > 0
                      ? visit.medicines.join(", ")
                      : "None"}
                  </Text>

                  <Text>
                    <strong>Lab Tests:</strong>{" "}
                    {visit.tests?.length > 0
                      ? visit.tests.join(", ")
                      : "None"}
                  </Text>
                </Box>
              </Box>
            ))}
          </VStack>
        ) : (
          <Text>No history available</Text>
        )}
      </Box>
    </Box>
  );
}