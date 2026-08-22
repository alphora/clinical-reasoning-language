import * as path from "path";

import { describe, expect, it } from "vitest";

import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";

/**
 * #189 CEL-writer T3b (disc 490) — derive-local CI guard.
 *
 * A local `code is` fact's `{system, code}` must be DERIVED from the concept (NOT authored on the `.cel` fact)
 * via the SAME project resolution the CQL definition lane uses, so the emitted instance coding BYTE-MATCHES the
 * CQL retrieve's CodeSystem by construction. The real `PlanDefinition/$apply` proves the end-to-end round-trip
 * against the cqf engine (out-of-tree harness); this guards the derived BYTES + the loud floor in CI so a
 * regression in the resolution can't silently reintroduce the domain drift that denied every PA case.
 *
 * Fixture: the real HCSC PA policy dme101-030 (pure-local Observations; `package.json` name `dme101-030` +
 * `crl.canonicalBase http://example.org/hcsc/dme101-030`).
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DME_CEL = path.join(REPO_ROOT, "src/tests/fixtures/policies/dme101-030/dme101-030.cel");

const LOCAL_SYSTEM = "http://example.org/hcsc/dme101-030/CodeSystem/dme101-030-local";

/** Pull the first `coding` entry off an emitted resource body. */
function coding(body: Record<string, unknown>): { system?: string; code?: string } | undefined {
  const cc = body.code as { coding?: Array<{ system?: string; code?: string }> } | undefined;
  return cc?.coding?.[0];
}

describe("#189 T3b derive-local (dme101-030)", () => {
  const graph = resolveCelImports(DME_CEL);
  const result = emitCelToFhir(graph);

  it("derives local codings with no error diagnostics", () => {
    const errs = result.diagnostics.filter((d) => d.severity === "error");
    expect(errs).toEqual([]);
  });

  it("emits a case Observation whose coding is DERIVED from the concept (system + code), not authored", () => {
    // Collect every emitted Observation coding across cases.
    const codings = result.emittedCases
      .flatMap((c) => c.resources)
      .filter((r) => r.resourceType === "Observation")
      .map((r) => coding(r.body))
      .filter((x): x is { system?: string; code?: string } => x !== undefined);

    // Every local Observation carries the derived local-domain system.
    expect(codings.length).toBeGreaterThan(0);
    for (const c of codings) {
      expect(c.system).toBe(LOCAL_SYSTEM);
    }
    const codes = new Set(codings.map((c) => c.code));
    // The concept `code is` tokens, byte-raw (no normalization) — the exact tokens the CQL retrieve declares.
    expect(codes.has("documented-fracture-nonunion")).toBe(true);
    expect(codes.has("skull-or-vertebrae-fracture")).toBe(true);
  });

  it("sets Observation.status final (T3a) on every emitted Observation", () => {
    const obs = result.emittedCases.flatMap((c) => c.resources).filter((r) => r.resourceType === "Observation");
    for (const r of obs) {
      expect(r.body.status).toBe("final");
    }
  });
});
