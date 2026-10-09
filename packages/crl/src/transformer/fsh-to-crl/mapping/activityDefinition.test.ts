// REFACTOR:grounded (MR10): imports preserve supported activity resource kinds.
import { describe, expect, it } from "vitest";
import { buildCRL } from "../../../index";
import { ACTIVITY_DEFINITION_URLS, getActivityPerformClause } from "./activityDefinition";

describe("Task request import", () => {
  it.each([["#CommunicationRequest", "CPGCommunicationRequest"], [{ code: "CommunicationRequest" }, "CPGCommunicationRequest"], ["#Task", "CPGTaskRequest"], [{ code: "Task" }, "CPGTaskRequest"], ["#ServiceRequest", "CPGServiceRequest"]])(
    "preserves resource kind %j as %s",
    (value, token) => {
      const result = getActivityPerformClause({ rules: [{ path: "kind", value }] });
      expect(result.clauseString).toContain(token as string);
      expect(buildCRL('library "Imported".\nactivity "Notify":\n- ' + result.clauseString.trim() + '.').success).toBe(true);
    },
  );
  it("recognizes the emitted generic computable activity profile", () => {
    expect(ACTIVITY_DEFINITION_URLS).toContain("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-computableactivity");
  });
});
