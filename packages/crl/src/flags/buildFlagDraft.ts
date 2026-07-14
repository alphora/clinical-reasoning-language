// #212 step 4 — the SINGLE seam that validates a flag draft + builds the store record. Both store-flag creators (the MCP
// `create_flag` tool AND the cockpit's commitFlagDraft) route through here, so there is ONE validation path (no drift).
// It parses `source` (to confirm the anchor target EXISTS — anchor integrity, not `.crl` splicing) and delegates field
// validation to the PURE `validateFlagFields` (flagVocab), then builds the `MvFlag` DIRECTLY (no `.crl` write, no legacy
// `FlagInstance` adapter). `createFlag` / `legacyToMvFlag` are no longer involved (deleted in 4b).
import { createHash, randomUUID } from "node:crypto";

import type { CRL } from "../ast/types";
import { buildCRL } from "../index"; // buildCRL is DEFINED in the barrel; a runtime-only call, cycle-safe (same as the old createFlag import)

import { validateFlagFields, type CreateFlagInput, type CreateFlagTarget } from "./flagVocab";
import type { MvFlag, MvFlagAnchor } from "./mvFlag";
import { isOccurrenceKey, parseOccurrenceKey } from "./occurrenceKey";

/** The failure reasons a store-flag build can surface. All `.crl`-splice-only reasons (`resolve-failed`, `invalid-result`) are
 *  gone — a JSON store has no meta slot to resolve and no document to re-validate; the only source-derived failures are a
 *  `source` that doesn't parse (`parse-failed`) and a target the source doesn't declare (`decl-not-found`). */
export type BuildFlagFailure = "unknown-tag" | "missing-field" | "invalid-value" | "decl-not-found" | "parse-failed";

export type BuildFlagResult =
  | { ok: true; flag: MvFlag }
  | { ok: false; reason: BuildFlagFailure; message: string };

/** A stable content fingerprint for retry-idempotency — an agent that retries a create after a dropped response gets the SAME
 *  dedupKey, so the caller can skip re-adding. (When the caller supplied a non-occurrence `; key` re-add-guard, that IS the
 *  dedupKey; a hash is synthesized only when there's none.) Includes `fields` (sorted) — two flags that share anchor+tag+gist
 *  but differ in a meaning-bearing field (e.g. `@fidelity-defect` `direction`, or a distinct `ref`) are DISTINCT and must NOT
 *  collapse (Claude impl review). */
function contentDedupKey(flag: MvFlag): string {
  const a = flag.anchor;
  const fields = Object.entries(flag.fields).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return "d-" + createHash("sha1").update(JSON.stringify([a.scope, a.name, a.library ?? "", a.occurrenceKey ?? "", flag.tag, flag.gist, fields])).digest("hex");
}

/** A human label that survives orphaning ("this flag was about X"). A decision-occurrence flag appends the node signature. */
function buildLabel(name: string, occurrenceKey: string | undefined): string {
  if (!occurrenceKey) return name;
  const sig = parseOccurrenceKey(occurrenceKey).signature;
  return sig ? `${name} · ${sig}` : name;
}

/** Validate a flag draft against `source` and build a complete `MvFlag` (host-injected `id`/`createdAt`, a `dedupKey` for
 *  idempotency). `id`/`now` are injectable for deterministic tests. Returns a domain failure (never throws) on invalid input. */
export function validateAndBuildMvFlagDraft(
  source: string,
  target: CreateFlagTarget,
  input: CreateFlagInput,
  id: () => string = randomUUID,
  now: () => string = () => new Date().toISOString(),
): BuildFlagResult {
  // 1. Parse the source (anchor integrity — the store can't be located / the anchor can't be confirmed without a parse).
  const parsed = buildCRL(source);
  if (!parsed.success || !parsed.result) return { ok: false, reason: "parse-failed", message: "the source did not parse" };
  const ast: CRL = parsed.result;

  // 2. Pure field validation (tag known+canonical / gist / required fields / enum / status) — no `.crl` concerns.
  const vf = validateFlagFields(input);
  if (!vf.ok) return { ok: false, reason: vf.reason, message: vf.message };

  // 3. Confirm the target declaration EXISTS and pin the anchor's library (a `.crl` declares exactly one library).
  let libraryName: string | undefined;
  if (target.kind === "library") {
    if (!ast.library || ast.library.name !== target.name) return { ok: false, reason: "decl-not-found", message: `no library "${target.name}" in this source` };
    libraryName = ast.library.name;
  } else {
    const astType = target.kind === "concept" ? "Concept" : "Decision";
    if (target.library !== undefined && ast.library?.name !== target.library) return { ok: false, reason: "decl-not-found", message: `no library "${target.library}" in this source` };
    const decl = ast.statements.find((s) => s.type === astType && (s as { name?: string }).name === target.name);
    if (!decl) return { ok: false, reason: "decl-not-found", message: `no ${target.kind} "${target.name}" in this source` };
    libraryName = ast.library?.name ?? target.library;
  }

  // 4. Build the MvFlag directly. Promote a decision-occurrence `; key` (`<nodeId>~<signature>`) to `anchor.occurrenceKey`;
  //    any OTHER supplied key is a re-add-guard source-hash → the `dedupKey`. `status`/`key` are stripped from stored fields
  //    (they live top-level / in the anchor); `ref`/`direction`/`assumption`/`chosen`/`alternatives`/`kind` ride along.
  const suppliedKey = vf.fields.key;
  const occurrenceKey = target.kind === "decision" && suppliedKey !== undefined && suppliedKey.includes("~") && isOccurrenceKey(suppliedKey) ? suppliedKey : undefined;
  const suppliedDedup = suppliedKey !== undefined && occurrenceKey === undefined ? suppliedKey : undefined;

  const anchor: MvFlagAnchor = { scope: target.kind, name: target.name, label: buildLabel(target.name, occurrenceKey) };
  if (libraryName) anchor.library = libraryName;
  if (occurrenceKey) anchor.occurrenceKey = occurrenceKey;

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(vf.fields)) if (k !== "key") fields[k] = v;

  const base: MvFlag = {
    schemaVersion: 1,
    id: "", // host-injected below
    category: vf.category, // STRICT: the tag's authoritative category (no lenient absent→validation default)
    tag: vf.canon,
    gist: vf.gist,
    status: vf.status,
    fields,
    anchor,
    createdAt: "", // host-stamped below
  };
  if (suppliedDedup) base.dedupKey = suppliedDedup;

  const dedupKey = base.dedupKey ?? contentDedupKey(base);
  return { ok: true, flag: { ...base, dedupKey, id: id(), createdAt: now() } };
}
