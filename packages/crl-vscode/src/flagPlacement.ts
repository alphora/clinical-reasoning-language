// Todo 2 (disc 356/357) — the PURE flag→node placement pass shared by `driveFlagBadges` (which gids to LIGHT) and the
// node-filtered flag entry (`flagsByGid`: WHICH open flags lit each gid). Extracted from the cockpit so the reverse-map
// assembly — dedup, order, the collapsed-criterion rollup, and the moved-occurrence exclusion — is node-testable without vscode
// (impl review 357 [important]). No `vscode` import. The two crlStructure/`resolveAnchor`-dependent lookups (decision-object
// segments, live-occurrence gid) are CALLBACKS supplied by the host — both are separately unit-tested — so this module is a
// pure function of plain data.

import type { MvFlag, MvFlagAnchor } from "@smile-digital-health/crl";

/** The flow render's flag-relevant substrate (a subset of the tree PaneView): where each concept/criterion draws. */
export interface FlagPlacementSubstrate {
  /** every `when`/def-leaf a concept draws as — `{gid, lib, name}` (a concept flag lights EACH by (lib,name)). */
  conceptOccurrences: readonly { gid: string; lib: string; name: string }[];
  /** the rendered criterion boxes — a COLLAPSED one rolls its open body-concept flags up onto its own gid. */
  criterionOccurrences: readonly { gid: string; collapsed: boolean; bodyConcepts: readonly { lib: string; name: string }[] }[];
}

export interface FlagPlacementResult {
  /** the gids to LIGHT (`.has-flag`), for the flagBadges message — order-insensitive (the webview toggles a class). */
  gids: string[];
  /** node gid → the OPEN flags that lit it, deduped by id, in placement order (see `computeFlagPlacement` for the ordering). */
  byGid: Map<string, MvFlag[]>;
  /** open OCCURRENCE flags whose keyed target moved/removed (matched no node) — the start-badge "N⚠" suffix. */
  unplaced: number;
}

// Collision-safe (lib,name) key - JSON.stringify escapes, so a lib/name containing the separator can't spoof it
// (concept + library names legitimately contain spaces; a bare space-joined key would collide).
const conceptKey = (lib: string | undefined, name: string): string => JSON.stringify([lib ?? null, name]);

/**
 * Match each OPEN flag to the render node(s) it belongs on and build both the lit-gid set and the reverse `gid → flags` map.
 *
 * Matching (unchanged from the prior `driveFlagBadges` inline pass — Claude verified equivalence):
 *  - concept scope → every `conceptOccurrences` entry with the same `(lib, name)` (NEVER name alone — cross-lib collisions).
 *  - decision scope + `occurrenceKey` → the ONE live gid from `occurrenceGid(anchor)` (undefined ⇒ moved/removed ⇒ `unplaced++`).
 *  - decision scope, no key (a decision-OBJECT flag) → every segment gid from `decisionObjectGids(anchor)`.
 *  - library scope / a concept drawn nowhere → no per-node gid (the start-badge count is the catch-all); NOT counted `unplaced`
 *    (only a genuine moved OCCURRENCE dilutes that signal).
 *  - a COLLAPSED criterion rolls each open CONCEPT flag whose `(lib,name)` is in its `bodyConcepts` onto its own gid (so a flag
 *    on a concept referenced only inside a folded body isn't invisible).
 *
 * Bucket ordering: each bucket is in `open` order WITHIN each phase — the per-flag matching loop first, then the rollup — so on
 * a gid shared by both phases the matching-loop flags precede the rolled-up ones. `place` dedups by flag id.
 */
export function computeFlagPlacement(
  open: readonly MvFlag[],
  substrate: FlagPlacementSubstrate,
  decisionObjectGids: (anchor: MvFlagAnchor) => readonly string[],
  occurrenceGid: (anchor: MvFlagAnchor) => string | undefined,
): FlagPlacementResult {
  const gids = new Set<string>();
  const byGid = new Map<string, MvFlag[]>();
  const place = (g: string, f: MvFlag): void => {
    gids.add(g);
    const b = byGid.get(g);
    if (!b) byGid.set(g, [f]);
    else if (!b.some((x) => x.id === f.id)) b.push(f);
  };

  let unplaced = 0;
  for (const f of open) {
    const a = f.anchor;
    let matched: readonly string[] = [];
    if (a.scope === "concept") {
      matched = substrate.conceptOccurrences.filter((o) => o.name === a.name && o.lib === a.library).map((o) => o.gid);
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
  const openConceptFlags = open.filter((f) => f.anchor.scope === "concept");
  if (openConceptFlags.length > 0) {
    for (const occ of substrate.criterionOccurrences) {
      if (!occ.collapsed) continue;
      const bodyKeys = new Set(occ.bodyConcepts.map((bc) => conceptKey(bc.lib, bc.name)));
      for (const f of openConceptFlags) if (bodyKeys.has(conceptKey(f.anchor.library, f.anchor.name))) place(occ.gid, f);
    }
  }

  return { gids: [...gids], byGid, unplaced };
}
