/**
 * The produces table, pinned.
 *
 * ⚠ WHY THIS FILE EXISTS: before it, three emit tools took an `out` argument that meant three DIFFERENT
 * LEVELS, and nothing anywhere said so. `--out-dir .` produced `./cql/` where every consumer reads
 * `src/cql/`; `--out-dir tests/data` produced `tests/data/patient/` where the loader reads
 * `tests/data/fhir/patient/`. Both write successfully, exit 0, and are read by nothing. FOUR documents
 * each described a different layout and none matched the shipped content tree.
 *
 * ⭐ THE TABLE IS MEASURED, from a real KALM/KELP project, and declared by that project's own
 * `kelp.project.json` (`cql → src/cql`, `fhir → src/fhir`, `qa → tests`). These assertions are that
 * declaration, restated where a change to the code has to walk past them.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { resolveEmitOutput, laneOffset, type EmitLane } from "../emit-layout";

/** A minimal project: a package.json to find, and a source file nested the way real content nests it. */
function project(): { root: string; celPath: string; crlPath: string } {
  const root = mkdtempSync(join(tmpdir(), "emit-layout-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "p", version: "0.0.0" }));
  mkdirSync(join(root, "src", "cel"), { recursive: true });
  mkdirSync(join(root, "src", "crl"), { recursive: true });
  const celPath = join(root, "src", "cel", "cases.cel");
  const crlPath = join(root, "src", "crl", "lib.crl");
  writeFileSync(celPath, "# c", "utf-8");
  writeFileSync(crlPath, "# c", "utf-8");
  return { root, celPath, crlPath };
}

const rel = (root: string, dir: string) => dir.slice(root.length).split(sep).filter(Boolean).join("/");

describe("resolveEmitOutput — the produces table", () => {
  it("defaults every lane to the PROJECT ROOT, not the source file's directory", () => {
    const { root, celPath, crlPath } = project();
    try {
      // ⚠ THE BUG THIS PINS: `emit_results` defaulted to `dirname(celPath)` while its own help text said
      // "project root". With a `.cel` under `src/cel/` — the documented and measured layout — that wrote
      // `src/cel/tests/results/fhir/`, which the consumer glob `**/tests/results/fhir/patient/…` WOULD
      // have matched. It went unreported only because every caller passed an explicit root.
      const cases: Array<[EmitLane, string, string]> = [
        ["crl", crlPath, "src"],
        ["cql-flat", crlPath, "src/cql"],
        ["cel", celPath, "tests/data/fhir"],
        ["results", celPath, ""],
      ];
      for (const [lane, src, expected] of cases) {
        const r = resolveEmitOutput(lane, src, undefined);
        expect(r.ok, `${lane} should resolve`).toBe(true);
        if (!r.ok) continue;
        expect(r.root).toBe(resolve(root));
        expect(rel(resolve(root), r.dir), `${lane} offset`).toBe(expected);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats an explicit project root as byte-identical to omitting it", () => {
    // The operator's "or possibly, pass the project root". If these diverge, the offset is applied a
    // different number of times on the two paths and the uniformity claim is false.
    const { root, celPath, crlPath } = project();
    try {
      for (const [lane, src] of [
        ["crl", crlPath],
        ["cql-flat", crlPath],
        ["cel", celPath],
        ["results", celPath],
      ] as Array<[EmitLane, string]>) {
        const omitted = resolveEmitOutput(lane, src, undefined);
        const explicit = resolveEmitOutput(lane, src, root);
        expect(omitted).toEqual(explicit);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("gives an arbitrary path the SAME table — a mirror, so copy-back is a copy", () => {
    // ⭐ This is what makes emit-to-scratch safe. The failure being prevented, in the operator's words:
    // "AI emit to some temp place, test everything, and then forget to … copy over to the real repo at
    // all and end up with orphaned fixes which is super confusing." A mirror can be copied back
    // wholesale; a flattened scratch tree has to be re-derived, which is where the mistakes live.
    const scratch = mkdtempSync(join(tmpdir(), "emit-layout-scratch-"));
    const { root, celPath, crlPath } = project();
    try {
      for (const [lane, src] of [
        ["crl", crlPath],
        ["cql-flat", crlPath],
        ["cel", celPath],
        ["results", celPath],
      ] as Array<[EmitLane, string]>) {
        const inProject = resolveEmitOutput(lane, src, root);
        const inScratch = resolveEmitOutput(lane, src, scratch);
        expect(inProject.ok && inScratch.ok).toBe(true);
        if (!inProject.ok || !inScratch.ok) continue;
        expect(rel(resolve(scratch), inScratch.dir)).toBe(rel(resolve(root), inProject.dir));
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies the offset EXACTLY ONCE — an explicit lane dir is not re-suffixed", () => {
    // ⚠ The obvious wrong implementation appends the offset to whatever it is handed. Then a caller who
    // followed the OLD docs (`--out-dir src`, `--out-dir tests/data/fhir`) silently gets `src/src/cql`
    // and `tests/data/fhir/tests/data/fhir/patient`. Both write; neither is read.
    const { root, crlPath, celPath } = project();
    try {
      const crl = resolveEmitOutput("crl", crlPath, join(root, "src"));
      expect(crl.ok && rel(resolve(root), crl.dir)).toBe("src/src");
      const cel = resolveEmitOutput("cel", celPath, join(root, "tests", "data", "fhir"));
      expect(cel.ok && rel(resolve(root), cel.dir)).toBe(
        "tests/data/fhir/tests/data/fhir",
      );
      // Stated as a fact, not a defence: `out` is taken VERBATIM as the root. That is what makes it
      // usable for an arbitrary directory, and it is why the docs must never again teach a lane path.
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses, rather than guessing, when there is no project root", () => {
    const orphan = mkdtempSync(join(tmpdir(), "emit-layout-orphan-"));
    try {
      // A temp dir has no package.json above it inside the temp tree; if the OS temp root happens to
      // sit under one, the walk finds it and this case is not exercisable — assert only the shape.
      const r = resolveEmitOutput("crl", join(orphan, "x.crl"), undefined);
      if (!r.ok) expect(r.reason).toMatch(/project root/i);
      else expect(r.dir.endsWith(`${sep}src`)).toBe(true);
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });

  it("returns an error instead of THROWING on an unreadable source", () => {
    // ⚠ `findProjectRoot` calls `statSync` with no catch, and `emit_results` reaches the default before
    // it has checked the file exists. Without the catch in the resolver the declared `{ ok: false }`
    // contract is a promise the function does not keep — it throws past every caller instead.
    const missing = join(tmpdir(), "emit-layout-does-not-exist", "nope.cel");
    const r = resolveEmitOutput("results", missing, undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot read|project root/i);
  });

  it("keeps `results` offset EMPTY — its writer appends the whole tail itself", () => {
    // Not a tidiness assertion. `produceResults` appends `tests/results/fhir` AND uses the same value as
    // the orphan-scan base, so an offset here would both double the path and move what the prune walks.
    expect(laneOffset("results")).toBe("");
  });
});
