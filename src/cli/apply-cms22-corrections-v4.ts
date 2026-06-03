/**
 * v4 correction pass for cms22.crl — parallel to apply-cms69-corrections-v4.ts.
 * See that file's header for the design rationale.
 */

import { readFileSync, writeFileSync } from "fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: apply-cms22-corrections-v4.ts <path-to-cms22.crl>");
  process.exit(1);
}

const REFINEMENT_MAP: Record<string, string> = {
  // Encounter refinements
  "BP Evaluation Encounter (not virtual)": "Encounter",
  "BP Evaluation Encounter (not virtual) During MP": "Encounter",
  "BP Evaluation Encounter (not virtual) Performed": "Encounter",
  "Qualifying Encounter": "Encounter",

  // Condition refinements
  "Hypertension Diagnoses Verified": "Condition",
  "Verified Hypertension": "Condition",
  "Verified Hypertension As Of Qualifying Encounter Narrative": "Condition",
  "Verified Hypertension As Of Qualifying Encounter": "Condition",

  // Observation refinements (non-BP-Quantity; BP Quantity refinements stay Quantity)
  "BP Measurement Sources Not Done With Reason": "Observation",
  "BP Measurement Sources Same Day As Qualifying Encounter": "Observation",

  // ServiceRequest refinements
  "Follow-up Within 4 Weeks Ordered": "ServiceRequest",
  "Follow-up Within 6 Months Ordered": "ServiceRequest",
  "Non-Pharmacological Recommendations Ordered": "ServiceRequest",
  "Hypertension Lab or ECG Requests Ordered": "ServiceRequest",
  "Primary-Care Referral Justified by Hypertensive Reading": "ServiceRequest",
  "Primary-Care Referrals Ordered": "ServiceRequest",
  "Four-Week Rescreen Order": "ServiceRequest",
  "Six-Month Rescreen Order": "ServiceRequest",
  "Non-Pharmacological Recommendation Order": "ServiceRequest",
  "Hypertension Lab or ECG Order": "ServiceRequest",
  "Referral for Hypertensive Reading": "ServiceRequest",
  "Six-Month Rescreen Order Same Day As Qualifying Encounter": "ServiceRequest",
  "Non-Pharm Recommendation Order Same Day As Qualifying Encounter": "ServiceRequest",
  "Referral for Hypertensive Reading Same Day As Qualifying Encounter": "ServiceRequest",
  "Four-Week Rescreen Order Same Day As Qualifying Encounter": "ServiceRequest",
  "Hypertension Lab or ECG Order Same Day As Qualifying Encounter": "ServiceRequest",
  "Follow-up Within 4 Weeks Declined by Patient": "ServiceRequest",
  "Follow-up Within 6 Months Declined by Patient": "ServiceRequest",
  "Primary-Care Referrals Declined by Patient": "ServiceRequest",
  "Non-Pharmacological Recommendations Declined by Patient": "ServiceRequest",
  "Hypertension Lab or ECG Requests Declined by Patient": "ServiceRequest",
  "Four-Week Rescreen Declined": "ServiceRequest",
  "Six-Month Rescreen Declined": "ServiceRequest",
  "Primary-Care Referral Declined": "ServiceRequest",
  "Non-Pharm Recommendation Declined": "ServiceRequest",
  "Hypertension Lab or ECG Declined": "ServiceRequest",
  "Four-Week Rescreen Declined Same Day As Qualifying Encounter": "ServiceRequest",
  "Six-Month Rescreen Declined Same Day As Qualifying Encounter": "ServiceRequest",
  "Primary-Care Referral Declined Same Day As Qualifying Encounter": "ServiceRequest",
  "Non-Pharm Recommendation Declined Same Day As Qualifying Encounter": "ServiceRequest",
  "Hypertension Lab or ECG Declined Same Day As Qualifying Encounter": "ServiceRequest",

  // MedicationRequest refinements
  "Antihypertensive Medications Ordered": "MedicationRequest",
  "Antihypertensive Medication Order": "MedicationRequest",
  "Antihypertensive Medication Order Same Day As Qualifying Encounter": "MedicationRequest",
  "Antihypertensive Medications Declined by Patient": "MedicationRequest",
  "Antihypertensive Medication Declined": "MedicationRequest",
  "Antihypertensive Medication Declined Same Day As Qualifying Encounter": "MedicationRequest",
};

let source = readFileSync(filePath, "utf-8");
let changed = 0;
let missed = 0;

for (const [name, targetType] of Object.entries(REFINEMENT_MAP)) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(concept "${escaped}":\\s*\\n)([ \\t]*)- type is Observation\\.\\s*\\n[ \\t]*- value type is boolean\\.\\s*\\n`,
    "",
  );
  const match = re.exec(source);
  if (!match) {
    console.warn(`  WARN: could not locate "${name}" with v3 Observation+boolean state`);
    missed++;
    continue;
  }
  const indent = match[2] || "";
  const replacement = `${match[1]}${indent}- type is ${targetType}.\n`;
  source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  changed++;
}

writeFileSync(filePath, source, "utf-8");
console.log(`Applied ${changed} refinement corrections (${missed} not found)`);
