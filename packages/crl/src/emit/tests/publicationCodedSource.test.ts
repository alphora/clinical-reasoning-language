import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { prepareSingleLibraryPublication } from "../publicationProgram";
import {
  adaptObservationPublicationCandidate,
  type PublicationObservationSource,
} from "../publicationSource";
import { CODED_SOURCE_POLICY } from "../../authoring-kit/codedSourceExample";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
const options = { canonicalBase: "https://example.org/coded-source", policyId: "coded-source" };
function prepare(policy = CODED_SOURCE_POLICY) {
  const built = buildCRL(policy);
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  const program = prepareSingleLibraryPublication(built.result!, options);
  expect(program.diagnostics).toEqual([]);
  return { ast: built.result!, descriptor: program.descriptors.find((d) => d.title === "Result")! };
}
describe("coded Observation source emission", () => {
  // @kit source-representation:coded-value-preservation
  it.each([false, true])(
    "preserves full value and lineage with optional local answer=%s",
    (local) => {
      const { descriptor: d } = prepare(
        local
          ? CODED_SOURCE_POLICY.replace(
              'concept "Result":',
              'concept "Result":\n- code is `result`.',
            )
          : CODED_SOURCE_POLICY,
      );
      const value = {
        coding: [
          { system: "urn:synthetic:result", code: "negative", version: "1", display: "Negative" },
          { system: "urn:other", code: "extra" },
        ],
        text: "Original text",
      };
      const resource = {
        resourceType: "Observation",
        id: "source",
        status: "final",
        subject: { reference: "Patient/p" },
        code: { coding: [{ system: "urn:synthetic:test", code: "result" }] },
        valueCodeableConcept: value,
        effectiveDateTime: "2026-01-01",
      };
      const before = structuredClone(resource),
        result = adaptObservationPublicationCandidate(
          d,
          d.sources![0] as PublicationObservationSource,
          resource,
          "Patient/p",
        );
      expect(result).toMatchObject({
        kind: "candidate",
        candidate: {
          retrievedInputIdentity: "Observation/source",
          validity: "2026-01-01",
          resource: {
            valueCodeableConcept: value,
            derivedFrom: [{ reference: "Observation/source" }],
          },
        },
      });
      expect(resource).toEqual(before);
      expect(Boolean(d.localCode)).toBe(local);
      expect(Boolean(d.profileUrl)).toBe(local);
    },
  );
  it("emits typed source helpers and qualified references across partitions", () => {
    const { ast } = prepare();
    const direct = emitCQLFromAST(ast, options);
    expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
    expect(direct.result).toContain("ObservationCodeableCandidate");
    expect(direct.result).toContain("value: S.value as FHIR.CodeableConcept");
    const full = emitPartitioned(
      lowerLocalCodes(ast, options).ast,
      "Coded Source",
      options.policyId,
      FULL_PARTITION,
      options,
    );
    expect(full.success, JSON.stringify(full.errors)).toBe(true);
    expect(full.entries.map((e) => e.result.result).join("\n")).toContain('."Result Source 1"');
  });
});
