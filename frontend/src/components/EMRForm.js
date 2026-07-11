import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  FormControl,
  FormLabel,
  Textarea,
  Grid,
  Input,
  Text,
  Flex,
  Badge,
  IconButton,
  Button,
  InputGroup,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel
} from '@chakra-ui/react';
import { FiX, FiPlus } from 'react-icons/fi';

const COMMON_COMPLAINTS = [
  "Fever", "Cough", "Sore Throat", "Runny Nose", "Difficulty Breathing",
  "Stomach Pain", "Loose Motions", "Vomiting", "Acid Reflux", "Nausea",
  "Headache", "Body Ache", "Weakness/Fatigue", "Dizziness/Vertigo", "Chills",
  "Joint/Muscle Pain", "Skin Rash", "Minor Injury/Sprain", "Burning Urination", "Anxiety/Stress"
];

const COMMON_PMH = [
  "Hypertension", "Diabetes Mellitus", "Asthma", "GERD", "Thyroid Disorder", "None"
];

const COMMON_ALLERGIES = [
  "NKDA", "Penicillin", "NSAIDs", "Sulfa Drugs"
];

const COMMON_GENERAL_EXAM = [
  "Conscious & Oriented", "Afebrile", "Febrile", "Hydration Adequate", "No Pallor/Icterus"
];

const COMMON_SYSTEMIC_EXAM = [
  "CVS: S1 S2 Heard", "Chest: B/L Clear", "Abdomen: Soft & Non-tender", "CNS: Intact"
];

const COMMON_DIAGNOSES = [
  "Acute URTI", "Acute Gastroenteritis", "Tension Headache", "Acute Tonsillitis", "Muscle Strain", "Urinary Tract Infection", "Acid Peptic Disease"
];

const COMMON_ADVICE = [
  "Drink plenty of warm fluids", "Rest well", "Avoid cold/spicy food", "Keep hydrated", "Review if symptoms worsen", "Take medications after food"
];

export default function EMRForm({ initialEmrData, onChange, medicineOptions = [], labTestOptions = [], toast }) {
  const [localEmrData, setLocalEmrData] = useState(initialEmrData);
  const [medInput, setMedInput] = useState({ drug: '', dose: '', route: '', frequency: '', duration: '', quantity: '' });
  const [labInput, setLabInput] = useState('');

  const lastPropagatedRef = useRef(initialEmrData);

  // Synchronize local state if initialEmrData changes from parent
  useEffect(() => {
    // Only synchronize if initialEmrData is different from our last debounced/propagated state
    if (JSON.stringify(initialEmrData) !== JSON.stringify(lastPropagatedRef.current)) {
      setLocalEmrData(initialEmrData);
      lastPropagatedRef.current = initialEmrData;
    }
  }, [initialEmrData]);

  // Debounce notification to parent
  useEffect(() => {
    const timer = setTimeout(() => {
      lastPropagatedRef.current = localEmrData;
      onChange(localEmrData);
    }, 200);
    return () => clearTimeout(timer);
  }, [localEmrData, onChange]);

  const handleUpdateEmr = (section, field, value) => {
    setLocalEmrData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const isFieldChipActive = (section, field, item) => {
    const currentText = localEmrData?.[section]?.[field] || '';
    return currentText.toLowerCase().includes(item.toLowerCase());
  };

  const handleToggleFieldChip = (section, field, item, prefix = '') => {
    let currentText = localEmrData?.[section]?.[field] || '';
    const active = isFieldChipActive(section, field, item);

    // Clinical Safety Mutual Exclusion Rules
    if (field === 'allergies') {
      if (item === 'NKDA') {
        if (active) {
          handleUpdateEmr(section, field, '');
        } else {
          handleUpdateEmr(section, field, 'NKDA');
        }
        return;
      } else {
        if (currentText.toLowerCase().includes('nkda')) {
          currentText = currentText.replace(/nkda/i, '').replace(/,\s*,/g, ',').replace(/^,/, '').replace(/,$/, '').trim();
        }
      }
    }

    if (field === 'past_medical_history') {
      if (item === 'None') {
        if (active) {
          handleUpdateEmr(section, field, '');
        } else {
          handleUpdateEmr(section, field, 'None');
        }
        return;
      } else {
        if (currentText.toLowerCase().includes('none')) {
          currentText = currentText.replace(/none/i, '').replace(/,\s*,/g, ',').replace(/^,/, '').replace(/,$/, '').trim();
        }
      }
    }

    if (field === 'general_examination') {
      if (item === 'Afebrile' && !active) {
        currentText = currentText.replace(/febrile/i, '').replace(/,\s*,/g, ',').replace(/^,/, '').replace(/,$/, '').trim();
      } else if (item === 'Febrile' && !active) {
        currentText = currentText.replace(/afebrile/i, '').replace(/,\s*,/g, ',').replace(/^,/, '').replace(/,$/, '').trim();
      }
    }

    let newText = '';
    if (active) {
      const idx = currentText.toLowerCase().indexOf(item.toLowerCase());
      if (idx !== -1) {
        newText = currentText.substring(0, idx) + currentText.substring(idx + item.length);
      } else {
        newText = currentText;
      }

      newText = newText.replace(/,\s*,/g, ',');
      newText = newText.replace(/,\s*$/, '');
      newText = newText.replace(/^\s*,\s*/, '');

      if (prefix) {
        const cleanPrefixRegex = new RegExp(`^${prefix}\\s*,?\\s*`, 'i');
        newText = newText.replace(cleanPrefixRegex, `${prefix} `);

        const prefixCommaRegex = new RegExp(`^${prefix}\\s*,\\s*`, 'i');
        newText = newText.replace(prefixCommaRegex, `${prefix} `);

        if (newText.toLowerCase().trim() === prefix.toLowerCase().trim()) {
          newText = '';
        }
      }

      newText = newText.trim();
    } else {
      if (!currentText || currentText.trim() === '' || (prefix && currentText.toLowerCase().trim() === prefix.toLowerCase().trim())) {
        newText = prefix ? `${prefix} ${item}` : item;
      } else {
        if (prefix && !currentText.toLowerCase().startsWith(prefix.toLowerCase())) {
          currentText = `${prefix} ${currentText}`;
        }
        newText = `${currentText.trim()}, ${item}`;
      }
    }

    handleUpdateEmr(section, field, newText);
  };

  const handleUpdateVitals = (field, value) => {
    setLocalEmrData(prev => ({
      ...prev,
      objective: {
        ...prev.objective,
        vitals: {
          ...prev.objective.vitals,
          [field]: value
        }
      }
    }));
  };

  const handleAddMedication = () => {
    if (!medInput.drug) return;

    const medications = localEmrData.plan?.medications || [];
    const isDuplicate = medications.some(
      m => m.drug.toLowerCase().trim() === medInput.drug.toLowerCase().trim()
    );

    if (isDuplicate) {
      if (toast) {
        toast({
          title: "Medication already added",
          description: "You have already added this medication.",
          status: "warning",
          duration: 3000,
          isClosable: true
        });
      }
      return;
    }

    setLocalEmrData(prev => ({
      ...prev,
      plan: {
        ...prev.plan,
        medications: [...(prev.plan?.medications || []), medInput]
      }
    }));
    setMedInput({ drug: '', dose: '', route: '', frequency: '', duration: '', quantity: '' });
  };

  const handleRemoveMedication = (idx) => {
    setLocalEmrData(prev => {
      const newMeds = [...(prev.plan?.medications || [])];
      newMeds.splice(idx, 1);
      return { ...prev, plan: { ...prev.plan, medications: newMeds } };
    });
  };

  const handleAddInvestigation = () => {
    if (!labInput) return;

    const investigations = localEmrData.plan?.investigations || [];
    const isDuplicate = investigations.some(
      t => t.toLowerCase().trim() === labInput.toLowerCase().trim()
    );

    if (isDuplicate) {
      if (toast) {
        toast({
          title: "Lab test already added",
          description: "You have already added this lab test.",
          status: "warning",
          duration: 3000,
          isClosable: true
        });
      }
      return;
    }

    setLocalEmrData(prev => ({
      ...prev,
      plan: {
        ...prev.plan,
        investigations: [...(prev.plan?.investigations || []), labInput]
      }
    }));
    setLabInput('');
  };

  const handleRemoveInvestigation = (idx) => {
    setLocalEmrData(prev => {
      const newLabs = [...(prev.plan?.investigations || [])];
      newLabs.splice(idx, 1);
      return { ...prev, plan: { ...prev.plan, investigations: newLabs } };
    });
  };

  const emrData = localEmrData || {
    subjective: { chief_complaints: '', history_of_present_illness: '', past_medical_history: '', allergies: '' },
    objective: {
      vitals: { blood_pressure: '', pulse: '', temperature: '', weight: '', height: '', spO2: '', respiratory_rate: '' },
      general_examination: '', systemic_examination: '', local_examination: ''
    },
    assessment: { provisional_diagnosis: '', final_diagnosis: '' },
    plan: { medications: [], investigations: [], advice: '', follow_up_date: '' }
  };

  const subjective = emrData.subjective || {};
  const objective = emrData.objective || {};
  const vitals = objective.vitals || {};
  const assessment = emrData.assessment || {};
  const plan = emrData.plan || {};

  return (
    <Accordion allowMultiple defaultIndex={[0, 1, 2, 3]}>
      {/* Subjective */}
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left" fontWeight="bold">Subjective (Symptoms & History)</Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <VStack align="stretch" spacing={3}>
            <FormControl isRequired>
              <FormLabel fontSize="xs">Chief Complaints</FormLabel>
              <Text fontSize="2xs" color="gray.500" mb={1.5}>Common complaints (click to toggle):</Text>
              <Flex wrap="wrap" gap={1.5} mb={3}>
                {COMMON_COMPLAINTS.map((symptom, i) => {
                  const active = isFieldChipActive('subjective', 'chief_complaints', symptom);
                  return (
                    <Box
                      key={i}
                      as="button"
                      type="button"
                      px={2.5}
                      py={1}
                      borderRadius="full"
                      fontSize="2xs"
                      fontWeight="semibold"
                      bg={active ? "green.500" : "gray.100"}
                      color={active ? "white" : "gray.700"}
                      border="1px solid"
                      borderColor={active ? "green.600" : "gray.200"}
                      _hover={{ bg: active ? "green.600" : "gray.200" }}
                      transition="all 0.15s ease"
                      onClick={() => handleToggleFieldChip('subjective', 'chief_complaints', symptom, 'C/O')}
                    >
                      {symptom}
                    </Box>
                  );
                })}
              </Flex>
              <Textarea size="sm" value={subjective.chief_complaints || ''} onChange={(e) => handleUpdateEmr('subjective', 'chief_complaints', e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">History of Present Illness</FormLabel>
              <Textarea size="sm" value={subjective.history_of_present_illness || ''} onChange={(e) => handleUpdateEmr('subjective', 'history_of_present_illness', e.target.value)} />
            </FormControl>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
              <FormControl>
                <FormLabel fontSize="xs">Past Medical History</FormLabel>
                <Flex wrap="wrap" gap={1.5} mb={2}>
                  {COMMON_PMH.map((pmh, i) => {
                    const active = isFieldChipActive('subjective', 'past_medical_history', pmh);
                    return (
                      <Box
                        key={i}
                        as="button"
                        type="button"
                        px={2}
                        py={0.5}
                        borderRadius="full"
                        fontSize="2xs"
                        fontWeight="semibold"
                        bg={active ? "green.500" : "gray.100"}
                        color={active ? "white" : "gray.700"}
                        border="1px solid"
                        borderColor={active ? "green.600" : "gray.200"}
                        _hover={{ bg: active ? "green.600" : "gray.200" }}
                        transition="all 0.15s ease"
                        onClick={() => handleToggleFieldChip('subjective', 'past_medical_history', pmh)}
                      >
                        {pmh}
                      </Box>
                    );
                  })}
                </Flex>
                <Textarea size="sm" value={subjective.past_medical_history || ''} onChange={(e) => handleUpdateEmr('subjective', 'past_medical_history', e.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs">Allergies</FormLabel>
                <Flex wrap="wrap" gap={1.5} mb={2}>
                  {COMMON_ALLERGIES.map((allergy, i) => {
                    const active = isFieldChipActive('subjective', 'allergies', allergy);
                    return (
                      <Box
                        key={i}
                        as="button"
                        type="button"
                        px={2}
                        py={0.5}
                        borderRadius="full"
                        fontSize="2xs"
                        fontWeight="semibold"
                        bg={active ? "green.500" : "gray.100"}
                        color={active ? "white" : "gray.700"}
                        border="1px solid"
                        borderColor={active ? "green.600" : "gray.200"}
                        _hover={{ bg: active ? "green.600" : "gray.200" }}
                        transition="all 0.15s ease"
                        onClick={() => handleToggleFieldChip('subjective', 'allergies', allergy)}
                      >
                        {allergy}
                      </Box>
                    );
                  })}
                </Flex>
                <Textarea size="sm" value={subjective.allergies || ''} onChange={(e) => handleUpdateEmr('subjective', 'allergies', e.target.value)} />
              </FormControl>
            </Grid>
          </VStack>
        </AccordionPanel>
      </AccordionItem>

      {/* Objective */}
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left" fontWeight="bold">Objective (Vitals & Exam)</Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <VStack align="stretch" spacing={4}>
            <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="bold" mb={3}>Vitals</Text>
              <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={3}>
                <FormControl><FormLabel fontSize="xs">BP (mmHg)</FormLabel><Input size="sm" value={vitals.blood_pressure || ''} onChange={(e) => handleUpdateVitals('blood_pressure', e.target.value)} /></FormControl>
                <FormControl><FormLabel fontSize="xs">Pulse (bpm)</FormLabel><Input size="sm" value={vitals.pulse || ''} onChange={(e) => handleUpdateVitals('pulse', e.target.value)} /></FormControl>
                <FormControl><FormLabel fontSize="xs">Temp (°F/°C)</FormLabel><Input size="sm" value={vitals.temperature || ''} onChange={(e) => handleUpdateVitals('temperature', e.target.value)} /></FormControl>
                <FormControl><FormLabel fontSize="xs">SpO2 (%)</FormLabel><Input size="sm" value={vitals.spO2 || ''} onChange={(e) => handleUpdateVitals('spO2', e.target.value)} /></FormControl>
                <FormControl><FormLabel fontSize="xs">Weight (kg)</FormLabel><Input size="sm" value={vitals.weight || ''} onChange={(e) => handleUpdateVitals('weight', e.target.value)} /></FormControl>
                <FormControl><FormLabel fontSize="xs">Height (cm)</FormLabel><Input size="sm" value={vitals.height || ''} onChange={(e) => handleUpdateVitals('height', e.target.value)} /></FormControl>
                <FormControl><FormLabel fontSize="xs">Resp. Rate (/min)</FormLabel><Input size="sm" value={vitals.respiratory_rate || ''} onChange={(e) => handleUpdateVitals('respiratory_rate', e.target.value)} /></FormControl>
              </Grid>
            </Box>
            <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="bold" mb={3}>Examinations</Text>
              <VStack align="stretch" spacing={3}>
                <FormControl>
                  <FormLabel fontSize="xs">General Examination</FormLabel>
                  <Flex wrap="wrap" gap={1.5} mb={2}>
                    {COMMON_GENERAL_EXAM.map((exam, i) => {
                      const active = isFieldChipActive('objective', 'general_examination', exam);
                      return (
                        <Box
                          key={i}
                          as="button"
                          type="button"
                          px={2}
                          py={0.5}
                          borderRadius="full"
                          fontSize="2xs"
                          fontWeight="semibold"
                          bg={active ? "green.500" : "gray.100"}
                          color={active ? "white" : "gray.700"}
                          border="1px solid"
                          borderColor={active ? "green.600" : "gray.200"}
                          _hover={{ bg: active ? "green.600" : "gray.200" }}
                          transition="all 0.15s ease"
                          onClick={() => handleToggleFieldChip('objective', 'general_examination', exam)}
                        >
                          {exam}
                        </Box>
                      );
                    })}
                  </Flex>
                  <Textarea size="sm" value={objective.general_examination || ''} onChange={(e) => handleUpdateEmr('objective', 'general_examination', e.target.value)} />
                </FormControl>
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
                  <FormControl>
                    <FormLabel fontSize="xs">Systemic Examination</FormLabel>
                    <Flex wrap="wrap" gap={1.5} mb={2}>
                      {COMMON_SYSTEMIC_EXAM.map((exam, i) => {
                        const active = isFieldChipActive('objective', 'systemic_examination', exam);
                        return (
                          <Box
                            key={i}
                            as="button"
                            type="button"
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            fontSize="2xs"
                            fontWeight="semibold"
                            bg={active ? "green.500" : "gray.100"}
                            color={active ? "white" : "gray.700"}
                            border="1px solid"
                            borderColor={active ? "green.600" : "gray.200"}
                            _hover={{ bg: active ? "green.600" : "gray.200" }}
                            transition="all 0.15s ease"
                            onClick={() => handleToggleFieldChip('objective', 'systemic_examination', exam)}
                          >
                            {exam}
                          </Box>
                        );
                      })}
                    </Flex>
                    <Textarea size="sm" value={objective.systemic_examination || ''} onChange={(e) => handleUpdateEmr('objective', 'systemic_examination', e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="xs">Local Examination</FormLabel>
                    <Textarea size="sm" value={objective.local_examination || ''} onChange={(e) => handleUpdateEmr('objective', 'local_examination', e.target.value)} />
                  </FormControl>
                </Grid>
              </VStack>
            </Box>
          </VStack>
        </AccordionPanel>
      </AccordionItem>

      {/* Assessment */}
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left" fontWeight="bold">Assessment (Diagnosis)</Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <FormControl isRequired>
            <FormLabel fontSize="xs">Provisional Diagnosis</FormLabel>
            <Flex wrap="wrap" gap={1.5} mb={2}>
              {COMMON_DIAGNOSES.map((diag, i) => {
                const active = isFieldChipActive('assessment', 'provisional_diagnosis', diag);
                return (
                  <Box
                    key={i}
                    as="button"
                    type="button"
                    px={2}
                    py={0.5}
                    borderRadius="full"
                    fontSize="2xs"
                    fontWeight="semibold"
                    bg={active ? "green.500" : "gray.100"}
                    color={active ? "white" : "gray.700"}
                    border="1px solid"
                    borderColor={active ? "green.600" : "gray.200"}
                    _hover={{ bg: active ? "green.600" : "gray.200" }}
                    transition="all 0.15s ease"
                    onClick={() => handleToggleFieldChip('assessment', 'provisional_diagnosis', diag)}
                  >
                    {diag}
                  </Box>
                );
              })}
            </Flex>
            <Textarea size="sm" value={assessment.provisional_diagnosis || ''} onChange={(e) => handleUpdateEmr('assessment', 'provisional_diagnosis', e.target.value)} />
          </FormControl>
        </AccordionPanel>
      </AccordionItem>

      {/* Plan */}
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left" fontWeight="bold">Plan (Medications, Labs, Advice)</Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <VStack align="stretch" spacing={6}>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
              {/* Advice */}
              <FormControl>
                <FormLabel fontSize="xs">Advice / General Instructions</FormLabel>
                <Flex wrap="wrap" gap={1.5} mb={2}>
                  {COMMON_ADVICE.map((adv, i) => {
                    const active = isFieldChipActive('plan', 'advice', adv);
                    return (
                      <Box
                        key={i}
                        as="button"
                        type="button"
                        px={2}
                        py={0.5}
                        borderRadius="full"
                        fontSize="2xs"
                        fontWeight="semibold"
                        bg={active ? "green.500" : "gray.100"}
                        color={active ? "white" : "gray.700"}
                        border="1px solid"
                        borderColor={active ? "green.600" : "gray.200"}
                        _hover={{ bg: active ? "green.600" : "gray.200" }}
                        transition="all 0.15s ease"
                        onClick={() => handleToggleFieldChip('plan', 'advice', adv)}
                      >
                        {adv}
                      </Box>
                    );
                  })}
                </Flex>
                <Textarea size="sm" value={plan.advice || ''} onChange={(e) => handleUpdateEmr('plan', 'advice', e.target.value)} />
              </FormControl>

              {/* Follow Up */}
              <FormControl>
                <FormLabel fontSize="xs">Follow-up Date</FormLabel>
                <Input type="date" size="sm" value={plan.follow_up_date || ''} onChange={(e) => handleUpdateEmr('plan', 'follow_up_date', e.target.value)} />
              </FormControl>
            </Grid>

            {/* Medications */}
            <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="bold" mb={2}>Medications</Text>

              {/* Existing Meds */}
              {(plan.medications || []).length > 0 && (
                <Flex wrap="wrap" gap={3} mb={4}>
                  {(plan.medications || []).map((m, idx) => (
                    <Flex key={idx} justify="space-between" align="center" bg="gray.50" p={2} borderRadius="md" border="1px solid" borderColor="green.100" minW="max-content">
                      <Box mr={3}>
                        <Text fontSize="xs" fontWeight="bold">{m.drug} <Badge colorScheme="gray">{m.quantity || 'N/A'}</Badge></Text>
                        <Text fontSize="2xs" color="gray.500">{m.dose || 'N/A'} | {m.route || 'N/A'} | {m.frequency || 'N/A'} | {m.duration || 'N/A'}</Text>
                      </Box>
                      <IconButton size="xs" variant="ghost" colorScheme="red" icon={<FiX />} onClick={() => handleRemoveMedication(idx)} aria-label="Remove" />
                    </Flex>
                  ))}
                </Flex>
              )}

              {/* Add Med Form */}
              <VStack align="stretch" spacing={3}>
                <Grid templateColumns="2fr 1fr 1fr 1fr 1fr 1fr" gap={2}>
                  <FormControl>
                    <FormLabel fontSize="xs">Drug Name</FormLabel>
                    <InputGroup size="sm">
                      <Input list="med-options" value={medInput.drug} onChange={(e) => setMedInput({ ...medInput, drug: e.target.value })} placeholder="Select or type..." />
                      <datalist id="med-options">
                        {medicineOptions
                          .filter(opt => !(plan.medications || []).some(m => m.drug.toLowerCase().trim() === opt.item_name.toLowerCase().trim()))
                          .map((opt, i) => <option key={i} value={opt.item_name} />)}
                      </datalist>
                    </InputGroup>
                  </FormControl>
                  <FormControl><FormLabel fontSize="xs">Dose</FormLabel><Input size="sm" value={medInput.dose} onChange={(e) => setMedInput({ ...medInput, dose: e.target.value })} /></FormControl>
                  <FormControl><FormLabel fontSize="xs">Route</FormLabel><Input size="sm" value={medInput.route} onChange={(e) => setMedInput({ ...medInput, route: e.target.value })} /></FormControl>
                  <FormControl><FormLabel fontSize="xs">Freq</FormLabel><Input size="sm" value={medInput.frequency} onChange={(e) => setMedInput({ ...medInput, frequency: e.target.value })} /></FormControl>
                  <FormControl><FormLabel fontSize="xs">Duration</FormLabel><Input size="sm" value={medInput.duration} onChange={(e) => setMedInput({ ...medInput, duration: e.target.value })} /></FormControl>
                  <FormControl><FormLabel fontSize="xs">Qty</FormLabel><Input type="number" size="sm" value={medInput.quantity} onChange={(e) => setMedInput({ ...medInput, quantity: e.target.value })} /></FormControl>
                </Grid>
                <Button size="sm" colorScheme="green" onClick={handleAddMedication} alignSelf="flex-start" leftIcon={<FiPlus />}>Add Medication</Button>
              </VStack>
            </Box>

            {/* Lab Tests */}
            <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="bold" mb={2}>Investigations (Lab Tests)</Text>

              {/* Existing Labs */}
              {(plan.investigations || []).length > 0 && (
                <Flex wrap="wrap" gap={2} mb={4}>
                  {(plan.investigations || []).map((t, idx) => (
                    <Badge key={idx} colorScheme="purple" variant="subtle" borderRadius="md" px={2} py={1} display="flex" alignItems="center">
                      {t}
                      <Box as={FiX} ml={2} cursor="pointer" onClick={() => handleRemoveInvestigation(idx)} />
                    </Badge>
                  ))}
                </Flex>
              )}

              <Flex gap={2}>
                <InputGroup size="sm" flex="1">
                  <Input list="lab-options" value={labInput} onChange={(e) => setLabInput(e.target.value)} placeholder="Select or type..." />
                  <datalist id="lab-options">
                    {labTestOptions
                      .filter(opt => !(plan.investigations || []).some(t => t.toLowerCase().trim() === opt.test_name.toLowerCase().trim()))
                      .map((opt, i) => <option key={i} value={opt.test_name} />)}
                  </datalist>
                </InputGroup>
                <Button size="sm" colorScheme="purple" onClick={handleAddInvestigation} leftIcon={<FiPlus />}>Add Test</Button>
              </Flex>
            </Box>

          </VStack>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
