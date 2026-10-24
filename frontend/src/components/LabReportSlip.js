import React from 'react';
import { Box, Table, Thead, Tbody, Tr, Th, Td, Text, Flex, Grid, GridItem, Image, HStack } from '@chakra-ui/react';
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
            height={20}
            fill="black"
          />
        );
      }
      x += w;
    }
    x += narrowWidth;
  }

  return (
    <svg
      width="100%"
      height="20"
      viewBox={`0 0 ${x} 20`}
      preserveAspectRatio="none"
      style={{ display: 'inline-block', maxWidth: '180px' }}
    >
      {rects}
    </svg>
  );
};

const formatToReportDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
};

export default function LabReportSlip({ patientInfo, manualReports }) {
  if (!patientInfo || !manualReports || manualReports.length === 0) return null;

  const latestTimestamp = manualReports[0]?.timestamp || new Date().toISOString();
  const rawTestNo = patientInfo.visitId || patientInfo.visit_id || 'N/A';
  const testNo = rawTestNo.split('-')[0].toUpperCase();
  const uhidNo = patientInfo.uhid || patientInfo.instituteId || patientInfo.institute_id || 'N/A';

  const isOutOfRange = (valStr, refStr) => {
    if (!valStr || !refStr || refStr === 'N/A') return false;
    const val = parseFloat(valStr);
    if (isNaN(val)) return false;

    const rangeMatch = refStr.match(/^([0-9.]+)\s*-\s*([0-9.]+)$/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      return val < min || val > max;
    }

    const lessMatch = refStr.match(/^<\s*([0-9.]+)$/);
    if (lessMatch) {
      const limit = parseFloat(lessMatch[1]);
      return val >= limit;
    }

    const greaterMatch = refStr.match(/^>\s*([0-9.]+)$/);
    if (greaterMatch) {
      const limit = parseFloat(greaterMatch[1]);
      return val <= limit;
    }

    return false;
  };

  return (
    <Box
      className="lab-report-print-container"
      p={6}
      bg="white"
      color="black"
      fontFamily="'Arial', 'Helvetica', sans-serif;"
      fontSize="11px"
      w="100%"
      maxW="800px"
      mx="auto"
      style={{
        pageBreakAfter: 'always',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          .lab-report-print-container {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          body {
            background-color: white !important;
            color: black !important;
          }
        }
      `}} />

      {/* 1. HEADER PART */}
      <Flex direction="column" mb={3}>
        {/* Double-border header box */}
        <Box border="2px double black" p={3} mb={3}>
          <Grid templateColumns="75px 1fr" gap={3} alignItems="center" pb={2}>
            <GridItem>
              <Image src={bitsLogo} alt="BITS Crest" w="70px" h="auto" />
            </GridItem>
            <GridItem textAlign="center" pr="40px">
              <Text fontSize="15px" fontWeight="bold" letterSpacing="0.5px">Birla Institute of Technology & Science</Text>
              <Text fontSize="10px">Pilani (Rajasthan) 333 031, India</Text>
              <Text fontSize="12px" fontWeight="bold" mt={0.5} mb={0.5}>MEDICAL CENTRE</Text>
              <Text fontSize="10px">Vidya Vihar, Pilani, RAJASTHAN</Text>
            </GridItem>
          </Grid>

          <Grid templateColumns="1.2fr 1fr" gap={4} borderTop="1px solid black" pt={2} fontSize="9px" lineHeight="1.4">
            <GridItem>
              <Flex><Text fontWeight="bold" w="80px">Contact No.:</Text><Text>01596-515525</Text></Flex>
              <Flex><Text fontWeight="bold" w="80px">E-Mail:</Text><Text>medc@pilani.bits-pilani.ac.in</Text></Flex>
              <Flex><Text fontWeight="bold" w="80px">WebSite:</Text><Text>www.bits-pilani.ac.in</Text></Flex>
            </GridItem>
            <GridItem>
              <Flex justify="flex-end"><Text fontWeight="bold" w="50px">Fax:</Text><Text w="100px" textAlign="right">01596-244183</Text></Flex>
              <Flex justify="flex-end"><Text fontWeight="bold" w="50px">Date:</Text><Text w="100px" textAlign="right">{formatToReportDateTime(latestTimestamp)}</Text></Flex>
            </GridItem>
          </Grid>
        </Box>

        <Flex justify="center" align="center" pt={1.5} pb={1.5} borderTop="1px solid black" borderBottom="1px solid black">
          <Text fontWeight="bold" fontSize="10px">* INVESTIGATION *</Text>
        </Flex>

        <Grid templateColumns="1.2fr 1fr" gap={6} mt={3} fontSize="10px" lineHeight="1.5">
          <GridItem>
            <Flex><Text fontWeight="bold" w="100px">Ref. Doctor</Text><Text>: {String(patientInfo.doctorName || patientInfo.doctor_name || 'N/A').toUpperCase()}</Text></Flex>
            <Flex><Text fontWeight="bold" w="100px">Ref. No.</Text><Text>: {String(patientInfo.instituteId || patientInfo.institute_id || 'N/A').toUpperCase()}</Text></Flex>
            <Flex><Text fontWeight="bold" w="100px">Name</Text><Text>: {String(patientInfo.patientName || patientInfo.name || 'N/A').toUpperCase()}</Text></Flex>
            <Flex><Text fontWeight="bold" w="100px">PSRN No/ID No</Text><Text>: {String(patientInfo.instituteId || patientInfo.institute_id || 'N/A').toUpperCase()}</Text></Flex>
            <Flex><Text fontWeight="bold" w="100px">Age/Gender</Text><Text>: {patientInfo.age}Y / {String(patientInfo.gender || 'N/A').toUpperCase()}</Text></Flex>
            <Flex><Text fontWeight="bold" w="100px">Address</Text><Text>: {patientInfo.address || 'Pilani'}</Text></Flex>
          </GridItem>
          <GridItem>
            <Flex><Text fontWeight="bold" w="80px">Test Date</Text><Text>: {formatToReportDateTime(latestTimestamp)}</Text></Flex>
            <Flex><Text fontWeight="bold" w="80px">Reg. Date</Text><Text>: {formatToReportDateTime(patientInfo.regDate || patientInfo.time || latestTimestamp)}</Text></Flex>
            <Flex><Text fontWeight="bold" w="80px">UHID</Text><Text>: {uhidNo}</Text></Flex>
          </GridItem>
        </Grid>
      </Flex>

      {/* 2. BODY PART */}
      <Box minH="300px">
        <Table variant="unstyled" size="sm" w="100%">
          <Thead borderBottom="1px solid black" borderTop="1px solid black">
            <Tr>
              <Th fontSize="10px" color="black" py={1.5} px={2} textTransform="none" fontWeight="bold" w="30%">Parameter</Th>
              <Th fontSize="10px" color="black" py={1.5} px={2} textTransform="none" fontWeight="bold" w="15%" textAlign="center">Result</Th>
              <Th fontSize="10px" color="black" py={1.5} px={2} textTransform="none" fontWeight="bold" w="15%" textAlign="center">Unit</Th>
              <Th fontSize="10px" color="black" py={1.5} px={2} textTransform="none" fontWeight="bold" w="40%" textAlign="right">Reference Range</Th>
            </Tr>
          </Thead>
          <Tbody>
            {manualReports.map((report, rIdx) => {
              const testTitle = String(report.test_name || 'Lab Test').toUpperCase();
              const entries = Object.entries(report.results || {});
              if (entries.length === 0) return null;

              return (
                <React.Fragment key={rIdx}>
                  <Tr>
                    <Td colSpan={4} py={3} px={2} textAlign="center" fontWeight="bold" fontSize="11px" textDecoration="underline" letterSpacing="0.5px">
                      {testTitle}
                    </Td>
                  </Tr>
                  {entries.map(([param, val]) => {
                    const value = typeof val === 'object' ? (val.value ?? '') : val;
                    const ref = typeof val === 'object' ? (val.reference_range ?? 'N/A') : 'N/A';
                    const units = typeof val === 'object' ? (val.units ?? 'N/A') : 'N/A';
                    const isAbnormal = isOutOfRange(String(value), String(ref));

                    return (
                      <Tr key={param} style={{ pageBreakInside: 'avoid' }}>
                        <Td py={0.5} px={2} fontSize="9px" fontWeight="normal" color="black">{param.toUpperCase()}</Td>
                        <Td py={0.5} px={2} fontSize="9px" fontWeight="bold" textAlign="center" color={isAbnormal ? 'red.600' : 'black'}>
                          {String(value)} {isAbnormal && '*'}
                        </Td>
                        <Td py={0.5} px={2} fontSize="9px" textAlign="center" color="black">{units}</Td>
                        <Td py={0.5} px={2} fontSize="9px" textAlign="right" color="black">{ref}</Td>
                      </Tr>
                    );
                  })}
                  {report.remarks && (
                    <Tr>
                      <Td colSpan={4} py={2} px={2} fontStyle="italic" color="gray.600" fontSize="9px">
                        <strong>Remarks:</strong> {report.remarks}
                      </Td>
                    </Tr>
                  )}
                </React.Fragment>
              );
            })}
          </Tbody>
        </Table>

        <Flex justify="center" align="center" mt={6} mb={8} fontSize="9px" color="gray.600">
          <Text>---------------------------x</Text>
          <Text fontWeight="bold" mx={3} letterSpacing="1px">End Of Report</Text>
          <Text>x---------------------------</Text>
        </Flex>
      </Box>

      <Flex direction="column" align="flex-end" pr={4} mb={6} mt={4}>
        <Box w="150px" borderTop="1px dotted black" pt={1.5} textAlign="center">
          <Text fontSize="10px" fontWeight="medium" color="gray.700">Signature</Text>
        </Box>
      </Flex>

      {/* 3. FOOTER PART */}
      <Box borderTop="2px solid black" pt={3} mt={4} fontSize="8.5px" color="gray.800" lineHeight="1.4">
        <Flex justify="space-between" align="center" mb={3} wrap="wrap" gap={4}>
          <HStack spacing={2} align="center">
            <Text fontWeight="bold" fontSize="9px">TEST No.</Text>
            <Code39Barcode value={testNo} />
          </HStack>
          <HStack spacing={2} align="center">
            <Text fontWeight="bold" fontSize="9px">UHID No.</Text>
            <Code39Barcode value={uhidNo} />
          </HStack>
          <Text fontWeight="bold" fontSize="9px">Page 1 of 1</Text>
        </Flex>
        <Text fontStyle="italic" mb={2}>
          * Investigations have their limitations. Solitary, pathological/radiological and other investigations never confirm the final diagnosis of disease. They only help in diagnosing the disease in correlation to clinical symptoms and other related tests. Please interpret accordingly. In case of doubtful, abnormal, contradictory reports and not fitting to clinical diagnosis, the test can be performed without any charges on advise of referring doctor, on same day. *
        </Text>
        <Text textAlign="center" fontWeight="bold" fontSize="9.5px" borderTop="1px dashed" borderColor="gray.300" pt={2}>
          * This is not valid for Medico-Legal purpose. *
        </Text>
      </Box>
    </Box>
  );
}
