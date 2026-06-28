// Medical Validation panel persistence + derivation CORE (vscode-free, unit-tested) — roadmap #156 slice 2.
// Design authority: .vibe-tools/discussions/161-medical-validation-panel-design.md (§"Operator-settled decisions" 1-2,
// §"Architecture", §"Slice order" item 2). The shell glue (the validationMode seam, the webview, the overlay channel)
// lands in later slices; this module is the pure, testable substrate they call.
//
// Pieces, all fs/path only (NO vscode import — this is the testable core; the chrome renderer below interpolates only
// integers + fixed literals, so it stays vscode-free + HTML-escape-free):
//   - medicalValidationSidecarPath: from a .cel, locate the ONE policy-scoped sidecar (one per POLICY, not per .cel).
//   - load/save the sidecar: a corruption-tolerant read + an ATOMIC write (tmp+rename), keyed by frozen caseId.
//   - deriveReviewOverlay: the TOTAL precedence fold (error > done) over all REVIEWED cases → the {done, error} node sets.
//   - nextReviewState / applyWorklistToggle: the 3-state checkbox cycle (slice 4 wires it to the webview click).
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

/** A persisted review state for a frozen case. ABSENCE of a caseId from `byCaseId` means UNREVIEWED — we never store
 *  "unreviewed" (the sidecar holds only the two non-default states). DONE/ERROR are DERIVED on load, never stored. */
export type PersistedReviewState = "pending" | "reviewed";

/** The on-disk sidecar — one per POLICY, keyed by frozen caseId. Stale entries (a deleted/re-frozen case whose caseId no
 *  longer appears in the model) are inert: the fold simply finds no `perCase` row for them. */
export interface MedicalValidationSidecar {
  schemaVersion: 1;
  byCaseId: Record<string, PersistedReviewState>;
}

function emptySidecar(): MedicalValidationSidecar {
  return { schemaVersion: 1, byCaseId: {} };
}

/** A load that survived a corrupt/malformed/forward-version sidecar carries a soft `warning` (the caller may surface it).
 *  A clean load (missing file or a valid v1 sidecar) omits it — absence of `warning` means "trust this." NEVER throws. */
export interface SidecarLoad {
  sidecar: MedicalValidationSidecar;
  /** Set only when the file existed but was unreadable/malformed/wrong-shape/forward-version and we degraded. */
  warning?: string;
}

function isPersistedState(v: unknown): v is PersistedReviewState {
  return v === "pending" || v === "reviewed";
}

/** The two-outcome result of coercing parsed JSON. `sidecar: undefined` = not a sidecar shape at all (caller → empty +
 *  warning). Otherwise the coerced sidecar, plus an optional `warning` for a best-effort load (forward schemaVersion). */
interface CoerceResult {
  sidecar?: MedicalValidationSidecar;
  warning?: string;
}

/** Sanitize a parsed JSON value into a MedicalValidationSidecar, dropping any caseId whose value isn't a known state (so
 *  a partially-corrupt map keeps its valid entries rather than nuking the whole review). `sidecar: undefined` on a shape
 *  that isn't a sidecar at all: not an object, byCaseId missing / non-object / an ARRAY (`["reviewed"]` would otherwise
 *  coerce to `{"0":"reviewed"}` — FIX 1). A FORWARD schemaVersion (≠1) is loaded BEST-EFFORT over the known states but
 *  carries a warning — a future v2 may redefine "reviewed"/"pending", so we surface rather than silently treat it as v1. */
function coerceSidecar(parsed: unknown): CoerceResult {
  if (typeof parsed !== "object" || parsed === null) return {};
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.byCaseId !== "object" || obj.byCaseId === null || Array.isArray(obj.byCaseId)) return {};
  const byCaseId: Record<string, PersistedReviewState> = {};
  for (const [caseId, v] of Object.entries(obj.byCaseId as Record<string, unknown>))
    if (isPersistedState(v)) byCaseId[caseId] = v;
  const warning =
    obj.schemaVersion !== 1
      ? `sidecar schemaVersion ${JSON.stringify(obj.schemaVersion)} is not 1; loaded the known states best-effort`
      : undefined;
  return { sidecar: { schemaVersion: 1, byCaseId }, warning };
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

/** The derived node overlay: the union of nodeKeys that should render `.done-node`, and the subset that should render
 *  `.error-node`. Per disc 161 §1 ERROR > DONE — a nodeKey in `error` is ALSO (by construction) in `done`; the caller
 *  renders error-over-done. Lit-but-unreviewed and untouched nodes are NOT in either set (the caller derives those). */
export interface ReviewOverlay {
  done: Set<string>;
  error: Set<string>;
}

/**
 * The TOTAL precedence fold (disc 161 §1) — recomputed in full each time, NOT first-write-wins:
 *   - For each caseId with `byCaseId[caseId] === "reviewed"` (PENDING does NOT paint — skipped): union its `litNodeKeys`
 *     into `done`; if its `status === "error"`, ALSO union into `error`.
 *   - A reviewed caseId absent from `perCase` (stale — case deleted or re-frozen under a new id) contributes nothing.
 *   - error > done: a nodeKey lit by ANY reviewed-error case is in `error` (and remains in `done`); the caller renders
 *     error on top. `done` is the union over ALL reviewed cases, so a node lit by both a clean and an errored reviewed
 *     case shows error (and is done).
 * Idempotent under Set union: multiple reviewed cases lighting the same node yield one entry.
 */
export function deriveReviewOverlay(
  byCaseId: Record<string, PersistedReviewState>,
  perCase: ReadonlyMap<string, CasePaint>,
): ReviewOverlay {
  const done = new Set<string>();
  const error = new Set<string>();
  for (const [caseId, state] of Object.entries(byCaseId)) {
    if (state !== "reviewed") continue; // pending does not paint
    const paint = perCase.get(caseId);
    if (!paint) continue; // stale entry (no live case) → inert
    for (const key of paint.litNodeKeys) {
      done.add(key);
      if (paint.status === "error") error.add(key);
    }
  }
  return { done, error };
}

/**
 * Build the `perCase` fold input (slice 5) from a set of frozen caseIds + two lookups — pure + testable, so the host's
 * `driveDoneOverlay` stays a thin glue layer. For each caseId whose `statusOf` resolves (a frozen case with a known run
 * status), emit a {status, litNodeKeys} row keyed by caseId; a caseId whose status is `undefined` (unfrozen / no
 * scenario / ambiguous-name collision) is SKIPPED — it can't paint (it never round-trips to a reviewable checkbox).
 * `litNodeKeysOf` returns the tree nodeKeys the case lights — the SAME join the cockpit reveal uses
 * (`crlAnchorsForUnits(unitsForCase(caseId), …)`); we pass it as a closure so this stays vscode-/maps-free.
 * The result feeds `deriveReviewOverlay(byCaseId, perCase)` unchanged (reviewed-only, error⊆done, stale inert).
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

// ── checkbox cycle ───────────────────────────────────────────────────────────────

/** The full review state in the UI — `"unreviewed"` is the default (NOT persisted; absence in the sidecar). The two
 *  persisted states are the tail of this union (assignable to `PersistedReviewState`). */
export type ReviewState = "unreviewed" | PersistedReviewState;

/** The checkbox cycle (slice 4 wires it to the webview click): unreviewed → pending → reviewed → unreviewed. Host is the
 *  authority for the next state (the webview is not — disc 161 §"Architecture"). */
export function nextReviewState(s: ReviewState): ReviewState {
  switch (s) {
    case "unreviewed":
      return "pending";
    case "pending":
      return "reviewed";
    case "reviewed":
      return "unreviewed";
  }
}

/** The pure worklist-toggle reducer (slice 4, host-as-authority): given the current sidecar map + the caseId being
 *  toggled, return the NEXT map. Advances that case's state through the 3-state cycle (via nextReviewState); when the next
 *  state is "unreviewed" the entry is DELETED — absence = unreviewed, we never store the default (the same invariant the
 *  sidecar holds). Returns a NEW object (the caller swaps it in only AFTER a successful save, so a failed save can keep
 *  the prior map and disk + memory don't diverge). Pure — no IO, no vscode. */
export function applyWorklistToggle(
  byCaseId: Record<string, PersistedReviewState>,
  caseId: string,
): Record<string, PersistedReviewState> {
  const next = nextReviewState(byCaseId[caseId] ?? "unreviewed");
  const out = { ...byCaseId };
  if (next === "unreviewed") delete out[caseId];
  else out[caseId] = next as PersistedReviewState;
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
  reviewed: number;
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
  let reviewed = 0;
  let pending = 0;
  for (const id of reviewable) {
    const s = byCaseId[id];
    if (s === "reviewed") reviewed++;
    else if (s === "pending") pending++;
  }
  let stale = 0;
  for (const id of Object.keys(byCaseId)) if (!reviewable.has(id)) stale++;
  const total = reviewable.size;
  // Default the total case count to the de-duped reviewable total (→ 0 unreviewable) when the host omits it. Computed
  // AFTER dedup so a duplicate reviewable id can't make the default exceed `total` and fabricate a phantom unreviewable row.
  return { total, reviewed, pending, unreviewable: Math.max(0, (totalCaseCount ?? total) - total), stale };
}

/**
 * Render the worklist progress readout as the tree-chrome HTML line (disc 161 §"Architecture"). Pure + vscode-free so the
 * cockpit's `buildTreeChromeHtml` can call it and the test can assert the string WITHOUT bundling vscode. Only integers +
 * fixed literals are interpolated, so NO HTML escaping is needed (and none is done — keep it that way: never interpolate
 * a free-text label here without `escapeHtml`).
 *
 * - Returns "" only when there is NOTHING to say: `total===0 && stale===0 && unreviewable===0`. A `total===0` panel with
 *   stale orphans or unreviewable rows STILL renders (those counts are the only useful signal then).
 * - Fully clean (`total>0 && reviewed===total && pending===0 && stale===0 && unreviewable===0`) → a single
 *   "✓ All reviewed" DONE indicator (`.mv-progress-done`) INSTEAD of the count (no redundant "Reviewed N/N" beside it).
 * - Otherwise: `Reviewed N/M`, then `· P pending` (only if P>0), `· U not reviewable` (only if U>0), `· S stale` (only if
 *   S>0). When `total===0` (but stale/unreviewable>0) the leading clause reads `0 reviewable` instead of `Reviewed 0/0`.
 */
export function renderProgressChrome(p: ReviewProgress): string {
  if (p.total === 0 && p.stale === 0 && p.unreviewable === 0) return "";
  const clean = p.total > 0 && p.reviewed === p.total && p.pending === 0 && p.stale === 0 && p.unreviewable === 0;
  if (clean) return `<div class="mv-progress mv-progress-done">✓ All reviewed</div>`;
  const parts: string[] = [p.total > 0 ? `Reviewed ${p.reviewed}/${p.total}` : `0 reviewable`];
  if (p.pending > 0) parts.push(`${p.pending} pending`);
  if (p.unreviewable > 0) parts.push(`${p.unreviewable} not reviewable`);
  if (p.stale > 0) parts.push(`${p.stale} stale`);
  return `<div class="mv-progress">${parts.join(" · ")}</div>`;
}
