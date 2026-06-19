// Headless completion logic (#132 step 3b). VS-Code-free: each compute* function takes the
// line prefix (+ source/filePath/position/ProjectIndex for the ref provider) and returns
// LsCompletionItem[] — the extension's CompletionItemProvider adapters convert via
// toVscodeCompletionItem. Logic ported verbatim from the providers; only result
// construction changed (vscode.CompletionItem → LsCompletionItem). Per the plan review (091)
// completion imports the catalog from core directly (unlike hover's DI seam); the `patterns`
// list is still passed in (it is the runtime catalog.json artifact loaded by the host).
import type { LsCompletionItem, LsCompletionKind, LsPosition } from "./contracts";
import {
  buildSnippetBody,
  isDefinitionIsBody,
  CONCEPT_TYPES,
  CONCEPT_VALUETYPES,
  PARAMETER_TYPES,
  type Pattern,
} from "./catalog";
import { scanDeclarations, type Declaration } from "./concepts";
import { applyNarrativePrecedence } from "./completionHelpers";
import {
  detectExpectedKind,
  detectQualifiedRefQualifier,
  isInsideOpenQuote,
  type ExpectedRefKind,
} from "./contextDetect";
import {
  isTypeCompletionPrefix,
  isValuetypeCompletionPrefix,
  isParamTypeCompletionPrefix,
  isUnquotedTypeSlotPrefix,
} from "./completionHelpers";
import type { ProjectIndex } from "./projectIndex";

/** Narrative-pattern completion inside a `- definition is ` body. `linePrefix` is the line
 *  text up to the cursor. Returns [] (not undefined) outside a definition-is body. */
export function computeNarrativeCompletion(
  linePrefix: string,
  patterns: readonly Pattern[],
): LsCompletionItem[] {
  if (!isDefinitionIsBody(linePrefix)) return [];
  return patterns.map(buildNarrativeItem);
}

function buildNarrativeItem(pattern: Pattern): LsCompletionItem {
  const documentation =
    `**${pattern.canonical}** — *${pattern.category || "pattern"}*\n\n` +
    `Narrative: \`${pattern.narrative}\`\n\n` +
    `Signature: \`${pattern.signature}\`\n\n` +
    `CQL: \`${pattern.cqlFunction}\``;
  const leadWordMatch = /^([A-Za-z][A-Za-z\- ]*?)(?:\s+<|$)/.exec(pattern.narrative);
  return {
    label: pattern.narrative,
    kind: "snippet",
    insertText: buildSnippetBody(pattern.narrative),
    insertTextFormat: "snippet",
    detail: pattern.signature,
    documentation,
    sortText: (leadWordMatch?.[1] ?? pattern.canonical).toLowerCase(),
  };
}

/** Completion for a `- type is <X>.` line. */
export function computeTypeCompletion(linePrefix: string): LsCompletionItem[] {
  if (!isTypeCompletionPrefix(linePrefix)) return [];
  return CONCEPT_TYPES.map((t) => ({
    label: t,
    kind: "typeParameter" as const,
    detail: `FHIR resource type — \`type is ${t}.\``,
  }));
}

/** Completion for a `- value type is <X>.` line. */
export function computeValuetypeCompletion(linePrefix: string): LsCompletionItem[] {
  if (!isValuetypeCompletionPrefix(linePrefix)) return [];
  return CONCEPT_VALUETYPES.map((vt) => ({
    label: vt,
    kind: "typeParameter" as const,
    detail: `FHIR value type — \`value type is ${vt}.\``,
  }));
}

/** Completion for a `- param type is <X>.` line. */
export function computeParamTypeCompletion(linePrefix: string): LsCompletionItem[] {
  if (!isParamTypeCompletionPrefix(linePrefix)) return [];
  return PARAMETER_TYPES.map((t) => ({
    label: t,
    kind: "typeParameter" as const,
    detail: `CRL parameter type — \`param type is ${t}.\``,
  }));
}

/**
 * Completion for quoted concept/terminology/decision/activity/parameter references.
 * Filters by the expected kind at the cursor and by the qualifier when editing the second
 * segment of a qualified ref. Pulls from the ProjectIndex (multi-file) or the file-local
 * scan (orphan). Returns [] (not undefined) on every guard miss.
 */
export function computeConceptRefCompletion(
  source: string,
  filePath: string,
  lineText: string,
  position: LsPosition,
  index: ProjectIndex,
): LsCompletionItem[] {
  const prefix = lineText.slice(0, position.character);
  const qualifier = detectQualifiedRefQualifier(prefix);
  if (!isInsideOpenQuote(prefix) && qualifier === null) return [];
  if (/^\s*(concept|terminology|decision|activity|parameter)\s+"[^"]*$/.test(prefix)) return [];
  if (isUnquotedTypeSlotPrefix(prefix)) return [];

  const expectedKind = detectExpectedKind(prefix);
  const decls = getRefDeclarations(source, filePath, index);
  const filtered = decls
    .filter((d) => matchesKind(d, expectedKind))
    .filter((d) => matchesQualifier(d, qualifier));
  return applyNarrativePrecedence(filtered).map(buildRefItem);
}

interface RefSuggestion {
  name: string;
  kind: "concept" | "terminology" | "decision" | "activity" | "parameter";
  libraryName: string | undefined;
  origin: string | undefined;
  type?: string;
  valuetype?: string;
  bodyPreview?: string;
}

function getRefDeclarations(source: string, filePath: string, index: ProjectIndex): RefSuggestion[] {
  const indexed = index.getDeclarations(filePath);
  if (indexed.length > 0) {
    return indexed.map((d) => ({
      name: d.name,
      kind: d.kind,
      libraryName: d.libraryName,
      origin: d.origin,
      type: d.type,
      valuetype: d.valuetype,
      bodyPreview: d.bodyPreview,
    }));
  }
  const local: Declaration[] = scanDeclarations(source);
  return local.map((d) => ({
    name: d.name,
    kind: d.kind,
    libraryName: undefined,
    origin: undefined,
    type: d.type,
    valuetype: d.valuetype,
    bodyPreview: d.bodyPreview,
  }));
}

function matchesKind(d: RefSuggestion, expected: ExpectedRefKind): boolean {
  if (expected === "any") return true;
  if (expected === "narrative") return d.kind === "concept" || d.kind === "parameter";
  return d.kind === expected;
}

function matchesQualifier(d: RefSuggestion, qualifier: string | null): boolean {
  if (qualifier === null) return true;
  return d.libraryName === qualifier;
}

function buildRefItem(d: RefSuggestion): LsCompletionItem {
  let documentation = `**${d.name}** — ${d.kind}\n\n`;
  if (d.libraryName) documentation += `Library: \`${d.libraryName}\`\n\n`;
  if (d.type) documentation += `Type: \`${d.type}\`\n\n`;
  if (d.valuetype) documentation += `Value type: \`${d.valuetype}\`\n\n`;
  if (d.bodyPreview) documentation += `Body: \`${d.bodyPreview}\``;
  return {
    label: d.name,
    kind: completionKindFor(d.kind),
    detail: formatDeclarationDetail(d),
    documentation,
  };
}

function completionKindFor(kind: RefSuggestion["kind"]): LsCompletionKind {
  switch (kind) {
    case "concept":
      return "variable";
    case "terminology":
      return "reference";
    case "decision":
      return "method";
    case "activity":
      return "class";
    case "parameter":
      return "property";
  }
}

function formatDeclarationDetail(d: RefSuggestion): string {
  if (d.kind === "terminology") return d.libraryName ? `terminology — ${d.libraryName}` : "terminology";
  if (d.kind === "decision") return d.libraryName ? `decision — ${d.libraryName}` : "decision";
  if (d.kind === "activity") return d.libraryName ? `activity — ${d.libraryName}` : "activity";
  if (d.kind === "parameter") {
    const parts: string[] = ["parameter"];
    if (d.type) parts.push(d.type);
    if (d.libraryName) parts.push(`— ${d.libraryName}`);
    return parts.join(" ");
  }
  const parts: string[] = ["concept"];
  if (d.type) parts.push(d.type);
  if (d.valuetype) parts.push(`+ ${d.valuetype}`);
  if (d.libraryName) parts.push(`— ${d.libraryName}`);
  return parts.join(" ");
}
