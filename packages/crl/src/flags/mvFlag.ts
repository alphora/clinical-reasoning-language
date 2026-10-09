// #212 flags→MV slice 1 — the review-FLAG record model (PURE: no vscode, no fs; node-testable). Flags are relocating OUT of
// `.crl` meta-tags into first-class structured records under `medical-validation/flags/` (CRL's own metadata namespace). A flag is a
// VALIDATION FINDING — cross-step review metadata (extraction=engineering-origin, validation=MV-origin), NOT CRL content and
// NOT an MV-step content artifact. The record is SELF-DESCRIBING (it retains its original target + a human label) so it stays
// meaningful even when its anchor no longer resolves; the live anchor is for NAVIGATION, not identity (see mvFlagAnchor.ts).
//
// Conservative coercion (the gate must NEVER silently pass): an unknown status ⇒ "open" (a malformed
// status must BLOCK, never clear); a structurally-invalid record ⇒ undefined so the STORE raises a load warning → gate error
// (never silently dropped — dropping a flag would remove a blocker). `id`/`createdAt` are HOST-injected (keeps this pure).

import { coerceQaEditRequest, type QaEditRequest } from "./qaEditRequest";
import { isQaEditFlag, qaEditFlagId } from "./mvFlagReview";
export type MvFlagStatus = "open" | "fixed" | "approved" | "resolved";
/** The status lifecycle a flag SURFACE (cockpit / MCP tool) types against — an alias of `MvFlagStatus`, re-homed here from the
 *  deleted `rewriteMetaStatus` (#212 step 4) so both callers keep the `FlagStatus` name without depending on `.crl` refactors. */
export type FlagStatus = MvFlagStatus;
/** Current workflow ownership, not the author: `extraction` belongs to KE; `validation` belongs to MV.
 *  MV answering resolves KE and creates a distinct validation flag; the original category is preserved.
 *  New flags start in their tag's default category; agents can also file MV flags. */
export type MvFlagCategory = "extraction" | "validation";
export type MvFlagScope = "concept" | "decision" | "library";

/** The ORIGINAL target the flag is about — ALWAYS retained (self-describing). `library` is required to resolve a
 *  concept/decision anchor safely (cross-lib same-name collisions); a resolver treats its absence as unresolvable. `entityId`
 *  = the concept `@id` when available (resolve by id when present, otherwise name+library — rename-safe). `occurrenceKey`
 *  (`<nodeId>~<signature>`) addresses a specific decision leaf/`when` node — meaningful ONLY for `scope==="decision"`. */
export interface MvFlagAnchor {
  scope: MvFlagScope;
  name: string;
  library?: string;
  entityId?: string;
  occurrenceKey?: string;
  /** a human-readable description of the node — survives orphaning ("this flag was about X"). */
  label: string;
}

export interface MvFlag {
  // REFACTOR:grounded (MV/KE workflow): v2 carries specialized Q/A requests; legacy flags remain readable.
  schemaVersion: 1 | 2;
  editRequest?: QaEditRequest;
  /** Stable record identity: generic flags use UUIDs; Q/A requests hash their immutable source target. */
  id: string;
  category: MvFlagCategory;
  /** the concern TYPE (the flag tag). Human MV Types (a `displayName` in flagVocab): validation-concern / narrative-defect /
   *  tooling-bug / other. AI-authoring tags: customer-confirmable / internal-inconsistency / open-fork / fidelity-defect. */
  tag: string;
  /** Persisted short title; the authoring API accepts title and the compatibility alias gist. */
  gist: string;
  description?: string;
  status: MvFlagStatus;
  /** registry-backed fields carried verbatim (e.g. `kind` for validation-concern, `ref` for the linked issue) — a map, not baked top-level, for migration fidelity + future tags. */
  fields: Record<string, string>;
  /** the re-add-guard source-hash (the former `; key` when it is NOT an occurrence key) — lets re-generation avoid re-adding a handled flag. Distinct from `anchor.occurrenceKey`. */
  dedupKey?: string;
  anchor: MvFlagAnchor;
  createdAt: string; // ISO-8601, host-stamped
  editedAt?: string;
}

export const isOpen = (f: MvFlag): boolean => f.status !== "resolved" && f.status !== "approved";

/** A flag `id` is used verbatim as a filename segment (`<id>.json`), so it MUST be a file-safe token — no path separators,
 *  no `.`/`..`, no whitespace. Host ids are `crypto.randomUUID()` (hex+dash), which pass. A record whose id fails this is
 *  structurally invalid (→ store warning → gate blocks), NEVER trusted into a `join()` (a `../x` id would escape the store). */
export const isValidFlagId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v);

/** Coerce a stored status: Known lifecycle values are retained; unknown values (unknown/absent/malformed) ⇒ "open" — a bad
 *  status must conservatively BLOCK the gate, never clear it (mirrors the old collectFlags "absent status ⇒ open" rule). */
export function coerceFlagStatus(v: unknown): MvFlagStatus {
  return v === "resolved" || v === "fixed" || v === "approved" ? v : "open";
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Coerce one parsed record into an `MvFlag`, or `undefined` if it's structurally not a flag (missing id / tag / gist /
 *  anchor.scope|name|label). The caller (store) MUST treat an undefined as a load WARNING → gate error (never drop silently —
 *  a dropped flag is a removed blocker). Unknown `fields` values that aren't strings are dropped from the map (not fatal). */
export function coerceFlag(parsed: unknown): MvFlag | undefined {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== 1 && o.schemaVersion !== 2) return undefined;
  const id = isValidFlagId(o.id) ? o.id : undefined; // file-safe token only (a `../x` id must never reach a join())
  const tag = str(o.tag);
  const gist = typeof o.gist === "string" ? o.gist : undefined; // gist may be empty-ish? require present string
  const createdAt = str(o.createdAt);
  if (id === undefined || tag === undefined || gist === undefined || createdAt === undefined) return undefined;
  // category is workflow ownership, not gate-safety: absent ⇒ default `validation` (the common MV-origin case); but a PRESENT value
  // outside the enum is a corruption we won't silently relabel (would lose workflow ownership) ⇒ structurally invalid.
  const category: MvFlagCategory | undefined =
    o.category === undefined ? "validation" : o.category === "extraction" || o.category === "validation" ? o.category : undefined;
  if (category === undefined) return undefined;
  const rawAnchor = o.anchor;
  if (typeof rawAnchor !== "object" || rawAnchor === null || Array.isArray(rawAnchor)) return undefined;
  const a = rawAnchor as Record<string, unknown>;
  const scope = a.scope === "concept" || a.scope === "decision" || a.scope === "library" ? a.scope : undefined;
  const name = str(a.name);
  const label = typeof a.label === "string" ? a.label : undefined;
  if (scope === undefined || name === undefined || label === undefined) return undefined;
  const anchor: MvFlagAnchor = { scope, name, label };
  if (str(a.library)) anchor.library = a.library as string;
  if (str(a.entityId)) anchor.entityId = a.entityId as string;
  if (str(a.occurrenceKey)) anchor.occurrenceKey = a.occurrenceKey as string;
  const fields: Record<string, string> = {};
  if (typeof o.fields === "object" && o.fields !== null && !Array.isArray(o.fields)) {
    for (const [k, v] of Object.entries(o.fields as Record<string, unknown>)) if (typeof v === "string") fields[k] = v;
  }
  const flag: MvFlag = {
    schemaVersion: o.schemaVersion as 1 | 2,
    id,
    category,
    tag,
    gist,
    status: coerceFlagStatus(o.status),
    fields,
    anchor,
    createdAt,
  };
  if (str(o.description)) flag.description = o.description as string;
  if (str(o.dedupKey)) flag.dedupKey = o.dedupKey as string;
  if (str(o.editedAt)) flag.editedAt = o.editedAt as string;
  if (category === "extraction" && (flag.status === "fixed" || flag.status === "approved")) return undefined;
  if (flag.schemaVersion === 2 && !isQaEditFlag(flag)) return undefined;
  if (isQaEditFlag(flag)) {
    const request = coerceQaEditRequest(o.editRequest);
    if (o.schemaVersion !== 2 || !request || request.kind !== tag || category !== "validation" || qaEditFlagId(request.target) !== id) return undefined;
    flag.editRequest = request;
  } else if (o.editRequest !== undefined) return undefined;
  return flag;
}
