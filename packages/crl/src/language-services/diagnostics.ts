// Headless diagnostics logic (#132 step 3d). VS-Code-free: computeDiagnostics validates a
// document (orphan single-file or multi-file project), owns the orphan/project decision +
// the crash-sentinel, and returns a TYPED result of plain LsDiagnostic[]. The extension's
// registerDiagnostics adapter owns the DiagnosticCollection lifecycle (events, debounce,
// overlays, per-project URI-set diff) and converts via toVscodeDiagnostic.
//
// Validators are INJECTED (DI): validateCRL lives only in the core-root index.ts and
// validateCRLImports drags the import-resolution subsystem, so importing either would bloat
// the lean language-services subpath. The adapter passes them in. Error/diagnostic mapping is
// ported verbatim from the providers (two distinct shapes: CRLError for orphan, ValidationError
// for project) — only the result type changed (vscode.Diagnostic → LsDiagnostic).
import type { LsDiagnostic, LsSeverity, ZeroBasedRange } from "./contracts";
import type { ProjectIndex } from "./projectIndex";
import type { ImportDiagnostic } from "../imports/types";
import type { ValidationError } from "../validator/validator";

/** validateCRL's per-finding shape (orphan path). */
interface OrphanError {
  type: string;
  kind?: string;
  message: string;
  line?: number;
  column?: number;
}

/** The two validators, injected by the adapter (which imports them from the core root). */
export interface DiagnosticsValidators {
  validateCRL(input: string, options: { soft: boolean }): { errors?: OrphanError[]; warnings?: OrphanError[] };
  validateCRLImports(
    rootPath: string,
    options: { soft: boolean; overlays: ReadonlyMap<string, string> },
  ): {
    validationErrors: ValidationError[];
    validationWarnings: ValidationError[];
    importDiagnostics: ImportDiagnostic[];
  };
}

/** Typed result mirroring the adapter's three lifecycle behaviors. diagnostics are flat, each
 *  carrying its filePath (orphan → all the doc; project → per-file; crash → the doc). */
export type LsDiagnosticsResult =
  | { mode: "orphan"; diagnostics: LsDiagnostic[] }
  | { mode: "project"; projectRoot: string; diagnostics: LsDiagnostic[] }
  | { mode: "project-crash"; diagnostics: LsDiagnostic[] };

export function computeDiagnostics(
  filePath: string,
  sourceText: string,
  index: ProjectIndex,
  validators: DiagnosticsValidators,
): LsDiagnosticsResult {
  const projectRoot = index.getProjectRoot(filePath);

  if (projectRoot === null) {
    // Orphan-file path: legacy single-file validate. Crash → an orphan diagnostic (the adapter
    // still tracks it in orphanUriSet, so it clears on close).
    let result: { errors?: OrphanError[]; warnings?: OrphanError[] };
    try {
      result = validators.validateCRL(sourceText, { soft: true });
    } catch (e) {
      return { mode: "orphan", diagnostics: [crashDiagnostic(filePath, e)] };
    }
    const diagnostics: LsDiagnostic[] = [];
    for (const err of result.errors ?? []) diagnostics.push(crlErrorToLs(err, "error", filePath));
    for (const warn of result.warnings ?? []) diagnostics.push(crlErrorToLs(warn, "warning", filePath));
    return { mode: "orphan", diagnostics };
  }

  // Project path. invalidate so validateCRLImports sees the latest overlays.
  index.invalidate(projectRoot);
  let result: ReturnType<DiagnosticsValidators["validateCRLImports"]>;
  try {
    result = validators.validateCRLImports(filePath, { soft: true, overlays: index.getOverlays() });
  } catch (e) {
    return { mode: "project-crash", diagnostics: [crashDiagnostic(filePath, e)] };
  }

  const diagnostics: LsDiagnostic[] = [];
  for (const ve of result.validationErrors) diagnostics.push(validationErrorToLs(ve, "error", filePath));
  for (const vw of result.validationWarnings) diagnostics.push(validationErrorToLs(vw, "warning", filePath));
  for (const id of result.importDiagnostics) diagnostics.push(...mapImportDiagnostic(id));
  return { mode: "project", projectRoot, diagnostics };
}

/** Crash-sentinel: zero-length range, Information severity, no source/code (matches the providers). */
function crashDiagnostic(filePath: string, e: unknown): LsDiagnostic {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    filePath,
    range: { startLine: 0, startCol: 0, endLine: 0, endCol: 0 },
    severity: "information",
    message: `CRL validator crashed: ${msg}`,
  };
}

/** Orphan CRLError → LsDiagnostic (1-based line/column; one-char range; code = kind ?? type). */
function crlErrorToLs(err: OrphanError, severity: LsSeverity, filePath: string): LsDiagnostic {
  const line = Math.max(0, (err.line ?? 1) - 1);
  const column = Math.max(0, err.column ?? 0);
  return {
    filePath,
    range: { startLine: line, startCol: column, endLine: line, endCol: column + 1 },
    severity,
    message: err.message,
    code: err.kind ?? err.type,
    source: "crl",
  };
}

/** Project ValidationError → LsDiagnostic (start/end location; invalid/empty → one-char; code = kind). */
function validationErrorToLs(e: ValidationError, severity: LsSeverity, docFilePath: string): LsDiagnostic {
  const sl = Math.max(0, (e.location?.start.line ?? 1) - 1);
  const sc = Math.max(0, e.location?.start.column ?? 0);
  const el = Math.max(0, (e.location?.end.line ?? sl + 1) - 1);
  const ec = Math.max(0, e.location?.end.column ?? sc + 1);
  const range: ZeroBasedRange =
    el < sl || (el === sl && ec <= sc)
      ? { startLine: sl, startCol: sc, endLine: sl, endCol: sc + 1 }
      : { startLine: sl, startCol: sc, endLine: el, endCol: ec };
  return {
    filePath: e.filePath ?? docFilePath,
    range,
    severity,
    message: e.message,
    code: e.kind,
    source: "crl",
  };
}

const ZERO_RANGE: ZeroBasedRange = { startLine: 0, startCol: 0, endLine: 0, endCol: 1 };

function locationToRange(loc: {
  start: { line: number; column: number };
  end: { line: number; column: number };
}): ZeroBasedRange {
  const sl = Math.max(0, loc.start.line - 1);
  const sc = Math.max(0, loc.start.column);
  const el = Math.max(0, loc.end.line - 1);
  const ec = Math.max(0, loc.end.column);
  if (el < sl || (el === sl && ec <= sc)) return { startLine: sl, startCol: sc, endLine: sl, endCol: sc + 1 };
  return { startLine: sl, startCol: sc, endLine: el, endCol: ec };
}

/**
 * Map an ImportDiagnostic to one or more LsDiagnostic (each on the right file). The union has 8
 * kinds with different source-file shapes; ported verbatim from the extension's diagnosticMap.
 */
export function mapImportDiagnostic(diag: ImportDiagnostic): LsDiagnostic[] {
  const sev: LsSeverity = diag.severity === "error" ? "error" : "warning";
  switch (diag.kind) {
    case "parse-failure": {
      const out: LsDiagnostic[] = [];
      for (const inner of diag.errors) {
        const line = Math.max(0, (inner.line ?? 1) - 1);
        const column = Math.max(0, inner.column ?? 0);
        out.push({
          filePath: diag.filePath,
          range: { startLine: line, startCol: column, endLine: line, endCol: column + 1 },
          severity: sev,
          message: inner.message ?? "Parse error",
          code: diag.kind,
          source: "crl",
        });
      }
      if (out.length === 0) {
        out.push({ filePath: diag.filePath, range: ZERO_RANGE, severity: sev, message: "Parse failure", code: diag.kind, source: "crl" });
      }
      return out;
    }

    case "project-root-not-found":
      return [
        {
          filePath: diag.fromPath,
          range: ZERO_RANGE,
          severity: sev,
          message: "CRL: no package.json found walking up from this file — multi-file resolution disabled",
          code: diag.kind,
          source: "crl",
        },
      ];

    case "package-resolution-failure":
      return [
        {
          filePath: joinPath(diag.packagePath, "package.json"),
          range: ZERO_RANGE,
          severity: sev,
          message: diag.message,
          code: diag.kind,
          source: "crl",
        },
      ];

    case "registry-duplicate":
      return diag.filePaths.map((fp) => ({
        filePath: fp,
        range: ZERO_RANGE,
        severity: sev,
        message: `Duplicate library "${diag.name}" — registered in multiple files`,
        code: diag.kind,
        source: "crl",
      }));

    case "unresolved-include":
      return [
        {
          filePath: diag.from.filePath,
          range: locationToRange(diag.include.location),
          severity: sev,
          message: `Cannot resolve include "${diag.include.name}"`,
          code: diag.kind,
          source: "crl",
        },
      ];

    case "cycle": {
      const cycleMsg = `Include cycle: ${diag.filePaths.map((p) => fileBase(p)).join(" → ")}`;
      const out: LsDiagnostic[] = [];
      const N = Math.min(diag.includeChain.length, Math.max(0, diag.filePaths.length - 1));
      for (let i = 0; i < N; i++) {
        const inc = diag.includeChain[i];
        out.push({
          filePath: diag.filePaths[i],
          range: locationToRange(inc.location),
          severity: sev,
          message: cycleMsg,
          code: diag.kind,
          source: "crl",
        });
      }
      if (out.length === 0) {
        for (const fp of Array.from(new Set(diag.filePaths))) {
          out.push({ filePath: fp, range: ZERO_RANGE, severity: sev, message: cycleMsg, code: diag.kind, source: "crl" });
        }
      }
      return out;
    }

    case "alias-not-yet-supported":
      return [
        {
          filePath: diag.from.filePath,
          range: locationToRange(diag.include.location),
          severity: sev,
          message: `\`include "${diag.include.name}" as "${diag.include.alias ?? ""}".\` — alias semantics defer to v2.2; the include is treated as if no alias were given`,
          code: diag.kind,
          source: "crl",
        },
      ];

    case "redundant-local-include":
      return [
        {
          filePath: diag.from.filePath,
          range: locationToRange(diag.include.location),
          severity: sev,
          message: `\`include "${diag.include.name}".\` is redundant — local sibling libraries auto-resolve via qualified refs without an \`include\``,
          code: diag.kind,
          source: "crl",
        },
      ];
  }
}

function fileBase(p: string): string {
  const slash = p.lastIndexOf("/");
  const back = p.lastIndexOf("\\");
  const i = Math.max(slash, back);
  return i >= 0 ? p.slice(i + 1) : p;
}

function joinPath(dir: string, name: string): string {
  if (dir.endsWith("/") || dir.endsWith("\\")) return dir + name;
  if (dir.includes("\\")) return dir + "\\" + name;
  return dir + "/" + name;
}
