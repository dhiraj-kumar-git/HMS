import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  VStack,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Select,
  Button,
  Text,
  useToast,
  Icon,
  Divider,
  Grid,
  GridItem,
  Badge,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Alert,
  AlertIcon,
  Spinner
} from '@chakra-ui/react';
import { FiArrowLeft, FiCheckCircle, FiCalendar } from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import BASE_URL from './Config';

const PatientBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [instituteId, setInstituteId] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const [doctors, setDoctors] = useState([]);
  const [bookingData, setBookingData] = useState({
    doctor_username: '',
    date: '',
    timeSlot: '',
  });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [scheduleWarning, setScheduleWarning] = useState('');
  const [alternativeDoctor, setAlternativeDoctor] = useState(null);
  const [bookingFlow, setBookingFlow] = useState('dashboard');

  const parseShiftTime = (timeStr) => {
    if (!timeStr) return "09:00";
    const parts = timeStr.split(' ');
    if (parts.length !== 2) return "09:00";
    const [time, modifier] = parts;
    let [hours, minutes] = time.split(':');
    if (!hours || !minutes) return "09:00";
    if (hours === '12') hours = '00';
    if (modifier.toUpperCase() === 'PM') hours = String(parseInt(hours, 10) + 12);
    return `${hours.padStart(2, '0')}:${minutes}`;
  };

  const getTodayName = () => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  };

  const generateTimeSlots = (start, end) => {
    const slots = [];
    let [startH, startM] = start.split(':').map(Number);
    let [endH, endM] = end.split(':').map(Number);

    let current = new Date(2000, 0, 1, startH, startM);
    const endTime = new Date(2000, 0, 1, endH, endM);

    while (current <= endTime) {
      const hh = String(current.getHours()).padStart(2, '0');
      const mm = String(current.getMinutes()).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
      current.setMinutes(current.getMinutes() + 5);
    }
    return slots;
  };



  // Check if we came directly from registration
  useEffect(() => {
    if (location.state && location.state.autoFillInstituteId) {
      setInstituteId(location.state.autoFillInstituteId);
      handleVerify(location.state.autoFillInstituteId);
    }
  }, [location]);

  useEffect(() => {
    if (verifiedPatient) {
      fetchDoctors();
    }
  }, [verifiedPatient]);

  const fetchDoctors = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/public/doctors`);
      setDoctors(response.data);
    } catch (err) {
      console.error("Failed to fetch doctors", err);
    }
  };

  const handleVerify = async (idToVerify) => {
    const id = idToVerify || instituteId;
    if (!id) return;
    setVerifying(true);
    try {
      const response = await axios.post(`${BASE_URL}/api/public/verify`, { institute_id: id });
      setVerifiedPatient(response.data);
    } catch (err) {
      setVerifiedPatient(null);
      toast({
        title: "Verification Failed",
        description: err.response?.data?.error || "Institute ID not found.",
        status: "error",
        duration: 3000,
        position: 'top',
        isClosable: true,
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleSwitchAlternative = () => {
    if (alternativeDoctor) {
      setBookingData({ ...bookingData, doctor_username: alternativeDoctor.username });
      setScheduleWarning("");
      setAlternativeDoctor(null);
    }
  };

  const handleQuickBook = (docUsername) => {
    const doc = doctors.find(d => d.username === docUsername);
    let targetDate = new Date();

    if (doc) {
      const todayName = getTodayName();
      const shift = doc.schedule.find(s => s.duty_days.includes(todayName));
      if (shift) {
        const parsedStart = parseShiftTime(shift.start_time);
        const parsedEnd = parseShiftTime(shift.end_time);

        const startTimeDate = new Date();
        startTimeDate.setHours(parseInt(parsedStart.split(':')[0]), parseInt(parsedStart.split(':')[1]), 0, 0);

        const endTimeDate = new Date();
        endTimeDate.setHours(parseInt(parsedEnd.split(':')[0]), parseInt(parsedEnd.split(':')[1]), 0, 0);

        const now = new Date();
        if (now < startTimeDate) {
          targetDate = startTimeDate; // Before shift -> default to start time
        } else if (now > endTimeDate) {
          targetDate = endTimeDate;   // After shift -> default to end time
        } else {
          // During shift -> round to nearest 5 mins
          const ms = 1000 * 60 * 5;
          targetDate = new Date(Math.round(now.getTime() / ms) * ms);
        }
      }
    } else {
      const ms = 1000 * 60 * 5;
      targetDate = new Date(Math.round(new Date().getTime() / ms) * ms);
    }

    // Format to YYYY-MM-DD
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const hours = String(targetDate.getHours()).padStart(2, '0');
    const minutes = String(targetDate.getMinutes()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}`;
    const formattedTimeSlot = `${hours}:${minutes}`;

    setAlternativeDoctor(null);
    setScheduleWarning("");
    setBookingData({ ...bookingData, doctor_username: docUsername, date: formattedDate, timeSlot: formattedTimeSlot });
    setBookingFlow('quick_confirm');

    toast({
      title: "Doctor Selected",
      description: "Form pre-filled with the nearest available time.",
      status: "info",
      duration: 2000,
      position: 'top',
    });
  };

  const handleDoctorChange = (e) => {
    const docUsername = e.target.value;
    let warning = "";
    let altDoc = null;

    if (docUsername && bookingData.date) {
      const doc = doctors.find(d => d.username === docUsername);
      if (doc) {
        // Adding timezone trick to prevent date skew:
        const [year, month, day] = bookingData.date.split('-');
        const dateObj = new Date(year, month - 1, day);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const shift = doc.schedule.find(s => s.duty_days.includes(dayName));
        if (!shift) {
          warning = `Warning: ${doc.display_name} is not typically scheduled on ${dayName}s.`;
          altDoc = doctors.find(alt =>
            alt.username !== doc.username &&
            alt.department === doc.department &&
            alt.schedule &&
            alt.schedule.some(s => s.duty_days.includes(dayName))
          );
        }
      }
    }
    setAlternativeDoctor(altDoc);
    setScheduleWarning(warning);
    setBookingData({ ...bookingData, doctor_username: docUsername, timeSlot: '' });
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value; // YYYY-MM-DD
    let warning = "";
    let altDoc = null;

    if (bookingData.doctor_username && newDate) {
      const doc = doctors.find(d => d.username === bookingData.doctor_username);
      if (doc) {
        const [year, month, day] = newDate.split('-');
        const dateObj = new Date(year, month - 1, day);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const shift = doc.schedule.find(s => s.duty_days.includes(dayName));
        if (!shift) {
          warning = `Warning: ${doc.display_name} is not typically scheduled on ${dayName}s.`;
          altDoc = doctors.find(alt =>
            alt.username !== doc.username &&
            alt.department === doc.department &&
            alt.schedule &&
            alt.schedule.some(s => s.duty_days.includes(dayName))
          );
        }
      }
    }
    setAlternativeDoctor(altDoc);
    setScheduleWarning(warning);
    setBookingData({ ...bookingData, date: newDate, timeSlot: '' });
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!bookingData.doctor_username || !bookingData.date || !bookingData.timeSlot) {
      toast({
        title: "Error",
        description: "Please select a doctor, date, and time slot.",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: 'top'
      });
      return;
    }

    const fullTime = `${bookingData.date}T${bookingData.timeSlot}`;

    setBookingLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/public/book-appointment`, {
        institute_id: verifiedPatient.institute_id,
        doctor_username: bookingData.doctor_username,
        time: fullTime
      });

      toast({
        title: "Appointment Confirmed",
        description: "Your slot has been successfully booked.",
        status: "success",
        duration: 4000,
        position: 'top',
        isClosable: true,
      });

      // Clear the form after success
      setBookingData({ doctor_username: '', date: '', timeSlot: '' });
      setBookingFlow('dashboard');
      setIsRedirecting(true);
      setTimeout(() => navigate('/portal'), 2000);

    } catch (err) {
      toast({
        title: "Booking Failed",
        description: err.response?.data?.error || "Could not book appointment.",
        status: "error",
        duration: 3000,
        position: 'top',
        isClosable: true,
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const todayName = getTodayName();
  const doctorsAvailableToday = doctors.filter(doc =>
    doc.schedule && doc.schedule.some(s => s.duty_days.includes(todayName))
  );

  const prevDoc = verifiedPatient && verifiedPatient.doctor_assigned
    ? doctors.find(d => d.username === verifiedPatient.doctor_assigned)
    : null;

  // Calculate Available Time Slots for UI Generation
  let availableTimeSlots = [];
  if (bookingData.doctor_username && bookingData.date) {
    const doc = doctors.find(d => d.username === bookingData.doctor_username);
    const [year, month, day] = bookingData.date.split('-');
    const dateObj = new Date(year, month - 1, day);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const shift = doc?.schedule?.find(s => s.duty_days.includes(dayName));

    if (shift) {
      const parsedStart = parseShiftTime(shift.start_time);
      const parsedEnd = parseShiftTime(shift.end_time);
      availableTimeSlots = generateTimeSlots(parsedStart, parsedEnd);
    } else {
      // Fallback if doctor off duty - allow standard clinic hours
      availableTimeSlots = generateTimeSlots("09:00", "17:00");
    }
  }

  if (isRedirecting) {
    return (
      <Flex minH="100vh" bg="gray.50" align="center" justify="center" flexDir="column">
        <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="teal.500" size="xl" />
        <Text mt={4} fontSize="lg" color="teal.700" fontWeight="bold">Booking confirmed! Redirecting to portal...</Text>
      </Flex>
    );
  }

  return (
    <Flex minH="100vh" bg="gray.50" align="flex-start" justify="center" p={{ base: 4, md: 8 }}>
      <style>
        {`
          @keyframes pulse-green {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(72, 187, 120, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(72, 187, 120, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(72, 187, 120, 0); }
          }
          .pulsing-dot { animation: pulse-green 2s infinite; }
        `}
      </style>
      <Box w="100%" maxW={verifiedPatient ? "1100px" : "600px"} bg="white" borderRadius="2xl" boxShadow="xl" p={8} transition="all 0.3s ease">
        <Button
          leftIcon={<FiArrowLeft />}
          variant="ghost"
          colorScheme="teal"
          mb={6}
          onClick={() => navigate('/portal')}
        >
          Back to Portal
        </Button>

        <Flex align="center" mb={6}>
          <Icon as={FiCalendar} w={8} h={8} color="teal.500" mr={3} />
          <Heading as="h2" size="xl" color="gray.800">
            Book Appointment
          </Heading>
        </Flex>

        {!verifiedPatient ? (
          <VStack spacing={6}>
            <Text color="gray.600" w="100%">
              Enter your Institute ID to fetch your patient record and book an appointment.
            </Text>
            <FormControl>
              <FormLabel color="gray.700">Institute ID</FormLabel>
              <Input
                placeholder="e.g. 2025H1120147P"
                value={instituteId}
                onChange={(e) => setInstituteId(e.target.value)}
                focusBorderColor="teal.500"
                size="lg"
              />
            </FormControl>
            <Button
              colorScheme="teal"
              size="lg"
              w="100%"
              borderRadius="xl"
              isLoading={verifying}
              onClick={() => handleVerify(instituteId)}
            >
              Verify Patient
            </Button>
          </VStack>
        ) : (
          <Box>
            <Flex align="center" p={4} bg="teal.50" borderRadius="xl" border="1px solid" borderColor="teal.200" mb={6}>
              <Icon as={FiCheckCircle} w={6} h={6} color="teal.500" mr={3} />
              <Box>
                <Text fontSize="sm" color="teal.700" fontWeight="bold">Verified Patient</Text>
                <Text fontSize="lg" color="teal.900">{verifiedPatient.name}</Text>
                <Text fontSize="xs" color="teal.600">ID: {verifiedPatient.institute_id}</Text>
              </Box>
            </Flex>

            {bookingFlow === 'dashboard' && (
              <VStack spacing={6} align="stretch">
                {prevDoc && (
                  <Box p={4} bg="blue.50" borderRadius="xl" border="1px solid" borderColor="blue.200">
                    <Text fontSize="sm" color="blue.800" mb={3}>
                      You previously visited <strong>{prevDoc.display_name}</strong> ({prevDoc.department}).
                    </Text>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={() => handleQuickBook(prevDoc.username)}
                    >
                      Book with {prevDoc.display_name} Again
                    </Button>
                  </Box>
                )}

                <Box bg="white" p={6} borderRadius="xl" border="1px solid" borderColor="teal.100" boxShadow="sm">
                  <Heading size="md" mb={4} color="teal.800" display="flex" alignItems="center">
                    <Box w="3" h="3" bg="green.400" borderRadius="full" mr={3} className="pulsing-dot" />
                    Doctors Available Today ({todayName})
                  </Heading>
                  {doctorsAvailableToday.length > 0 ? (
                    <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                      {doctorsAvailableToday.map((doc, idx) => {
                        const shift = doc.schedule.find(s => s.duty_days.includes(todayName));
                        return (
                          <GridItem key={idx}>
                            <Flex direction="column" justify="space-between" h="100%" p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                              <Box mb={4}>
                                <Text fontWeight="bold" color="gray.700">{doc.display_name} ({doc.department})</Text>
                                <Badge colorScheme="green" mt={2} borderRadius="md" textTransform="none">
                                  Today: {shift.start_time} - {shift.end_time}
                                </Badge>
                              </Box>
                              <Button
                                w="100%"
                                colorScheme="teal"
                                variant="solid"
                                onClick={() => handleQuickBook(doc.username)}
                              >
                                Book Now
                              </Button>
                            </Flex>
                          </GridItem>
                        )
                      })}
                    </Grid>
                  ) : (
                    <Text color="gray.500" fontSize="sm">No doctors are officially scheduled for today.</Text>
                  )}
                </Box>

                <Flex direction="column" align="center" mt={2} bg="gray.50" p={6} borderRadius="xl" border="1px dashed" borderColor="gray.300">
                  <Text color="gray.600" mb={3} textAlign="center">Don't see your doctor or want to plan ahead instead?</Text>
                  <Button size="lg" colorScheme="gray" variant="outline" onClick={() => setBookingFlow('future')}>
                    Schedule for a Later Date
                  </Button>
                </Flex>

                {/* Visit History Section */}
                {verifiedPatient.appointments && verifiedPatient.appointments.filter(a => 
                  a.status === 'completed' || 
                  (a.prescription_summary && a.prescription_summary.length > 0) ||
                  (a.lab_test_summary && a.lab_test_summary.length > 0) ||
                  (a.diagnosis_note && a.diagnosis_note.length > 0) ||
                  (a.prescription_remarks_summary && a.prescription_remarks_summary.length > 0)
                ).length > 0 && (
                  <Box mt={6} bg="white" p={6} borderRadius="xl" border="1px solid" borderColor="teal.100" boxShadow="sm">
                    <Heading size="md" mb={4} color="teal.800" display="flex" alignItems="center">
                      <Icon as={FiCalendar} mr={3} /> My Visit History
                    </Heading>
                    <Accordion allowMultiple>
                      {verifiedPatient.appointments.filter(a => 
                        a.status === 'completed' || 
                        (a.prescription_summary && a.prescription_summary.length > 0) ||
                        (a.lab_test_summary && a.lab_test_summary.length > 0) ||
                        (a.diagnosis_note && a.diagnosis_note.length > 0) ||
                        (a.prescription_remarks_summary && a.prescription_remarks_summary.length > 0)
                      ).slice().reverse().map((app, idx) => (
                        <AccordionItem key={idx} borderRadius="md" border="1px solid" borderColor="gray.200" mb={3}>
                          <h2>
                            <AccordionButton _expanded={{ bg: "gray.50" }}>
                              <Box flex="1" textAlign="left" fontWeight="bold" color="gray.700">
                                {new Date(app.time.split('T')[0]).toLocaleDateString()} at {app.time.split('T')[1]} - {app.doctor_name}
                              </Box>
                              <Badge colorScheme={app.status === 'completed' ? "green" : "blue"} mr={3} textTransform="none">
                                {app.status === 'completed' ? "Completed" : "In Progress"}
                              </Badge>
                              <AccordionIcon />
                            </AccordionButton>
                          </h2>
                          <AccordionPanel pb={4} bg="gray.50">
                            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                              <Box>
                                <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Medicines Prescribed</Text>
                                {app.prescription_summary && app.prescription_summary.length > 0 ? (
                                  <VStack align="start" spacing={1}>
                                    {app.prescription_summary.map((p, i) => p && <Text key={i} fontSize="sm">• {p}</Text>)}
                                  </VStack>
                                ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                              </Box>
                              <Box>
                                <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Prescription Remarks</Text>
                                {app.prescription_remarks_summary && app.prescription_remarks_summary.length > 0 ? (
                                  <VStack align="start" spacing={1}>
                                    {app.prescription_remarks_summary.map((r, i) => r && <Text key={i} fontSize="sm">• {r}</Text>)}
                                  </VStack>
                                ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                              </Box>
                              <Box gridColumn={{ md: "span 2" }}>
                                <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Diagnosis Notes</Text>
                                {app.diagnosis_note && app.diagnosis_note.length > 0 ? (
                                  <VStack align="start" spacing={1}>
                                    {app.diagnosis_note.map((d, i) => d && <Text key={i} fontSize="sm">• {d}</Text>)}
                                  </VStack>
                                ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                              </Box>
                              <Box gridColumn={{ md: "span 2" }}>
                                <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Lab Tests Overview</Text>
                                {app.lab_test_summary && app.lab_test_summary.length > 0 ? (
                                  <VStack align="start" spacing={1}>
                                    {app.lab_test_summary.map((l, i) => l && <Text key={i} fontSize="sm">• {l}</Text>)}
                                  </VStack>
                                ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
                              </Box>
                            </Grid>
                          </AccordionPanel>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </Box>
                )}
              </VStack>
            )}

            {bookingFlow === 'quick_confirm' && (
              <Box bg="white" p={8} borderRadius="xl" border="1px solid" borderColor="teal.200" boxShadow="sm" maxW="600px" mx="auto">
                <Heading size="md" color="teal.800" mb={6} textAlign="center">Immediate Booking Confirmation</Heading>
                <form onSubmit={handleBooking}>
                  <VStack spacing={5} align="stretch">
                    <Box bg="gray.50" p={4} borderRadius="md" border="1px solid" borderColor="gray.200">
                      <Text fontSize="sm" color="gray.500">Selected Doctor</Text>
                      {(() => {
                        const d = doctors.find(doc => doc.username === bookingData.doctor_username);
                        return <Text fontSize="lg" fontWeight="bold" color="gray.800">{d?.display_name} ({d?.department})</Text>;
                      })()}
                    </Box>
                    <Box bg="gray.50" p={4} borderRadius="md" border="1px solid" borderColor="gray.200">
                      <Text fontSize="sm" color="gray.500">Selected Date</Text>
                      <Text fontSize="lg" fontWeight="bold" color="gray.800">{bookingData.date} ({todayName})</Text>
                    </Box>

                    <FormControl isRequired>
                      <FormLabel color="gray.700">Confirm Time Slot</FormLabel>
                      <Select
                        value={bookingData.timeSlot}
                        onChange={(e) => setBookingData({ ...bookingData, timeSlot: e.target.value })}
                        focusBorderColor="teal.500"
                        size="lg"
                        bg="white"
                      >
                        {availableTimeSlots.map((slot, idx) => {
                          const [h, m] = slot.split(':');
                          const hours = parseInt(h);
                          const ampm = hours >= 12 ? 'PM' : 'AM';
                          const displayH = hours % 12 || 12;
                          const displayTime = `${displayH}:${m} ${ampm}`;
                          return (
                            <option key={idx} value={slot}>{displayTime}</option>
                          );
                        })}
                      </Select>
                      <Text fontSize="xs" color="gray.500" mt={2}>
                        We have automatically selected the nearest available slot for you.
                      </Text>
                    </FormControl>

                    <Flex gap={4} mt={4}>
                      <Button flex="1" size="lg" variant="outline" onClick={() => setBookingFlow('dashboard')}>
                        Cancel
                      </Button>
                      <Button flex="2" size="lg" colorScheme="teal" type="submit" isLoading={bookingLoading}>
                        Confirm & Book
                      </Button>
                    </Flex>
                  </VStack>
                </form>
              </Box>
            )}

            {bookingFlow === 'future' && (
              <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={8}>
                <GridItem>
                  <VStack spacing={6} align="stretch" bg="gray.50" p={6} borderRadius="xl" border="1px solid" borderColor="gray.100">
                    <Flex justify="space-between" align="center">
                      <Heading size="md" color="gray.700">Advanced Booking</Heading>
                      <Button size="sm" variant="ghost" onClick={() => setBookingFlow('dashboard')}>Go Back</Button>
                    </Flex>
                    <Divider />
                    <form onSubmit={handleBooking}>
                      <VStack spacing={5}>
                        <FormControl isRequired>
                          <FormLabel color="gray.700">Select Doctor</FormLabel>
                          <Select
                            placeholder="Choose a doctor"
                            value={bookingData.doctor_username}
                            onChange={handleDoctorChange}
                            focusBorderColor="teal.500"
                            size="lg"
                            bg="white"
                          >
                            {doctors.map((doc, idx) => (
                              <option key={idx} value={doc.username}>
                                {doc.display_name} ({doc.department})
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl isRequired>
                          <FormLabel color="gray.700">Appointment Date</FormLabel>
                          <Input
                            type="date"
                            value={bookingData.date}
                            onChange={handleDateChange}
                            focusBorderColor="teal.500"
                            size="lg"
                            bg="white"
                          />
                        </FormControl>
                        <FormControl isRequired isDisabled={!bookingData.date || !bookingData.doctor_username}>
                          <FormLabel color="gray.700">Time Slot (5-min intervals)</FormLabel>
                          <Select
                            placeholder="Select a 5-min slot"
                            value={bookingData.timeSlot}
                            onChange={(e) => setBookingData({ ...bookingData, timeSlot: e.target.value })}
                            focusBorderColor="teal.500"
                            size="lg"
                            bg="white"
                          >
                            {availableTimeSlots.map((slot, idx) => {
                              const [h, m] = slot.split(':');
                              const hours = parseInt(h);
                              const ampm = hours >= 12 ? 'PM' : 'AM';
                              const displayH = hours % 12 || 12;
                              const displayTime = `${displayH}:${m} ${ampm}`;
                              return (
                                <option key={idx} value={slot}>{displayTime}</option>
                              );
                            })}
                          </Select>
                        </FormControl>

                        {scheduleWarning && (
                          <Alert status="warning" borderRadius="md" flexDirection="column" alignItems="flex-start">
                            <Flex align="center">
                              <AlertIcon />
                              <Text>{scheduleWarning}</Text>
                            </Flex>
                            {alternativeDoctor && (
                              <Box mt={3} ml={7}>
                                <Text fontSize="sm" mb={2} color="orange.800">
                                  However, <strong>{alternativeDoctor.display_name}</strong> is available in the {alternativeDoctor.department} department today.
                                </Text>
                                <Button size="sm" colorScheme="orange" onClick={handleSwitchAlternative}>
                                  Switch to {alternativeDoctor.display_name}
                                </Button>
                              </Box>
                            )}
                          </Alert>
                        )}
                        <Button
                          type="submit"
                          colorScheme="teal"
                          size="lg"
                          w="100%"
                          borderRadius="xl"
                          mt={4}
                          isLoading={bookingLoading}
                          loadingText="Confirming..."
                        >
                          Confirm Appointment
                        </Button>
                        <Text fontSize="xs" color="gray.500" textAlign="center" mt={2} px={4}>
                          *Note: Exact timing is an estimate and is subject to the live clinic queue.
                        </Text>
                      </VStack>
                    </form>
                  </VStack>
                </GridItem>
                <GridItem display="flex" flexDirection="column" gap={6}>
                  <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" boxShadow="sm" overflow="hidden">
                    <Accordion allowMultiple>
                      <AccordionItem border="none">
                        <h2>
                          <AccordionButton _expanded={{ bg: "gray.100" }} p={4}>
                            <Box flex="1" textAlign="left" fontWeight="bold" color="gray.700">
                              View Full Visiting Doctors Schedule
                            </Box>
                            <AccordionIcon />
                          </AccordionButton>
                        </h2>
                        <AccordionPanel pb={4} bg="white">
                          {doctors.length > 0 ? (
                            <VStack align="stretch" spacing={4}>
                              {doctors.map((doc, idx) => (
                                <Box key={idx} borderBottom="1px solid" borderColor="gray.100" pb={3}>
                                  <Text fontWeight="bold" color="gray.700">{doc.display_name} ({doc.department})</Text>
                                  {doc.schedule && doc.schedule.length > 0 ? (
                                    doc.schedule.map((shift, s_idx) => (
                                      <Text key={s_idx} fontSize="sm" color="gray.600">
                                        • {shift.duty_days.join(", ")}: {shift.start_time} - {shift.end_time}
                                      </Text>
                                    ))
                                  ) : (
                                    <Text fontSize="sm" color="gray.500">• No schedule assigned</Text>
                                  )}
                                </Box>
                              ))}
                            </VStack>
                          ) : (
                            <Text fontSize="sm" color="gray.500">Loading schedule...</Text>
                          )}
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  </Box>
                </GridItem>
              </Grid>
            )}
          </Box>
        )}
      </Box>
    </Flex>
  );
};

export default PatientBooking;
