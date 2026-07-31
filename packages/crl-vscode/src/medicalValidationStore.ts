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
  /** #224 ii.3 Slice 2b — model-level CRITERION verdicts, keyed by criterion IDENTITY `JSON([lib,name])` (a criterion is
   *  library-local, reviewed ONCE across all its occurrences + all cases). Each entry pins the `bodyHash` the reviewer
   *  approved so an edit to the criterion body renders the verdict STALE (`criterionVerdictState`). ADDITIVE, still
   *  schemaVersion 2 (an older reader ignores it, this reader tolerates its absence — the same discipline as `notesByCaseId`).
   *  Omitted when empty (a criterion-verdict-free policy stays byte-identical). */
  criterionVerdictsByKey?: Record<string, PersistedCriterionVerdict>;
}

/** A persisted CRITERION verdict — the reviewer's judgment on whether a criterion is correctly encoded, plus the
 *  canonical `bodyHash` (from the `buildCriterionIdentities` inventory, #233 Todo 2b) of the body they approved. If the live body's hash differs (an edit) or
 *  the body is `elided`, the stored `state` is treated as STALE, never shown as the settled verdict (disc 319 [critical] 1).
 *  NOTE: `bodyHash` fingerprints the RENDERED OUTLINE expr (`hashExpr` in crl `provenance/guardOutline.ts`), NOT source
 *  text — so a formatting-only edit does NOT stale a verdict (good), and a change behind an `external`/unresolved-ref stub
 *  doesn't either (the verdict is over the body AS SHOWN; truncation is separately caught by `elided`). */
export interface PersistedCriterionVerdict {
  state: PersistedReviewState;
  bodyHash: string;
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
  criterionVerdictsByKey: Record<string, PersistedCriterionVerdict> = {},
): MedicalValidationSidecar {
  const sidecar: MedicalValidationSidecar = { schemaVersion: 2, byCaseId };
  if (Object.keys(notesByCaseId).length > 0) sidecar.notesByCaseId = notesByCaseId;
  if (Object.keys(criterionVerdictsByKey).length > 0) sidecar.criterionVerdictsByKey = criterionVerdictsByKey;
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

/** Sanitize a parsed `criterionVerdictsByKey` map (mirrors `coerceNotes`' container discipline): absent → undefined;
 *  present-but-not-a-plain-object (incl. an array) → dropped entirely (verdicts gone, cases/notes kept); a per-key value
 *  that isn't `{ state: <known>, bodyHash: <non-empty string> }` → that key dropped (a partially-corrupt map keeps its
 *  valid entries). A missing/empty bodyHash is dropped — an unfingerprinted verdict can never be checked for staleness, so
 *  it would be an un-invalidatable attestation. Stale (orphan) keys are PRESERVED; the live-vs-stored fold handles them. */
function coerceCriterionVerdicts(raw: unknown): Record<string, PersistedCriterionVerdict> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, PersistedCriterionVerdict> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    const o = v as Record<string, unknown>;
    if (!isPersistedState(o.state)) continue;
    if (typeof o.bodyHash !== "string" || o.bodyHash === "") continue;
    out[key] = { state: o.state, bodyHash: o.bodyHash };
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
  const criterionVerdictsByKey = coerceCriterionVerdicts(obj.criterionVerdictsByKey); // likewise carried through
  const warning =
    obj.schemaVersion !== 1 && obj.schemaVersion !== 2
      ? `sidecar schemaVersion ${JSON.stringify(obj.schemaVersion)} is not 1 or 2; loaded the known states best-effort`
      : undefined;
  const sidecar: MedicalValidationSidecar = { schemaVersion: 2, byCaseId };
  if (notesByCaseId) sidecar.notesByCaseId = notesByCaseId;
  if (criterionVerdictsByKey) sidecar.criterionVerdictsByKey = criterionVerdictsByKey;
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
 * The all-pass LEAF ✓ fold (#210, PURE + unit-tested). A disposition leaf earns the green ✓ iff ≥1 scenario PRODUCED it
 * AND EVERY producing scenario's verdict is `pass`. Fail-safe → SUPPRESS: a single producing scenario that is `fail`,
 * `pending`, OR `unreviewed` kills the badge (operator: "any single pending or unreviewed route or failing on any of the
 * paths to it → no checkmark"). "Produced" is the EXECUTION reach (`collectProducedActions` re-rooted to structure
 * nodeKeys) — NOT the reveal/correspondence reach, which under-reaches. An errored/blocked scenario produces NOTHING, so
 * it never appears here → the run-error disqualifier is handled by construction. CONTRACT NUANCE (Claude R2): because an
 * errored scenario produces nothing, the ✓ precisely reads "every NON-ERRORED producing route is pass". A run-errored case
 * that a clinician nonetheless marked `pass` would (had it run) reach some leaf, but contributes to none here — so it does
 * NOT suppress. This is deliberate: run-error is a SEPARATE axis (surfaced as the red `.error-node` wash), and Slice 2
 * CLOSES this edge by force-pending an errored case (→ its verdict is no longer `pass`) + a ✗ on its EXPECTED leaf.
 * `verdict` is `unreviewed` for a to-do OR an ambiguous (duplicate-name, unreviewable) case → both correctly suppress.
 * An unreached leaf (no producing scenario) is never added.
 */
export function deriveAllPassLeaves(
  scenarios: Iterable<{ producedLeafKeys: readonly string[]; verdict: ReviewState }>,
): Set<string> {
  const perLeaf = new Map<string, boolean>(); // leafKey → still-all-pass (present ⇒ ≥1 producing scenario)
  for (const sc of scenarios)
    for (const key of sc.producedLeafKeys) perLeaf.set(key, (perLeaf.get(key) ?? true) && sc.verdict === "pass");
  const out = new Set<string>();
  for (const [key, allPass] of perLeaf) if (allPass) out.add(key);
  return out;
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

// ── criterion verdicts (#224 ii.3 Slice 2b) ────────────────────────────────────────
// Model-level verdicts on a CRITERION's encoding, keyed by identity `JSON([lib,name])` (library-local, reviewed once
// across occurrences + cases). Pure reducers + derivation, mirroring the per-case verdict layer; the host holds the map
// + the live criterion facts (bodyHash + elided from the canonical `buildCriterionIdentities` inventory, #233 Todo 2b).

/** The criterion-verdict identity key — `JSON([lib,name])` (collision-proof, matches the other JSON keys here — it EQUALS
 *  `criterionKey` in guardOutline.ts, so a canonical-inventory `.get` joins directly). Exported so host + tests key identically. */
export function criterionVerdictKey(lib: string, name: string): string {
  return JSON.stringify([lib, name]);
}

/** The pure criterion-verdict reducer (host-as-authority): `unreviewed` DELETES the entry (absence = To do, never
 *  stored); a verdict stores `{ state, bodyHash }` — the live body hash at the moment of the judgment. Returns a NEW map
 *  (swapped in only after a successful save). Caller pre-validates `state` with `isReviewState`. */
export function setCriterionVerdict(
  map: Record<string, PersistedCriterionVerdict>,
  key: string,
  state: ReviewState,
  bodyHash: string,
): Record<string, PersistedCriterionVerdict> {
  const out = { ...map };
  if (state === "unreviewed") delete out[key];
  else out[key] = { state, bodyHash };
  return out;
}

/** The LIVE facts about a criterion (its canonical `bodyHash` + `elided`, from the render-independent
 *  `buildCriterionIdentities` inventory — #233 Todo 2b) the staleness fold needs. */
export interface LiveCriterion {
  bodyHash: string;
  elided: boolean;
}

/** The derived UI state of a criterion verdict: `unreviewed` (no stored verdict), one of the persisted states, or
 *  `stale` — a stored verdict whose body CHANGED since review (hash mismatch) OR whose body is `elided` (its hash can't be
 *  trusted, disc 319 review [important] 2). A `stale` verdict is NEVER shown as the settled judgment — it reads as
 *  "re-review", and it does NOT count toward the gate (so an edit to a reviewed criterion re-opens Medical Validation). */
export type CriterionVerdictUiState = "unreviewed" | PersistedReviewState | "stale";

export function criterionVerdictState(
  stored: PersistedCriterionVerdict | undefined,
  live: LiveCriterion,
): CriterionVerdictUiState {
  if (!stored) return "unreviewed";
  if (live.elided || stored.bodyHash !== live.bodyHash) return "stale";
  return stored.state;
}

// ── Bulk verdict buy-off — the pure model (the "CRL: Review verdicts…" command consumes it) ──────────────────────────
// A reviewer sets many MV verdicts at once from a multi-select checklist. This is the vscode-free half: enumerate the
// UNSETTLED items (a work QUEUE — NOT "everything that gates mvComplete": a settled FAIL still gates but is a decision,
// not a to-do, so an empty queue does NOT imply mvComplete) and compute the new verdict maps for a bulk apply. The host
// (correspondenceCockpit) persists ONCE via `persistMv` + repaints. Verdicts stay bodyHash-stamped + staleness-aware.
// The bulk `pass` is a BUY-OFF: the reviewer attests from a label (not an in-situ body) on the presumption they reviewed
// bodies in the flow — the operator-approved semantic loosening of this feature (the per-criterion right-click stays).

/** A stable, kind-tagged reference to a review item — NOT a bare string (a caseId can equal a criterionVerdictKey). */
export type ReviewItemRef = { kind: "criterion" | "case"; id: string };

/** Why a bulk selection was NOT applied. `not-live` = the criterion/case left the model since the list opened;
 *  `body-changed` = a criterion's body moved since the list opened (refuse ALL verdicts — never attest an unseen body,
 *  disc 320); `elided` = a `pass` on a criterion whose CURRENT canonical body is a `…` (can't attest what can't render). */
export type BulkSkipReason = "not-live" | "body-changed" | "elided";

/** One checklist row. A criterion carries its concurrency snapshot (`expectedBodyHash` captured at enumeration) + its
 *  passability; a case its live-ness (`live=false` ⇒ an ORPHAN — a stored verdict whose case left the reviewable set,
 *  which gates via `stale` and is clear-only). `id` is the pure setter key (criterionVerdictKey / caseId). */
export type ReviewItem =
  | {
      kind: "criterion";
      id: string;
      lib: string;
      name: string;
      label: string;
      currentState: CriterionVerdictUiState;
      expectedBodyHash: string;
      passable: boolean; // !elided — an elided criterion can't take a `pass`
    }
  | {
      kind: "case";
      id: string;
      label: string;
      currentState: ReviewState;
      live: boolean; // false ⇒ orphan (case gone; clear-only)
    };

/** A criterion gate identity as the enumerator needs it — the render-INDEPENDENT `lib`/`name`/canonical `bodyHash`/
 *  `elided` (i.e. `criterionGateIdentities` flattened to a plain shape, decoupled from the crl package's types). */
export interface GatedCriterion {
  key: string; // criterionVerdictKey(lib, name)
  lib: string;
  name: string;
  bodyHash: string;
  elided: boolean;
}

/** Enumerate the UNSETTLED review items — the checklist's contents (deterministic order: criteria in the given gate-walk
 *  order, then live cases in `liveCaseIds` order, then orphans in `reviewByCaseId` key order). Criteria with state
 *  unreviewed | pending | stale (a fresh pass/fail is settled → excluded); live cases unreviewed | pending; and every
 *  ORPHAN case verdict (a `reviewByCaseId` key not in `liveCaseIds`) — clear-only, but surfaced so the reviewer can
 *  unblock the gate it silently holds. An empty result does NOT imply `mvComplete` (a settled fail still gates). */
export function unsettledReviewItems(input: {
  criteria: readonly GatedCriterion[];
  criterionVerdicts: Record<string, PersistedCriterionVerdict>;
  liveCaseIds: readonly string[];
  reviewByCaseId: Record<string, PersistedReviewState>;
  caseLabel: (caseId: string) => string;
}): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const c of input.criteria) {
    const state = criterionVerdictState(input.criterionVerdicts[c.key], { bodyHash: c.bodyHash, elided: c.elided });
    if (state === "pass" || state === "fail") continue; // settled → nothing to buy off
    items.push({ kind: "criterion", id: c.key, lib: c.lib, name: c.name, label: c.name, currentState: state, expectedBodyHash: c.bodyHash, passable: !c.elided });
  }
  const liveSet = new Set(input.liveCaseIds);
  for (const caseId of liveSet) { // iterate the DEDUPED set (a duplicated liveCaseId must not yield a duplicate row)
    const state = input.reviewByCaseId[caseId] ?? "unreviewed";
    if (state === "pass" || state === "fail") continue;
    items.push({ kind: "case", id: caseId, label: input.caseLabel(caseId), currentState: state, live: true });
  }
  for (const caseId of Object.keys(input.reviewByCaseId)) {
    if (liveSet.has(caseId)) continue; // an orphan: a stored verdict whose case left the reviewable set (gates via `stale`)
    items.push({ kind: "case", id: caseId, label: input.caseLabel(caseId), currentState: input.reviewByCaseId[caseId], live: false });
  }
  return items;
}

/** The SHARED pure criterion-verdict update — used by BOTH the single right-click path (`applyCriterionVerdict`) and the
 *  bulk path, so the hash + elision guards live in ONE place. Refuses ALL verdicts on a body-hash mismatch (never attest a
 *  body the reviewer didn't see, disc 320); refuses a `pass` when `refusePassElided` (single: the in-situ occurrence was
 *  truncated; bulk: the CURRENT canonical body is elided). `changed` = whether the STORED verdict actually moved. */
export type CriterionVerdictUpdate =
  | { ok: true; map: Record<string, PersistedCriterionVerdict>; changed: boolean }
  | { ok: false; reason: BulkSkipReason };
export function computeCriterionVerdictUpdate(
  map: Record<string, PersistedCriterionVerdict>,
  key: string,
  verdict: ReviewState,
  expectedBodyHash: string,
  live: LiveCriterion | undefined,
  refusePassElided: boolean,
): CriterionVerdictUpdate {
  if (!live) return { ok: false, reason: "not-live" };
  if (expectedBodyHash !== live.bodyHash) return { ok: false, reason: "body-changed" }; // refuse ALL (precedes the value check)
  if (verdict === "pass" && refusePassElided) return { ok: false, reason: "elided" };
  const prev = map[key];
  const next = setCriterionVerdict(map, key, verdict, live.bodyHash);
  const changed = verdict === "unreviewed" ? prev !== undefined : prev?.state !== verdict || prev?.bodyHash !== live.bodyHash;
  return { ok: true, map: next, changed };
}

export interface BulkVerdictResult {
  criterionVerdicts: Record<string, PersistedCriterionVerdict>;
  reviewByCaseId: Record<string, PersistedReviewState>;
  applied: ReviewItemRef[];
  skipped: { ref: ReviewItemRef; reason: BulkSkipReason }[];
  changed: number; // how many items' STORED verdict actually moved (the host uses it to decide persist + messaging)
}

/** Apply one `verdict` to a SELECTED set of review items — BEST EFFORT: eligible items applied, ineligible returned in
 *  `skipped[]`. Re-validates against the LIVE model at apply time (not the enumeration snapshot): a criterion absent /
 *  body-moved / (for a pass) currently elided is skipped; a case verdict on a non-live case is skipped UNLESS it's a
 *  clear (`unreviewed` deletes an orphan). Deduped by (kind,id). PURE — the caller persists ONCE + repaints.
 *
 *  ⚠ The host MUST pass the SAME live sets the queue was enumerated from + `mvComplete` gates on, or single/bulk drift:
 *    - `liveCriteria` = the GATE set (`criterionGateIdentities` / `buildLiveCriterionIdentities`), NOT the full declared
 *      inventory — so `not-live` means "left the gate", matching `unsettledReviewItems`/`criterionProgress`.
 *    - `liveCaseIds` = the REVIEWABLE frozen cases (`scenarioByCaseId` keys, ≡ `reviewProgress`'s set) — passing anything
 *      broader (unreviewable / ambiguous cases) would let a verdict be written that `reviewProgress` then counts as a
 *      gate-blocking `stale` orphan: the one way bulk could WORSEN the gate it clears.
 *  `applied[]` includes value-level NO-OPS (re-applying the stored verdict); the host messages from `changed` (actual
 *  mutations), NOT `applied.length`. A criterion whose declaration is GONE is refused for EVERY verdict incl. `unreviewed`
 *  (asymmetric with the case-orphan clear) — deliberate: a deleted criterion doesn't gate (`criterionProgress` tallies
 *  live identities only) and its stored verdict revives correctly if the criterion returns with the same body. */
export function applyBulkVerdict(
  selected: readonly ReviewItem[],
  verdict: ReviewState,
  ctx: {
    criterionVerdicts: Record<string, PersistedCriterionVerdict>;
    reviewByCaseId: Record<string, PersistedReviewState>;
    liveCriteria: ReadonlyMap<string, LiveCriterion>; // the GATE set (see above), NOT the full declared inventory
    liveCaseIds: ReadonlySet<string>; // the REVIEWABLE frozen cases (scenarioByCaseId keys), see above
  },
): BulkVerdictResult {
  let criterionVerdicts = ctx.criterionVerdicts;
  let reviewByCaseId = ctx.reviewByCaseId;
  const applied: ReviewItemRef[] = [];
  const skipped: { ref: ReviewItemRef; reason: BulkSkipReason }[] = [];
  let changed = 0;
  const seen = new Set<string>();
  for (const item of selected) {
    const dedupKey = JSON.stringify([item.kind, item.id]);
    if (seen.has(dedupKey)) continue; // dedup by (kind,id), first-selection order
    seen.add(dedupKey);
    const ref: ReviewItemRef = { kind: item.kind, id: item.id };
    if (item.kind === "criterion") {
      const live = ctx.liveCriteria.get(item.id);
      const upd = computeCriterionVerdictUpdate(criterionVerdicts, item.id, verdict, item.expectedBodyHash, live, live?.elided ?? false);
      if (!upd.ok) {
        skipped.push({ ref, reason: upd.reason });
        continue;
      }
      criterionVerdicts = upd.map;
      applied.push(ref);
      if (upd.changed) changed++;
    } else {
      if (verdict !== "unreviewed" && !ctx.liveCaseIds.has(item.id)) {
        skipped.push({ ref, reason: "not-live" }); // a verdict on a vanished case would MINT a gate-blocking orphan
        continue;
      }
      const prev = reviewByCaseId[item.id];
      reviewByCaseId = setReviewState(reviewByCaseId, item.id, verdict); // "unreviewed" clears (allowed for an orphan)
      applied.push(ref);
      if (verdict === "unreviewed" ? prev !== undefined : prev !== verdict) changed++;
    }
  }
  return { criterionVerdicts, reviewByCaseId, applied, skipped, changed };
}

/** A grid ROW's presentation model — a `ReviewItem` projected for `reviewGridHtml`: the current-state CHIP text, which of
 *  the 4 columns (To do / Pending / Pass / Fail) the reviewer MAY pick (per the model's apply rules), and a hint. NO
 *  pre-selection: an empty row means "leave unchanged"; an assignment is a row the reviewer EXPLICITLY picked. `(kind,id)`
 *  is the stable ref the host resolves an assignment back to its captured `ReviewItem` (which carries `expectedBodyHash`). */
export interface ReviewGridRow {
  kind: "criterion" | "case";
  id: string;
  label: string;
  lib?: string; // criterion library — names are library-local, so the row disambiguates by lib
  currentLabel: string; // the current-state chip ("To do" | "Pending" | "Pass" | "Fail" | "Stale" [+ " (orphaned)"])
  enabled: { unreviewed: boolean; pending: boolean; pass: boolean; fail: boolean }; // which columns the reviewer may pick
  hint?: string; // "truncated — can't mark Pass" | "orphaned — case no longer in the policy (clear only)"
}

const GRID_STATE_LABEL: Record<CriterionVerdictUiState, string> = {
  unreviewed: "To do",
  pending: "Pending",
  pass: "Pass",
  fail: "Fail",
  stale: "Stale",
};

/** Project the unsettled items into grid rows — cell enablement per the model's apply rules (an elided criterion can't
 *  take Pass; an orphan case is clear-only; everything else all four), the current-state chip, and lib/hints. */
export function reviewGridViewModel(items: readonly ReviewItem[]): ReviewGridRow[] {
  return items.map((it): ReviewGridRow => {
    if (it.kind === "criterion") {
      return {
        kind: "criterion",
        id: it.id,
        label: it.name,
        lib: it.lib,
        currentLabel: GRID_STATE_LABEL[it.currentState],
        enabled: { unreviewed: true, pending: true, pass: it.passable, fail: true },
        ...(it.passable ? {} : { hint: "truncated — can't mark Pass" }),
      };
    }
    return {
      kind: "case",
      id: it.id,
      label: it.label,
      currentLabel: GRID_STATE_LABEL[it.currentState] + (it.live ? "" : " (orphaned)"),
      enabled: it.live
        ? { unreviewed: true, pending: true, pass: true, fail: true }
        : { unreviewed: true, pending: false, pass: false, fail: false }, // orphan → clear-only
      ...(it.live ? {} : { hint: "orphaned — case no longer in the policy (clear only)" }),
    };
  });
}

/** Resolve + apply a grid's per-row assignments — the pure host-side seam (the WEBVIEW IS UNTRUSTED). Each `{kind,id,state}`
 *  is validated (`isReviewState`), resolved against the host's OWN captured `items` snapshot by `(kind,id)` — so the captured
 *  `expectedBodyHash` is used, NEVER a webview-supplied one — and DEDUPED by `(kind,id)` across the WHOLE array (first wins)
 *  BEFORE grouping. That last part is load-bearing: `applyBulkVerdict` dedups only WITHIN one call, and this folds one call
 *  PER target state (threading the maps), so a duplicate across two state-groups would otherwise be applied twice (later
 *  group wins, `changed` inflates). Unknown / kind-mismatched / invalid-state rows are dropped. */
export function applyGridAssignments(
  assignments: unknown, // the RAW webview payload — this seam owns the whole boundary (a non-array / null / primitive entry is dropped, never thrown on)
  items: readonly ReviewItem[],
  ctx: {
    criterionVerdicts: Record<string, PersistedCriterionVerdict>;
    reviewByCaseId: Record<string, PersistedReviewState>;
    liveCriteria: ReadonlyMap<string, LiveCriterion>;
    liveCaseIds: ReadonlySet<string>;
  },
): BulkVerdictResult {
  const byRef = new Map<string, ReviewItem>();
  for (const it of items) byRef.set(JSON.stringify([it.kind, it.id]), it); // assumes UNIQUE items (unsettledReviewItems dedups); last-wins if a future enumerator ever emits a dup
  const seen = new Set<string>();
  const groups = new Map<ReviewState, ReviewItem[]>();
  const list = Array.isArray(assignments) ? assignments : []; // a non-array payload is dropped wholesale (untrusted)
  for (const a of list) {
    if (typeof a !== "object" || a === null) continue; // drop null / primitive entries BEFORE any field access
    const { kind, id, state } = a as { kind?: unknown; id?: unknown; state?: unknown };
    if (!isReviewState(state)) continue; // untrusted-input guard
    if ((kind !== "criterion" && kind !== "case") || typeof id !== "string") continue;
    const rk = JSON.stringify([kind, id]);
    const item = byRef.get(rk); // resolve to the CAPTURED item (kind must match too)
    if (!item || seen.has(rk)) continue;
    seen.add(rk);
    const g = groups.get(state) ?? [];
    g.push(item);
    groups.set(state, g);
  }
  let criterionVerdicts = ctx.criterionVerdicts;
  let reviewByCaseId = ctx.reviewByCaseId;
  const applied: ReviewItemRef[] = [];
  const skipped: { ref: ReviewItemRef; reason: BulkSkipReason }[] = [];
  let changed = 0;
  for (const [state, groupItems] of groups) {
    const r = applyBulkVerdict(groupItems, state, { criterionVerdicts, reviewByCaseId, liveCriteria: ctx.liveCriteria, liveCaseIds: ctx.liveCaseIds });
    criterionVerdicts = r.criterionVerdicts; // thread the maps through each state-group
    reviewByCaseId = r.reviewByCaseId;
    applied.push(...r.applied);
    skipped.push(...r.skipped);
    changed += r.changed;
  }
  return { criterionVerdicts, reviewByCaseId, applied, skipped, changed };
}

/** The criterion-review progress readout — tallied over the LIVE rendered single-criterion identities (deduped by key;
 *  N occurrences of one criterion = ONE identity). `passed` counts only FRESH passes (a stale-or-changed pass is NOT
 *  passed — it's `stale`). Mirrors `ReviewProgress`'s shape; `total = identities.size`.
 *
 *  SCOPE (#233 Todo 2b): the identities are the CANONICAL per-declaration inventory (`buildCriterionIdentities`) — EVERY
 *  declared criterion the covered libraries reference, render-independent. A criterion referenced ONLY in a compound/nested
 *  position (`when A and criterion C`), or under a collapsed ancestor, is STILL tallied here → it gates `mvComplete` (the
 *  morbid-obesity 2→6 growth). A criterion whose CANONICAL body is elided is permanently un-passable (`criterionVerdictState`
 *  → stale) — gate-livelock BY DESIGN ("can't attest what can't be rendered", disc 327 pt 2). One identity per (lib,name). */
export interface CriterionProgress {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  stale: number;
  unreviewed: number;
  /** #233 Todo 2b: how many gated criteria have an ELIDED canonical body — permanently un-passable (a pass immediately
   *  reads stale, `mvComplete` can never clear on them). OVERLAPS `unreviewed`/`stale` (an elided criterion is one of those
   *  by verdict state); a SEPARATE informational count so the chrome can name WHY the gate is stuck ("cannot complete"),
   *  instead of an undifferentiated "N/M" the reviewer chases forever (gpt56 disc 330 [important]). */
  truncated: number;
}

export function criterionProgress(
  identities: ReadonlyMap<string, LiveCriterion>,
  map: Record<string, PersistedCriterionVerdict>,
): CriterionProgress {
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let stale = 0;
  let unreviewed = 0;
  let truncated = 0;
  for (const [key, live] of identities) {
    if (live.elided) truncated++; // informational overlay (an elided criterion is also unreviewed-or-stale by state)
    const s = criterionVerdictState(map[key], live);
    if (s === "pass") passed++;
    else if (s === "fail") failed++;
    else if (s === "pending") pending++;
    else if (s === "stale") stale++;
    else unreviewed++;
  }
  return { total: identities.size, passed, failed, pending, stale, unreviewed, truncated };
}

/** The criteria-half "clean" predicate — EVERY rendered criterion is a FRESH pass (or there are none). A policy with no
 *  criteria is trivially clean (`total===0 ⇒ passed===total===0`); a stale/failed/pending/unreviewed criterion blocks it. */
export function mvCriteriaClean(cp: CriterionProgress): boolean {
  return cp.passed === cp.total;
}

/**
 * Render the criteria-half readout as tree-chrome HTML (pure, vscode-free, integers + fixed literals only — no escaping).
 * "" when there are no criteria (nothing to say). Fully clean (every criterion a fresh pass) → "✓ criteria reviewed".
 * Otherwise "Criteria N/M" (N = fresh passes) + `· F encoding wrong` (F>0) + `· P undecided` (P>0) + `· S stale` (S>0).
 */
export function renderCriterionChrome(cp: CriterionProgress): string {
  if (cp.total === 0) return "";
  if (mvCriteriaClean(cp)) return `<div class="mv-criteria mv-criteria-done">✓ criteria reviewed</div>`;
  const parts: string[] = [`Criteria ${cp.passed}/${cp.total}`];
  if (cp.failed > 0) parts.push(`${cp.failed} encoding wrong`);
  if (cp.pending > 0) parts.push(`${cp.pending} undecided`);
  if (cp.stale > 0) parts.push(`${cp.stale} stale`);
  // #233 Todo 2b: an elided-canonical criterion is permanently un-passable — name it as the blocker so the reviewer knows
  // the gate cannot clear (not an undifferentiated N/M they chase). "cannot complete" makes the by-design livelock legible.
  if (cp.truncated > 0) parts.push(`${cp.truncated} truncated — cannot complete`);
  return `<div class="mv-criteria">${parts.join(" · ")}</div>`;
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
/** The cases-half "clean" predicate — EVERY reviewable case passed, nothing pending/failed/stale/unreviewable (and at
 *  least one case exists). Exported so the flag-aware mvComplete gate ANDs it with `openFlags===0` at the DISPLAY level
 *  WITHOUT the flag data ever entering `ReviewProgress` (the two halves refresh on independent channels — #203 Todo 4). */
export function mvCasesClean(p: ReviewProgress): boolean {
  return p.total > 0 && p.passed === p.total && p.pending === 0 && p.stale === 0 && p.unreviewable === 0;
}

export function renderProgressChrome(p: ReviewProgress): string {
  if (p.total === 0 && p.stale === 0 && p.unreviewable === 0) return "";
  const clean = mvCasesClean(p);
  if (clean) return `<div class="mv-progress mv-progress-done">✓ All passed</div>`;
  const parts: string[] = [p.total > 0 ? `Reviewed ${p.reviewed}/${p.total}` : `0 reviewable`];
  if (p.pending > 0) parts.push(`${p.pending} pending`);
  if (p.failed > 0) parts.push(`${p.failed} failed`);
  if (p.unreviewable > 0) parts.push(`${p.unreviewable} not reviewable`);
  if (p.stale > 0) parts.push(`${p.stale} stale`);
  return `<div class="mv-progress">${parts.join(" · ")}</div>`;
}

// ── flag readout + the mvComplete gate (#203 Todo 4) ─────────────────────────────────
// The FLAGS half of Medical Validation completeness. Independent of `reviewProgress` (the CASES half) — the two refresh
// on separate channels (verdicts ← sidecar; flag status ← the `.crl`), so they are composed only at the DISPLAY level
// here, never coupled in data (reviewers R1, disc 223). `mvComplete = mvCasesClean(p) ∧ openFlags===0` — surfaced as a
// single "✓ Medical validation complete" line when BOTH halves are clean; otherwise each half shows what's blocking.

/** The tree-chrome flag counts. `error` = a `.crl` that couldn't be parsed → the flag state is UNKNOWN, so the gate is
 *  conservatively NOT complete (mvComplete must never silently pass on an unreadable source — reviewers R1). */
export interface FlagChrome {
  open: number;
  resolved: number;
  error: boolean;
}

/** True only when every case passed AND there are no open flags AND the flags loaded cleanly AND every rendered criterion
 *  is a fresh pass — the surfaced MV gate. `cp` is optional for back-compat; ABSENT ⇒ no criteria to gate on (clean). The
 *  three halves refresh on independent channels (verdicts ← sidecar; flags ← the `.crl`; criteria ← sidecar + live render)
 *  and are composed only here at the display level (#224 ii.3 Slice 2b — operator-confirmed the criteria gate). */
export function mvComplete(p: ReviewProgress, f: FlagChrome, cp?: CriterionProgress): boolean {
  return mvCasesClean(p) && !f.error && f.open === 0 && (cp === undefined || mvCriteriaClean(cp));
}

/**
 * Render the flags-half readout as tree-chrome HTML (pure, vscode-free — like `renderProgressChrome`). Only integers +
 * fixed literals are interpolated (NO free text → no escaping needed; keep it that way). The `data-mv-flags` hook makes
 * the readout clickable → the host opens the flag list (mirrors the `data-fc-*` chrome-click channel).
 *
 * - `error` (a source — a `.crl` that failed to parse, OR a corrupt flag-store record) → `⚠ flags unreadable` (blocks the gate).
 * - `open > 0` → `⚑ N open flag(s)` (blocks the gate).
 * - `open === 0 && resolved > 0` → `✓ flags clear` (all resolved — a positive all-clear; still clickable to reopen).
 * - no flags at all (`open===0 && resolved===0`) → "" (nothing to say, like the progress readout).
 */
export function renderFlagChrome(f: FlagChrome): string {
  if (f.error) return `<div class="mv-flags mv-flags-error" data-mv-flags title="Flag state is unknown — a policy .crl could not be parsed, or a stored flag record is unreadable or invalid">⚠ flags unreadable</div>`;
  if (f.open > 0) {
    const label = f.open === 1 ? "1 open flag" : `${f.open} open flags`;
    return `<div class="mv-flags mv-flags-open" data-mv-flags title="Open review flags block Medical Validation completion — click to review">⚑ ${label}</div>`;
  }
  if (f.resolved > 0) return `<div class="mv-flags mv-flags-clear" data-mv-flags title="All review flags resolved — click to review or reopen">✓ flags clear</div>`;
  return "";
}
