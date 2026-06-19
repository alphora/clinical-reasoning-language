// Unit tests for the headless diagnostics logic (#132 step 3d). The golden oracle gates the
// orphan/project production over real validators; these tests pin the two pieces that need
// precise coverage: mapImportDiagnostic (all 8 ImportDiagnostic kinds + the two fallback
// branches — expected values matched to the providers' original output) and computeDiagnostics'
// orphan/project/crash structure (crash via an injected throwing validator).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { computeDiagnostics, mapImportDiagnostic, type DiagnosticsValidators } from "../diagnostics";
import { ProjectIndex } from "../projectIndex";
import type { ImportDiagnostic } from "../../imports/types";
import { validateCRL, validateCRLImports } from "../../index";

const realValidators: DiagnosticsValidators = { validateCRL, validateCRLImports };
const loc = (sl: number, sc: number, el: number, ec: number) => ({
  start: { line: sl, column: sc },
  end: { line: el, column: ec },
});

describe("mapImportDiagnostic (#132 step 3d) — 8 kinds + fallbacks", () => {
  it("parse-failure → one diagnostic per inner error", () => {
    const d = { kind: "parse-failure", severity: "error", filePath: "/f.crl", errors: [{ line: 2, column: 3, message: "oops" }] } as unknown as ImportDiagnostic;
    expect(mapImportDiagnostic(d)).toEqual([
      { filePath: "/f.crl", range: { startLine: 1, startCol: 3, endLine: 1, endCol: 4 }, severity: "error", message: "oops", code: "parse-failure", source: "crl" },
    ]);
  });

  it("parse-failure with zero inner errors → a single fallback diagnostic", () => {
    const d = { kind: "parse-failure", severity: "error", filePath: "/f.crl", errors: [] } as unknown as ImportDiagnostic;
    expect(mapImportDiagnostic(d)).toEqual([
      { filePath: "/f.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 }, severity: "error", message: "Parse failure", code: "parse-failure", source: "crl" },
    ]);
  });

  it("project-root-not-found → diagnostic on fromPath", () => {
    const d = { kind: "project-root-not-found", severity: "warning", fromPath: "/x.crl" } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out[0].filePath).toBe("/x.crl");
    expect(out[0].severity).toBe("warning");
    expect(out[0].code).toBe("project-root-not-found");
    expect(out[0].message).toContain("no package.json found");
  });

  it("package-resolution-failure → diagnostic on packagePath/package.json", () => {
    const d = { kind: "package-resolution-failure", severity: "error", packagePath: "/pkg", message: "bad pkg" } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out[0].filePath).toBe("/pkg/package.json");
    expect(out[0].message).toBe("bad pkg");
    expect(out[0].range).toEqual({ startLine: 0, startCol: 0, endLine: 0, endCol: 1 });
  });

  it("registry-duplicate → one diagnostic per file (spans files)", () => {
    const d = { kind: "registry-duplicate", severity: "error", name: "L", filePaths: ["/a.crl", "/b.crl"] } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out.map((m) => m.filePath)).toEqual(["/a.crl", "/b.crl"]);
    expect(out[0].message).toBe('Duplicate library "L" — registered in multiple files');
  });

  it("unresolved-include → diagnostic at the include location", () => {
    const d = { kind: "unresolved-include", severity: "error", from: { filePath: "/a.crl" }, include: { name: "X", location: loc(3, 0, 3, 10) } } as unknown as ImportDiagnostic;
    expect(mapImportDiagnostic(d)).toEqual([
      { filePath: "/a.crl", range: { startLine: 2, startCol: 0, endLine: 2, endCol: 10 }, severity: "error", message: 'Cannot resolve include "X"', code: "unresolved-include", source: "crl" },
    ]);
  });

  it("cycle → one diagnostic per include-chain hop, basename message", () => {
    const d = { kind: "cycle", severity: "error", filePaths: ["/p/a.crl", "/p/b.crl"], includeChain: [{ location: loc(2, 0, 2, 5) }] } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out).toHaveLength(1);
    expect(out[0].filePath).toBe("/p/a.crl");
    expect(out[0].range).toEqual({ startLine: 1, startCol: 0, endLine: 1, endCol: 5 });
    expect(out[0].message).toBe("Include cycle: a.crl → b.crl");
  });

  it("cycle with empty includeChain → fallback diagnostic per unique file", () => {
    const d = { kind: "cycle", severity: "error", filePaths: ["/p/a.crl", "/p/b.crl"], includeChain: [] } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out.map((m) => m.filePath)).toEqual(["/p/a.crl", "/p/b.crl"]);
    expect(out[0].range).toEqual({ startLine: 0, startCol: 0, endLine: 0, endCol: 1 });
  });

  it("alias-not-yet-supported → warning at the include location", () => {
    const d = { kind: "alias-not-yet-supported", severity: "warning", from: { filePath: "/a.crl" }, include: { name: "X", alias: "Y", location: loc(2, 0, 2, 5) } } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out[0].message).toContain('include "X" as "Y".');
    expect(out[0].code).toBe("alias-not-yet-supported");
  });

  it("redundant-local-include → warning at the include location", () => {
    const d = { kind: "redundant-local-include", severity: "warning", from: { filePath: "/a.crl" }, include: { name: "X", location: loc(2, 0, 2, 5) } } as unknown as ImportDiagnostic;
    const out = mapImportDiagnostic(d);
    expect(out[0].message).toContain("is redundant");
    expect(out[0].code).toBe("redundant-local-include");
  });
});

describe("computeDiagnostics (#132 step 3d)", () => {
  it("crash-sentinel: an orphan validator throw → an Information diagnostic on the file", () => {
    const index = { getProjectRoot: () => null } as unknown as ProjectIndex;
    const validators: DiagnosticsValidators = {
      validateCRL: () => {
        throw new Error("boom");
      },
      validateCRLImports: () => ({ validationErrors: [], validationWarnings: [], importDiagnostics: [] }),
    };
    const res = computeDiagnostics("/x.crl", "src", index, validators);
    expect(res).toEqual({
      mode: "orphan",
      diagnostics: [
        { filePath: "/x.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 0 }, severity: "information", message: "CRL validator crashed: boom" },
      ],
    });
  });

  it("crash-sentinel: a project validator throw → mode project-crash (no source/code)", () => {
    const index = {
      getProjectRoot: () => "/root",
      invalidate: () => undefined,
      getOverlays: () => new Map(),
    } as unknown as ProjectIndex;
    const validators: DiagnosticsValidators = {
      validateCRL: () => ({ errors: [], warnings: [] }),
      validateCRLImports: () => {
        throw new Error("kaboom");
      },
    };
    const res = computeDiagnostics("/x.crl", "src", index, validators);
    expect(res.mode).toBe("project-crash");
    expect(res.diagnostics).toEqual([
      { filePath: "/x.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 0 }, severity: "information", message: "CRL validator crashed: kaboom" },
    ]);
  });

  it("orphan: maps a CRLError verbatim — code = kind ?? type, line 1-based→0-based, column as-is", () => {
    const index = { getProjectRoot: () => null } as unknown as ProjectIndex;
    const validators: DiagnosticsValidators = {
      validateCRL: () => ({
        errors: [{ type: "T", kind: "my-kind", message: "boom", line: 5, column: 3 }],
        warnings: [{ type: "W", message: "warn", line: 2 }], // no kind → code falls back to type; no column → 0
      }),
      validateCRLImports: () => ({ validationErrors: [], validationWarnings: [], importDiagnostics: [] }),
    };
    expect(computeDiagnostics("/x.crl", "src", index, validators)).toEqual({
      mode: "orphan",
      diagnostics: [
        { filePath: "/x.crl", range: { startLine: 4, startCol: 3, endLine: 4, endCol: 4 }, severity: "error", message: "boom", code: "my-kind", source: "crl" },
        { filePath: "/x.crl", range: { startLine: 1, startCol: 0, endLine: 1, endCol: 1 }, severity: "warning", message: "warn", code: "W", source: "crl" },
      ],
    });
  });

  it("orphan: real validator surfaces an unresolved-reference finding", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crl-diag-ut-"));
    try {
      const file = path.join(dir, "solo.crl");
      const src = ["# Solo", 'library "Solo".', 'concept "A":', "- type is Observation.", '- coded from "Undeclared T".'].join("\n");
      fs.writeFileSync(file, src);
      const res = computeDiagnostics(file, src, new ProjectIndex(), realValidators);
      expect(res.mode).toBe("orphan");
      expect(res.diagnostics.length).toBeGreaterThan(0);
      for (const d of res.diagnostics) expect(d.filePath).toBe(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("project: registry-duplicate surfaces on each file (real validators, multi-URI)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crl-diag-ut-"));
    try {
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "t", version: "0" }));
      const a = path.join(dir, "a.crl");
      fs.writeFileSync(a, ["# A", 'library "Same".', 'terminology "TA":', "- valueset is `urn:ta`.", 'concept "A":', "- type is Observation.", '- coded from "TA".'].join("\n"));
      fs.writeFileSync(path.join(dir, "b.crl"), ["# B", 'library "Same".', 'terminology "TB":', "- valueset is `urn:tb`.", 'concept "B":', "- type is Observation.", '- coded from "TB".'].join("\n"));
      const res = computeDiagnostics(a, fs.readFileSync(a, "utf-8"), new ProjectIndex(), realValidators);
      expect(res.mode).toBe("project");
      expect(res.diagnostics.some((d) => d.code === "registry-duplicate")).toBe(true);
      for (const d of res.diagnostics) expect(typeof d.filePath).toBe("string");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
