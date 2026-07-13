import React from 'react';
import {
  Box,
  Flex,
  Text,
  Image,
  VStack,
} from '@chakra-ui/react';
import { calculateAge, toTitleCase } from '../utils/utils';
import bitsLogo from '../assets/bits-logo.png';

// Code 39 encoding pattern map
const CODE39_PATTERNS = {
  '0': 'N N N W W N W N N',
  '1': 'W N N W N N N N W',
  '2': 'N N W W N N N N W',
  '3': 'W N W W N N N N N',
  '4': 'N N N W W N N N W',
  '5': 'W N N W W N N N N',
  '6': 'N N W W W N N N N',
  '7': 'N N N W N N W N W',
  '8': 'W N N W N N W N N',
  '9': 'N N W W N N W N N',
  'A': 'W N N N N W N N W',
  'B': 'N N W N N W N N W',
  'C': 'W N W N N W N N N',
  'D': 'N N N N W W N N W',
  'E': 'W N N N W W N N N',
  'F': 'N N W N W W N N N',
  'G': 'N N N N N W W N W',
  'H': 'W N N N N W W N N',
  'I': 'N N W N N W W N N',
  'J': 'N N N N W W W N N',
  'K': 'W N N N N N N W W',
  'L': 'N N W N N N N W W',
  'M': 'W N W N N N N W N',
  'N': 'N N N N W N N W W',
  'O': 'W N N N W N N W N',
  'P': 'N N W N W N N W N',
  'Q': 'N N N N N N W W W',
  'R': 'W N N N N N W W N',
  'S': 'N N W N N N W W N',
  'T': 'N N N N W N W W N',
  'U': 'W W N N N N N N W',
  'V': 'N W W N N N N N W',
  'W': 'W W W N N N N N N',
  'X': 'N W N N W N N N W',
  'Y': 'W W N N W N N N N',
  'Z': 'N W W N W N N N N',
  '-': 'N W N N N N W N W',
  '.': 'W W N N N N W N N',
  ' ': 'N W W N N N W N N',
  '*': 'N N W N W N N W N',
  '$': 'N W N W N W N N N',
  '/': 'N W N W N N N W N',
  '+': 'N W N N N W N W N',
  '%': 'N N N W N W N W N'
};

const Code39Barcode = ({ value }) => {
  if (!value) return null;
  const cleanText = `*${String(value).toUpperCase()}*`;
  const narrowWidth = 1.0;
  const wideWidth = 2.5;

  let x = 0;
  const rects = [];

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS[' '];

    const elements = pattern.split(' ');
    for (let j = 0; j < 9; j++) {
      const isBar = j % 2 === 0;
      const isWide = elements[j] === 'W';
      const w = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        rects.push(
          <rect
            key={`${i}-${j}`}
            x={x}
            y={0}
            width={w}
            height={30}
            fill="black"
          />
        );
      }
      x += w;
    }
    x += narrowWidth; // inter-character gap
  }

  return (
    <svg
      width="100%"
      height="30"
      viewBox={`0 0 ${x} 30`}
      preserveAspectRatio="none"
    >
      {rects}
    </svg>
  );
};

const hashCode = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const getOPDNumber = (visitId, dateStr) => {
  if (!visitId) return `${dateStr}0001`;
  const serial = (hashCode(visitId) % 9999) + 1;
  const paddedSerial = String(serial).padStart(4, '0');
  return `${dateStr}${paddedSerial}`;
};

const formatDateTimeDMY = (dateObj) => {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return '';
  
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(d);
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  
  return `${partMap.day}-${partMap.month}-${partMap.year} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
};

export default function PrescriptionSlip({ prescriptionData, isPreview = false }) {
  if (!prescriptionData) return null;

  // Extract EMR subfields
  const emrDataObj = prescriptionData.emr_data || {};
  const subjective = emrDataObj.subjective || {};
  const objective = emrDataObj.objective || {};
  const assessment = emrDataObj.assessment || {};
  const plan = emrDataObj.plan || {};
  const vitals = emrDataObj.vitals || objective.vitals || {};

  // Resolve medications
  const meds = plan.medications || (prescriptionData.prescriptions || []).map(p => ({
    drug: p.note || p.drug || p,
    dose: p.dose || '',
    route: p.route || '',
    frequency: p.frequency || '',
    duration: p.duration || '',
    quantity: p.quantity || ''
  }));

  // Resolve investigations
  const labs = plan.investigations || (prescriptionData.lab_tests || []).map(l => l.lab_test || l);

  // Setup Date and OPD/UHID identifiers
  const todayObj = new Date();
  const yyyy = todayObj.getFullYear();
  const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
  const dd = String(todayObj.getDate()).padStart(2, '0');
  const dateYYYYMMDD = `${yyyy}${mm}${dd}`;

  const opdNo = prescriptionData.opd_no || prescriptionData.opdNumber || getOPDNumber(prescriptionData.visit_id, dateYYYYMMDD);
  const uhidNo = prescriptionData.uhid_no || prescriptionData.institute_id || '';
  const formattedToday = formatDateTimeDMY(prescriptionData.time || todayObj);

  // Determine split for Page 1 & Page 2 (Continuation Page)
  const maxPage1Meds = 4;
  const maxPage1Labs = 4;

  const hasEmr = Object.keys(emrDataObj).length > 0 || meds.length > 0 || labs.length > 0;
  const needsPage2 = hasEmr && (meds.length > maxPage1Meds || labs.length > maxPage1Labs);

  const page1Meds = needsPage2 ? meds.slice(0, maxPage1Meds) : meds;
  const page2Meds = needsPage2 ? meds.slice(maxPage1Meds) : [];

  const page1Labs = needsPage2 ? labs.slice(0, maxPage1Labs) : labs;
  const page2Labs = needsPage2 ? labs.slice(maxPage1Labs) : [];

  // Vitals helper
  const bp = vitals.blood_pressure || vitals.bp || '';
  const pulse = vitals.pulse || '';
  const temp = vitals.temperature || vitals.temp || '';
  const oxygen = vitals.spO2 || vitals.oxygen || '';
  const rr = vitals.respiratory_rate || vitals.resp_rate || '';
  const wt = vitals.weight || '';
  const ht = vitals.height || '';
  const hasVitals = bp || pulse || temp || oxygen || rr || wt || ht;

  const renderSlipPage = (medsList, labsList, pageNumber, totalPages) => {
    const isPage2 = pageNumber === 2;

    return (
      <Box
        className="opd-page"
        w="100%"
        maxW={isPreview ? "100%" : "800px"}
        bg="white"
        color="black"
        p={isPreview ? "12px" : "24px"}
        border="2px double #000"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={isPreview ? "11px" : "13px"}
        lineHeight="1.4"
        position="relative"
        boxShadow="0 4px 12px rgba(0,0,0,0.05)"
        mb={isPreview ? "10px" : "20px"}
        style={{ pageBreakAfter: 'always', pageBreakInside: 'avoid' }}
      >
        {/* Header Section */}
        <Box position="relative" textAlign="center" pt={isPreview ? 2 : 4} pb={isPreview ? 1 : 2}>
          <Image
            src={bitsLogo}
            alt="BITS Logo"
            boxSize={isPreview ? "40px" : "60px"}
            position="absolute"
            left={isPreview ? "8px" : "20px"}
            top={isPreview ? "4px" : "12px"}
          />
          <Text fontSize={isPreview ? "13px" : "18px"} fontWeight="bold">
            Birla Institute of Technology & Science
          </Text>
          <Text fontSize={isPreview ? "9px" : "12px"}>
            Pilani (Rajasthan) 333 031, India
          </Text>
          <Text fontSize={isPreview ? "11px" : "15px"} fontWeight="bold" mt={1}>
            MEDICAL CENTRE
          </Text>
          <Text fontSize={isPreview ? "9px" : "12px"}>
            Vidya Vihar, Pilani, RAJASTHAN
          </Text>
          {isPage2 && (
            <Text fontSize={isPreview ? "9px" : "12px"} fontWeight="bold" color="gray.600" mt={1} letterSpacing="1px">
              * PRESCRIPTION CONTINUATION SHEET *
            </Text>
          )}
        </Box>

        {/* Contact Details Grid */}
        <Box borderTop="1px solid black" borderBottom="1px solid black" py={2} px={4}>
          <Flex justify="space-between" fontSize="11px">
            <Box width="60%" textAlign="left">
              <Flex mb={0.5}>
                <Text width="90px" fontWeight="bold">Contact No.:</Text>
                <Text>01596-515525 &nbsp; &nbsp; &nbsp; &nbsp;/</Text>
              </Flex>
              <Flex mb={0.5}>
                <Text width="90px" fontWeight="bold">E-Mail :</Text>
                <Text>mcdc@pilani.bits-pilani.ac.in</Text>
              </Flex>
              <Flex mb={0.5}>
                <Text width="90px" fontWeight="bold">WebSite :</Text>
                <Text>www.bits-pilani.ac.in</Text>
              </Flex>
            </Box>
            <Box width="40%" pl={10} textAlign="left">
              <Flex mb={0.5}>
                <Text width="80px" fontWeight="bold">Fax :</Text>
                <Text>01596-244183</Text>
              </Flex>
              <Flex mb={0.5}>
                <Text width="80px" fontWeight="bold">Date:</Text>
                <Text>{formattedToday}</Text>
              </Flex>
            </Box>
          </Flex>
        </Box>

        {/* Title */}
        <Box py={1.5} borderBottom="1px solid black" textAlign="center">
          <Text fontSize="14px" fontWeight="bold" letterSpacing="1px">
            OPD CARD / SLIP
          </Text>
        </Box>

        {/* Patient Details */}
        <Box px={4} py={3} fontSize="12px">
          <Flex justify="space-between">
            {/* Left Column */}
            <Box width="55%" textAlign="left">
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">Name</Text>
                <Text flex="1">: {toTitleCase(prescriptionData.name) || ''}</Text>
              </Flex>
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">Sex & Age</Text>
                <Text flex="1">
                  : {prescriptionData.gender ? (prescriptionData.gender.toUpperCase() === 'M' ? 'MALE' : (prescriptionData.gender.toUpperCase() === 'F' ? 'FEMALE' : prescriptionData.gender.toUpperCase())) : ''} / {calculateAge(prescriptionData.age || prescriptionData.date_of_birth)}Yr
                </Text>
              </Flex>
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">Address</Text>
                <Text flex="1">: {prescriptionData.address || ''}</Text>
              </Flex>
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">Ph/Mob No</Text>
                <Text flex="1">: {prescriptionData.contact_no || ''} &nbsp; &nbsp; &nbsp; &nbsp;/</Text>
              </Flex>
            </Box>

            {/* Right Column */}
            <Box width="45%" pl={4} textAlign="left">
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">O.P.D No</Text>
                <Text flex="1">: {opdNo}</Text>
              </Flex>
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">PSRN/ID No</Text>
                <Text flex="1">: {prescriptionData.institute_id || ''}</Text>
              </Flex>
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">UHID No</Text>
                <Text flex="1">: {uhidNo}</Text>
              </Flex>
              <Flex mb={1.5} align="center">
                <Text width="100px" fontWeight="bold">Date</Text>
                <Text flex="1">: {formattedToday}</Text>
              </Flex>
            </Box>
          </Flex>
        </Box>

        {/* Clinical and Treatment Section */}
        <Box borderTop="1px solid black" borderBottom="1px solid black" minHeight="450px" mb="15px">
          <Flex minHeight="450px">
            {/* Left Column: Complaint and Investigations */}
            <Box width="35%" borderRight="1px solid black" pr={3} pt={3} display="flex" flexDirection="column">
              <Box textAlign="left" flex="1">
                <Text fontSize="12px" fontWeight="bold" mb={2}>Complaint and Clinical Exam.</Text>
                {!isPage2 && hasEmr && (
                  <VStack align="stretch" spacing={2} fontSize="11px">
                    {subjective.chief_complaints && (
                      <Box>
                        <Text fontWeight="bold" display="inline">Complaints: </Text>
                        <Text display="inline">{subjective.chief_complaints}</Text>
                      </Box>
                    )}
                    {subjective.history_of_present_illness && (
                      <Box>
                        <Text fontWeight="bold" display="inline">HPI: </Text>
                        <Text display="inline">{subjective.history_of_present_illness}</Text>
                      </Box>
                    )}
                    {hasVitals && (
                      <Box>
                        <Text fontWeight="bold" mb={0.5}>Vitals:</Text>
                        <Box pl={2} fontSize="10px">
                          {bp && <Text>• BP: {bp} mmHg</Text>}
                          {pulse && <Text>• Pulse: {pulse} bpm</Text>}
                          {temp && <Text>• Temp: {temp} °F</Text>}
                          {oxygen && <Text>• SpO2: {oxygen}%</Text>}
                          {rr && <Text>• RR: {rr}/min</Text>}
                          {wt && <Text>• Wt: {wt} kg</Text>}
                          {ht && <Text>• Ht: {ht} cm</Text>}
                        </Box>
                      </Box>
                    )}
                    {(objective.general_examination || objective.general_exam) && (
                      <Box>
                        <Text fontWeight="bold" display="inline">Gen. Exam: </Text>
                        <Text display="inline">{objective.general_examination || objective.general_exam}</Text>
                      </Box>
                    )}
                    {(objective.systemic_examination || objective.systemic_exam) && (
                      <Box>
                        <Text fontWeight="bold" display="inline">Sys. Exam: </Text>
                        <Text display="inline">{objective.systemic_examination || objective.systemic_exam}</Text>
                      </Box>
                    )}
                    {assessment.provisional_diagnosis && (
                      <Box color="red.800">
                        <Text fontWeight="bold" display="inline">Diagnosis: </Text>
                        <Text display="inline" fontWeight="bold">{assessment.provisional_diagnosis}</Text>
                      </Box>
                    )}
                    {subjective.allergies && (
                      <Box color="orange.800">
                        <Text fontWeight="bold" display="inline">Allergies: </Text>
                        <Text display="inline">{subjective.allergies}</Text>
                      </Box>
                    )}
                  </VStack>
                )}
                {isPage2 && (
                  <Text fontSize="11px" fontStyle="italic" color="gray.500" pl={2}>
                    (Clinical exam details on page 1)
                  </Text>
                )}
              </Box>
              
              <Box textAlign="left" borderTop="1px solid black" pt={3} flex="1">
                <Text fontSize="12px" fontWeight="bold" mb={2}>Investigations</Text>
                {labsList.length > 0 && (
                  <VStack align="start" spacing={1} fontSize="11px" pl={2}>
                    {labsList.map((lab, i) => (
                      <Text key={i}>• {lab}</Text>
                    ))}
                  </VStack>
                )}
              </Box>
            </Box>

            {/* Right Column: Treatment */}
            <Box width="65%" pl={4} pt={3} textAlign="left" display="flex" flexDirection="column" height="100%">
              <Text fontSize="12px" fontWeight="bold" mb={2}>Treatment</Text>
              {medsList.length > 0 && (
                <VStack align="stretch" spacing={2} fontSize="11px" mb={4}>
                  {medsList.map((med, i) => {
                    const displayIndex = isPage2 ? maxPage1Meds + i + 1 : i + 1;
                    return (
                      <Box key={i} borderBottom="1px dashed" borderColor="gray.200" pb={1}>
                        <Flex justify="space-between" fontWeight="bold">
                          <Text color="green.800">{displayIndex}. {med.drug}</Text>
                          <Text fontSize="10px">Qty: {med.quantity || '-'}</Text>
                        </Flex>
                        <Text fontSize="10px" color="gray.700" pl={2}>
                          {med.dose} • {med.route} • {med.frequency} • {med.duration}
                        </Text>
                      </Box>
                    );
                  })}
                </VStack>
              )}

              {/* Show advice / follow-up only on page 1 (if no page 2 exists), or on page 2 (if page 2 exists) */}
              {((!needsPage2 && !isPage2) || (needsPage2 && isPage2)) && (
                <Box mt="auto" pt={2}>
                  {plan.advice && (
                    <Box borderTop="1px dashed" borderColor="gray.300" pt={2} fontSize="11px">
                      <Text fontWeight="bold" color="blue.800">Advice / Remarks:</Text>
                      <Text pl={2} fontStyle="italic">{plan.advice}</Text>
                    </Box>
                  )}
                  {plan.follow_up_date && (
                    <Box mt={2} fontSize="11px">
                      <Text fontWeight="bold" display="inline">Follow-up Date: </Text>
                      <Text display="inline" color="blue.900">{plan.follow_up_date}</Text>
                    </Box>
                  )}
                </Box>
              )}

              {/* Page marker/link note if split */}
              {!isPage2 && needsPage2 && (
                <Box mt="auto" pt={2} fontSize="11px" fontStyle="italic" color="blue.700" textAlign="center" fontWeight="bold">
                  [Prescription continued on page 2...]
                </Box>
              )}
            </Box>
          </Flex>
        </Box>

        {/* Barcode Section */}
        <Flex px={6} py={2} justify="space-between" align="center" borderBottom="1px solid black">
          <Box width="30%" textAlign="center">
            <Code39Barcode value={uhidNo} />
            <Text fontSize="10px" fontWeight="bold" mt={0.5}>UHIDNo.</Text>
          </Box>
          <Box width="30%" textAlign="center">
            <Code39Barcode value={prescriptionData.institute_id} />
            <Text fontSize="10px" fontWeight="bold" mt={0.5}>INSID No.</Text>
          </Box>
          <Box width="30%" textAlign="center">
            <Code39Barcode value={opdNo} />
            <Text fontSize="10px" fontWeight="bold" mt={0.5}>OPD No.</Text>
          </Box>
        </Flex>

        {/* Footer Note & Page Number */}
        <Flex justify="space-between" align="center" pt={2} fontSize="11px">
          <Text fontWeight="bold">* Please bring this prescription for next time *</Text>
          <Text fontWeight="bold">Page {pageNumber} of {totalPages}</Text>
        </Flex>
      </Box>
    );
  };

  return (
    <Box bg="gray.100" p={2} borderRadius="md" w="100%">
      {renderSlipPage(page1Meds, page1Labs, 1, needsPage2 ? 2 : 1)}
      {needsPage2 && renderSlipPage(page2Meds, page2Labs, 2, 2)}
    </Box>
  );
}
