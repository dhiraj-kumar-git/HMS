import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  Button,
  useColorModeValue,
  Icon,
  Grid,
  GridItem,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Badge,
  Divider,
  SimpleGrid,
  HStack,
  List,
  ListItem,
  ListIcon,
  Stack,
  Card,
  CardBody,
  Link,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Image,
} from '@chakra-ui/react';
import {
  FiCalendar,
  FiClock,
  FiPhone,
  FiAlertTriangle,
  FiCheckCircle,
  FiMail,
  FiArrowRight,
  FiGlobe,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import BASE_URL from '../../utils/Config';
import bitsLogo from '../../assets/bits-logo.png';

const PatientPortal = () => {
  const navigate = useNavigate();
  
  // Theme Color Configurations (Called at the top level of the component)
  const bg = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  const subTextColor = useColorModeValue('gray.600', 'gray.400');
  const headingColor = useColorModeValue('teal.700', 'teal.300');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  
  const timingsBg = useColorModeValue('teal.50', 'rgba(49, 151, 149, 0.1)');
  const emergencyBg = useColorModeValue('red.50', 'rgba(229, 62, 62, 0.1)');
  const infoBg = useColorModeValue('gray.50', 'gray.700');
  const noteBg = useColorModeValue('orange.50', 'rgba(221, 107, 32, 0.1)');
  const accordionExpandedBg = useColorModeValue('teal.50', 'teal.800');
  const loginHoverBg = useColorModeValue('gray.100', 'gray.700');
  const noteTextColor = useColorModeValue('orange.800', 'orange.300');

  // Dynamic Visiting Doctors Schedule State
  const [dynamicSchedule, setDynamicSchedule] = useState({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
  });
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/public/doctors`);
        const newSchedule = {
          Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
        };

        if (Array.isArray(response.data)) {
          response.data.forEach((doc) => {
            if (doc.schedule && doc.schedule.length > 0) {
              doc.schedule.forEach((shift) => {
                if (shift.duty_days && Array.isArray(shift.duty_days)) {
                  shift.duty_days.forEach((day) => {
                    if (newSchedule[day]) {
                      newSchedule[day].push({
                        name: doc.display_name,
                        department: doc.department,
                        time: `${shift.start_time} - ${shift.end_time}`,
                      });
                    }
                  });
                }
              });
            }
          });
        }
        setDynamicSchedule(newSchedule);
      } catch (err) {
        console.error('Error fetching doctor schedule', err);
      } finally {
        setLoadingSchedule(false);
      }
    };
    fetchDoctors();
  }, []);

  // Helper function to dynamically obtain visiting doctor timings from the database/schedule
  const getVisitingDoctorTiming = (docName, defaultTiming) => {
    if (loadingSchedule) return defaultTiming;

    const schedules = [];
    daysOfWeek.forEach((day) => {
      const doctorsOnDay = dynamicSchedule[day] || [];
      doctorsOnDay.forEach((d) => {
        const cleanDName = d.name.replace(/\./g, '').toLowerCase().trim();
        const cleanTarget = docName.replace(/\./g, '').toLowerCase().trim();
        if (cleanDName.includes(cleanTarget) || cleanTarget.includes(cleanDName)) {
          schedules.push({ day, time: d.time });
        }
      });
    });

    if (schedules.length === 0) return defaultTiming;

    const timeToDays = {};
    schedules.forEach((s) => {
      if (!timeToDays[s.time]) {
        timeToDays[s.time] = [];
      }
      timeToDays[s.time].push(s.day);
    });

    const formattedSchedules = Object.keys(timeToDays).map((time) => {
      const days = timeToDays[time];
      return `${days.join(' & ')} (${time})`;
    });

    return formattedSchedules.join(', ');
  };

  // Days list for schedule iteration
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Static Fallback lists from the board
  const fullTimeDoctors = [
    { name: 'Dr. Guru Prasad Burnwal', degrees: 'MBBS, PG Diploma, MBA', role: 'Chief Medical Officer' },
    { name: 'Dr. Anupama Rao', degrees: 'MBBS, CCEBDM, PDF', role: 'Dy. Chief Medical Officer' },
    { name: 'Dr. Sanjana R Bhat', degrees: 'MBBS, MD (Gynecologist)', role: 'Dy. Chief Medical Officer' },
    { name: 'Dr. Pyla Venkatesh', degrees: 'MBBS', role: 'Sr. Medical Officer' },
    { name: 'Dr. Sanjeet Kumar', degrees: 'MBBS', role: 'Medical Officer' },
    { name: 'Dr. Dany R Jose', degrees: 'MBBS', role: 'Medical Officer' },
    { name: 'Mr. Pankaj Sharma', degrees: 'MPT', role: 'Physiotherapist' },
  ];

  const staticVisitingDoctors = [
    { name: 'Dr. Kishore Singh', spec: 'Dermatologist, MD', timing: 'Tuesday (6:00 PM - 7:30 PM)' },
    { name: 'Dr. Rinku Singh', spec: 'Gynecologist, MD', timing: 'Wednesday & Friday (7:00 PM - 8:00 PM)' },
    { name: 'Dr. Prashant Singh', spec: 'Orthopedic, MS', timing: 'Wednesday & Friday (7:00 PM - 8:00 PM)' },
    { name: 'Dr. Pooja Shah', spec: 'ENT, DLO', timing: 'Sunday & Thursday (5:30 PM - 6:30 PM)' },
    { name: 'Dr. Karan Singh Beniwal', spec: 'Pediatrics, MD', timing: 'Wednesday & Friday (5:00 PM - 6:00 PM)' },
    { name: 'Dr. Ramesh P Jajoo', spec: 'Ayurvedic', timing: 'Sunday & Wednesday (9:00 AM - 11:00 AM)' },
    { name: 'Dr. Diwakar Pathak', spec: 'Homeopathic', timing: 'Monday (5:30 PM - 6:30 PM)' },
    { name: 'Dr. Preeti Maan', spec: 'Dentist', timing: 'Wednesday & Saturday (5:00 PM - 6:30 PM)' },
  ];

  const labServicesLeft = [
    'CBC - Complete Blood Count', 'Peripheral Blood Smear', 'Urine Comprehensive Test',
    'Sputum Microscopic Examination', 'Blood Sugar', 'Glycosylated Haemoglobin (HbA1c)',
    'Liver Function Tests', 'Australia Antigen Test (HbsAg)', 'Lipid Profile',
    'Kidney Function Tests', 'Serum Electrolytes'
  ];

  const labServicesRight = [
    'Urine Test', 'Urine ACR Test', 'Stool Test', 'ASLO Titre / R. A. Test',
    'Mantoux Test', 'Semen Analysis', 'Thyroid Function Test', 'Dengue Test',
    'Malaria Test', 'Widal Test', 'VDRL Test'
  ];

  return (
    <Flex minH="100vh" w="100%" bg={bg} justify="center" p={{ base: 3, md: 5 }} direction="column">
      <VStack spacing={4} maxW="1200px" w="100%" mx="auto">
        {/* Welcome Header - Logo aligned to the left of the text, layout made more compact */}
        <Flex align="center" justify="center" w="100%" py={2} gap={3} direction={{ base: 'column', sm: 'row' }}>
          <Image
            src={bitsLogo}
            alt="BITS Pilani Logo"
            boxSize="50px"
            objectFit="contain"
          />
          <Heading
            as="h1"
            size="lg"
            bgGradient="linear(to-r, teal.600, blue.500)"
            bgClip="text"
            fontWeight="extrabold"
            textAlign={{ base: 'center', sm: 'left' }}
          >
            Welcome to BITS Medical Center Patient Portal
          </Heading>
        </Flex>

        {/* Responsive Grid with tighter gaps and columns */}
        <Grid templateColumns={{ base: '1fr', lg: '7fr 5fr' }} gap={5} w="100%">
          
          {/* Left Column: Hospital Information Board */}
          <GridItem>
            <Card bg={cardBg} borderRadius="xl" shadow="md" border="1px solid" borderColor={borderColor}>
              <CardBody p={{ base: 3, md: 4 }}>
                <Heading as="h2" size="sm" color={headingColor} mb={4} borderBottom="2px solid" pb={2} borderColor="teal.600">
                  Medical Center Information Board
                </Heading>

                <Tabs isLazy variant="soft-rounded" colorScheme="teal" size="sm">
                  <TabList overflowX="auto" pb={1.5} gap={1}>
                    <Tab fontSize="xs" fontWeight="bold" px={3} py={1.5}>Timings & Emergency</Tab>
                    <Tab fontSize="xs" fontWeight="bold" px={3} py={1.5}>Doctor Roster</Tab>
                    <Tab fontSize="xs" fontWeight="bold" px={3} py={1.5}>Schedules</Tab>
                    <Tab fontSize="xs" fontWeight="bold" px={3} py={1.5}>Facilities & Labs</Tab>
                  </TabList>

                  <TabPanels mt={4}>
                    
                    {/* Tab 1: Timings & Emergency */}
                    <TabPanel p={0}>
                      <Stack spacing={4}>
                        {/* Timings */}
                        <Box p={3} borderRadius="lg" bg={timingsBg} borderLeft="4px solid" borderColor="teal.600">
                          <HStack spacing={3}>
                            <Icon as={FiClock} w={5} h={5} color="teal.600" />
                            <Box>
                              <Text fontWeight="bold" fontSize="sm" color="teal.800">Timings (OPD & Medical Store)</Text>
                              <Heading size="xs" color="teal.700" mt={0.5}>24/7 Availability</Heading>
                              <Text fontSize="10px" color="teal.600" mt={0.5} fontWeight="medium">
                                * Note: OPD & Medical Store remains closed on national holidays.
                              </Text>
                            </Box>
                          </HStack>
                        </Box>

                        {/* Emergencies */}
                        <Box p={3} borderRadius="lg" bg={emergencyBg} borderLeft="4px solid" borderColor="red.500">
                          <HStack align="start" spacing={3}>
                            <Icon as={FiAlertTriangle} w={5} h={5} color="red.500" mt={0.5} />
                            <Box w="100%">
                              <Text fontWeight="bold" fontSize="sm" color="red.800">In Case of Medical Emergencies</Text>
                              <SimpleGrid columns={{ base: 2, sm: 4 }} gap={2} mt={2}>
                                <VStack align="start" spacing={0}>
                                  <Text fontSize="9px" fontWeight="bold" color="gray.500">INTERCOM</Text>
                                  <Text fontSize="xs" fontWeight="bold" color="red.700">Dial 5525</Text>
                                </VStack>
                                <VStack align="start" spacing={0}>
                                  <Text fontSize="9px" fontWeight="bold" color="gray.500">LANDLINE</Text>
                                  <Text fontSize="xs" fontWeight="bold" color="red.700">Dial 255525</Text>
                                </VStack>
                                <VStack align="start" spacing={0}>
                                  <Text fontSize="9px" fontWeight="bold" color="gray.500">MOBILE</Text>
                                  <Text fontSize="xs" fontWeight="bold" color="red.700">01596-255525</Text>
                                </VStack>
                                <VStack align="start" spacing={0}>
                                  <Text fontSize="9px" fontWeight="bold" color="gray.500">EMERGENCY MOBILE No.</Text>
                                  <Text fontSize="xs" fontWeight="bold" color="red.700">7878995055</Text>
                                </VStack>
                              </SimpleGrid>
                            </Box>
                          </HStack>
                        </Box>

                        {/* Contact info */}
                        <Box>
                          <Heading as="h4" size="xs" mb={2} color={headingColor}>Contact Extensions</Heading>
                          <SimpleGrid columns={{ base: 2, sm: 2 }} gap={2}>
                            <HStack p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Icon as={FiPhone} color="teal.600" w={3.5} h={3.5} />
                              <Box>
                                <Text fontSize="9px" fontWeight="bold" color="gray.500">CHIEF MEDICAL OFFICER</Text>
                                <Text fontSize="xs" fontWeight="semibold" color={textColor}>+91 1596 255 529</Text>
                              </Box>
                            </HStack>
                            <HStack p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Icon as={FiPhone} color="teal.600" w={3.5} h={3.5} />
                              <Box>
                                <Text fontSize="9px" fontWeight="bold" color="gray.500">RECEPTION DESK</Text>
                                <Text fontSize="xs" fontWeight="semibold" color={textColor}>+91 1596 255 525</Text>
                              </Box>
                            </HStack>
                            <HStack p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Icon as={FiPhone} color="teal.600" w={3.5} h={3.5} />
                              <Box>
                                <Text fontSize="9px" fontWeight="bold" color="gray.500">LABORATORY</Text>
                                <Text fontSize="xs" fontWeight="semibold" color={textColor}>+91 1596 255 527</Text>
                              </Box>
                            </HStack>
                            <HStack p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Icon as={FiPhone} color="teal.600" w={3.5} h={3.5} />
                              <Box>
                                <Text fontSize="9px" fontWeight="bold" color="gray.500">MEDICAL STORE</Text>
                                <Text fontSize="xs" fontWeight="semibold" color={textColor}>+91 1596 255 526</Text>
                              </Box>
                            </HStack>
                          </SimpleGrid>
                        </Box>

                        <Divider borderColor={borderColor} />

                        {/* Web Contacts */}
                        <HStack justify="space-between" flexWrap="wrap" gap={2}>
                          <HStack spacing={1}>
                            <Icon as={FiMail} color="teal.600" w={3.5} h={3.5} />
                            <Text fontSize="xs" color={subTextColor}>
                              Email: <Link href="mailto:pic.medc@pilani.bits-pilani.ac.in" color="teal.600" fontWeight="bold">pic.medc@pilani.bits-pilani.ac.in</Link>
                            </Text>
                          </HStack>
                          <HStack spacing={1}>
                            <Icon as={FiGlobe} color="teal.600" w={3.5} h={3.5} />
                            <Text fontSize="xs" color={subTextColor}>
                              Web: <Link href="https://www.bits-pilani.ac.in/pilani/medical-center" target="_blank" color="teal.600" fontWeight="bold">bits-pilani.ac.in</Link>
                            </Text>
                          </HStack>
                        </HStack>
                      </Stack>
                    </TabPanel>

                    {/* Tab 2: Doctor Roster */}
                    <TabPanel p={0}>
                      <Stack spacing={4}>
                        {/* Full-Time Doctors */}
                        <Box>
                          <Heading as="h3" size="xs" color={headingColor} mb={2.5}>Full-Time Medical Roster</Heading>
                          <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
                            {fullTimeDoctors.map((doc, idx) => (
                              <Box key={idx} p={2} borderRadius="lg" border="1px solid" borderColor={borderColor} bg={infoBg}>
                                <Text fontWeight="bold" fontSize="xs" color={textColor}>{doc.name}</Text>
                                <Text fontSize="10px" color="teal.600" fontWeight="semibold" mt={0.5}>{doc.degrees}</Text>
                                <Badge colorScheme="teal" variant="subtle" mt={1} borderRadius="md" px={1.5} py={0.2} fontSize="9px">
                                  {doc.role}
                                </Badge>
                              </Box>
                            ))}
                          </SimpleGrid>
                        </Box>

                        <Divider borderColor={borderColor} />

                        {/* Visiting Specialist Panels */}
                        <Box>
                          <Heading as="h3" size="xs" color={headingColor} mb={2.5}>Visiting Medical Specialists</Heading>
                          <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
                            {staticVisitingDoctors.map((doc, idx) => (
                              <Box key={idx} p={2} borderRadius="lg" border="1px solid" borderColor={borderColor}>
                                <Text fontWeight="bold" fontSize="xs" color={textColor}>{doc.name}</Text>
                                <Text fontSize="10px" color="blue.500" fontWeight="semibold" mt={0.5}>{doc.spec}</Text>
                                <HStack mt={1} spacing={1} color="gray.500">
                                  <Icon as={FiClock} w={3} h={3} />
                                  <Text fontSize="10px">{getVisitingDoctorTiming(doc.name, doc.timing)}</Text>
                                </HStack>
                              </Box>
                            ))}
                          </SimpleGrid>
                        </Box>
                      </Stack>
                    </TabPanel>

                    {/* Tab 3: Schedules */}
                    <TabPanel p={0}>
                      <Box>
                        <Heading as="h3" size="xs" color={headingColor} mb={3}>
                          Visiting Doctors Schedule (Duty Calendar)
                        </Heading>
                        {loadingSchedule ? (
                          <Text fontSize="xs" color="gray.500">Loading visiting doctor schedules...</Text>
                        ) : (
                          <Accordion allowMultiple defaultIndex={[0]}>
                            {daysOfWeek.map((day, idx) => {
                              const dayDutyList = dynamicSchedule[day] || [];
                              return (
                                <AccordionItem key={idx} border="1px solid" borderColor={borderColor} borderRadius="md" mb={1.5} overflow="hidden">
                                  <h2>
                                    <AccordionButton py={1.5} _expanded={{ bg: accordionExpandedBg, color: 'teal.800' }}>
                                      <Box flex="1" textAlign="left" fontWeight="bold" fontSize="xs">
                                        {day}
                                      </Box>
                                      <Badge colorScheme={dayDutyList.length > 0 ? 'teal' : 'gray'} mr={3} fontSize="9px">
                                        {dayDutyList.length} Doctors
                                      </Badge>
                                      <AccordionIcon w={4} h={4} />
                                    </AccordionButton>
                                  </h2>
                                  <AccordionPanel pb={2.5} pt={2}>
                                    {dayDutyList.length > 0 ? (
                                      <List spacing={2}>
                                        {dayDutyList.map((doc, docIdx) => (
                                          <ListItem key={docIdx} p={2} bg={cardBg} border="1px solid" borderColor={borderColor} borderRadius="md">
                                            <HStack justify="space-between">
                                              <Box>
                                                <Text fontWeight="bold" fontSize="xs" color={textColor}>{doc.name}</Text>
                                                <Text fontSize="10px" color="gray.500" mt={0.5}>{doc.department}</Text>
                                              </Box>
                                              <Badge colorScheme="blue" px={1.5} py={0.5} borderRadius="md" fontSize="9px">
                                                {doc.time}
                                              </Badge>
                                            </HStack>
                                          </ListItem>
                                        ))}
                                      </List>
                                    ) : (
                                      <Text fontSize="10px" color="gray.500" py={1}>
                                        No visiting duty schedule recorded for this day. Please refer to standard roster.
                                      </Text>
                                    )}
                                  </AccordionPanel>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                        )}
                      </Box>
                    </TabPanel>

                    {/* Tab 4: Facilities & Labs */}
                    <TabPanel p={0}>
                      <Stack spacing={4}>
                        {/* Lab Facilities */}
                        <Box>
                          <Heading as="h3" size="xs" color={headingColor} mb={1.5}>
                            Clinical Laboratory Diagnostics
                          </Heading>
                          <Text fontSize="10px" color="gray.500" mb={2.5} fontWeight="medium">
                            Diagnostics sample collection operates under certified technician supervisions.
                          </Text>
                          <Box p={2} mb={3} borderRadius="md" bg="teal.50" color="teal.800" fontSize="10px" fontWeight="bold" borderLeft="4px solid" borderColor="teal.600">
                            Sample Collection Hours: 8:00 AM - 12:00 PM
                          </Box>

                          <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
                            <List spacing={1.5}>
                              {labServicesLeft.map((item, idx) => (
                                <ListItem key={idx} fontSize="11px" color={textColor}>
                                  <ListIcon as={FiCheckCircle} color="teal.600" w={3.5} h={3.5} />
                                  {item}
                                </ListItem>
                              ))}
                            </List>
                            <List spacing={1.5}>
                              {labServicesRight.map((item, idx) => (
                                <ListItem key={idx} fontSize="11px" color={textColor}>
                                  <ListIcon as={FiCheckCircle} color="teal.600" w={3.5} h={3.5} />
                                  {item}
                                </ListItem>
                              ))}
                            </List>
                          </SimpleGrid>
                        </Box>

                        <Divider borderColor={borderColor} />

                        {/* Other Services */}
                        <Box>
                          <Heading as="h3" size="xs" color={headingColor} mb={2.5}>
                            General Facilities & Clinical Services
                          </Heading>
                          <SimpleGrid columns={{ base: 2, sm: 2 }} gap={2}>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">AMBULANCE SERVICES</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>24/7 BLS & ALS Emergency Ambulance Dispatch</Text>
                            </Box>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">RADIOLOGY</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>Digital Chest/Orthopedic X-Ray Examinations</Text>
                            </Box>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">TREADMILL DIAGNOSTIC</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>Treadmed diagnostic monitoring (TMT)</Text>
                            </Box>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">CARDIAC MONITORING</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>Electrocardiogram (ECG) reporting</Text>
                            </Box>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">PULMONARY</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>Spirometry breathing efficiency checks</Text>
                            </Box>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">DENTISTRY</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>Dental clinical suites & Dental X-Ray scans</Text>
                            </Box>
                            <Box p={2} borderRadius="md" border="1px solid" borderColor={borderColor} gridColumn={{ sm: '1 / span 2' }}>
                              <Text fontWeight="bold" fontSize="10px" color="teal.600">PHYSIOTHERAPY</Text>
                              <Text fontSize="9px" color="gray.500" mt={0.5}>Daily clinic hours: 9:00 AM - 1:00 PM & 4:00 PM - 7:00 PM</Text>
                            </Box>
                          </SimpleGrid>
                        </Box>
                      </Stack>
                    </TabPanel>

                  </TabPanels>
                </Tabs>

              </CardBody>
            </Card>
          </GridItem>

          {/* Right Column: Book Appointment Card - redesigned to be highly compact */}
          <GridItem>
            <Box position={{ lg: 'sticky' }} top={{ lg: '16px' }}>
              <Flex
                bg={cardBg}
                p={{ base: 4, md: 5 }}
                borderRadius="xl"
                boxShadow="md"
                w="100%"
                direction="column"
                justify="space-between"
                transition="all 0.3s ease"
                border="1px solid"
                borderColor={borderColor}
                _hover={{ transform: 'translateY(-3px)', boxShadow: 'lg' }}
              >
                <Box>
                  <Flex align="center" justify="center" bg="teal.600" w={12} h={12} borderRadius="xl" color="white" mb={4} mx="auto">
                    <Icon as={FiCalendar} w={6} h={6} />
                  </Flex>
                  
                  <Heading as="h3" size="md" mb={2} color={headingColor} textAlign="center">
                    Book an Appointment
                  </Heading>
                  
                  <Text color={textColor} mb={4} fontSize="xs" lineHeight="tall" textAlign="center">
                    Registered campus patients (students, staff, faculty, dependants) can book medical consultations using their unique Institute ID or PSRN No.
                  </Text>
                  
                  <Box p={3} borderRadius="lg" bg={infoBg} mb={4}>
                    <Heading as="h4" size="xs" color={textColor} mb={1.5}>Instructions:</Heading>
                    <List spacing={1.5}>
                      <ListItem fontSize="11px" color={subTextColor}>
                        <ListIcon as={FiArrowRight} color="teal.600" />
                        Enter your ID and request verification.
                      </ListItem>
                      <ListItem fontSize="11px" color={subTextColor}>
                        <ListIcon as={FiArrowRight} color="teal.600" />
                        Complete OTP verification sent to your registered email ID.
                      </ListItem>
                      <ListItem fontSize="11px" color={subTextColor}>
                        <ListIcon as={FiArrowRight} color="teal.600" />
                        Pick a department, doctor, and slot to finish booking an appointment.
                      </ListItem>
                    </List>
                  </Box>

                  <Box p={2.5} border="1px dashed" borderColor="orange.300" bg={noteBg} borderRadius="md" mb={4}>
                    <Text fontSize="11px" color={noteTextColor} fontWeight="semibold">
                      Note: If you are not registered in the clinical registry, please visit the Reception Desk first for your initial registration.
                    </Text>
                  </Box>
                </Box>

                <Button
                  size="md"
                  colorScheme="teal"
                  w="100%"
                  borderRadius="lg"
                  shadow="sm"
                  onClick={() => navigate('/portal/book-appointment')}
                  _hover={{ bg: 'teal.600', shadow: 'md' }}
                >
                  Login to Patient Portal
                </Button>

                <Button
                  mt={3}
                  variant="ghost"
                  colorScheme="gray"
                  onClick={() => navigate('/login')}
                  size="xs"
                  w="100%"
                  _hover={{ bg: loginHoverBg }}
                >
                  Clinic Staff Login
                </Button>
              </Flex>
            </Box>
          </GridItem>

        </Grid>
      </VStack>
    </Flex>
  );
};

export default PatientPortal;
