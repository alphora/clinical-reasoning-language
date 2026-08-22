import * as path from "path";

import { describe, expect, it } from "vitest";

import { resolveCelImports } from "../../imports";
import { emitFhirDefFromPath } from "../../../fhir-emitter/closureOrchestrator";
import { emitCelToFhir } from "../emitFhir";

/**
 * #189 CEL-writer T3b (disc 490) — derive-local SEAM guard.
 *
 * dme101-030 is single-library (entry = covers-target = the only library → bare domain), so it never exercises
 * the primary-vs-sibling domain distinction. This fixture does, with BOTH cells in one project:
 *   - "Seam Included" is pulled into the covers-target's include-walk seed by an explicit `include` in root →
 *     PRIMARY → BARE `<policyId>-local`. A sole-primary fallback (rejected, disc 490 [critical]) would wrongly
 *     disambiguate it → this test is the regression guard that catches that fallback.
 *   - "Seam Sibling" is reached only by a qualified ref → cross-lib SIBLING → DISAMBIGUATED
 *     `<policyId>-<slug>-local`.
 * The derived CEL instance coding must byte-match the CQL/FHIR definition lane's CodeSystem in BOTH cells. The
 * round-trip is asserted the connected-pair way (disc 490 gpt56 #8 / Fable #11): each derived coding.system must
 * equal an emitted CodeSystem.url whose OWN concept[] carries coding.code — an independent string search could
 * pass on the wrong pairing in a multi-CodeSystem project.
 */

const FIX = path.join(__dirname, "fixtures", "derive-local-seam");
const CEL = path.join(FIX, "seam.cel");
const ROOT_CRL = path.join(FIX, "root.crl");

const BARE_SYSTEM = "http://example.org/seam/CodeSystem/seam-policy-local";

/** First coding {system, code} off an emitted resource body. */
function coding(body: Record<string, unknown>): { system?: string; code?: string } | undefined {
  const cc = body.code as { coding?: Array<{ system?: string; code?: string }> } | undefined;
  return cc?.coding?.[0];
}

describe("#189 T3b derive-local seam (included=bare vs sibling=disambiguated)", () => {
  const graph = resolveCelImports(CEL);
  const result = emitCelToFhir(graph);

  // Map fact → derived coding (Observation resources only; the Patient/Communication carry no local code).
  const codings = new Map<string, { system?: string; code?: string }>();
  for (const c of result.emittedCases) {
    for (const r of c.resources) {
      if (r.resourceType !== "Observation") continue;
      const cd = coding(r.body);
      if (cd?.code) codings.set(cd.code, cd);
    }
  }

  it("derives both codings with no error diagnostics", () => {
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(codings.has("included-finding")).toBe(true);
    expect(codings.has("sibling-finding")).toBe(true);
  });

  it("INCLUDED (primary) concept → BARE <policyId>-local (guards the rejected sole-primary fallback)", () => {
    expect(codings.get("included-finding")?.system).toBe(BARE_SYSTEM);
  });

  it("SIBLING (qualified-ref) concept → DISAMBIGUATED, not the bare domain", () => {
    const sys = codings.get("sibling-finding")?.system;
    expect(sys).toBeDefined();
    expect(sys).not.toBe(BARE_SYSTEM);
    // Same project, so same canonicalBase prefix + `-local` suffix, but a distinct (disambiguated) domain slug.
    expect(sys!.startsWith("http://example.org/seam/CodeSystem/seam-policy-")).toBe(true);
    expect(sys!.endsWith("-local")).toBe(true);
  });

  // DOCUMENTED BOUNDARY (not a silent cap): the multi-library round-trip is NOT verifiable end-to-end today.
  // The definition lane deliberately blocks a covers-target decision that qualified-refs a code-bearing sibling
  // (`emit-cross-library-ref-into-split-library`, imports/emit.ts:702 — "referrer re-qualification is a later
  // slice"). So there is no emitted retrieve to byte-match the derived sibling/included coding against yet:
  // derive-local is correct BY CONSTRUCTION (shared resolver) but ahead of the definition lane for cross-lib
  // code-bearing refs. The SINGLE-library round-trip IS proven end-to-end by dme101-030's real $apply
  // (Approve/Deny/Deny). When the definition lane gains referrer re-qualification, flip this to the connected-
  // pair assertion (each derived coding.system == an emitted CodeSystem.url whose OWN concept[] carries the code).
  it("KNOWN GAP — definition lane cannot yet emit this multi-lib shape (blocks the round-trip)", () => {
    const def = emitFhirDefFromPath(ROOT_CRL);
    const crossRef = def.errors.find((e) => e.kind === "emit-cross-library-ref-into-split-library");
    expect(crossRef, "expected the definition-lane cross-lib-ref-into-split-library guard to fire").toBeDefined();
  });
});
