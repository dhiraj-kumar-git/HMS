import React, { useState, useEffect } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Box, Flex, Text, Input,
  Button, FormControl, FormLabel, Alert, AlertIcon, Badge, Spinner, Table, Thead, Tbody, Tr, Th, Td, SimpleGrid,
} from '@chakra-ui/react';
import { FiLock, FiUnlock, FiFileText } from 'react-icons/fi';
import { unlockLabView } from '../../utils/labViewAccess';
import { formatReceptionistDateTime, formatDateTimeIST, toTitleCase } from '../../utils/utils';
import { labStatusInfo, testStatusInfo } from './labStatusStyles';

// ---------------------------------------------------------------- password prompt

export function PasswordPrompt({ isOpen, onClose, onUnlocked, notice }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError('');
    }
  }, [isOpen]);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const until = await unlockLabView(password);
      setPassword('');
      onUnlocked(until);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) setError('Incorrect password.');
      else if (status === 429) setError(err.response?.data?.error || 'Too many wrong passwords. Please try again later.');
      else setError('Could not check the password. Please try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent as="form" onSubmit={submit}>
        <ModalHeader display="flex" alignItems="center" gap={2}><FiLock /> Enter your password</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.600" mb={3}>
            Lab results are confidential. Enter your admin password to see test names and results. They stay available for 10 minutes.
          </Text>
          {notice && <Alert status="info" borderRadius="md" fontSize="sm" mb={3}><AlertIcon />{notice}</Alert>}
          {error && <Alert status="error" borderRadius="md" fontSize="sm" mb={3}><AlertIcon />{error}</Alert>}
          <FormControl>
            <FormLabel fontSize="sm">Password</FormLabel>
            <Input type="password" autoComplete="current-password" autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Your admin password" />
          </FormControl>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" colorScheme="blue" leftIcon={<FiUnlock />} isLoading={busy}>Unlock</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ---------------------------------------------------------------- details

const valueOrDash = (v) => (v === '' || v === null || v === undefined ? '—' : v);
const savedAt = (value) => (value ? (formatDateTimeIST(value) || value) : '—');

function ReportCard({ report, onOpenFile }) {
  return (
    <Box p={3} border="1px solid" borderColor="gray.200" borderRadius="md">
      <Flex justify="space-between" align="center" gap={2} wrap="wrap" mb={report.kind === 'typed' ? 2 : 0}>
        <Box>
          <Text fontWeight="bold">{report.test_name || 'Report'}</Text>
          <Text fontSize="xs" color="gray.500">
            {report.kind === 'file' ? `File: ${report.file_name}` : 'Typed in by the lab'}
            {' · '}Saved {savedAt(report.saved_at)}{report.uploaded_by ? ` · by ${report.uploaded_by}` : ''}
          </Text>
        </Box>
        {report.kind === 'file' && (
          <Button size="xs" colorScheme="teal" leftIcon={<FiFileText />} onClick={() => onOpenFile(report.index)}>View file</Button>
        )}
      </Flex>
      {report.kind === 'typed' && (
        <>
          {report.results.length === 0 ? (
            <Text fontSize="sm" color="gray.500">No values were saved.</Text>
          ) : (
            <Table size="sm" aria-label={`Results of ${report.test_name}`}>
              <Thead><Tr><Th>Parameter</Th><Th>Result</Th><Th>Reference range</Th><Th>Units</Th></Tr></Thead>
              <Tbody>
                {report.results.map((r) => (
                  <Tr key={r.name}>
                    <Td>{r.name}</Td><Td fontWeight="bold">{valueOrDash(r.value)}</Td>
                    <Td>{valueOrDash(r.reference_range)}</Td><Td>{valueOrDash(r.units)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          {report.remarks && <Text fontSize="sm" mt={2}><Text as="span" fontWeight="bold">Remarks: </Text>{report.remarks}</Text>}
        </>
      )}
    </Box>
  );
}

export function LabDetailsModal({ isOpen, onClose, detail, loading, error, fileError, onOpenFile, onLockNow }) {
  const info = detail ? labStatusInfo(detail.status) : null;
  return (
    // no closing animation: when the window ends the results must leave the screen at once, not fade out
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside" motionPreset="none">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {detail ? (detail.patient_name ? toTitleCase(detail.patient_name) : 'Unknown patient') : 'Lab order'}
          {detail && <Text fontSize="sm" fontWeight="normal" color="gray.500">{detail.institute_id}</Text>}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={4}>
          {loading && <Flex justify="center" py={10}><Spinner size="lg" color="blue.500" /></Flex>}
          {error && <Alert status="error" borderRadius="md"><AlertIcon />{error}</Alert>}
          {detail && (
            <Box>
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={4} fontSize="sm">
                <Box><Text color="gray.500" fontSize="xs">Visit</Text><Text fontWeight="bold">{formatReceptionistDateTime(detail.time)}</Text></Box>
                <Box><Text color="gray.500" fontSize="xs">Doctor</Text><Text fontWeight="bold">{detail.doctor_name || '—'}</Text></Box>
                <Box><Text color="gray.500" fontSize="xs">Patient</Text><Text fontWeight="bold">{[detail.patient_type, detail.gender].filter(Boolean).join(' · ') || '—'}</Text></Box>
                <Box><Text color="gray.500" fontSize="xs">Order status</Text><Badge colorScheme={info.color}>{info.label.toUpperCase()}</Badge></Box>
              </SimpleGrid>

              <Text fontWeight="bold" mb={2}>Tests ordered</Text>
              <Table size="sm" mb={5} aria-label="Tests ordered">
                <Thead><Tr><Th>Test</Th><Th>Status</Th></Tr></Thead>
                <Tbody>
                  {detail.tests.map((t, i) => {
                    const s = testStatusInfo(t.status);
                    return <Tr key={i}><Td>{t.name}</Td><Td><Badge colorScheme={s.color}>{s.label.toUpperCase()}</Badge></Td></Tr>;
                  })}
                </Tbody>
              </Table>

              <Text fontWeight="bold" mb={2}>Reports</Text>
              {fileError && <Alert status="error" borderRadius="md" fontSize="sm" mb={3}><AlertIcon />{fileError}</Alert>}
              {detail.reports.length === 0 ? (
                <Text fontSize="sm" color="gray.500">No report has been saved for this order yet.</Text>
              ) : (
                <Flex direction="column" gap={3}>
                  {detail.reports.map((r) => <ReportCard key={r.index} report={r} onOpenFile={onOpenFile} />)}
                </Flex>
              )}
            </Box>
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          <Text fontSize="xs" color="gray.500" mr="auto">This window closes by itself when your 10 minutes end.</Text>
          {onLockNow && <Button leftIcon={<FiLock />} variant="outline" onClick={onLockNow}>Lock now</Button>}
          <Button onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
