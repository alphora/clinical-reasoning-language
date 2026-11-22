// REFACTOR:grounded — qualifiers span input domains; each input retains its own interpretation domain.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateDomainSource } from "../../authoring-kit/aggregateDomainExample";
import { buildCRL } from "../../index";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { prepareSingleLibraryPublication } from "../publicationProgram";
import { produceAnyMembershipCandidate } from "../publicationAnyMembership";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function prepare(operation: "any of" | "any available value of", reverse = false) {
  const source = aggregateDomainSource(operation);
  const parsed = buildCRL(reverse ? source.replace('"Request" and "Dose"', '"Dose" and "Request"') : source); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
  const result = prepareSingleLibraryPublication(parsed.result!, { canonicalBase: "https://example.org/distinct", policyId: "distinct" });
  expect(result.diagnostics).toEqual([]);
  return result.descriptors.find(d => d.title === "Flagged")!;
}
function candidate(system: string, code?: string) {
  return { key: system, contributorId: "local", arm: "local" as const, validity: "2026-11-22", resource: {
    resourceType: "Observation", id: system === "urn:request" ? "request" : "dose", status: "final", effectiveDateTime: "2026-11-22",
    ...(code === undefined ? {} : { valueCodeableConcept: { coding: [{ system, code }] } }),
  } };
}
describe.each(["any of", "any available value of"] as const)("union-domain %s", operation => {
  // @kit selected-answer-aggregate:union-domains
  it.each([
    ["nonpreferredB", "valid10", true], ["nonpreferredC", "valid20", true], ["preferredA", "otherDose", true],
    ["preferredA", "valid10", false], ["preferredA", "valid20", false],
    [undefined, "otherDose", true], ["nonpreferredB", undefined, true],
    [undefined, undefined, false], ["preferredA", undefined, false],
  ])("classifies Request=%s Dose=%s without altering domains", (request, dose, expected) => {
    const descriptor = prepare(operation), producer = descriptor.producer!;
    expect(producer.kind).toBe("anyMembership"); if (producer.kind !== "anyMembership") return;
    expect(producer.domains.map(domain => domain.map(c => `${c.system}|${c.code}`))).toEqual([
      ["urn:request|nonpreferredB", "urn:request|nonpreferredC", "urn:request|preferredA"],
      ["urn:dose|otherDose", "urn:dose|valid10", "urn:dose|valid20"],
    ]);
    const result = produceAnyMembershipCandidate(descriptor, [request === undefined ? undefined : candidate("urn:request", request), dose === undefined ? undefined : candidate("urn:dose", dose)], "Patient/p");
    const value = operation === "any of" && !expected && (request === undefined || dose === undefined) ? undefined : expected;
    expect(result.kind).toBe("candidate");
    if (result.kind === "candidate") {
      expect(result.candidate.resource.valueBoolean).toBe(value);
      expect(result.candidate.validity).toBe(request === undefined ? undefined : "2026-11-22");
    }
  });
  it("ignores available clears and retains the authored anchor", () => {
    const result = produceAnyMembershipCandidate(prepare(operation), [candidate("urn:request"), undefined], "Patient/p");
    expect(result).toMatchObject({ kind: "candidate", candidate: { validity: "2026-11-22" } });
    if (result.kind === "candidate") expect(result.candidate.resource.valueBoolean).toBe(operation === "any of" ? undefined : false);
  });
  it.each([false, true])("rejects a foreign own-domain value beside a positive regardless of order: %s", reverse => {
    expect(produceAnyMembershipCandidate(prepare(operation, reverse), [candidate("urn:dose", "otherDose"), candidate("urn:dose", "otherDose")], "Patient/p")).toMatchObject({ kind: "error", code: "publication-uninterpretable-value" });
  });
  it("retains system identity, conflicting-coding errors and harmless foreign translations", () => {
    const descriptor = prepare(operation);
    expect(produceAnyMembershipCandidate(descriptor, [candidate("urn:dose", "nonpreferredB"), candidate("urn:dose", "otherDose")], "Patient/p")).toMatchObject({ kind: "error", code: "publication-uninterpretable-value" });
    const translated = candidate("urn:request", "preferredA");
    translated.resource.valueCodeableConcept!.coding.push({ system: "urn:dose", code: "otherDose" });
    expect(produceAnyMembershipCandidate(descriptor, [translated, candidate("urn:dose", "valid10")], "Patient/p")).toMatchObject({ kind: "candidate", candidate: { resource: { valueBoolean: false } } });
    translated.resource.valueCodeableConcept!.coding.push({ system: "urn:request", code: "nonpreferredB" });
    expect(produceAnyMembershipCandidate(descriptor, [translated, candidate("urn:dose", "otherDose")], "Patient/p")).toMatchObject({ kind: "error", code: "publication-ambiguous-coded-value" });
  });
  it("emits distinct answer ValueSets and rejects a qualifier outside the union", () => {
    const dir = mkdtempSync(join(tmpdir(), "crl-union-")); dirs.push(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "distinct", version: "1.0.0", crl: { canonicalBase: "https://example.org/distinct", date: "2026-11-22" } }));
    const file = join(dir, "policy.crl"); writeFileSync(file, aggregateDomainSource(operation));
    const emitted = emitCrlTwoLane(file, { date: "2026-11-22" }); expect(emitted.success, JSON.stringify(emitted.hardErrors)).toBe(true);
    for (const name of ["Request Answers", "Dose Answers"]) {
      const vs = emitted.fhir.resources.find(r => r.resourceType === "ValueSet" && r.sourceName === name)!;
      expect(vs, name).toBeDefined();
      expect(JSON.stringify(vs.resource)).not.toContain(name === "Request Answers" ? "urn:dose" : "urn:request");
    }
    writeFileSync(file, aggregateDomainSource(operation).replace('- code is `otherDose`.','- code is `foreign`.'));
    const invalid = emitCrlTwoLane(file, { date: "2026-11-22" });
    expect(invalid.success).toBe(false);
    expect(invalid.hardErrors.some(e => e.kind === "publication-membership-domain-coverage")).toBe(true);
  });
});
