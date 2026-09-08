import { isFhirDefError } from "../../fhir-emitter/types";
// REFACTOR:grounded (#320, review622): all positive reference concepts are selected publications.
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAuthoringKit } from "../index";
import { ANSWER_EXAMPLE_BASE } from "../answerExample";
import { emitFhirDefFromPath } from "../../index";
import { validateCRLImports } from "../../imports/validate";
import { publicationAdmissionReason } from "../../emit/publicationProgram";
import { parseInput } from "../../ast/tests/parseInput";

/**
 * Each delivered CRL reference must validate in its actual project/dependency
 * context and emit its advertised resources. Emission is separate from CRE/native
 * behavior. Current local answers use selected Observation publications;
 * non-Observation source questions do not have a universal existence rewrite.
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
          "not-certify": { Deny: { label: "Not certified" }, EIU: { label: "Experimental/investigational/unproven" } },
        },
      },
    },
  }),
};

const materializeArtifact = (name: string, source: string) => {
  const dir = mkdtempSync(join(tmpdir(), "crl-kit-emit-"));
  for (const [f, body] of Object.entries(PROJECT)) {
    const config = JSON.parse(body);
    if (name.startsWith("named-answer-")) {
      config.crl.canonicalBase = ANSWER_EXAMPLE_BASE;
    }
    if (!["pa-determination-reference.crl", "source-delegated-decision-reference.crl", "disposition-arbitration-reference.crl"].includes(name)) delete config.crl.dispositions;
    writeFileSync(join(dir, f), JSON.stringify(config));
  }
  // Materialize only this example and its actual dependency closure.
  writeFileSync(join(dir, name), source);
  if (name === "named-answer-reference.crl") {
    const terms = crlArtifacts.find(a => a.name === "named-answer-terms.crl")!;
    writeFileSync(join(dir, terms.name), terms.source);
  }
  return join(dir, name);
};
const emitArtifact = (name: string, source: string) => {
  const r = emitFhirDefFromPath(materializeArtifact(name, source));
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
      const v = validateCRLImports(materializeArtifact(a.name, a.source));
      expect(v.importDiagnostics).toEqual([]);
      expect(v.validationErrors).toEqual([]);
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
