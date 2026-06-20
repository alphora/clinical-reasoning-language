// Headless CEL hover (#4 slice 2). Resolves the quoted token under the cursor to a tooltip, reusing the
// slice-1 foundation: `quotedSpanAt` (the token), `detectCelSlot` (its role, from the prefix up to the
// token's open quote), and the cached CRL ProjectIndex / file-local fact context for resolution.
//  - fact ref (subject/encounter/fact is)      → the file-local fact + its `defined by`
//  - defined by "Lib"."x" (qualified)          → that library's concept/activity declaration
//  - result leaf                                → the covered library's decision/concept declaration
//  - result arm (quoted value)                  → the targeted activity/decision (else "arm of <leaf>")
//  - bare `defined by` type / `covers` library  → a one-line label
import type { CEL, CELDefinedByField, CELFact } from "../cel/ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { LsHover, LsPosition, ZeroBasedRange } from "./contracts";
import type { IndexedDeclaration, ProjectIndex } from "./projectIndex";
import { detectCelSlot } from "./celContextDetect";
import { originRank } from "./celCompletion";
import { quotedSpanAt } from "./hover";

export interface CelHoverContext {
  coveredLib?: string;
  /** File-local facts with their `defined by` concept name (for the fact tooltip). */
  facts: ReadonlyArray<{ name: string; conceptRef?: string }>;
}

/** Pure projection of a parsed CEL AST → the hover context (no buildCEL here). */
export function celHoverContext(cel: CEL): CelHoverContext {
  const facts = cel.statements
    .filter((s): s is CELFact => s.type === "CELFact")
    .map((f) => {
      const db = f.body.find((b): b is CELDefinedByField => b.type === "CELDefinedByField");
      if (!db) return { name: f.name };
      const lib = getRefLibrary(db.ref); // keep the qualifier so the tooltip matches the qualified ref
      return { name: f.name, conceptRef: lib ? `${lib}.${getRefName(db.ref)}` : getRefName(db.ref) };
    });
  return cel.covers?.name ? { coveredLib: cel.covers.name, facts } : { facts };
}

export function computeCelHover(
  lineText: string,
  position: LsPosition,
  ctx: CelHoverContext,
  index: ProjectIndex,
  workspaceFolders: readonly string[],
): LsHover | null {
  const span = quotedSpanAt(lineText, position.character);
  if (!span) return null;
  const slot = detectCelSlot(lineText.slice(0, span.start + 1));
  if (!slot) return null;
  const token = span.text;
  const range: ZeroBasedRange = { startLine: position.line, startCol: span.start, endLine: position.line, endCol: span.end };
  const decls = () => index.getAllProjectDeclarations(workspaceFolders);
  const declHover = (d: IndexedDeclaration | undefined): LsHover | null => (d ? { markdown: formatDecl(d), range } : null);

  switch (slot.kind) {
    case "fact": {
      const f = ctx.facts.find((x) => x.name === token);
      if (!f) return null;
      return { markdown: `**${token}** — fact` + (f.conceptRef ? `\n\nDefined by \`${f.conceptRef}\`.` : ""), range };
    }
    case "fhir-type":
      // A bare `defined by "X"` is a FHIR type — UNLESS X is the QUALIFIER of a qualified ref
      // (`defined by "X"."…"`), where X is a library (the cursor is on the first of two quoted tokens).
      return /^\s*\.\s*"/.test(lineText.slice(span.end)) // a qualifier dot is followed by a quote (not the statement-terminating `.`)
        ? { markdown: `**${token}** — CRL library`, range }
        : { markdown: `**${token}** — FHIR resource type`, range };
    case "library":
      return { markdown: `**${token}** — CRL library`, range };
    case "concept-or-activity":
      return declHover(pick(decls(), slot.library, token, ["concept", "activity"]));
    case "leaf":
      return ctx.coveredLib ? declHover(pick(decls(), ctx.coveredLib, token, ["decision", "concept"])) : null;
    case "result-arm": {
      if (!ctx.coveredLib) return null;
      const d = pick(decls(), ctx.coveredLib, token, ["activity", "decision"]);
      return d ? declHover(d) : { markdown: `**${token}** — arm of "${slot.leaf}"`, range };
    }
    case "result-bool":
      return null;
  }
}

/** First matching declaration of an allowed kind, local/root preferred over package (resolver precedence).
 *  v1 limitation (documented, deferred — rare): for a same-name CROSS-KIND collision (e.g. an `activity "X"`
 *  declared before a `decision "X"` in one library) this resolves to the allowed-kind decl, whereas the CEL
 *  validator's buildLeafCandidates is first-write-wins across ALL kinds and would reject the activity. */
function pick(
  all: IndexedDeclaration[],
  libraryName: string,
  name: string,
  kinds: IndexedDeclaration["kind"][],
): IndexedDeclaration | undefined {
  const matches = all.filter((d) => d.libraryName === libraryName && d.name === name && kinds.includes(d.kind));
  if (matches.length === 0) return undefined;
  const best = Math.min(...matches.map((d) => originRank(d.origin)));
  return matches.find((d) => originRank(d.origin) === best);
}

function formatDecl(d: IndexedDeclaration): string {
  let md = `**${d.name}** — ${d.kind}\n\nLibrary: \`${d.libraryName}\``;
  if (d.type) md += `\n\nType: \`${d.type}\``;
  md += `\n\nDeclared at \`${d.filePath}\`:${d.line + 1}.`;
  return md;
}
