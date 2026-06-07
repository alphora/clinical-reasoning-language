/**
 * Catalog parser. Extracts CRL inference-pattern entries from the
 * inference-pattern-catalog.md reference tables and exposes them as
 * typed data for the completion + hover providers.
 *
 * The catalog has multiple reference tables (one per category: Assertion,
 * Contextualization, Selection, Temporal Predicates, Window-from-anchor,
 * etc.), each with the header `| Pattern | Narrative form | Canonical |
 * CQL function |`. This parser walks every such table and produces a flat
 * Pattern[] list.
 *
 * Catalog return-type annotations are stripped as of v0.6.0 ("What not How"
 * sweep) — see `features/cql-pattern-mining/inferred-from-is-semantic-
 * composition.md`. The parser does not handle them specially; it just
 * captures whatever the canonical column contains.
 */

/**
 * FHIR concept types CRL recognizes. Source of truth: the `CONCEPT_TYPE`
 * lexer rule in src/grammar/CRLLexer.g4 — keep in sync if the grammar adds
 * a type. Used to populate the `- type is X.` completion menu and the
 * type-keyword hover.
 */
export const CONCEPT_TYPES = [
  "AdverseEvent",
  "AllergyIntolerance",
  "ClinicalImpression",
  "Communication",
  "CommunicationRequest",
  "Condition",
  "DetectedIssue",
  "Device",
  "DiagnosticReport",
  "DocumentReference",
  "Encounter",
  "EpisodeOfCare",
  "FamilyMemberHistory",
  "Flag",
  "Goal",
  "Immunization",
  "MedicationAdministration",
  "MedicationDispense",
  "MedicationRequest",
  "MedicationStatement",
  "NutritionIntake",
  "NutritionOrder",
  "Observation",
  "Patient",
  "Procedure",
  "QuestionnaireResponse",
  "RiskAssessment",
  "ServiceRequest",
  "Task",
] as const;

/**
 * FHIR primitive / structured types CRL accepts as a `value type`. Source of
 * truth: the `CONCEPT_VALUE_TYPE` lexer rule. Used to populate `- value type
 * is X.` completion + hover.
 */
export const CONCEPT_VALUETYPES = [
  "Attachment",
  "boolean",
  "CodeableConcept",
  "dateTime",
  "integer",
  "Period",
  "Quantity",
  "Range",
  "Ratio",
  "SampledData",
  "string",
  "time",
] as const;

/**
 * v2.2 Todo 4 (issue #59) — types accepted in a `parameter` declaration's
 * `- param type is X.` slot. Source of truth: the `PARAMETER_TYPE` lexer rule
 * in `src/grammar/CRLLexer.g4`. Build-validated invariant per
 * `scripts/extractParameterTypes.js`: the allowlist is exactly
 * `CONCEPT_TYPES ∪ CONCEPT_VALUETYPES`.
 *
 * Static mirror — drift-guard tests in `catalog.test.mjs` assert exact
 * equality with `src/grammar/generated/types/parameterTypes.json` so a
 * grammar change immediately fails the extension build.
 */
export const PARAMETER_TYPES = [
  ...CONCEPT_TYPES,
  ...CONCEPT_VALUETYPES,
] as const;

export interface Pattern {
  /** e.g., `Has(X)` — short canonical call form */
  canonical: string;
  /** e.g., `has <X>` — author-facing narrative template with `<placeholder>` slots */
  narrative: string;
  /** e.g., `Has(X: ConceptRef)` — full signature with parameter types */
  signature: string;
  /** e.g., `CRLCommon.Has` — the emitter's CQL function reference */
  cqlFunction: string;
  /** the category header text under which this pattern's table appeared, e.g. "Assertion" */
  category: string;
}

const TABLE_HEADER_RE = /^\|\s*Pattern\s*\|\s*Narrative form\s*\|\s*Canonical\s*\|\s*CQL function\s*\|/i;
const SEPARATOR_ROW_RE = /^\|\s*[-:]+\s*\|\s*[-:]+\s*\|\s*[-:]+\s*\|\s*[-:]+\s*\|/;
/** A markdown heading at depth 2 or 3 — used to capture the category text. */
const HEADING_RE = /^(##+)\s+(.+?)\s*$/;

/**
 * Parse a catalog markdown into a flat Pattern[] list. Returns an empty list
 * if no pattern reference tables are found.
 */
export function parseCatalog(markdown: string): Pattern[] {
  const lines = markdown.split(/\r?\n/);
  const patterns: Pattern[] = [];
  let currentCategory = "";
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      currentCategory = headingMatch[2];
      inTable = false;
      continue;
    }

    if (TABLE_HEADER_RE.test(line)) {
      inTable = true;
      // skip the separator row that follows the header
      if (i + 1 < lines.length && SEPARATOR_ROW_RE.test(lines[i + 1])) {
        i++;
      }
      continue;
    }

    if (!inTable) continue;

    // An HTML comment inside a reference table (used to defer/disable rows —
    // e.g. the #99 catalog-sync deferrals) must NOT terminate the table:
    // active rows can follow a comment. Skip the comment (single- or
    // multi-line) and keep scanning. Without this, the first `<!-- ... -->`
    // line drops every row beneath it (issue #109).
    if (line.trim().startsWith("<!--")) {
      while (!lines[i].includes("-->") && i + 1 < lines.length) i++;
      continue;
    }

    // A table row in the canonical tables looks like:
    //   | `Name(args)` | `narrative <X>` | `Name(args: T)` | `CRLCommon.Name` |
    // A blank line or a non-table line ends the table.
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }

    const row = parseTableRow(line);
    if (!row) continue;

    patterns.push({ ...row, category: currentCategory });
  }

  return patterns;
}

interface PatternFields {
  canonical: string;
  narrative: string;
  signature: string;
  cqlFunction: string;
}

/**
 * Split a markdown table row into its 4 cells and extract the backticked
 * canonical content. Returns null if the row doesn't match the 4-column
 * Pattern table shape (e.g., a row in some other table or a comment line).
 */
function parseTableRow(line: string): PatternFields | null {
  // Strip the leading and trailing pipes, then split on unescaped pipes.
  // Markdown tables allow `\|` to be a literal pipe inside a cell.
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const inner = trimmed.slice(1, -1);
  const cells = splitEscapedPipes(inner).map((c) => c.trim());
  if (cells.length !== 4) return null;

  const canonical = extractBackticked(cells[0]);
  const narrative = extractBackticked(cells[1]);
  const signature = extractBackticked(cells[2]);
  const cqlFunction = extractBackticked(cells[3]);

  if (!canonical || !narrative || !signature || !cqlFunction) return null;
  // Heuristic: a real pattern row's canonical starts with a letter and
  // contains a `(`. Accepts PascalCase (`Has(X)`) AND kebab-case canonicals
  // used by the window-from-anchor sub-grammar (`before-start-of(...)`).
  // Filters out separator-style or notes-only rows.
  if (!/^[A-Za-z][A-Za-z0-9-]*\(/.test(canonical)) return null;

  return { canonical, narrative, signature, cqlFunction };
}

/** Split on `|` but treat `\|` as a literal (escaped pipe in a markdown cell). */
function splitEscapedPipes(s: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * Extract the FIRST backtick-wrapped substring in a cell. Cells often have
 * trailing prose after the backticked content (e.g.
 * `` `has history of <X>` (optionally `prior to <anchor>`) ``); we capture
 * the first because that's the canonical form. The trailing prose is
 * preserved verbatim in the narrative field when relevant.
 */
function extractBackticked(cell: string): string {
  const m = /`([^`]+)`/.exec(cell);
  return m ? m[1] : "";
}

/**
 * Return the list of placeholder names referenced in a narrative template.
 * For `has history of <X>` returns `["X"]`. For `<X> during <Y>` returns
 * `["X", "Y"]`. Order preserved; duplicates kept.
 */
export function narrativePlaceholders(narrative: string): string[] {
  const re = /<([A-Za-z][A-Za-z0-9_]*)>/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(narrative)) !== null) {
    names.push(m[1]);
  }
  return names;
}

/**
 * Build a VS Code snippet string body from a narrative template. Each
 * `<placeholder>` becomes `"${N:placeholder}"` so the tab-stop drops the
 * author straight into a quoted concept-ref slot. Returns the snippet body
 * as a plain string (the caller wraps it in `vscode.SnippetString`); this is
 * separated out from the provider for unit-testability.
 */
export function buildSnippetBody(narrative: string): string {
  let i = 0;
  return narrative.replace(/<([A-Za-z][A-Za-z0-9_]*)>/g, (_m, name: string) => {
    i++;
    return `"\${${i}:${name}}"`;
  });
}

/**
 * Return true if a line of CRL is a `definition is` body (the cursor is in a
 * position where narrative completion / hover is meaningful). Accepts the
 * line text up to and including the cursor position.
 */
export function isDefinitionIsBody(linePrefix: string): boolean {
  return /^\s*-\s*definition\s+is\s/i.test(linePrefix);
}

/**
 * Compile a narrative template into a regex that matches a concrete
 * instance of that pattern. `<placeholder>` slots become `"[^"]+"` so a
 * quoted concept name is required at each slot. Literal whitespace in the
 * template is collapsed to `\s+` so authors can use any whitespace they
 * like between tokens.
 */
export function compileNarrativeMatcher(narrative: string): RegExp {
  const parts = narrative.split(/<([A-Za-z][A-Za-z0-9_]*)>/);
  let regex = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const escaped = parts[i]
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");
      regex += escaped;
    } else {
      regex += `"[^"]+"`;
    }
  }
  return new RegExp(regex);
}
