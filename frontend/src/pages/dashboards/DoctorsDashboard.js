import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Text,
  Input,
  Button,
  Avatar,
  Image,
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
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Grid,
  useDisclosure,
  FormControl,
  FormLabel,
  Textarea,
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
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  VStack,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
} from "@chakra-ui/react";
import {
  FiCalendar,
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
  FiCopy,
  FiRefreshCw,
  FiSearch,
  FiCheckCircle,
  FiPlusCircle,
  FiActivity,
  FiSave,
  FiPlus,
  FiX,
  FiAlertTriangle,
  FiFileText,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from '../../utils/Config';
import { formatDateTimeIST, getWeekdayIST, toTitleCase } from '../../utils/utils';
import Multiselect from "multiselect-react-dropdown";

export default function DoctorsDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const username = localStorage.getItem("username");
  const [displayName, setDisplayName] = useState(localStorage.getItem("display_name") || "");
  const token = localStorage.getItem("token");

  // GLOBAL STATE
  const [dutyTiming, setDutyTiming] = useState("Checking schedule...");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true); // initial full‐page load
  const [listLoading, setListLoading] = useState(false); // list‐only refresh

  // MODAL & SELECTION
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();
  const { isOpen: isUnsavedOpen, onOpen: onUnsavedOpen, onClose: onUnsavedClose } = useDisclosure();
  const cancelRef = React.useRef();
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [sessionHasMeds, setSessionHasMeds] = useState(false);
  const [sessionHasLabs, setSessionHasLabs] = useState(false);
  const [readyToComplete, setReadyToComplete] = useState({}); // { institute_id: { hasLabs, hasMeds } }

  // PRESCRIPTION & REMARK
  const [prescriptionDetails, setPrescriptionDetails] = useState("");
  const [remark, setRemark] = useState("");

  // MEDICINES & LAB TESTS
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [labTestOptions, setLabTestOptions] = useState([]);
  const [selectedMedicines, setSelectedMedicines] = useState([]);
  const [selectedLabTests, setSelectedLabTests] = useState([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [labTestSearch, setLabTestSearch] = useState("");
  const [customMedicine, setCustomMedicine] = useState("");
  const [customLabTest, setCustomLabTest] = useState("");

  // SAVED IN CURRENT SESSION
  const [sessionSavedPrescriptions, setSessionSavedPrescriptions] = useState([]);
  const [sessionSavedRemarks, setSessionSavedRemarks] = useState([]);
  const [sessionSavedMedicines, setSessionSavedMedicines] = useState([]);
  const [sessionSavedLabTests, setSessionSavedLabTests] = useState([]);

  const [emrData, setEmrData] = useState({
    subjective: { chief_complaints: '', history_of_present_illness: '', past_medical_history: '', allergies: '' },
    objective: {
      vitals: { blood_pressure: '', pulse: '', temperature: '', weight: '', height: '', spO2: '', respiratory_rate: '' },
      general_examination: '', systemic_examination: '', local_examination: ''
    },
    assessment: { provisional_diagnosis: '' },
    plan: { medications: [], investigations: [], advice: '', follow_up_date: '' }
  });
  const [medInput, setMedInput] = useState({ drug: '', dose: '', route: '', frequency: '', duration: '', quantity: '' });
  const [labInput, setLabInput] = useState('');

  // SEARCH PATIENT BOX
  const [searchInstituteId, setSearchInstituteId] = useState("");
  const [filterInstituteId, setFilterInstituteId] = useState("");

  // ADDITIONAL FILTERS
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('date');

  // PAGINATION
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
          const timingStrs = todaysShifts.map(s => `${s.start_time} - ${s.end_time}`);
          setDutyTiming(`${timingStrs.join(', ')} on duty`);
        } else {
          setDutyTiming("Not on duty today");
        }

      } catch (error) {
        console.error("Error fetching user details:", error);
        setDisplayName(localStorage.getItem("username"));
        setDutyTiming("Schedule unavailable");
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

      // Derive readyToComplete from workflow_status
      const readyMap = {};
      patientsWithDetails.forEach(p => {
        // Patients in 'consultation' or 'lab test pending' are ready for the doctor to finalize
        if (p.workflow_status === "consultation" || p.workflow_status === "lab test pending") {
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

  // Filter dropdowns
  const filteredMedicineOptions = medicineOptions.filter((opt) =>
    opt.item_name.toLowerCase().includes(medicineSearch.toLowerCase())
  );
  const filteredLabTestOptions = labTestOptions.filter((opt) =>
    opt.test_name.toLowerCase().includes(labTestSearch.toLowerCase())
  );

  // MULTISELECT handlers
  const handleMedicineSelect = (list) => setSelectedMedicines(list);
  const handleMedicineRemove = (list) => setSelectedMedicines(list);
  const handleLabTestSelect = (list) => setSelectedLabTests(list);
  const handleLabTestRemove = (list) => setSelectedLabTests(list);

  // LOCAL ACTIONS (Batched)
  const handleViewReports = async (reports) => {
    try {
      const token = localStorage.getItem("token");

      const s3Reports = reports.filter((r) => r && r.s3_key);

      if (!s3Reports.length) {
        toast({
          title: "No file reports available",
          status: "info",
        });
        return;
      }

      const r = s3Reports[0]; // only latest report
      const res = await axios.post(
        `${BASE_URL}/s3/view-url`,
        { s3_key: r.s3_key },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.url) {
        const url = res.data.url;
        const response = await fetch(url);
        const blob = await response.blob();

        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = r.file_name || "LabReport.pdf";

        document.body.appendChild(link);
        link.click();

        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      toast({
        title: "Error opening report",
        description: err.message,
        status: "error",
      });
    }
  };

  const handleAddPrescription = () => {
    if (!prescriptionDetails.trim()) return;
    setSessionSavedPrescriptions((prev) => [...prev, prescriptionDetails.trim()]);
    setPrescriptionDetails("");
  };

  const handleAddRemark = () => {
    if (!remark.trim()) return;
    setSessionSavedRemarks((prev) => [...prev, remark.trim()]);
    setRemark("");
  };

  const handleAddMedicines = () => {
    if (!selectedMedicines.length) return;
    setSessionSavedMedicines((prev) => [
      ...prev,
      ...selectedMedicines.map((m) => m.item_name),
    ]);
    setSelectedMedicines([]);
  };

  const handleAddLabTests = () => {
    if (!selectedLabTests.length) return;
    setSessionSavedLabTests((prev) => [
      ...prev,
      ...selectedLabTests.map((t) => t.test_name),
    ]);
    setSelectedLabTests([]);
  };

  const handleAddCustomMedicine = () => {
    if (!customMedicine.trim()) return;
    setSessionSavedMedicines((prev) => [...prev, customMedicine.trim()]);
    setCustomMedicine("");
  };

  const handleAddCustomLabTest = () => {
    if (!customLabTest.trim()) return;
    setSessionSavedLabTests((prev) => [...prev, customLabTest.trim()]);
    setCustomLabTest("");
  };

  const handleRemovePrescription = (idx) => {
    setSessionSavedPrescriptions((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleRemoveRemark = (idx) => {
    setSessionSavedRemarks((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleRemoveMedicine = (idx) => {
    setSessionSavedMedicines((prev) => prev.filter((_, i) => i !== idx));
  };
  const handleRemoveLabTest = (idx) => {
    setSessionSavedLabTests((prev) => prev.filter((_, i) => i !== idx));
  };


  const handleUpdateEmr = (section, field, value) => {
    setEmrData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleUpdateVitals = (field, value) => {
    setEmrData(prev => ({
      ...prev,
      objective: {
        ...prev.objective,
        vitals: {
          ...prev.objective.vitals,
          [field]: value
        }
      }
    }));
  };

  const handleAddMedication = () => {
    if (!medInput.drug) return;
    setEmrData(prev => ({
      ...prev,
      plan: {
        ...prev.plan,
        medications: [...prev.plan.medications, medInput]
      }
    }));
    setMedInput({ drug: '', dose: '', route: '', frequency: '', duration: '', quantity: '' });
  };

  const handleRemoveMedication = (idx) => {
    setEmrData(prev => {
      const newMeds = [...prev.plan.medications];
      newMeds.splice(idx, 1);
      return { ...prev, plan: { ...prev.plan, medications: newMeds } };
    });
  };

  const handleAddInvestigation = () => {
    if (!labInput) return;
    setEmrData(prev => ({
      ...prev,
      plan: {
        ...prev.plan,
        investigations: [...prev.plan.investigations, labInput]
      }
    }));
    setLabInput('');
  };

  const handleRemoveInvestigation = (idx) => {
    setEmrData(prev => {
      const newLabs = [...prev.plan.investigations];
      newLabs.splice(idx, 1);
      return { ...prev, plan: { ...prev.plan, investigations: newLabs } };
    });
  };


  const handleSaveDraft = async () => {
    if (!selectedPatient) return;
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${BASE_URL}/doctor/save_consultation_details/${selectedPatient.visit_id}`,
        { prescription_data: emrData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: "Draft Saved", description: "Your current notes have been saved.", status: "info", duration: 2000, isClosable: true });
    } catch (error) {
      console.error("Error saving draft:", error);
      toast({ title: "Error", description: "Failed to save draft.", status: "error", duration: 3000, isClosable: true });
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedPatient) return;

    try {
      const token = localStorage.getItem("token");

      // Save all details in a single efficient PUT request
      await axios.put(
        `${BASE_URL}/doctor/save_consultation_details/${selectedPatient.visit_id}`,
        { prescription_data: emrData },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const hasLabs = emrData.plan.investigations.length > 0;
      const hasMeds = emrData.plan.medications.length > 0;

      if (!hasLabs && !hasMeds) {
        onConfirmOpen();
        return;
      }

      await markAsReady(hasLabs, hasMeds);
    } catch (e) {
      toast({ title: "Error saving details", description: e.message, status: "error" });
    }
  };

  const markAsReady = async (hasLabs, hasMeds) => {
    if (!selectedPatient) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/doctor/save_consultation/${selectedPatient.visit_id}`,
        { has_labs: hasLabs, has_meds: hasMeds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({
        title: "Consultation details saved",
        description: "Please click the green tick icon in the patient list to complete this consultation.",
        status: "success",
        duration: 5000,
        isClosable: true
      });
      onConfirmClose();

      // Clear locally so warning doesn't trigger on close
      setSessionSavedPrescriptions([]);
      setSessionSavedRemarks([]);
      setSessionSavedMedicines([]);
      setSessionSavedLabTests([]);
      setPrescriptionDetails("");
      setRemark("");

      onClose();
      await fetchPatients();
    } catch (e) {
      toast({ title: "Error saving details", description: e.message, status: "error" });
    }
  };

  const executeSaveAndUpdate = async (visitId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/doctor/complete_consultation/${visitId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: "Consultation Completed", status: "success" });

      await fetchPatients();
      onConfirmClose();
      if (selectedPatient?.visit_id === visitId) {
        onClose();
        setSelectedPatient(null);
      }
    } catch (e) {
      toast({ title: "Error completing consultation", description: e.message, status: "error" });
    }
  };

  const handleAttemptClose = () => {
    const hasUnsavedItems =
      sessionSavedPrescriptions.length > 0 ||
      sessionSavedRemarks.length > 0 ||
      sessionSavedMedicines.length > 0 ||
      sessionSavedLabTests.length > 0 ||
      prescriptionDetails.trim() !== "" ||
      remark.trim() !== "";

    if (hasUnsavedItems) {
      onUnsavedOpen();
    } else {
      onClose();
    }
  };

  const confirmCloseWithoutSaving = () => {
    onUnsavedClose();
    onClose();
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
    setPrescriptionDetails("");
    setRemark("");
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

  const currentTime = formatDateTimeIST(new Date());

  // Helper to safely get timestamp for sorting
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
        px="2"
        py="6"
        mx="8"
        maxW="1200px"
        overflowY="auto"
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
          bg="white"
          p={4}
          borderRadius="lg"
          boxShadow="sm"
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
        <Box flex="1" bg="white" p={4} borderRadius="lg" boxShadow="sm" overflowY="auto" position="relative" pb="12" mb="6">
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
              {currentPatients.length === 0 ? (
                <Flex h="100px" align="center" justify="center">
                  <Text color="gray.500" fontSize="lg">
                    No patients right now.
                  </Text>
                </Flex>
              ) : (
                <Box overflowX="auto">
                  <Table variant="simple">
                    <Thead bg="gray.100">
                      <Tr>
                        <Th textAlign="center">Institute ID</Th>
                        <Th textAlign="center">Name</Th>
                        <Th textAlign="center">Age</Th>
                        <Th textAlign="center">Gender</Th>
                        <Th textAlign="center">Appointment Time</Th>
                        <Th textAlign="center">Lab Reports</Th>
                        <Th textAlign="center">Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {currentPatients.map((p) => (
                        <Tr
                          key={p.institute_id}
                          _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                          onClick={() => openPatientModal(p)}
                        >
                          <Td textAlign="center">
                            <Flex align="center" justify="center">
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
                          <Td textAlign="center">
                            <Flex align="center" justify="center">
                              <Avatar size="sm" name={toTitleCase(p.name)} mr="2" />
                              <Text fontSize="sm" color="gray.800">{toTitleCase(p.name)}</Text>
                            </Flex>
                          </Td>
                          <Td textAlign="center"><Text fontSize="sm">{p.age}</Text></Td>
                          <Td textAlign="center"><Text fontSize="sm">{p.gender}</Text></Td>
                          <Td textAlign="center"><Text fontSize="sm">{p.visitingTime}</Text></Td>
                          <Td textAlign="center">
                            {Array.isArray(p.lab_reports) && p.lab_reports.some((r) => r && r.s3_key) ? (
                              <Button
                                size="sm"
                                colorScheme="blue"
                                onClick={(e) => {
                                  e.stopPropagation(); // prevents modal open
                                  handleViewReports(p.lab_reports);
                                }}
                              >
                                View
                              </Button>
                            ) : (
                              <Text fontSize="sm">—</Text>
                            )}
                          </Td>
                          <Td textAlign="center" onClick={(e) => e.stopPropagation()}>
                            {readyToComplete[p.visit_id] && (
                              <IconButton
                                aria-label="Complete consultation"
                                icon={<FiCheckCircle />}
                                colorScheme="green"
                                size="sm"
                                onClick={() => executeSaveAndUpdate(p.visit_id)}
                                title="Complete consultation"
                              />
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
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
              <Accordion allowMultiple defaultIndex={[0, 1, 2, 3]}>
                {/* Subjective */}
                <AccordionItem>
                  <h2>
                    <AccordionButton>
                      <Box flex="1" textAlign="left" fontWeight="bold">Subjective (Symptoms & History)</Box>
                      <AccordionIcon />
                    </AccordionButton>
                  </h2>
                  <AccordionPanel pb={4}>
                    <VStack align="stretch" spacing={3}>
                      <FormControl>
                        <FormLabel fontSize="xs">Chief Complaints</FormLabel>
                        <Textarea size="sm" value={emrData.subjective.chief_complaints} onChange={(e) => handleUpdateEmr('subjective', 'chief_complaints', e.target.value)} />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs">History of Present Illness</FormLabel>
                        <Textarea size="sm" value={emrData.subjective.history_of_present_illness} onChange={(e) => handleUpdateEmr('subjective', 'history_of_present_illness', e.target.value)} />
                      </FormControl>
                      <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
                        <FormControl>
                          <FormLabel fontSize="xs">Past Medical History</FormLabel>
                          <Textarea size="sm" value={emrData.subjective.past_medical_history} onChange={(e) => handleUpdateEmr('subjective', 'past_medical_history', e.target.value)} />
                        </FormControl>
                        <FormControl>
                          <FormLabel fontSize="xs">Allergies</FormLabel>
                          <Textarea size="sm" value={emrData.subjective.allergies} onChange={(e) => handleUpdateEmr('subjective', 'allergies', e.target.value)} />
                        </FormControl>
                      </Grid>
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>

                {/* Objective */}
                <AccordionItem>
                  <h2>
                    <AccordionButton>
                      <Box flex="1" textAlign="left" fontWeight="bold">Objective (Vitals & Exam)</Box>
                      <AccordionIcon />
                    </AccordionButton>
                  </h2>
                  <AccordionPanel pb={4}>
                    <VStack align="stretch" spacing={4}>
                      <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
                        <Text fontSize="sm" fontWeight="bold" mb={3}>Vitals</Text>
                        <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={3}>
                          <FormControl><FormLabel fontSize="xs">BP (mmHg)</FormLabel><Input size="sm" placeholder="120/80" value={emrData.objective.vitals.blood_pressure} onChange={(e) => handleUpdateVitals('blood_pressure', e.target.value)} /></FormControl>
                          <FormControl><FormLabel fontSize="xs">Pulse (bpm)</FormLabel><Input size="sm" placeholder="72" value={emrData.objective.vitals.pulse} onChange={(e) => handleUpdateVitals('pulse', e.target.value)} /></FormControl>
                          <FormControl><FormLabel fontSize="xs">Temp (°F/°C)</FormLabel><Input size="sm" placeholder="98.6" value={emrData.objective.vitals.temperature} onChange={(e) => handleUpdateVitals('temperature', e.target.value)} /></FormControl>
                          <FormControl><FormLabel fontSize="xs">SpO2 (%)</FormLabel><Input size="sm" placeholder="99" value={emrData.objective.vitals.spO2} onChange={(e) => handleUpdateVitals('spO2', e.target.value)} /></FormControl>
                          <FormControl><FormLabel fontSize="xs">Weight (kg)</FormLabel><Input size="sm" placeholder="70" value={emrData.objective.vitals.weight} onChange={(e) => handleUpdateVitals('weight', e.target.value)} /></FormControl>
                          <FormControl><FormLabel fontSize="xs">Height (cm)</FormLabel><Input size="sm" placeholder="175" value={emrData.objective.vitals.height} onChange={(e) => handleUpdateVitals('height', e.target.value)} /></FormControl>
                          <FormControl><FormLabel fontSize="xs">Resp. Rate (/min)</FormLabel><Input size="sm" placeholder="16" value={emrData.objective.vitals.respiratory_rate} onChange={(e) => handleUpdateVitals('respiratory_rate', e.target.value)} /></FormControl>
                        </Grid>
                      </Box>
                      <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
                        <Text fontSize="sm" fontWeight="bold" mb={3}>Examinations</Text>
                        <VStack align="stretch" spacing={3}>
                          <FormControl>
                            <FormLabel fontSize="xs">General Examination</FormLabel>
                            <Textarea size="sm" value={emrData.objective.general_examination} onChange={(e) => handleUpdateEmr('objective', 'general_examination', e.target.value)} />
                          </FormControl>
                          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
                            <FormControl>
                              <FormLabel fontSize="xs">Systemic Examination</FormLabel>
                              <Textarea size="sm" value={emrData.objective.systemic_examination} onChange={(e) => handleUpdateEmr('objective', 'systemic_examination', e.target.value)} />
                            </FormControl>
                            <FormControl>
                              <FormLabel fontSize="xs">Local Examination</FormLabel>
                              <Textarea size="sm" value={emrData.objective.local_examination} onChange={(e) => handleUpdateEmr('objective', 'local_examination', e.target.value)} />
                            </FormControl>
                          </Grid>
                        </VStack>
                      </Box>
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>

                {/* Assessment */}
                <AccordionItem>
                  <h2>
                    <AccordionButton>
                      <Box flex="1" textAlign="left" fontWeight="bold">Assessment (Diagnosis)</Box>
                      <AccordionIcon />
                    </AccordionButton>
                  </h2>
                  <AccordionPanel pb={4}>
                    <FormControl>
                      <FormLabel fontSize="xs">Provisional Diagnosis</FormLabel>
                      <Textarea size="sm" value={emrData.assessment.provisional_diagnosis} onChange={(e) => handleUpdateEmr('assessment', 'provisional_diagnosis', e.target.value)} />
                    </FormControl>
                  </AccordionPanel>
                </AccordionItem>

                {/* Plan */}
                <AccordionItem>
                  <h2>
                    <AccordionButton>
                      <Box flex="1" textAlign="left" fontWeight="bold">Plan (Medications, Labs, Advice)</Box>
                      <AccordionIcon />
                    </AccordionButton>
                  </h2>
                  <AccordionPanel pb={4}>
                    <VStack align="stretch" spacing={6}>

                      <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
                        {/* Advice */}
                        <FormControl>
                          <FormLabel fontSize="xs">Advice / General Instructions</FormLabel>
                          <Textarea size="sm" placeholder="Rest, drink plenty of fluids..." value={emrData.plan.advice} onChange={(e) => handleUpdateEmr('plan', 'advice', e.target.value)} />
                        </FormControl>
                        
                        {/* Follow Up */}
                        <FormControl>
                          <FormLabel fontSize="xs">Follow-up Date</FormLabel>
                          <Input type="date" size="sm" value={emrData.plan.follow_up_date} onChange={(e) => handleUpdateEmr('plan', 'follow_up_date', e.target.value)} />
                        </FormControl>
                      </Grid>

                      {/* Medications */}
                      <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
                        <Text fontSize="sm" fontWeight="bold" mb={2}>Medications</Text>

                        {/* Existing Meds */}
                        {emrData.plan.medications.length > 0 && (
                          <VStack align="stretch" spacing={2} mb={4}>
                            {emrData.plan.medications.map((m, idx) => (
                              <Flex key={idx} justify="space-between" align="center" bg="gray.50" p={2} borderRadius="md" border="1px solid" borderColor="green.100">
                                <Box>
                                  <Text fontSize="xs" fontWeight="bold">{m.drug} <Badge colorScheme="gray">{m.quantity}</Badge></Text>
                                  <Text fontSize="2xs" color="gray.500">{m.dose} | {m.route} | {m.frequency} | {m.duration}</Text>
                                </Box>
                                <IconButton size="xs" variant="ghost" colorScheme="red" icon={<FiX />} onClick={() => handleRemoveMedication(idx)} aria-label="Remove" />
                              </Flex>
                            ))}
                          </VStack>
                        )}

                        {/* Add Med Form */}
                        <VStack align="stretch" spacing={3}>
                          <Grid templateColumns="2fr 1fr 1fr 1fr 1fr 1fr" gap={2}>
                            <FormControl>
                              <FormLabel fontSize="xs">Drug Name</FormLabel>
                              <InputGroup size="sm">
                                <Input list="med-options" value={medInput.drug} onChange={(e) => setMedInput({ ...medInput, drug: e.target.value })} placeholder="Select or type..." />
                                <datalist id="med-options">
                                  {medicineOptions.map((opt, i) => <option key={i} value={opt.item_name} />)}
                                </datalist>
                              </InputGroup>
                            </FormControl>
                            <FormControl><FormLabel fontSize="xs">Dose</FormLabel><Input size="sm" value={medInput.dose} onChange={(e) => setMedInput({ ...medInput, dose: e.target.value })} placeholder="500mg" /></FormControl>
                            <FormControl><FormLabel fontSize="xs">Route</FormLabel><Input size="sm" value={medInput.route} onChange={(e) => setMedInput({ ...medInput, route: e.target.value })} placeholder="Oral" /></FormControl>
                            <FormControl><FormLabel fontSize="xs">Freq</FormLabel><Input size="sm" value={medInput.frequency} onChange={(e) => setMedInput({ ...medInput, frequency: e.target.value })} placeholder="1-0-1" /></FormControl>
                            <FormControl><FormLabel fontSize="xs">Duration</FormLabel><Input size="sm" value={medInput.duration} onChange={(e) => setMedInput({ ...medInput, duration: e.target.value })} placeholder="5 days" /></FormControl>
                            <FormControl><FormLabel fontSize="xs">Qty</FormLabel><Input size="sm" value={medInput.quantity} onChange={(e) => setMedInput({ ...medInput, quantity: e.target.value })} placeholder="10 tabs" /></FormControl>
                          </Grid>
                          <Button size="sm" colorScheme="green" onClick={handleAddMedication} alignSelf="flex-start" leftIcon={<FiPlus />}>Add Medication</Button>
                        </VStack>
                      </Box>

                      {/* Lab Tests */}
                      <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
                        <Text fontSize="sm" fontWeight="bold" mb={2}>Investigations (Lab Tests)</Text>

                        {/* Existing Labs */}
                        {emrData.plan.investigations.length > 0 && (
                          <Flex wrap="wrap" gap={2} mb={4}>
                            {emrData.plan.investigations.map((t, idx) => (
                              <Badge key={idx} colorScheme="purple" variant="subtle" borderRadius="md" px={2} py={1} display="flex" alignItems="center">
                                {t}
                                <Box as={FiX} ml={2} cursor="pointer" onClick={() => handleRemoveInvestigation(idx)} />
                              </Badge>
                            ))}
                          </Flex>
                        )}

                        <Flex gap={2}>
                          <InputGroup size="sm" flex="1">
                            <Input list="lab-options" value={labInput} onChange={(e) => setLabInput(e.target.value)} placeholder="Select or type test..." />
                            <datalist id="lab-options">
                              {labTestOptions.map((opt, i) => <option key={i} value={opt.test_name} />)}
                            </datalist>
                          </InputGroup>
                          <Button size="sm" colorScheme="purple" onClick={handleAddInvestigation} leftIcon={<FiPlus />}>Add Test</Button>
                        </Flex>
                      </Box>

                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            </Box>

          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.100" bg="white" justifyContent="flex-end">
            <Button variant="ghost" mr={3} onClick={handleAttemptClose}>
              Close
            </Button>
            <Button colorScheme="green" size="lg" onClick={handleSaveDetails}>
              Save all Details & Complete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </Flex>
  );
}
