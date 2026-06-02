import * as vscode from "vscode";

import type { ImportDiagnostic } from "@smile-digital-health/crl";

/**
 * Pure helper: map an `ImportDiagnostic` to one or more (URI, Range)
 * pairs so the extension can surface it as a `vscode.Diagnostic` on the
 * right file. The union has 8 kinds with different source-file shapes
 * (filePath / from.filePath / filePaths[] / packagePath / fromPath);
 * this switch enumerates each.
 *
 * Returns an array because some kinds (registry-duplicate, cycle) span
 * multiple files; each entry produces a diagnostic on a separate URI.
 */
export interface MappedDiagnostic {
  uri: vscode.Uri;
  range: vscode.Range;
  severity: vscode.DiagnosticSeverity;
  message: string;
  /** Stable discriminator from `ImportDiagnostic.kind`. */
  code: string;
}

const ZERO_RANGE = new vscode.Range(0, 0, 0, 1);

function locationToRange(loc: { start: { line: number; column: number }; end: { line: number; column: number } }): vscode.Range {
  const sl = Math.max(0, loc.start.line - 1);
  const sc = Math.max(0, loc.start.column);
  const el = Math.max(0, loc.end.line - 1);
  const ec = Math.max(0, loc.end.column);
  if (el < sl || (el === sl && ec <= sc)) return new vscode.Range(sl, sc, sl, sc + 1);
  return new vscode.Range(sl, sc, el, ec);
}

function severity(s: "error" | "warning"): vscode.DiagnosticSeverity {
  return s === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
}

export function mapImportDiagnostic(diag: ImportDiagnostic): MappedDiagnostic[] {
  const sev = severity(diag.severity);
  switch (diag.kind) {
    case "parse-failure": {
      // The inner errors have line/column; show one diagnostic per inner.
      const out: MappedDiagnostic[] = [];
      for (const inner of diag.errors) {
        const line = Math.max(0, (inner.line ?? 1) - 1);
        const column = Math.max(0, inner.column ?? 0);
        out.push({
          uri: vscode.Uri.file(diag.filePath),
          range: new vscode.Range(line, column, line, column + 1),
          severity: sev,
          message: inner.message ?? "Parse error",
          code: diag.kind,
        });
      }
      if (out.length === 0) {
        out.push({
          uri: vscode.Uri.file(diag.filePath),
          range: ZERO_RANGE,
          severity: sev,
          message: "Parse failure",
          code: diag.kind,
        });
      }
      return out;
    }

    case "project-root-not-found":
      // No source file — attach at line 0 of the file that triggered the
      // walk (`fromPath`). The user typically already sees the absence
      // via "no completions"; the diagnostic helps surface why.
      return [
        {
          uri: vscode.Uri.file(diag.fromPath),
          range: ZERO_RANGE,
          severity: sev,
          message: "CRL: no package.json found walking up from this file — multi-file resolution disabled",
          code: diag.kind,
        },
      ];

    case "package-resolution-failure":
      // The user's source isn't directly at fault — attach at line 0 of
      // the package.json (best we can do without parser positions) so
      // it appears in Problems without polluting a CRL file. Use the
      // platform-correct path separator.
      return [
        {
          uri: vscode.Uri.file(joinPath(diag.packagePath, "package.json")),
          range: ZERO_RANGE,
          severity: sev,
          message: diag.message,
          code: diag.kind,
        },
      ];

    case "registry-duplicate":
      // Two source files with the same library name. Diagnostic on both.
      return diag.filePaths.map((fp) => ({
        uri: vscode.Uri.file(fp),
        range: ZERO_RANGE,
        severity: sev,
        message: `Duplicate library "${diag.name}" — registered in multiple files`,
        code: diag.kind,
      }));

    case "unresolved-include":
      return [
        {
          uri: vscode.Uri.file(diag.from.filePath),
          range: locationToRange(diag.include.location),
          severity: sev,
          message: `Cannot resolve include "${diag.include.name}"`,
          code: diag.kind,
        },
      ];

    case "cycle": {
      // `includeChain[i]` is the Include node in `filePaths[i]` that
      // led to `filePaths[i+1]`. Iterate the pair-zip so each diagnostic
      // lands on the right file at the right include site. Round-1 code
      // review C1 fix.
      const cycleMsg = `Include cycle: ${diag.filePaths.map((p) => fileBase(p)).join(" → ")}`;
      const out: MappedDiagnostic[] = [];
      const N = Math.min(diag.includeChain.length, Math.max(0, diag.filePaths.length - 1));
      for (let i = 0; i < N; i++) {
        const inc = diag.includeChain[i];
        const fromPath = diag.filePaths[i];
        out.push({
          uri: vscode.Uri.file(fromPath),
          range: locationToRange(inc.location),
          severity: sev,
          message: cycleMsg,
          code: diag.kind,
        });
      }
      if (out.length === 0) {
        // Fallback: at least put a diagnostic at line 0 of each unique
        // file in the closure so users see SOMETHING.
        for (const fp of Array.from(new Set(diag.filePaths))) {
          out.push({
            uri: vscode.Uri.file(fp),
            range: ZERO_RANGE,
            severity: sev,
            message: cycleMsg,
            code: diag.kind,
          });
        }
      }
      return out;
    }

    case "alias-not-yet-supported":
      return [
        {
          uri: vscode.Uri.file(diag.from.filePath),
          range: locationToRange(diag.include.location),
          severity: sev,
          message: `\`include "${diag.include.name}" as "${diag.include.alias ?? ""}".\` — alias semantics defer to v2.2; the include is treated as if no alias were given`,
          code: diag.kind,
        },
      ];

    case "redundant-local-include":
      return [
        {
          uri: vscode.Uri.file(diag.from.filePath),
          range: locationToRange(diag.include.location),
          severity: sev,
          message: `\`include "${diag.include.name}".\` is redundant — local sibling libraries auto-resolve via qualified refs without an \`include\``,
          code: diag.kind,
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
  // Use the same separator the directory path already uses.
  if (dir.includes("\\")) return dir + "\\" + name;
  return dir + "/" + name;
}
