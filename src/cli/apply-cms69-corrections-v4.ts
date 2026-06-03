/**
 * v4 correction pass: re-fix the v3 over-flips. v3 blindly flipped every
 * <NonObs>+boolean to Observation+boolean, but many of those concepts are
 * SEMANTIC REFINEMENTS (filtered lists of a FHIR resource), not boolean
 * predicates. The right correction for a refinement-intent concept whose
 * type was wrongly declared as the resource-with-boolean is:
 *   - keep the resource type
 *   - drop the (wrong) boolean valuetype
 *   - declare no valuetype at all (per CRL v0.6's 0..* valuetype cardinality)
 *
 * Operator's correction in this round:
 *   "this should be a type Encounter, no type." (re: BMI Evaluation
 *    Encounter (not virtual) and Qualifying Encounter)
 *
 * This script takes a hardcoded refinement-intent map (concept name →
 * target resource type) and applies the v4 corrections to cms69.crl.
 */

import { readFileSync, writeFileSync } from "fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: apply-cms69-corrections-v4.ts <path-to-cms69.crl>");
  process.exit(1);
}

// Concept name → target resource type. These are the refinement-intent
// concepts that v3 wrongly flipped to Observation+boolean. The right answer
// is `type is <Resource>.` with no valuetype declaration.
const REFINEMENT_MAP: Record<string, string> = {
  // Encounter refinements
  "BMI Evaluation Encounter (not virtual)": "Encounter",
  "BMI Evaluation Encounter (not virtual) During MP": "Encounter",
  "BMI Evaluation Encounter (not virtual) Performed": "Encounter",
  "Qualifying Encounter": "Encounter",

  // Condition refinements
  "Overweight or Obese Diagnoses Active": "Condition",
  "Underweight Diagnoses Active": "Condition",
  "Pregnancy Diagnoses Active During MP": "Condition",

  // Observation refinements (non-BMI; BMI Quantity refinements stay
  // Observation+Quantity from v3 — don't touch them)
  "Pregnancy Status Overlaps MP": "Observation",
  "Pregnancy Status Verified": "Observation",
  "Pregnancy Status Documented As Pregnancy Related": "Observation",
  "BMI Observation Not Done With Reason": "Observation",
  "BMI Observation Same Day As Qualifying Encounter": "Observation",

  // ServiceRequest refinements
  "High BMI Follow-up Justified by Overweight Diagnosis": "ServiceRequest",
  "Weight Assessment Referral Justified by Overweight Diagnosis": "ServiceRequest",
  "High BMI Follow-up Order": "ServiceRequest",
  "High BMI Weight Assessment Referral": "ServiceRequest",
  "High BMI Follow-up Same Day As Qualifying Encounter": "ServiceRequest",
  "High BMI Follow-up Performed": "ServiceRequest",
  "High BMI Follow-up Not Done With Medical Reason": "ServiceRequest",
  "High BMI Follow-up Not Done With Reason": "ServiceRequest",
  "Weight Assessment Referral Same Day As Qualifying Encounter": "ServiceRequest",
  "Weight Assessment Referral Performed": "ServiceRequest",
  "Weight Assessment Referral Not Done With Medical Reason": "ServiceRequest",
  "Weight Assessment Referral Not Done With Reason": "ServiceRequest",
  "Low BMI Follow-up Justified by Underweight Diagnosis": "ServiceRequest",
  "Low BMI Follow-up Same Day As Qualifying Encounter": "ServiceRequest",
  "Low BMI Follow-up Performed": "ServiceRequest",
  "Low BMI Follow-up Not Done With Medical Reason": "ServiceRequest",
  "Low BMI Follow-up Order": "ServiceRequest",
  "Low BMI Weight Assessment Referral": "ServiceRequest",
  "Low BMI Follow-up Not Done With Reason": "ServiceRequest",

  // MedicationRequest refinements
  "High BMI Medication Justified by Overweight Diagnosis": "MedicationRequest",
  "High BMI Medication Order": "MedicationRequest",
  "High BMI Medication Same Day As Qualifying Encounter": "MedicationRequest",
  "High BMI Medication Performed": "MedicationRequest",
  "High BMI Medication Not Done With Medical Reason": "MedicationRequest",
  "High BMI Medication Not Done With Reason": "MedicationRequest",
  "Low BMI Medication Justified by Underweight Diagnosis": "MedicationRequest",
  "Low BMI Medication Order": "MedicationRequest",
  "Low BMI Medication Same Day As Qualifying Encounter": "MedicationRequest",
  "Low BMI Medication Performed": "MedicationRequest",
  "Low BMI Medication Not Done With Medical Reason": "MedicationRequest",
  "Low BMI Medication Not Done With Reason": "MedicationRequest",

  // Procedure refinements
  "High BMI Procedure Justified by Overweight Diagnosis": "Procedure",
  "High BMI Procedure Performed": "Procedure",
  "High BMI Interventions Performed": "Procedure",
  "Low BMI Procedure Justified by Underweight Diagnosis": "Procedure",
  "Low BMI Follow-up Procedures Performed": "Procedure",
  "Low BMI Procedure Performed": "Procedure",
  "Low BMI Interventions Performed": "Procedure",
};

let source = readFileSync(filePath, "utf-8");
let changed = 0;
let missed = 0;

for (const [name, targetType] of Object.entries(REFINEMENT_MAP)) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match: concept "X":\n- type is Observation.\n- value type is boolean.\n
  // Replace with: concept "X":\n- type is <TargetType>.\n
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
