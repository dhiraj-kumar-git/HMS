import React from 'react';
import { Box, Heading, Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/react';
import TodayAppointments from './TodayAppointments';
import AppointmentSearch from './AppointmentSearch';
import AppointmentAnalytics from './AppointmentAnalytics';

export default function AdminAppointments() {
  return (
    <Box>
      <Heading size="md" mb={4}>Appointments</Heading>
      <Tabs variant="enclosed" colorScheme="blue" isLazy>
        <TabList>
          <Tab>Today</Tab>
          <Tab>Search</Tab>
          <Tab>Analytics</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}><TodayAppointments /></TabPanel>
          <TabPanel px={0}><AppointmentSearch /></TabPanel>
          <TabPanel px={0}><AppointmentAnalytics /></TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
