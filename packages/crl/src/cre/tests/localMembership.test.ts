import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { resolveCelImports } from "../../cel/imports";
import { emitCelToFhir } from "../../cel/emitter/emitFhir";
import { validateCELFile } from "../../cel/validator/validator";
import { localCodeSystemUrl } from "../../fhir-emitter/slug";
import { runCel } from "../run";

// #189 Piece 2 (disc 508) — CODE-DRIVEN local membership, both verdicts, end-to-end through the CRE. Built via
// `resolveCelImports` (NOT an inline graph) so the fixture's `package.json` `crl.canonicalBase` is read and the
// local CodeSystem is DERIVABLE — the same derivation the emitter/CQL lane use, so the tree lane and `$apply` agree.

const MEMBERSHIP_CEL = path.resolve(
  __dirname,
  "fixtures/dme101-030-membership/cases.cel",
);
const NOBASE_CEL = path.resolve(
  __dirname,
  "fixtures/dme-membership-nobase/cases.cel",
);
const INTENT_CEL = path.resolve(
  __dirname,
  "fixtures/dme-membership-intent/cases.cel",
);
const LOCAL_SYSTEM = localCodeSystemUrl("http://example.org/hcsc/dme-membership", "dme-membership");

describe("#189 Piece 2 — CRE local code-driven membership", () => {
  const result = runCel(resolveCelImports(MEMBERSHIP_CEL));
  const byCase = (needle: string) => result.runs.find((r) => r.case.includes(needle))!;

  it("the local CodeSystem the fixture codes carry is the DERIVED one (round-trip anchor)", () => {
    // The fixture's authored `code is` system must be exactly what the resolver derives, or membership can't match.
    expect(LOCAL_SYSTEM).toBe("http://example.org/hcsc/dme-membership/CodeSystem/dme-membership-local");
  });

  it("all four membership cases pass the oracle (correct / wrong / cross-concept / bare)", () => {
    const failures = result.runs.filter((r) => r.status !== "pass").map((r) => `${r.case}:${r.status}`);
    expect(failures).toEqual([]);
    expect(result.runs.length).toBe(4);
  });

  it("a correct explicit code populates the NAMED concept (member) → deny.skull", () => {
    const run = byCase("correct code populates");
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["deny.skull"]);
  });

  it("a wrong code is a NON-member → the concept is absent (closed-world) → approve, with a drop diagnostic", () => {
    const run = byCase("wrong code is a non-member");
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["approve"]);
    // The dropped fact is surfaced (not silently vanished): a debuggability signal for the wrong-code datum.
    expect(run.diagnostics.some((d) => /Skull Wrong Code/.test(d) && /not a member/.test(d))).toBe(true);
  });

  it("CODE decides, not NAME: names Tumor, carries Skull's code → populates SKULL → deny.skull", () => {
    const run = byCase("cross-concept");
    expect(run.status).toBe("pass");
    // The fact named "Tumor Fracture" but its code is Skull Fracture's → compartment-global routing populates
    // Skull, so the FIRST branch (Skull) fires, NOT the Tumor branch — exactly as `$apply` would.
    expect(run.produced.map((p) => p.recommendation)).toEqual(["deny.skull"]);
  });

  it("a bare fact is the degenerate member of the concept it names → deny.tumor", () => {
    const run = byCase("bare fact is the degenerate");
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["deny.tumor"]);
  });
});

describe("#189 Piece 2 — the PRODUCER lane: authored codes round-trip to emitted Condition coding", () => {
  // The two-lane agreement the CRE membership mirrors: the CEL emitter routes a local fact's AUTHORED code to the
  // resource coding AS AUTHORED (Part A), at the concept's natural placement (Condition → `code`). $apply's
  // system-qualified retrieve then computes the SAME membership the CRE does. This pins the emitted bytes.
  const result = emitCelToFhir(resolveCelImports(MEMBERSHIP_CEL));
  const condCodings = result.emittedCases
    .flatMap((c) => c.resources)
    .filter((r) => r.resourceType === "Condition")
    .map((r) => (r.body as { code?: { coding?: Array<{ system?: string; code?: string }> } }).code?.coding?.[0])
    .filter((x): x is { system?: string; code?: string } => x !== undefined);

  it("emits without error (authored codes are legitimate data input, not conflicts)", () => {
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("the correct-code fact emits a Condition whose coding is the DERIVED local member (what $apply's retrieve matches)", () => {
    expect(condCodings.some((c) => c.system === LOCAL_SYSTEM && c.code === "skull-fracture")).toBe(true);
  });

  it("the wrong-code fact emits its authored NON-member coding (so $apply computes it absent, agreeing with the CRE)", () => {
    expect(condCodings.some((c) => c.system === LOCAL_SYSTEM && c.code === "not-a-real-code")).toBe(true);
  });
});

describe("#189 Piece 2 D5(3) — an intent modifier on a local determination fact is rejected in ALL lanes", () => {
  it("VALIDATOR: errors on `absent` intent over a local `code is` fact", () => {
    const r = validateCELFile(INTENT_CEL);
    const errs = r.errors.filter((e) => e.kind === "intent-modifier-on-local-fact");
    expect(errs.length).toBe(1);
    expect(errs[0].message).toMatch(/Skull Finding/);
  });

  it("CRE: fails the run loud (never computes the concept PRESENT from a ruled-out fact)", () => {
    const run = runCel(resolveCelImports(INTENT_CEL)).runs[0];
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /intent modifier/.test(d) && /#257/.test(d))).toBe(true);
  });

  it("EMITTER: skips the fact with a loud diagnostic (never a self-contradicting membership resource)", () => {
    const r = emitCelToFhir(resolveCelImports(INTENT_CEL));
    const errs = r.diagnostics.filter((d) => d.kind === "intent-modifier-on-local-fact");
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].severity).toBe("error");
  });
});

describe("#189 Piece 2 — CRE membership: missing canonicalBase (a real project)", () => {
  const result = runCel(resolveCelImports(NOBASE_CEL));
  const byCase = (needle: string) => result.runs.find((r) => r.case.includes(needle))!;

  it("an AUTHORED-code local fact with no derivable base fails the run LOUD (never fabricates a verdict)", () => {
    const run = byCase("authored code with no canonicalBase");
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /refusing to fabricate/.test(d))).toBe(true);
  });

  it("a BARE local fact in a real project with no base ALSO fails loud (canonicalBase is required, charter §4 — no exception)", () => {
    // charter §4: canonicalBase is required for local codes. A real project (projectRoot set) that declares local
    // concepts but omits it is misconfigured — the emitter refuses it (`localCodeSystemUrl` throws, #271), so the
    // CRE refuses too, for bare AND coded facts. (An INLINE/projectless graph is a different thing — not a project —
    // proven presence-only in the inline CRE tests.)
    const run = byCase("bare fact with no canonicalBase");
    expect(run.status).toBe("error");
    expect(run.diagnostics.some((d) => /canonicalBase is required/.test(d))).toBe(true);
  });
});
