/**
 * Document scanner: extracts every `concept "Name":` / `terminology "Name":`
 * declaration from a CRL document, along with the line it appears on and
 * the type / valuetype declaration text (when present). Used by the concept-
 * reference completion provider (so authors can autocomplete a quoted name
 * to one of the declarations in scope) and the concept-reference hover
 * provider (so authors can see what a referenced name is declared as).
 *
 * Pure regex pass — no parser dependency. Works on partially-edited
 * documents that may not yet be parseable.
 */

export type DeclarationKind = "concept" | "terminology" | "parameter";

export interface Declaration {
  /** The quoted name as written, without the surrounding quotes. */
  name: string;
  kind: DeclarationKind;
  /** 0-based line of the declaration header. */
  line: number;
  /**
   * For concepts: the FHIR resource type (e.g. `Observation`) if declared.
   * For parameters: the CRL parameter type (e.g. `Period`, `Patient`).
   */
  type?: string;
  /** The valuetype (e.g., `boolean`) if the body declares one. Concept-only. */
  valuetype?: string;
  /** First body bullet text (e.g. `coded from "X"`, `defined as ...`, `definition is ...`, `param type is X`) for hover preview. */
  bodyPreview?: string;
}

const HEADER_RE = /^(concept|terminology|parameter)\s+"([^"]+)"\s*:\s*$/;
const TYPE_BULLET_RE = /^\s*-\s*type\s+is\s+([A-Za-z][A-Za-z0-9]*)\s*\.\s*$/;
const VALUETYPE_BULLET_RE = /^\s*-\s*value type\s+is\s+([A-Za-z][A-Za-z0-9]*)\s*\.\s*$/;
const PARAM_TYPE_BULLET_RE = /^\s*-\s*param\s+type\s+is\s+([A-Za-z][A-Za-z0-9]*)\s*\.\s*$/;
const BODY_BULLET_RE = /^\s*-\s*(.+?)\s*\.?\s*$/;

/**
 * Walk the source text and return every concept/terminology declaration
 * found, in source order. Declarations whose body is malformed are still
 * returned with whatever fields could be extracted.
 */
export function scanDeclarations(source: string): Declaration[] {
  const lines = source.split(/\r?\n/);
  const out: Declaration[] = [];

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = HEADER_RE.exec(lines[i]);
    if (!headerMatch) continue;

    const decl: Declaration = {
      name: headerMatch[2],
      kind: headerMatch[1] as DeclarationKind,
      line: i,
    };

    // Walk subsequent `- ...` bullet lines until the body ends.
    for (let j = i + 1; j < lines.length; j++) {
      const bodyLine = lines[j];
      // Body ends when we hit a blank line OR another header OR a non-bullet line.
      if (bodyLine.trim() === "") break;
      if (HEADER_RE.test(bodyLine)) break;

      const typeMatch = TYPE_BULLET_RE.exec(bodyLine);
      if (typeMatch) {
        decl.type = typeMatch[1];
        continue;
      }
      const vtMatch = VALUETYPE_BULLET_RE.exec(bodyLine);
      if (vtMatch) {
        decl.valuetype = vtMatch[1];
        continue;
      }
      // v2.2 Todo 4 (issue #59) — parameter `- param type is X.` bullet sets
      // `decl.type` (symmetric with concept resource-type storage) AND
      // bodyPreview as `param type is X` (no trailing period — matches the
      // shape `projectIndex.ts` produces, so hover/completion render the
      // same way whether the source comes from the parser or the orphan
      // scanner). Parameter declarations have exactly one body bullet per
      // grammar, so no later bullet can overwrite this.
      const paramMatch = PARAM_TYPE_BULLET_RE.exec(bodyLine);
      if (paramMatch) {
        decl.type = paramMatch[1];
        decl.bodyPreview = `param type is ${paramMatch[1]}`;
        continue;
      }
      // The first non-type/valuetype bullet becomes the preview snippet
      // (typically `coded from "X"`, `defined as ...`, `definition is ...`).
      const bodyMatch = BODY_BULLET_RE.exec(bodyLine);
      if (bodyMatch && !decl.bodyPreview) {
        decl.bodyPreview = bodyMatch[1];
      }
    }

    out.push(decl);
  }

  return out;
}

/**
 * Convenience: return declarations keyed by name. Last write wins if a name
 * is duplicated (the validator catches duplicates separately; for completion
 * we just want one entry per name).
 */
export function declarationsByName(decls: Declaration[]): Map<string, Declaration> {
  const m = new Map<string, Declaration>();
  for (const d of decls) m.set(d.name, d);
  return m;
}

import { findByConceptFirstPrecedence } from "./completionHelpers";

/**
 * v2.2 Todo 4 (issue #59) — name lookup with concept-first precedence.
 * Thin wrapper over the shared `findByConceptFirstPrecedence` helper. See
 * its docstring in `completionHelpers.ts` for the precedence rule.
 *
 * Used by the orphan-file hover fallback so its behavior mirrors the
 * parser-backed indexed path's `findIndexedNarrative` helper in `hover.ts`,
 * which uses the same shared helper.
 */
export function findNarrativeDeclaration(
  decls: Declaration[],
  name: string,
): Declaration | undefined {
  return findByConceptFirstPrecedence(decls, (d) => d.name === name);
}
