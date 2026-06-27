/**
 * Provenance↔cockpit CORRESPONDENCE check (#170) — the authoritative, NON-structural gate folded into the FINAL
 * `validate_provenance`. Per CEL case it asserts the cockpit's LIT decision-row set (the REAL `crlRevealMaps`
 * resolution — `crlAnchorsForUnits(unitsForCase(...))`, NOT a structural reimplementation) equals the case's RUN
 * PATH (the produced-action ancestor chain from the scenario VM). EXTRA lit ⇒ bleed (an untaken branch/cell lit);
 * MISSING ⇒ the path under-lights. Green ⇒ the cockpit lights exactly each case's path.
 *
 * Why the REAL resolution and not the structural string-invariant: a cluster citing a CONCEPT ref resolves (per the
 * documented `rowNodeKeysForUnitWithConcepts` tradeoff) to EVERY `when` that uses the concept — a concept reused
 * across cells bleeds in a way no purely-structural nodeId arithmetic can see (the MED201.014 35/53-bleed class).
 * Running the cockpit's OWN code is the only thing that cannot drift from what the cockpit shows.
 *
 * A green gate MUST mean "checked": every case that cannot be compared (no frozen id, name collision, no decision,
 * unresolved decision, no produced disposition, a run error, or a runtime node with no structure row) is reported as
 * an explicit `unchecked` result — never silently skipped. A wholesale FAILED scenario render (no cases at all) is
 * itself reported `render-failed` so FINAL can never green-pass having verified nothing.
 */
import type { CockpitModel } from "./cockpitModel";
import type { ProvNodeRef } from "./indexer";
import { buildCrlRevealMaps, crlAnchorsForUnits, unitsForCase } from "./revealMaps";
import { producedRuntimePathRefs, type MinimalViewNode } from "./runPath";

export type CorrespondenceUncheckedReason =
  | "render-failed"
  | "unfrozen-case"
  | "case-name-collision"
  | "no-decision"
  | "unresolved-decision"
  | "no-produced-action"
  | "run-error"
  | "unmapped-runtime-node";

export type CorrespondenceCheckResult =
  | {
      kind: "mismatch";
      caseName: string;
      caseId: string;
      decision: string;
      lib: string;
      bleed: ProvNodeRef[];
      miss: ProvNodeRef[];
      producedCount: number;
    }
  | { kind: "unchecked"; caseName: string; reason: CorrespondenceUncheckedReason; details?: string[] };

/** Inverse of `nodeKey` (indexer.ts: `JSON.stringify([lib, kind, name, nodeId ?? null])`). Parses the JSON tuple back
 *  to a ProvNodeRef so a bleed/miss row can carry a navigable ref. Defensive: a non-tuple key (should not occur for a
 *  nodeByKey-resident key) yields a best-effort ref rather than a throw. */
function decodeRef(key: string): ProvNodeRef {
  try {
    const t = JSON.parse(key) as [string, string, string, string | null];
    if (Array.isArray(t) && t.length === 4) {
      return {
        lib: String(t[0]),
        kind: String(t[1]),
        name: String(t[2]),
        ...(t[3] !== null ? { nodeId: String(t[3]) } : {}),
      };
    }
  } catch {
    /* fall through to the best-effort ref below */
  }
  return { lib: "", kind: "", name: key };
}

export function checkCockpitCorrespondence(model: CockpitModel): CorrespondenceCheckResult[] {
  // A wholesale FAILED scenario render (graph/CEL resolution failure) yields an EMPTY scenarios[] — iterating it would
  // silently check nothing and let FINAL green-pass having verified nothing. Report it once as render-failed. (A
  // genuinely case-less artifact with success===true is NOT a failure — no cases to verify is not a bleed.)
  if (model.scenarios.success === false) {
    return [
      {
        kind: "unchecked",
        caseName: "(scenario render)",
        reason: "render-failed",
        ...(model.scenarios.errors.length ? { details: model.scenarios.errors } : {}),
      },
    ];
  }

  const maps = buildCrlRevealMaps(model.correspondence, model.crlStructure, model.conceptLayer);

  // buildCaseIdJoin drops a name shared by ≥2 FROZEN cases, but an unfrozen+frozen same-name pair is NOT caught there
  // (the frozen one survives) — joining the unfrozen scenario to the frozen case's units would mis-compare it. So the
  // shared helper ALSO computes `duplicateScenarioNames` (any name shared by >1 case, frozen or unfrozen) → we flag
  // ANY scenario whose case name is non-unique across the render → unchecked case-name-collision.
  const duplicateScenarioNames = model.duplicateScenarioNames;

  // ${lib}::${decision}::${nodeId} → row nodeKey, ONLY for the decision sub-nodes (kind when/otherwise/action) — the
  // decision-ROOT (kind "decision", empty nodeId) is excluded: it is never on a case's run-path ancestor chain.
  const idToKey = new Map<string, string>();
  for (const [nodeKey, meta] of maps.nodeByKey) {
    if (meta.kind === "when" || meta.kind === "otherwise" || meta.kind === "action") {
      idToKey.set(`${meta.lib}::${meta.decision}::${meta.nodeId}`, nodeKey);
    }
  }

  const results: CorrespondenceCheckResult[] = [];
  for (const sv of model.scenarios.scenarios) {
    const caseName = sv.case.name;

    // A name shared by ≥2 scenarios in this render is ambiguous to join (the unfrozen-vs-frozen mis-join vector) →
    // unchecked, never mis-compared. Checked first: ambiguity dominates run state / decision shape.
    if (duplicateScenarioNames.has(caseName)) {
      results.push({ kind: "unchecked", caseName, reason: "case-name-collision" });
      continue;
    }

    // A run error means no produced disposition because the run itself failed — not a comparable path.
    if (sv.status === "error") {
      results.push({ kind: "unchecked", caseName, reason: "run-error" });
      continue;
    }
    if (sv.decision === null) {
      results.push({ kind: "unchecked", caseName, reason: "no-decision" });
      continue;
    }
    if (!sv.decision.resolved) {
      results.push({ kind: "unchecked", caseName, reason: "unresolved-decision" });
      continue;
    }
    const dec = sv.decision.name;
    // libraryName is optional on a resolved DecisionView; absent (→ "") on a covered decision is unexpected, but the
    // ${lib}::${dec}::${id} lookup then misses every structure row → routes to unmapped-runtime-node. Fail-safe (never
    // a silent green), though the reason would be misattributed; in practice the covered decision always carries its lib.
    const lib = sv.decision.libraryName ?? "";

    const caseId = model.caseIdByName[caseName];
    if (caseId === undefined) {
      results.push({
        kind: "unchecked",
        caseName,
        reason: model.caseNameCollisions.includes(caseName)
          ? "case-name-collision"
          : "unfrozen-case",
      });
      continue;
    }

    // The chain-aware run path (#175, disc 151 Fork B): ONE ProducedRunPath per produced action. The decomposer
    // re-roots a deep inlined same-lib `use decision` run-path (`.../action[0]/when[0]/.../action[0]` spanning
    // Main→Sub1→…) into ordered STANDALONE-local refs — one per delegation frame — so each grounds against the
    // standalone structure index (`idToKey`, which inventories EVERY decision standalone, sub-decisions included). For a
    // non-chained case the decomposition reduces to the old inclusive ancestor chain (back-compat), so those cases are
    // byte-unchanged. generate.ts derives the SAME path via the SAME primitive (disc 151 ref 3, no drift).
    const paths = producedRuntimePathRefs(sv.tree as unknown as MinimalViewNode[], {
      lib,
      decision: dec,
    });
    if (paths.length === 0) {
      results.push({ kind: "unchecked", caseName, reason: "no-produced-action" });
      continue;
    }

    // expected = union over EVERY produced action's decomposed standalone refs → row nodeKeys. The honesty invariant
    // (disc 151 ref 5, MACHINE-CHECKABLE): route to `unmapped-runtime-node` iff a path's `gaps` is non-empty (the
    // decomposer could not re-root a node — a residual the structure cannot check) OR a grounded ref MISSES `idToKey`
    // (no standalone structure row — the cross-lib #172 frontier, or a genuine residual). Either way the case is
    // UNCHECKED, never a silent green and never a wrong-sub false mismatch. A same-lib chain's refs all resolve (every
    // sub-decision is inventoried standalone), so the chained case now RESOLVES and is compared like any other.
    const expected = new Set<string>();
    const unmapped: string[] = [];
    for (const p of paths) {
      if (p.gaps.length > 0) {
        unmapped.push(...p.gaps);
        continue;
      }
      for (const ref of p.refs) {
        const key = idToKey.get(`${ref.lib}::${ref.decision}::${ref.nodeId}`);
        // FIX 2: lib-qualify the citation (a sub name can repeat across libs) — the exact lookup-key shape.
        if (key === undefined) unmapped.push(`${ref.lib}::${ref.decision}#${ref.nodeId}`);
        else expected.add(key);
      }
    }
    if (unmapped.length > 0) {
      results.push({
        kind: "unchecked",
        caseName,
        reason: "unmapped-runtime-node",
        details: [...new Set(unmapped)],
      });
      continue;
    }

    // lit = what the cockpit ACTUALLY lights for this case (the real resolution), dropping concept-node keys (not in
    // nodeByKey) AND the decision-root (kind "decision") so only decision-rows are compared against the path.
    const lit = new Set(
      crlAnchorsForUnits(unitsForCase(caseId, maps), maps).filter((k) => {
        const m = maps.nodeByKey.get(k);
        return m !== undefined && m.kind !== "decision";
      }),
    );

    const bleed = [...lit].filter((k) => !expected.has(k));
    const miss = [...expected].filter((k) => !lit.has(k));
    if (bleed.length > 0 || miss.length > 0) {
      results.push({
        kind: "mismatch",
        caseName,
        caseId,
        decision: dec,
        lib,
        bleed: bleed.map(decodeRef),
        miss: miss.map(decodeRef),
        producedCount: paths.length,
      });
    }
    // else: clean (push nothing) — the cockpit lights exactly this case's path.
  }
  return results;
}
