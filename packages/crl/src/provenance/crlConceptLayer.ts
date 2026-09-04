/**
 * Headless CONCEPT layer (#166 Slice 1) — a sibling of `buildCrlStructure` (decision tree). Inventories ALL concept
 * declarations across the covered policy + every registry library as addressable nodes, each carrying a `nodeKey`
 * byte-identical to the indexer's + the decision-row `refKeys` (via the shared `conceptDeclRef`), so a correspondence
 * unit citing concept X joins X's node exactly like it joins a decision row today. Pure + headless; reveal maps (Slice 2)
 * + rendering (Slice 3) build on this.
 *
 * `buildCrlConceptLayer` carries RAW structural signals only (definitionKind / hasLocalCode / hasRepresentations); the
 * ADR-0001 layer classification (asserted/inferred + the orthogonal origin/code-domain markers) lives in the pure
 * `classifyConcept` below (added Slice 3a — kept headless + reusable rather than in the renderer). `definitionRefs` are
 * DIRECT edges only (defined-as operands + definition-is narrative refs); the transitive closure + cycle guard belong to
 * the consumer (Slice 2).
 */
import type { Concept, ConceptValueType, Terminology, TerminologyCode } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import type { ConceptType } from "../grammar/conceptTypes";
import type { LsLocation } from "../language-services/contracts";

import { collectLibs, conceptDeclRef, definitionConceptRefs, lsLoc, nodeKey } from "./indexer";
import type { LibInfo } from "./indexer";

export type ConceptDefinitionKind = "defined-as" | "definition-is" | "coded-from";

export interface CrlConceptNode {
  nodeKey: string; // === indexer concept key === decision-row concept refKey (the cross-pane join)
  name: string;
  lib: string;
  label: string;
  location: LsLocation; // location-less concepts are skipped (mirrors the indexer, for nodeKey parity)
  conceptType?: ConceptType;
  /** The concept's authored value type(s) (`- value type is X.`), 0..* (`[]` when none) — a raw signal the
   *  questionnaire panel (#177) uses to render answer options (e.g. boolean → Yes/No). */
  valueTypes: ConceptValueType[];
  /**
   * ⭐⭐ THE CODED ANSWERS A CLINICIAN IS OFFERED (`- value from:`, #189) — a raw signal, exactly like
   * `valueTypes`, for a renderer that wants to SHOW them rather than infer Yes/No.
   *
   * ⚠ WITHOUT THIS THE TREE CANNOT DRAW THE FEATURE. A coded question renders as one flat leaf, so a
   * medical reviewer opening the tree sees a single box where the policy offers seven clinical
   * alternatives — and the whole point of `#189` (nineteen boolean leaves collapsed into four coded
   * questions) is invisible in the surface a reviewer actually reads.
   *
   * Carries INLINE options AND the codes of an INSTANTIATED terminology — see `answerFields` for why
   * those are one case and not two. A concept whose `value from` names a pure REFERENCE terminology
   * gets `answersFromTerminology` instead; one whose reference does not resolve gets neither.
   */
  answerOptions?: { code: string; display: string }[];
  /**
   * The terminology NAME whose members are this concept's answers, when we cannot know them — a pure
   * `valueset is <url>` reference, resolved at deployment.
   *
   * ⚠ NEVER SET ALONGSIDE `answerOptions`, and never a list. It exists so a renderer can say "answers
   * come from <name>" WITHOUT offering a disclosure, because there is nothing behind one. A concept
   * that is a question but cannot show its answers is otherwise indistinguishable from a concept that
   * is not a question at all, which is the state this replaces.
   */
  answersFromTerminology?: string;
  /** The concept's definition shape, when present — a raw signal for the renderer's later layer classification. */
  definitionKind?: ConceptDefinitionKind;
  hasLocalCode: boolean; // has a local `- code is …` (locally assertable)
  hasRepresentations: boolean; // has ≥1 `possible representation:` entry
  /** Has ≥1 `source representation` carrying a `value projection is …` — the datum is PROJECTED to the
   *  concept's value (a computation), so the concept is INFERRED even with no top-level `definition`
   *  (#257: the patient-age posrep recency form). */
  hasValueProjection: boolean;
  /** The concept nodeKeys this concept is DIRECTLY defined in terms of (deduped, source order). Direct edges only. */
  definitionRefs: string[];
}

// Exhaustive over the ConceptDefinition union → adding a definition kind is a compile error here, not a silent miss.
const DEF_KIND: Record<NonNullable<Concept["definition"]>["type"], ConceptDefinitionKind> = {
  DefinedAsDefinition: "defined-as",
  DefinitionIsDefinition: "definition-is",
  CodedFromDefinition: "coded-from",
  // #189: a reduction is the `definition is` surface (a record→scalar calculation) → inferred,
  // classified like `definition-is` for the renderer's raw signal.
  ReductionDefinition: "definition-is",
};

/** The ADR-0001 LAYER (syntactic): `inferred` = `defined as`/`definition is` (calculated); `asserted` = everything else
 *  (`coded from` + a local `code is` leaf — both retrieves). */
export type ConceptLayer = "asserted" | "inferred";

/** A concept's ADR-0001 classification. `layer` is the syntactic axis; the rest are the ORTHOGONAL origin/code-domain
 *  axes (a concept may carry several at once — they are NOT collapsed into the layer). */
export interface ConceptClassification {
  layer: ConceptLayer;
  /** has a local `- code is …` → locally assertable (the local code-domain slot). */
  locallyAssertable: boolean;
  /** `coded from` a named terminology/value set → standardized code domain. */
  standardized: boolean;
  /** has ≥1 `source representation:` → an external source shape of the same concept. */
  external: boolean;
}

export function classifyConcept(c: CrlConceptNode): ConceptClassification {
  return {
    // A `value projection` computes the concept's value from a representation's datum → inferred,
    // even with no top-level `definition` (#257: the patient-age posrep recency form; a projection-
    // less external `source representation` stays asserted — its datum IS the value).
    layer:
      c.definitionKind === "defined-as" ||
      c.definitionKind === "definition-is" ||
      c.hasValueProjection
        ? "inferred"
        : "asserted",
    locallyAssertable: c.hasLocalCode,
    standardized: c.definitionKind === "coded-from",
    external: c.hasRepresentations,
  };
}

/**
 * ⭐⭐ THE ANSWERS A CONCEPT OFFERS — and there are THREE cases, not two.
 *
 * `value from` has two syntactic forms but three OUTCOMES, and conflating the last two is the bug this
 * exists to stop (an earlier comment here claimed a terminology "is not resolved" — true of a pure
 * reference, FALSE of an instantiated one, which is the form a policy is most likely to use):
 *
 *   1. INLINE `value from:` .................. options with displays, authored on the concept.
 *   2. `value from "X"`, X INSTANTIATED ...... `system is` + `code is` lines — WE KNOW THE CODES. They
 *      are in the same closure this function already walks, indexed by name (`STATEMENT_KIND` maps
 *      `Terminology`), so there is nothing external about them.
 *   3. `value from "X"`, X a pure REFERENCE ... `valueset is <url>` — membership resolves at DEPLOYMENT.
 *      We genuinely do not know it, and the one code we hold is the synthetic `reference-vs-stub`
 *      placeholder, which is NOT an answer. Surfacing that as one would show a reviewer a fake option
 *      with the same affordance as a real one.
 *
 * So (1) and (2) yield `answerOptions`; (3) yields `answersFromTerminology` — a NAME to point at, never
 * a list to expand. A renderer must not offer a disclosure for (3): a chevron promises content.
 *
 * ⚠ CASE 2 HAS NO DISPLAY TEXT. `terminologyCode` is `- code is \`15822\`.` and nothing else — there is
 * no display slot, while inline options REQUIRE one (#313). The code is used as its own display until
 * that closes; a bare code is honest and thin, and inventing text for it would not be.
 */
function answerFields(
  c: Concept,
  lib: string,
  libs: Map<string, LibInfo>,
): { answerOptions?: { code: string; display: string }[]; answersFromTerminology?: string } {
  const vf = c.valueFrom;
  if (!vf) return {};
  if (vf.kind === "inline") {
    return { answerOptions: vf.options.map((o) => ({ code: o.code, display: o.display })) };
  }
  const targetLib = getRefLibrary(vf.terminologyName) ?? lib;
  const name = getRefName(vf.terminologyName);
  const decl = libs
    .get(targetLib)
    ?.decls.get(name)
    ?.find((e) => e.kind === "terminology");
  // Unresolved (a typo, or a library outside the closure) → neither field. The concept renders as it
  // always did rather than asserting an answer set we cannot stand behind.
  if (!decl) return {};
  const body = (decl.node as Terminology).body;
  const codes = body.filter((l): l is TerminologyCode => l.type === "TerminologyCode");
  if (codes.length > 0) return { answerOptions: codes.map((l) => ({ code: l.code, display: l.code })) };
  return { answersFromTerminology: name };
}

export function buildCrlConceptLayer(
  graph: ResolvedCelGraph,
  opts?: { sharedLibraries?: string[] },
): CrlConceptNode[] {
  const { libs, coversName } = collectLibs(graph, opts);
  if (!coversName) return []; // no policy anchor → empty (mirrors buildCrlStructure)

  const out: CrlConceptNode[] = [];
  for (const [lib, info] of libs) {
    // AST source order + filter to concepts (NOT the by-name decls map — avoids cross-kind same-name perturbation).
    for (const s of info.entry.ast.statements) {
      if (s.type !== "Concept") continue;
      const c = s as Concept;
      const location = lsLoc(info.entry.filePath, c.location);
      if (!location) continue; // mirror the indexer's location-less skip (nodeKey parity)

      // Direct concept-graph edges. A `definition is` narrative ref may name a CONCEPT or a PARAMETER (the indexer's
      // definition-narrative slot accepts both); only CONCEPT-resolving refs are concept-graph edges, so resolve each
      // against the closure's decls and keep concepts only (a parameter / unresolved ref is not an edge). Deduped by the
      // RESOLVED concept nodeKey (so a bare `"A"` and a qualified `"L"."A"` to the same concept collapse), source order.
      const seen = new Set<string>();
      const definitionRefs: string[] = [];
      for (const ref of definitionConceptRefs(c)) {
        const targetLib = getRefLibrary(ref) ?? lib;
        const name = getRefName(ref);
        if (
          !libs
            .get(targetLib)
            ?.decls.get(name)
            ?.some((e) => e.kind === "concept")
        )
          continue;
        const key = nodeKey(conceptDeclRef(targetLib, name));
        if (!seen.has(key)) {
          seen.add(key);
          definitionRefs.push(key);
        }
      }

      out.push({
        nodeKey: nodeKey(conceptDeclRef(lib, c.name)),
        name: c.name,
        lib,
        label: `concept "${c.name}"`,
        location,
        ...(c.conceptType ? { conceptType: c.conceptType } : {}),
        valueTypes: c.valueTypes ?? [],
        ...answerFields(c, lib, libs),
        ...(c.definition ? { definitionKind: DEF_KIND[c.definition.type] } : {}),
        hasLocalCode: c.code !== undefined,
        hasRepresentations: c.representations.length > 0,
        hasValueProjection: c.representations.some((r) => r.valueProjection !== undefined),
        definitionRefs,
      });
    }
  }
  return out;
}

/**
 * ⭐⭐ THE ANSWERS A RENDERED NODE SHOULD SHOW, keyed by concept nodeKey — including the one-hop case.
 *
 * ⚠ THE CONCEPT THAT OWNS THE OPTIONS IS USUALLY NOT THE ONE ON SCREEN. The `#189` shape is a pair: a
 * coded question holding `value from:` (`"Documented Patient Complaint"`, 8 options) and a BOOLEAN over
 * it (`"Qualifying Patient Complaint Reported"`, `definition is "Documented Patient Complaint" in
 * qualifying`) — and it is the boolean that appears in a decision tree, because that is what a `when`
 * guards on. MEASURED on a real policy: 4 coded questions owning 26 options, and every one of them
 * reached only through its wrapper. A map built from `answerOptions` alone renders nothing at all.
 *
 * So a concept with no options of its own inherits them from a definition ref that has them.
 *
 * ⚠⚠ ONLY THROUGH A TRANSPARENT WRAPPER (`definition is …`), NEVER THROUGH A COMPOSITION. `definitionRefs`
 * carries boolean-composition operands too, so an unrestricted hop makes a composition inherit an
 * operand's answers. MEASURED before this guard:
 *
 *     Eligible defined as ("Adult" sem-and "Documented Complaint")
 *       → Eligible offered the complaint's 8 answers      ← a question the author never asked
 *
 * "Exactly one option-bearing ref" resolves MULTIPLICITY, not semantic OWNERSHIP: a composition with one
 * coded operand passes that test and is still lying to a clinician. `definition is` is a reduction over a
 * single question — the wrapper HAS no body of its own — so the answers it shows are that question's.
 * A `defined as` wrapper is excluded for a second reason as well: it renders its operand as a child leaf,
 * which would show the identical option list twice, one indent apart.
 *
 * ⚠ AND STILL ONLY WHEN UNAMBIGUOUS. If several refs carry options there is no single answer set to show,
 * and picking one would invent a question the author never wrote — those get nothing, and the renderer
 * shows the node as it always did.
 */
export function answerOptionsForDisplay(
  nodes: readonly CrlConceptNode[],
): Map<string, { code: string; display: string }[]> {
  return oneHop(nodes, (n) => (n.answerOptions?.length ? n.answerOptions : undefined));
}

/**
 * The same one-hop rule for a PURE-REFERENCE question's terminology name — a pointer to render, never a
 * list to expand (`CrlConceptNode.answersFromTerminology`).
 *
 * ⚠ It must travel the identical path, or the two disagree about which node is the question: a wrapper
 * would show answers for an instantiated terminology and nothing at all for a referenced one, which
 * reads as "this concept has no answers" rather than "its answers live elsewhere". Sharing `oneHop` is
 * what makes that agreement structural instead of a pair of rules someone has to keep aligned.
 */
export function answersFromTerminologyForDisplay(
  nodes: readonly CrlConceptNode[],
): Map<string, string> {
  return oneHop(nodes, (n) => n.answersFromTerminology);
}

/**
 * ⭐ THE HOP ITSELF, once. `pick` says what a node carries; everything else is the rule in the header
 * above — own value wins, else exactly one TRANSPARENT (`definition is`) ref that carries one.
 */
function oneHop<T>(
  nodes: readonly CrlConceptNode[],
  pick: (n: CrlConceptNode) => T | undefined,
): Map<string, T> {
  const byKey = new Map(nodes.map((n) => [n.nodeKey, n]));
  const out = new Map<string, T>();
  for (const n of nodes) {
    const own = pick(n);
    if (own !== undefined) {
      out.set(n.nodeKey, own);
      continue;
    }
    // The wrapper must be TRANSPARENT — see the header. A composition (`defined as`) never forwards, no
    // matter how few of its operands carry a value.
    if (n.definitionKind !== "definition-is") continue;
    const bearing = n.definitionRefs
      .map((r) => byKey.get(r))
      .map((r) => (r ? pick(r) : undefined))
      .filter((v): v is T => v !== undefined);
    if (bearing.length === 1) out.set(n.nodeKey, bearing[0]);
  }
  return out;
}
