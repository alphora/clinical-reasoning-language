// REFACTOR:grounded (MR10): imports must produce the supported Task token.
import { describe, expect, it } from "vitest";
import { buildCRL } from "../../../index";
import { ACTIVITY_DEFINITION_URLS, getActivityPerformClause } from "./activityDefinition";

describe("Task request import", () => {
  it.each(["#CommunicationRequest", { code: "CommunicationRequest" }, "#Task", { code: "Task" }])(
    "maps resource kind %j to a supported Task activity",
    value => {
      const result = getActivityPerformClause({ rules: [{ path: "kind", value }] });
      expect(result.clauseString).toContain("CPGTaskRequest");
      expect(result.clauseString).not.toContain("CPGCommunicationRequest");
      expect(buildCRL('library "Imported".\nactivity "Notify":\n- ' + result.clauseString.trim() + '.').success).toBe(true);
    },
  );
  it("recognizes the emitted generic computable activity profile", () => {
    expect(ACTIVITY_DEFINITION_URLS).toContain("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-computableactivity");
  });
});
