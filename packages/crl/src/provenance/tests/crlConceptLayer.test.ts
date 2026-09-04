// Tests for buildCrlConceptLayer (#166 Slice 1) — the headless concept inventory. Verifies the cross-pane JOIN
// invariant (concept node key === decision-row concept refKey === indexer node key), definitionRefs edges (defined-as
// inference incl. dedup + cross-lib qualified, definition-is narrative, coded-from → none), the raw layer signals,
// and that an UNREACHED registry concept is still inventoried (denominator — catches reachability misuse).
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { answerOptionsForDisplay, buildCrlConceptLayer, classifyConcept, type CrlConceptNode } from "../crlConceptLayer";
import { buildCrlStructure } from "../crlStructure";
import { buildProvenanceIndex, conceptDeclRef, nodeKey } from "../indexer";

const T = `# T
library "T".
concept "A":
- type is Condition.
- value type is boolean.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
concept "Comp":
- defined as ( "A" sem-and "B" sem-and "A" ).
concept "QualRef":
- defined as ( "A" sem-and "U"."Q" ).
concept "Narr":
- type is Encounter.
- definition is "A" performed.
concept "Sourced":
- coded from "Some Vs".
concept "Repr":
- source representation: - type is ImagingStudy. - coded from "Mammogram VS".
concept "Orphan":
- type is Condition.
- code is \`o\`.
parameter "P":
- param type is Period.
concept "NarrP":
- type is Encounter.
- definition is "P" performed.
activity "X":
- request CPGCommunicationRequest.
- with \`x\`.
decision "D":
first:
- when "Comp" then recommend activity "X".
- otherwise then recommend activity "X".`;

// A second LOCAL library the covered policy never reaches — its concept Q must STILL be inventoried (not reachability).
const U = `# U
library "U".
concept "Q":
- type is Condition.
- code is \`q\`.
activity "W":
- request CPGCommunicationRequest.
- with \`w\`.
decision "Unused":
first:
- when "Q" then recommend activity "W".`;

const CEL = `# TC
library "TC".
covers "T".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "X".`;

function entry(src: string, filePath: string, origin: "root" | "local"): RegistryEntry {
  return {
    name: parseInput(src).library.name,
    filePath,
    ast: parseInput(src),
    isRoot: origin === "root",
    origin,
  };
}
function graphFrom(
  crlSrc: string,
  celSrc: string,
  extraLocal: RegistryEntry[] = [],
): ResolvedCelGraph {
  const built = buildCEL(celSrc);
  if (!built.success || !built.result)
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const byNameLocal = new Map<string, RegistryEntry>();
  for (const e of extraLocal) byNameLocal.set(e.name, e);
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget: entry(crlSrc, "inline.crl", "root"),
    crlRegistry: { byNameLocal, byNamePackage: new Map() },
    celParseErrors: [],
    diagnostics: [],
  } as ResolvedCelGraph;
}

const ck = (lib: string, name: string): string => nodeKey(conceptDeclRef(lib, name));

describe("buildCrlConceptLayer — headless concept layer (#166 Slice 1)", () => {
  const graph = graphFrom(T, CEL, [entry(U, "u.crl", "local")]);
  const concepts = buildCrlConceptLayer(graph);
  const byName = new Map<string, CrlConceptNode>(concepts.map((c) => [`${c.lib}.${c.name}`, c]));

  it("inventories ALL concepts across the policy + registry libs (NOT reachability; parameters excluded)", () => {
    expect([...byName.keys()].sort()).toEqual(
      [
        "T.A",
        "T.B",
        "T.Comp",
        "T.Narr",
        "T.NarrP",
        "T.Orphan",
        "T.QualRef",
        "T.Repr",
        "T.Sourced",
        "U.Q",
      ].sort(),
    );
    expect(byName.get("T.Orphan")).toBeTruthy(); // referenced by NO decision anywhere → still inventoried
    expect(byName.get("U.Q")).toBeTruthy(); // in a registry lib the policy never reaches into → still inventoried
    expect(byName.has("T.P")).toBe(false); // a parameter is not a concept
  });

  it("JOIN invariant: concept node key === conceptDeclRef === indexer node key === the `when` row's refKey", () => {
    const compKey = ck("T", "Comp");
    expect(byName.get("T.Comp")!.nodeKey).toBe(compKey);
    // the `when "Comp"` row in the decision structure references exactly this key
    const struct = buildCrlStructure(graph);
    const whenComp = struct.flatMap((d) => d.children).find((n) => n.kind === "when");
    expect(whenComp!.refKeys).toContain(compKey);
    // and the indexer inventoried a node under the same key
    const index = buildProvenanceIndex(graph);
    expect(index.nodes.has(compKey)).toBe(true);
  });

  it("definitionRefs: defined-as inference operands, DEDUPED in source order", () => {
    expect(byName.get("T.Comp")!.definitionRefs).toEqual([ck("T", "A"), ck("T", "B")]); // "A" twice → once
  });

  it("definitionRefs: a QUALIFIED cross-lib operand uses the TARGET library's key", () => {
    expect(byName.get("T.QualRef")!.definitionRefs).toEqual([ck("T", "A"), ck("U", "Q")]);
  });

  it("definitionRefs: definition-is narrative concept refs are collected", () => {
    expect(byName.get("T.Narr")!.definitionRefs).toEqual([ck("T", "A")]);
  });

  it("definitionRefs: coded-from + representations-only + asserted leaves have NO edges", () => {
    expect(byName.get("T.Sourced")!.definitionRefs).toEqual([]);
    expect(byName.get("T.Repr")!.definitionRefs).toEqual([]);
    expect(byName.get("T.A")!.definitionRefs).toEqual([]);
  });

  it("definitionRefs: a definition-is ref that resolves to a PARAMETER is NOT a concept edge", () => {
    expect(byName.get("T.NarrP")!.definitionKind).toBe("definition-is");
    expect(byName.get("T.NarrP")!.definitionRefs).toEqual([]); // "P" is a parameter → filtered out
  });

  it("no policy anchor (no covers) → empty", () => {
    const noCovers = { ...graphFrom(T, CEL), coversTarget: undefined } as ResolvedCelGraph;
    expect(buildCrlConceptLayer(noCovers)).toEqual([]);
  });

  it("raw signals: definitionKind / hasLocalCode / hasRepresentations / conceptType", () => {
    const a = byName.get("T.A")!;
    expect([a.definitionKind, a.hasLocalCode, a.hasRepresentations, a.conceptType]).toEqual([
      undefined,
      true,
      false,
      "Condition",
    ]);
    expect(byName.get("T.Comp")!.definitionKind).toBe("defined-as");
    expect(byName.get("T.Narr")!.definitionKind).toBe("definition-is");
    expect(byName.get("T.Narr")!.conceptType).toBe("Encounter");
    expect(byName.get("T.Sourced")!.definitionKind).toBe("coded-from");
    const repr = byName.get("T.Repr")!;
    expect([repr.definitionKind, repr.hasRepresentations]).toEqual([undefined, true]);
    expect(byName.get("U.Q")!.hasLocalCode).toBe(true);
  });

  it("valueTypes: an authored `value type is X.` is carried; a concept with none is `[]`", () => {
    expect(byName.get("T.A")!.valueTypes).toContain("boolean"); // `- value type is boolean.`
    expect(byName.get("T.B")!.valueTypes).toEqual([]); // no value type authored → empty
  });
});

describe("classifyConcept — ADR-0001 layer (#166 Slice 3a)", () => {
  const mk = (over: Partial<CrlConceptNode>): CrlConceptNode => ({
    nodeKey: "k",
    name: "C",
    lib: "L",
    label: 'concept "C"',
    location: { filePath: "", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } },
    valueTypes: [],
    hasLocalCode: false,
    hasRepresentations: false,
    definitionRefs: [],
    ...over,
  });

  it("defined-as / definition-is ⇒ inferred (calculated)", () => {
    expect(classifyConcept(mk({ definitionKind: "defined-as" })).layer).toBe("inferred");
    expect(classifyConcept(mk({ definitionKind: "definition-is" })).layer).toBe("inferred");
  });

  it("coded-from ⇒ asserted (a retrieve — NOT a separate 'sourced' layer)", () => {
    expect(classifyConcept(mk({ definitionKind: "coded-from" })).layer).toBe("asserted");
  });

  it("no definition (bare code-is leaf / representations-only) ⇒ asserted", () => {
    expect(classifyConcept(mk({})).layer).toBe("asserted");
    expect(classifyConcept(mk({ hasLocalCode: true })).layer).toBe("asserted");
    expect(classifyConcept(mk({ hasRepresentations: true })).layer).toBe("asserted");
  });

  it("orthogonal axes are independent of the layer (not collapsed/precedence-folded)", () => {
    // an inferred concept can ALSO be locally assertable + have a source representation simultaneously
    const c = classifyConcept(mk({ definitionKind: "defined-as", hasLocalCode: true, hasRepresentations: true }));
    expect(c).toEqual({ layer: "inferred", locallyAssertable: true, standardized: false, external: true });
    const s = classifyConcept(mk({ definitionKind: "coded-from", hasLocalCode: true }));
    expect(s).toEqual({ layer: "asserted", locallyAssertable: true, standardized: true, external: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// `answerOptionsForDisplay` — WHICH node shows a coded question's answers.
//
// ⚠ The rule this pins was shipped with NO test and was WRONG. It forwarded options through any
// `definitionRefs` edge, and that set includes boolean-composition operands — so a composition
// inherited an operand's answers and offered a clinician a question the author never asked.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("answerOptionsForDisplay", () => {
  const OPTS = [
    { code: "a", display: "Answer A" },
    { code: "b", display: "Answer B" },
  ];
  const node = (nodeKey: string, extra: Partial<CrlConceptNode> = {}): CrlConceptNode =>
    ({
      nodeKey, name: nodeKey, lib: "L", label: `concept "${nodeKey}"`, location: {},
      hasLocalCode: false, hasRepresentations: false, definitionRefs: [], ...extra,
    }) as unknown as CrlConceptNode;

  it("an option-OWNING concept keeps its own answers", () => {
    const m = answerOptionsForDisplay([node("Q", { answerOptions: OPTS })]);
    expect(m.get("Q")).toEqual(OPTS);
  });

  // The canonical #189 pair: the boolean wrapper is what a `when` guards on, so it is what renders.
  it("a `definition is` wrapper inherits the question's answers — the shape a tree actually shows", () => {
    const m = answerOptionsForDisplay([
      node("Q", { answerOptions: OPTS }),
      node("W", { definitionKind: "definition-is", definitionRefs: ["Q"] }),
    ]);
    expect(m.get("W")).toEqual(OPTS);
  });

  // ⚠⚠ THE DEFECT. Measured before the fix: `Eligible` was offered the complaint's answers because it
  // was the only option-bearing operand. One coded operand in a composition is not ownership.
  it("a COMPOSITION never inherits an operand's answers, even with exactly one bearing operand", () => {
    const m = answerOptionsForDisplay([
      node("Q", { answerOptions: OPTS }),
      node("Adult"),
      node("Eligible", { definitionKind: "defined-as", definitionRefs: ["Adult", "Q"] }),
    ]);
    expect(m.has("Eligible")).toBe(false);
  });

  it("two option-bearing refs are ambiguous — nothing is shown rather than one picked", () => {
    const m = answerOptionsForDisplay([
      node("Q1", { answerOptions: OPTS }),
      node("Q2", { answerOptions: [{ code: "c", display: "Answer C" }] }),
      node("W", { definitionKind: "definition-is", definitionRefs: ["Q1", "Q2"] }),
    ]);
    expect(m.has("W")).toBe(false);
  });

  it("does not hop twice — a wrapper of a wrapper shows nothing", () => {
    const m = answerOptionsForDisplay([
      node("Q", { answerOptions: OPTS }),
      node("W", { definitionKind: "definition-is", definitionRefs: ["Q"] }),
      node("WW", { definitionKind: "definition-is", definitionRefs: ["W"] }),
    ]);
    expect(m.get("W")).toEqual(OPTS);
    expect(m.has("WW")).toBe(false);
  });

  it("a concept with no options and no refs is absent, not empty", () => {
    expect(answerOptionsForDisplay([node("Plain")]).has("Plain")).toBe(false);
  });
});
