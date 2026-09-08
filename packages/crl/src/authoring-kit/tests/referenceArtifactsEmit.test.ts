import { isFhirDefError } from "../../fhir-emitter/types";
// REFACTOR:grounded (#320, review622): all positive reference concepts are selected publications.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAuthoringKit } from "../index";
import { ANSWER_EXAMPLE_BASE } from "../answerExample";
import { emitFhirDefFromPath, validateCRL } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import { publicationAdmissionReason } from "../../emit/publicationProgram";
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
  for (const [f, body] of Object.entries(PROJECT)) {
    const config = JSON.parse(body);
    if (name.startsWith("named-answer-")) {
      config.crl.canonicalBase = ANSWER_EXAMPLE_BASE;
      delete config.crl.dispositions;
    }
    writeFileSync(join(dir, f), JSON.stringify(config));
  }
  // Every `.crl` artifact is written, so a cross-library reference resolves.
  for (const a of crlArtifacts)
    writeFileSync(join(dir, a.name), a.name === name ? source : a.source);
  const r = emitFhirDefFromPath(join(dir, name));
  return {
    resources: r.resources,
    success: r.success,
    hardErrors: (r.errors ?? []).filter(isFhirDefError),
    caseFeatureSds: r.resources.filter((x) => x.resourceType === "StructureDefinition").length,
  };
};

describe("every kit reference artifact does what its stamp claims", () => {
  it("⭐ the kit ships reference artifacts at all (guards a vacuous suite)", () => {
    expect(crlArtifacts.length).toBeGreaterThan(3);
  });

  for (const a of crlArtifacts) {


    it(`${a.name} carries exactly the emit claim its executed gate supports`, () => {
      expect(a.verification.includes("fhir-emit")).toBe(true);
    });

    it(`⭐ ${a.name} VALIDATES clean`, () => {
      if (a.name === "named-answer-reference.crl") {
        const dir = mkdtempSync(join(tmpdir(), "crl-kit-imports-"));
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "answers", version: "1.0.0", crl: { canonicalBase: ANSWER_EXAMPLE_BASE } }));
        for (const dependency of crlArtifacts.filter((item) => item.name.startsWith("named-answer-")))
          writeFileSync(join(dir, dependency.name), dependency.source);
        const v = validateCRLImports(join(dir, a.name));
        expect(v.importDiagnostics).toEqual([]);
        expect(v.validationErrors).toEqual([]);
      } else {
        const v = validateCRL(a.source) as unknown as { errors?: unknown[] };
        expect(v.errors ?? []).toEqual([]);
      }
    });

    it(`⭐ ${a.name} EMITS its expected definition resources`, () => {
      const r = emitArtifact(a.name, a.source);
      // The message names the artifact because this is what a KE copies: a failure here means the kit
      // is teaching a shape the emitter rejects.
      expect(
        r.hardErrors.map((e) => (e as { kind?: string }).kind ?? "error"),
        `${a.name} or its dependency closure does not emit: ${JSON.stringify(r.hardErrors)}`,
      ).toEqual([]);
      expect(r.success).toBe(true);
      if (a.name === "named-answer-terms.crl") {
        expect(r.caseFeatureSds).toBe(0);
        expect(r.resources.some((resource) => resource.resourceType === "ValueSet")).toBe(true);
      } else {
        expect(r.caseFeatureSds).toBeGreaterThan(0);
        if (a.name === "named-answer-reference.crl") {
          expect(r.resources.find((resource) => (resource.resource as any).url === `${ANSWER_EXAMPLE_BASE}/CodeSystem/p-complaint-answer-codes`)?.resource)
            .toMatchObject({ concept: [{ code: "none", display: "None" }] });
        }
      }
    });
  }

  it("a broken reference cannot retain an apparently successful FHIR emission", () => {
    const a = crlArtifacts.find((a) => a.name === "pa-determination-reference.crl")!;
    const broken = a.source.replace("- type is Observation.", "");
    expect(broken).not.toBe(a.source);
    const r = emitArtifact(a.name, broken);
    expect(r.success).toBe(false);
    expect(r.hardErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "publication-unsupported-form", message: expect.stringContaining('"Has Qualifying Diagnosis"') }),
    ]));
  });

  it("CEL companions carry no unexecuted FHIR-emission claim", () => {
    for (const a of kit.referenceArtifacts.filter((a) => a.language === "cel")) {
      expect(a.verification).not.toContain("fhir-emit");
    }
  });

  const unsupportedConcepts = (source: string) => parseInput(/^library\s/m.test(source) ? source : 'library "Snippet".\n' + source).statements
    .filter(c => c.type === "Concept")
    .flatMap(c => { const reason = publicationAdmissionReason(c); return reason ? [c.name + ": " + reason] : []; });

  it("every positive delivered concept uses the admitted publication contract", () => {
    for (const useCase of ["cpg", "prior-auth"] as const) {
      const payload = getAuthoringKit(undefined, useCase);
      const sources = [
        ...payload.referenceArtifacts.filter(a => a.language === "crl").map(a => ({ name: a.name, source: a.source })),
        ...payload.examples.filter(e => e.language === "crl" && e.valid).map(e => ({ name: e.title, source: e.snippet })),
      ];
      expect(sources.length).toBeGreaterThan(5);
      for (const example of sources) expect(unsupportedConcepts(example.source), example.name).toEqual([]);
    }
  });

  it("the admission gate catches implicit Scalar, explicit Scalar and inactive Record markers", () => {
    const source = 'concept "Answer":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `answer`.\n- shape reduction is most recent.';
    expect(unsupportedConcepts(source)).toEqual([]);
    for (const broken of [source.replace('- shape is Record.', ''), source.replace('shape is Record', 'shape is Scalar'), source.replace('- shape reduction is most recent.', '')]) {
      expect(unsupportedConcepts(broken)).toHaveLength(1);
    }
  });
});
