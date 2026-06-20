// Headless CEL navigation (#4 slice 3). Reuses the slice-1/2 foundation (quotedSpanAt + detectCelSlot +
// the cached index). Two services:
//  - DEFINITION: a CEL ref → its declaration. fact ref → the file-local `fact "X":`; concept/activity/leaf/
//    arm → the .crl declaration (nameRange); covers/qualifier → the .crl `library "X".`.
//  - REFERENCES (file-local): a fact (its decl or a use) → every occurrence in the SAME .cel. Cross-file
//    references (a CRL symbol's .cel users) are deferred — the ProjectIndex doesn't index .cel.
import type { CEL, CELFact } from "../cel/ast/types";
import type { LsLocation, LsPosition, ZeroBasedRange } from "./contracts";
import { toZeroBasedRange } from "./contracts";
import type { IndexedDeclaration, ProjectIndex } from "./projectIndex";
import { detectCelSlot } from "./celContextDetect";
import { originRank } from "./celCompletion";
import { quotedSpanAt } from "./hover";

export interface CelNavContext {
  coveredLib?: string;
  /** File-local fact declarations with their statement range (the go-to target). */
  factDecls: ReadonlyArray<{ name: string; range: ZeroBasedRange }>;
}

/** Pure projection of a parsed CEL AST → the navigation context (no buildCEL here). */
export function celNavContext(cel: CEL): CelNavContext {
  const factDecls = cel.statements
    .filter((s): s is CELFact => s.type === "CELFact")
    .map((f) => ({ name: f.name, range: toZeroBasedRange(f.location) }));
  return cel.covers?.name ? { coveredLib: cel.covers.name, factDecls } : { factDecls };
}

export function computeCelDefinition(
  lineText: string,
  position: LsPosition,
  celFilePath: string,
  ctx: CelNavContext,
  index: ProjectIndex,
  workspaceFolders: readonly string[],
): LsLocation | null {
  const span = quotedSpanAt(lineText, position.character);
  if (!span) return null;
  const slot = detectCelSlot(lineText.slice(0, span.start + 1));
  if (!slot) return null;
  const token = span.text;
  const decls = () => index.getAllProjectDeclarations(workspaceFolders);
  const locOf = (d: IndexedDeclaration | undefined): LsLocation | null =>
    d ? { filePath: d.filePath, range: d.nameRange } : null;
  const libLoc = (name: string): LsLocation | null => {
    const lib = index.getAllProjectLibraries(workspaceFolders).find((l) => l.libraryName === name);
    return lib ? { filePath: lib.filePath, range: lib.nameRange } : null;
  };

  switch (slot.kind) {
    case "fact": {
      const f = ctx.factDecls.find((x) => x.name === token);
      return f ? { filePath: celFilePath, range: f.range } : null;
    }
    case "concept-or-activity":
      return locOf(pick(decls(), slot.library, token, ["concept", "activity"]));
    case "leaf":
      return ctx.coveredLib ? locOf(pick(decls(), ctx.coveredLib, token, ["decision", "concept"])) : null;
    case "result-arm":
      return ctx.coveredLib ? locOf(pick(decls(), ctx.coveredLib, token, ["activity", "decision"])) : null;
    case "library":
      return libLoc(token);
    case "fhir-type":
      // The qualifier of a qualified ref (`defined by "X"."…"`) is a library; a true bare type has no def.
      return /^\s*\.\s*"/.test(lineText.slice(span.end)) ? libLoc(token) : null;
    case "result-bool":
      return null;
  }
}

const CR_REL = "based on|part of|during encounter|requested by|performed by|not done because";
const CR_LINE = new RegExp(`^(\\s*-\\s*)"([^"]*)"(\\s+(?:${CR_REL})\\s+)"([^"]*)"`, "i");

/** The FACT-NAME token(s) on a line, with their name-start column. Crucially this is NOT "every quoted token":
 *  a `- fact is "X" at "anchor".` line has a trailing named-anchor quote that is NOT a fact, so fact-is/
 *  subject/encounter lines contribute only their FIRST quote; cross-resource lines contribute BOTH operands;
 *  every other line contributes none. */
function factNamesOnLine(text: string): { col: number; name: string }[] {
  let m = /^(\s*fact\s+)"([^"]*)"/.exec(text);
  if (m) return [{ col: m[1].length + 1, name: m[2] }];
  m = /^(\s*-\s*(?:subject|encounter|fact)\s+is\s+)"([^"]*)"/i.exec(text);
  if (m) return [{ col: m[1].length + 1, name: m[2] }];
  const cr = CR_LINE.exec(text);
  if (cr) {
    return [
      { col: cr[1].length + 1, name: cr[2] },
      { col: cr[1].length + cr[2].length + cr[3].length + 3, name: cr[4] },
    ];
  }
  return [];
}

/** File-local references for the fact under the cursor (its `fact "X":` decl + EVERY use — subject/encounter/
 *  fact-is AND both cross-resource operands), via a source SCAN of fact-name token positions (so a colliding
 *  named-anchor `at "X"` is NOT mis-reported). No index needed (CEL-local). Cross-file references (a CRL
 *  symbol's .cel users) are deferred — the ProjectIndex doesn't index .cel. This deliberately uses a regex
 *  scan rather than the buildCEL-backed path the definition provider uses; it stays tolerant of mid-edit
 *  buffers and needs no AST. Returns [] when the cursor isn't on a fact-name token. */
export function computeCelReferences(
  lineText: string,
  position: LsPosition,
  celSource: string,
  celFilePath: string,
): LsLocation[] {
  const span = quotedSpanAt(lineText, position.character);
  if (!span) return [];
  const here = factNamesOnLine(lineText).find((f) => f.col === span.start + 1);
  if (!here) return []; // the cursor's token isn't a fact name (e.g. an `at "anchor"` or a non-fact slot)
  const name = here.name;
  const out: LsLocation[] = [];
  celSource.split("\n").forEach((text, line) => {
    for (const f of factNamesOnLine(text)) {
      if (f.name === name) {
        out.push({ filePath: celFilePath, range: { startLine: line, startCol: f.col, endLine: line, endCol: f.col + name.length } });
      }
    }
  });
  return out;
}

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
