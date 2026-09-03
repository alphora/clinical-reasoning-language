import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAuthoringKit } from "../index";
import { emitFhirDefFromPath, validateCRL } from "../../index";

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
const crlArtifacts = kit.referenceArtifacts.filter((a) => a.name.endsWith(".crl"));

/**
 * The ONE artifact that legitimately does not emit, with the reason stated.
 *
 * ⚠ AN EXEMPTION MUST NAME ITS ARTIFACT AND ITS REASON. A predicate ("skip anything stamped
 * validate-only") would let the next non-emitting artifact join silently by carrying the same stamp.
 */
const NON_EMITTING: Readonly<Record<string, string>> = {
  "representation-reference.crl":
    "teaches the representation MODEL at the grammar/validator surface; its `code is` concepts " +
    "deliberately carry no `type is` and pair a local code with a top-level definition, neither of " +
    "which the emitter accepts yet. Stamped `validate-only`, and it satisfies that stamp.",
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
  for (const a of crlArtifacts) writeFileSync(join(dir, a.name), a.source);
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

    it(`⭐ ${a.name} VALIDATES clean`, () => {
      const v = validateCRL(a.source) as unknown as { errors?: unknown[] };
      expect(v.errors ?? []).toEqual([]);
    });

    if (exemptReason) {
      it(`⚠ ${a.name} is a NAMED exemption from emit — ${exemptReason.slice(0, 60)}…`, () => {
        // Pinned so the exemption is a decision, not a silence. If this artifact starts emitting, this
        // test fails and the exemption gets removed deliberately.
        const r = emitArtifact(a.name, a.source);
        expect(r.hardErrors.length).toBeGreaterThan(0);
      });
      continue;
    }

    it(`⭐ ${a.name} EMITS, with at least one case-feature StructureDefinition`, () => {
      const r = emitArtifact(a.name, a.source);
      // The message names the artifact because this is what a KE copies: a failure here means the kit
      // is teaching a shape the emitter rejects.
      expect(
        r.hardErrors.map((e) => (e as { kind?: string }).kind ?? "error"),
        `${a.name} does not emit — a KE copying it authors a shape the emitter rejects`,
      ).toEqual([]);
      expect(r.success).toBe(true);
      expect(r.caseFeatureSds).toBeGreaterThan(0);
    });
  }

  it("⚠ no locally-coded boolean criterion uses a non-Observation `type is`", () => {
    // The exact defect, pinned at the source rather than only via its emit consequence: a local `code is`
    // boolean with no source representation is an ANSWER and must be an Observation. A non-Observation
    // type is emittable only as an INFERENCE (`definition is exists this`), and bare `code is` on one is
    // neither — which is why it emitted nothing.
    for (const a of crlArtifacts) {
      if (NON_EMITTING[a.name]) continue;
      const offenders = [
        ...a.source.matchAll(/- value type is boolean\.\s*\n- type is (\w+)\.\s*\n- code is /g),
      ]
        .map((m) => m[1])
        .filter((t) => t !== "Observation");
      expect(offenders, `${a.name} declares a local boolean on ${offenders.join(", ")}`).toEqual([]);
    }
  });
});
