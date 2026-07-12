import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import { formatDateTimeIST, toTitleCase } from '../../utils/utils';
import EMRHistoryDisplay from '../../components/EMRHistoryDisplay';
import PrescriptionSlip from '../../components/PrescriptionSlip';
import PrescriptionModal from '../../components/PrescriptionModal';
import { FiPrinter } from 'react-icons/fi';

import {
  Box,
  Flex,
  Heading,
  Text,
  Spinner,
  Button,
  useColorModeValue,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge
} from '@chakra-ui/react';




export default function PatientHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [patient, setPatient] = useState(location.state?.patientData || null);
  const [loading, setLoading] = useState(!location.state?.patientData);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState(null);

  const cardBg = useColorModeValue("white", "gray.700");
  const expandedBg = useColorModeValue("gray.50", "gray.600");
  const panelBg = useColorModeValue("gray.50", "gray.700");
  const textColor = useColorModeValue("gray.700", "white");

  useEffect(() => {
    // If we already received data from the navigation state, skip the API call.
    if (patient) return;

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
  }, [id, patient]);

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
        <Heading size="md">{toTitleCase(patient.name)}</Heading>
        <Text mt={2}>ID: {patient.institute_id}</Text>
      </Box>

      {/* 🔷 Accordion History */}
      <Box>
        {patient.appointments && patient.appointments.filter(a => a.status === 'completed' || a.status === 'cancelled').length > 0 ? (
          <Accordion allowMultiple>
            {patient.appointments.filter(a => a.status === 'completed' || a.status === 'cancelled').slice().reverse().map((app, idx) => (
              <AccordionItem key={idx} borderRadius="md" border="1px solid" borderColor="gray.200" mb={3} bg={cardBg}>
                <h2>
                  <AccordionButton _expanded={{ bg: expandedBg }}>
                    <Box flex="1" textAlign="left" fontWeight="bold" color={textColor}>
                      {app.time ? formatDateTimeIST(app.time) : 'Unknown Date'} - {toTitleCase(app.doctor_name) || 'Doctor'}
                    </Box>
                    <Badge colorScheme="green" mr={3} textTransform="none">Completed</Badge>
                    <AccordionIcon />
                  </AccordionButton>
                </h2>
                <AccordionPanel pb={4} bg={panelBg}>
                  <Box mb={4}>
                    <EMRHistoryDisplay emrData={app.emr_data} legacyApp={app} hideCancelledAlert={true} />
                  </Box>
                  <Accordion allowToggle mt={4}>
                    <AccordionItem border="1px solid" borderColor="gray.200" borderRadius="md">
                      {({ isExpanded }) => (
                        <>
                          <h2>
                            <AccordionButton _expanded={{ bg: "gray.50" }} borderRadius="md">
                              <Flex flex="1" justify="space-between" align="center">
                                <Text fontWeight="bold" fontSize="sm" color="blue.700">
                                  OPD Card / Prescription Slip Preview
                                </Text>
                                <Flex align="center" gap={2}>
                                  <Button
                                    size="xs"
                                    colorScheme="blue"
                                    leftIcon={<FiPrinter />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPrintData({ ...patient, ...app, emr_data: app.emr_data });
                                      setIsPrintModalOpen(true);
                                    }}
                                  >
                                    Print Slip
                                  </Button>
                                  <AccordionIcon />
                                </Flex>
                              </Flex>
                            </AccordionButton>
                          </h2>
                          <AccordionPanel pb={4}>
                            {isExpanded && (
                              <PrescriptionSlip prescriptionData={{ ...patient, ...app, emr_data: app.emr_data }} />
                            )}
                          </AccordionPanel>
                        </>
                      )}
                    </AccordionItem>
                  </Accordion>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Text>No history available</Text>
        )}
      </Box>
      
      {printData && (
        <PrescriptionModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          prescriptionData={printData}
        />
      )}
    </Box>
  );
}