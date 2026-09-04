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
import type { Concept, ConceptValueType } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import type { ConceptType } from "../grammar/conceptTypes";
import type { LsLocation } from "../language-services/contracts";

import { collectLibs, conceptDeclRef, definitionConceptRefs, lsLoc, nodeKey } from "./indexer";

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
   * INLINE options only. A `kind: "terminology"` `value from` names an external ValueSet that is not
   * resolved here — the concept layer is a projection of the SOURCE, and expanding a terminology
   * reference needs a resolution step this layer deliberately does not have. Such a concept gets
   * NOTHING here and renders as it always did: showing a list we made up would be worse than showing
   * none. (A field naming the ValueSet was added and removed in the same change — nothing read it, and
   * a signal with no reader is indistinguishable from a feature that works.)
   */
  answerOptions?: { code: string; display: string }[];
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
        ...(c.valueFrom?.kind === "inline"
          ? { answerOptions: c.valueFrom.options.map((o) => ({ code: o.code, display: o.display })) }
          : {}),
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
  const byKey = new Map(nodes.map((n) => [n.nodeKey, n]));
  const out = new Map<string, { code: string; display: string }[]>();
  for (const n of nodes) {
    if (n.answerOptions?.length) {
      out.set(n.nodeKey, n.answerOptions);
      continue;
    }
    // The wrapper must be TRANSPARENT — see the header. A composition (`defined as`) never forwards, no
    // matter how few of its operands carry options.
    if (n.definitionKind !== "definition-is") continue;
    const bearing = n.definitionRefs
      .map((r) => byKey.get(r))
      .filter((r): r is CrlConceptNode => (r?.answerOptions?.length ?? 0) > 0);
    if (bearing.length === 1) out.set(n.nodeKey, bearing[0].answerOptions!);
  }
  return out;
}
