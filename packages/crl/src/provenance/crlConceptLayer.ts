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
import type { Concept } from "../ast/types";
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
  /** The concept's definition shape, when present — a raw signal for the renderer's later layer classification. */
  definitionKind?: ConceptDefinitionKind;
  hasLocalCode: boolean; // has a local `- code is …` (locally assertable)
  hasRepresentations: boolean; // has ≥1 `possible representation:` entry
  /** The concept nodeKeys this concept is DIRECTLY defined in terms of (deduped, source order). Direct edges only. */
  definitionRefs: string[];
}

// Exhaustive over the ConceptDefinition union → adding a definition kind is a compile error here, not a silent miss.
const DEF_KIND: Record<NonNullable<Concept["definition"]>["type"], ConceptDefinitionKind> = {
  DefinedAsDefinition: "defined-as",
  DefinitionIsDefinition: "definition-is",
  CodedFromDefinition: "coded-from",
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
    layer:
      c.definitionKind === "defined-as" || c.definitionKind === "definition-is"
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
        ...(c.definition ? { definitionKind: DEF_KIND[c.definition.type] } : {}),
        hasLocalCode: c.code !== undefined,
        hasRepresentations: c.representations.length > 0,
        definitionRefs,
      });
    }
  }
  return out;
}
