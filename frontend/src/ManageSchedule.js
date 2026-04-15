import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Select,
  useToast,
  Text,
  Divider,
  IconButton,
  Flex,
  Stack,
  Heading,
  FormControl,
  FormLabel,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton
} from "@chakra-ui/react";
import { FiPlus, FiTrash2, FiSave } from "react-icons/fi";
import axios from "axios";
import BASE_URL from './Config';

const DEFAULT_SCHEDULE = { 
  duty_days: [], 
  start_hr: "09", start_min: "00", start_ampm: "AM", 
  end_hr: "05", end_min: "00", end_ampm: "PM" 
};

export default function ManageSchedule() {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [scheduleState, setScheduleState] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // For the Modal
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/public/doctors`);
        setDoctors(response.data);
      } catch (err) {
        console.error("Error fetching doctors", err);
      }
    };
    fetchDoctors();
  }, []);

  const handleDoctorChange = (e) => {
    const username = e.target.value;
    setSelectedDoctor(username);
    if (!username) {
      setScheduleState([]);
      return;
    }
    
    // Reverse map the existing string back to selector components
    const doc = doctors.find(d => d.username === username);
    if (doc && doc.schedule && doc.schedule.length > 0) {
      const parsedSchedule = doc.schedule.map(shift => {
        const parseTimeString = (timeStr) => {
           if (!timeStr) return { hr: "12", min: "00", ampm: "AM" };
           // Handle both "HH:MM AM/PM" and raw "HH:MM" 24h formats
           const parts = timeStr.split(" ");
           if (parts.length === 2) {
             const [hr, min] = parts[0].split(":");
             return { hr: String(parseInt(hr, 10) || 12).padStart(2, '0'), min: (min || "00").padStart(2, '0'), ampm: parts[1] };
           } else {
             // Assume 24h, convert
             const [hr, min] = timeStr.split(":");
             let h = parseInt(hr, 10);
             const ampm = h >= 12 ? "PM" : "AM";
             h = h % 12 || 12;
             return { hr: String(h).padStart(2, '0'), min: (min || "00").padStart(2, '0'), ampm };
           }
        };
        const st = parseTimeString(shift.start_time);
        const et = parseTimeString(shift.end_time);

        return {
          duty_days: shift.duty_days || [],
          start_hr: st.hr, start_min: st.min, start_ampm: st.ampm,
          end_hr: et.hr, end_min: et.min, end_ampm: et.ampm
        };
      });
      setScheduleState(parsedSchedule);
    } else {
      // No schedule yet (legacy doctor) — start with one blank shift
      setScheduleState([{ ...DEFAULT_SCHEDULE }]);
    }
  };

  const handleValidationAndSave = () => {
    if (scheduleState.length === 0) {
       onOpen(); // Trigger modal for 0-shifts
       return;
    }

    const isValidSchedule = scheduleState.every(s => s.duty_days.length > 0 && s.start_hr && s.end_hr);
    if (!isValidSchedule) {
      return toast({
        title: "Incomplete Schedule",
        description: "Please assure every shift has defined days and timings.",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
    }

    const convertToMins = (hr, min, ampm) => {
      let h = parseInt(hr, 10);
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + parseInt(min, 10);
    };

    const hasTimeError = scheduleState.some(s => {
      const startMins = convertToMins(s.start_hr, s.start_min, s.start_ampm);
      const endMins = convertToMins(s.end_hr, s.end_min, s.end_ampm);
      return startMins >= endMins;
    });

    if (hasTimeError) {
      return toast({
        title: "Invalid Shift Timing",
        description: "End time must be strictly after Start time for every shift.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }

    // Check for overlapping shifts — only flag if two shifts share a common day AND their times overlap
    const hasOverlap = scheduleState.some((a, i) =>
      scheduleState.some((b, j) => {
        if (i >= j) return false;
        // First: do they share any common duty day?
        const sharedDay = a.duty_days.some(day => b.duty_days.includes(day));
        if (!sharedDay) return false; // different days — no conflict
        // Second: do their time windows overlap?
        const aStart = convertToMins(a.start_hr, a.start_min, a.start_ampm);
        const aEnd   = convertToMins(a.end_hr, a.end_min, a.end_ampm);
        const bStart = convertToMins(b.start_hr, b.start_min, b.start_ampm);
        const bEnd   = convertToMins(b.end_hr, b.end_min, b.end_ampm);
        return aStart < bEnd && bStart < aEnd;
      })
    );

    if (hasOverlap) {
      return toast({
        title: "Overlapping Shifts Detected",
        description: "Two or more shifts have overlapping time ranges. Please review and correct the shift timings before saving.",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
    }

    // Pass verification
    executeSavePush(scheduleState);
  };

  const executeSavePush = async (verifiedSchedule) => {
    setLoading(true);
    let finalSchedule = [];
    
    if (verifiedSchedule.length > 0) {
      finalSchedule = verifiedSchedule.map(s => ({
         duty_days: s.duty_days,
         start_time: `${s.start_hr}:${s.start_min} ${s.start_ampm}`,
         end_time: `${s.end_hr}:${s.end_min} ${s.end_ampm}`
      }));
    }

    try {
      const token = localStorage.getItem("token");
      await axios.put(`${BASE_URL}/api/update_doctor/${selectedDoctor}`, { 
        schedule: finalSchedule
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({
        title: "Schedule Saved!",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      onClose();
      
      // Update local storage representation so switching back doesn't flash old data
      setDoctors(prev => prev.map(d => 
        d.username === selectedDoctor ? { ...d, schedule: finalSchedule } : d
      ));

    } catch (error) {
      toast({
        title: "Error updating schedule",
        description: error.response?.data?.error || error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box bg="white" p="8" borderRadius="lg" boxShadow="md" maxW="700px" w="full" mx="auto">
      <Heading size="lg" mb="6" color="brand.700">
        Manage Doctor Schedules
      </Heading>

      <FormControl mb="6">
        <FormLabel>Select Doctor</FormLabel>
        <Select 
          size="lg" 
          placeholder="-- Select a Doctor --"
          value={selectedDoctor}
          onChange={handleDoctorChange}
        >
          {doctors.map(doc => (
            <option key={doc.username} value={doc.username}>
              {doc.display_name}{doc.department ? ` (${doc.department})` : ''}
            </option>
          ))}
        </Select>
      </FormControl>

      {selectedDoctor && (
        <Stack spacing="5" bg="gray.50" p="4" borderRadius="md" border="1px solid" borderColor="gray.200">
          <Flex justify="space-between" align="center">
            <Text fontWeight="bold" color="blue.700">Active Shifts</Text>
            <Button size="sm" colorScheme="blue" leftIcon={<FiPlus />} onClick={() => setScheduleState(prev => [...prev, { ...DEFAULT_SCHEDULE }])}>
              Add Shift
            </Button>
          </Flex>
          <Divider borderColor="gray.300" />

          {scheduleState.length === 0 ? (
            <Text fontSize="sm" color="gray.500" textAlign="center" py="4">No shifts scheduled.</Text>
          ) : (
            scheduleState.map((shift, idx) => (
              <Box key={idx} p="3" border="1px dashed" borderColor="gray.300" borderRadius="md">
                <Flex justify="space-between" align="center" mb="3">
                  <Text fontSize="sm" fontWeight="semibold" color="gray.600">Shift {idx + 1}</Text>
                  <IconButton size="xs" colorScheme="red" icon={<FiTrash2 />} onClick={() => {
                      const updated = [...scheduleState];
                      updated.splice(idx, 1);
                      setScheduleState(updated);
                  }} />
                </Flex>

                <Box mb="3">
                  <Text fontSize="sm" fontWeight="medium" mb="2">Duty Days</Text>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                      <label key={day} style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
                        <input
                          type="checkbox"
                          style={{ marginRight: "6px", cursor: "pointer", width: "16px", height: "16px" }}
                          checked={shift.duty_days.includes(day)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setScheduleState((prev) => {
                              const updated = [...prev];
                              const currentDays = updated[idx].duty_days || [];
                              updated[idx] = {
                                ...updated[idx],
                                duty_days: isChecked
                                  ? [...currentDays, day]
                                  : currentDays.filter((d) => d !== day),
                              };
                              return updated;
                            });
                          }}
                        />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </Box>

                <Flex wrap="wrap" gap="5" align="flex-start">
                  <FormControl w="auto">
                    <FormLabel fontSize="sm">Start Time</FormLabel>
                    <Flex gap="2">
                      <Select size="sm" w="70px" value={shift.start_hr} onChange={(e) => {
                        setScheduleState(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], start_hr: e.target.value };
                          return updated;
                        });
                      }}>
                        {[...Array(12).keys()].map(i => {
                          const val = String(i + 1).padStart(2, '0');
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </Select>
                      <Select size="sm" w="70px" value={shift.start_min} onChange={(e) => {
                        setScheduleState(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], start_min: e.target.value };
                          return updated;
                        });
                      }}>
                        {["00", "15", "30", "45"].map(min => <option key={min} value={min}>{min}</option>)}
                      </Select>
                      <Select size="sm" w="70px" value={shift.start_ampm} onChange={(e) => {
                        setScheduleState(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], start_ampm: e.target.value };
                          return updated;
                        });
                      }}>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </Select>
                    </Flex>
                  </FormControl>

                  <FormControl w="auto">
                    <FormLabel fontSize="sm">End Time</FormLabel>
                    <Flex gap="2">
                      <Select size="sm" w="70px" value={shift.end_hr} onChange={(e) => {
                        setScheduleState(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], end_hr: e.target.value };
                          return updated;
                        });
                      }}>
                        {[...Array(12).keys()].map(i => {
                          const val = String(i + 1).padStart(2, '0');
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </Select>
                      <Select size="sm" w="70px" value={shift.end_min} onChange={(e) => {
                        setScheduleState(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], end_min: e.target.value };
                          return updated;
                        });
                      }}>
                        {["00", "15", "30", "45"].map(min => <option key={min} value={min}>{min}</option>)}
                      </Select>
                      <Select size="sm" w="70px" value={shift.end_ampm} onChange={(e) => {
                        setScheduleState(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], end_ampm: e.target.value };
                          return updated;
                        });
                      }}>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </Select>
                    </Flex>
                  </FormControl>
                </Flex>
              </Box>
            ))
          )}

          <Button 
             mt="2" 
             size="lg" 
             colorScheme="green" 
             leftIcon={<FiSave />} 
             onClick={handleValidationAndSave}
             isLoading={loading}
          >
            Save Changes
          </Button>
        </Stack>
      )}

      {/* Warning Modal for Zero Shifts */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader color="red.500">Warning: No Shifts Assigned</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              This doctor currently does not have any assigned shifts. 
              <strong> They will no longer be visible in the Public Visiting Doctor Schedule.</strong>
            </Text>
            <Text mt={3}>Do you wish to proceed and submit 0 shifts, or go back and add shift information?</Text>
          </ModalBody>
          <ModalFooter>
             <Button variant="ghost" mr={3} onClick={onClose}>
               Resubmit with Shifts
             </Button>
             <Button colorScheme="red" onClick={() => executeSavePush([])}>
               Proceed with 0 Shifts
             </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </Box>
  );
}
