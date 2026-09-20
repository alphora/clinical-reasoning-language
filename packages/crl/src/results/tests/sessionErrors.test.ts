import { describe, expect, it } from "vitest";
import { inspectSessionOutcome } from "../sessionErrors";
// REFACTOR:grounded: exit zero/Q presence cannot mask structured or log-only native failures.
const q = { resourceType: "Questionnaire", id: "q" };
const params = (extra: unknown[] = []) => ({ resourceType: "Parameters", parameter: [{ name: "return", resource: q }, ...extra] });
describe("native session outcome classification", () => {
  it.each(["error", "fatal"])("fails nested %s OperationOutcome beside a Questionnaire", severity => {
    const result = params([{ name: "return", resource: { resourceType: "Bundle", entry: [{ resource: { resourceType: "OperationOutcome", issue: [{ severity, code: "invalid", diagnostics: "bad input" }] } }] } }]);
    expect(inspectSessionOutcome(result, "", "")).toContainEqual(expect.objectContaining({ severity: "error", message: "bad input" }));
  });
  it("fails error parameters including nested parts with clean logs", () => {
    const result = params([{ name: "return", part: [{ name: "error", valueString: "failed" }] }]);
    expect(inspectSessionOutcome(result, "", "").some(d => d.severity === "error")).toBe(true);
  });
  it("fails stdout-only errors and never suppresses questionnaire lookup failures", () => {
    expect(inspectSessionOutcome(params(), "ERROR unexpected", "")[0]).toMatchObject({ severity: "error", source: "stdout" });
    expect(inspectSessionOutcome(params(), "", "ERROR No resource of type Questionnaire found for url: urn:q")[0].severity).toBe("error");
  });
  it("retains warnings separately", () => {
    const ds = inspectSessionOutcome(params([{ name: "return", resource: { resourceType: "OperationOutcome", issue: [{ severity: "warning", code: "incomplete" }] } }]), "", "WARN caution");
    expect(ds).toHaveLength(2); expect(ds.every(d => d.severity === "warning")).toBe(true);
  });
  it("rejects missing/non-Parameters output without interpreting missing Q as an error", () => {
    expect(inspectSessionOutcome(undefined, "", "")[0].severity).toBe("error");
    expect(inspectSessionOutcome({ resourceType: "Parameters", parameter: [] }, "", "")).toEqual([]);
  });
});
