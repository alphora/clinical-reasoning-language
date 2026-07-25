// Shared failed-criterion LABEL (#173 T3a/T3b) — the ONE place that turns a T2 `FailedCriterionNode.display` into a
// short human label, used by BOTH cockpit surfaces (the cross-pane peek's gap list + the run-tree in-place highlight)
// so the two never fork their copy. Pure; imports the `FailedCriterionNode` type + the pure `frontierShortLabel`
// formatter (#224 i.4b — the ONE frontier renderer, shared with the tree tooltip; no other `crl` value, no vscode).
import type { FailedCriterionNode } from "@smile-digital-health/crl/provenance";
import { frontierShortLabel } from "@smile-digital-health/crl";

/** A short label discriminated by the criterion's `display` payload:
 *   - unsatisfied-when (single)   → "when X" (byte-identical to pre-#224)
 *   - unsatisfied-when (compound) → "when <guardLabel> — unmet: <frontierShortLabel>" (which conjunct/alternative failed)
 *   - guarded-out      → "unless/only-when X" (concept may be absent on the structurally-degenerate guard → "?")
 *   - preemption(when) → "matched: when X" (concept may be absent → "?")
 *   - preemption(otherwise) → "matched: otherwise"
 */
export function failedCriterionLabel(n: FailedCriterionNode): string {
  const d = n.display;
  if (d.reason === "unsatisfied-when") {
    return d.guard === "single"
      ? `when ${d.concept.name}`
      : `when ${d.guardLabel} — unmet: ${frontierShortLabel(d.frontier)}`;
  }
  if (d.reason === "guarded-out") return `${d.polarity} ${d.concept?.name ?? "?"}`;
  // preemption: the matched prior sibling that diverted the run.
  return d.siblingKind === "when" ? `matched: when ${d.concept?.name ?? "?"}` : "matched: otherwise";
}
