import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Flex,
  Text,
  Input,
  Button,
  Avatar,
  Heading,
  useToast,
  Spinner,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  InputGroup,
  InputLeftElement,
  Badge,
} from "@chakra-ui/react";
import {
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
  FiCopy,
  FiRefreshCw,
  FiSearch,
  FiCheckCircle,
} from "react-icons/fi";
import axios from "axios";
import EMRHistoryDisplay from '../../components/EMRHistoryDisplay';
import EMRForm from '../../components/EMRForm';
import PrescriptionSlip from '../../components/PrescriptionSlip';
import BASE_URL from '../../utils/Config';
import { formatDateTimeIST, getWeekdayIST, toTitleCase } from '../../utils/utils';

export default function DoctorsDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const username = localStorage.getItem("username");
  const [displayName, setDisplayName] = useState(localStorage.getItem("display_name") || "");

  // GLOBAL STATE
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true); // initial full‐page load
  const [listLoading, setListLoading] = useState(false); // list‐only refresh

  // MODAL & SELECTION
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();
  const [completionState, setCompletionState] = useState({ hasLabs: false, hasMeds: false });
  const { isOpen: isSaveConfirmOpen, onOpen: onSaveConfirmOpen, onClose: onSaveConfirmClose } = useDisclosure();

  const { isOpen: isNoHistoryOpen, onOpen: onNoHistoryOpen, onClose: onNoHistoryClose } = useDisclosure();
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [readyToComplete, setReadyToComplete] = useState({}); // { institute_id: { hasLabs, hasMeds } }

  const [isNoShowModalOpen, setIsNoShowModalOpen] = useState(false);
  const [selectedVisitIdForNoShow, setSelectedVisitIdForNoShow] = useState(null);

  // MEDICINES & LAB TESTS
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [labTestOptions, setLabTestOptions] = useState([]);

  const [emrData, setEmrData] = useState({
    subjective: { chief_complaints: '', history_of_present_illness: '', past_medical_history: '', allergies: '' },
    objective: {
      vitals: { blood_pressure: '', pulse: '', temperature: '', weight: '', height: '', spO2: '', respiratory_rate: '' },
      general_examination: '', systemic_examination: '', local_examination: ''
    },
    assessment: { provisional_diagnosis: '' },
    plan: { medications: [], investigations: [], advice: '', follow_up_date: '' }
  });

  // SEARCH PATIENT BOX
  const [searchInstituteId, setSearchInstituteId] = useState("");
  const [filterInstituteId, setFilterInstituteId] = useState("");

  // ADDITIONAL FILTERS
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('date');

  // ==========================================
  // VIEW HISTORY LOGIC
  // ==========================================
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleViewHistory = async (patient) => {
    try {
      setHistoryLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/get_patient/${patient.institute_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const visits = res.data.appointments || [];
      // A past visit is one that is completed or cancelled (since active visits are currently in the queue)
      const hasPastVisit = visits.some(v => v.status === 'completed' || v.status === 'cancelled');

      if (hasPastVisit) {
        navigate(`/doctor/patient-history/${patient.institute_id}`, { state: { patientData: res.data } });
      } else {
        onNoHistoryOpen();
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Error checking patient history",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  // ==========================================
  // PAGINATION LOGIC
  // ==========================================
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 10;

  // Whenever the search box is cleared, also clear the filter
  useEffect(() => {
    if (!searchInstituteId) {
      setFilterInstituteId("");
      setCurrentPage(1);
    }
  }, [searchInstituteId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, sortBy, filterInstituteId]);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        const token = localStorage.getItem("token");
        const username = localStorage.getItem("username");

        const res = await axios.get(`${BASE_URL}/users/${username}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const fetchedName = res.data.display_name || username;
        setDisplayName(fetchedName);
        localStorage.setItem("display_name", fetchedName);

        // Determine duty timing for today
        const schedule = res.data.schedule || [];
        const todayStr = getWeekdayIST(new Date());

        const todaysShifts = schedule.filter(shift =>
          Array.isArray(shift.duty_days) && shift.duty_days.includes(todayStr)
        );

        if (todaysShifts.length > 0) {
          // duty timings
        } else {
        }

      } catch (error) {
        console.error("Error fetching user details:", error);
        setDisplayName(localStorage.getItem("username"));
      }
    };

    fetchUserDetails();
  }, []);


  /** FETCH PATIENTS HELPERS **/
  const fetchPatients = async () => {
    setListLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/doctor/patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const patientsWithDetails = res.data.map((patient) => {
        const doctorAppointments = patient.appointments?.filter(a => a.doctor_username === patient.doctor_assigned) || [];
        const latestAppt = doctorAppointments[doctorAppointments.length - 1];
        const appointmentTimeStr = latestAppt?.time || patient.registration_time;

        return {
          ...patient,
          doctorAssigned: patient.doctor_assigned,
          rawAppointmentTime: appointmentTimeStr,
          visitingTime: formatDateTimeIST(appointmentTimeStr),
        };
      });
      setPatients(patientsWithDetails);

      // Derive readyToComplete from workflow_status and mandatory fields
      const readyMap = {};
      patientsWithDetails.forEach(p => {
        const doctorAppointments = p.appointments?.filter(a => a.doctor_username === p.doctor_assigned) || [];
        const activeAppt = doctorAppointments[doctorAppointments.length - 1] || {};
        const eData = activeAppt.emr_data || {};
        const diagnosis = eData.assessment?.provisional_diagnosis?.trim() || "";
        const complaints = eData.subjective?.chief_complaints?.trim() || "";
        const hasMandatoryFields = diagnosis.length > 0 && complaints.length > 0;

        // Patients in 'checked_in', 'consultation' or 'lab test pending' are ready for the doctor to finalize ONLY IF mandatory fields are filled
        if ((p.workflow_status === "checked_in" || p.workflow_status === "consultation" || p.workflow_status === "lab test pending") && hasMandatoryFields) {
          readyMap[p.visit_id] = true;
        }
      });
      setReadyToComplete(readyMap);
    } catch (e) {
      toast({
        title: "Error fetching patients",
        description: e.message,
        status: "error",
      });
    } finally {
      setListLoading(false);
      // if no search term, reset filter to show all
      if (!searchInstituteId) {
        setFilterInstituteId("");
      }
    }
  };

  // Initial load: full‐page spinner
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchPatients();
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** FETCH DROPDOWNS **/
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const [medRes, labRes] = await Promise.all([
          axios.get(`${BASE_URL}/dropdown/medicines`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${BASE_URL}/dropdown/labtests`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        setMedicineOptions(medRes.data);
        setLabTestOptions(labRes.data);
      } catch (err) {
        console.error("Dropdown fetch error", err);
      }
    })();
  }, []);


  // LOCAL ACTIONS (Batched)






  const handleNoShowStatus = async (visitId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BASE_URL}/api/receptionist/appointment/${visitId}/status`,
        { status: 'no_show' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: `Patient marked as no show`,
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      setIsNoShowModalOpen(false);
      fetchPatients();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Failed to update status",
        status: "error",
        duration: 2000,
        isClosable: true,
      });
    }
  };



  const handleSaveDetails = () => {
    const diagnosis = emrData.assessment?.provisional_diagnosis?.trim() || "";
    const complaints = emrData.subjective?.chief_complaints?.trim() || "";

    if (!diagnosis || !complaints) {
      toast({
        title: "Mandatory Fields Missing",
        description: "Please provide both Chief Complaints and Provisional Diagnosis before saving.",
        status: "warning",
        duration: 4000,
        isClosable: true
      });
      return;
    }

    onSaveConfirmOpen();
  };

  const executeSaveDetails = async () => {
    onSaveConfirmClose();
    try {
      const token = localStorage.getItem("token");

      // Save all details in a single efficient PUT request
      await axios.put(
        `${BASE_URL}/doctor/save_consultation_details/${selectedPatient.visit_id}`,
        { prescription_data: emrData },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: "Details Saved",
        description: "Precription details saved successfully. Use the Complete Consultation action to finalize.",
        status: "success",
        duration: 3000,
        isClosable: true
      });
      onClose();
      await fetchPatients();
    } catch (e) {
      toast({ title: "Error saving details", description: e.message, status: "error" });
    }
  };

  const finalizeConsultation = async (visitId, hasLabs, hasMeds) => {
    try {
      const token = localStorage.getItem("token");
      // 1. Mark as ready (set bill/lab statuses)
      await axios.post(
        `${BASE_URL}/doctor/save_consultation/${visitId}`,
        { has_labs: hasLabs, has_meds: hasMeds },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 2. Complete the consultation
      await axios.post(
        `${BASE_URL}/doctor/complete_consultation/${visitId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({ title: "Consultation Completed", status: "success" });
      onConfirmClose();
      await fetchPatients();
    } catch (e) {
      toast({ title: "Error completing consultation", description: e.message, status: "error" });
    }
  };

  const handleActionCompleteClick = (patient) => {
    setSelectedPatient(patient);
    const doctorAppointments = patient.appointments?.filter(a => a.doctor_username === patient.doctor_assigned) || [];
    const activeAppt = doctorAppointments[doctorAppointments.length - 1] || {};
    const eData = activeAppt.emr_data || {};
    const plan = eData.plan || {};
    const investigations = plan.investigations || [];
    const medications = plan.medications || [];

    const diagnosis = eData.assessment?.provisional_diagnosis?.trim() || "";
    const complaints = eData.subjective?.chief_complaints?.trim() || "";

    if (!diagnosis || !complaints) {
      toast({
        title: "Missing Information",
        description: "Please provide the patient's symptoms (Chief Complaints) and a Diagnosis before completing the consultation.",
        status: "warning",
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    const hasLabs = investigations.length > 0;
    const hasMeds = medications.length > 0;

    setCompletionState({ hasLabs, hasMeds, emrData: eData });
    onConfirmOpen();
  };

  const handleAttemptClose = async () => {
    // Perform a final immediate save on close
    if (selectedPatient) {
      try {
        const token = localStorage.getItem("token");
        await axios.put(
          `${BASE_URL}/doctor/save_consultation_details/${selectedPatient.visit_id}`,
          { prescription_data: emrData },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        console.error("Final auto-save failed:", e);
      }
    }
    onClose();
    await fetchPatients();
  };

  // Open modal
  const openPatientModal = (patient) => {
    setSelectedPatient(patient);

    // Find the active appointment to pull drafts from
    const activeAppt = patient.appointments?.slice().reverse().find(a =>
      a.doctor_username === patient.doctor_assigned &&
      ["upcoming", "consultation", "checked_in", "confirmed"].includes(a.status)
    ) || {};

    const defaultEmrData = {
      subjective: { chief_complaints: '', history_of_present_illness: '', past_medical_history: '', allergies: '' },
      objective: {
        vitals: { blood_pressure: '', pulse: '', temperature: '', weight: '', height: '', spO2: '', respiratory_rate: '' },
        general_examination: '', systemic_examination: '', local_examination: ''
      },
      assessment: { provisional_diagnosis: '', final_diagnosis: '' },
      plan: { medications: [], investigations: [], advice: '', follow_up_date: '' }
    };

    if (activeAppt.emr_data && typeof activeAppt.emr_data === 'object' && Object.keys(activeAppt.emr_data).length > 0) {
      const rawEmr = activeAppt.emr_data || {};
      const oldVitals = rawEmr.vitals || {};
      const newVitals = rawEmr.objective?.vitals || {};

      const mappedVitals = {
        blood_pressure: newVitals.blood_pressure || oldVitals.bp || '',
        pulse: newVitals.pulse || oldVitals.pulse || '',
        temperature: newVitals.temperature || oldVitals.temp || '',
        weight: newVitals.weight || oldVitals.weight || '',
        height: newVitals.height || oldVitals.height || '',
        spO2: newVitals.spO2 || oldVitals.oxygen || '',
        respiratory_rate: newVitals.respiratory_rate || oldVitals.resp_rate || ''
      };

      const oldSubj = rawEmr.subjective || {};
      const mappedSubj = {
        chief_complaints: oldSubj.chief_complaints || '',
        history_of_present_illness: oldSubj.history_of_present_illness || oldSubj.hpi || '',
        past_medical_history: oldSubj.past_medical_history || oldSubj.past_history || '',
        allergies: oldSubj.allergies || ''
      };

      const oldObj = rawEmr.objective || {};
      const mappedObj = {
        vitals: mappedVitals,
        general_examination: oldObj.general_examination || oldObj.general_exam || '',
        systemic_examination: oldObj.systemic_examination || oldObj.systemic_exam || '',
        local_examination: oldObj.local_examination || oldObj.local_exam || ''
      };

      setEmrData({
        subjective: { ...defaultEmrData.subjective, ...mappedSubj },
        objective: { ...defaultEmrData.objective, ...mappedObj },
        assessment: { ...defaultEmrData.assessment, ...(rawEmr.assessment || {}) },
        plan: {
          ...defaultEmrData.plan,
          ...(rawEmr.plan || {}),
          medications: rawEmr.plan?.medications || [],
          investigations: rawEmr.plan?.investigations || []
        }
      });
    } else {
      setEmrData(defaultEmrData);
    }
    onOpen();
  };

  const handleLogout = async () => {
    try {
      const username = localStorage.getItem("username");
      const token = localStorage.getItem("token");
      if (username && token) {
        await axios.post(
          `${BASE_URL}/logout`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      // Clear all auth keys
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      localStorage.removeItem("display_name");
      // Force full app reload on login page
      window.location.href = "/login";
    }
  };

  const getRegistrationTimestamp = (timeStr) => {
    if (!timeStr) return 0;
    // Strip trailing Z if present to prevent UTC shifting, backend time is already local IST
    const s = timeStr.replace(/Z$/, '');
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  // Filtered patients list
  let displayedPatients = [...patients];

  // Search by name or Institute ID
  if (filterInstituteId) {
    const q = filterInstituteId.toLowerCase();
    displayedPatients = displayedPatients.filter((p) =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.institute_id && p.institute_id.toLowerCase().includes(q))
    );
  }

  // Filter by selected date
  if (dateFilter) {
    displayedPatients = displayedPatients.filter((p) => {
      if (!p.rawAppointmentTime) return false;
      const ts = getRegistrationTimestamp(p.rawAppointmentTime);
      if (ts === 0) return false;

      // Parse directly as local time to match HTML date input format
      const d = new Date(ts);
      const createdDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      return createdDate === dateFilter;
    });
  }

  // Sort
  if (sortBy === 'name') {
    displayedPatients.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sortBy === 'date') {
    displayedPatients.sort((a, b) => {
      const dateA = getRegistrationTimestamp(a.rawAppointmentTime);
      const dateB = getRegistrationTimestamp(b.rawAppointmentTime);
      return dateA - dateB; // Ascending order: Earliest appointments first
    });
  }

  // Pagination logic
  const indexOfLastPatient = currentPage * patientsPerPage;
  const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
  const currentPatients = displayedPatients.slice(indexOfFirstPatient, indexOfLastPatient);
  const totalPages = Math.ceil(displayedPatients.length / patientsPerPage);

  const renderTable = (title, patientsList) => {
    return (
      <Box mb="6">
        <Heading as="h4" size="sm" mb="4" color="gray.700">
          {title} ({patientsList.length})
        </Heading>
        {patientsList.length === 0 ? (
          <Flex h="100px" align="center" justify="center" bg="gray.50" borderRadius="md">
            <Text color="gray.500" fontSize="md">
              No patients right now.
            </Text>
          </Flex>
        ) : (
          <Box overflowX="auto">
            <Table variant="simple">
              <Thead bg="gray.100">
                <Tr>
                  <Th w="20%">Institute ID</Th>
                  <Th w="25%">Patient Details</Th>
                  <Th w="25%" textAlign="center">Appointment Time</Th>
                  <Th w="15%" textAlign="center">Visit History</Th>
                  <Th w="15%" textAlign="center">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {patientsList.map((p) => (
                  <Tr
                    key={p.institute_id}
                    _hover={{ bg: 'gray.50', cursor: p.workflow_status === 'confirmed' ? 'default' : 'pointer' }}
                    onClick={() => {
                      if (p.workflow_status !== 'confirmed') {
                        openPatientModal(p);
                      }
                    }}
                  >
                    <Td>
                      <Flex align="center" justify="flex-start">
                        <Text fontSize="sm" color="gray.600">{p.institute_id}</Text>
                        <IconButton
                          aria-label="Copy PSRN"
                          icon={<FiCopy size={14} />}
                          size="xs"
                          ml="2"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(p.institute_id);
                            toast({
                              title: "Copied to clipboard",
                              status: "success",
                              duration: 1200,
                              isClosable: true,
                            });
                          }}
                        />
                      </Flex>
                    </Td>
                    <Td>
                      <Flex align="center" justify="flex-start">
                        <Box textAlign="left">
                          <Text fontWeight="bold">{toTitleCase(p.name)}</Text>
                          {p.age && p.gender ? (
                            <Text fontSize="sm" color="gray.500">{p.age} yrs • {p.gender}</Text>
                          ) : (
                            <Text fontSize="sm" color="gray.500">Info not available</Text>
                          )}
                        </Box>
                      </Flex>
                    </Td>
                    <Td textAlign="center"><Text fontSize="sm">{p.visitingTime}</Text></Td>
                    <Td textAlign="center">
                      <Button
                        size="sm"
                        colorScheme="blue"
                        variant="outline"
                        isLoading={historyLoading && selectedPatient?.institute_id === p.institute_id}
                        onClick={(e) => {
                          e.stopPropagation(); // prevents modal open
                          setSelectedPatient(p);
                          handleViewHistory(p);
                        }}
                      >
                        History
                      </Button>
                    </Td>
                    <Td textAlign="center" onClick={(e) => e.stopPropagation()}>
                      {p.workflow_status === 'confirmed' ? (
                        <Button size="xs" colorScheme="orange" onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVisitIdForNoShow(p.visit_id);
                          setIsNoShowModalOpen(true);
                        }}>
                          No Show
                        </Button>
                      ) : readyToComplete[p.visit_id] ? (
                        <IconButton
                          aria-label="Complete Consultation"
                          icon={<FiCheckCircle />}
                          colorScheme="yellow"
                          size="sm"
                          onClick={() => handleActionCompleteClick(p)}
                          title="Complete Consultation"
                        />
                      ) : (
                        <Text color="gray.500">-</Text>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Box>
    );
  };

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="gray.50">
        <Spinner size="xl" color="blue.500" />
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="100vh" bg="gray.50" overflow="hidden">
      {/* HEADER */}
      <Flex
        as="header"
        w="100%"
        h="64px"
        bg="white"
        boxShadow="sm"
        align="center"
        px="4"
        position="relative"
      >
        <HStack
          spacing={{ base: "3", md: "4" }}
          position="absolute"
          right="4"
          align="center"
        >
          <IconButton
            icon={<FiBell />}
            aria-label="Notifications"
            variant="ghost"
            size="sm"
          />
          <IconButton
            icon={<FiMail />}
            aria-label="Messages"
            variant="ghost"
            size="sm"
          />
          <Menu>
            <MenuButton
              as={Button}
              variant="ghost"
              rightIcon={<Avatar size="sm" name={displayName || username} ml="2" />}
            >
              <Text fontWeight="medium" mr="2">
                Welcome, {displayName || username}
              </Text>
            </MenuButton>
            <MenuList>
              <MenuItem
                icon={<FiUser />}
                onClick={() => alert("Profile clicked!")}
              >
                Profile
              </MenuItem>
              <MenuItem icon={<FiLogOut />} onClick={handleLogout}>
                Logout
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      {/* MAIN */}
      <Box
        as="main"
        flex="1"
        overflowY="auto"
        p={{ base: 4, md: 6 }}
      >
        <Box
          w="full"
          maxW="1200px"
          mx="auto"
          bg="white"
          boxShadow="md"
          borderRadius="lg"
          p={{ base: 4, md: 6 }}
        >
        {/* Top layout removed for optimized real estate */}

        {/* Upcoming Patients + Refresh */}
        <Flex align="center" mb="4" justify="space-between">
          <Flex align="center">
            <Heading as="h3" size="md" color="gray.800" mr="2">
              Upcoming Patients
            </Heading>
            <IconButton
              aria-label="Refresh patients"
              icon={<FiRefreshCw />}
              variant="ghost"
              size="sm"
              onClick={fetchPatients}
            />
          </Flex>
        </Flex>

        {/* Filter Bar */}
        <Box
          display="flex"
          flexDir={{ base: 'column', md: 'row' }}
          alignItems={{ base: 'flex-start', md: 'center' }}
          justifyContent="space-between"
          mb={4}
          gap={4}
          p={0}
        >
          <Flex flex="1" align="center" gap={4} flexWrap="wrap">
            <Text fontSize="sm" fontWeight="medium" color="gray.600" minW="50px">
              FILTER
            </Text>

            {/* Search */}
            <InputGroup w={{ base: '100%', sm: '200px', md: '250px' }}>
              <InputLeftElement pointerEvents="none">
                <FiSearch color="gray" />
              </InputLeftElement>
              <Input
                placeholder="Search..."
                value={searchInstituteId}
                onChange={(e) => {
                  setSearchInstituteId(e.target.value);
                  setFilterInstituteId(e.target.value);
                }}
              />
            </InputGroup>

            {/* Date Filter */}
            <Flex align="center" gap={2}>
              <Text fontSize="sm" color="gray.600">
                Date
              </Text>
              <Input
                type="date"
                size="sm"
                borderRadius="md"
                w={{ base: '150px', md: '200px' }}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </Flex>

            {/* Counters */}
            <Flex align="center" gap={3} ml={{ base: 0, md: 4 }}>
              <Badge colorScheme="blue" px={3} py={1} borderRadius="full" fontSize="xs">
                Current Patients: {displayedPatients.length}
              </Badge>
            </Flex>
          </Flex>

          {/* Sort By */}
          <Flex align="center" gap={2}>
            <Text fontSize="sm" color="gray.600">
              Sort By
            </Text>
            <Select
              size="sm"
              borderRadius="md"
              w={{ base: '100px', md: '150px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
            </Select>
          </Flex>
        </Box>

        {/* Upcoming Patients List */}
        <Box flex="1" overflowY="auto" position="relative" pb="12" mb="6">
          {listLoading ? (
            <Flex
              position="absolute"
              top="0"
              left="0"
              right="0"
              bottom="0"
              align="center"
              justify="center"
            >
              <Spinner size="lg" color="blue.500" />
            </Flex>
          ) : (
            <>
              {renderTable("Checked-in Patients", currentPatients.filter(p => p.workflow_status === 'checked_in' || p.workflow_status === 'consultation'))}
              {renderTable("Confirmed Patients", currentPatients.filter(p => p.workflow_status === 'confirmed'))}
              {totalPages > 1 && (
                <Flex justify="center" mt="4" mb="4" align="center" gap="4">
                  <Button
                    size="sm"
                    colorScheme="gray"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    isDisabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Text fontSize="sm" fontWeight="medium" color="gray.700">
                    Page {currentPage} of {totalPages}
                  </Text>
                  <Button
                    size="sm"
                    colorScheme="gray"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    isDisabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </Flex>
              )}
            </>
          )}
        </Box>
        </Box>
      </Box>

      {/* CENTERED MODAL POPUP */}
      <Modal
        isOpen={isOpen}
        onClose={handleAttemptClose}
        size="5xl"
        isCentered
        motionPreset="scale"
      >
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent borderRadius="2xl" overflow="hidden">
          <ModalHeader borderBottom="1px solid" borderColor="gray.100" bg="gray.50">
            {selectedPatient
              ? `${toTitleCase(selectedPatient.name)} (ID: ${selectedPatient.institute_id})`
              : "Patient Details"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody p={0} display="flex" minH="500px" maxH="75vh">

            {/* Main Pane - Inputs */}
            <Box flex="1" bg="white" overflowY="auto" p={4}>
              <EMRForm
                initialEmrData={emrData}
                onChange={setEmrData}
                medicineOptions={medicineOptions}
                labTestOptions={labTestOptions}
                toast={toast}
              />
            </Box>

          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.100" bg="white" justifyContent="flex-end">
            <Button variant="ghost" mr={3} onClick={handleAttemptClose}>
              Close
            </Button>
            <Button colorScheme="green" size="lg" onClick={handleSaveDetails}>
              Save all Details
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* CONFIRMATION MODAL */}
      <Modal isOpen={isConfirmOpen} onClose={onConfirmClose} scrollBehavior="inside" isCentered>
        <ModalOverlay />
        <ModalContent maxW="92vw" width="1400px">
          <ModalHeader fontSize="lg">Patient Prescription Summary</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text fontWeight="bold" color="blue.600" mb={2} fontSize="sm">
              Please Review the Prescription Summary
            </Text>
            {(!completionState.hasLabs && !completionState.hasMeds) && (
              <Text fontSize="xs" mb={2} color="orange.600" fontWeight="medium">
                Note: You are completing this consultation without prescribing any medicines or lab tests.
              </Text>
            )}
            <Text fontSize="11px" mb={4} color="gray.600">
              If anything looks incorrect, you can click "Cancel" to go back and edit the details. However, once you click "Confirm & Complete", the consultation will be finalized and changes can no longer be made.
            </Text>

            <Flex direction={{ base: 'column', lg: 'row' }} gap={4} align="stretch">
              {/* Left Column: Doctor's Raw EMR Entries */}
              <Box flex="1.1" p={4} borderWidth="1px" borderRadius="md" bg="gray.50" maxH="60vh" overflowY="auto" fontSize="12.5px">
                <Text fontWeight="bold" fontSize="xs" color="blue.700" mb={2}>
                  Doctor's EMR Notes
                </Text>
                <EMRHistoryDisplay emrData={completionState.emrData} />
              </Box>

              {/* Right Column: Visual OPD Card / Prescription Slip Preview */}
              <Box flex="1.3" p={4} borderWidth="1px" borderRadius="md" bg="white" maxH="60vh" overflowY="auto" boxShadow="sm">
                <Text fontWeight="bold" fontSize="xs" color="blue.700" mb={2}>
                  OPD Card Visual Preview
                </Text>
                <PrescriptionSlip prescriptionData={{ ...selectedPatient, emr_data: completionState.emrData }} />
              </Box>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onConfirmClose} size="sm">
              Cancel
            </Button>
            <Button colorScheme="green" onClick={() => {
              if (selectedPatient) {
                finalizeConsultation(selectedPatient.visit_id, completionState.hasLabs, completionState.hasMeds);
              }
            }} size="sm">
              Confirm & Complete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* SAVE ALL DETAILS CONFIRMATION MODAL */}
      <Modal isOpen={isSaveConfirmOpen} onClose={onSaveConfirmClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Save Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Are you sure all the necessary details (such as history, vitals, examinations, medications, and investigations) have been entered correctly?
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onSaveConfirmClose}>
              Cancel
            </Button>
            <Button colorScheme="teal" onClick={executeSaveDetails}>
              Yes, Save Details
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>


      {/* NO HISTORY MODAL */}
      <Modal isOpen={isNoHistoryOpen} onClose={onNoHistoryClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>No Past Visits</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text>This patient has not visited you previously for a consultation.</Text>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={onNoHistoryClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* No Show Confirmation Modal */}
      <Modal isOpen={isNoShowModalOpen} onClose={() => setIsNoShowModalOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm No Show</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>Are you sure you want to mark this patient as a No Show? This will remove them from the active queue.</Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setIsNoShowModalOpen(false)}>
              Cancel
            </Button>
            <Button colorScheme="orange" onClick={() => handleNoShowStatus(selectedVisitIdForNoShow)}>
              Confirm No Show
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </Flex>
  );
}
