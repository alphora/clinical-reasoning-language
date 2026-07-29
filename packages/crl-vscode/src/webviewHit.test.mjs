// Unit tests for the webview hit classifier (#156 C2c-2). Guards the peek-only invariant: a fact hit must NEVER be
// routed into the engine selection path. vscode-free → imported directly (vitest transforms the .ts).
import assert from "node:assert/strict";

import { isFactHit, isConceptHit, isSubQuestionHit, isCriterionToggleHit, isCriterionOccurrenceHit } from "./webviewHit.ts";

const check = test;

check("a fact hit (has conceptKey) → isFactHit true (→ peek, NOT engine selection)", () => {
  assert.equal(isFactHit({ conceptKey: "k", factAnchorKey: "fact:g_cel0:f0" }), true);
});

check("the three engine-selectable hits → isFactHit false (→ mapHitToPrimary)", () => {
  assert.equal(isFactHit({ unitId: "u1", range: {} }), false);
  assert.equal(isFactHit({ nodeKey: "n1" }), false);
  assert.equal(isFactHit({ caseId: "c1" }), false);
});

check("a concept-row hit (has conceptNodeKey) → isConceptHit true (→ peekConceptNode, NOT engine selection)", () => {
  assert.equal(isConceptHit({ conceptNodeKey: "cA" }), true);
});

check("concept hit is NOT a fact hit, and a decision {nodeKey} is NOT a concept hit (the disjointness that keeps routing safe)", () => {
  assert.equal(isFactHit({ conceptNodeKey: "cA" }), false);
  assert.equal(isConceptHit({ conceptKey: "k", factAnchorKey: "f" }), false);
  assert.equal(isConceptHit({ nodeKey: "n1" }), false);
  assert.equal(isConceptHit({ unitId: "u1", range: {} }), false);
  assert.equal(isConceptHit({ caseId: "c1" }), false);
});

check("#216 a sub-question hit (has subQuestionLeafKey) → isSubQuestionHit true, and is DISJOINT from fact/concept/select hits", () => {
  assert.equal(isSubQuestionHit({ subQuestionLeafKey: "leaf::w:B|0|c:L1" }), true, "→ dynamic on-path case selection");
  assert.equal(isFactHit({ subQuestionLeafKey: "leaf::x" }), false, "NOT a fact peek");
  assert.equal(isConceptHit({ subQuestionLeafKey: "leaf::x" }), false, "NOT a concept peek");
  assert.equal(isSubQuestionHit({ conceptNodeKey: "cA" }), false);
  assert.equal(isSubQuestionHit({ nodeKey: "n1" }), false);
  assert.equal(isSubQuestionHit({ caseId: "c1" }), false);
});

check("#233 Todo 2a a criterion-toggle hit (has criterionToggle) → isCriterionToggleHit true, and is DISJOINT from every selectable/peek hit (drives ONLY the toggle channel)", () => {
  assert.equal(isCriterionToggleHit({ criterionToggle: 'leaf::["w:cmp","0.1","crit"]' }), true, "→ toggleCriterionExpand by position key");
  // DISJOINT both ways: a toggle hit is not a select/peek/sub-question, and none of those is a toggle hit.
  assert.equal(isFactHit({ criterionToggle: "leaf::x" }), false);
  assert.equal(isConceptHit({ criterionToggle: "leaf::x" }), false);
  assert.equal(isSubQuestionHit({ criterionToggle: "leaf::x" }), false);
  assert.equal(isCriterionToggleHit({ nodeKey: "n1" }), false, "a decision {nodeKey} is NOT a toggle (it selects/verdicts)");
  assert.equal(isCriterionToggleHit({ subQuestionLeafKey: "leaf::x" }), false);
  assert.equal(isCriterionToggleHit({ conceptNodeKey: "cA" }), false);
  assert.equal(isCriterionToggleHit({ caseId: "c1" }), false);
});

check("#233 Todo 2b a criterion-occurrence hit (has criterionOccurrence) → isCriterionOccurrenceHit true, DISJOINT from every selectable/peek/toggle hit (right-click encoding; left-click inert)", () => {
  const occ = { criterionOccurrence: { lib: "Pol", name: "CritC", bodyHash: "sha256:0000000000000000", elided: false } };
  assert.equal(isCriterionOccurrenceHit(occ), true, "→ criterion-encoding verdict by identity");
  // DISJOINT both ways.
  assert.equal(isFactHit(occ), false);
  assert.equal(isConceptHit(occ), false);
  assert.equal(isSubQuestionHit(occ), false);
  assert.equal(isCriterionToggleHit(occ), false, "an occurrence (box) is NOT a toggle (chevron)");
  assert.equal(isCriterionOccurrenceHit({ nodeKey: "n1" }), false, "a decision {nodeKey} is NOT a criterion occurrence");
  assert.equal(isCriterionOccurrenceHit({ criterionToggle: "leaf::x" }), false);
  assert.equal(isCriterionOccurrenceHit({ subQuestionLeafKey: "leaf::x" }), false);
  assert.equal(isCriterionOccurrenceHit({ caseId: "c1" }), false);
});

