// #212 flags→MV slice 1 — the review-FLAG record model (PURE: no vscode, no fs; node-testable). Flags are relocating OUT of
// `.crl` meta-tags into first-class structured records under `.crl/flags/` (CRL's own metadata namespace). A flag is a
// VALIDATION FINDING — cross-step review metadata (extraction=engineering-origin, validation=MV-origin), NOT CRL content and
// NOT an MV-step content artifact. The record is SELF-DESCRIBING (it retains its original target + a human label) so it stays
// meaningful even when its anchor no longer resolves; the live anchor is for NAVIGATION, not identity (see mvFlagAnchor.ts).
//
// Conservative coercion (the gate must NEVER silently pass): a status that isn't exactly "resolved" ⇒ "open" (a malformed
// status must BLOCK, never clear); a structurally-invalid record ⇒ undefined so the STORE raises a load warning → gate error
// (never silently dropped — dropping a flag would remove a blocker). `id`/`createdAt` are HOST-injected (keeps this pure).

export type MvFlagStatus = "open" | "resolved";
/** The status lifecycle a flag SURFACE (cockpit / MCP tool) types against — an alias of `MvFlagStatus`, re-homed here from the
 *  deleted `rewriteMetaStatus` (#212 step 4) so both callers keep the `FlagStatus` name without depending on `.crl` refactors. */
export type FlagStatus = MvFlagStatus;
/** Step PROVENANCE (the review STEP it belongs to, NOT the author): `extraction` = raised at KE-authoring time; `validation` =
 *  raised at MV-review time. Not "who" — the #210 cockpit agent files `validation` flags autonomously. The concern TYPE is the
 *  `tag` (+ its `displayName` for the human MV Types); this axis stays orthogonal to it. Both are MV concerns. */
export type MvFlagCategory = "extraction" | "validation";
export type MvFlagScope = "concept" | "decision" | "library";

/** The ORIGINAL target the flag is about — ALWAYS retained (self-describing). `library` is required to resolve a
 *  concept/decision anchor safely (cross-lib same-name collisions); a resolver treats its absence as unresolvable. `entityId`
 *  = the concept `@id` when available (resolve by id first, then name+library — rename-safe). `occurrenceKey`
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
  schemaVersion: 1;
  /** stable record identity, host-generated at creation (crypto.randomUUID); INDEPENDENT of the anchor, so an orphaned flag keeps its id. */
  id: string;
  category: MvFlagCategory;
  /** the concern TYPE (the flag tag). Human MV Types (a `displayName` in flagVocab): validation-concern / narrative-defect /
   *  tooling-bug / other. AI-authoring tags: customer-confirmable / internal-inconsistency / open-fork / fidelity-defect. */
  tag: string;
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

export const isOpen = (f: MvFlag): boolean => f.status !== "resolved";

/** A flag `id` is used verbatim as a filename segment (`<id>.json`), so it MUST be a file-safe token — no path separators,
 *  no `.`/`..`, no whitespace. Host ids are `crypto.randomUUID()` (hex+dash), which pass. A record whose id fails this is
 *  structurally invalid (→ store warning → gate blocks), NEVER trusted into a `join()` (a `../x` id would escape the store). */
export const isValidFlagId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]+$/.test(v);

/** Coerce a stored status: EXACTLY "resolved" stays resolved; ANYTHING else (unknown/absent/malformed) ⇒ "open" — a bad
 *  status must conservatively BLOCK the gate, never clear it (mirrors the old collectFlags "absent status ⇒ open" rule). */
export function coerceFlagStatus(v: unknown): MvFlagStatus {
  return v === "resolved" ? "resolved" : "open";
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** Coerce one parsed record into an `MvFlag`, or `undefined` if it's structurally not a flag (missing id / tag / gist /
 *  anchor.scope|name|label). The caller (store) MUST treat an undefined as a load WARNING → gate error (never drop silently —
 *  a dropped flag is a removed blocker). Unknown `fields` values that aren't strings are dropped from the map (not fatal). */
export function coerceFlag(parsed: unknown): MvFlag | undefined {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== 1) return undefined; // unknown/absent/forward version ⇒ invalid (→ warning → gate blocks; never mis-read as v1)
  const id = isValidFlagId(o.id) ? o.id : undefined; // file-safe token only (a `../x` id must never reach a join())
  const tag = str(o.tag);
  const gist = typeof o.gist === "string" ? o.gist : undefined; // gist may be empty-ish? require present string
  const createdAt = str(o.createdAt);
  if (id === undefined || tag === undefined || gist === undefined || createdAt === undefined) return undefined;
  // category is PROVENANCE, not gate-safety: absent ⇒ default `validation` (the common MV-origin case); but a PRESENT value
  // outside the enum is a corruption we won't silently relabel (would lose extraction provenance) ⇒ structurally invalid.
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
    schemaVersion: 1,
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
  return flag;
}
