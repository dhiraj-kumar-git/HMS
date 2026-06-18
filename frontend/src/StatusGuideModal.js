import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Flex,
  Icon,
  Stack,
  Box,
  Heading,
  Badge,
  Text,
  Divider,
} from '@chakra-ui/react';
import { FiHelpCircle } from 'react-icons/fi';

const StatusGuideModal = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" maxH="90vh">
        <ModalHeader>
          <Flex align="center" gap={2}>
            <Icon as={FiHelpCircle} color="blue.500" boxSize={5} />
            Patients Status Guide
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6} overflowY="auto">
          <Stack spacing={6} align="stretch">
            <Box>
              <Heading size="sm" mb={3} color="gray.700">Workflow Statuses</Heading>
              <Stack align="start" spacing={3}>
                <Box>
                  <Badge variant="subtle" mb={1} fontSize="10px" colorScheme="green">active</Badge>
                  <Text fontSize="sm">Patient is registered and has booked an appointment.</Text>
                </Box>
                <Box>
                  <Badge variant="subtle" mb={1} fontSize="10px" colorScheme="orange">consultation</Badge>
                  <Text fontSize="sm">Patient is currently consulting with the doctor.</Text>
                </Box>
                <Box>
                  <Badge variant="subtle" mb={1} fontSize="10px" colorScheme="purple">lab test pending</Badge>
                  <Text fontSize="sm">Doctor has recommended lab tests, and the patient needs to visit the lab.</Text>
                </Box>
                <Box>
                  <Badge variant="subtle" mb={1} fontSize="10px" colorScheme="blue">consultation completed</Badge>
                  <Text fontSize="sm">Patient has finished their visit with the doctor.</Text>
                </Box>
                <Box>
                  <Badge variant="subtle" mb={1} fontSize="10px" colorScheme="gray">completed</Badge>
                  <Text fontSize="sm">The entire workflow for this visit is completed.</Text>
                </Box>
                <Box>
                  <Badge variant="subtle" mb={1} fontSize="10px" colorScheme="gray">inactive</Badge>
                  <Text fontSize="sm">Patient has not visited the Hospital.</Text>
                </Box>
              </Stack>
            </Box>
            <Divider />
            <Box>
              <Heading size="sm" mb={3} color="gray.700">Billing Statuses</Heading>
              <Stack align="start" spacing={3}>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="green">paid</Badge>
                  <Text fontSize="sm">All outstanding bills for the visit/labs are cleared.</Text>
                </Box>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="red">pending</Badge>
                  <Text fontSize="sm">There are pending dues to be paid at the medical counter.</Text>
                </Box>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="gray">cancelled</Badge>
                  <Text fontSize="sm">The bill has been explicitly cancelled without payment.</Text>
                </Box>
              </Stack>
            </Box>
            <Divider />
            <Box>
              <Heading size="sm" mb={3} color="gray.700">Lab Statuses</Heading>
              <Stack align="start" spacing={3}>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="orange">active</Badge>
                  <Text fontSize="sm">Lab tests have been prescribed and are actively being processed.</Text>
                </Box>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="blue">pending</Badge>
                  <Text fontSize="sm">Waiting for lab results to be uploaded.</Text>
                </Box>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="green">completed</Badge>
                  <Text fontSize="sm">Lab results are uploaded and ready for doctor/patient review.</Text>
                </Box>
                <Box>
                  <Badge variant="outline" mb={1} fontSize="10px" colorScheme="gray">cancelled</Badge>
                  <Text fontSize="sm">The lab tests have been cancelled and no longer require processing.</Text>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default StatusGuideModal;
