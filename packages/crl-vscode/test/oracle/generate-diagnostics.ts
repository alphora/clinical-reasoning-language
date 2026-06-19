// Golden generator for the diagnostics production (#132 step 3d). The diagnostics adapter is
// event-driven (registerDiagnostics), so the oracle drives the pure `produceDiagnostics` seam
// (returns the per-URI vscode diagnostics, no collection mutation) over REAL ProjectIndex temp
// fixtures: an orphan file (no project root → validateCRL) with a validation error, and a project
// (package.json + 2 .crl) with an import diagnostic. Temp paths are $TMP-normalized for
// determinism. Crash-sentinel is covered by unit tests (injected throwing validator), not here.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { produceDiagnostics } from "../../src/diagnostics";
import { ProjectIndex, canonicalize } from "@smile-digital-health/crl/language-services";
import { makeDoc, toPlain } from "./harness-lib";

function normalizePaths(v: unknown, roots: string[]): unknown {
  if (typeof v === "string") {
    let s = v;
    for (const r of roots) s = s.split(r).join("$TMP");
    return s;
  }
  if (Array.isArray(v)) return v.map((x) => normalizePaths(x, roots));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = normalizePaths((v as Record<string, unknown>)[k], roots);
    return o;
  }
  return v;
}

function serialize(p: ReturnType<typeof produceDiagnostics>) {
  return {
    mode: p.mode,
    projectRoot: p.projectRoot,
    entries: p.entries.map((e) => ({ uri: toPlain(e.uri), diagnostics: e.diagnostics.map(toPlain) })),
  };
}

async function main() {
  const results: unknown[] = [];
  const roots: string[] = [];

  // --- Orphan fixture: one .crl, no package.json → getProjectRoot null → validateCRL ---
  const orphanDir = fs.mkdtempSync(path.join(os.tmpdir(), "crl-diag-orphan-"));
  roots.push(canonicalize(orphanDir), orphanDir);
  const soloFile = path.join(orphanDir, "solo.crl");
  // Valid bodies (type + coded from a declared terminology), but referencing an UNDECLARED
  // terminology → a clean reference-validation error (exercises crlErrorToLs).
  const soloSrc = ["# Solo", 'library "Solo".', 'concept "A":', "- type is Observation.", '- coded from "Undeclared T".'].join("\n");
  fs.writeFileSync(soloFile, soloSrc);

  // --- Project fixture: package.json + 2 .crl with the same library name → registry-duplicate ---
  const projDir = fs.mkdtempSync(path.join(os.tmpdir(), "crl-diag-proj-"));
  roots.push(canonicalize(projDir), projDir);
  fs.writeFileSync(path.join(projDir, "package.json"), JSON.stringify({ name: "tmp", version: "0.0.0" }));
  const aFile = path.join(projDir, "a.crl");
  const bFile = path.join(projDir, "b.crl");
  fs.writeFileSync(
    aFile,
    ["# A", 'library "Same".', 'terminology "TA":', "- valueset is `urn:ta`.", 'concept "A":', "- type is Observation.", '- coded from "TA".'].join("\n"),
  );
  fs.writeFileSync(
    bFile,
    ["# B", 'library "Same".', 'terminology "TB":', "- valueset is `urn:tb`.", 'concept "B":', "- type is Observation.", '- coded from "TB".'].join("\n"),
  );

  try {
    const orphanIndex = new ProjectIndex();
    results.push({
      label: "orphan-validation-errors",
      ...serialize(produceDiagnostics(makeDoc(soloSrc, soloFile), orphanIndex)),
    });

    const projIndex = new ProjectIndex();
    const aSrc = fs.readFileSync(aFile, "utf-8");
    results.push({
      label: "project-import-diagnostic",
      ...serialize(produceDiagnostics(makeDoc(aSrc, aFile), projIndex)),
    });

    const normalized = normalizePaths(results, roots);
    const outFile =
      process.env.CRL_ORACLE_OUT ?? path.resolve(process.cwd(), "test/oracle/golden/diagnostics.json");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(normalized, null, 2) + "\n");
    console.log(`diagnostics golden: ${results.length} cases →`);
    for (const r of results as { label: string; mode: string; entries: { diagnostics: unknown[] }[] }[]) {
      const n = r.entries.reduce((acc, e) => acc + e.diagnostics.length, 0);
      console.log(`  ${r.label} → mode=${r.mode}, ${r.entries.length} uri(s), ${n} diagnostic(s)`);
    }
  } finally {
    fs.rmSync(orphanDir, { recursive: true, force: true });
    fs.rmSync(projDir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
