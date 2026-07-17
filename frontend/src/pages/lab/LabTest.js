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
  VStack,
  InputGroup,
  InputLeftElement,
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
  FormControl,
  FormErrorMessage,
  Stack,
  Badge,
  Grid,
  GridItem,
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
  FiCheckCircle,
  FiSearch,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BASE_URL from '../../utils/Config';
import { formatDateTimeIST, toTitleCase } from '../../utils/utils';
import LabReportSlip from "../../components/LabReportSlip";
import { generateLabReportPdf } from "../../utils/labReportPdf";

const cleanTestName = (name) => {
  if (!name) return "";
  const idx = name.indexOf("(");
  if (idx !== -1) {
    return name.substring(0, idx).trim();
  }
  return name.trim();
};

const formatDateTimeSplit = (timestamp) => {
  const formatted = formatDateTimeIST(timestamp);
  if (formatted.includes(", ")) {
    const parts = formatted.split(", ");
    return (
      <Box>
        <Text fontSize="xs" fontWeight="semibold" color="gray.700">{parts[0]}</Text>
        <Text fontSize="2xs" color="gray.500" mt={0.5}>{parts[1]}</Text>
      </Box>
    );
  }
  return <Text fontSize="xs" fontWeight="semibold" color="gray.700">{formatted}</Text>;
};

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

  const [uploadPatient, setUploadPatient] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState({});
  const [uploadFiles, setUploadFiles] = useState({}); // { [testName]: File }
  const [uploadingTests, setUploadingTests] = useState({}); // { [testName]: boolean }

  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isSuccessOpen,
    onOpen: onSuccessOpen,
    onClose: onSuccessClose,
  } = useDisclosure();
  const {
    isOpen: isUploadOpen,
    onOpen: onUploadOpen,
    onClose: onUploadClose,
  } = useDisclosure();
  const {
    isOpen: isCompleteOpen,
    onOpen: onCompleteOpen,
    onClose: onCompleteClose,
  } = useDisclosure();
  const [isCompleting, setIsCompleting] = useState(false);
  const [emailingId, setEmailingId] = useState(null);
  const {
    isOpen: isDeleteConfirmOpen,
    onOpen: onDeleteConfirmOpen,
    onClose: onDeleteConfirmClose,
  } = useDisclosure();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const {
    isOpen: isSaveConfirmOpen,
    onOpen: onSaveConfirmOpen,
    onClose: onSaveConfirmClose,
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
      const drafts = patient.lab_results_draft || {};
      // 1. Identify all prescribed group tests and gather all covered component/sub-field names
      const prescribedGroupConfigs = [];
      patient.lab_tests.forEach((lt) => {
        const subCfg = configTests.find(
          (ct) =>
            ct.test_name.toLowerCase() === lt.lab_test.toLowerCase() ||
            ct.test_id === lt.lab_test
        );
        if (subCfg && (subCfg.sub_tests || subCfg.test_id.toLowerCase().startsWith("group"))) {
          prescribedGroupConfigs.push(subCfg);
        }
      });

      const coveredNames = new Set();
      prescribedGroupConfigs.forEach((gCfg) => {
        if (gCfg.sub_tests) {
          gCfg.sub_tests.forEach((st) => {
            coveredNames.add(st.name.toLowerCase());
            // Also add nested fields if st is multi-parameter
            const subCfg = configTests.find(
              (ct) => ct.test_name.toLowerCase() === st.name.toLowerCase()
            );
            const refRange = subCfg?.reference_range || st.reference_range || "";
            if (refRange.includes(",")) {
              const refs = refRange.split(",").map((s) => s.trim());
              refs.forEach((ref) => {
                const label = ref.split(":")[0];
                coveredNames.add(label.toLowerCase());
              });
            }
          });
        } else {
          // Legacy prefix parsing fallback
          const legacyNames = parseSubTestNames(gCfg.test_name);
          legacyNames.forEach((ln) => {
            coveredNames.add(ln.toLowerCase());
            const sub = configTests.find(
              (ct) => ct.test_name.toLowerCase() === ln.toLowerCase()
            );
            if (sub && sub.reference_range?.includes(",")) {
              const refs = sub.reference_range.split(",").map((s) => s.trim());
              refs.forEach((ref) => {
                const label = ref.split(":")[0];
                coveredNames.add(label.toLowerCase());
              });
            }
          });
        }
      });

      // 2. Filter out any prescribed tests that are covered under group tests
      const deduplicatedLabTests = patient.lab_tests.filter((lt) => {
        // Keep group tests themselves
        const subCfg = configTests.find(
          (ct) =>
            ct.test_name.toLowerCase() === lt.lab_test.toLowerCase() ||
            ct.test_id === lt.lab_test
        );
        const isGroup = subCfg && (subCfg.sub_tests || subCfg.test_id.toLowerCase().startsWith("group"));
        if (isGroup) return true;

        // Remove individual tests if covered
        return !coveredNames.has(lt.lab_test.toLowerCase());
      });

      const processed = deduplicatedLabTests.map((t) => {
        const cfg = configTests.find(
          (ct) =>
            ct.test_name.toLowerCase() === t.lab_test.toLowerCase() ||
            ct.test_id === t.lab_test
        );

        if (cfg && cfg.sub_tests) {
          const names = [];
          const details = [];
          cfg.sub_tests.forEach((st) => {
            const subCfg = configTests.find(
              (ct) => ct.test_name.toLowerCase() === st.name.toLowerCase()
            );
            const refRange = subCfg?.reference_range || st.reference_range || "";
            const unitVal = subCfg?.units || st.units || "";
            if (refRange.includes(",")) {
              // Add header row first
              names.push(st.name);
              details.push({
                isHeader: true,
                reference_range: "",
                units: "",
              });

              // Add nested fields
              const refs = refRange.split(",").map((s) => s.trim());
              const unitsArr = unitVal.split(",").map((s) => s.trim());
              refs.forEach((ref, idx) => {
                const label = ref.split(":")[0];
                names.push(label);
                details.push({
                  isSubField: true,
                  reference_range: ref,
                  units: unitsArr[idx] || "N/A",
                  parentName: st.name,
                });
              });
            } else {
              names.push(st.name);
              details.push({
                reference_range: refRange || "N/A",
                units: unitVal || "N/A",
              });
            }
          });
          return {
            ...t,
            type: "group",
            subTestNames: names,
            subResults: names.map((n, idx) => {
              const det = details[idx] || {};
              const draftKey = det.isSubField ? `${det.parentName} - ${n}` : n;
              return drafts[draftKey]?.value || drafts[n]?.value || "";
            }),
            groupReference: cfg.reference_range || "See individual components",
            groupUnits: cfg.units || "Various",
            subTestDetails: details,
          };
        } else if (cfg && cfg.test_id.toLowerCase().startsWith("group")) {
          const legacyNames = parseSubTestNames(cfg.test_name);
          const names = [];
          const details = [];
          legacyNames.forEach((n) => {
            const sub = configTests.find(
              (ct) => ct.test_name.toLowerCase() === n.toLowerCase()
            );
            if (sub && sub.reference_range?.includes(",")) {
              // Add header row first
              names.push(n);
              details.push({
                isHeader: true,
                reference_range: "",
                units: "",
              });

              // Add nested fields
              const refs = sub.reference_range.split(",").map((s) => s.trim());
              const unitsArr = (sub.units || "").split(",").map((s) => s.trim());
              refs.forEach((ref, idx) => {
                const label = ref.split(":")[0];
                names.push(label);
                details.push({
                  isSubField: true,
                  reference_range: ref,
                  units: unitsArr[idx] || "N/A",
                  parentName: n,
                });
              });
            } else {
              names.push(n);
              details.push({
                reference_range: sub ? sub.reference_range : "N/A",
                units: sub ? sub.units : "N/A",
              });
            }
          });
          return {
            ...t,
            type: "group",
            subTestNames: names,
            subResults: names.map((n, idx) => {
              const det = details[idx] || {};
              const draftKey = det.isSubField ? `${det.parentName} - ${n}` : n;
              return drafts[draftKey]?.value || drafts[n]?.value || "";
            }),
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
            multiResults: refs.map((r) => drafts[r.split(":")[0]]?.value || ""),
            reference_ranges: refs,
            unitsArray: unitsArr,
          };
        } else {
          return {
            ...t,
            type: "individual",
            result: drafts[t.lab_test]?.value || "",
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

  const getNonRedundantTests = (patient) => {
    if (!patient || !patient.lab_tests) return [];

    // Get all group tests prescribed
    const prescribedGroupConfigs = [];
    patient.lab_tests.forEach((lt) => {
      const subCfg = configTests.find(
        (ct) =>
          ct.test_name.toLowerCase() === lt.lab_test.toLowerCase() ||
          ct.test_id === lt.lab_test
      );
      if (subCfg && (subCfg.sub_tests || subCfg.test_id.toLowerCase().startsWith("group"))) {
        prescribedGroupConfigs.push(subCfg);
      }
    });

    const coveredNames = new Set();
    prescribedGroupConfigs.forEach((gCfg) => {
      if (gCfg.sub_tests) {
        gCfg.sub_tests.forEach((st) => {
          coveredNames.add(st.name.toLowerCase());
          const subCfg = configTests.find(
            (ct) => ct.test_name.toLowerCase() === st.name.toLowerCase()
          );
          const refRange = subCfg?.reference_range || st.reference_range || "";
          if (refRange.includes(",")) {
            const refs = refRange.split(",").map((s) => s.trim());
            refs.forEach((ref) => {
              const label = ref.split(":")[0];
              coveredNames.add(label.toLowerCase());
            });
          }
        });
      } else {
        const legacyNames = parseSubTestNames(gCfg.test_name);
        legacyNames.forEach((ln) => {
          coveredNames.add(ln.toLowerCase());
          const sub = configTests.find(
            (ct) => ct.test_name.toLowerCase() === ln.toLowerCase()
          );
          if (sub && sub.reference_range?.includes(",")) {
            const refs = sub.reference_range.split(",").map((s) => s.trim());
            refs.forEach((ref) => {
              const label = ref.split(":")[0];
              coveredNames.add(label.toLowerCase());
            });
          }
        });
      }
    });

    return patient.lab_tests.filter((lt) => {
      const subCfg = configTests.find(
        (ct) =>
          ct.test_name.toLowerCase() === lt.lab_test.toLowerCase() ||
          ct.test_id === lt.lab_test
      );
      const isGroup = subCfg && (subCfg.sub_tests || subCfg.test_id.toLowerCase().startsWith("group"));
      if (isGroup) return true;
      return !coveredNames.has(lt.lab_test.toLowerCase());
    });
  };

  const isPatientLabComplete = (patient) => {
    if (!patient || !patient.lab_tests) return false;
    const draft = patient.lab_results_draft || {};
    const uploadedReports = patient.lab_reports || [];
    const deduplicatedTests = getNonRedundantTests(patient);
    if (deduplicatedTests.length === 0) return false;

    for (const lt of deduplicatedTests) {
      const testName = lt.lab_test;
      const hasFile = uploadedReports.some(r => r.test_name && r.test_name.toLowerCase() === testName.toLowerCase() && r.s3_key);
      if (hasFile) continue;

      const cfg = configTests.find(ct => ct.test_name.toLowerCase() === testName.toLowerCase() || ct.test_id === testName);
      if (!cfg) {
        if (!draft[testName] || !draft[testName].value || !draft[testName].value.trim()) {
          return false;
        }
        continue;
      }

      if (cfg.sub_tests) {
        for (const st of cfg.sub_tests) {
          const subCfg = configTests.find(ct => ct.test_name.toLowerCase() === st.name.toLowerCase());
          const refRange = subCfg?.reference_range || st.reference_range || "";
          if (refRange.includes(",")) {
            const refs = refRange.split(",").map(s => s.trim());
            for (const r of refs) {
              const label = r.split(":")[0];
              const draftKey = `${st.name} - ${label}`;
              const val = (draft[draftKey]?.value || draft[label]?.value || "").trim();
              if (!val) {
                return false;
              }
            }
          } else {
            if (!draft[st.name] || !draft[st.name].value || !draft[st.name].value.trim()) {
              return false;
            }
          }
        }
      } else if (cfg.test_id.toLowerCase().startsWith("group")) {
        const legacyNames = parseSubTestNames(cfg.test_name);
        for (const ln of legacyNames) {
          const sub = configTests.find(ct => ct.test_name.toLowerCase() === ln.toLowerCase());
          const refRange = sub?.reference_range || "";
          if (refRange.includes(",")) {
            const refs = refRange.split(",").map(s => s.trim());
            for (const r of refs) {
              const label = r.split(":")[0];
              const draftKey = `${ln} - ${label}`;
              const val = (draft[draftKey]?.value || draft[label]?.value || "").trim();
              if (!val) {
                return false;
              }
            }
          } else {
            if (!draft[ln] || !draft[ln].value || !draft[ln].value.trim()) {
              return false;
            }
          }
        }
      } else if (cfg.reference_range && cfg.reference_range.includes(",")) {
        const refs = cfg.reference_range.split(",").map(s => s.trim());
        for (const r of refs) {
          const label = r.split(":")[0];
          if (!draft[label] || !draft[label].value || !draft[label].value.trim()) {
            return false;
          }
        }
      } else {
        if (!draft[testName] || !draft[testName].value || !draft[testName].value.trim()) {
          return false;
        }
      }
    }
    return true;
  };

  const handleCompleteLabTestClick = async (patient) => {
    if (!configTests.length) await fetchConfigTests();
    await handlePatientSelect(patient);
    onCompleteOpen();
  };

  const executeCompleteReport = async () => {
    if (!selectedPatient) return;
    setIsCompleting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${BASE_URL}/lab/complete_patient_report`, {
        institute_id: selectedPatient.institute_id,
        visit_id: selectedPatient.visit_id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast({
        title: "Report Completed Successfully",
        description: res.data.message || "All lab test reports have been confirmed.",
        status: "success",
        duration: 3000,
        isClosable: true
      });

      onCompleteClose();
      fetchPatients();
    } catch (err) {
      console.error(err);
      toast({
        title: "Error Completing Report",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleEmailSelectedPatient = async () => {
    if (!selectedPatient) return;
    if (!selectedPatient.email) {
      toast({ title: "No email registered for this patient", status: "warning", duration: 3000 });
      return;
    }

    const manualReports = tests
      .filter(t => {
        const reportFile = selectedPatient.lab_reports?.find(
          r => r.test_name && r.test_name.toLowerCase() === t.lab_test.toLowerCase()
        );
        return !reportFile;
      })
      .map(t => {
        const results = {};
        if (t.type === "individual") {
          results[t.lab_test] = {
            value: t.result || "",
            reference_range: t.reference_range || "N/A",
            units: t.units || "N/A"
          };
        } else if (t.type === "group") {
          t.subTestNames.forEach((name, idx) => {
            const det = t.subTestDetails[idx] || {};
            if (!det.isHeader) {
              results[name] = {
                value: t.subResults[idx] || "",
                reference_range: det.reference_range || "N/A",
                units: det.units || "N/A"
              };
            }
          });
        } else if (t.type === "multi") {
          t.reference_ranges.forEach((ref, idx) => {
            const name = ref.split(":")[0]?.trim() || `Param ${idx + 1}`;
            results[name] = {
              value: t.multiResults[idx] || "",
              reference_range: ref || "N/A",
              units: t.unitsArray[idx] || "N/A"
            };
          });
        }
        return {
          test_name: t.lab_test,
          results: results
        };
      })
      .filter(r => Object.keys(r.results).length > 0);

    if (manualReports.length === 0) {
      toast({ title: "No manually entered reports to email", status: "info", duration: 3000 });
      return;
    }

    const row = {
      patientName: selectedPatient.name || "N/A",
      instituteId: selectedPatient.institute_id || "N/A",
      visitId: selectedPatient.visit_id || "N/A",
      age: selectedPatient.age || 0,
      gender: selectedPatient.gender || "N/A",
      address: selectedPatient.address || "Pilani",
      doctorName: selectedPatient.doctor_name || "N/A",
      email: selectedPatient.email,
      latestTimestamp: selectedPatient.visitingTime || selectedPatient.time || new Date().toISOString(),
    };

    setEmailingId(row.visitId);
    try {
      const doc = generateLabReportPdf(row, manualReports);
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const formattedDate = new Date(row.latestTimestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      const manualReportsListHtml = `
      <div style="margin: 15px 0; background-color: #f7fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #3182ce;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #2b6cb0; font-family: sans-serif;">Included in Attached PDF</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #4a5568; line-height: 1.5; font-family: sans-serif;">
          ${manualReports.map((r) => `<li><strong>${cleanTestName(r.test_name)}</strong></li>`).join("")}
        </ul>
      </div>`;

      const bodyHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #2d3748;">
        <div style="background-color: #3182ce; padding: 15px; border-radius: 6px 6px 0 0; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 18px; font-family: sans-serif;">BITS Pilani Medical Centre</h2>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9; font-family: sans-serif;">Lab Test Report Delivery</p>
        </div>
        <div style="padding: 20px; line-height: 1.6;">
          <p style="font-size: 14px; margin-top: 0; font-family: sans-serif;">Dear <strong>${toTitleCase(row.patientName)}</strong>,</p>
          <p style="font-size: 14px; font-family: sans-serif;">Please find attached your lab test results from your visit on <strong>${formattedDate}</strong>.</p>
          
          ${manualReportsListHtml}
          
          <p style="font-size: 14px; margin-top: 25px; font-family: sans-serif;">Regards,<br><strong>BITS Pilani Medical Centre</strong></p>
          <p style="font-size: 11px; color: #a0aec0; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 15px; font-family: sans-serif; text-align: center;">
            This is an automated email. Please do not reply directly to this message.
          </p>
        </div>
      </div>`;

      const token = localStorage.getItem("token");
      await axios.post(`${BASE_URL}/lab/send_email`, {
        recipient_email: row.email,
        subject: `Lab Reports - ${toTitleCase(row.patientName)} - ${formattedDate}`,
        body: bodyHtml,
        pdf_base64: pdfBase64,
        filename: `${row.patientName.replace(/\s+/g, "_")}_LabReport_${formattedDate}.pdf`,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast({ title: "Email sent successfully!", status: "success", duration: 3000 });
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to send email", status: "error", duration: 3000 });
    } finally {
      setEmailingId(null);
    }
  };

  const handleOpenUploadModal = (patient) => {
    setUploadPatient(patient);
    setUploadFiles({});
    setUploadErrors({});
    onUploadOpen();
  };

  const handleUploadReport = async (testName) => {
    const file = uploadFiles[testName];
    if (!file) {
      setUploadErrors(prev => ({ ...prev, [testName]: "Lab report file is required" }));
      return;
    }
    setUploadErrors(prev => {
      const copy = { ...prev };
      delete copy[testName];
      return copy;
    });

    setUploadingTests(prev => ({ ...prev, [testName]: true }));
    try {
      const token = localStorage.getItem("token");

      // 1. Get presigned URL
      const presignedRes = await fetch(`${BASE_URL}/s3/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          instituteId: uploadPatient.institute_id,
          filename: file.name,
          content_type: file.type
        })
      });
      if (!presignedRes.ok) {
        throw new Error("Failed to get S3 upload url");
      }
      const { upload_url, key } = await presignedRes.json();

      let targetUrl = upload_url;
      if (upload_url.includes("/s3/proxy-upload")) {
        const path = upload_url.substring(upload_url.indexOf("/s3/proxy-upload"));
        targetUrl = `${BASE_URL}${path}`;
      }

      // 2. Put file to S3
      const uploadRes = await fetch(targetUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: file
      });
      if (!uploadRes.ok) throw new Error("S3 upload failed");

      // 3. Save metadata
      const saveRes = await fetch(`${BASE_URL}/s3/save-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          instituteId: uploadPatient.institute_id,
          key,
          filename: file.name,
          testName: testName
        })
      });
      if (!saveRes.ok) throw new Error("Failed to save metadata");

      toast({
        title: `${testName} report uploaded successfully`,
        status: "success",
        duration: 3000,
        isClosable: true
      });

      // Clear file selection for this test
      setUploadFiles(prev => {
        const copy = { ...prev };
        delete copy[testName];
        return copy;
      });

      setUploadPatient(prev => {
        if (!prev) return null;
        const currentReports = prev.lab_reports || [];
        const filtered = currentReports.filter(r => r.test_name?.toLowerCase() !== testName.toLowerCase());
        return {
          ...prev,
          lab_reports: [...filtered, { test_name: testName, file_name: file.name, s3_key: key }]
        };
      });

      // Refetch patients to update status
      fetchPatients();
    } catch (err) {
      console.error(err);
      toast({
        title: "Upload failed",
        description: err.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    } finally {
      setUploadingTests(prev => ({ ...prev, [testName]: false }));
    }
  };

  const handleViewFile = async (s3Key) => {
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`${BASE_URL}/s3/view-url`, { s3_key: s3Key }, { headers });
      if (res.data && res.data.url) {
        let targetUrl = res.data.url;
        if (targetUrl.includes("/s3/proxy-download")) {
          const path = targetUrl.substring(targetUrl.indexOf("/s3/proxy-download"));
          targetUrl = `${BASE_URL}${path}`;
        }
        const fileRes = await axios.get(targetUrl, {
          headers,
          responseType: "blob"
        });
        const fileUrl = URL.createObjectURL(fileRes.data);
        window.open(fileUrl, "_blank");
      }
    } catch (err) {
      toast({
        title: "Error viewing file",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleDeleteFileClick = (visitId, s3Key, testName) => {
    setDeleteTarget({ visitId, s3Key, testName });
    onDeleteConfirmOpen();
  };

  const handleConfirmDeleteFile = async () => {
    if (!deleteTarget) return;
    const { visitId, s3Key, testName } = deleteTarget;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${BASE_URL}/lab/delete_report`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          visit_id: visitId,
          s3_key: s3Key,
          test_name: testName
        }
      });

      toast({
        title: "File deleted successfully",
        status: "success",
        duration: 3000,
        isClosable: true
      });

      if (selectedPatient) {
        setSelectedPatient(prev => ({
          ...prev,
          lab_reports: prev.lab_reports?.filter(r => r.s3_key !== s3Key)
        }));
      }
      if (uploadPatient) {
        setUploadPatient(prev => ({
          ...prev,
          lab_reports: prev.lab_reports?.filter(r => r.s3_key !== s3Key)
        }));
      }

      fetchPatients();
    } catch (err) {
      toast({
        title: "Error deleting file",
        description: err.response?.data?.error || err.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      onDeleteConfirmClose();
      setDeleteTarget(null);
    }
  };

  const isIndividualTestComplete = (test, patient) => {
    if (!test || !patient) return false;
    const hasFile = patient.lab_reports?.some(
      r => r.test_name && r.test_name.toLowerCase() === test.lab_test.toLowerCase() && r.s3_key
    );
    if (hasFile) return true;

    const draft = patient.lab_results_draft || {};
    const testName = test.lab_test;
    const cfg = configTests.find(ct => ct.test_name.toLowerCase() === testName.toLowerCase() || ct.test_id === testName);
    if (!cfg) {
      return !!(draft[testName] && draft[testName].value && draft[testName].value.trim());
    }

    if (cfg.sub_tests) {
      for (const st of cfg.sub_tests) {
        const subCfg = configTests.find(ct => ct.test_name.toLowerCase() === st.name.toLowerCase());
        const refRange = subCfg?.reference_range || st.reference_range || "";
        if (refRange.includes(",")) {
          const refs = refRange.split(",").map(s => s.trim());
          for (const r of refs) {
            const label = r.split(":")[0];
            const draftKey = `${st.name} - ${label}`;
            const val = (draft[draftKey]?.value || draft[label]?.value || "").trim();
            if (!val) return false;
          }
        } else {
          if (!draft[st.name] || !draft[st.name].value || !draft[st.name].value.trim()) return false;
        }
      }
      return true;
    } else if (cfg.test_id.toLowerCase().startsWith("group")) {
      const legacyNames = parseSubTestNames(cfg.test_name);
      for (const ln of legacyNames) {
        const sub = configTests.find(ct => ct.test_name.toLowerCase() === ln.toLowerCase());
        const refRange = sub?.reference_range || "";
        if (refRange.includes(",")) {
          const refs = refRange.split(",").map(s => s.trim());
          for (const r of refs) {
            const label = r.split(":")[0];
            const draftKey = `${ln} - ${label}`;
            const val = (draft[draftKey]?.value || draft[label]?.value || "").trim();
            if (!val) return false;
          }
        } else {
          if (!draft[ln] || !draft[ln].value || !draft[ln].value.trim()) return false;
        }
      }
      return true;
    } else if (cfg.reference_range && cfg.reference_range.includes(",")) {
      const refs = cfg.reference_range.split(",").map(s => s.trim());
      for (const r of refs) {
        const label = r.split(":")[0];
        if (!draft[label] || !draft[label].value || !draft[label].value.trim()) return false;
      }
      return true;
    } else {
      return !!(draft[testName] && draft[testName].value && draft[testName].value.trim());
    }
  };

  const hasDraftValues = (testName, patient) => {
    if (!patient || !patient.lab_results_draft) return false;
    const draft = patient.lab_results_draft;
    const cfg = configTests.find(ct => ct.test_name.toLowerCase() === testName.toLowerCase() || ct.test_id === testName);
    if (!cfg) {
      return !!(draft[testName] && draft[testName].value && draft[testName].value.trim());
    }
    if (cfg.sub_tests) {
      for (const st of cfg.sub_tests) {
        const subCfg = configTests.find(ct => ct.test_name.toLowerCase() === st.name.toLowerCase());
        const refRange = subCfg?.reference_range || st.reference_range || "";
        if (refRange.includes(",")) {
          const refs = refRange.split(",").map(s => s.trim());
          for (const r of refs) {
            const label = r.split(":")[0];
            if (draft[label] && draft[label].value && draft[label].value.trim()) return true;
          }
        } else {
          if (draft[st.name] && draft[st.name].value && draft[st.name].value.trim()) return true;
        }
      }
    } else if (cfg.test_id.toLowerCase().startsWith("group")) {
      const legacyNames = parseSubTestNames(cfg.test_name);
      for (const ln of legacyNames) {
        const sub = configTests.find(ct => ct.test_name.toLowerCase() === ln.toLowerCase());
        const refRange = sub?.reference_range || "";
        if (refRange.includes(",")) {
          const refs = refRange.split(",").map(s => s.trim());
          for (const r of refs) {
            const label = r.split(":")[0];
            if (draft[label] && draft[label].value && draft[label].value.trim()) return true;
          }
        } else {
          if (draft[ln] && draft[ln].value && draft[ln].value.trim()) return true;
        }
      }
    } else if (cfg.reference_range && cfg.reference_range.includes(",")) {
      const refs = cfg.reference_range.split(",").map(s => s.trim());
      for (const r of refs) {
        const label = r.split(":")[0];
        if (draft[label] && draft[label].value && draft[label].value.trim()) return true;
      }
    } else {
      if (draft[testName] && draft[testName].value && draft[testName].value.trim()) return true;
    }
    return false;
  };

  const getTestDraftStatus = (testName, patient) => {
    if (!patient || !patient.lab_results_draft) return "pending";
    const draft = patient.lab_results_draft;

    const cfg = configTests.find(ct => ct.test_name.toLowerCase() === testName.toLowerCase() || ct.test_id === testName);
    if (!cfg) {
      const val = draft[testName]?.value;
      return val && val.trim() ? "completed" : "pending";
    }

    let totalFields = 0;
    let filledFields = 0;

    const checkField = (fieldName, prefix = null) => {
      totalFields++;
      const draftKey = prefix ? `${prefix} - ${fieldName}` : fieldName;
      const val = (draft[draftKey]?.value || draft[fieldName]?.value || "").trim();
      if (val) {
        filledFields++;
      }
    };

    if (cfg.sub_tests) {
      for (const st of cfg.sub_tests) {
        const subCfg = configTests.find(ct => ct.test_name.toLowerCase() === st.name.toLowerCase());
        const refRange = subCfg?.reference_range || st.reference_range || "";
        if (refRange.includes(",")) {
          const refs = refRange.split(",").map(s => s.trim());
          for (const r of refs) {
            checkField(r.split(":")[0], st.name);
          }
        } else {
          checkField(st.name);
        }
      }
    } else if (cfg.test_id.toLowerCase().startsWith("group")) {
      const legacyNames = parseSubTestNames(cfg.test_name);
      for (const ln of legacyNames) {
        const sub = configTests.find(ct => ct.test_name.toLowerCase() === ln.toLowerCase());
        const refRange = sub?.reference_range || "";
        if (refRange.includes(",")) {
          const refs = refRange.split(",").map(s => s.trim());
          for (const r of refs) {
            checkField(r.split(":")[0], ln);
          }
        } else {
          checkField(ln);
        }
      }
    } else if (cfg.reference_range && cfg.reference_range.includes(",")) {
      const refs = cfg.reference_range.split(",").map(s => s.trim());
      for (const r of refs) {
        checkField(r.split(":")[0]);
      }
    } else {
      checkField(testName);
    }

    if (filledFields === 0) return "pending";
    if (filledFields === totalFields) return "completed";
    return "partial";
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
                if (!det.isHeader) {
                  acc[n] = {
                    value: t.subResults[idx] || "",
                    reference_range: det.reference_range || "N/A",
                    units: det.units || "N/A"
                  };
                }
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
        title: "Draft saved successfully",
        description: `${toTitleCase(selectedPatient.name)}'s lab report draft has been saved.`,
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

  const handleSaveDraft = async () => {
    if (!selectedPatient || !tests.length) {
      toast({
        title: "No test data",
        description: "Please select a patient first.",
        status: "warning",
      });
      return;
    }

    try {
      const draftPayload = tests.reduce((acc, t) => {
        if (t.type === "individual") {
          acc[t.lab_test] = {
            value: t.result || "",
            reference_range: t.reference_range || "N/A",
            units: t.units || "N/A"
          };
        } else if (t.type === "group") {
          t.subTestNames.forEach((n, idx) => {
            const det = t.subTestDetails[idx] || {};
            if (!det.isHeader) {
              const draftKey = det.isSubField ? `${det.parentName} - ${n}` : n;
              acc[draftKey] = {
                value: t.subResults[idx] || "",
                reference_range: det.reference_range || "N/A",
                units: det.units || "N/A"
              };
            }
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
      }, {});

      const token = localStorage.getItem("token");
      await axios.post(
        `${BASE_URL}/lab/save_draft`,
        {
          institute_id: selectedPatient.institute_id,
          visit_id: selectedPatient.visit_id,
          results_draft: draftPayload
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Instantly update local state to avoid any stale data race conditions
      setPatients(prev => {
        const updateList = (list) =>
          list.map(p =>
            p.visit_id === selectedPatient.visit_id
              ? { ...p, lab_results_draft: draftPayload }
              : p
          );
        return {
          confirmed: updateList(prev.confirmed || []),
          upcoming: updateList(prev.upcoming || []),
        };
      });

      toast({
        title: "Draft saved successfully",
        description: "Partial results have been saved as a draft.",
        status: "success",
      });

      onClose();
      fetchPatients();
    } catch (e) {
      console.error("Error saving draft:", e);
      toast({
        title: "Error saving draft",
        description: e.message,
        status: "error",
      });
    }
  };

  const handleModalClose = () => {
    if (selectedPatient && tests && tests.length > 0) {
      handleSaveDraft();
    } else {
      onClose();
    }
  };


  // Compute filled/unfilled summary for the save confirmation modal.
  // Tests that already have a file uploaded are treated as complete and excluded.
  const getSaveReportSummary = () => {
    let total = 0;
    let filled = 0;
    const unfilled = [];

    const labReports = selectedPatient?.lab_reports || [];

    const hasUploadedFile = (testName) =>
      labReports.some(
        (r) => r.test_name && r.test_name.toLowerCase() === testName.toLowerCase()
      );

    tests.forEach((t) => {
      // Skip the entire test if a file has already been uploaded for it
      if (hasUploadedFile(t.lab_test)) return;

      if (t.type === "individual") {
        total++;
        if (t.result && t.result.trim() !== "") {
          filled++;
        } else {
          unfilled.push(t.lab_test);
        }
      } else if (t.type === "group") {
        t.subTestNames.forEach((n, idx) => {
          const det = t.subTestDetails[idx] || {};
          if (!det.isHeader) {
            total++;
            if (t.subResults[idx] && t.subResults[idx].trim() !== "") {
              filled++;
            } else {
              unfilled.push(n);
            }
          }
        });
      } else if (t.type === "multi") {
        t.reference_ranges.forEach((r, idx) => {
          const label = r.split(":")[0];
          total++;
          if (t.multiResults[idx] && t.multiResults[idx].trim() !== "") {
            filled++;
          } else {
            unfilled.push(label);
          }
        });
      }
    });

    return { total, filled, unfilled };
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
        maxW="1600px"
        mx="auto"
        w="100%"
      >
        <Box
          bg="white"
          borderRadius="2xl"
          boxShadow="md"
          border="1px solid"
          borderColor="gray.200"
          p={6}
        >
          {/* Filter Toolbar */}
          <Flex
            direction={{ base: "column", lg: "row" }}
            justify="space-between"
            gap={4}
            mb={6}
            align={{ base: "stretch", lg: "center" }}
          >
            <InputGroup maxW={{ base: "100%", lg: "380px" }}>
              <InputLeftElement pointerEvents="none">
                <FiSearch color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search patient, ID, or doctor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                bg="gray.50"
                borderRadius="xl"
                border="1px solid"
                borderColor="gray.200"
                _focus={{ borderColor: "blue.400", bg: "white" }}
              />
            </InputGroup>
            <Flex
              direction={{ base: "column", sm: "row" }}
              align={{ base: "stretch", sm: "center" }}
              gap={3}
              wrap="wrap"
            >
              <HStack spacing={2} align="center" justify="space-between">
                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" whiteSpace="nowrap">Filter Date:</Text>
                <HStack spacing={2} align="center">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    w="140px"
                    bg="gray.50"
                    borderRadius="xl"
                    border="1px solid"
                    borderColor="gray.200"
                    size="sm"
                  />
                  <Text fontSize="xs" color="gray.400">to</Text>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    w="140px"
                    bg="gray.50"
                    borderRadius="xl"
                    border="1px solid"
                    borderColor="gray.200"
                    size="sm"
                  />
                </HStack>
              </HStack>
              <HStack spacing={2} align="center" justify="space-between" alignSelf={{ base: "stretch", sm: "auto" }}>
                <Badge colorScheme="blue" variant="subtle" fontSize="xs" px={3} py={1} borderRadius="full">
                  Pending: {filteredConfirmed.length}
                </Badge>
                <IconButton
                  aria-label="Refresh"
                  icon={<FiRefreshCw className={listLoading ? "spin-animation" : ""} />}
                  onClick={fetchPatients}
                  isLoading={listLoading}
                  variant="outline"
                  borderRadius="full"
                  colorScheme="blue"
                />
              </HStack>
            </Flex>
          </Flex>

          {listLoading ? (
            <Flex align="center" justify="center" py="12">
              <Spinner size="xl" color="blue.500" thickness="4px" />
            </Flex>
          ) : (
            <>
              {/* Confirmed Lab Test Orders Table */}
              <Heading size="sm" color="blue.900" fontWeight="bold" mb="4">
                Confirmed Lab Test Orders ({filteredConfirmed.length})
              </Heading>
              <Box mb="8" borderRadius="xl" border="1px solid" borderColor="gray.200" overflowX="auto" boxShadow="xs" bg="white">
                {filteredConfirmed.length === 0 ? (
                  <Flex h="100px" align="center" justify="center">
                    <Text color="gray.400" fontSize="sm" fontWeight="medium">
                      No confirmed lab orders found.
                    </Text>
                  </Flex>
                ) : (
                  <>
                    <Table variant="simple" size="md" minW="900px">
                      <Thead bg="gray.50">
                        <Tr>
                          <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="15%">Institute ID</Th>
                          <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="20%">Patient Details</Th>
                          <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="15%">Doctor</Th>
                          <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="20%" textAlign="center">Lab Test Order Time</Th>
                          <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="30%" textAlign="center">Actions</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {paginatedConfirmed.map((p, idx) => (
                          <Tr key={idx} _hover={{ bg: "blue.50/20" }} transition="background-color 0.15s">
                            <Td py={3}>
                              <Flex align="center">
                                <Text fontSize="xs" fontWeight="semibold" color="gray.700">
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
                            <Td py={3}>
                              <Text fontWeight="bold" color="blue.900" fontSize="sm">{toTitleCase(p.name)}</Text>
                              <Text fontSize="2xs" color="gray.500" mt={0.5}>
                                {p.age} yrs • {p.gender}
                              </Text>
                            </Td>
                            <Td py={3} fontSize="xs" color="gray.700" fontWeight="medium">
                              {p.doctor_name || "—"}
                            </Td>
                            <Td py={3} textAlign="center">
                              {formatDateTimeSplit(p.consultation_completed_time || p.visitingTime)}
                            </Td>
                            <Td py={3}>
                              <VStack spacing={1.5} align="center" justify="center" w="100%">
                                <Button
                                  colorScheme="blue"
                                  variant="outline"
                                  size="xs"
                                  borderRadius="lg"
                                  onClick={() => openPatientModal(p)}
                                >
                                  View Lab Order
                                </Button>
                                <Button
                                  colorScheme="yellow"
                                  size="xs"
                                  borderRadius="lg"
                                  onClick={() => handleOpenUploadModal(p)}
                                >
                                  Upload Lab Report
                                </Button>
                                {isPatientLabComplete(p) && (
                                  <Button
                                    leftIcon={<FiCheckCircle />}
                                    colorScheme="green"
                                    size="xs"
                                    borderRadius="lg"
                                    onClick={() => handleCompleteLabTestClick(p)}
                                    title="Complete Lab Test Report"
                                    aria-label="Complete Lab Test Report"
                                  >
                                    Complete Report
                                  </Button>
                                )}
                              </VStack>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    <Flex justify="space-between" mt={4} align="center" px={4} pb={4}>
                      <Text fontSize="xs" fontWeight="bold" color="gray.500">
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
                        <Text fontSize="xs" fontWeight="bold" color="gray.700" minW="90px" textAlign="center">Page {confirmedPage} of {Math.ceil(filteredConfirmed.length / ITEMS_PER_PAGE) || 1}</Text>
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
                        <Heading size="sm" color="blue.900" fontWeight="bold" display="flex" alignItems="center" mb={1}>
                          Upcoming Lab Test Orders ({filteredUpcoming.length})
                          <AccordionIcon ml={2} />
                        </Heading>
                      </Box>
                    </AccordionButton>
                  </h2>
                  <AccordionPanel p={0}>
                    <Box mb="4" borderRadius="xl" border="1px solid" borderColor="gray.200" overflowX="auto" boxShadow="xs" bg="white" mt={2}>
                      {filteredUpcoming.length === 0 ? (
                        <Flex h="100px" align="center" justify="center">
                          <Text color="gray.400" fontSize="sm" fontWeight="medium">
                            No upcoming lab orders found.
                          </Text>
                        </Flex>
                      ) : (
                        <>
                          <Table variant="simple" size="md" minW="900px">
                            <Thead bg="gray.50">
                              <Tr>
                                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="15%">Institute ID</Th>
                                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="20%">Patient Details</Th>
                                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="15%">Doctor</Th>
                                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="20%" textAlign="center">Lab Test Order Time</Th>
                                <Th color="gray.600" fontSize="2xs" fontWeight="bold" textTransform="uppercase" py={4} w="30%">Lab Test Name</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {paginatedUpcoming.map((p, idx) => (
                                <Tr key={idx} _hover={{ bg: "blue.50/20" }} transition="background-color 0.15s">
                                  <Td py={3}>
                                    <Flex align="center">
                                      <Text fontSize="xs" fontWeight="semibold" color="gray.700">
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
                                  <Td py={3}>
                                    <Text fontWeight="bold" color="blue.900" fontSize="sm">{toTitleCase(p.name)}</Text>
                                    <Text fontSize="2xs" color="gray.500" mt={0.5}>
                                      {p.age} yrs • {p.gender}
                                    </Text>
                                  </Td>
                                  <Td py={3} fontSize="xs" color="gray.700" fontWeight="medium">
                                    {p.doctor_name || "—"}
                                  </Td>
                                  <Td py={3} textAlign="center">
                                    {formatDateTimeSplit(p.consultation_completed_time || p.visitingTime)}
                                  </Td>
                                  <Td py={3}>
                                    <Flex wrap="wrap" gap={1.5}>
                                      {p.lab_tests?.map((t, tIdx) => (
                                        <Badge key={tIdx} colorScheme="blue" variant="subtle" fontSize="2xs" px={2} py={0.5} borderRadius="md">
                                          {cleanTestName(t.lab_test)}
                                        </Badge>
                                      )) || <Text fontSize="xs" color="gray.500">—</Text>}
                                    </Flex>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                          <Flex justify="space-between" mt={4} align="center" px={4} pb={4}>
                            <Text fontSize="xs" fontWeight="bold" color="gray.500">
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
                              <Text fontSize="xs" fontWeight="bold" color="gray.700" minW="90px" textAlign="center">Page {upcomingPage} of {Math.ceil(filteredUpcoming.length / ITEMS_PER_PAGE) || 1}</Text>
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
      <Modal isOpen={isOpen} onClose={handleModalClose} size="4xl" isCentered>
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
                <Accordion allowMultiple defaultIndex={process.env.NODE_ENV === "test" ? tests.map((_, i) => i) : []}>
                  {tests.map((test, idx) => {
                    const reportFile = selectedPatient?.lab_reports?.find(
                      r => r.test_name && r.test_name.toLowerCase() === test.lab_test.toLowerCase()
                    );
                    const hasFile = !!reportFile;
                    return (
                      <AccordionItem key={idx} border="1px solid" borderColor="gray.200" borderRadius="md" mb={3} overflow="hidden">
                        <h2>
                          <AccordionButton _hover={{ bg: "blue.50" }} py={3} bg="gray.50">
                            <Box flex="1" textAlign="left" fontWeight="bold" color="blue.800" fontSize="sm" display="flex" alignItems="center">
                              {test.lab_test}
                              {isIndividualTestComplete(test, selectedPatient) && (
                                <Badge colorScheme="green" ml={2} fontSize="10px">Complete</Badge>
                              )}
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                        </h2>
                        <AccordionPanel pb={4} pt={2}>
                          {hasFile && (
                            <Box mb={3} p={2} bg="orange.50" borderRadius="md" border="1px solid" borderColor="orange.200">
                              <Text fontSize="xs" color="orange.800" fontWeight="medium" display="flex" alignItems="center" gap={2}>
                                📄 File report uploaded: <strong>{reportFile.file_name}</strong>. Manual entry disabled.
                                <Button size="xs" colorScheme="blue" variant="link" onClick={() => handleViewFile(reportFile.s3_key)}>
                                  View File
                                </Button>
                              </Text>
                            </Box>
                          )}
                          <Table variant="simple" size="sm" style={{ tableLayout: "fixed" }}>
                            <Thead bg="gray.100">
                              <Tr>
                                <Th w="30%">Test Name</Th>
                                <Th w="25%">Result</Th>
                                <Th w="30%">Reference Range</Th>
                                <Th w="15%">Units</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {test.type === "individual" && (
                                <Tr>
                                  <Td fontWeight="semibold" color="blue.700" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                                    {test.lab_test}
                                  </Td>
                                  <Td>
                                    <Input
                                      size="sm"
                                      value={test.result}
                                      isDisabled={hasFile}
                                      onChange={(e) =>
                                        handleIndividualResultChange(
                                          idx,
                                          e.target.value
                                        )
                                      }
                                    />
                                  </Td>
                                  <Td style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{test.reference_range}</Td>
                                  <Td>{test.units}</Td>
                                </Tr>
                              )}
                              {test.type === "group" &&
                                test.subTestNames.map((n, i) => {
                                  const det = test.subTestDetails[i] || {};
                                  if (det.isHeader) {
                                    return (
                                      <Tr key={i} bg="gray.50">
                                        <Td colSpan={4} fontWeight="bold" color="blue.800" pl={4}>
                                          {n}
                                        </Td>
                                      </Tr>
                                    );
                                  }
                                  return (
                                    <Tr key={i}>
                                      <Td pl={det.isSubField ? 8 : 4} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                                        {n}
                                      </Td>
                                      <Td>
                                        <Input
                                          size="sm"
                                          value={test.subResults[i]}
                                          isDisabled={hasFile}
                                          onChange={(e) =>
                                            handleSubResultChange(
                                              idx,
                                              i,
                                              e.target.value
                                            )
                                          }
                                        />
                                      </Td>
                                      <Td style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                                        {det.reference_range || "N/A"}
                                      </Td>
                                      <Td>{det.units || "N/A"}</Td>
                                    </Tr>
                                  );
                                })}
                              {test.type === "multi" &&
                                test.reference_ranges.map((r, i) => (
                                  <Tr key={i}>
                                    <Td pl={4} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{r.split(":")[0]}</Td>
                                    <Td>
                                      <Input
                                        size="sm"
                                        value={test.multiResults[i]}
                                        isDisabled={hasFile}
                                        onChange={(e) =>
                                          handleMultiResultChange(
                                            idx,
                                            i,
                                            e.target.value
                                          )
                                        }
                                      />
                                    </Td>
                                    <Td style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{r}</Td>
                                    <Td>{test.unitsArray[i] || "N/A"}</Td>
                                  </Tr>
                                ))}
                            </Tbody>
                          </Table>
                        </AccordionPanel>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </Box>
            )}
          </ModalBody>
          <ModalFooter bg="gray.50">
            <HStack spacing={3}>
              <Button colorScheme="yellow" onClick={onSaveConfirmOpen}>
                Save Report Details
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* UPLOAD LAB REPORT MODAL */}
      <Modal isOpen={isUploadOpen} onClose={onUploadClose} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader bg="green.600" color="white">
            Upload Lab Report
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody p={6}>
            {uploadPatient && (
              <Stack spacing={6}>
                <Box bg="gray.50" p={4} borderRadius="md" border="1px solid" borderColor="gray.200">
                  <Text fontSize="sm" fontWeight="semibold">Patient: {toTitleCase(uploadPatient.name)}</Text>
                  <Text fontSize="xs" color="gray.600">ID: {uploadPatient.institute_id} | {uploadPatient.age} yrs | {uploadPatient.gender}</Text>
                  <Text fontSize="xs" fontWeight="bold" color="blue.600" mt={1}>Doctor: {uploadPatient.doctor_name || "N/A"}</Text>
                </Box>

                <Stack spacing={4}>
                  <Text fontWeight="semibold" fontSize="sm" color="gray.700">Prescribed Lab Tests:</Text>
                  {getNonRedundantTests(uploadPatient).map((lt, index) => {
                    const reportFile = uploadPatient.lab_reports?.find(
                      r => r.test_name && r.test_name.toLowerCase() === lt.lab_test.toLowerCase()
                    );
                    const hasFile = !!reportFile;
                    const isCompleted = lt.status === "completed" || hasFile;
                    const hasDraft = hasDraftValues(lt.lab_test, uploadPatient);
                    const draftStatus = getTestDraftStatus(lt.lab_test, uploadPatient);
                    const isUploadingThis = !!uploadingTests[lt.lab_test];

                    let badgeText = "Pending";
                    let badgeBg = "orange.50";
                    let badgeColor = "orange.700";
                    let badgeBorder = "orange.300";
                    let badgeDot = "#ED8936";
                    let badgeIcon = "⏳";
                    let cardBorderLeft = "4px solid #ED8936";

                    if (isCompleted) {
                      badgeText = "Completed";
                      badgeBg = "green.50";
                      badgeColor = "green.700";
                      badgeBorder = "green.300";
                      badgeDot = "#38A169";
                      badgeIcon = "✅";
                      cardBorderLeft = "4px solid #38A169";
                    } else if (draftStatus === "completed") {
                      badgeText = "Manually Filled";
                      badgeBg = "blue.50";
                      badgeColor = "blue.700";
                      badgeBorder = "blue.300";
                      badgeDot = "#3182CE";
                      badgeIcon = "✍️";
                      cardBorderLeft = "4px solid #3182CE";
                    } else if (draftStatus === "partial") {
                      badgeText = "Partially Filled";
                      badgeBg = "yellow.50";
                      badgeColor = "yellow.800";
                      badgeBorder = "yellow.400";
                      badgeDot = "#D69E2E";
                      badgeIcon = "⚠️";
                      cardBorderLeft = "4px solid #D69E2E";
                    }

                    return (
                      <Box
                        key={index}
                        p={4}
                        borderWidth="1px"
                        borderRadius="md"
                        borderColor="gray.200"
                        borderLeft={cardBorderLeft}
                        bg="white"
                        boxShadow="sm"
                        _hover={{ boxShadow: "md" }}
                        transition="box-shadow 0.15s"
                      >
                        <Flex justify="space-between" align="center" mb={2}>
                          <Text fontWeight="bold" fontSize="sm" color="blue.800">
                            {lt.lab_test}
                          </Text>
                          <Flex
                            align="center"
                            gap={1.5}
                            px={3}
                            py={1}
                            borderRadius="full"
                            border="1px solid"
                            borderColor={badgeBorder}
                            bg={badgeBg}
                            boxShadow="xs"
                          >
                            <Box
                              w={2}
                              h={2}
                              borderRadius="full"
                              bg={badgeDot}
                              flexShrink={0}
                            />
                            <Text
                              fontSize="xs"
                              fontWeight="semibold"
                              color={badgeColor}
                              whiteSpace="nowrap"
                            >
                              {badgeText}
                            </Text>
                          </Flex>
                        </Flex>

                        {hasFile && (
                          <Box mt={2} p={2} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                            <Flex justify="space-between" align="center">
                              <Text fontSize="xs" color="gray.600" isTruncated maxW="60%">
                                Uploaded: <strong>{reportFile.file_name}</strong>
                              </Text>
                              <HStack spacing={2}>
                                <Button size="xs" colorScheme="blue" onClick={() => handleViewFile(reportFile.s3_key)}>
                                  View File
                                </Button>
                                <Button size="xs" colorScheme="red" variant="outline" onClick={() => handleDeleteFileClick(uploadPatient.visit_id, reportFile.s3_key, lt.lab_test)}>
                                  Delete File
                                </Button>
                              </HStack>
                            </Flex>
                          </Box>
                        )}

                        {!isCompleted && hasDraft && (
                          <Box mt={1} p={2} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.200">
                            <Text fontSize="xs" color="yellow.800" fontWeight="medium">
                              {draftStatus === "completed"
                                ? "✍️ All values were entered manually. Clear values inside 'View Lab Order' first to upload a file."
                                : "✍️ Draft values entered. Clear values inside 'View Lab Order' first to upload a file."}
                            </Text>
                          </Box>
                        )}

                        {!isCompleted && !hasDraft && (
                          <FormControl isInvalid={!!uploadErrors[lt.lab_test]}>
                            <Flex gap={3} align="center" mt={1}>
                              {/* Modern File Input Wrapper */}
                              <Box flex="1">
                                <Input
                                  id={`file-upload-${index}`}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  display="none"
                                  onChange={(e) => {
                                    const file = e.target.files[0];
                                    setUploadFiles(prev => ({ ...prev, [lt.lab_test]: file }));
                                  }}
                                />
                                <Button
                                  as="label"
                                  htmlFor={`file-upload-${index}`}
                                  size="sm"
                                  variant="outline"
                                  colorScheme="blue"
                                  width="100%"
                                  cursor="pointer"
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="center"
                                  gap={2}
                                  bg="gray.50"
                                  _hover={{ bg: "blue.50", borderColor: "blue.300" }}
                                  fontWeight="medium"
                                  textOverflow="ellipsis"
                                  whiteSpace="nowrap"
                                  overflow="hidden"
                                  px={3}
                                >
                                  <svg
                                    stroke="currentColor"
                                    fill="none"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    height="16"
                                    width="16"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                  </svg>
                                  {uploadFiles[lt.lab_test]
                                    ? uploadFiles[lt.lab_test].name
                                    : "Choose Report File"}
                                </Button>
                              </Box>

                              <Button
                                colorScheme="green"
                                size="sm"
                                onClick={() => handleUploadReport(lt.lab_test)}
                                isLoading={isUploadingThis}
                                loadingText="Uploading..."
                                leftIcon={
                                  <svg
                                    stroke="currentColor"
                                    fill="none"
                                    strokeWidth="2"
                                    viewBox="0 0 24 24"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    height="16"
                                    width="16"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                  </svg>
                                }
                              >
                                Upload
                              </Button>
                            </Flex>
                            {uploadErrors[lt.lab_test] && (
                              <FormErrorMessage>{uploadErrors[lt.lab_test]}</FormErrorMessage>
                            )}
                          </FormControl>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            )}
          </ModalBody>
          <ModalFooter bg="gray.50">
            <Button colorScheme="blue" onClick={onUploadClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* COMPLETE LAB REPORT CONFIRMATION MODAL */}
      <Modal isOpen={isCompleteOpen} onClose={onCompleteClose} size="6xl" isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(6px)" />
        <ModalContent borderRadius="2xl" overflow="hidden" boxShadow="2xl">
          <ModalHeader bg="green.600" color="white" py={5} px={6}>
            Confirm Lab Test Report Completion
          </ModalHeader>
          <ModalCloseButton color="white" top="20px" right="20px" />
          <ModalBody bg="gray.50" p={6}>
            {selectedPatient && (
              <Grid templateColumns={{ base: "1fr", lg: "1.1fr 1.3fr" }} gap={6} alignItems="start">
                {/* Left Column: Patient Summary and Tests Breakdown */}
                <GridItem colSpan={1}>
                  <Stack spacing={5}>
                    <Box bg="white" p={4} borderRadius="xl" border="1px solid" borderColor="gray.200" boxShadow="xs">
                      <Heading size="xs" color="green.800" mb={3} textTransform="uppercase" letterSpacing="wider" fontWeight="bold">Patient Info</Heading>
                      <Text fontSize="sm" fontWeight="bold">{toTitleCase(selectedPatient.name)}</Text>
                      <Text fontSize="xs" color="gray.500" mt={1}>ID: {selectedPatient.institute_id} &middot; {selectedPatient.age} yrs &middot; {selectedPatient.gender} &middot; {selectedPatient.doctor_name || "N/A"}</Text>
                    </Box>

                    <Box bg="white" p={4} borderRadius="xl" border="1px solid" borderColor="gray.200" boxShadow="xs">
                      <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={3.5} textTransform="uppercase" letterSpacing="wider">
                        Summary of Uploaded Files / Entered Values
                      </Text>

                      <Stack spacing={3} overflowY="auto" pr={1}>
                        {tests.map((test, index) => {
                          const reportFile = selectedPatient.lab_reports?.find(
                            r => r.test_name && r.test_name.toLowerCase() === test.lab_test.toLowerCase()
                          );

                          return (
                            <Box
                              key={index}
                              bg="white"
                              p={3}
                              borderRadius="xl"
                              border="1px solid"
                              borderColor="gray.200"
                              borderLeft={reportFile ? "4px solid #38A169" : "4px solid #3182CE"}
                              boxShadow="xs"
                            >
                              <Flex justify="space-between" align="center" mb={reportFile ? 1.5 : 2}>
                                <Text fontWeight="bold" fontSize="xs" color="gray.850" noOfLines={2} maxW="70%">
                                  {test.lab_test}
                                </Text>
                                <Flex
                                  align="center"
                                  gap={1.5}
                                  px={2.5}
                                  py={0.5}
                                  borderRadius="full"
                                  border="1px solid"
                                  borderColor={reportFile ? "green.200" : "blue.200"}
                                  bg={reportFile ? "green.50" : "blue.50"}
                                >
                                  <Box
                                    w={1.5}
                                    h={1.5}
                                    borderRadius="full"
                                    bg={reportFile ? "#38A169" : "#3182CE"}
                                    flexShrink={0}
                                  />
                                  <Text fontSize="2xs" fontWeight="bold" color={reportFile ? "green.700" : "blue.700"} whiteSpace="nowrap">
                                    {reportFile ? "File Uploaded" : "Results Entered"}
                                  </Text>
                                </Flex>
                              </Flex>

                              {reportFile ? (
                                <Flex align="center" justify="space-between" bg="gray.50" px={2} py={1} borderRadius="sm">
                                  <Text fontSize="2xs" color="gray.600" isTruncated maxW="70%">
                                    📎 <strong>{reportFile.file_name}</strong>
                                  </Text>
                                  <Button
                                    size="xs"
                                    colorScheme="blue"
                                    variant="ghost"
                                    fontSize="2xs"
                                    px={2}
                                    h={5}
                                    onClick={() => handleViewFile(reportFile.s3_key)}
                                  >
                                    View File ↗
                                  </Button>
                                </Flex>
                              ) : (
                                <Table variant="simple" size="xs" mt={1}>
                                  <Thead>
                                    <Tr>
                                      <Th fontSize="2xs" color="gray.500" py={1} px={1}>Field</Th>
                                      <Th fontSize="2xs" color="gray.500" py={1} px={1}>Value</Th>
                                      <Th fontSize="2xs" color="gray.500" py={1} px={1}>Reference</Th>
                                      <Th fontSize="2xs" color="gray.500" py={1} px={1}>Units</Th>
                                    </Tr>
                                  </Thead>
                                  <Tbody>
                                    {test.type === "individual" && (
                                      <Tr>
                                        <Td fontSize="2xs" py={0.5} px={1} fontWeight="medium">{test.lab_test}</Td>
                                        <Td fontSize="2xs" py={0.5} px={1} fontWeight="bold" color="blue.700">{test.result || "—"}</Td>
                                        <Td fontSize="2xs" py={0.5} px={1} color="gray.600">{test.reference_range}</Td>
                                        <Td fontSize="2xs" py={0.5} px={1} color="gray.500">{test.units}</Td>
                                      </Tr>
                                    )}
                                    {test.type === "group" &&
                                      test.subTestNames.map((n, i) => {
                                        const det = test.subTestDetails[i] || {};
                                        if (det.isHeader) return null;
                                        return (
                                          <Tr key={i}>
                                            <Td fontSize="2xs" py={0.5} px={1} pl={det.isSubField ? 4 : 1} color="gray.700">{n}</Td>
                                            <Td fontSize="2xs" py={0.5} px={1} fontWeight="bold" color="blue.700">{test.subResults[i] || "—"}</Td>
                                            <Td fontSize="2xs" py={0.5} px={1} color="gray.600">{det.reference_range || "N/A"}</Td>
                                            <Td fontSize="2xs" py={0.5} px={1} color="gray.500">{det.units || "N/A"}</Td>
                                          </Tr>
                                        );
                                      })}
                                    {test.type === "multi" &&
                                      test.reference_ranges.map((r, i) => (
                                        <Tr key={i}>
                                          <Td fontSize="2xs" py={0.5} px={1} color="gray.700">{r.split(":")[0]}</Td>
                                          <Td fontSize="2xs" py={0.5} px={1} fontWeight="bold" color="blue.700">{test.multiResults[i] || "—"}</Td>
                                          <Td fontSize="2xs" py={0.5} px={1} color="gray.600">{r}</Td>
                                          <Td fontSize="2xs" py={0.5} px={1} color="gray.500">{test.unitsArray[i] || "N/A"}</Td>
                                        </Tr>
                                      ))}
                                  </Tbody>
                                </Table>
                              )}
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  </Stack>
                </GridItem>

                {/* Right Column: Live Official Report Preview */}
                <GridItem colSpan={1}>
                  <VStack spacing={4} align="stretch">
                    {process.env.NODE_ENV !== 'test' ? (
                      (() => {
                        const manualReports = tests
                          .filter(t => {
                            const reportFile = selectedPatient.lab_reports?.find(
                              r => r.test_name && r.test_name.toLowerCase() === t.lab_test.toLowerCase()
                            );
                            return !reportFile;
                          })
                          .map(t => {
                            const results = {};
                            if (t.type === "individual") {
                              results[t.lab_test] = {
                                value: t.result || "",
                                reference_range: t.reference_range || "N/A",
                                units: t.units || "N/A"
                              };
                            } else if (t.type === "group") {
                              t.subTestNames.forEach((name, idx) => {
                                const det = t.subTestDetails[idx] || {};
                                if (!det.isHeader) {
                                  results[name] = {
                                    value: t.subResults[idx] || "",
                                    reference_range: det.reference_range || "N/A",
                                    units: det.units || "N/A"
                                  };
                                }
                              });
                            } else if (t.type === "multi") {
                              t.reference_ranges.forEach((ref, idx) => {
                                const name = ref.split(":")[0]?.trim() || `Param ${idx + 1}`;
                                results[name] = {
                                  value: t.multiResults[idx] || "",
                                  reference_range: ref || "N/A",
                                  units: t.unitsArray[idx] || "N/A"
                                };
                              });
                            }
                            return {
                              test_name: t.lab_test,
                              results: results
                            };
                          })
                          .filter(r => Object.keys(r.results).length > 0);

                        return manualReports.length > 0 ? (
                          <Box bg="white" p={2} borderRadius="2xl" border="1px solid" borderColor="gray.300" boxShadow="lg" overflow="auto">
                            <LabReportSlip
                              patientInfo={{
                                visitId: selectedPatient.visit_id || selectedPatient.visitId || "N/A",
                                instituteId: selectedPatient.institute_id || selectedPatient.instituteId || "N/A",
                                patientName: selectedPatient.name || selectedPatient.patientName || "N/A",
                                age: selectedPatient.age || 0,
                                gender: selectedPatient.gender || "N/A",
                                address: selectedPatient.address || "Pilani",
                                doctorName: selectedPatient.doctor_name || selectedPatient.doctorName || "N/A",
                                regDate: selectedPatient.visitingTime || selectedPatient.time || new Date().toISOString(),
                              }}
                              manualReports={manualReports}
                            />
                          </Box>
                        ) : (
                          <Box bg="orange.50" p={4} borderRadius="xl" border="1px solid" borderColor="orange.200">
                            <Text fontSize="xs" color="orange.800" fontWeight="medium">
                              This test only contains uploaded files. Scans cannot be previewed in the layout slip.
                            </Text>
                          </Box>
                        );
                      })()
                    ) : null}
                  </VStack>
                </GridItem>
              </Grid>
            )}
          </ModalBody>
          <ModalFooter bg="gray.50" gap={3} py={4} px={6} borderTop="1px solid" borderColor="gray.200">
            <Button onClick={onCompleteClose} size="sm" variant="outline" borderRadius="xl">Cancel</Button>
            <Button
              colorScheme="blue"
              size="sm"
              borderRadius="xl"
              leftIcon={<FiMail />}
              isLoading={emailingId !== null}
              onClick={handleEmailSelectedPatient}
              title="Email manually-entered results as PDF"
            >
              Email Results PDF
            </Button>
            <Button
              colorScheme="green"
              size="sm"
              borderRadius="xl"
              onClick={executeCompleteReport}
              isLoading={isCompleting}
              loadingText="Completing..."
            >
              Confirm & Complete Report
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

      {/* DELETE CONFIRMATION MODAL */}
      <Modal isOpen={isDeleteConfirmOpen} onClose={onDeleteConfirmClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader bg="red.600" color="white">
            Confirm File Deletion
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody py={6}>
            <Text>Are you sure you want to delete the uploaded report for <strong>{deleteTarget?.testName}</strong>?</Text>
            <Text fontSize="xs" color="gray.500" mt={2}>This action cannot be undone and will remove the file from storage.</Text>
          </ModalBody>
          <ModalFooter bg="gray.50">
            <HStack spacing={3}>
              <Button onClick={onDeleteConfirmClose}>Cancel</Button>
              <Button colorScheme="red" onClick={handleConfirmDeleteFile}>
                Confirm Delete
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* SAVE REPORT DETAILS CONFIRMATION MODAL */}
      <Modal isOpen={isSaveConfirmOpen} onClose={onSaveConfirmClose} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader bg="yellow.500" color="white">
            Confirm Save Report Details
          </ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody py={6}>
            {(() => {
              const { total, filled, unfilled } = getSaveReportSummary();
              const allFilled = filled === total && total > 0;
              return (
                <>
                  <Text fontWeight="semibold" mb={3}>
                    Have you entered all the required fields before saving?
                  </Text>
                  <Box
                    bg={allFilled ? "green.50" : "orange.50"}
                    border="1px solid"
                    borderColor={allFilled ? "green.200" : "orange.200"}
                    borderRadius="md"
                    p={4}
                    mb={3}
                  >
                    <Text
                      fontWeight="bold"
                      color={allFilled ? "green.700" : "orange.700"}
                      fontSize="sm"
                    >
                      {allFilled
                        ? `✅ All ${total} field${total !== 1 ? "s" : ""} filled`
                        : `⚠️ ${filled} of ${total} field${total !== 1 ? "s" : ""} filled`}
                    </Text>
                    {!allFilled && unfilled.length > 0 && (
                      <Box mt={2}>
                        <Text fontSize="xs" color="orange.600" mb={1}>
                          The following fields are still empty:
                        </Text>
                        <Box
                          as="ul"
                          pl={4}
                          maxH="120px"
                          overflowY="auto"
                          fontSize="xs"
                          color="gray.700"
                        >
                          {unfilled.map((name, idx) => (
                            <Box as="li" key={idx}>{name}</Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                  <Text fontSize="sm" color="gray.600">
                    You can still save with partial data. Empty fields will not overwrite existing values.
                  </Text>
                </>
              );
            })()}
          </ModalBody>
          <ModalFooter bg="gray.50">
            <HStack spacing={3}>
              <Button onClick={onSaveConfirmClose}>Cancel</Button>
              <Button
                colorScheme="yellow"
                onClick={() => {
                  onSaveConfirmClose();
                  handleSaveDraft();
                }}
              >
                Confirm & Save
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}
