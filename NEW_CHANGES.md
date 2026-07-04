# New Changes Tracker

This document keeps track of all recent code changes, features, and fixes made to the project application before they are committed and pushed.

## Unreleased Changes
- **EMR Overhaul**: Replaced the legacy single text `prescription_summary` field with a comprehensive structured SOAP format (Subjective, Objective, Assessment, Plan).
- **Vitals Capture**: Added support for capturing and displaying vital signs (BP, Pulse, Temp, SpO2, RR, Weight, Height).
- **Medication Duration**: Added `duration` to the medications schema along with dose, route, and frequency.
- **Save as Draft Feature**: Added the ability for doctors to save their current consultation notes as a draft without completing the consultation. This includes a "Save as Draft" button in the prescription modal and an intelligent "Save Draft & Close" prompt when attempting to close with unsaved changes.
- **Removed Summary Pane**: Removed the Right Pane "Session Summary" layout from the Doctor's Dashboard prescription modal to allow the input interface to span the full width, per user feedback.
- **Reusable EMRHistoryDisplay Component**: Built a centralized `<EMRHistoryDisplay>` React component that preserves whitespace formatting and handles legacy fallback to elegantly render the EMR structured data in both Patient Booking and Doctor Patient History views.
- Initial creation of tracking files and agent rules.

---
*(Add new changes here before making a commit)*
