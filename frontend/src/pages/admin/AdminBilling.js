import React from 'react';
import { Box, Heading, Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/react';
import BillingStatus from './BillingStatus';
import BillingAnalytics from './BillingAnalytics';

export default function AdminBilling() {
  return (
    <Box>
      <Heading size="md" mb={4}>Billing</Heading>
      <Tabs variant="enclosed" colorScheme="blue" isLazy>
        <TabList>
          <Tab>Bills</Tab>
          <Tab>Analytics</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}><BillingStatus /></TabPanel>
          <TabPanel px={0}><BillingAnalytics /></TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
