// Medical Validation panel persistence + derivation CORE (vscode-free, unit-tested) — roadmap #156 slice 2.
// Design authority: .vibe-tools/discussions/161-medical-validation-panel-design.md (§"Operator-settled decisions" 1-2,
// §"Architecture", §"Slice order" item 2). The shell glue (the validationMode seam, the webview, the overlay channel)
// lands in later slices; this module is the pure, testable substrate they call.
//
// Pieces, all fs/path only (NO vscode import — this is the testable core; the chrome renderer below interpolates only
// integers + fixed literals, so it stays vscode-free + HTML-escape-free):
//   - medicalValidationSidecarPath: from a .cel, locate the ONE policy-scoped sidecar (one per POLICY, not per .cel).
//   - load/save the sidecar: a corruption-tolerant read + an ATOMIC write (tmp+rename), keyed by frozen caseId.
//   - deriveReviewOverlay: the TOTAL verdict fold (leaf-aware precedence) over all REVIEWED cases → disjoint {pass, fail, pending} + error (⊆ pass).
//   - isReviewState / setReviewState: the review-state dropdown (slice 4 wires it to the webview <select> change).
//   - reviewProgress / renderProgressChrome: the slice-6 worklist progress READOUT (pure count + its tree-chrome HTML).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { findPolicySrc } from "./provenanceFindings";

// ── path helper ────────────────────────────────────────────────────────────────

/**
 * From a `.cel` path, resolve the ONE policy-scoped Medical Validation sidecar:
 * `<policySrc>/medical-validation/<policyName>.json`.
 *
 * - `<policySrc>` is reused from `findPolicySrc` (provenanceFindings.ts:46): the first ancestor named `src` that has a
 *   `provenance/` child (that one child is the actual predicate) — i.e. the policy `src/` that, by the crl-content
 *   convention, also holds `cel/` and `anchor-source/`. The new `medical-validation/` dir is a sibling of those (disc 161 §2).
 * - `<policyName>` is the basename of the POLICY DIR — the parent of `src/` (in the crl-content layout
 *   `artifacts/<policy>/src/...`, so `<policyName> === <policy>`). This is the per-policy naming the provenance machinery
 *   keys on: discoverProvenance scopes everything to `findPolicySrc(celPath)` (the policy src/), so "one artifact set per
 *   policy src/" maps 1:1 to "one sidecar per policy dir." We name the sidecar by the policy dir (NOT by a `.cel` stem)
 *   because review is policy-scoped and a policy may have multiple `.cel` clusters under `src/cel/`.
 *
 * Returns `undefined` when the `.cel` is not inside a discoverable policy `src/` (no `findPolicySrc`), or — defensively —
 * when the policy dir has no resolvable basename (a `src/` at the filesystem root).
 */
export function medicalValidationSidecarPath(celPath: string): string | undefined {
  const src = findPolicySrc(celPath);
  if (!src) return undefined;
  const policyDir = dirname(src);
  const policyName = basename(policyDir);
  if (!policyName) return undefined; // `src/` at the FS root → no policy identity to key on
  return join(src, "medical-validation", `${policyName}.json`);
}

// ── sidecar shape + IO ───────────────────────────────────────────────────────────

/** A persisted review state for a frozen case (the reviewer's VERDICT — distinct from the automated CEL run status in
 *  `CasePaint.status`, which shares the words "pass"/"fail"). ABSENCE of a caseId from `byCaseId` means "To do" — we never
 *  store the default. The four UI states are To do (unreviewed, unstored) · Pending · Pass · Fail; only `"pass"` paints the
 *  tree (see `deriveReviewOverlay`). Legacy schemaVersion-1 sidecars stored `"reviewed"`, migrated to `"pass"` on load. */
export type PersistedReviewState = "pending" | "pass" | "fail";

/** A single reviewer note on a case (the "conversation" thread). `id` addresses it for edit/delete (host-generated —
 *  `crypto.randomUUID()`); `created`/`edited` are epoch-ms (host-stamped). Single-author, so no attribution field. */
export interface Note {
  id: string;
  text: string;
  created: number;
  edited?: number;
}

/** The on-disk sidecar — one per POLICY, keyed by frozen caseId. schemaVersion 2 (v1 stored `"pending"|"reviewed"`; the
 *  load path migrates a v1 `"reviewed"` → `"pass"` and normalizes to v2). `notesByCaseId` (additive, still v2 — an older
 *  reader that predates notes simply ignores it, and THIS reader tolerates its absence) holds the per-case note thread,
 *  INDEPENDENT of the verdict (a case may have notes with no verdict and vice-versa). Stale entries (a deleted/re-frozen
 *  case whose caseId no longer appears in the model) are inert on BOTH maps: the fold finds no `perCase` row, and the notes
 *  simply round-trip untouched (never pruned — a re-frozen case must not lose its note history). */
export interface MedicalValidationSidecar {
  schemaVersion: 2;
  byCaseId: Record<string, PersistedReviewState>;
  /** Omitted when there are no notes anywhere (keeps a verdict-only sidecar byte-identical to before this feature). */
  notesByCaseId?: Record<string, Note[]>;
}

function emptySidecar(): MedicalValidationSidecar {
  return { schemaVersion: 2, byCaseId: {} };
}

/** Compose the on-disk sidecar object from the host's two in-memory maps — the SINGLE place both are married, so no save
 *  path can write one map and forget the other (the note-eraser / verdict-eraser bug). `notesByCaseId` is omitted when
 *  empty so a verdict-only policy's sidecar stays free of an empty `{}`. Every host `saveSidecar` call goes through this. */
export function composeSidecar(
  byCaseId: Record<string, PersistedReviewState>,
  notesByCaseId: Record<string, Note[]>,
): MedicalValidationSidecar {
  const sidecar: MedicalValidationSidecar = { schemaVersion: 2, byCaseId };
  if (Object.keys(notesByCaseId).length > 0) sidecar.notesByCaseId = notesByCaseId;
  return sidecar;
}

/** A load that survived a corrupt/malformed/forward-version sidecar carries a soft `warning` (the caller may surface it).
 *  A clean load (missing file or a valid v1 sidecar) omits it — absence of `warning` means "trust this." NEVER throws. */
export interface SidecarLoad {
  sidecar: MedicalValidationSidecar;
  /** Set only when the file existed but was unreadable/malformed/wrong-shape/forward-version and we degraded. */
  warning?: string;
}

function isPersistedState(v: unknown): v is PersistedReviewState {
  return v === "pending" || v === "pass" || v === "fail";
}

/** Coerce one stored value to a current persisted state, MIGRATING the legacy schemaVersion-1 `"reviewed"` → `"pass"`
 *  (v1 "reviewed" meant approved / painted-green ≡ the v2 "pass" verdict). An unknown value returns undefined (dropped on
 *  load — a partially-corrupt map keeps its valid entries). We never WRITE "reviewed" again; this is a read-path remap. */
function migratePersistedState(v: unknown): PersistedReviewState | undefined {
  if (v === "reviewed") return "pass"; // legacy v1 → v2
  return isPersistedState(v) ? v : undefined;
}

/** The two-outcome result of coercing parsed JSON. `sidecar: undefined` = not a sidecar shape at all (caller → empty +
 *  warning). Otherwise the coerced sidecar, plus an optional `warning` for a best-effort load (forward schemaVersion). */
interface CoerceResult {
  sidecar?: MedicalValidationSidecar;
  warning?: string;
}

/** Coerce one parsed note, dropping it (→ undefined) if any field is the wrong type: `id`/`text` non-empty-tolerant
 *  strings (empty text is dropped — an invisible note must not make the glyph count it), `created` a finite epoch-ms ≥ 0,
 *  `edited` (optional) likewise. Preserves the note's internal whitespace; only a wholly-empty/blank `text` is rejected. */
function coerceNote(v: unknown): Note | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id === "") return undefined;
  if (typeof o.text !== "string" || o.text.trim() === "") return undefined;
  if (typeof o.created !== "number" || !Number.isFinite(o.created) || o.created < 0) return undefined;
  const note: Note = { id: o.id, text: o.text, created: o.created };
  if (typeof o.edited === "number" && Number.isFinite(o.edited) && o.edited >= 0) note.edited = o.edited;
  return note;
}

/** Sanitize a parsed `notesByCaseId` map (mirrors `coerceSidecar`'s container discipline): absent → undefined (no notes);
 *  present-but-not-a-plain-object (incl. an array) → dropped entirely (notes gone, verdicts kept — never nuke the whole
 *  sidecar for a bad notes blob); a per-case value that isn't an array → that case dropped; within a case, malformed notes
 *  are dropped and a case whose list ends up empty is dropped (absence = no notes, mirroring the reducer invariant). Stale
 *  (orphan) caseIds are PRESERVED — coerce has no model to prune against, and a re-frozen case must keep its history. */
function coerceNotes(raw: unknown): Record<string, Note[]> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, Note[]> = {};
  for (const [caseId, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    const notes = arr.map(coerceNote).filter((n): n is Note => n !== undefined);
    if (notes.length > 0) out[caseId] = notes;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Sanitize a parsed JSON value into a MedicalValidationSidecar, dropping any caseId whose value isn't a known state (so
 *  a partially-corrupt map keeps its valid entries rather than nuking the whole review). `sidecar: undefined` on a shape
 *  that isn't a sidecar at all: not an object, byCaseId missing / non-object / an ARRAY (`["reviewed"]` would otherwise
 *  coerce to `{"0":"reviewed"}` — FIX 1). schemaVersion 1 (legacy) and 2 (current) both load natively — a v1 `"reviewed"`
 *  migrates to `"pass"` (`migratePersistedState`); any OTHER version loads BEST-EFFORT over the current states with a
 *  warning (a future v3 may redefine the set). The result normalizes to v2. */
function coerceSidecar(parsed: unknown): CoerceResult {
  if (typeof parsed !== "object" || parsed === null) return {};
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.byCaseId !== "object" || obj.byCaseId === null || Array.isArray(obj.byCaseId)) return {};
  const byCaseId: Record<string, PersistedReviewState> = {};
  for (const [caseId, v] of Object.entries(obj.byCaseId as Record<string, unknown>)) {
    const migrated = migratePersistedState(v);
    if (migrated) byCaseId[caseId] = migrated;
  }
  const notesByCaseId = coerceNotes(obj.notesByCaseId); // carried THROUGH the load (else a load→save round-trip loses notes)
  const warning =
    obj.schemaVersion !== 1 && obj.schemaVersion !== 2
      ? `sidecar schemaVersion ${JSON.stringify(obj.schemaVersion)} is not 1 or 2; loaded the known states best-effort`
      : undefined;
  const sidecar: MedicalValidationSidecar = { schemaVersion: 2, byCaseId };
  if (notesByCaseId) sidecar.notesByCaseId = notesByCaseId;
  return { sidecar, warning };
}

/** Load the sidecar. Missing file → empty (a fresh policy, no review yet). Malformed JSON / wrong shape → empty + a soft
 *  warning (a corrupt sidecar must NOT break the panel — disc 161 §2). A forward schemaVersion → best-effort + a warning.
 *  Real IO errors other than ENOENT also degrade to empty + warning (we read at panel-open; a transient read failure
 *  shouldn't crash the show-command). */
export function loadSidecar(sidecarPath: string): SidecarLoad {
  if (!existsSync(sidecarPath)) return { sidecar: emptySidecar() };
  let raw: string;
  try {
    raw = readFileSync(sidecarPath, "utf8");
  } catch (e) {
    return { sidecar: emptySidecar(), warning: `could not read ${basename(sidecarPath)}: ${msg(e)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { sidecar: emptySidecar(), warning: `malformed JSON in ${basename(sidecarPath)}: ${msg(e)}` };
  }
  const { sidecar, warning } = coerceSidecar(parsed);
  if (!sidecar) return { sidecar: emptySidecar(), warning: `unexpected shape in ${basename(sidecarPath)}; ignoring it` };
  return warning ? { sidecar, warning } : { sidecar };
}

/** Save via write-tmp-then-rename: a reader never observes a half-written FINAL file during normal operation — the
 *  same-dir `fs.renameSync` replaces the destination atomically (it overwrites an existing dest on every target OS). This
 *  is NOT power-loss/crash durable (no fsync) — it's tear-free, not corruption-proof. The tmp suffix is per-PROCESS-unique
 *  (`${path}.${pid}.tmp`) so two concurrent writers don't clobber a SHARED tmp (a deterministic `.tmp` races: A writes,
 *  B overwrites, A renames B's bytes, B's rename ENOENTs); with unique tmps the last rename onto the final path wins
 *  (acceptable — single-window is the stated boundary, disc 161 §"Architecture"). Creates the `medical-validation/`
 *  parent dir if absent. THROWS on a real IO failure — the caller (slice 3+) surfaces it user-visibly (a failed save must
 *  not be swallowed; in-memory state and disk would silently diverge). */
export function saveSidecar(sidecarPath: string, sidecar: MedicalValidationSidecar): void {
  mkdirSync(dirname(sidecarPath), { recursive: true });
  const tmp = `${sidecarPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(sidecar, null, 2) + "\n", "utf8");
  renameSync(tmp, sidecarPath);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── the precedence fold (pure) ───────────────────────────────────────────────────

/** Per-case input to the fold: the case's run STATUS + the tree nodeKeys it LIGHTS. The caller (slice 5+) builds this
 *  Map from the cockpit model — status from `scenarios`, litNodeKeys from `crlAnchorsForUnits(unitsForCase(caseId), …)`.
 *  An UNFROZEN case has no caseId so it never appears here (and never in `byCaseId`); thus only frozen cases participate. */
export interface CasePaint {
  status: "pass" | "fail" | "error";
  litNodeKeys: readonly string[];
}

/** The derived node overlay (#210 verdict painting). Three DISJOINT verdict sets — a nodeKey lit by several reviewed cases
 *  resolves to exactly one via the leaf-aware precedence (see `deriveReviewOverlay`): `pass` / `fail` / `pending`. The caller
 *  paints each with the SAME color the worklist verdict dropdown uses (pass→green, fail→red, pending→yellow). Plus `error` —
 *  the subset of `pass` (INVARIANT: `error ⊆ pass`) whose pass-verdict case's run errored; the caller paints it INSTEAD of
 *  the pass fill (error-over-pass). Slice 2 reworks error. A node lit only by unreviewed cases is in NONE. */
export interface ReviewOverlay {
  pass: Set<string>;
  fail: Set<string>;
  pending: Set<string>;
  error: Set<string>;
}

/**
 * The TOTAL verdict-painting fold (#210) — recomputed in full each time, NOT first-write-wins. Each REVIEWED case lights
 * every tree nodeKey on its fired path (`litNodeKeys`) with its VERDICT: `pass` / `fail` / `pending` (`unreviewed` paints
 * nothing). A node lit by several cases resolves to ONE verdict by the operator precedence:
 *   - PENDING always loses (a node lit pending + any decided verdict paints the decided one).
 *   - PASS vs FAIL flips on leaf-ness: on an INTERIOR node pass wins (a pass path through it dominates a fail path); on a
 *     LEAF (a disposition/outcome tip — `isLeaf(nodeKey)` true) FAIL wins (a failed outcome shows even if a pass path also
 *     reaches it). `isLeaf` is injected (the caller knows which nodeKeys are recommend-activity actions) so this stays
 *     vscode-free + fully unit-testable.
 * `error` (Slice 2 reworks it): the subset of PASS nodes (INVARIANT `error ⊆ pass` — a pass-verdict node whose run
 * `status === "error"` that DIDN'T flip to fail under precedence) the caller paints error ON TOP of pass (execution broke →
 * nothing to trust). The verdict and the run `status` are ORTHOGONAL (a pass verdict overrides a run `status:"fail"` — still
 * pass; only run `error` reddens). A pass-run-error node that ALSO resolves to fail (a leaf a fail case reached) is already
 * fail-colored, so it drops out of `error` — keeping the invariant true and avoiding a double class.
 * A caseId absent from `perCase` (stale) contributes nothing. Idempotent: multiple cases lighting one node collapse.
 */
export function deriveReviewOverlay(
  byCaseId: Record<string, PersistedReviewState>,
  perCase: ReadonlyMap<string, CasePaint>,
  isLeaf: (nodeKey: string) => boolean,
): ReviewOverlay {
  // First accumulate, per node, WHICH verdicts light it (a node lit by several reviewed cases can be pass+fail+pending). Then
  // resolve ONE verdict per node by the operator precedence: PENDING always loses; PASS vs FAIL → pass wins on INTERIOR
  // nodes, FAIL wins on a LEAF (disposition/outcome tip). `error` = the pass-verdict + run-`error` subset, then filtered ⊆ pass.
  const votes = new Map<string, { pass: boolean; fail: boolean; pending: boolean }>();
  const error = new Set<string>();
  const vote = (key: string): { pass: boolean; fail: boolean; pending: boolean } => {
    let v = votes.get(key);
    if (!v) votes.set(key, (v = { pass: false, fail: false, pending: false }));
    return v;
  };
  for (const [caseId, state] of Object.entries(byCaseId)) {
    const paint = perCase.get(caseId);
    if (!paint) continue; // stale entry (no live case) → inert
    for (const key of paint.litNodeKeys) {
      if (state === "pass") {
        vote(key).pass = true;
        if (paint.status === "error") error.add(key); // run-status error reddens even a pass verdict (Slice 2 reworks)
      } else if (state === "fail") vote(key).fail = true;
      else if (state === "pending") vote(key).pending = true; // "unreviewed" doesn't paint
    }
  }
  const pass = new Set<string>();
  const fail = new Set<string>();
  const pending = new Set<string>();
  for (const [key, v] of votes) {
    // pending always loses to a decided verdict; pass vs fail flips on a leaf.
    if (v.pass && v.fail) (isLeaf(key) ? fail : pass).add(key);
    else if (v.pass) pass.add(key);
    else if (v.fail) fail.add(key);
    else pending.add(key); // only pending lit it
  }
  // Keep `error ⊆ pass` a TRUE invariant (gpt55 impl review): a `vote(key).pass` node CAN still resolve to FAIL — a LEAF lit
  // by both a pass-run-error case (adds to `error`) AND a fail case flips to fail. Such a node is already fail-colored, so
  // drop it from `error`: the caller paints `.error-node` INSTEAD of `.review-pass`, and there is no pass fill to override on
  // a fail-resolved node. Net: `error` = exactly the pass nodes whose run errored (error-over-pass).
  const visibleError = new Set<string>();
  for (const key of error) if (pass.has(key)) visibleError.add(key);
  return { pass, fail, pending, error: visibleError };
}

/**
 * Build the `perCase` fold input (slice 5) from a set of frozen caseIds + two lookups — pure + testable, so the host's
 * `driveDoneOverlay` stays a thin glue layer. For each caseId whose `statusOf` resolves (a frozen case with a known run
 * status), emit a {status, litNodeKeys} row keyed by caseId; a caseId whose status is `undefined` (unfrozen / no
 * scenario / ambiguous-name collision) is SKIPPED — it can't paint (it never round-trips to a reviewable checkbox).
 * `litNodeKeysOf` returns the tree nodeKeys the case lights — the SAME join the cockpit reveal uses
 * (`crlAnchorsForUnits(unitsForCase(caseId), …)`); we pass it as a closure so this stays vscode-/maps-free.
 * The result feeds `deriveReviewOverlay(byCaseId, perCase, isLeaf)` (verdict fold, error ⊆ pass, stale inert).
 */
export function buildReviewPerCase(
  caseIds: Iterable<string>,
  statusOf: (caseId: string) => CasePaint["status"] | undefined,
  litNodeKeysOf: (caseId: string) => readonly string[],
): Map<string, CasePaint> {
  const perCase = new Map<string, CasePaint>();
  for (const caseId of caseIds) {
    const status = statusOf(caseId);
    if (status === undefined) continue; // unfrozen / no scenario / ambiguous — not a paintable case
    perCase.set(caseId, { status, litNodeKeys: litNodeKeysOf(caseId) });
  }
  return perCase;
}

// ── review-state dropdown ──────────────────────────────────────────────────────────

/** The full review state in the UI — `"unreviewed"` ("To do") is the default (NOT persisted; absence in the sidecar). The
 *  three persisted states are the tail of this union (assignable to `PersistedReviewState`). */
export type ReviewState = "unreviewed" | PersistedReviewState;

/** The ordered set of review states as the worklist dropdown offers them (To do → Pending → Pass → Fail). The render + the
 *  host both key off this so the option list and the validated set never drift. */
export const REVIEW_STATES: readonly ReviewState[] = ["unreviewed", "pending", "pass", "fail"];

/** Validate a value posted from the webview dropdown is a known review state — the trusted-input guard (the host must
 *  never write an arbitrary string the webview sends). */
export function isReviewState(v: unknown): v is ReviewState {
  return v === "unreviewed" || isPersistedState(v);
}

/** The pure worklist-set reducer (host-as-authority — disc 161 §"Architecture"): given the current sidecar map, the caseId,
 *  and the DROPDOWN-SELECTED state, return the NEXT map. The dropdown sets a state DIRECTLY (no cycle) — `"unreviewed"`
 *  DELETES the entry (absence = To do, we never store the default), the three verdicts are stored. Returns a NEW object
 *  (the caller swaps it in only AFTER a successful save, so a failed save keeps the prior map and disk + memory don't
 *  diverge). Pure — no IO, no vscode. Caller must pre-validate `state` with `isReviewState`. */
export function setReviewState(
  byCaseId: Record<string, PersistedReviewState>,
  caseId: string,
  state: ReviewState,
): Record<string, PersistedReviewState> {
  const out = { ...byCaseId };
  if (state === "unreviewed") delete out[caseId];
  else out[caseId] = state;
  return out;
}

// ── notes CRUD (pure reducers) ──────────────────────────────────────────────────────
// Host-as-authority: the host generates the note `id` (crypto.randomUUID) + stamps `created`/`edited` (Date.now) and passes
// them in, so these stay deterministic + unit-testable (the clock/RNG never enters the pure layer). Each returns a NEW map
// (structural copy of the touched case's array); the caller swaps it in only AFTER a successful save. Absence of a caseId =
// no notes — an emptied case's key is DELETED (mirrors the verdict invariant), so a note-free case never lingers as `[]`.

/** Append a note to a case's thread (creating the case entry if absent). `note` carries its host-supplied id + created. */
export function addNote(
  notesByCaseId: Record<string, Note[]>,
  caseId: string,
  note: Note,
): Record<string, Note[]> {
  const out = { ...notesByCaseId };
  out[caseId] = [...(out[caseId] ?? []), note];
  return out;
}

/** Replace the text of the note `noteId` in `caseId`'s thread and set its `edited` stamp. No-op (returns an equivalent new
 *  map) if the case or the note id isn't found — a stale edit against a deleted note simply does nothing. */
export function editNote(
  notesByCaseId: Record<string, Note[]>,
  caseId: string,
  noteId: string,
  text: string,
  edited: number,
): Record<string, Note[]> {
  const list = notesByCaseId[caseId];
  if (!list || !list.some((n) => n.id === noteId)) return { ...notesByCaseId };
  const out = { ...notesByCaseId };
  out[caseId] = list.map((n) => (n.id === noteId ? { ...n, text, edited } : n));
  return out;
}

/** Remove the note `noteId` from `caseId`'s thread; if that empties the thread, DELETE the case key (absence = no notes).
 *  No-op (equivalent new map) if the case/id isn't found. */
export function deleteNote(
  notesByCaseId: Record<string, Note[]>,
  caseId: string,
  noteId: string,
): Record<string, Note[]> {
  const list = notesByCaseId[caseId];
  if (!list) return { ...notesByCaseId };
  const remaining = list.filter((n) => n.id !== noteId);
  const out = { ...notesByCaseId };
  if (remaining.length > 0) out[caseId] = remaining;
  else delete out[caseId];
  return out;
}

// ── worklist progress readout (#156 slice 6) ──────────────────────────────────────

/**
 * The worklist progress readout (disc 161 §"Architecture": "Progress chrome (N/M reviewed · pending · stale) in the
 * existing tree `#fcChrome` region, mode-gated").
 *
 * - `total` = `reviewableCaseIds.length` (the frozen, NON-ambiguous cases the host passes — the SAME paintable set the
 *   done overlay uses, `scenarioByCaseId.keys()`). The host de-dupes upstream, but we normalize defensively (a duplicate
 *   id must not inflate `total`/`reviewed`/`pending`).
 * - `reviewed` / `pending` = the count of reviewable ids whose sidecar state is exactly that (absence = unreviewed, not
 *   counted in either — derive unreviewed as `total - reviewed - pending` if needed).
 * - `unreviewable` = frozen-but-ambiguous + unfrozen cases (the rows the worklist SHOWS with a disabled checkbox but that
 *   can never be reviewed — disc 161 §"Architecture": "never hidden — honesty"). The host passes the live case count so
 *   `unreviewable = totalCaseCount - total` (floored at 0). The readout surfaces this so "Reviewed N/M" can't silently
 *   drop unreviewable rows from the clinician's mental denominator.
 * - `stale` = `byCaseId` KEYS not in `reviewableCaseIds` (orphans — a deleted/re-frozen case, OR a now-AMBIGUOUS case
 *   whose persisted state can no longer round-trip to a reviewable checkbox; disc 161 §2 "Stale entries ... are inert").
 *   Counted across BOTH persisted states (a stale "pending" is just as orphaned as a stale "reviewed").
 *
 * NOT A PARTITION: `reviewed`/`pending`/`stale` count over DIFFERENT universes (reviewed/pending over live-reviewable
 * ids; stale over sidecar orphans). `reviewed + pending + stale` is deliberately NOT `total` — they answer distinct
 * questions ("how far through the reviewable worklist" vs. "how many dangling sidecar entries"). Pure, no side effects.
 */
export interface ReviewProgress {
  total: number;
  /** adjudicated = passed + failed (a case is "reviewed" once it has a verdict, pass OR fail). Kept for the "Reviewed N/M"
   *  readout; the split matters because only `passed` clears the "✓ All passed" badge. */
  reviewed: number;
  passed: number;
  failed: number;
  pending: number;
  unreviewable: number;
  stale: number;
}

export function reviewProgress(
  byCaseId: Record<string, PersistedReviewState>,
  reviewableCaseIds: readonly string[],
  totalCaseCount?: number,
): ReviewProgress {
  const reviewable = new Set(reviewableCaseIds); // de-dupe defensively (a dup id must not inflate the counts)
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const id of reviewable) {
    const s = byCaseId[id];
    if (s === "pass") passed++;
    else if (s === "fail") failed++;
    else if (s === "pending") pending++;
  }
  let stale = 0;
  for (const id of Object.keys(byCaseId)) if (!reviewable.has(id)) stale++;
  const total = reviewable.size;
  // Default the total case count to the de-duped reviewable total (→ 0 unreviewable) when the host omits it. Computed
  // AFTER dedup so a duplicate reviewable id can't make the default exceed `total` and fabricate a phantom unreviewable row.
  return { total, reviewed: passed + failed, passed, failed, pending, unreviewable: Math.max(0, (totalCaseCount ?? total) - total), stale };
}

/**
 * Render the worklist progress readout as the tree-chrome HTML line (disc 161 §"Architecture"). Pure + vscode-free so the
 * cockpit's `buildTreeChromeHtml` can call it and the test can assert the string WITHOUT bundling vscode. Only integers +
 * fixed literals are interpolated, so NO HTML escaping is needed (and none is done — keep it that way: never interpolate
 * a free-text label here without `escapeHtml`).
 *
 * - Returns "" only when there is NOTHING to say: `total===0 && stale===0 && unreviewable===0`. A `total===0` panel with
 *   stale orphans or unreviewable rows STILL renders (those counts are the only useful signal then).
 * - Fully clean (`total>0 && passed===total && pending===0 && stale===0 && unreviewable===0` — i.e. EVERY case PASSED,
 *   nothing failed/pending/stale/unreviewable) → a single "✓ All passed" DONE indicator (`.mv-progress-done`) INSTEAD of
 *   the count. Note the gate is `passed===total`, NOT `reviewed===total`: a worklist where every case is adjudicated but
 *   some FAILED is NOT "clean" — it must show the failed tally, never a green all-clear that hides failures.
 * - Otherwise: `Reviewed N/M` (N = passed+failed), then `· P pending` (P>0), `· F failed` (F>0), `· U not reviewable`
 *   (U>0), `· S stale` (S>0). When `total===0` (but stale/unreviewable>0) the leading clause reads `0 reviewable`.
 */
export function renderProgressChrome(p: ReviewProgress): string {
  if (p.total === 0 && p.stale === 0 && p.unreviewable === 0) return "";
  const clean = p.total > 0 && p.passed === p.total && p.pending === 0 && p.stale === 0 && p.unreviewable === 0;
  if (clean) return `<div class="mv-progress mv-progress-done">✓ All passed</div>`;
  const parts: string[] = [p.total > 0 ? `Reviewed ${p.reviewed}/${p.total}` : `0 reviewable`];
  if (p.pending > 0) parts.push(`${p.pending} pending`);
  if (p.failed > 0) parts.push(`${p.failed} failed`);
  if (p.unreviewable > 0) parts.push(`${p.unreviewable} not reviewable`);
  if (p.stale > 0) parts.push(`${p.stale} stale`);
  return `<div class="mv-progress">${parts.join(" · ")}</div>`;
}
