import { describe, expect, it } from "@jest/globals";

import {
  ALL_CPG_ACTIVITY_PROFILES,
  CPG_ACTIVITY_TYPE_CODE_SYSTEM,
  lookupCpgActivityProfile,
} from "../cpgActivityProfiles";

const CPG_BASE = "http://hl7.org/fhir/uv/cpg/StructureDefinition";

describe("cpgActivityProfiles — IG-verified mapping table", () => {
  it("contains exactly 14 entries matching the CRL grammar allowlist", () => {
    expect(ALL_CPG_ACTIVITY_PROFILES.length).toBe(14);
    const tokens = ALL_CPG_ACTIVITY_PROFILES.map((e) => e.token).sort();
    expect(tokens).toEqual(
      [
        "CPGAdministerMedication",
        "CPGCommunicationRequest",
        "CPGDispenseMedication",
        "CPGDocumentMedication",
        "CPGEnrollment",
        "CPGGenerateReport",
        "CPGImmunizationRequest",
        "CPGMedicationRequest",
        "CPGProposeDiagnosis",
        "CPGQuestionnaire",
        "CPGRecordDetectedIssue",
        "CPGRecordInference",
        "CPGReportFlag",
        "CPGServiceRequest",
      ],
    );
  });

  it("lookupCpgActivityProfile returns null for unknown tokens", () => {
    expect(lookupCpgActivityProfile("CPGNotAToken")).toBeNull();
    expect(lookupCpgActivityProfile("")).toBeNull();
  });

  it("every profileUrl uses the verified `cpg-<lowercase>activity` form (no hyphen before 'activity')", () => {
    for (const { token, profile } of ALL_CPG_ACTIVITY_PROFILES) {
      expect(profile.profileUrl.startsWith(CPG_BASE + "/cpg-")).toBe(true);
      expect(profile.profileUrl.endsWith("activity")).toBe(true);
      // Negative: no hyphen-before-activity form.
      expect(profile.profileUrl.endsWith("-activity")).toBe(false);
      // Negative: matches the lowercase pattern; no capitals after the prefix.
      const tail = profile.profileUrl.slice(CPG_BASE.length + 1);
      expect(tail).toBe(tail.toLowerCase());
      // Sanity: ServiceRequest's profileUrl is the verified value.
      if (token === "CPGServiceRequest") {
        expect(profile.profileUrl).toBe(`${CPG_BASE}/cpg-servicerequestactivity`);
      }
    }
  });

  it("targetProfile URLs match the IG Request profile form `cpg-<name>` (no `activity` suffix)", () => {
    for (const { token, profile } of ALL_CPG_ACTIVITY_PROFILES) {
      expect(profile.targetProfile.startsWith(CPG_BASE + "/cpg-")).toBe(true);
      expect(profile.targetProfile.endsWith("activity")).toBe(false);
      if (token === "CPGServiceRequest") {
        expect(profile.targetProfile).toBe(`${CPG_BASE}/cpg-servicerequest`);
      }
      if (token === "CPGMedicationRequest") {
        expect(profile.targetProfile).toBe(`${CPG_BASE}/cpg-medicationrequest`);
      }
      if (token === "CPGImmunizationRequest") {
        expect(profile.targetProfile).toBe(`${CPG_BASE}/cpg-immunizationrequest`);
      }
    }
  });

  it("activityTypeCode is kebab-case (lower + hyphen + digit only)", () => {
    for (const { profile } of ALL_CPG_ACTIVITY_PROFILES) {
      expect(profile.activityTypeCode).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });

  it("kind values match the IG-verified table", () => {
    const expected: Record<string, string> = {
      CPGServiceRequest: "ServiceRequest",
      CPGMedicationRequest: "MedicationRequest",
      CPGImmunizationRequest: "MedicationRequest",
      CPGCommunicationRequest: "CommunicationRequest",
      CPGQuestionnaire: "Task",
      CPGEnrollment: "Task",
      CPGProposeDiagnosis: "Task",
      CPGRecordDetectedIssue: "Task",
      CPGRecordInference: "Task",
      CPGReportFlag: "Task",
      CPGGenerateReport: "Task",
      CPGDispenseMedication: "Task",
      CPGDocumentMedication: "Task",
      CPGAdministerMedication: "Task",
    };
    for (const { token, profile } of ALL_CPG_ACTIVITY_PROFILES) {
      expect(profile.kind).toBe(expected[token]);
    }
  });

  it("dynamicValuePath is null for the v2.1-deferred profiles (CPGCommunicationRequest, CPGQuestionnaire)", () => {
    expect(lookupCpgActivityProfile("CPGCommunicationRequest")!.dynamicValuePath).toBeNull();
    expect(lookupCpgActivityProfile("CPGQuestionnaire")!.dynamicValuePath).toBeNull();
  });

  it("dynamicValuePath is `medicationCodeableConcept` for medication-family activities", () => {
    expect(lookupCpgActivityProfile("CPGMedicationRequest")!.dynamicValuePath).toBe("medicationCodeableConcept");
    expect(lookupCpgActivityProfile("CPGImmunizationRequest")!.dynamicValuePath).toBe("medicationCodeableConcept");
  });

  it("dynamicValuePath is `code` for ServiceRequest + Task-family activities", () => {
    expect(lookupCpgActivityProfile("CPGServiceRequest")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGEnrollment")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGProposeDiagnosis")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGRecordInference")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGReportFlag")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGGenerateReport")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGDispenseMedication")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGDocumentMedication")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGAdministerMedication")!.dynamicValuePath).toBe("code");
    expect(lookupCpgActivityProfile("CPGRecordDetectedIssue")!.dynamicValuePath).toBe("code");
  });

  it("CPG_ACTIVITY_TYPE_CODE_SYSTEM points at the IG-verified CodeSystem canonical", () => {
    expect(CPG_ACTIVITY_TYPE_CODE_SYSTEM).toBe(
      "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-activity-type-cs",
    );
  });
});
