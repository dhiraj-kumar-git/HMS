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
} from "@chakra-ui/react";
import {
  FiCalendar,
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
  FiCopy,
  FiRefreshCw,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import axios from "axios";
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
  const [selectedPatient, setSelectedPatient] = useState(null);

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

  // SEARCH PATIENT BOX
  const [searchPSRN, setSearchPSRN] = useState("");
  const [filterPSRN, setFilterPSRN] = useState("");

  // Whenever the search box is cleared, also clear the filter
  useEffect(() => {
    if (!searchPSRN) {
      setFilterPSRN("");
    }
  }, [searchPSRN]);

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

      const res = await axios.get(`http://localhost:5000/users/${username}`, {
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
      const res = await axios.get("http://localhost:5000/doctor/patients", {
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
    } catch (e) {
      toast({
        title: "Error fetching patients",
        description: e.message,
        status: "error",
      });
    } finally {
      setListLoading(false);
      // if no search term, reset filter to show all
      if (!searchPSRN) {
        setFilterPSRN("");
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
          axios.get("http://localhost:5000/dropdown/medicines", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get("http://localhost:5000/dropdown/labtests", {
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

  // BACKEND ACTIONS
  const handleAddPrescription = async () => {
    if (!selectedPatient) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/doctor/add_prescription_details",
        {
          psr_no: selectedPatient.psr_no,
          prescription_details: prescriptionDetails,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: "Prescription Saved", status: "success" });
      setPrescriptionDetails("");
    } catch (e) {
      toast({ title: "Error", description: e.message, status: "error" });
    }
  };

  const handleAddRemark = async () => {
    if (!selectedPatient) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/doctor/add_remark",
        { psr_no: selectedPatient.psr_no, remark },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: "Remark Saved", status: "success" });
      setRemark("");
    } catch (e) {
      toast({ title: "Error", description: e.message, status: "error" });
    }
  };

  const handleAddMedicines = async () => {
    if (!selectedPatient || !selectedMedicines.length) return;
    try {
      const token = localStorage.getItem("token");
      await Promise.all(
        selectedMedicines.map((med) =>
          axios.post(
            "http://localhost:5000/doctor/add_prescription",
            { psr_no: selectedPatient.psr_no, prescription: med.item_name },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      toast({ title: "Medicines Added", status: "success" });
      setSelectedMedicines([]);
    } catch (e) {
      toast({ title: "Error", description: e.message, status: "error" });
    }
  };

  const handleAddLabTests = async () => {
    if (!selectedPatient || !selectedLabTests.length) return;
    try {
      const token = localStorage.getItem("token");
      await Promise.all(
        selectedLabTests.map((test) =>
          axios.post(
            "http://localhost:5000/doctor/add_lab_test",
            { psr_no: selectedPatient.psr_no, lab_test: test.test_name },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      toast({ title: "Lab Tests Added", status: "success" });
      setSelectedLabTests([]);
    } catch (e) {
      toast({ title: "Error", description: e.message, status: "error" });
    }
  };

  const handleCompletePatient = async () => {
    if (!selectedPatient) return;
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/doctor/complete_patient/${selectedPatient.psr_no}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast({ title: "Patient Completed", status: "success" });
      await fetchPatients();
      onClose();
      setSelectedPatient(null);
    } catch (e) {
      toast({ title: "Error", description: e.message, status: "error" });
    }
  };

  // Open modal
  const openPatientModal = (patient) => {
    setSelectedPatient(patient);
    onOpen();
  };

  const handleLogout = async () => {
    try {
      const username = localStorage.getItem("username");
      const token = localStorage.getItem("token");
      if (username && token) {
        await axios.post(
        "http://localhost:5000/logout",
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

  // Filtered patients list
  const displayedPatients = filterPSRN
    ? patients.filter((p) => p.psr_no.includes(filterPSRN))
    : patients;

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
        overflow="hidden"
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
                  placeholder="Enter PSRN No."
                  bg="blue.100"
                  border="2px solid white"
                  borderRadius="lg"
                  fontSize="sm"
                  color="black"
                  _placeholder={{ color: "gray.600" }}
                  value={searchPSRN}
                  onChange={(e) => setSearchPSRN(e.target.value)}
                />
                <Button
                  bg="white"
                  color="blue.700"
                  _hover={{ bg: "gray.100" }}
                  borderRadius="lg"
                  px="6"
                  fontWeight="medium"
                  fontSize="sm"
                  onClick={() => setFilterPSRN(searchPSRN.trim())}
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
        <Flex align="center" mb="4">
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

        {/* Upcoming Patients List */}
        <Box maxH="60vh" overflowY="auto" position="relative" pb="12">
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
              <Flex
                position="sticky"
                top="0"
                bg="gray.50"
                zIndex="1"
                mb="3"
                px="3"
                py="1"
                fontSize="xs"
                fontWeight="semibold"
                color="gray.600"
              >
                <Box w="22%" minW="150px">
                  Name
                </Box>
                <Box w="16%" minW="120px">
                  PSRN No.
                </Box>
                <Box w="10%" minW="40px">
                  Age
                </Box>
                <Box w="10%" minW="40px">
                  Gender
                </Box>
                <Box w="22%" minW="140px">
                  Visiting Time
                </Box>
                <Box w="20%" minW="120px">
                  Last Visit
                </Box>
              </Flex>

              {displayedPatients.length === 0 ? (
                <Flex h="100px" align="center" justify="center">
                  <Text color="gray.500" fontSize="lg">
                    No patients right now.
                  </Text>
                </Flex>
              ) : (
                displayedPatients.map((p, i) => (
                  <Flex
                    key={i}
                    p="3"
                    mb="3"
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="lg"
                    _hover={{ borderColor: "blue.600" }}
                    cursor="pointer"
                    align="center"
                    px="3"
                    onClick={() => openPatientModal(p)}
                  >
                    <Box
                      w="22%"
                      minW="150px"
                      display="flex"
                      alignItems="center"
                    >
                      <Avatar size="sm" name={p.name} mr="2" />
                      <Text fontSize="sm" color="gray.800">
                        {p.name}
                      </Text>
                    </Box>
                    <Box
                      w="16%"
                      minW="120px"
                      display="flex"
                      alignItems="center"
                    >
                      <Text fontSize="sm" color="gray.600">
                        {p.psr_no}
                      </Text>
                      <IconButton
                        aria-label="Copy PSRN"
                        icon={<FiCopy size={14} />}
                        size="xs"
                        ml="2"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(p.psr_no);
                          toast({
                            title: "Copied to clipboard",
                            status: "success",
                            duration: 1200,
                            isClosable: true,
                          });
                        }}
                      />
                    </Box>
                    <Box w="10%" minW="40px">
                      <Text fontSize="sm" color="gray.600">
                        {p.age}
                      </Text>
                    </Box>
                    <Box w="10%" minW="40px">
                      <Text fontSize="sm" color="gray.600">
                        {p.gender}
                      </Text>
                    </Box>
                    <Box w="22%" minW="140px">
                      <Text fontSize="sm" color="gray.600">
                        {p.visitingTime}
                      </Text>
                    </Box>
                    <Box w="20%" minW="120px">
                      <Text fontSize="sm" color="gray.600">
                        {p.lastVisit || "Nil"}
                      </Text>
                    </Box>
                  </Flex>
                ))
              )}
            </>
          )}
        </Box>
      </Box>

      {/* CENTERED MODAL POPUP */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="4xl"
        isCentered
        motionPreset="scale"
      >
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent borderRadius="2xl">
          <ModalHeader>
            {selectedPatient
              ? `${selectedPatient.name} (PSR: ${selectedPatient.psr_no})`
              : "Patient Details"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Grid templateColumns="repeat(3,1fr)" gap={6}>
              {/* Prescription & Remarks */}
              <Box flex="1" bg="gray.50" p={6} borderRadius="lg" boxShadow="sm">
                <Heading as="h4" size="md" mb={4}>
                  Prescription & Remarks
                </Heading>
                <FormControl mb={4}>
                  <FormLabel>Prescription</FormLabel>
                  <Textarea
                    placeholder="Enter prescription..."
                    value={prescriptionDetails}
                    onChange={(e) => setPrescriptionDetails(e.target.value)}
                    minH="120px"
                  />
                </FormControl>
                <Button w="full" mb={6} onClick={handleAddPrescription}>
                  Save Prescription
                </Button>
                <FormControl mb={4}>
                  <FormLabel>Remark</FormLabel>
                  <Textarea
                    placeholder="Enter remark..."
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    minH="120px"
                  />
                </FormControl>
                <Button w="full" onClick={handleAddRemark}>
                  Save Remark
                </Button>
              </Box>

              {/* Medicines */}
              <Box
                flex="1"
                bg="gray.50"
                p={6}
                borderRadius="lg"
                boxShadow="sm"
                maxH="450px"
                overflowY="auto"
                sx={{ overflow: "visible" }}
              >
                <Heading as="h4" size="md" mb={4}>
                  Prescribe Medicines
                </Heading>

                <Multiselect
                  options={filteredMedicineOptions}
                  selectedValues={selectedMedicines}
                  onSelect={handleMedicineSelect}
                  onRemove={handleMedicineRemove}
                  displayValue="item_name"
                  placeholder="Select medicines"
                  style={{
                    chips: { background: "#4299E1", color: "white" },
                    multiselectContainer: { color: "black" },
                    optionContainer: { zIndex: 1500 },
                  }}
                />
                <Button
                  mt={3}
                  w="full"
                  onClick={handleAddMedicines}
                  isDisabled={!selectedMedicines.length}
                >
                  Add Medicines
                </Button>
              </Box>

              {/* Lab Tests */}
              <Box
                flex="1"
                bg="gray.50"
                p={6}
                borderRadius="lg"
                boxShadow="sm"
                maxH="450px"
                overflowY="auto"
                sx={{ overflow: "visible" }}
              >
                <Heading as="h4" size="md" mb={4}>
                  Prescribe Lab Tests
                </Heading>

                <Multiselect
                  options={filteredLabTestOptions}
                  selectedValues={selectedLabTests}
                  onSelect={handleLabTestSelect}
                  onRemove={handleLabTestRemove}
                  displayValue="test_name"
                  placeholder="Select lab tests"
                  style={{
                    chips: { background: "#4299E1", color: "white" },
                    multiselectContainer: { color: "black" },
                    optionContainer: { zIndex: 1500 },
                  }}
                />
                <Button
                  mt={3}
                  w="full"
                  onClick={handleAddLabTests}
                  isDisabled={!selectedLabTests.length}
                >
                  Add Lab Tests
                </Button>
              </Box>
            </Grid>
          </ModalBody>
          <ModalFooter justifyContent="center">
            <Button colorScheme="green" onClick={handleCompletePatient}>
              Mark Complete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}
