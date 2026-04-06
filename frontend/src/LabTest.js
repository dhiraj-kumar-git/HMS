import React, { useState, useEffect } from "react";
import {
  Box,
  Flex,
  Grid,
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
  Image,
  Icon,
  Progress,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
} from "@chakra-ui/react";
import {
  FiCalendar,
  FiBell,
  FiMail,
  FiUser,
  FiLogOut,
  FiCopy,
  FiRefreshCw,
  FiMoreHorizontal,
  FiChevronDown,
  FiArrowUp,
  FiArrowDown,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from './Config';

export default function LabTestDashboard() {
  const username = localStorage.getItem("username");
  const navigate = useNavigate();
  const toast = useToast();

  const [emailLoading, setEmailLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);

  const [configTests, setConfigTests] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [tests, setTests] = useState([]);
  const [testsLoading, setTestsLoading] = useState(false);

  const [timeframe, setTimeframe] = useState("last_month");
  const [selectedTab, setSelectedTab] = useState("All");
  const [workload, setWorkload] = useState(88);
  const workloadChange = 5; // example +5%
  const [stats, setStats] = useState({
    Urgent: 0,
    Pending: 4,
    "In-Progress": 38,
    Completed: 265,
  });
  const [percent, setPercent] = useState({
    Urgent: -10,
    Pending: 2,
    "In-Progress": 14,
    Completed: 8,
  });

  const currentTime = new Date().toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

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
      setPatients(res.data);
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
        setPatients(patRes.data);
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
  const handlePatientSelect = async (psrNo) => {
    // ensure configTests is loaded
    if (!configTests.length) await fetchConfigTests();
    setTestsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${BASE_URL}/get_patient/${psrNo}`, { headers: { Authorization: `Bearer ${token}` } });
      const patient = response.data;
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
    await handlePatientSelect(p.psr_no);
    onOpen();
  };

  // CHANGE HANDLERS
  const handleIndividualResultChange = (i, val) => {
    const arr = [...tests];
    arr[i].result = val;
    setTests(arr);
  };

  const handleSubResultChange = (gi, si, val) => {
    const arr = [...tests];
    arr[gi].subResults[si] = val;
    setTests(arr);
  };

  const handleMultiResultChange = (i, si, val) => {
    const arr = [...tests];
    arr[i].multiResults[si] = val;
    setTests(arr);
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
          psr_no: selectedPatient.psr_no,
          test_name: tests[0].lab_test,
          results: tests.reduce((acc, t) => {
            if (t.type === "individual") acc[t.lab_test] = t.result;
            else if (t.type === "group")
              t.subTestNames.forEach(
                (n, idx) => (acc[n] = t.subResults[idx] || "")
              );
            else if (t.type === "multi")
              t.reference_ranges.forEach(
                (r, idx) => (acc[r.split(":")[0]] = t.multiResults[idx] || "")
              );
            return acc;
          }, {}),
          remarks: "",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: "Report saved successfully",
        description: `${selectedPatient.name}'s lab report has been generated.`,
        status: "success",
      });

      localStorage.setItem("refreshReports", "true");

      onClose();
    } catch (e) {
      console.error("Error saving report:", e);
      toast({
        title: "Error saving report",
        description: e.message,
        status: "error",
      });
    }
  };

  // Email Report
  const handleMailing = async () => {
    if (!selectedPatient?.psr_no) {
      toast({
        title: "No patient selected",
        description: "Please open a patient report first.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setEmailLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BASE_URL}/get_patient/${selectedPatient.psr_no}`, { headers: { Authorization: `Bearer ${token}` } });

      const patientData = res.data;
      const recipientEmail = patientData.email;

      if (!recipientEmail) {
        toast({
          title: "Email not found",
          description: "This patient does not have an email registered.",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      const latestResults = tests
        .map((t) => {
          if (t.type === "individual") return `${t.lab_test}: ${t.result}`;
          if (t.type === "group")
            return t.subTestNames
              .map((n, i) => `${n}: ${t.subResults[i]}`)
              .join(", ");
          if (t.type === "multi")
            return t.reference_ranges
              .map(
                (r, i) => `${r.split(":")[0]}: ${t.multiResults[i] || "N/A"}`
              )
              .join(", ");
          return "";
        })
        .join("\n");

      const subject = `Lab Report for ${patientData.name} (PSR ${selectedPatient.psr_no})`;
      const body = `Dear ${patientData.name},

Your lab test report is now available.

${latestResults}

Best regards,
Medical Centre Team
BITS Pilani
`;

      await axios.post(
        `${BASE_URL}/lab/send_email`,
        { to_email: recipientEmail, subject, body },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: "Email sent successfully",
        description: `Report sent to ${recipientEmail}`,
        status: "success",
      });
    } catch (err) {
      console.error("Error emailing report:", err);
      toast({
        title: "Error emailing report",
        description: err.message || "Unable to send email.",
        status: "error",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  // Print Report
  const handlePrint = () => {
    const currentDateTime = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    
    let rows = "";
    tests.forEach((test) => {
      if (test.type === "individual") {
        rows += `<tr>
          <td style="background:#FFFBCC;font-weight:bold;">${test.lab_test}</td>
          <td>${test.result || "Pending"}</td>
          <td>${test.reference_range}</td>
          <td>${test.units}</td>
        </tr>`;
      } else if (test.type === "group") {
        rows += `<tr><td colspan="4" style="font-weight:bold;">
          ${test.lab_test} (Overall Ref: ${test.groupReference}, Units: ${test.groupUnits})
        </td></tr>`;
        test.subTestNames.forEach((n, idx) => {
          const det = test.subTestDetails[idx] || {};
          rows += `<tr>
            <td>${n}</td>
            <td>${test.subResults[idx] || "Pending"}</td>
            <td>${det.reference_range || "N/A"}</td>
            <td>${det.units || "N/A"}</td>
          </tr>`;
        });
      } else if (test.type === "multi") {
        rows += `<tr><td colspan="4" style="background:#FFFBCC;font-weight:bold;">
          ${test.lab_test}
        </td></tr>`;
        test.reference_ranges.forEach((r, idx) => {
          const label = r.split(":")[0];
          rows += `<tr>
            <td>${label}</td>
            <td>${test.multiResults[idx] || "Pending"}</td>
            <td>${r}</td>
            <td>${test.unitsArray[idx] || "N/A"}</td>
          </tr>`;
        });
      }
    });

    const win = window.open("", "_blank");
    win.document.write(`
      <html>
        <head>
          <title>Lab Report</title>
          <style>
            body { font-family: Arial; margin: 20px; }
            .header-box { text-align: center; border-bottom: 1px solid black; padding-bottom: 8px; }
            .header-box h2 { margin: 0; font-size: 18px; font-weight: bold; }
            .header-box p { margin: 2px 0; font-size: 14px; }
            .header-box h3 { margin: 4px 0; font-size: 16px; font-weight: bold; }
            .header-flex { display: flex; justify-content: space-between; font-size: 13px; margin-top: 4px; }
            .patient-info { border: 1px solid black; border-radius: 4px; padding: 10px; margin-top: 10px; }
            .patient-row { display: flex; justify-content: space-between; align-items: flex-start; }
            .patient-left, .patient-right { width: 48%; }
            .patient-left div, .patient-right div { margin-bottom: 4px; display: flex; }
            .patient-left div span:first-child, .patient-right div span:first-child { display: inline-block; width: 100px; font-weight: 500; }

            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background: #f0f0f0; }
            .sig { margin-top: 30px; text-align: right; }
          </style>
        </head>
        <body>

          <div class="header-box">
            <h2>Birla Institute of Technology & Science</h2>
            <p>Pilani (Rajasthan) 333 031, India</p>
            <h3>MEDICAL CENTRE</h3>
            <p>Vidya Vihar, Pilani, RAJASTHAN</p>
            <div class="header-flex">
              <div style="text-align:left;">
                <div>Contact No.: 01596-515525</div>
                <div>Email: medc@pilani.bits-pilani.ac.in</div>
                <div>Website: www.bits-pilani.ac.in</div>
              </div>
              <div style="text-align:right;">
                <div>Fax: 01596-244183</div>
                <div>Date & Time: ${currentDateTime}</div>
              </div>
            </div>
          </div>

          <div class="patient-info">
            <div class="patient-row">
              <div class="patient-left">
                <div><span>Name</span><span>: ${
                  selectedPatient?.name?.toUpperCase() || ""
                }</span></div>
                <div><span>Sex & Age</span><span>: ${
                  selectedPatient?.gender?.toUpperCase() || ""
                } / ${selectedPatient?.age || ""}Yr</span></div>
                <div><span>Ph/Mob No</span><span>: ${
                  selectedPatient?.contact_no || "/"
                }</span></div>
                <div><span>Email ID</span><span>: ${
                  selectedPatient?.email || "/"
                }</span></div>
                <div><span>Address</span><span>: ${
                  selectedPatient?.address || ""
                }</span></div>
              </div>
              <div class="patient-right">
                <div><span>PSRN/ID No</span><span>: ${
                  selectedPatient?.psr_no || ""
                }</span></div>
                <div><span>Date & Time</span><span>: ${currentDateTime}</span></div>
              </div>
            </div>
          </div>

          <h3 style="text-align:center;margin:20px 0;">LAB TEST REPORT</h3>
          <table>
            <thead>
              <tr><th>Test Name</th><th>Result</th><th>Reference Range</th><th>Units</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="sig">
            <p>Lab Technician Signature: ____________</p>
            <p>Date: ${currentDateTime}</p>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
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

  const displayedPatients = patients;

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
              rightIcon={<Avatar size="sm" name={username} />}
            >
              <Text fontWeight="medium">Welcome, {username}</Text>
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
        px="8"
        py="6"
        mx="8"
        maxW="1200px"
        overflow="hidden"
        overflowY="auto"
      >
        {/* ─── Test Request Overview ─── */}
        <Flex mb="8" gap="6" flexWrap="wrap">
          {/* ─────────── Left: single blue‑background overview card ─────────── */}
          <Box flex="3" bg="blue.50" borderRadius="2xl" boxShadow="md" p="2">
            <Flex justify="space-between" align="center">
              <Text fontSize="xl" fontWeight="bold" color="gray.800">
                Test Request Overview
              </Text>
              <Menu>
                <MenuButton
                  as={Button}
                  rightIcon={<Icon as={FiChevronDown} />}
                  size="sm"
                  variant="outline"
                  borderRadius="full"
                >
                  {timeframe === "last_month" ? "Last Month" : "This Week"}
                </MenuButton>
                <MenuList>
                  <MenuItem onClick={() => setTimeframe("last_month")}>
                    Last Month
                  </MenuItem>
                  <MenuItem onClick={() => setTimeframe("this_week")}>
                    This Week
                  </MenuItem>
                </MenuList>
              </Menu>
            </Flex>

            <HStack spacing="3" mt="4">
              {["All", "Urgent", "Pending", "In-Progress", "Completed"].map(
                (tab) => (
                  <Button
                    key={tab}
                    size="sm"
                    onClick={() => setSelectedTab(tab)}
                    borderRadius="full"
                    bg={selectedTab === tab ? "purple.100" : "white"}
                    _hover={{ bg: "gray.100" }}
                    border="1px solid"
                    borderColor={
                      selectedTab === tab ? "purple.200" : "gray.200"
                    }
                  >
                    {tab}
                  </Button>
                )
              )}
            </HStack>

            <Grid
              templateColumns="2fr repeat(2,1fr)"
              templateRows="repeat(2,1fr)"
              gap={0}
              mt="6"
            >
              {/* Laboratory workload (spans 2 rows) */}
              <Box
                gridRow="1 / span 2"
                gridColumn="1 / 2"
                p="4"
                borderRight="1px solid"
                borderColor="blue.100"
              >
                <Flex justify="space-between" align="center">
                  <Text fontSize="md" fontWeight="medium" color="blue.600">
                    Laboratory workload
                  </Text>
                  <Flex align="center">
                    <Icon as={FiArrowUp} boxSize="4" color="blue.500" />
                    <Text ml="1" fontSize="sm" color="blue.500">
                      {workloadChange}%
                    </Text>
                  </Flex>
                </Flex>

                <Text fontSize="4xl" fontWeight="bold" color="blue.600" mt="2">
                  {workload}%
                </Text>
                <Progress
                  value={workload}
                  size="xs"
                  colorScheme="blue"
                  borderRadius="sm"
                  mt="2"
                />

                <Text fontSize="sm" color="gray.600" mt="3">
                  Laboratory utilization rates have shown an increase—boosting
                  efficiency and resource optimization.
                </Text>

                <Button size="sm" mt="4" variant="outline" borderRadius="full">
                  Detailed Data Analysis
                </Button>
              </Box>

              {/* Urgent */}
              <Box
                gridRow="1"
                gridColumn="2"
                p="4"
                bg="blue.50"
                borderRight="1px solid"
                borderBottom="1px solid"
                borderColor="blue.100"
              >
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" color="gray.500">
                    Urgent
                  </Text>
                  <Flex align="center">
                    <Icon as={FiArrowDown} boxSize="4" color="red.500" />
                    <Text ml="1" fontSize="xs" color="red.500">
                      {percent.Urgent}%
                    </Text>
                  </Flex>
                </Flex>
                <Text
                  fontSize="2xl"
                  fontWeight="bold"
                  color="orange.400"
                  mt="2"
                >
                  {stats.Urgent}
                </Text>
              </Box>

              {/* Pending */}
              <Box
                gridRow="1"
                gridColumn="3"
                p="4"
                bg="blue.50"
                borderBottom="1px solid"
                borderColor="blue.100"
              >
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" color="gray.500">
                    Pending
                  </Text>
                  <Flex align="center">
                    <Icon as={FiArrowUp} boxSize="4" color="green.400" />
                    <Text ml="1" fontSize="xs" color="green.400">
                      {percent.Pending}%
                    </Text>
                  </Flex>
                </Flex>
                <Text fontSize="2xl" fontWeight="bold" color="green.400" mt="2">
                  {stats.Pending}
                </Text>
              </Box>

              {/* In-Progress */}
              <Box
                gridRow="2"
                gridColumn="2"
                p="4"
                bg="blue.50"
                borderRight="1px solid"
                borderColor="blue.100"
              >
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" color="gray.500">
                    In-Progress
                  </Text>
                  <Flex align="center">
                    <Icon as={FiArrowUp} boxSize="4" color="blue.400" />
                    <Text ml="1" fontSize="xs" color="blue.400">
                      {percent["In-Progress"]}%
                    </Text>
                  </Flex>
                </Flex>
                <Text fontSize="2xl" fontWeight="bold" color="blue.400" mt="2">
                  {stats["In-Progress"]}
                </Text>
              </Box>

              {/* Completed */}
              <Box gridRow="2" gridColumn="3" p="4" bg="blue.50">
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" color="gray.500">
                    Completed
                  </Text>
                  <Flex align="center">
                    <Icon as={FiArrowUp} boxSize="4" color="purple.400" />
                    <Text ml="1" fontSize="xs" color="purple.400">
                      {percent.Completed}%
                    </Text>
                  </Flex>
                </Flex>
                <Text
                  fontSize="2xl"
                  fontWeight="bold"
                  color="purple.400"
                  mt="2"
                >
                  {stats.Completed}
                </Text>
              </Box>
            </Grid>
          </Box>

          {/* ── Right: revenue + ENLARGED maintenance ── */}
          <Box flex="1" display="flex" flexDirection="column">
            {/* ─── Maintenance card (image on top, text below) ─── */}
            <Box
              bg="white"
              p="6"
              flex="1"
              borderRadius="lg"
              boxShadow="sm"
              position="relative"
            >
              {/* top‑right “more” icon */}
              <IconButton
                icon={<FiMoreHorizontal />}
                aria-label="More options"
                variant="ghost"
                size="sm"
                position="absolute"
                top="2"
                right="2"
              />

              {/* image on top, full width */}
              <Image
                src="/images/LabTest.jpg"
                alt="Maintenance"
                w="full"
                h="140px"
                objectFit="cover"
                borderRadius="md"
                mb="4"
              />

              {/* text below */}
              <Text fontSize="sm" color="gray.600" mb="2">
                Equipment maintenance is due for the Hematology Analyzer.
                Schedule maintenance to avoid disruptions.
              </Text>
              <Button variant="link" size="sm">
                View Details &gt;&gt;
              </Button>
            </Box>
          </Box>
        </Flex>

        {/* ─── Upcoming Lab Tests & Refresh ─── */}
        <Flex align="center" mb="4">
          <Heading as="h3" size="md" color="gray.800" mr="2">
            Upcoming Lab Tests
          </Heading>
          <IconButton
            aria-label="Refresh"
            icon={<FiRefreshCw />}
            variant="ghost"
            size="sm"
            onClick={fetchPatients}
          />
        </Flex>

        <Box maxH="60vh" overflowY="auto" position="relative" pb="12">
          {listLoading ? (
            <Flex position="absolute" inset="0" align="center" justify="center">
              <Spinner size="lg" color="blue.500" />
            </Flex>
          ) : (
            <>
              <Flex
                position="sticky"
                top="0"
                bg="gray.50"
                zIndex="1"
                px="3"
                py="1"
                fontSize="xs"
                fontWeight="semibold"
                color="gray.600"
                mb="3"
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
                    No lab tests right now.
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
                            title: "Copied!",
                            status: "success",
                            duration: 1000,
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
                        {p.visitingTime || "TBD"}
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

      {/* PATIENT MODAL */}
      <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader bg="blue.600" color="white">
            {selectedPatient
              ? `${selectedPatient.name} (PSR: ${selectedPatient.psr_no})`
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
            <Button colorScheme="blue" onClick={submitResults} mr={3}>
              Save Results
            </Button>
            <Button colorScheme="green" onClick={handlePrint}>
              Print Report
            </Button>
            <Button
              colorScheme="yellow"
              onClick={handleMailing}
              isLoading={emailLoading}
              ml={3}
            >
              Email Report
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
