// Webview click-hit classification (vscode-free, unit-tested) — three-pane viewer C2c-2 (#156).
// A pane's `reveals` map resolves an opaque data-reveal key to a WebviewHit. Three shapes are engine-SELECTABLE (they
// flow into mapHitToPrimary → a Selection): source spans, CRL rows, CEL cases. The fourth — a CEL fact — is a PEEK:
// transient, shell-side, never an engine selection. `isFactHit` is the discriminator that diverts a fact click off the
// selection path. The fact shape is deliberately kept OUT of `RevealHit` so it can never be passed to the engine mapping.
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";

/** The engine-selectable click hits. */
export type RevealHit = { unitId: string; range: ZeroBasedRange } | { nodeKey: string } | { caseId: string };

/** A CEL fact peek hit: the concept to highlight across panes + the cel anchor of the clicked fact span (self-highlight). */
export interface FactHit {
  conceptKey: string;
  factAnchorKey: string;
}

/** A CRL CONCEPT-row peek hit (#166 Slice 3): the concept node clicked in the CRL pane. Like FactHit it's a PEEK (no
 *  engine selection) — kept OUT of `RevealHit` so a concept row can never be misrouted as a DECISION selection. */
export interface ConceptHit {
  conceptNodeKey: string;
}

/** #216: a TREE SUB-QUESTION (outline `defined as` operand) click. Carries the leaf's STABLE `leaf::` key. It is NOT a
 *  static selection (the applicable cases depend on which cases evaluate THIS operand TRUE on-path) and NOT a peek — so it
 *  is kept OUT of `RevealHit`, diverted before `mapHitToPrimary`, and resolved dynamically host-side (the cases whose fired
 *  path lights this leaf `.flow-leaf-yes`, then selected in the current primary — a subset of the owning `when`'s cases). */
export interface SubQuestionHit {
  subQuestionLeafKey: string;
}

/** #233 Todo 2a: a NON-ROOT criterion box's collapse chevron. Carries the criterion occurrence's POSITION key
 *  (`leaf::[whenKey,opPath,"crit"]`, render-independent), which `toggleCriterionExpand` flips in `expandedGuardWhens`
 *  ⚠ #189 REUSES THIS CHANNEL for a coded question's ANSWER OPTIONS, with a `"opts"`-tagged key
 *  (`leaf::[whenKey,opPath,"opts"]`) — disjoint from `"crit"` by the tag, so the two collapse bits are
 *  independent on the same node. A THIRD tag must stay disjoint from both; that is what makes one toggle
 *  message serve every disclosure without new host plumbing.
 *  (which now holds BOTH root when-nodeKeys and these position keys — disjoint by the `leaf::` prefix). Kept OUT of
 *  `RevealHit` (it is neither a selection nor a peek — only the toggle channel resolves it). A ROOT criterion's chevron
 *  still resolves to `{nodeKey}` (the `when` box is the criterion, absorbed), so both toggle paths converge on the flip. */
export interface CriterionToggleHit {
  criterionToggle: string;
}

/** #233 Todo 2b: a NON-ROOT criterion box's BODY (right-click → the model-level criterion-encoding verdict menu). Carries
 *  the criterion IDENTITY (`{lib,name}`, library-local), its CANONICAL `bodyHash` (the render-independent fingerprint the
 *  reviewer is judging — the staleness key), and this occurrence's IN-SITU `elided` — true when THIS box's rendered body was
 *  truncated to a `…` (e.g. inside a breaching guard, where the canonical body may still be fine). A "Correctly encoded" pass
 *  is REFUSED when the seen body was elided (can't attest a body you didn't see — disc 330 [critical]). A ROOT criterion
 *  `when` instead resolves its identity from its `{nodeKey}` guard outline (`topCriterion`, whose `elided` == canonical at the
 *  root). Kept OUT of `RevealHit` — LEFT-click is inert (v1), only RIGHT-click (verdict) + the encoding menu resolve it. */
export interface CriterionOccurrenceHit {
  criterionOccurrence: { lib: string; name: string; bodyHash: string; elided: boolean };
}

/** Everything a webview click can resolve to. */
export type WebviewHit = RevealHit | FactHit | ConceptHit | SubQuestionHit | CriterionToggleHit | CriterionOccurrenceHit;

/** True for a fact peek (→ peekConcept), false otherwise. */
export function isFactHit(hit: WebviewHit): hit is FactHit {
  return "conceptKey" in hit;
}

/** True for a CRL concept-row peek (→ peekConceptNode); diverted before mapHitToPrimary (else `{nodeKey}`-like routing
 *  would treat it as a decision). */
export function isConceptHit(hit: WebviewHit): hit is ConceptHit {
  return "conceptNodeKey" in hit;
}

/** True for a tree sub-question click (→ dynamic on-path case selection); diverted before mapHitToPrimary. */
export function isSubQuestionHit(hit: WebviewHit): hit is SubQuestionHit {
  return "subQuestionLeafKey" in hit;
}

/** #233 Todo 2a: true for a non-root criterion collapse chevron (→ toggleCriterionExpand by position key). */
export function isCriterionToggleHit(hit: WebviewHit): hit is CriterionToggleHit {
  return "criterionToggle" in hit;
}

/** #233 Todo 2b: true for a non-root criterion box body (→ criterion-encoding verdict by identity; left-click inert). */
export function isCriterionOccurrenceHit(hit: WebviewHit): hit is CriterionOccurrenceHit {
  return "criterionOccurrence" in hit;
}
