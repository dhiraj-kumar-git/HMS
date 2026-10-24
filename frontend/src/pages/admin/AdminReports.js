import React from 'react';
import { Box, Heading } from '@chakra-ui/react';
import LabReportStatus from './LabReportStatus';

export default function AdminReports() {
  return (
    <Box>
      <Heading size="md" mb={4}>Lab Reports</Heading>
      <LabReportStatus />
    </Box>
  );
}
