import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import EMRForm from './EMRForm';

const mockMedicineOptions = [
  { item_name: 'Paracetamol 500mg' },
  { item_name: 'Amoxicillin 250mg' }
];

const mockLabTestOptions = [
  { test_name: 'Complete Blood Count' },
  { test_name: 'Fasting Blood Sugar' }
];

const mockInitialData = {
  subjective: { chief_complaints: 'Fever', history_of_present_illness: '', past_medical_history: '', allergies: '' },
  objective: {
    vitals: { blood_pressure: '120/80', pulse: '', temperature: '', weight: '', height: '', spO2: '', respiratory_rate: '' },
    general_examination: '', systemic_examination: '', local_examination: ''
  },
  assessment: { provisional_diagnosis: 'Viral Fever', final_diagnosis: '' },
  plan: { medications: [], investigations: [], advice: '', follow_up_date: '' }
};

const renderWithChakra = (ui) => {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
};

describe('EMRForm Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders subjective, objective, assessment, and plan fields correctly', () => {
    const handleChange = jest.fn();
    renderWithChakra(
      <EMRForm
        initialEmrData={mockInitialData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    expect(screen.getByLabelText(/Chief Complaints/i)).toHaveValue('Fever');
    expect(screen.getByLabelText(/BP \(mmHg\)/i)).toHaveValue('120/80');
    expect(screen.getByLabelText(/Provisional Diagnosis/i)).toHaveValue('Viral Fever');
  });

  it('updates subjective field locally and propagates changes via debounced onChange', () => {
    const handleChange = jest.fn();
    renderWithChakra(
      <EMRForm
        initialEmrData={mockInitialData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    const complaintsInput = screen.getByLabelText(/Chief Complaints/i);
    fireEvent.change(complaintsInput, { target: { value: 'High Fever & Cough' } });

    expect(complaintsInput).toHaveValue('High Fever & Cough');

    // Fast-forward timers for debounce (200ms)
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      subjective: expect.objectContaining({
        chief_complaints: 'High Fever & Cough'
      })
    }));
  });

  it('allows adding and removing medications', () => {
    const handleChange = jest.fn();
    renderWithChakra(
      <EMRForm
        initialEmrData={mockInitialData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    // Add medication
    const drugInput = screen.getByPlaceholderText(/Select or type\.\.\./i);
    fireEvent.change(drugInput, { target: { value: 'Paracetamol 500mg' } });
    
    const doseInput = screen.getByPlaceholderText(/500mg/i);
    fireEvent.change(doseInput, { target: { value: '1 tablet' } });

    const addButton = screen.getByText(/Add Medication/i);
    fireEvent.click(addButton);

    // Fast-forward timers for debounce
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(screen.getByText(/Paracetamol 500mg/i)).toBeInTheDocument();

    // Remove medication
    const removeButton = screen.getByRole('button', { name: /Remove/i });
    fireEvent.click(removeButton);

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(screen.queryByText(/Paracetamol 500mg/i)).not.toBeInTheDocument();
  });

  it('allows adding and removing lab test investigations', () => {
    const handleChange = jest.fn();
    renderWithChakra(
      <EMRForm
        initialEmrData={mockInitialData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    // Add Investigation
    const testInput = screen.getByPlaceholderText(/Select or type test\.\.\./i);
    fireEvent.change(testInput, { target: { value: 'Complete Blood Count' } });

    const addButton = screen.getByText(/Add Test/i);
    fireEvent.click(addButton);

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(screen.getByText(/Complete Blood Count/i)).toBeInTheDocument();
  });

  it('toggles chief complaints chips and appends/removes with C/O format', () => {
    const handleChange = jest.fn();
    const mockEmptyData = {
      ...mockInitialData,
      subjective: { ...mockInitialData.subjective, chief_complaints: '' }
    };
    renderWithChakra(
      <EMRForm
        initialEmrData={mockEmptyData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    // Click Fever chip
    const feverChip = screen.getByRole('button', { name: /^Fever$/i });
    fireEvent.click(feverChip);

    const complaintsInput = screen.getByLabelText(/Chief Complaints/i);
    expect(complaintsInput).toHaveValue('C/O Fever');

    // Click Cough chip
    const coughChip = screen.getByRole('button', { name: /^Cough$/i });
    fireEvent.click(coughChip);
    expect(complaintsInput).toHaveValue('C/O Fever, Cough');

    // Click Fever chip again to toggle off
    fireEvent.click(feverChip);
    expect(complaintsInput).toHaveValue('C/O Cough');

    // Click Cough chip to toggle off
    fireEvent.click(coughChip);
    expect(complaintsInput).toHaveValue('');
  });

  it('handles allergies mutual exclusion rules correctly (NKDA vs Penicillin)', () => {
    const handleChange = jest.fn();
    const mockEmptyData = {
      ...mockInitialData,
      subjective: { ...mockInitialData.subjective, allergies: '' }
    };
    renderWithChakra(
      <EMRForm
        initialEmrData={mockEmptyData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    const allergiesInput = screen.getByLabelText(/Allergies/i);

    // Select NKDA
    const nkdaChip = screen.getByRole('button', { name: /^NKDA$/i });
    fireEvent.click(nkdaChip);
    expect(allergiesInput).toHaveValue('NKDA');

    // Select Penicillin -> should clear NKDA
    const penChip = screen.getByRole('button', { name: /^Penicillin$/i });
    fireEvent.click(penChip);
    expect(allergiesInput).toHaveValue('Penicillin');

    // Select NKDA again -> should clear Penicillin
    fireEvent.click(nkdaChip);
    expect(allergiesInput).toHaveValue('NKDA');
  });

  it('handles past medical history None exclusion correctly', () => {
    const handleChange = jest.fn();
    const mockEmptyData = {
      ...mockInitialData,
      subjective: { ...mockInitialData.subjective, past_medical_history: '' }
    };
    renderWithChakra(
      <EMRForm
        initialEmrData={mockEmptyData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    const pmhInput = screen.getByLabelText(/Past Medical History/i);

    // Click Hypertension
    const htnChip = screen.getByRole('button', { name: /^Hypertension$/i });
    fireEvent.click(htnChip);
    expect(pmhInput).toHaveValue('Hypertension');

    // Click None -> should clear Hypertension
    const noneChip = screen.getByRole('button', { name: /^None$/i });
    fireEvent.click(noneChip);
    expect(pmhInput).toHaveValue('None');
  });

  it('handles general examination febrile/afebrile mutual exclusion', () => {
    const handleChange = jest.fn();
    const mockEmptyData = {
      ...mockInitialData,
      objective: {
        ...mockInitialData.objective,
        general_examination: ''
      }
    };
    renderWithChakra(
      <EMRForm
        initialEmrData={mockEmptyData}
        onChange={handleChange}
        medicineOptions={mockMedicineOptions}
        labTestOptions={mockLabTestOptions}
      />
    );

    const generalInput = screen.getByLabelText(/General Examination/i);

    // Click Febrile
    const febrileChip = screen.getByRole('button', { name: /^Febrile$/i });
    fireEvent.click(febrileChip);
    expect(generalInput).toHaveValue('Febrile');

    // Click Afebrile -> should clear Febrile
    const afebrileChip = screen.getByRole('button', { name: /^Afebrile$/i });
    fireEvent.click(afebrileChip);
    expect(generalInput).toHaveValue('Afebrile');
  });
});
