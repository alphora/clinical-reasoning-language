import * as path from "path";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";

import { resolveCelImports } from "../../imports";
import { emitCelToFhir } from "../emitFhir";
import type { EmitResult } from "../emitFhir";

/**
 * #312 — a BARE-TYPE fact with no `code is` emits a resource carrying NO coding, on a type whose retrieves
 * filter by exactly that element. Nothing coded can match it.
 *
 * ⚠ MEASURED IN THE FIELD, and it is the reason this exists: a knowledge engineer wrote
 * `- value is "<system>|<code>".` where `- code is` was meant. `validate_cel` clean, `emit_cel` success, and
 * the emitted ServiceRequest had no `code` — so the posrep retrieve could never find it. Green at every gate,
 * inert in the artifact.
 *
 * ⚠ A LOCAL fact has a fallback (`deriveLocalCoding` takes the concept's own coding); a BARE-TYPE fact has no
 * concept to derive from, which is why only this role can reach the uncoded state.
 */
const CRL = [
  '# L',
  'library "L".',
  'concept "Leaf":',
  "- type is Observation.",
  "- code is `leaf`.",
].join("\n");

function emitCel(factLines: string[]): EmitResult {
  const root = mkdtempSync(path.join(os.tmpdir(), "cel-312-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
    );
    writeFileSync(path.join(root, "lib.crl"), CRL, "utf-8");
    const file = path.join(root, "f.cel");
    writeFileSync(
      file,
      [
        "# T",
        'library "T".',
        'covers "L".',
        'fact "Subject":',
        '- name is "S".',
        '- defined by "Patient".',
        ...factLines,
        'case "Case":',
        '- subject is "Subject".',
        '- fact is "F".',
      ].join("\n"),
      "utf-8",
    );
    return emitCelToFhir(resolveCelImports(file));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const uncodedWarnings = (r: EmitResult) =>
  r.diagnostics.filter((d) => d.kind === "bare-type-fact-uncoded" && d.severity === "warning");

describe("#312 — a bare-type fact with no `code is` is flagged", () => {
  it("warns, names the resource, and names `code is` as the property meant", () => {
    const r = emitCel(['fact "F":', '- date is "2026-01-01".', '- defined by "ServiceRequest".']);
    const w = uncodedWarnings(r);
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/ServiceRequest/);
    expect(w[0].message).toMatch(/`code is`/);
    expect(w[0].factName).toBe("F");
  });

  // ⚠ THE FIELD CASE EXACTLY: `value is` sets the DATUM, not the coding. It is the misreading the message
  // names, so it must be the one that fires.
  it("fires on `value is` used where `code is` was meant", () => {
    const r = emitCel([
      'fact "F":',
      '- value is "http://www.ama-assn.org/go/cpt|15822".',
      '- date is "2026-01-01".',
      '- defined by "ServiceRequest".',
    ]);
    expect(uncodedWarnings(r)).toHaveLength(1);
  });

  it("is silent when the fact carries a code", () => {
    const r = emitCel([
      'fact "F":',
      '- code is "http://www.ama-assn.org/go/cpt|15822".',
      '- date is "2026-01-01".',
      '- defined by "ServiceRequest".',
    ]);
    expect(uncodedWarnings(r)).toEqual([]);
  });

  // ⚠ THE REGRESSION THIS MUST NOT CAUSE. Patient has NO coding placement (measured), and an uncoded Patient
  // is the commonest bare-type fact there is — every case in every suite has one. Warning on it would bury
  // the signal under one hit per case.
  it("stays silent on a bare Patient — no coding element, nothing to miss", () => {
    const r = emitCel(['fact "F":', '- date is "2026-01-01".', '- defined by "Patient".']);
    expect(uncodedWarnings(r)).toEqual([]);
  });

  // A LOCAL fact derives its coding from the concept, so it is never uncoded and must not be flagged.
  it("stays silent on a local-concept fact, which derives its coding", () => {
    const r = emitCel(['fact "F":', '- date is "2026-01-01".', '- defined by "L"."Leaf".']);
    expect(uncodedWarnings(r)).toEqual([]);
  });
});
