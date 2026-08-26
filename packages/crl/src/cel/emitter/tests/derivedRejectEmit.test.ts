import * as path from "path";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";

import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";
import type { EmitResult } from "../emitFhir";

// #189 (a) (disc 510/511) — the emitter's read-only backstop: a fact `defined by` a RESOURCELESS DERIVED concept
// (no `code is`, no source binding) is rejected loud and emits NO resource. Covers both wrong cells the inert role
// classifier used to let through — the UNTYPED composite (would mis-warn `unsupported-yet`) and the TYPED composite
// (would FABRICATE a resource, a §4 violation) — plus the cross-kind name-collision the shared resolver fixes.

function withProject(fn: (root: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "cel-emit-a-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CEL = [
  "# T",
  "library \"T\".",
  "covers \"L\".",
  "fact \"Subject\":",
  "- name is \"S\".",
  "- defined by \"Patient\".",
  "fact \"Y\":",
  "- defined by \"L\".\"C\".",
  "case \"Case\":",
  "- subject is \"Subject\".",
  "- fact is \"Y\".",
].join("\n");

function emitWithConcept(crlLines: string[]): EmitResult {
  let out: EmitResult | undefined;
  withProject((root) => {
    writeFileSync(path.join(root, "lib.crl"), crlLines.join("\n"), "utf-8");
    const file = path.join(root, "f.cel");
    writeFileSync(file, CEL, "utf-8");
    out = emitCelToFhir(resolveCelImports(file));
  });
  return out!;
}

const LEAF = ["concept \"Leaf\":", "- type is Observation.", "- code is `leaf`."];

describe("CEL #189 (a) — emitter refuses a resource for a directly-asserted resourceless concept", () => {
  test("TYPED composite (type is + defined as, no code) → error, NO fabricated resource", () => {
    const r = emitWithConcept([
      "# L",
      "library \"L\".",
      ...LEAF,
      "concept \"C\":",
      "- type is Observation.",
      "- value type is boolean.",
      "- defined as \"Leaf\".",
    ]);
    expect(
      r.diagnostics.some(
        (d) => d.kind === "cannot-directly-assert-derived-concept" && d.severity === "error",
      ),
    ).toBe(true);
    // Fact-atomic: the Patient still emits, but NOTHING is fabricated for the "Y" fact / "C" concept.
    const nonPatient = (r.emittedCases[0]?.resources ?? []).filter((res) => res.resourceType !== "Patient");
    expect(nonPatient).toEqual([]);
  });

  test("UNTYPED composite (defined as, no type/code) → the (a) error, NOT `unsupported-yet`", () => {
    const r = emitWithConcept([
      "# L",
      "library \"L\".",
      ...LEAF,
      "concept \"C\":",
      "- defined as \"Leaf\".",
    ]);
    expect(r.diagnostics.some((d) => d.kind === "cannot-directly-assert-derived-concept")).toBe(true);
    expect(r.diagnostics.some((d) => d.kind === "unsupported-yet" && d.factName === "Y")).toBe(false);
  });

  test("a Concept shadowed by an EARLIER same-named Activity binds the Activity — no (a) reject", () => {
    // Activity "C" and Concept "C" occupy separate name buckets (legal CRL); the shared `buildDefinedByCandidates`
    // resolver binds the FIRST — the Activity — in every lane, so the read-only Concept never triggers the reject.
    const r = emitWithConcept([
      "# L",
      "library \"L\".",
      "activity \"C\":",
      "- request CPGServiceRequest.",
      "- with `svc`.",
      "concept \"C\":",
      "- defined as \"Leaf\".",
      ...LEAF,
    ]);
    expect(r.diagnostics.some((d) => d.kind === "cannot-directly-assert-derived-concept")).toBe(false);
  });
});
