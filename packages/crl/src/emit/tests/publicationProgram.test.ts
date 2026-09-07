import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import type { CRL } from "../../ast/types";
import { adaptBooleanPublicationCandidate, prepareSingleLibraryPublication } from "../publicationProgram";
import { selectPublicationCandidate } from "../publicationSelection";

// REFACTOR:grounded (#320, review 560): absence, false, and invalid data are distinct.
const source = `library "P".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
`;
function ast(text = source): CRL {
  const result = buildCRL(text);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.result!;
}
const program = () => prepareSingleLibraryPublication(ast(), { canonicalBase: "https://example.org", localDomainId: "p" });
const record = (extra: Record<string, unknown> = {}) => ({ resourceType: "Observation", id: "answer-1", status: "final", ...extra });

describe("admitted local Boolean publication", () => {
  it("retains one qualified descriptor without emitting its file identity", () => {
    const raw = ast();
    const before = JSON.stringify(raw);
    const prepared = prepareSingleLibraryPublication(raw, { canonicalBase: "https://example.org", localDomainId: "p" }, "E:/private/source.crl");
    const descriptor = prepared.descriptors[0];
    expect(prepared.diagnostics).toEqual([]);
    expect(descriptor.identity.sourceIdentity).toBe("E:/private/source.crl");
    expect(descriptor.conceptId).toBe("https://example.org/CodeSystem/p-local#answer");
    expect(descriptor.localContributorId).not.toContain("private");
    expect(prepared.lookup("E:/private/source.crl", "Answer")).toEqual({ kind: "publication", descriptor });
    expect(JSON.stringify(raw)).toBe(before);
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it.each([
    ["shape", source.replace("shape is Record", "shape is Scalar")],
    ["resource", source.replace("type is Observation", "type is Condition")],
    ["value", source.replace("value type is boolean", "value type is string")],
    ["code", source.replace("- code is `answer`.\n", "")],
    ["old selector", source + '- definition is most recent this.\n'],
  ])("refuses unsupported %s without treating it as legacy", (_label, text) => {
    const p = prepareSingleLibraryPublication(ast(text), { canonicalBase: "https://example.org" });
    expect(p.descriptors).toHaveLength(0);
    expect(p.diagnostics).toHaveLength(1);
    expect(p.lookup("P", "Answer").kind).toBe("error");
  });

  it("requires local coding identity metadata", () => {
    const p = prepareSingleLibraryPublication(ast(), {});
    expect(p.diagnostics[0].kind).toBe("missing-canonical-url-base");
  });

  it.each([false, true, null, undefined])("retains exact resource and datum %s", (value) => {
    const descriptor = program().descriptors[0];
    const resource = record(value === undefined ? {} : { valueBoolean: value });
    const adapted = adaptBooleanPublicationCandidate(descriptor, resource);
    expect(adapted.kind).toBe("candidate");
    if (adapted.kind !== "candidate") throw new Error(adapted.message);
    const selected = selectPublicationCandidate([adapted.candidate], { conceptId: descriptor.conceptId, equalTime: "error" });
    expect(selected.state).toBe("selected");
    if (selected.state === "selected") expect(selected.candidate.resource).toBe(resource);
  });

  it.each([
    [{ valueQuantity: { value: 5 } }, "publication-invalid-value"],
    [{ valueBoolean: "false" }, "publication-invalid-value"],
    [{ effectivePeriod: { start: "2026-01-01" } }, "publication-invalid-validity-choice"],
    [{ effectiveDateTime: 123 }, "publication-invalid-validity-choice"],
    [{ status: "entered-in-error" }, "publication-invalidated-record"],
    [{ status: "cancelled" }, "publication-invalidated-record"],
    [{ status: undefined }, "publication-invalid-status"],
    [{ status: "not-a-fhir-status" }, "publication-invalid-status"],
  ])("does not turn an observable violation into missing data", (extra, code) => {
    expect(adaptBooleanPublicationCandidate(program().descriptors[0], record(extra))).toMatchObject({ kind: "error", code });
  });

  it.each(["registered", "preliminary", "final", "amended", "corrected", "unknown"])(
    "status %s alone neither discards the record nor supplies a value",
    (status) => {
      const descriptor = program().descriptors[0];
      const resource = record({ status, effectiveDateTime: "2026-09-06T11:00:00Z" });
      const old = adaptBooleanPublicationCandidate(descriptor, record({ id: "old", valueBoolean: true, effectiveDateTime: "2026-01-01" }));
      const current = adaptBooleanPublicationCandidate(descriptor, resource);
      if (old.kind !== "candidate" || current.kind !== "candidate") throw new Error("Expected valid candidates");
      const selected = selectPublicationCandidate([old.candidate, current.candidate], { conceptId: descriptor.conceptId, equalTime: "error" });
      expect(selected.state).toBe("selected");
      if (selected.state === "selected") expect(selected.candidate.resource).toBe(resource);
      expect(resource).not.toHaveProperty("valueBoolean");
    },
  );

  it("does not fabricate missing retrieved identity", () => {
    const descriptor = program().descriptors[0];
    const adapted = adaptBooleanPublicationCandidate(descriptor, record({ id: undefined }));
    if (adapted.kind !== "candidate") throw new Error(adapted.message);
    expect(selectPublicationCandidate([adapted.candidate], { conceptId: descriptor.conceptId, equalTime: "error" }))
      .toMatchObject({ state: "failed", diagnostic: { code: "publication-missing-input-identity" } });
  });

  const absentPrimitive = { extension: [{ url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason", valueCode: "unknown" }] };
  it.each([
    ["_valueString", "publication-invalid-value"],
    ["_effectiveInstant", "publication-invalid-validity-choice"],
  ])("rejects extension-only wrong choice %s even for a newer row", (key, code) => {
    const descriptor = program().descriptors[0];
    for (const extra of [{}, { effectiveDateTime: "2026-09-06T11:00:00Z" }]) {
      expect(adaptBooleanPublicationCandidate(descriptor, record({ ...extra, [key]: absentPrimitive })))
        .toMatchObject({ kind: "error", code });
    }
  });

  it.each(["_valueBoolean", "_effectiveDateTime"])("preserves an allowed extension-only choice %s as unknown", (key) => {
    const descriptor = program().descriptors[0];
    const resource = record({ [key]: absentPrimitive });
    const adapted = adaptBooleanPublicationCandidate(descriptor, resource);
    expect(adapted.kind).toBe("candidate");
    if (adapted.kind !== "candidate") throw new Error(adapted.message);
    expect(adapted.candidate.resource).toBe(resource);
    expect(adapted.candidate.validity).toBeUndefined();
    expect(selectPublicationCandidate([adapted.candidate], { conceptId: descriptor.conceptId, equalTime: "error" }).state).toBe("selected");
  });
});
