import React from 'react';
import {
  Box,
  VStack,
  Text,
  Badge,
  HStack,
  Divider,
  SimpleGrid,
  GridItem,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription
} from '@chakra-ui/react';

const Field = ({ label, value, isDiagnosis }) => (
  <Box mb={3}>
    <Text fontSize="xs" fontWeight="bold" color={isDiagnosis ? "red.700" : "gray.600"}>{label}</Text>
    <Text fontSize="sm" whiteSpace="pre-wrap" color={isDiagnosis ? "red.700" : "gray.800"}>{value || "-"}</Text>
  </Box>
);

const EMRHistoryDisplay = ({ emrData, legacyApp, hideCancelledAlert = false }) => {
  // Graceful fallback for legacy appointments without emrData
  if (!emrData || Object.keys(emrData).length === 0) {
    return (
      <VStack align="stretch" spacing={4} w="100%">
        {legacyApp?.status === 'cancelled' && !hideCancelledAlert && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle mr={2}>Bill Cancelled</AlertTitle>
              <AlertDescription>The entire bill for this visit has been cancelled.</AlertDescription>
            </Box>
          </Alert>
        )}
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="100%">
          <Box>
            <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Medicines Prescribed</Text>
            {legacyApp?.prescription_summary && legacyApp.prescription_summary.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.prescription_summary.map((p, i) => p && <Text key={i} fontSize="sm">• {p}</Text>)}
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
          </Box>
          <Box>
            <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Prescription Remarks</Text>
            {legacyApp?.prescription_remarks_summary && legacyApp.prescription_remarks_summary.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.prescription_remarks_summary.map((r, i) => r && <Text key={i} fontSize="sm">• {r}</Text>)}
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
          </Box>
          <Box gridColumn={{ md: "span 2" }}>
            <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Diagnosis Notes</Text>
            {legacyApp?.diagnosis_note && legacyApp.diagnosis_note.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.diagnosis_note.map((d, i) => d && <Text key={i} fontSize="sm">• {typeof d === 'string' ? d : d.note || JSON.stringify(d)}</Text>)}
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
          </Box>
          <Box gridColumn={{ md: "span 2" }}>
            <Text fontWeight="bold" fontSize="sm" color="gray.600" mb={1}>Lab Tests Overview</Text>
            {legacyApp?.lab_test_summary && legacyApp.lab_test_summary.length > 0 ? (
              <VStack align="start" spacing={1}>
                {legacyApp.lab_test_summary.map((l, i) => l && <Text key={i} fontSize="sm">• {l}</Text>)}
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">None recorded.</Text>}
          </Box>
        </SimpleGrid>
      </VStack>
    );
  }

  const emrDataObj = emrData || {};
  const subjective = emrDataObj.subjective || {};
  const objective = emrDataObj.objective || {};
  const assessment = emrDataObj.assessment || {};
  const plan = emrDataObj.plan || {};

  // Support both legacy flat 'vitals' and new 'objective.vitals'
  const vitals = emrDataObj.vitals || objective.vitals || {};
  
  const meds = plan.medications || [];
  const labs = plan.investigations || [];

  // Vitals Mapping
  const bp = vitals.blood_pressure || vitals.bp || '';
  const pulse = vitals.pulse || '';
  const temp = vitals.temperature || vitals.temp || '';
  const oxygen = vitals.spO2 || vitals.oxygen || '';
  const rr = vitals.respiratory_rate || vitals.resp_rate || '';
  const wt = vitals.weight || '';
  const ht = vitals.height || '';

  const hasVitals = bp || pulse || temp || oxygen || rr || wt || ht;

  return (
    <VStack align="stretch" spacing={4}>
      {legacyApp?.status === 'cancelled' && !hideCancelledAlert && (
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle mr={2}>Bill Cancelled</AlertTitle>
            <AlertDescription>The entire bill for this visit has been cancelled.</AlertDescription>
          </Box>
        </Alert>
      )}
      {/* Vitals */}
      {hasVitals && (
        <Box>
          <Text fontWeight="bold" fontSize="sm" color="blue.700" mb={2}>Vitals</Text>
          <HStack spacing={2} wrap="wrap">
            {bp && <Badge colorScheme="blue">BP: {bp} mmHg</Badge>}
            {pulse && <Badge colorScheme="red">Pulse: {pulse} bpm</Badge>}
            {temp && <Badge colorScheme="orange">Temp: {temp} °F</Badge>}
            {oxygen && <Badge colorScheme="cyan">SpO2: {oxygen}%</Badge>}
            {rr && <Badge colorScheme="gray">RR: {rr}/min</Badge>}
            {wt && <Badge colorScheme="green">Wt: {wt} kg</Badge>}
            {ht && <Badge colorScheme="purple">Ht: {ht} cm</Badge>}
          </HStack>
        </Box>
      )}

      {/* Clinical Notes (Subjective + Objective) */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
        <Box>
          <Text fontWeight="bold" fontSize="md" color="gray.700" mb={3} borderBottom="1px solid" borderColor="gray.200" pb={1}>Subjective</Text>
          <Field label="Chief Complaints" value={subjective.chief_complaints} />
          <Field label="History of Present Illness (HPI)" value={subjective.history_of_present_illness || subjective.hpi} />
          <Field label="Past Medical / Family History" value={subjective.past_medical_history || subjective.past_history} />
          <Field label="Allergies" value={subjective.allergies} />
        </Box>
        <Box>
          <Text fontWeight="bold" fontSize="md" color="gray.700" mb={3} borderBottom="1px solid" borderColor="gray.200" pb={1}>Objective & Assessment</Text>
          <Field label="General Examination" value={objective.general_examination || objective.general_exam} />
          <Field label="Systemic Examination" value={objective.systemic_examination || objective.systemic_exam} />
          <Field label="Local Examination" value={objective.local_examination || objective.local_exam} />
          <Field label="Provisional Diagnosis" value={assessment.provisional_diagnosis} isDiagnosis />
        </Box>
      </SimpleGrid>

      <Divider />

      {/* Plan */}
      <Box>
        <Text fontWeight="bold" fontSize="sm" color="gray.700" mb={2}>Plan</Text>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          {/* Medications */}
          <GridItem>
            <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Medications</Text>
            {meds.length > 0 ? (
              <VStack align="stretch" spacing={2}>
                {meds.map((m, i) => (
                  <Box key={i} p={2} bg="white" borderRadius="md" border="1px solid" borderColor="gray.200" boxShadow="sm">
                    <HStack justify="space-between">
                      <Text fontWeight="bold" fontSize="sm" color="green.700">{m.drug}</Text>
                      <Badge colorScheme="gray">{m.quantity || 'N/A'} Qty</Badge>
                    </HStack>
                    <Text fontSize="xs" color="gray.600">{m.dose || 'N/A'} • {m.route || 'N/A'} • {m.frequency || 'N/A'} • {m.duration || 'N/A'}</Text>
                  </Box>
                ))}
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">-</Text>}
          </GridItem>

          {/* Investigations */}
          <GridItem>
            <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Investigations (Labs)</Text>
            {labs.length > 0 ? (
              <VStack align="start" spacing={1}>
                {labs.map((l, i) => <Text key={i} fontSize="sm">• {l}</Text>)}
              </VStack>
            ) : <Text fontSize="sm" color="gray.400">-</Text>}
          </GridItem>

          {/* Advice & Follow-up */}
          <GridItem>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Advice / Remarks</Text>
                <Text fontSize="sm" color="gray.700" whiteSpace="pre-wrap">{plan.advice || "-"}</Text>
              </Box>
              <Box>
                <Text fontWeight="bold" fontSize="xs" color="gray.600" mb={1}>Follow-up Date</Text>
                <Text fontSize="sm" color="gray.700">{plan.follow_up_date || "-"}</Text>
              </Box>
            </VStack>
          </GridItem>
        </SimpleGrid>
      </Box>
    </VStack>
  );
};

export default EMRHistoryDisplay;
