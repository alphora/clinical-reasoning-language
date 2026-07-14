// #212 flags→MV slice 1 — the flag ANCHOR resolver (PURE: no vscode, no fs; node-testable). A relocated flag stores its
// ORIGINAL target; its live location is COMPUTED here against the CURRENT CRL structure. The anchor is for NAVIGATION, not
// identity — so an unresolvable anchor is a VALID state (esp. a "delete this node" flag whose fix removed the node): it
// ORPHANS back to the policy, keeping its original target labelled stale. Three outcomes:
//   - `live`     — the node resolves now (navigate to it; occurrence anchors carry the OccurrenceRef/nodeKey);
//   - `orphaned` — the node no longer resolves (deleted / restructured / renamed / moved) → falls back to the policy;
//   - `error`    — the CRL structure is UNAVAILABLE (unparseable source / no index) → the caller BLOCKS the gate (unknown
//                  state), NEVER treats it as a benign orphan.
// ⚠ `moved` is NOT live: `resolveOccurrence`'s `moved` means a DIFFERENT node shifted into the old slot (a mis-home), not
// the original node found — following it would navigate to the WRONG node. So moved ⇒ orphaned. ⚠ Scope-level resolution
// keys on (name, LIBRARY) — never name alone (cross-lib same-name concepts); a missing library or a multi-match (post-rename
// collision) ⇒ orphaned, never a guessed pick.
import type { CrlDecisionStructure } from "@smile-digital-health/crl";

import { resolveOccurrence, type OccurrenceRef } from "./occurrenceKey";
import type { MvFlagAnchor } from "./mvFlag";

/** A concept in the current structure — name + its OWNING library (+ the durable `@id` when present). */
export interface AnchorConceptRef {
  name: string;
  lib: string;
  id?: string;
}
/** The current CRL structure the resolver matches against. `undefined` (passed by the caller) means the source is
 *  unparseable / the index is unavailable → every anchor resolves to `error` (gate blocked). */
export interface AnchorContext {
  decisions: readonly CrlDecisionStructure[];
  concepts: readonly AnchorConceptRef[];
  libraries: readonly string[];
}

export type AnchorResolution =
  | { state: "live"; ref?: OccurrenceRef; nodeKey?: string }
  | { state: "orphaned" }
  | { state: "error"; reason: string };

/** Resolve a flag's stored anchor against the current structure. See the module header for the outcome contract. */
export function resolveAnchor(anchor: MvFlagAnchor, ctx: AnchorContext | undefined): AnchorResolution {
  if (ctx === undefined) return { state: "error", reason: "CRL structure unavailable (source unparseable or not indexed)" };
  // A PARTIAL index (a runtime caller with an array still unpopulated) is "structure unavailable", NOT a benign orphan: a
  // missing array must resolve to `error` (gate blocks), never crash this total/pure resolver on a panel-open/reveal path.
  if (!Array.isArray(ctx.decisions) || !Array.isArray(ctx.concepts) || !Array.isArray(ctx.libraries))
    return { state: "error", reason: "CRL structure incomplete (index not fully built)" };

  if (anchor.scope === "library") {
    return ctx.libraries.includes(anchor.name) ? { state: "live" } : { state: "orphaned" };
  }

  if (anchor.scope === "decision") {
    if (!anchor.library) return { state: "orphaned" }; // library required — can't resolve a bare decision name safely
    const decs = ctx.decisions.filter((d) => d.decision === anchor.name && d.lib === anchor.library);
    if (decs.length !== 1) return { state: "orphaned" }; // 0 = gone; >1 = ambiguous (never guess)
    const dec = decs[0];
    if (anchor.occurrenceKey) {
      const r = resolveOccurrence(dec, anchor.occurrenceKey); // placed → live; moved/orphan → orphaned (moved is a mis-home)
      return r.placed ? { state: "live", ref: r.ref, nodeKey: r.ref.nodeKey } : { state: "orphaned" };
    }
    return { state: "live" }; // decision-scope (no specific node)
  }

  // scope === "concept" — resolve by @id first (rename-safe), else (name, library); missing library / 0 / >1 ⇒ orphaned.
  if (anchor.entityId) {
    const byId = ctx.concepts.filter((c) => c.id !== undefined && c.id === anchor.entityId);
    if (byId.length === 1) return { state: "live" };
    if (byId.length > 1) return { state: "orphaned" }; // ambiguous @id ⇒ orphaned (never guess, never fall back to a weaker name match)
    // byId.length === 0: the id no longer exists (deleted/recreated/older record) → fall through to the (name, library) match.
  }
  if (!anchor.library) return { state: "orphaned" };
  const byName = ctx.concepts.filter((c) => c.name === anchor.name && c.lib === anchor.library);
  return byName.length === 1 ? { state: "live" } : { state: "orphaned" };
}
