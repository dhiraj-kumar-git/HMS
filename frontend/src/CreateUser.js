import React, { useState } from "react";
import {
  Box,
  Button,
  Input,
  Stack,
  Heading,
  FormControl,
  FormLabel,
  Select,
  useToast,
  CheckboxGroup,
  Checkbox,
  HStack,
  Text,
  Divider,
  IconButton,
  Flex,
  InputGroup,
  InputLeftAddon
} from "@chakra-ui/react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import axios from "axios";
import BASE_URL from './Config';

const DEFAULT_SCHEDULE = { 
  duty_days: [], 
  start_hr: "09", start_min: "00", start_ampm: "AM", 
  end_hr: "05", end_min: "00", end_ampm: "PM" 
};

export default function CreateUser() {
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "",
    display_name: "",
    department: "",
    schedule: [{ ...DEFAULT_SCHEDULE }]
  });
  const toast = useToast();

  const hashPassword = async (password) => {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleAddUser = async () => {
    const { username, password, role, display_name, department, schedule } = newUser;

    const cleanName = display_name.trim();

    if (!cleanName) {
      return toast({
        title: role === "doctor" ? "Doctor Name required" : "Display Name required",
        description:
          role === "doctor"
            ? "Please enter doctor's name (Dr. is added automatically)"
            : "Please enter display name",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
    }

    if (
      !username ||
      !password ||
      !role ||
      (role === "doctor" && !department)
    ) {
      return toast({
        title: "All fields are required!",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
    }

    let finalSchedule = [];

    if (role === "doctor") {
      const isValidSchedule = schedule.every(
        s => s.duty_days.length > 0 && s.start_hr && s.end_hr
      );

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

      const hasTimeError = schedule.some(s => {
        const startMins = convertToMins(s.start_hr, s.start_min, s.start_ampm);
        const endMins = convertToMins(s.end_hr, s.end_min, s.end_ampm);
        return startMins >= endMins;
      });

      if (hasTimeError) {
        return toast({
          title: "Invalid Shift Timing",
          description: "End time must be strictly after Start time.",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }

      finalSchedule = schedule.map(s => ({
        duty_days: s.duty_days,
        start_time: `${s.start_hr}:${s.start_min} ${s.start_ampm}`,
        end_time: `${s.end_hr}:${s.end_min} ${s.end_ampm}`
      }));
    }

    try {
      const token = localStorage.getItem("token");
      const hashedPassword = await hashPassword(newUser.password);

      const finalDisplayName =
        role === "doctor"
          ? `Dr. ${cleanName}`
          : cleanName;

      await axios.post(`${BASE_URL}/create_user`, {
        ...newUser,
        display_name: finalDisplayName,
        password: hashedPassword,
        schedule: finalSchedule
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({
        title: "User created successfully!",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      setNewUser({
        username: "",
        password: "",
        role: "",
        display_name: "",
        department: "",
        schedule: [{ ...DEFAULT_SCHEDULE }]
      });

    } catch (error) {
      toast({
        title: "Error adding user",
        description: error.response?.data?.message || error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <Box bg="white" p="8" borderRadius="lg" boxShadow="md" maxW="600px" w="full" mx="auto">
      <Heading size="lg" mb="6" color="brand.700">
        Create User
      </Heading>

      <Stack spacing="5">
        <FormControl>
          <FormLabel>Role</FormLabel>
          <Select
            size="lg"
            placeholder="Select role"
            value={newUser.role}
            onChange={(e) =>
              setNewUser({ ...newUser, role: e.target.value })
            }
          >
            <option value="receptionist">Receptionist</option>
            <option value="doctor">Doctor</option>
            <option value="medical_store">Medical Store</option>
            <option value="lab_staff">Lab Staff</option>
          </Select>
        </FormControl>

        <FormControl>
          <FormLabel>
            {newUser.role === "doctor" ? "Doctor Name" : "Display Name"}
          </FormLabel>

          {newUser.role === "doctor" ? (
            <InputGroup size="lg">
              <InputLeftAddon
                children="Dr."
                borderRight="0"
                borderColor="gray.300"
                borderRadius="md"
              />
              <Input
                placeholder="Enter Doctor Name"
                value={newUser.display_name}
                onChange={(e) =>
                  setNewUser({ ...newUser, display_name: e.target.value })
                }
                borderLeftRadius="0"
              />
            </InputGroup>
          ) : (
            <Input
              size="lg"
              placeholder="Enter Display Name"
              value={newUser.display_name}
              onChange={(e) =>
                setNewUser({ ...newUser, display_name: e.target.value })
              }
            />
          )}
        </FormControl>

        {newUser.role === "doctor" && (
          <Stack spacing="5" bg="gray.50" p="4" borderRadius="md" border="1px solid" borderColor="gray.200">
            <FormControl>
              <FormLabel>Department Name</FormLabel>
              <Select
                size="lg"
                placeholder="Select department"
                value={newUser.department}
                onChange={(e) =>
                  setNewUser({ ...newUser, department: e.target.value })
                }
              >
              <option value="Ayurvedic">Ayurvedic</option>
              <option value="Dentist">Dentist</option>
              <option value="Dermatologist">Dermatologist</option>
              <option value="ENT">ENT</option>
              <option value="Gynaecology">Gynaecology</option>
              <option value="Homeopathic">Homeopathic</option>
              <option value="Orthopaedics">Orthopaedics</option>
              <option value="Paediatrician">Paediatrician</option>
              </Select>
            </FormControl>

            <Divider borderColor="gray.300" />
            <Flex justify="space-between" align="center">
              <Text fontWeight="bold" color="blue.700">Doctor Shifts</Text>
              <Button size="sm" colorScheme="blue" leftIcon={<FiPlus />} onClick={() => setNewUser(prev => ({ ...prev, schedule: [...prev.schedule, { ...DEFAULT_SCHEDULE }] }))}>
                Add Shift
              </Button>
            </Flex>

            {newUser.schedule.map((shift, idx) => (
              <Box key={idx} p="3" border="1px dashed" borderColor="gray.300" borderRadius="md">
                <Flex justify="space-between" align="center" mb="3">
                  <Text fontSize="sm" fontWeight="semibold" color="gray.600">Shift {idx + 1}</Text>
                  {newUser.schedule.length > 1 && (
                    <IconButton size="xs" colorScheme="red" icon={<FiTrash2 />} onClick={() => {
                        const updated = [...newUser.schedule];
                        updated.splice(idx, 1);
                        setNewUser(prev => ({ ...prev, schedule: updated }));
                    }} />
                  )}
                </Flex>

                <Box mb="3">
                  <Text fontSize="sm" fontWeight="medium" mb="2">
                    Duty Days
                  </Text>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                      <label
                        key={day}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{
                            marginRight: "6px",
                            cursor: "pointer",
                            width: "16px",
                            height: "16px",
                          }}
                          checked={shift.duty_days.includes(day)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setNewUser((prev) => {
                              const updated = [...prev.schedule];
                              const currentDays = updated[idx].duty_days || [];

                              updated[idx] = {
                                ...updated[idx],
                                duty_days: isChecked
                                  ? [...currentDays, day] // Add day if checked
                                  : currentDays.filter((d) => d !== day), // Remove day if unchecked
                              };

                              return { ...prev, schedule: updated };
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
                        setNewUser(prev => {
                          const updated = [...prev.schedule];
                          updated[idx] = { ...updated[idx], start_hr: e.target.value };
                          return { ...prev, schedule: updated };
                        });
                      }}>
                        {[...Array(12).keys()].map(i => {
                          const val = String(i + 1).padStart(2, '0');
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </Select>
                      <Select size="sm" w="70px" value={shift.start_min} onChange={(e) => {
                        setNewUser(prev => {
                          const updated = [...prev.schedule];
                          updated[idx] = { ...updated[idx], start_min: e.target.value };
                          return { ...prev, schedule: updated };
                        });
                      }}>
                        {["00", "15", "30", "45"].map(min => (
                          <option key={min} value={min}>{min}</option>
                        ))}
                      </Select>
                      <Select size="sm" w="70px" value={shift.start_ampm} onChange={(e) => {
                        setNewUser(prev => {
                          const updated = [...prev.schedule];
                          updated[idx] = { ...updated[idx], start_ampm: e.target.value };
                          return { ...prev, schedule: updated };
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
                        setNewUser(prev => {
                          const updated = [...prev.schedule];
                          updated[idx] = { ...updated[idx], end_hr: e.target.value };
                          return { ...prev, schedule: updated };
                        });
                      }}>
                        {[...Array(12).keys()].map(i => {
                          const val = String(i + 1).padStart(2, '0');
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </Select>
                      <Select size="sm" w="70px" value={shift.end_min} onChange={(e) => {
                        setNewUser(prev => {
                          const updated = [...prev.schedule];
                          updated[idx] = { ...updated[idx], end_min: e.target.value };
                          return { ...prev, schedule: updated };
                        });
                      }}>
                        {["00", "15", "30", "45"].map(min => (
                          <option key={min} value={min}>{min}</option>
                        ))}
                      </Select>
                      <Select size="sm" w="70px" value={shift.end_ampm} onChange={(e) => {
                        setNewUser(prev => {
                          const updated = [...prev.schedule];
                          updated[idx] = { ...updated[idx], end_ampm: e.target.value };
                          return { ...prev, schedule: updated };
                        });
                      }}>
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </Select>
                    </Flex>
                  </FormControl>
                </Flex>
              </Box>
            ))}
          </Stack>
        )}

        <FormControl>
          <FormLabel>Username</FormLabel>
          <Input
            size="lg"
            placeholder="Enter username"
            value={newUser.username}
            onChange={(e) =>
              setNewUser({ ...newUser, username: e.target.value })
            }
          />
        </FormControl>

        <FormControl>
          <FormLabel>Password</FormLabel>
          <Input
            size="lg"
            type="password"
            placeholder="Enter password"
            value={newUser.password}
            onChange={(e) =>
              setNewUser({ ...newUser, password: e.target.value })
            }
          />
        </FormControl>

        <Button
          size="lg"
          colorScheme="brand"
          onClick={handleAddUser}
          _hover={{ transform: "scale(1.02)" }}
          transition="all 0.2s"
        >
          Add User
        </Button>
      </Stack>
    </Box>
  );
}
