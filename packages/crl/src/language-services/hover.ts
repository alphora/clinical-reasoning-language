// Headless hover logic (#132 step 3). VS-Code-free: each compute* function takes the
// source/line + a 0-based position (+ injected catalog data / a ProjectIndex) and
// returns an LsHover (plain markdown + range) — the extension's HoverProvider adapters
// convert that to vscode.Hover. Logic ported verbatim from the providers; only the
// result construction changed (MarkdownString → string, vscode.Range → ZeroBasedRange).
import type { LsHover, LsPosition, ZeroBasedRange } from "./contracts";
import { scanDeclarations, findNarrativeDeclaration, type Declaration } from "./concepts";
import { findByConceptFirstPrecedence } from "./completionHelpers";
import type { IndexedDeclaration, ProjectIndex } from "./projectIndex";

/** True if a line is a `- definition is ` body (narrative hover/completion is meaningful). */
const DEFINITION_IS_RE = /^\s*-\s*definition\s+is\s/i;

/** A catalog narrative pattern with its precompiled matcher — injected by the adapter
 *  (which owns the catalog), so core hover stays catalog-independent. This is an ADAPTER
 *  INPUT SEAM, not a plain-data Ls* contract: `matcher` is executable JS, not serializable.
 *  A future non-extension caller (Coral) that lacks the catalog should revisit this shape. */
export interface CompiledNarrativePattern {
  canonical: string;
  category: string;
  narrative: string;
  signature: string;
  cqlFunction: string;
  /** MUST be non-global / non-sticky: `exec` is called once positionally per hover, so a
   *  `/g` or `/y` regex would carry `lastIndex` across calls and intermittently miss.
   *  (compileNarrativeMatcher returns a flagless RegExp — the only current producer.) */
  matcher: RegExp;
}

/** Hover over a narrative pattern in a `- definition is ` body: longest catalog match
 *  containing the cursor. */
export function computeNarrativeHover(
  lineText: string,
  position: LsPosition,
  compiled: readonly CompiledNarrativePattern[],
): LsHover | null {
  if (!DEFINITION_IS_RE.test(lineText)) return null;
  const cursorCol = position.character;

  let best: { pattern: CompiledNarrativePattern; start: number; end: number } | null = null;
  for (const cp of compiled) {
    const m = cp.matcher.exec(lineText);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (cursorCol < start || cursorCol > end) continue;
    const length = end - start;
    if (!best || length > best.end - best.start) best = { pattern: cp, start, end };
  }
  if (!best) return null;

  const p = best.pattern;
  const markdown =
    `**${p.canonical}** — *${p.category || "pattern"}*\n\n` +
    `Narrative: \`${p.narrative}\`\n\n` +
    `Signature: \`${p.signature}\`\n\n` +
    `CQL: \`${p.cqlFunction}\``;
  return { markdown, range: lineRange(position.line, best.start, best.end) };
}

/** Grammar type allowlists, injected by the adapter (mirrored from the grammar in core). */
export interface TypeAllowlists {
  conceptTypes: readonly string[];
  valueTypes: readonly string[];
  paramTypes: readonly string[];
}

/** Hover over a `- type is X.` / `- value type is X.` / `- param type is X.` token. */
export function computeTypeValuetypeHover(
  lineText: string,
  position: LsPosition,
  allow: TypeAllowlists,
): LsHover | null {
  const conceptSet = new Set(allow.conceptTypes);
  const valueSet = new Set(allow.valueTypes);
  const paramSet = new Set(allow.paramTypes);

  const typeMatch = /^(\s*-\s*type\s+is\s+)([A-Za-z][A-Za-z0-9]*)(\s*\.\s*)?$/.exec(lineText);
  if (typeMatch) {
    const tokenStart = typeMatch[1].length;
    const tokenEnd = tokenStart + typeMatch[2].length;
    if (position.character >= tokenStart && position.character <= tokenEnd) {
      const name = typeMatch[2];
      let markdown = `**${name}** — FHIR resource type\n\n`;
      if (!conceptSet.has(name)) {
        markdown += `⚠ Not in the recognized type set. Valid: ${allow.conceptTypes.join(", ")}.`;
      } else {
        markdown += `Used in \`- type is ${name}.\` to declare the concept's FHIR resource type.`;
      }
      return { markdown, range: lineRange(position.line, tokenStart, tokenEnd) };
    }
  }

  const vtMatch = /^(\s*-\s*value type\s+is\s+)([A-Za-z][A-Za-z0-9]*)(\s*\.\s*)?$/.exec(lineText);
  if (vtMatch) {
    const tokenStart = vtMatch[1].length;
    const tokenEnd = tokenStart + vtMatch[2].length;
    if (position.character >= tokenStart && position.character <= tokenEnd) {
      const name = vtMatch[2];
      let markdown = `**${name}** — FHIR value type\n\n`;
      if (!valueSet.has(name)) {
        markdown += `⚠ Not in the recognized value type set. Valid: ${allow.valueTypes.join(", ")}.`;
      } else {
        markdown += `Used in \`- value type is ${name}.\` to declare the concept's value-bearing type.`;
      }
      return { markdown, range: lineRange(position.line, tokenStart, tokenEnd) };
    }
  }

  const paramMatch = /^(\s*-\s*param\s+type\s+is\s+)([A-Za-z][A-Za-z0-9]*)(\s*\.\s*)?$/.exec(lineText);
  if (paramMatch) {
    const tokenStart = paramMatch[1].length;
    const tokenEnd = tokenStart + paramMatch[2].length;
    if (position.character >= tokenStart && position.character <= tokenEnd) {
      const name = paramMatch[2];
      let markdown = `**${name}** — CRL parameter type\n\n`;
      if (!paramSet.has(name)) {
        markdown += `⚠ Not in the recognized parameter type set.`;
      } else if (name === "Patient") {
        markdown += `Used in \`- param type is Patient.\` to declare a patient-scoped runtime input. `;
        markdown += `The emitter collapses this to CQL \`context Patient\`; the parameter's quoted CRL name is not emitted, and the CQL \`context Patient\` line has no per-name identifier.`;
      } else {
        markdown += `Used in \`- param type is ${name}.\` to declare the parameter's runtime type.`;
      }
      return { markdown, range: lineRange(position.line, tokenStart, tokenEnd) };
    }
  }

  return null;
}

/** Hover over a quoted concept reference: resolve via the project index (multi-file) or
 *  the file-local scan (orphan file). */
export function computeConceptRefHover(
  source: string,
  filePath: string,
  lineText: string,
  position: LsPosition,
  index: ProjectIndex,
): LsHover | null {
  const span = quotedSpanAt(lineText, position.character);
  if (!span) return null;
  const name = span.text;

  const prefixBeforeSpan = lineText.slice(0, span.start);
  const qualifierMatch = /"([^"]+)"\s*\.\s*$/.exec(prefixBeforeSpan);
  const range = lineRange(position.line, span.start, span.end);

  const indexed = index.getDeclarations(filePath);
  if (indexed.length > 0) {
    const decl = qualifierMatch
      ? findIndexedNarrative(indexed, qualifierMatch[1], name)
      : findIndexedNarrative(indexed, undefined, name);
    if (!decl) return null;
    return { markdown: formatIndexedHover(decl), range };
  }

  const decls = scanDeclarations(source);
  const decl = findNarrativeDeclaration(decls, name);
  if (!decl) return null;
  return { markdown: formatLocalHover(decl), range };
}

/**
 * Name lookup against the project index with concept-first precedence. Cross-origin
 * same-library-name lookups (e.g. a local "Lib" + a package "Lib" both holding a "BMI"
 * concept) fall back to source-enumeration order — the qualifier filter matches only
 * `libraryName`, not origin, diverging from ProjectIndex.resolveTargetKind's origin
 * precedence (local → root → package). Tolerable because the cross-origin case is rare
 * and the validator enforces canonical resolution at parse time; documented so future
 * work can sharpen it.
 */
function findIndexedNarrative(
  indexed: IndexedDeclaration[],
  qualifier: string | undefined,
  name: string,
): IndexedDeclaration | undefined {
  return findByConceptFirstPrecedence(
    indexed,
    (d) => d.name === name && (qualifier === undefined || d.libraryName === qualifier),
  );
}

function formatIndexedHover(decl: IndexedDeclaration): string {
  let md = `**${decl.name}** — ${decl.kind}\n\n`;
  md += `Library: \`${decl.libraryName}\`\n\n`;
  if (decl.type) md += `Type: \`${decl.type}\`\n\n`;
  if (decl.valuetype) md += `Value type: \`${decl.valuetype}\`\n\n`;
  if (decl.bodyPreview) md += `Body: \`${decl.bodyPreview}\`\n\n`;
  md += `Declared at \`${decl.filePath}\`:${decl.line + 1}.`;
  return md;
}

function formatLocalHover(decl: Declaration): string {
  let md = `**${decl.name}** — ${decl.kind}\n\n`;
  if (decl.type) md += `Type: \`${decl.type}\`\n\n`;
  if (decl.valuetype) md += `Value type: \`${decl.valuetype}\`\n\n`;
  if (decl.bodyPreview) md += `Body: \`${decl.bodyPreview}\`\n\n`;
  md += `Declared at line ${decl.line + 1}.`;
  return md;
}

/** Span (start+end+inner text) of the quoted string under `col`, if any. */
export function quotedSpanAt(
  lineText: string,
  col: number,
): { start: number; end: number; text: string } | null {
  const re = /"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (col >= start && col <= end) return { start, end, text: m[1] };
  }
  return null;
}

function lineRange(line: number, startCol: number, endCol: number): ZeroBasedRange {
  return { startLine: line, startCol, endLine: line, endCol };
}
