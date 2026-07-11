import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Text,
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
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from "@chakra-ui/react";
import {
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
  FiCopy,
  FiRefreshCw,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from '../../utils/Config';
import { formatDateTimeIST, toTitleCase } from '../../utils/utils';

export default function LabTestDashboard() {
  const username = localStorage.getItem("username");
  const navigate = useNavigate();
  const toast = useToast();

  const [patients, setPatients] = useState({ confirmed: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirmedPage, setConfirmedPage] = useState(1);
  const [upcomingPage, setUpcomingPage] = useState(1);

  useEffect(() => {
    setConfirmedPage(1);
    setUpcomingPage(1);
  }, [searchQuery, startDate, endDate]);

  const filterAndSort = (list) => {
    if (!list) return [];
    let filtered = list.filter((p) => {
      const matchesSearch =
        (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.institute_id || "").toLowerCase().includes(searchQuery.toLowerCase());

      let matchesDate = true;
      const orderTimeStr = p.consultation_completed_time || p.visitingTime;
      if (orderTimeStr) {
        const orderDateStr = orderTimeStr.split("T")[0];
        if (startDate && orderDateStr < startDate) matchesDate = false;
        if (endDate && orderDateStr > endDate) matchesDate = false;
      } else {
        if (startDate || endDate) matchesDate = false;
      }

      return matchesSearch && matchesDate;
    });

    filtered.sort((a, b) => {
      const timeA = new Date(a.consultation_completed_time || a.visitingTime || 0);
      const timeB = new Date(b.consultation_completed_time || b.visitingTime || 0);
      return timeA - timeB;
    });

    return filtered;
  };

  const [configTests, setConfigTests] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [tests, setTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(false);

  const currentTime = formatDateTimeIST(new Date());

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isSuccessOpen,
    onOpen: onSuccessOpen,
    onClose: onSuccessClose,
  } = useDisclosure();

  // Fetch lab‑test config
  const fetchConfigTests = async () => {
    try {
      const token = localStorage.getItem("token");
      const labRes = await axios.get(`${BASE_URL}/dropdown/labtests`, { headers: { Authorization: `Bearer ${token}` } });
      setConfigTests(labRes.data);
    } catch (e) {
      console.error("Error fetching config tests:", e);
    }
  };

  // FETCH PATIENTS
  const fetchPatients = async () => {
    setListLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/lab/patients`, { headers: { Authorization: `Bearer ${token}` } });
      setPatients(res.data || { confirmed: [], upcoming: [] });
    } catch (e) {
      toast({
        title: "Error fetching lab patients",
        description: e.message,
        status: "error",
      });
    } finally {
      setListLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const loadAll = async () => {
      try {
        const [labRes, patRes] = await Promise.all([
          axios.get(`${BASE_URL}/dropdown/labtests`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/lab/patients`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setConfigTests(labRes.data);
        setPatients(patRes.data || { confirmed: [], upcoming: [] });
      } catch (e) {
        toast({
          title: "Error loading data",
          description: e.message,
          status: "error",
        });
      } finally {
        setLoading(false);
        setListLoading(false);
      }
    };
    loadAll();
  }, []);

  // UTILITY: parse group tests
  const parseSubTestNames = (testName) => {
    const match = testName.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1].split(",").map((s) => s.trim());
    return [];
  };

  // FETCH PATIENT DETAILS & PROCESS TESTS
  const handlePatientSelect = async (patient) => {
    // ensure configTests is loaded
    if (!configTests.length) await fetchConfigTests();
    setTestsLoading(true);

    try {
      setSelectedPatient(patient);

      const processed = patient.lab_tests.map((t) => {
        const cfg = configTests.find(
          (ct) =>
            ct.test_name.toLowerCase() === t.lab_test.toLowerCase() ||
            ct.test_id === t.lab_test
        );

        if (cfg && cfg.test_id.toLowerCase().startsWith("group")) {
          const names = parseSubTestNames(cfg.test_name);
          const details = names.map((n) => {
            const sub = configTests.find(
              (ct) => ct.test_name.toLowerCase() === n.toLowerCase()
            );
            return {
              reference_range: sub ? sub.reference_range : "N/A",
              units: sub ? sub.units : "N/A",
            };
          });
          return {
            ...t,
            type: "group",
            subTestNames: names,
            subResults: Array(names.length).fill(""),
            groupReference: cfg.reference_range,
            groupUnits: cfg.units,
            subTestDetails: details,
          };
        } else if (cfg && cfg.reference_range?.includes(",")) {
          const refs = cfg.reference_range.split(",").map((s) => s.trim());
          const unitsArr = cfg.units.split(",").map((s) => s.trim());
          return {
            ...t,
            type: "multi",
            multiResults: Array(refs.length).fill(""),
            reference_ranges: refs,
            unitsArray: unitsArr,
          };
        } else {
          return {
            ...t,
            type: "individual",
            result: "",
            reference_range: cfg ? cfg.reference_range : "N/A",
            units: cfg ? cfg.units : "N/A",
          };
        }
      });

      setTests(processed);
    } catch (err) {
      console.error("Error fetching patient details:", err);
    } finally {
      setTestsLoading(false);
    }
  };

  const openPatientModal = async (p) => {
    await handlePatientSelect(p);
    onOpen();
  };

  // CHANGE HANDLERS
  const handleIndividualResultChange = (i, val) => {
    setTests(prev => {
      const arr = [...prev];
      arr[i] = { ...arr[i], result: val };
      return arr;
    });
  };

  const handleSubResultChange = (gi, si, val) => {
    setTests(prev => {
      const arr = [...prev];
      const newSubResults = [...arr[gi].subResults];
      newSubResults[si] = val;
      arr[gi] = { ...arr[gi], subResults: newSubResults };
      return arr;
    });
  };

  const handleMultiResultChange = (i, si, val) => {
    setTests(prev => {
      const arr = [...prev];
      const newMultiResults = [...arr[i].multiResults];
      newMultiResults[si] = val;
      arr[i] = { ...arr[i], multiResults: newMultiResults };
      return arr;
    });
  };

  // SUBMIT & PRINT
  const submitResults = async () => {
    if (!selectedPatient || !tests.length) {
      toast({
        title: "No test data",
        description: "Please select a patient and enter results first.",
        status: "warning",
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/lab/save_report`,
        {
          institute_id: selectedPatient.institute_id,
          visit_id: selectedPatient.visit_id,
          test_name: tests[0].lab_test,
          results: tests.reduce((acc, t) => {
            if (t.type === "individual") {
              acc[t.lab_test] = {
                value: t.result || "",
                reference_range: t.reference_range || "N/A",
                units: t.units || "N/A"
              };
            } else if (t.type === "group") {
              t.subTestNames.forEach((n, idx) => {
                const det = t.subTestDetails[idx] || {};
                acc[n] = {
                  value: t.subResults[idx] || "",
                  reference_range: det.reference_range || "N/A",
                  units: det.units || "N/A"
                };
              });
            } else if (t.type === "multi") {
              t.reference_ranges.forEach((r, idx) => {
                const label = r.split(":")[0];
                acc[label] = {
                  value: t.multiResults[idx] || "",
                  reference_range: r,
                  units: t.unitsArray[idx] || "N/A"
                };
              });
            }
            return acc;
          }, {}),
          remarks: "",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: "Report saved successfully",
        description: `${toTitleCase(selectedPatient.name)}'s lab report has been generated.`,
        status: "success",
      });

      localStorage.setItem("refreshReports", "true");

      onClose();
      fetchPatients();
    } catch (e) {
      console.error("Error saving report:", e);
      toast({
        title: "Error saving report",
        description: e.message,
        status: "error",
      });
    }
  };



  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" bg="gray.50">
        <Spinner size="xl" color="blue.500" />
      </Flex>
    );
  }



  const ITEMS_PER_PAGE = 5;

  const filteredConfirmed = filterAndSort(patients.confirmed);
  const filteredUpcoming = filterAndSort(patients.upcoming);

  const paginatedConfirmed = filteredConfirmed.slice((confirmedPage - 1) * ITEMS_PER_PAGE, confirmedPage * ITEMS_PER_PAGE);
  const paginatedUpcoming = filteredUpcoming.slice((upcomingPage - 1) * ITEMS_PER_PAGE, upcomingPage * ITEMS_PER_PAGE);

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
        <HStack spacing="4" position="absolute" right="4">
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
              rightIcon={<Avatar size="sm" name={toTitleCase(username)} />}
            >
              <Text fontWeight="medium">Welcome, {toTitleCase(username)}</Text>
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
          {/* Filter Toolbar */}
        <Flex
          mb="6"
          align="center"
          gap="4"
          flexWrap="wrap"
        >
          <HStack spacing="2">
            <Text fontWeight="semibold" color="gray.600" fontSize="sm">
              FILTER
            </Text>
            <Input
              placeholder="Search..."
              size="sm"
              borderRadius="md"
              w="200px"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </HStack>

          <HStack spacing="2">
            <Text fontWeight="semibold" color="gray.600" fontSize="sm">
              Date
            </Text>
            <Input
              type="date"
              size="sm"
              borderRadius="md"
              w="150px"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Text fontSize="xs" color="gray.400">
              to
            </Text>
            <Input
              type="date"
              size="sm"
              borderRadius="md"
              w="150px"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </HStack>

          <Box
            bg="blue.100"
            color="blue.800"
            px="3"
            py="1"
            borderRadius="full"
            fontSize="xs"
            fontWeight="bold"
          >
            Pending Lab Orders: {filteredConfirmed.length}
          </Box>

          <Button
            aria-label="Refresh"
            leftIcon={<FiRefreshCw />}
            colorScheme="blue"
            size="sm"
            onClick={fetchPatients}
            isLoading={listLoading}
            variant="outline"
            bg="white"
            ml="auto"
          >
            Refresh
          </Button>
        </Flex>

        {listLoading ? (
          <Flex align="center" justify="center" py="10">
            <Spinner size="lg" color="blue.500" />
          </Flex>
        ) : (
          <>
            {/* Confirmed Lab Test Orders Table */}
            <Heading as="h3" size="md" color="gray.800" mb="4">
              Confirmed Lab Test Orders ({filteredConfirmed.length})
            </Heading>
            <Box mb="8" overflowX="auto">
              {filteredConfirmed.length === 0 ? (
                <Flex h="100px" align="center" justify="center">
                  <Text color="gray.500" fontSize="sm">
                    No confirmed lab orders found.
                  </Text>
                </Flex>
              ) : (
                <>
                  <Table variant="simple" size="sm">
                    <Thead bg="gray.50">
                      <Tr>
                        <Th w="20%">Institute ID</Th>
                        <Th w="35%">Patient Details</Th>
                        <Th w="25%" textAlign="center">Lab Test Order Time</Th>
                        <Th w="20%" textAlign="center">Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {paginatedConfirmed.map((p, idx) => (
                        <Tr key={idx} _hover={{ bg: "gray.50" }}>
                          <Td>
                            <Flex align="center">
                              <Text fontSize="sm" fontWeight="medium" color="gray.800">
                                {p.institute_id}
                              </Text>
                              <IconButton
                                aria-label="Copy ID"
                                icon={<FiCopy size={12} />}
                                size="xs"
                                ml="2"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(p.institute_id);
                                  toast({
                                    title: "Copied!",
                                    status: "success",
                                    duration: 1000,
                                  });
                                }}
                              />
                            </Flex>
                          </Td>
                          <Td>
                            <Flex align="center">
                              <Box>
                                <Text fontWeight="bold" fontSize="sm">
                                  {toTitleCase(p.name)}
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                  {p.age} yrs • {p.gender}
                                </Text>
                              </Box>
                            </Flex>
                          </Td>
                          <Td textAlign="center">
                            <Text fontSize="sm" color="gray.600">
                              {p.consultation_completed_time
                                ? formatDateTimeIST(p.consultation_completed_time)
                                : p.visitingTime
                                  ? formatDateTimeIST(p.visitingTime)
                                  : "TBD"}
                            </Text>
                          </Td>
                          <Td textAlign="center">
                            <Button
                              colorScheme="blue"
                              size="sm"
                              borderRadius="full"
                              onClick={() => openPatientModal(p)}
                            >
                              View Lab Order
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  <Flex justify="space-between" mt={4} align="center">
                    <Text fontSize="sm" color="gray.500">
                      Showing {paginatedConfirmed.length} of {filteredConfirmed.length} orders
                    </Text>
                    <HStack>
                      <IconButton
                        icon={<FiChevronLeft />}
                        size="sm"
                        isDisabled={confirmedPage === 1}
                        onClick={() => setConfirmedPage(confirmedPage - 1)}
                        aria-label="Previous Page"
                      />
                      <Text fontSize="sm">Page {confirmedPage} of {Math.ceil(filteredConfirmed.length / ITEMS_PER_PAGE) || 1}</Text>
                      <IconButton
                        icon={<FiChevronRight />}
                        size="sm"
                        isDisabled={confirmedPage * ITEMS_PER_PAGE >= filteredConfirmed.length}
                        onClick={() => setConfirmedPage(confirmedPage + 1)}
                        aria-label="Next Page"
                      />
                    </HStack>
                  </Flex>
                </>
              )}
            </Box>

            {/* Upcoming Lab Test Orders Table Accordion */}
            <Accordion allowToggle defaultIndex={[]} mb="8">
              <AccordionItem border="none">
                <h2>
                  <AccordionButton
                    p={0}
                    _hover={{ bg: "transparent" }}
                    _focus={{ boxShadow: "none" }}
                  >
                    <Box flex="1" textAlign="left">
                      <Heading as="h3" size="md" color="gray.800" mb="4" display="flex" alignItems="center">
                        Upcoming Lab Test Orders ({filteredUpcoming.length})
                        <AccordionIcon ml={2} />
                      </Heading>
                    </Box>
                  </AccordionButton>
                </h2>
                <AccordionPanel p={0}>
                  <Box overflowX="auto">
                    {filteredUpcoming.length === 0 ? (
                      <Flex h="100px" align="center" justify="center">
                        <Text color="gray.500" fontSize="sm">
                          No upcoming lab orders found.
                        </Text>
                      </Flex>
                    ) : (
                      <>
                        <Table variant="simple" size="sm">
                          <Thead bg="gray.50">
                            <Tr>
                              <Th w="20%">Institute ID</Th>
                              <Th w="35%">Patient Details</Th>
                              <Th w="25%" textAlign="center">Lab Test Order Time</Th>
                              <Th w="20%" textAlign="center">Actions</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {paginatedUpcoming.map((p, idx) => (
                              <Tr key={idx} _hover={{ bg: "gray.50" }}>
                                <Td>
                                  <Flex align="center">
                                    <Text fontSize="sm" fontWeight="medium" color="gray.800">
                                      {p.institute_id}
                                    </Text>
                                    <IconButton
                                      aria-label="Copy ID"
                                      icon={<FiCopy size={12} />}
                                      size="xs"
                                      ml="2"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(p.institute_id);
                                        toast({
                                          title: "Copied!",
                                          status: "success",
                                          duration: 1000,
                                        });
                                      }}
                                    />
                                  </Flex>
                                </Td>
                                <Td>
                                  <Flex align="center">
                                    <Box>
                                      <Text fontWeight="bold" fontSize="sm">
                                        {toTitleCase(p.name)}
                                      </Text>
                                      <Text fontSize="xs" color="gray.500">
                                        {p.age} yrs • {p.gender}
                                      </Text>
                                    </Box>
                                  </Flex>
                                </Td>
                                <Td textAlign="center">
                                  <Text fontSize="sm" color="gray.600">
                                    {p.consultation_completed_time
                                      ? formatDateTimeIST(p.consultation_completed_time)
                                      : p.visitingTime
                                        ? formatDateTimeIST(p.visitingTime)
                                        : "TBD"}
                                  </Text>
                                </Td>
                                <Td textAlign="center">
                                  <Button
                                    colorScheme="gray"
                                    size="sm"
                                    borderRadius="full"
                                    isDisabled={true}
                                  >
                                    View Lab Order
                                  </Button>
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                        <Flex justify="space-between" mt={4} align="center">
                          <Text fontSize="sm" color="gray.500">
                            Showing {paginatedUpcoming.length} of {filteredUpcoming.length} orders
                          </Text>
                          <HStack>
                            <IconButton
                              icon={<FiChevronLeft />}
                              size="sm"
                              isDisabled={upcomingPage === 1}
                              onClick={() => setUpcomingPage(upcomingPage - 1)}
                              aria-label="Previous Page"
                            />
                            <Text fontSize="sm">Page {upcomingPage} of {Math.ceil(filteredUpcoming.length / ITEMS_PER_PAGE) || 1}</Text>
                            <IconButton
                              icon={<FiChevronRight />}
                              size="sm"
                              isDisabled={upcomingPage * ITEMS_PER_PAGE >= filteredUpcoming.length}
                              onClick={() => setUpcomingPage(upcomingPage + 1)}
                              aria-label="Next Page"
                            />
                          </HStack>
                        </Flex>
                      </>
                    )}
                  </Box>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </>
        )}
        </Box>
      </Box>

      {/* PATIENT MODAL */}
      <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader bg="blue.600" color="white">
            {selectedPatient
              ? `${toTitleCase(selectedPatient.name)} (ID: ${selectedPatient.institute_id})`
              : "Patient Details"}
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody bg="gray.50">
            {testsLoading ? (
              <Flex align="center" justify="center" h="200px">
                <Spinner size="xl" color="blue.500" />
              </Flex>
            ) : (
              <Box bg="white" borderRadius="lg" boxShadow="md" p={4}>
                <Table variant="simple" size="md">
                  <Thead>
                    <Tr>
                      <Th>Test Name</Th>
                      <Th>Result</Th>
                      <Th>Reference Range</Th>
                      <Th>Units</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {tests.map((test, idx) => {
                      if (test.type === "individual")
                        return (
                          <Tr key={idx}>
                            <Td fontWeight="semibold" color="blue.700">
                              {test.lab_test}
                            </Td>
                            <Td>
                              <Input
                                size="sm"
                                value={test.result}
                                onChange={(e) =>
                                  handleIndividualResultChange(
                                    idx,
                                    e.target.value
                                  )
                                }
                              />
                            </Td>
                            <Td>{test.reference_range}</Td>
                            <Td>{test.units}</Td>
                          </Tr>
                        );
                      if (test.type === "group")
                        return (
                          <React.Fragment key={idx}>
                            <Tr>
                              <Td colSpan={4} fontWeight="bold" bg="blue.50">
                                {test.lab_test}
                              </Td>
                            </Tr>
                            {test.subTestNames.map((n, i) => (
                              <Tr key={i}>
                                <Td pl={6}>{n}</Td>
                                <Td>
                                  <Input
                                    size="sm"
                                    value={test.subResults[i]}
                                    onChange={(e) =>
                                      handleSubResultChange(
                                        idx,
                                        i,
                                        e.target.value
                                      )
                                    }
                                  />
                                </Td>
                                <Td>
                                  {test.subTestDetails[i]?.reference_range ||
                                    "N/A"}
                                </Td>
                                <Td>{test.subTestDetails[i]?.units || "N/A"}</Td>
                              </Tr>
                            ))}
                          </React.Fragment>
                        );
                      if (test.type === "multi")
                        return (
                          <React.Fragment key={idx}>
                            <Tr>
                              <Td colSpan={4} fontWeight="bold" bg="blue.50">
                                {test.lab_test}
                              </Td>
                            </Tr>
                            {test.reference_ranges.map((r, i) => (
                              <Tr key={i}>
                                <Td pl={6}>{r.split(":")[0]}</Td>
                                <Td>
                                  <Input
                                    size="sm"
                                    value={test.multiResults[i]}
                                    onChange={(e) =>
                                      handleMultiResultChange(
                                        idx,
                                        i,
                                        e.target.value
                                      )
                                    }
                                  />
                                </Td>
                                <Td>{r}</Td>
                                <Td>{test.unitsArray[i] || "N/A"}</Td>
                              </Tr>
                            ))}
                          </React.Fragment>
                        );
                      return null;
                    })}
                  </Tbody>
                </Table>
              </Box>
            )}
          </ModalBody>
          <ModalFooter bg="gray.50">
            <Button colorScheme="blue" onClick={submitResults}>
              Save Results
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal isOpen={isSuccessOpen} onClose={onSuccessClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Success</ModalHeader>
          <ModalBody>Results submitted successfully!</ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={onSuccessClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}
