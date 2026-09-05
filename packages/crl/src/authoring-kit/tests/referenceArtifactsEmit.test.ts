import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAuthoringKit } from "../index";
import { emitFhirDefFromPath, validateCRL } from "../../index";
import { parseInput } from "../../ast/tests/parseInput";

/**
 * ⭐⭐ EVERY REFERENCE ARTIFACT MUST EMIT. This is the gate whose absence let SIX of seven ship broken.
 *
 * ⚠ HOW THE KIT SHIPPED NON-EMITTING EXEMPLARS. Ten locally-coded boolean criteria were authored
 * `type is Condition` (and one `AllergyIntolerance`) — the clinically honest type, and the one a KE
 * reaches for. A local `code is` boolean with no source representation is an ANSWER, and an answer is
 * stored as an Observation; a non-Observation type is emittable only as an INFERENCE over records
 * (`definition is exists this`). Bare `code is` on a non-Observation type is neither, so it emitted no
 * case-feature StructureDefinition at all.
 *
 * ⚠ NOTHING CAUGHT IT because every artifact was stamped `verification: "cre-run"` and the CRE never
 * consults the FHIR emitter. The kit suite validated them, the CRE ran them, and both passed while
 * `pa-determination-reference.crl` — the artifact a KE copies to author a PA criterion — produced ZERO
 * case features. A knowledge engineer lost a day to it and reported it; it took an external report,
 * because no test here related an exemplar to the emitter.
 *
 * ⭐ THE PROPERTY WORTH HAVING, in the reporter's words: a verification claim must FAIL when the
 * artifact stops satisfying it, not record that someone once checked. That is what this file is.
 */

const kit = getAuthoringKit("local-decision-support", "prior-auth");
const crlArtifacts = kit.referenceArtifacts.filter((a) => a.language === "crl");

const bareNonObservationAnswers = (source: string) => parseInput(source).statements
  .filter(c => c.type === "Concept" && c.code && c.valueTypes.includes("boolean") &&
    (!c.shape || c.shape === "Scalar") && !c.definition && c.representations.length === 0 &&
    c.conceptType !== "Observation")
  .map(c => c.type === "Concept" ? c.name : "");

/**
 * The ONE artifact that legitimately does not emit, with the reason stated.
 *
 * ⚠ AN EXEMPTION MUST NAME ITS ARTIFACT AND ITS REASON. A predicate ("skip anything stamped
 * validate-only") would let the next non-emitting artifact join silently by carrying the same stamp.
 */
const NON_EMITTING: Readonly<Record<string, string>> = {
  "representation-reference.crl":
    "teaches the representation MODEL at the grammar/validator surface; its `code is` concepts " +
    "pair a local code with top-level DefinitionIsDefinition forms (Up To Date On Mammography, BMI, " +
    "High BMI) that still produce emit-mixed-code-and-definition. Stamped validate-only, and it satisfies that stamp.",
};

const PROJECT = {
  "package.json": JSON.stringify({
    name: "kit-emit-probe",
    version: "1.0.0",
    private: true,
    crl: {
      canonicalBase: "http://example.org/kit-emit-probe",
      status: "draft",
      experimental: true,
      date: "2026-01-01T00:00:00.000Z",
      dispositions: {
        version: 1,
        mode: "embedded",
        options: {
          certify: { Approve: { label: "Certified" } },
          "not-certify": { Deny: { label: "Not certified" } },
        },
      },
    },
  }),
};

const emitArtifact = (name: string, source: string) => {
  const dir = mkdtempSync(join(tmpdir(), "crl-kit-emit-"));
  for (const [f, body] of Object.entries(PROJECT)) writeFileSync(join(dir, f), body);
  // Every `.crl` artifact is written, so a cross-library reference resolves.
  for (const a of crlArtifacts)
    writeFileSync(join(dir, a.name), a.name === name ? source : a.source);
  const r = emitFhirDefFromPath(join(dir, name));
  return {
    success: r.success,
    hardErrors: (r.errors ?? []).filter((e) => e.severity !== "warning"),
    caseFeatureSds: r.resources.filter((x) => x.resourceType === "StructureDefinition").length,
  };
};

describe("every kit reference artifact does what its stamp claims", () => {
  it("⭐ the kit ships reference artifacts at all (guards a vacuous suite)", () => {
    expect(crlArtifacts.length).toBeGreaterThan(3);
  });

  for (const a of crlArtifacts) {
    const exemptReason = NON_EMITTING[a.name];

    it(`${a.name} carries exactly the emit claim its executed gate supports`, () => {
      expect(a.verification.includes("fhir-emit")).toBe(!exemptReason);
    });

    it(`⭐ ${a.name} VALIDATES clean`, () => {
      const v = validateCRL(a.source) as unknown as { errors?: unknown[] };
      expect(v.errors ?? []).toEqual([]);
    });

    if (exemptReason) {
      it(`⚠ ${a.name} is a NAMED exemption from emit — ${exemptReason.slice(0, 60)}…`, () => {
        // Pinned so the exemption is a decision, not a silence. If this artifact starts emitting, this
        // test fails and the exemption gets removed deliberately.
        const r = emitArtifact(a.name, a.source);
        expect(r.hardErrors).toHaveLength(3);
        for (const name of ["Up To Date On Mammography", "BMI", "High BMI"]) {
          expect(r.hardErrors).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: "emit-mixed-code-and-definition", message: expect.stringContaining(`"${name}"`) }),
          ]));
        }
      });
      continue;
    }

    it(`⭐ ${a.name} EMITS, with at least one case-feature StructureDefinition`, () => {
      const r = emitArtifact(a.name, a.source);
      // The message names the artifact because this is what a KE copies: a failure here means the kit
      // is teaching a shape the emitter rejects.
      expect(
        r.hardErrors.map((e) => (e as { kind?: string }).kind ?? "error"),
        `${a.name} or its dependency closure does not emit: ${JSON.stringify(r.hardErrors)}`,
      ).toEqual([]);
      expect(r.success).toBe(true);
      expect(r.caseFeatureSds).toBeGreaterThan(0);
    });
  }

  it("a broken reference cannot retain an apparently successful FHIR emission", () => {
    const a = crlArtifacts.find((a) => a.name === "decision-reference.crl")!;
    const broken = a.source.replace("- type is Observation.", "");
    expect(broken).not.toBe(a.source);
    const r = emitArtifact(a.name, broken);
    expect(r.success).toBe(false);
    expect(r.hardErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "emit-local-code-missing-type", message: expect.stringContaining('"Hard Exclusion"') }),
    ]));
  });

  it("CEL companions carry no unexecuted FHIR-emission claim", () => {
    for (const a of kit.referenceArtifacts.filter((a) => a.language === "cel")) {
      expect(a.verification).not.toContain("fhir-emit");
    }
  });

  it("bare local boolean answers use Observation; record derivations retain their resource type", () => {
    // The exact defect, pinned at the source rather than only via its emit consequence: a local `code is`
    // boolean with no source representation is an ANSWER and must be an Observation. A non-Observation
    // type is emittable only as an INFERENCE (`definition is exists this`), and bare `code is` on one is
    // neither — which is why it emitted nothing.
    for (const a of crlArtifacts) {
      if (NON_EMITTING[a.name]) continue;
      expect(bareNonObservationAnswers(a.source), a.name).toEqual([]);
    }
  });

  it("the answer check admits Condition existence and catches a bare answer regardless of line order", () => {
    const source = 'library "T".\nconcept "Prior Surgery":\n- type is Condition.\n- code is `prior-surgery`.\n- value type is boolean.\n- definition is exists this.';
    expect(bareNonObservationAnswers(source)).toEqual([]);
    expect(bareNonObservationAnswers(source.replace('- definition is exists this.', ''))).toEqual(["Prior Surgery"]);
  });
});
