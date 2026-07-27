// Unit test for the SHARED failed-criterion labeler (#173 T3, disc 160 FIX 6) — pins the exact rendered string for each
// `display` variant. This is the "labels can't drift across the cockpit + run-tree surfaces" hinge, so the strings are
// asserted directly here (both surfaces consume this one fn). vscode-free → imported directly (vitest transforms the .ts).
import assert from "node:assert/strict";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

import { failedCriterionLabel } from "./failedCriterionLabel.ts";

const check = test;

// A minimal FailedCriterionNode carrying just the `display` the labeler reads.
const node = (display) => ({ nodeId: "n", conceptLabel: "x", source: {}, reason: display.reason, display });

check("unsatisfied-when (single) → 'when <concept>' (byte-identical to pre-#224)", () => {
  assert.equal(failedCriterionLabel(node({ reason: "unsatisfied-when", guard: "single", concept: { name: "Indication" } })), "when Indication");
});

check("unsatisfied-when (compound) → 'when <guardLabel> — unmet: <frontier>'", () => {
  // a false conjunct: `A and B`, B unmet
  assert.equal(
    failedCriterionLabel(
      node({ reason: "unsatisfied-when", guard: "compound", guardLabel: "A and B", frontier: [{ kind: "ref", concept: { name: "B" } }] }),
    ),
    "when A and B — unmet: B",
  );
  // a false `or`: fixed phrase
  assert.equal(
    failedCriterionLabel(
      node({
        reason: "unsatisfied-when",
        guard: "compound",
        guardLabel: "A or B",
        frontier: [{ kind: "no-alternative", alternatives: [{ label: "A", frontier: [] }, { label: "B", frontier: [] }] }],
      }),
    ),
    "when A or B — unmet: no alternative held",
  );
});

check("#224 iii.3b: unsatisfied-when negation → 'when not X — unmet: not X' (established literal, not opaque)", () => {
  assert.equal(
    failedCriterionLabel(
      node({ reason: "unsatisfied-when", guard: "compound", guardLabel: "not Contra", frontier: [{ kind: "negated-ref", concept: { name: "Contra" } }] }),
    ),
    "when not Contra — unmet: not Contra",
  );
  // mixed `A and not B`, both blocking → both rendered
  assert.equal(
    failedCriterionLabel(
      node({
        reason: "unsatisfied-when",
        guard: "compound",
        guardLabel: "A and not B",
        frontier: [{ kind: "ref", concept: { name: "A" } }, { kind: "negated-ref", concept: { name: "B" } }],
      }),
    ),
    "when A and not B — unmet: A, not B",
  );
});

check("guarded-out WITH concept → '<polarity> <concept>'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "guarded-out", polarity: "unless", concept: { name: "Contra" } })), "unless Contra");
  assert.equal(failedCriterionLabel(node({ reason: "guarded-out", polarity: "only-when", concept: { name: "Elig" } })), "only-when Elig");
});

check("guarded-out WITHOUT concept (degenerate guard) → '<polarity> ?'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "guarded-out", polarity: "unless" })), "unless ?");
});

check("preemption (when) WITH concept → 'matched: when <concept>'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "preemption", siblingKind: "when", concept: { name: "Early" } })), "matched: when Early");
});

check("preemption (when) WITHOUT concept → 'matched: when ?'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "preemption", siblingKind: "when" })), "matched: when ?");
});

check("preemption (otherwise) → 'matched: otherwise'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "preemption", siblingKind: "otherwise" })), "matched: otherwise");
});

