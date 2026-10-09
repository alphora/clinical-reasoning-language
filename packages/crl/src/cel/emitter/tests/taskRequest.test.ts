// REFACTOR:grounded (MR10): shared CRL/CEL Task controls; native execution is recorded separately.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCRL } from "../../../index";
import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";

const fixture = path.resolve(__dirname, "../../../tests/fixtures/task-request/cases.cel");

describe("CPGTaskRequest replacement", () => {
  it("accepts distinct Task and CommunicationRequest activity types", () => {
    const source = 'library "Test".\nactivity "Notify":\n- request CPGTaskRequest.\n';
    expect(buildCRL(source).success).toBe(true);
    const communication = buildCRL(source.replace("CPGTaskRequest", "CPGCommunicationRequest"));
    expect(communication.success).toBe(true);
    expect(communication.result!.statements[0].type).toBe("Activity");
    expect((communication.result!.statements[0] as any).body.request.activityType).toBe("CPGCommunicationRequest");
  });

  it("emits activity-derived Task facts with required fields, patient binding and standard prohibition", () => {
    const result = emitCelToFhir(resolveCelImports(fixture));
    expect(result.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    const tasks = result.emittedCases.flatMap(c => c.resources).filter(r => r.resourceType === "Task");
    expect(tasks).toHaveLength(2);
    for (const task of tasks) {
      expect(task.body.status).toBe("draft");
      expect(task.body.intent).toBe("proposal");
      expect(task.body.for).toEqual({ reference: expect.stringMatching(/^Patient\//) });
      expect(task.body).not.toHaveProperty("subject");
      expect(task.body).not.toHaveProperty("doNotPerform");
      expect(task.body.meta).toEqual({ profile: ["http://hl7.org/fhir/StructureDefinition/Task"] });
    }
    const prohibited = tasks.find(t => JSON.stringify(t.body.code).includes("do-not-notify"));
    expect(prohibited).toBeDefined();
    expect(prohibited!.body.modifierExtension).toEqual([
      { url: "http://hl7.org/fhir/StructureDefinition/request-doNotPerform", valueBoolean: true },
    ]);
    const ordinary = tasks.find(t => t !== prohibited)!;
    expect(ordinary.body.modifierExtension).toBeUndefined();
  });
});
