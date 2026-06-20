// Headless CEL completion (roadmap item #4). Pure + lean: takes the line prefix, a parsed-document
// context (file-local facts + the covered library — extracted by the caller via buildCEL, so the heavy
// CEL parser stays OUT of this subpath), and the CRL ProjectIndex (cached cross-language symbols). The
// extension's CelCompletionProvider adapter converts the LsCompletionItem[] to vscode types.
//
// Slot → source (design-reviewed, 2 rounds):
//  - library            → CRL library names (project)
//  - fact               → file-local facts (the .cel buffer)
//  - fhir-type          → FHIR conceptTypes (bare `defined by`)
//  - concept-or-activity→ the qualified library's concepts + activities
//  - leaf               → the covered library's decisions + concepts (buildLeafCandidates parity)
//  - result-arm         → the leaf decision's arms (a QUOTED value: `is "Approve"`)
//  - result-bool        → bare true/false (an UNQUOTED value: `is true` — a concept's boolean result)
import type { CEL, CELFact } from "../cel/ast/types";
import type { LsCompletionItem, LsCompletionKind } from "./contracts";
import type { ProjectIndex } from "./projectIndex";
import { detectCelSlot } from "./celContextDetect";

/** Parsed-document context the completion needs — extracted by the caller from `buildCEL(text)`. */
export interface CelDocContext {
  /** Names of `fact "X"` declared in the file. */
  facts: string[];
  /** The `covers "Lib"` target library name, if present. */
  coveredLib?: string;
}

/** Pure projection of a parsed CEL AST → the completion context (no buildCEL here — keeps the parser out). */
export function celDocContext(cel: CEL): CelDocContext {
  const facts = cel.statements.filter((s): s is CELFact => s.type === "CELFact").map((f) => f.name);
  return cel.covers?.name ? { facts, coveredLib: cel.covers.name } : { facts };
}

const FACT_DECL_RE = /^\s*fact\s+"([^"]+)"\s*:/gm;
const COVERS_RE = /^\s*covers\s+"([^"]+)"/m;

/** Drop block comments + backtick strings so the line-anchored regexes can't false-match a `covers`/`fact`
 *  written inside a comment or a multiline `description is` backtick (# / // line comments are already safe —
 *  they don't start with whitespace+keyword). */
function stripCommentsAndStrings(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/`[^`]*`/g, "");
}

/** TOLERANT context extraction straight from source text via regex — used by the editor adapter, where
 *  the buffer is typically MID-EDIT with an unterminated quote (the trigger char just typed), so
 *  `buildCEL` would fail and drop facts/covers exactly when completion fires. Regex over `fact "X":` +
 *  the first `covers "X"` (comment/backtick-stripped) survives the parse error. */
export function celDocContextFromSource(source: string): CelDocContext {
  const cleaned = stripCommentsAndStrings(source);
  const facts = [...cleaned.matchAll(FACT_DECL_RE)].map((m) => m[1]);
  const covers = COVERS_RE.exec(cleaned)?.[1];
  return covers ? { facts, coveredLib: covers } : { facts };
}

export function computeCelCompletion(
  linePrefix: string,
  doc: CelDocContext,
  index: ProjectIndex,
  workspaceFolders: readonly string[],
  conceptTypes: readonly string[],
): LsCompletionItem[] {
  const slot = detectCelSlot(linePrefix);
  if (!slot) return [];

  // Cross-language CRL symbols come from the CACHED index (not resolveCelImports per keystroke).
  const projectDecls = () => index.getAllProjectDeclarations(workspaceFolders);

  switch (slot.kind) {
    case "fact":
      return uniqueSorted(doc.facts).map((n) => item(n, "variable", "fact"));

    case "fhir-type":
      return conceptTypes.map((t) => item(t, "typeParameter", `FHIR resource type — \`defined by "${t}".\``));

    case "library": {
      // Library ENTRIES (not declarations) so a library with zero declarations is still offered.
      const libs = index.getAllProjectLibraries(workspaceFolders).map((l) => l.libraryName);
      return uniqueSorted(libs).map((n) => item(n, "reference", "CRL library"));
    }

    case "concept-or-activity": {
      const names = projectDecls()
        .filter((d) => d.libraryName === slot.library && (d.kind === "concept" || d.kind === "activity"))
        .map((d) => d.name);
      return uniqueSorted(names).map((n) => item(n, "variable", `${slot.library} concept/activity`));
    }

    case "leaf": {
      if (!doc.coveredLib) return [];
      const names = projectDecls()
        .filter((d) => d.libraryName === doc.coveredLib && (d.kind === "decision" || d.kind === "concept"))
        .map((d) => d.name);
      return uniqueSorted(names).map((n) => item(n, "variable", `${doc.coveredLib} decision/concept`));
    }

    case "result-arm": {
      // A QUOTED result value is a decision branch → the leaf's arms (only meaningful if leaf is a decision).
      if (!doc.coveredLib) return [];
      const matches = projectDecls().filter((d) => d.libraryName === doc.coveredLib && d.name === slot.leaf);
      if (matches.length === 0) return [];
      // Resolve the leaf the way the resolver does — local/root WINS over package — THEN check the winner's
      // kind, so a package decision can't shadow a same-named local concept (which would make a quoted value
      // invalid → []). Full filePath-based disambiguation of same-named local+package libs is deferred (rare).
      const bestRank = Math.min(...matches.map((d) => originRank(d.origin)));
      const decision = matches.find((d) => originRank(d.origin) === bestRank && d.kind === "decision");
      return decision ? (decision.arms ?? []).map((a) => item(a, "property", `arm of "${slot.leaf}"`)) : [];
    }

    case "result-bool":
      // A BARE result value is a concept's boolean — inserted unquoted (the cursor is not in a quote).
      return ["true", "false"].map((b) => item(b, "property", "boolean result"));
  }
}

function item(label: string, kind: LsCompletionKind, detail: string): LsCompletionItem {
  return { label, kind, detail };
}

function uniqueSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

/** local/root before package — mirrors the CEL resolver's covers precedence (resolver.ts). */
export function originRank(origin: string | undefined): number {
  return origin === "package" ? 1 : 0;
}
