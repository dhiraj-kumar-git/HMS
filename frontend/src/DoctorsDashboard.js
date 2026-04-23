import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Grid,
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
import BASE_URL from './Config';
import Multiselect from "multiselect-react-dropdown";

export default function DoctorsDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const username = localStorage.getItem("username");
  const [displayName, setDisplayName] = useState(localStorage.getItem("display_name") || "");
  const token = localStorage.getItem("token");

  // GLOBAL STATE
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

  // SAVED IN CURRENT SESSION
  const [sessionSavedPrescriptions, setSessionSavedPrescriptions] = useState([]);
  const [sessionSavedRemarks, setSessionSavedRemarks] = useState([]);
  const [sessionSavedMedicines, setSessionSavedMedicines] = useState([]);
  const [sessionSavedLabTests, setSessionSavedLabTests] = useState([]);

  // SEARCH PATIENT BOX
  const [searchInstituteId, setSearchInstituteId] = useState("");
  const [filterInstituteId, setFilterInstituteId] = useState("");

  // ADDITIONAL FILTERS
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('');

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
    const fetchDisplayName = async () => {
      try {
        const token = localStorage.getItem("token");
        const username = localStorage.getItem("username");

        const cachedName = localStorage.getItem("display_name");
        if (cachedName) {
          setDisplayName(cachedName);
          return;
        }

        const res = await axios.get(`${BASE_URL}/users/${username}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const fetchedName = res.data.display_name || username;
        setDisplayName(fetchedName);

        localStorage.setItem("display_name", fetchedName);
      } catch (error) {
        console.error("Error fetching display name:", error);
        setDisplayName(localStorage.getItem("username"));
      }
    };

    fetchDisplayName();
  }, []);

  /** FETCH PATIENTS HELPERS **/
  const fetchPatients = async () => {
    setListLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/doctor/patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const patientsWithDetails = res.data.map((patient) => ({
        ...patient,
        doctorAssigned: patient.doctor_assigned,
        visitingTime: new Date(patient.registration_time).toLocaleString(
          "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            day: "2-digit",
            month: "long",
            year: "numeric",
          }
        ),
      }));
      setPatients(patientsWithDetails);

      // Derive readyToComplete from workflow_status
      const readyMap = {};
      patientsWithDetails.forEach(p => {
        // Patients in 'consultation' or 'lab test pending' are ready for the doctor to finalize
        if (p.workflow_status === "consultation" || p.workflow_status === "lab test pending") {
          readyMap[p.institute_id] = true;
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

  const handleSaveDetails = async () => {
    if (!selectedPatient) return;

    try {
      const token = localStorage.getItem("token");

      const promises = [];

      sessionSavedPrescriptions.forEach(p => {
        promises.push(axios.post(`${BASE_URL}/doctor/add_prescription_details`, { institute_id: selectedPatient.institute_id, prescription_details: p }, { headers: { Authorization: `Bearer ${token}` } }));
      });
      sessionSavedRemarks.forEach(r => {
        promises.push(axios.post(`${BASE_URL}/doctor/add_remark`, { institute_id: selectedPatient.institute_id, remark: r }, { headers: { Authorization: `Bearer ${token}` } }));
      });
      sessionSavedMedicines.forEach(m => {
        promises.push(axios.post(`${BASE_URL}/doctor/add_prescription`, { institute_id: selectedPatient.institute_id, prescription: m }, { headers: { Authorization: `Bearer ${token}` } }));
      });
      sessionSavedLabTests.forEach(t => {
        promises.push(axios.post(`${BASE_URL}/doctor/add_lab_test`, { institute_id: selectedPatient.institute_id, lab_test: t }, { headers: { Authorization: `Bearer ${token}` } }));
      });

      await Promise.all(promises);

      const hasLabs = sessionSavedLabTests.length > 0;
      const hasMeds = sessionSavedMedicines.length > 0;

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
        `${BASE_URL}/doctor/save_consultation/${selectedPatient.institute_id}`,
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

  const executeSaveAndUpdate = async (patientId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/doctor/complete_consultation/${patientId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: "Consultation Completed", status: "success" });

      await fetchPatients();
      onConfirmClose();
      if (selectedPatient?.institute_id === patientId) {
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
    setSessionSavedPrescriptions([]);
    setSessionSavedRemarks([]);
    setSessionSavedMedicines([]);
    setSessionSavedLabTests([]);
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

  const currentTime = new Date().toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Helper to safely parse dates for sorting and filtering
  const parseVisitingTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return new Date(0);
    const cleanedStr = timeStr.replace(' at ', ' ');
    const d = new Date(cleanedStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
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
      const parsedDate = parseVisitingTime(p.visitingTime);
      if (parsedDate.getTime() === 0) return false;
      const createdDate = parsedDate.toISOString().split('T')[0];
      return createdDate === dateFilter;
    });
  }

  // Sort
  if (sortBy === 'name') {
    displayedPatients.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sortBy === 'date') {
    displayedPatients.sort((a, b) => {
      const dateA = parseVisitingTime(a.visitingTime).getTime();
      const dateB = parseVisitingTime(b.visitingTime).getTime();
      return dateB - dateA;
    });
  }

  // Pagination logic
  const indexOfLastPatient = currentPage * patientsPerPage;
  const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
  const currentPatients = displayedPatients.slice(indexOfFirstPatient, indexOfLastPatient);
  const totalPages = Math.ceil(displayedPatients.length / patientsPerPage);

  // DEFINE totalCount HERE
  const totalCount = patients.length;

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
        <Flex
          position="absolute"
          left="50%"
          transform="translateX(-50%)"
          align="center"
        >
          <FiCalendar size={18} />
          <Text ml="2" fontSize="sm" color="gray.600">
            {currentTime}
          </Text>
        </Flex>

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
        {/* Top cards */}
        <Grid templateColumns={{ base: "1fr", lg: "3fr 3fr" }} gap="0" mb="8">
          {/* Welcome */}
          <Box
            bg="white"
            borderRadius="2xl"
            boxShadow="md"
            p="6"
            minH="260px"
            maxW="550px"
          >
            <Flex align="center" justify="space-between">
              <Box>
                <Text fontSize="lg" fontWeight="medium" color="gray.800">
                  Good Morning
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="gray.800">
                  {displayName || username}
                </Text>
                <Text fontSize="sm" color="gray.500" mt="4" lineHeight="short">
                  You have {displayedPatients.length} patient bookings today.
                </Text>
                <Flex align="center" mt="4">
                  <Box w="2" h="2" bg="green.400" borderRadius="full" mr="2" />
                  <Text fontSize="xs" color="green.600">
                    09:00 AM - 12:00 PM on duty
                  </Text>
                </Flex>
              </Box>
              <Image
                src="/images/doctor.svg"
                alt="Doctor Illustration"
                w="100%"
                maxW="280px"
                h="auto"
              />
            </Flex>
          </Box>

          {/* Search & Stats */}
          <Box>
            <Box bg="blue.600" borderRadius="2xl" boxShadow="md" p="6" mb="8">
              <Text fontSize="2xl" fontWeight="hairline" color="white" mb="3">
                Search Patient
              </Text>
              <Flex gap="3">
                <Input
                  placeholder="Enter Institute ID"
                  bg="blue.100"
                  border="2px solid white"
                  borderRadius="lg"
                  fontSize="sm"
                  color="black"
                  _placeholder={{ color: "gray.600" }}
                  value={searchInstituteId}
                  onChange={(e) => setSearchInstituteId(e.target.value)}
                />
                <Button
                  bg="white"
                  color="blue.700"
                  _hover={{ bg: "gray.100" }}
                  borderRadius="lg"
                  px="6"
                  fontWeight="medium"
                  fontSize="sm"
                  onClick={() => {
                    setFilterInstituteId(searchInstituteId.trim());
                    setCurrentPage(1);
                  }}
                >
                  Search
                </Button>
              </Flex>
            </Box>
            <Flex gap="4">
              <Box
                flex="1"
                bg="white"
                borderRadius="2xl"
                boxShadow="md"
                p="4"
                display="flex"
                flexDir="column"
                align="center"
                justify="center"
              >
                <Text fontSize="md" color="gray.500" mb="1">
                  Current Patients
                </Text>
                <Text fontSize="3xl" fontWeight="hairline" color="blue.600">
                  {displayedPatients.length}
                </Text>
              </Box>
              <Box
                flex="1"
                bg="white"
                borderRadius="2xl"
                boxShadow="md"
                p="4"
                display="flex"
                flexDir="column"
                align="center"
                justify="center"
              >
                <Text fontSize="md" color="gray.500" mb="1">
                  Total Bookings
                </Text>
                <Text fontSize="3xl" fontWeight="hairline" color="blue.600">
                  {totalCount}
                </Text>
              </Box>
            </Flex>
          </Box>
        </Grid>

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
          </Flex>

          {/* Sort By */}
          <Flex align="center" gap={2}>
            <Text fontSize="sm" color="gray.600">
              Sort By
            </Text>
            <Select
              placeholder="Default"
              size="sm"
              borderRadius="md"
              w={{ base: '100px', md: '150px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
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
                        <Th>Institute ID</Th>
                        <Th>Name</Th>
                        <Th>Age</Th>
                        <Th>Gender</Th>
                        <Th>Booking Time</Th>
                        <Th>Lab Reports</Th>
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
                          <Td>
                            <Flex align="center">
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
                            <Flex align="center">
                              <Avatar size="sm" name={p.name} mr="2" />
                              <Text fontSize="sm" color="gray.800">{p.name}</Text>
                            </Flex>
                          </Td>
                          <Td><Text fontSize="sm">{p.age}</Text></Td>
                          <Td><Text fontSize="sm">{p.gender}</Text></Td>
                          <Td><Text fontSize="sm">{p.visitingTime}</Text></Td>
                          <Td>
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
                            {readyToComplete[p.institute_id] && (
                              <IconButton
                                aria-label="Complete consultation"
                                icon={<FiCheckCircle />}
                                colorScheme="green"
                                size="sm"
                                onClick={() => executeSaveAndUpdate(p.institute_id)}
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
              ? `${selectedPatient.name} (ID: ${selectedPatient.institute_id})`
              : "Patient Details"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody p={0} display="flex" h="500px">

            {/* Left Pane - Inputs (Tabs) */}
            <Box flex="2" bg="white" borderRight="1px solid" borderColor="gray.100" overflowY="auto">
              <Tabs colorScheme="blue" variant="enclosed" m={4}>
                <TabList mb="1em">
                  <Tab fontWeight="medium"><FiFileText style={{ marginRight: "8px" }} /> Prescription & Remarks</Tab>
                  <Tab fontWeight="medium"><FiPlusCircle style={{ marginRight: "8px" }} /> Medicines</Tab>
                  <Tab fontWeight="medium"><FiActivity style={{ marginRight: "8px" }} /> Lab Tests</Tab>
                </TabList>
                <TabPanels>
                  {/* Tab 1: Prescription & Remarks */}
                  <TabPanel>
                    <FormControl mb={6}>
                      <FormLabel fontSize="sm" color="gray.600">Add Prescription Point</FormLabel>
                      <Flex gap={2}>
                        <Input
                          placeholder="Type a prescription detail and press Enter..."
                          value={prescriptionDetails}
                          onChange={(e) => setPrescriptionDetails(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPrescription();
                            }
                          }}
                          bg="gray.50"
                          focusBorderColor="blue.500"
                        />
                        <Button leftIcon={<FiPlus />} colorScheme="blue" onClick={handleAddPrescription}>
                          Add
                        </Button>
                      </Flex>
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm" color="gray.600">Add Remark</FormLabel>
                      <Flex gap={2}>
                        <Input
                          placeholder="Type a remark and press Enter..."
                          value={remark}
                          onChange={(e) => setRemark(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddRemark();
                            }
                          }}
                          bg="gray.50"
                          focusBorderColor="blue.500"
                        />
                        <Button leftIcon={<FiPlus />} colorScheme="blue" onClick={handleAddRemark}>
                          Add
                        </Button>
                      </Flex>
                    </FormControl>
                  </TabPanel>

                  {/* Tab 2: Medicines */}
                  <TabPanel>
                    <FormControl>
                      <FormLabel fontSize="sm" color="gray.600">Prescribe Medicines</FormLabel>
                      <Multiselect
                        options={filteredMedicineOptions}
                        selectedValues={selectedMedicines}
                        onSelect={handleMedicineSelect}
                        onRemove={handleMedicineRemove}
                        displayValue="item_name"
                        placeholder="Search and select medicines"
                        style={{
                          chips: { background: "#38A169", color: "white", borderRadius: "8px" },
                          multiselectContainer: { color: "black" },
                          searchBox: { background: "#F7FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "12px" },
                          optionContainer: { zIndex: 1500 },
                        }}
                      />
                      <Button
                        mt={4}
                        w="full"
                        leftIcon={<FiPlus />}
                        colorScheme="green"
                        onClick={handleAddMedicines}
                        isDisabled={!selectedMedicines.length}
                      >
                        Add to List
                      </Button>
                    </FormControl>
                  </TabPanel>

                  {/* Tab 3: Lab Tests */}
                  <TabPanel>
                    <FormControl>
                      <FormLabel fontSize="sm" color="gray.600">Prescribe Lab Tests</FormLabel>
                      <Multiselect
                        options={filteredLabTestOptions}
                        selectedValues={selectedLabTests}
                        onSelect={handleLabTestSelect}
                        onRemove={handleLabTestRemove}
                        displayValue="test_name"
                        placeholder="Search and select lab tests"
                        style={{
                          chips: { background: "#805AD5", color: "white", borderRadius: "8px" },
                          multiselectContainer: { color: "black" },
                          searchBox: { background: "#F7FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "12px" },
                          optionContainer: { zIndex: 1500 },
                        }}
                      />
                      <Button
                        mt={4}
                        w="full"
                        leftIcon={<FiPlus />}
                        colorScheme="purple"
                        onClick={handleAddLabTests}
                        isDisabled={!selectedLabTests.length}
                      >
                        Add to List
                      </Button>
                    </FormControl>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </Box>

            {/* Right Pane - Summary */}
            <Box flex="1" bg="gray.50" p={6} overflowY="auto">
              <Heading as="h4" size="md" mb={6} color="gray.700">
                Current Session Summary
              </Heading>

              <VStack align="stretch" spacing={6}>
                {/* Prescriptions Summary */}
                <Box>
                  <Text fontSize="sm" fontWeight="bold" color="blue.800" mb={2}>Prescriptions ({sessionSavedPrescriptions.length})</Text>
                  {sessionSavedPrescriptions.length === 0 ? (
                    <Text fontSize="sm" color="gray.400" fontStyle="italic">No items added</Text>
                  ) : (
                    <VStack align="stretch" spacing={2}>
                      {sessionSavedPrescriptions.map((p, idx) => (
                        <Flex key={idx} justify="space-between" align="flex-start" bg="white" p={2} borderRadius="md" boxShadow="sm" border="1px solid" borderColor="blue.100">
                          <Text fontSize="sm" color="gray.700">• {p}</Text>
                          <IconButton size="xs" variant="ghost" colorScheme="red" icon={<FiX />} onClick={() => handleRemovePrescription(idx)} aria-label="Remove" />
                        </Flex>
                      ))}
                    </VStack>
                  )}
                </Box>

                {/* Remarks Summary */}
                <Box>
                  <Text fontSize="sm" fontWeight="bold" color="blue.800" mb={2}>Remarks ({sessionSavedRemarks.length})</Text>
                  {sessionSavedRemarks.length === 0 ? (
                    <Text fontSize="sm" color="gray.400" fontStyle="italic">No items added</Text>
                  ) : (
                    <VStack align="stretch" spacing={2}>
                      {sessionSavedRemarks.map((r, idx) => (
                        <Flex key={idx} justify="space-between" align="flex-start" bg="white" p={2} borderRadius="md" boxShadow="sm" border="1px solid" borderColor="blue.100">
                          <Text fontSize="sm" color="gray.700">• {r}</Text>
                          <IconButton size="xs" variant="ghost" colorScheme="red" icon={<FiX />} onClick={() => handleRemoveRemark(idx)} aria-label="Remove" />
                        </Flex>
                      ))}
                    </VStack>
                  )}
                </Box>

                {/* Medicines Summary */}
                <Box>
                  <Text fontSize="sm" fontWeight="bold" color="green.800" mb={2}>Medicines ({sessionSavedMedicines.length})</Text>
                  {sessionSavedMedicines.length === 0 ? (
                    <Text fontSize="sm" color="gray.400" fontStyle="italic">No items added</Text>
                  ) : (
                    <Flex wrap="wrap" gap={2}>
                      {sessionSavedMedicines.map((m, idx) => (
                        <Badge key={idx} colorScheme="green" variant="subtle" borderRadius="md" px={2} py={1} display="flex" alignItems="center">
                          {m}
                          <Box as={FiX} ml={2} cursor="pointer" onClick={() => handleRemoveMedicine(idx)} />
                        </Badge>
                      ))}
                    </Flex>
                  )}
                </Box>

                {/* Lab Tests Summary */}
                <Box>
                  <Text fontSize="sm" fontWeight="bold" color="purple.800" mb={2}>Lab Tests ({sessionSavedLabTests.length})</Text>
                  {sessionSavedLabTests.length === 0 ? (
                    <Text fontSize="sm" color="gray.400" fontStyle="italic">No items added</Text>
                  ) : (
                    <Flex wrap="wrap" gap={2}>
                      {sessionSavedLabTests.map((t, idx) => (
                        <Badge key={idx} colorScheme="purple" variant="subtle" borderRadius="md" px={2} py={1} display="flex" alignItems="center">
                          {t}
                          <Box as={FiX} ml={2} cursor="pointer" onClick={() => handleRemoveLabTest(idx)} />
                        </Badge>
                      ))}
                    </Flex>
                  )}
                </Box>
              </VStack>
            </Box>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.100" bg="white" justifyContent="flex-end">
            <Button variant="ghost" mr={3} onClick={handleAttemptClose}>
              Cancel
            </Button>
            <Button colorScheme="green" size="lg" onClick={handleSaveDetails}>
              Save all Details & Complete
            </Button>
            <Button colorScheme="blue" variant="outline" size="lg" ml={3} mr={3} onClick={() => {
              onClose();
              navigate(`/doctor/patient-history/${selectedPatient.institute_id}`);
            }}>
              History
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* CONFIRMATION MODAL */}
      <Modal isOpen={isConfirmOpen} onClose={onConfirmClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Status Update</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>No medicines or lab tests were assigned to this patient. Proceeding will save this as ready to complete without billing or lab requirements.</Text>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="gray" mr={3} onClick={onConfirmClose}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={() => markAsReady(false, false)}>
              Confirm & Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* UNSAVED CHANGES MODAL */}
      <AlertDialog
        isOpen={isUnsavedOpen}
        leastDestructiveRef={cancelRef}
        onClose={onUnsavedClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" display="flex" alignItems="center">
              <FiAlertTriangle style={{ marginRight: "8px", color: "#DD6B20" }} />
              Unsaved Changes
            </AlertDialogHeader>
            <AlertDialogBody>
              You have unsaved details in the current session. Are you sure you want to discard them and close?
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onUnsavedClose}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={confirmCloseWithoutSaving} ml={3}>
                Discard and Close
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

    </Flex>
  );
}
