// #154/#203: registry-backed enforcement of the `@tag` metadata model. Walks every concept/decision/library
// `.meta` line and validates against the compile-time registry: VOCABULARY (malformed / unknown `@tag`), FIELD
// shape (required fields present; enum fields in range; no duplicate keyed fields), CARDINALITY (by canonical tag),
// and the FLAG open-warning (an `open` flag blocks Medical Validation completion). Anchors every diagnostic at the
// meta LINE (shape (b) location). Emits diagnostics with intrinsic `severity`; the orchestrator routes by that.
//
// SCOPE (this pass): the flag-feature-critical + core registry rules above. The family-C extraction-exhaust rules
// (`run`-required, re-run staleness) and the re-add-detection guard are the documented #154 remainder — they concern
// extraction provenance, not the flag/mvComplete path.
import type { CRL, Concept, Decision, Location, MetaEntry } from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import { parseMetaTag } from "../meta/parseMetaTag";
import { cardinalityOf, canonicalTag, fieldRulesOf, isFlag, isKnownTag } from "../meta/registry";

import type { MetaDiagnostic } from "./validator";

interface Attribution {
  libraryName?: string;
  filePath?: string;
}

export class MetaTagValidator {
  /** Single-file (`sources` absent) OR multi-file. In multi-file mode, `library.meta` is validated once per source
   *  file and statement meta is validated with per-statement attribution. */
  public validate(ast: CRL, sources?: SourceContext[]): MetaDiagnostic[] {
    const out: MetaDiagnostic[] = [];
    if (sources && sources.length > 0) {
      // library meta — once per distinct source file (dedupe by filePath).
      const seenFiles = new Set<string>();
      for (const src of sources) {
        const entry = (src as { entry?: { ast?: CRL; filePath?: string; libraryName?: string } }).entry;
        const filePath = entry?.filePath;
        if (entry?.ast?.library && filePath && !seenFiles.has(filePath)) {
          seenFiles.add(filePath);
          this.checkTarget(out, entry.ast.library.meta, { libraryName: entry.ast.library.name, filePath });
        }
      }
      // statement meta — per-statement attribution.
      for (const src of sources) {
        const s = (src as { stmt?: unknown; entry?: { filePath?: string; libraryName?: string } }).stmt;
        const attr: Attribution = { libraryName: (src as { entry?: { libraryName?: string } }).entry?.libraryName, filePath: (src as { entry?: { filePath?: string } }).entry?.filePath };
        this.checkStatement(out, s, attr);
      }
      return out;
    }
    // single-file
    const attr: Attribution = { libraryName: ast.library?.name };
    if (ast.library) this.checkTarget(out, ast.library.meta, attr);
    for (const s of ast.statements) this.checkStatement(out, s, attr);
    return out;
  }

  private checkStatement(out: MetaDiagnostic[], s: unknown, attr: Attribution): void {
    const node = s as { type?: string; meta?: MetaEntry[] };
    if (node?.type === "Concept") this.checkTarget(out, (s as Concept).meta, attr);
    else if (node?.type === "Decision") this.checkTarget(out, (s as Decision).meta, attr);
  }

  /** Validate all meta lines on one target (concept / decision / library). Cardinality counts by CANONICAL tag. */
  private checkTarget(out: MetaDiagnostic[], meta: MetaEntry[] | undefined, attr: Attribution): void {
    if (!meta || meta.length === 0) return;
    const canonicalCounts = new Map<string, number>();
    for (const entry of meta) {
      const res = parseMetaTag(entry.text);
      if (res.kind === "note") continue;
      if (res.kind === "malformed") {
        out.push(this.diag("meta-malformed-tag", "warning", `Malformed metadata tag — a '@'-prefixed meta line must match '@<tag>: …' (lowercase, hyphenated). Treated as an untyped note.`, entry.location, attr));
        continue;
      }
      const { tag, fields, duplicateFields } = res.parsed;
      const canon = canonicalTag(tag);
      if (!canon) {
        out.push(this.diag("meta-unknown-tag", "warning", `Unknown metadata tag '@${tag}:' — not in the registry. Treated as an untyped note (a flag typed this way would NOT gate Medical Validation).`, entry.location, attr));
        continue;
      }
      canonicalCounts.set(canon, (canonicalCounts.get(canon) ?? 0) + 1);
      // duplicate keyed fields
      for (const dup of duplicateFields) {
        out.push(this.diag("meta-duplicate-field", "error", `Duplicate '${dup}' field on '@${tag}:' — a keyed field may appear at most once per line.`, entry.location, attr));
      }
      // field rules (required / enum), registry-driven
      for (const rule of fieldRulesOf(tag)) {
        const has = fields.has(rule.key);
        const value = fields.get(rule.key) ?? "";
        if (rule.required && (!has || value === "")) {
          out.push(this.diag("meta-missing-field", "error", `'@${tag}:' requires a '${rule.key}' field (e.g. '; ${rule.key} …').`, entry.location, attr));
        } else if (has && rule.values && value !== "" && !rule.values.includes(value)) {
          out.push(this.diag("meta-invalid-field", "error", `'@${tag}:' field '${rule.key}' has invalid value '${value}' — allowed: ${rule.values.join(" | ")}.`, entry.location, attr));
        }
      }
      // FLAG: an `open` flag (status absent → open) blocks mvComplete → warn.
      if (isFlag(tag)) {
        const status = fields.get("status") ?? "open";
        if (status === "open") {
          out.push(this.diag("open-flag", "warning", `Open flag '@${tag}:' on ${attr.libraryName ? "" : ""}'${this.body(res.parsed.body)}' — blocks Medical Validation completion; resolve it in MV.`, entry.location, attr));
        }
      }
    }
    // cardinality (by canonical tag)
    for (const [canon, count] of canonicalCounts) {
      const card = cardinalityOf(canon);
      if (card === "0..1" && count > 1) {
        // anchor at the first offending line
        const first = meta.find((e) => canonicalTag(parseMetaTag(e.text).kind === "tag" ? (parseMetaTag(e.text) as { parsed: { tag: string } }).parsed.tag : "") === canon);
        if (first) out.push(this.diag("meta-cardinality", "error", `'@${canon}:' may appear at most once (cardinality 0..1) but appears ${count} times.`, first.location, attr));
      }
    }
  }

  private body(b: string): string {
    return b.length > 40 ? `${b.slice(0, 39)}…` : b;
  }

  private diag(kind: MetaDiagnostic["kind"], severity: "error" | "warning", message: string, location: Location, attr: Attribution): MetaDiagnostic {
    return {
      kind,
      severity,
      message,
      location,
      ...(attr.libraryName ? { libraryName: attr.libraryName } : {}),
      ...(attr.filePath ? { filePath: attr.filePath } : {}),
    };
  }
}
