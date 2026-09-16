// Todo 2 (disc 356/357) — the PURE flag→node placement pass shared by `driveFlagBadges` (which gids to LIGHT) and the
// node-filtered flag entry (`flagsByGid`: WHICH flags belong to each gid). Extracted from the cockpit so the reverse-map
// assembly — dedup, order, the collapsed-criterion rollup, and the moved-occurrence exclusion — is node-testable without vscode
// (impl review 357 [important]). No `vscode` import. The crlStructure/`resolveAnchor`-dependent lookups (decision-object
// segments, live-occurrence gid, and resolved concept identity) are CALLBACKS supplied by the host — the host wiring is separately tested — so this module is a
// pure function of plain data.

import type { MvFlag, MvFlagAnchor } from "@smile-digital-health/crl";

/** Keep workflow step and status associated: resolved authoring work is not an open authoring finding. */
export function summarizeFlagBadges(byGid: ReadonlyMap<string, readonly MvFlag[]>) {
  return [...byGid].map(([gid,flags])=>({
    gid,
    open: flags.filter(f=>f.status!=="resolved").length,
    resolved: flags.filter(f=>f.status==="resolved").length,
    authoringOpen: flags.filter(f=>f.category==="extraction" && f.status!=="resolved").length,
    authoringResolved: flags.filter(f=>f.category==="extraction" && f.status==="resolved").length,
  }));
}

/** The flow render's flag-relevant substrate (a subset of the tree PaneView): where each concept/criterion draws. */
export interface FlagPlacementSubstrate {
  /** every `when`/def-leaf a concept draws as — `{gid, lib, name}` (a concept flag lights EACH by (lib,name)). */
  conceptOccurrences: readonly { gid: string; lib: string; name: string; flagGid?: string }[];
  /** the rendered criterion boxes — a COLLAPSED one rolls its body-concept flags up onto its own gid. */
  criterionOccurrences: readonly { gid: string; collapsed: boolean; bodyConcepts: readonly { lib: string; name: string }[] }[];
}

export interface FlagPlacementResult {
  /** the gids to LIGHT (`.has-flag`), for the flagBadges message — order-insensitive (the webview toggles a class). */
  gids: string[];
  /** node gid → the flags that lit it, deduped by id, in placement order (see `computeFlagPlacement` for the ordering). */
  byGid: Map<string, MvFlag[]>;
  /** OCCURRENCE flags in the supplied set whose keyed target moved/removed (matched no node) — the start-badge "N⚠" suffix. */
  unplaced: number;
}

// Collision-safe (lib,name) key - JSON.stringify escapes, so a lib/name containing the separator can't spoof it
// (concept + library names legitimately contain spaces; a bare space-joined key would collide).
const conceptKey = (lib: string | undefined, name: string): string => JSON.stringify([lib ?? null, name]);

/** Explicit creation targets for a visible node, including helpers displayed through a Criterion.
 * Keep each original concept identity; a shared display location must never pick the first helper implicitly. */
export function conceptFlagTargetsForGids(
  occurrences: FlagPlacementSubstrate["conceptOccurrences"],
  gids: readonly string[],
): { lib: string; name: string }[] {
  const owners = new Set(gids), targets = new Map<string, { lib: string; name: string }>();
  for (const o of occurrences) {
    if (owners.has(o.gid) || (o.flagGid !== undefined && owners.has(o.flagGid))) {
      targets.set(conceptKey(o.lib, o.name), { lib: o.lib, name: o.name });
    }
  }
  return [...targets.values()];
}

/**
 * Match each flag in `flags` to the render node(s) it belongs on and build both the lit-gid set and the reverse `gid → flags`
 * map. STATUS-AGNOSTIC: `driveFlagBadges` passes all statuses for badges and the open set for unplaced-blocker metrics;
 * `driveFlagNodeHighlight` passes a single flag regardless of status (a resolved flag's drawer still lights its node). Do NOT
 * add an `isOpen` filter here — that would silently kill the resolved-flag highlight (disc 359 [important]).
 *
 * Matching (unchanged from the prior `driveFlagBadges` inline pass — Claude verified equivalence):
 *  - concept scope → every `conceptOccurrences` entry with the same `(lib, name)` (NEVER name alone — cross-lib collisions).
 *  - decision scope + `occurrenceKey` → the ONE live gid from `occurrenceGid(anchor)` (undefined ⇒ moved/removed ⇒ `unplaced++`).
 *  - decision scope, no key (a decision-OBJECT flag) → every segment gid from `decisionObjectGids(anchor)`.
 *  - library scope / a concept drawn nowhere → no per-node gid (the start-badge count is the catch-all); NOT counted `unplaced`
 *    (only a genuine moved OCCURRENCE dilutes that signal).
 *  - a COLLAPSED criterion rolls each CONCEPT flag whose `(lib,name)` is in its `bodyConcepts` onto its own gid (so a flag on a
 *    concept referenced only inside a folded body isn't invisible) — applies to whatever `flags` are passed (resolved included).
 *
 * Bucket ordering: each bucket is in `flags` order WITHIN each phase — the per-flag matching loop first, then the rollup — so
 * on a gid shared by both phases the matching-loop flags precede the rolled-up ones. `place` dedups by flag id.
 */
export function computeFlagPlacement(
  flags: readonly MvFlag[],
  substrate: FlagPlacementSubstrate,
  decisionObjectGids: (anchor: MvFlagAnchor) => readonly string[],
  occurrenceGid: (anchor: MvFlagAnchor) => string | undefined,
  resolveConcept: (anchor: MvFlagAnchor) => { lib: string; name: string } | undefined,
): FlagPlacementResult {
  const gids = new Set<string>();
  const byGid = new Map<string, MvFlag[]>();
  const place = (g: string, f: MvFlag): void => {
    gids.add(g);
    const b = byGid.get(g);
    if (!b) byGid.set(g, [f]);
    else if (!b.some((x) => x.id === f.id)) b.push(f);
  };

  const conceptTargets = new Map<MvFlag, { lib: string; name: string } | undefined>();
  for (const f of flags) if (f.anchor.scope === "concept") conceptTargets.set(f, resolveConcept(f.anchor));
  let unplaced = 0;
  for (const f of flags) {
    const a = f.anchor;
    let matched: readonly string[] = [];
    if (a.scope === "concept") {
      const target = conceptTargets.get(f);
      if (target) matched = substrate.conceptOccurrences.filter((o) => o.name === target.name && o.lib === target.lib).map((o) => o.flagGid ?? o.gid);
    } else if (a.scope === "decision") {
      if (a.occurrenceKey) {
        const g = occurrenceGid(a);
        matched = g ? [g] : [];
      } else {
        matched = decisionObjectGids(a);
      }
    }
    if (matched.length === 0 && a.scope === "decision" && a.occurrenceKey) unplaced++;
    for (const g of matched) place(g, f);
  }

  // Collapsed-criterion rollup — per flag (so the bucket records WHICH flag lit the rollup gid; a Set of keys couldn't).
  const conceptFlags = flags.filter((f) => f.anchor.scope === "concept");
  if (conceptFlags.length > 0) {
    for (const occ of substrate.criterionOccurrences) {
      if (!occ.collapsed) continue;
      const bodyKeys = new Set(occ.bodyConcepts.map((bc) => conceptKey(bc.lib, bc.name)));
      for (const f of conceptFlags) {
        const target = conceptTargets.get(f);
        if (target && bodyKeys.has(conceptKey(target.lib, target.name))) place(occ.gid, f);
      }
    }
  }

  return { gids: [...gids], byGid, unplaced };
}
