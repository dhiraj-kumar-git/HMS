import React from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Box, Flex, Text, Button,
  Alert, AlertIcon, Badge, Spinner, Table, Thead, Tbody, Tr, Th, Td, SimpleGrid,
} from '@chakra-ui/react';
import { FiLock } from 'react-icons/fi';
import { formatReceptionistDateTime, toTitleCase } from '../../utils/utils';
import { billStatusInfo, categoryLabel, rupees } from './billStatusStyles';

const dash = (v) => (v === '' || v === null || v === undefined ? '—' : v);
const typeLabel = (type) => (type === 'lab_test' ? 'Lab test' : 'Medicine');

function TotalRow({ label, value, bold }) {
  return (
    <Flex justify="space-between" fontWeight={bold ? 'bold' : 'normal'}>
      <Text>{label}</Text><Text>{rupees(value)}</Text>
    </Flex>
  );
}

export default function BillDetailsModal({ isOpen, onClose, detail, loading, error, onLockNow }) {
  const info = detail ? billStatusInfo(detail.status) : null;
  const priced = detail && detail.kind === 'bill';
  const totals = detail?.totals;
  return (
    // no closing animation: when the window ends the lines must leave the screen at once, not fade out
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside" motionPreset="none">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {detail ? (detail.invoice_no || 'Not billed yet') : 'Bill'}
          {detail && (
            <Text fontSize="sm" fontWeight="normal" color="gray.500">
              {detail.patient_name ? toTitleCase(detail.patient_name) : 'Unknown patient'} · {detail.institute_id}
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={4}>
          {loading && <Flex justify="center" py={10}><Spinner size="lg" color="blue.500" /></Flex>}
          {error && <Alert status="error" borderRadius="md"><AlertIcon />{error}</Alert>}
          {detail && (
            <Box>
              <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={4} fontSize="sm">
                <Box><Text color="gray.500" fontSize="xs">Date</Text><Text fontWeight="bold">{formatReceptionistDateTime(detail.date)}</Text></Box>
                <Box><Text color="gray.500" fontSize="xs">Doctor</Text><Text fontWeight="bold">{detail.doctor_name || '—'}</Text></Box>
                <Box><Text color="gray.500" fontSize="xs">Patient type</Text><Text fontWeight="bold">{detail.patient_type || '—'}</Text></Box>
                <Box><Text color="gray.500" fontSize="xs">Status</Text><Badge colorScheme={info.color}>{info.label.toUpperCase()}</Badge></Box>
                {priced && (
                  <Box><Text color="gray.500" fontSize="xs">Category · Payment</Text>
                    <Text fontWeight="bold">{categoryLabel(detail.category)} · {dash(detail.payment_mode)}</Text></Box>
                )}
              </SimpleGrid>

              <Text fontWeight="bold" mb={2}>{priced ? 'Billed items' : 'Items that would be billed'}</Text>
              {!priced && (
                <Text fontSize="xs" color="gray.500" mb={2}>This visit has no invoice, so there are no prices.</Text>
              )}
              <Box overflowX="auto">
                <Table size="sm" aria-label="Billed items">
                  <Thead>
                    <Tr>
                      <Th>Item</Th><Th>Type</Th><Th isNumeric>Qty</Th>
                      {priced && <><Th isNumeric>Rate</Th><Th isNumeric>Amount</Th><Th isNumeric>Discount</Th><Th isNumeric>GST</Th><Th isNumeric>Total</Th></>}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {detail.items.map((it, i) => (
                      <Tr key={i}>
                        <Td fontWeight="bold">{it.name}</Td>
                        <Td>{typeLabel(it.type)}</Td>
                        <Td isNumeric>{dash(it.quantity)}</Td>
                        {priced && (
                          <>
                            <Td isNumeric>{it.type === 'lab_test' ? '—' : rupees(it.rate)}</Td>
                            <Td isNumeric>{rupees(it.gross)}</Td>
                            <Td isNumeric>{it.discount ? `${it.discount}% (${rupees(it.discount_amount)})` : '—'}</Td>
                            <Td isNumeric>{rupees(it.cgst + it.sgst)}</Td>
                            <Td isNumeric fontWeight="bold">{rupees(it.item_total)}</Td>
                          </>
                        )}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              {priced && totals && (
                <Box ml="auto" mt={4} maxW="320px" fontSize="sm">
                  <TotalRow label="Items total" value={totals.items_total} />
                  <TotalRow label="of which GST" value={totals.gst} />
                  <TotalRow label="Discount given" value={totals.discount} />
                  <TotalRow label="Round off" value={totals.round_off} />
                  <TotalRow label="Bill total" value={totals.total} bold />
                  <TotalRow label="Reimbursed by the institute" value={totals.reimbursed} />
                  <TotalRow label="Paid by patient" value={totals.self_paid} />
                </Box>
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
