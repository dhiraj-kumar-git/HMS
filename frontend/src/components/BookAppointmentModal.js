import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Select,
  Input,
  useToast,
  VStack,
  Text,
} from '@chakra-ui/react';
import axios from 'axios';
import BASE_URL from '../utils/Config';
import { getDateISTString, getWeekdayIST } from '../utils/utils';

export default function BookAppointmentModal({ isOpen, onClose, patient, onSuccess }) {
  const [doctors, setDoctors] = useState([]);
  const [doctorUsername, setDoctorUsername] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTimeSlot, setAppointmentTimeSlot] = useState('');
  const [fullSlots, setFullSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchDoctors();
      setDoctorUsername('');
      setAppointmentDate('');
      setAppointmentTimeSlot('');
      setFullSlots([]);
      setShowWarning(false);
      setWarningText('');
    }
  }, [isOpen]);

  const fetchDoctors = async () => {
    try {
      const token = localStorage.getItem('token');
      // Use the public endpoint which contains the 'schedule' field
      const res = await axios.get(`${BASE_URL}/api/public/doctors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDoctors(res.data);
    } catch (err) {
      console.error('Error fetching doctors:', err);
    }
  };

  const fetchFullSlots = async (docUsername, dateStr) => {
    if (!docUsername || !dateStr) {
      setFullSlots([]);
      return;
    }
    try {
      const res = await axios.get(`${BASE_URL}/api/public/doctor-availability/${docUsername}?date=${dateStr}`);
      setFullSlots(res.data.full_slots || []);
    } catch (error) {
      console.error('Error fetching full slots', error);
      setFullSlots([]);
    }
  };

  useEffect(() => {
    fetchFullSlots(doctorUsername, appointmentDate);
  }, [doctorUsername, appointmentDate]);

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
      current.setMinutes(current.getMinutes() + 10);
    }
    return slots;
  };

  let availableTimeSlots = [];
  if (doctorUsername && appointmentDate) {
    const doc = doctors.find(d => d.username === doctorUsername);
    const [year, month, day] = appointmentDate.split('-');
    const dateObj = new Date(year, month - 1, day);
    const dayName = getWeekdayIST(dateObj);
    const shift = doc?.schedule?.find(s => s.duty_days.includes(dayName));

    if (shift) {
      const parsedStart = parseShiftTime(shift.start_time);
      const parsedEnd = parseShiftTime(shift.end_time);
      availableTimeSlots = generateTimeSlots(parsedStart, parsedEnd);
    } else {
      availableTimeSlots = generateTimeSlots("09:00", "17:00");
    }
  }

  const [showWarning, setShowWarning] = useState(false);
  const [warningText, setWarningText] = useState('');

  const handleBook = async (force = false) => {
    if (!doctorUsername || !appointmentDate || !appointmentTimeSlot) {
      toast({ title: 'Please fill all fields', status: 'warning' });
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const formattedTime = `${appointmentDate}T${appointmentTimeSlot}`;
      
      await axios.post(`${BASE_URL}/api/receptionist/book-appointment`, {
        institute_id: patient.institute_id,
        doctor_username: doctorUsername,
        time: formattedTime,
        force: force === true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast({ title: 'Appointment Booked Successfully', status: 'success' });
      onSuccess();
      onClose();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.requires_confirmation && !force) {
        setWarningText(err.response.data.warning);
        setShowWarning(true);
      } else {
        toast({
          title: 'Booking failed',
          description: err.response?.data?.error || err.message,
          status: 'error',
          duration: 4000,
          isClosable: true
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Book Appointment for {patient?.name}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {showWarning ? (
            <VStack spacing={4} align="stretch">
              <Text color="orange.600" fontWeight="bold">Booking Warning</Text>
              <Text>{warningText}</Text>
            </VStack>
          ) : (
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Select Doctor</FormLabel>
                <Select placeholder="Select doctor" value={doctorUsername} onChange={e => setDoctorUsername(e.target.value)}>
                  {doctors.map(doc => (
                    <option key={doc.username} value={doc.username}>
                      {doc.display_name || doc.username} {doc.department ? `(${doc.department})` : ''}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Appointment Date</FormLabel>
                <Input
                  type="date"
                  min={getDateISTString()}
                  value={appointmentDate}
                  onChange={e => setAppointmentDate(e.target.value)}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Appointment Time</FormLabel>
                <Select
                  value={appointmentTimeSlot}
                  onChange={e => setAppointmentTimeSlot(e.target.value)}
                  placeholder="Select Time"
                  isDisabled={!appointmentDate || !doctorUsername}
                >
                  {availableTimeSlots.map((slot, idx) => {
                    const [h, m] = slot.split(':');
                    const hours = parseInt(h);
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    const displayH = hours % 12 || 12;
                    const displayTime = `${displayH}:${m} ${ampm}`;
                    const isFull = fullSlots.includes(slot);
                    return (
                      <option key={idx} value={slot} disabled={isFull} style={isFull ? { color: 'red' } : {}}>
                        {displayTime} {isFull ? '(Full)' : ''}
                      </option>
                    );
                  })}
                </Select>
              </FormControl>
            </VStack>
          )}
        </ModalBody>
        <ModalFooter>
          {showWarning ? (
            <>
              <Button variant="ghost" mr={3} onClick={() => setShowWarning(false)}>Go Back</Button>
              <Button colorScheme="orange" onClick={() => handleBook(true)} isLoading={loading}>Proceed Anyway</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" mr={3} onClick={onClose} isDisabled={loading}>Cancel</Button>
              <Button colorScheme="brand" onClick={() => handleBook(false)} isLoading={loading}>Book</Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
