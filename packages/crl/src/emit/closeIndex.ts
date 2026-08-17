// #189 Slice C 2b.0 — the §4.5 closure metadata index + public-reference routing map.
//
// The totality proof runs at CLOSURE level (not per-library — a façade's composite operand lives in the
// sibling Inferred library). Two structures, both PROJECTIONS of the aggregated per-library ledger entries
// surfaced through `PerLibraryEmit.ledgerEntries`:
//
//   • the METADATA INDEX (`lookup`) — given an EMITTED identity `{libraryIdentity, defineName}`, its entry
//     (result / visibility / discharge). Keyed by BOTH library and name, so the LocalSource `source-impl`
//     twin and the Inferred public determination (same authored name) resolve to DISTINCT entries.
//   • the PUBLIC-REFERENCE ROUTING MAP (`route`) — given a CRL public reference `{sourceLibraryName,
//     publicName}`, the EMITTED identity it denotes. Only `visibility === "public"` entries are routing
//     targets: the Inferred determination is public and its LocalSource/Records `impl` twins + Interface
//     `facade` are NOT candidates, which is exactly the `buildNameLayerMaps` "Inferred wins" public-name
//     winner rule. "Ambiguous" is reserved for a `{source, name}` that STILL has ≥2 public candidates after
//     that filter (never a both-rep concept, whose impl twin is filtered out).
//
// The resolver (`makeClosureOperandResolver`) turns a composition operand into its emitted identity across the
// three ref key-spaces (§4.5): (a) a ref that already denotes an enrolled emitted identity — a RENDERED
// qualified façade operand OR a bare ref into its own emitted library; (b) a bare ref whose `fromLibrary` is a
// rendered layer identity that is not its own target → map `fromLibrary`→source, then route; (c) a raw
// qualified authored ref → resolve its library token to a source (via the injected scope resolver), then
// route. A miss at every key-space returns a SENTINEL identity that is never enrolled, so the fixed-point
// prover treats the composite as not-total and records a `ProofFailure` — FAIL-CLOSED with no throw and no
// `ProofFailure` loosening (the resolver never aborts the closure proof).

import type {
  EmittedDefineEntry,
  EmittedDefineHeader,
  OperandResolver,
  ProofFailure,
  ProofResult,
} from "./booleanTotality";
import { proveWholeBoundaryTotality, extractEmittedDefineHeaders, nodeLocallyTotal } from "./booleanTotality";

/** An EMITTED define identity — the RENDERED library + the define name. */
export type DefineIdentity = { library: string; name: string };

const keyOf = (library: string, name: string): string => JSON.stringify([library, name]);

/** The library token a miss-sentinel identity carries. It is never a real emitted library, so a sentinel is
 *  never in the metadata index — the prover's `byKey` miss makes the composite fail-closed. */
export const UNRESOLVED_LIBRARY = "«-unresolved-operand-»";

/** A sentinel identity for an operand no key-space could route. `detail` carries the miss for diagnostics. */
export const unresolvedIdentity = (detail: string): DefineIdentity => ({ library: UNRESOLVED_LIBRARY, name: detail });

/** One emitted CQL library's contribution to the closure index. */
export type LibraryLedger = {
  /** the RENDERED emitted library identity (`PerLibraryEmit.libraryName`). */
  libraryIdentity: string;
  /** the ORIGINAL CRL `library "<name>"` this entry was emitted from (`PerLibraryEmit.sourceLibraryName`). */
  sourceLibraryName: string;
  /** the emitted CQL text — for the completeness cross-check's emitted-header extraction. */
  cql: string;
  entries: readonly EmittedDefineEntry[];
};

export type RouteResult =
  | { kind: "resolved"; id: DefineIdentity }
  | { kind: "missing" }
  | { kind: "ambiguous"; candidates: readonly DefineIdentity[] };

export type ClosureIndex = {
  /** metadata: given an emitted identity, its entry (or `undefined`). */
  lookup(id: DefineIdentity): EmittedDefineEntry | undefined;
  /** every enrolled entry across the closure — the proof subject. */
  entries(): readonly EmittedDefineEntry[];
  /** route a CRL public reference `{sourceLibraryName, publicName}` to its emitted public identity. */
  route(sourceLibraryName: string, publicName: string): RouteResult;
  /** the source library an emitted identity was produced from (key-space (b)). */
  sourceOf(libraryIdentity: string): string | undefined;
};

/** Build the closure index + routing map as a pure projection of the aggregated per-library ledgers. Catalog
 *  libraries (`isSharedCatalog`) are OUTSIDE the subject set — the caller passes policy-library ledgers only. */
export function buildClosureIndex(ledgers: readonly LibraryLedger[]): ClosureIndex {
  const meta = new Map<string, EmittedDefineEntry>();
  const all: EmittedDefineEntry[] = [];
  const libToSource = new Map<string, string>();
  const routeCandidates = new Map<string, DefineIdentity[]>();
  for (const led of ledgers) {
    libToSource.set(led.libraryIdentity, led.sourceLibraryName);
    for (const e of led.entries) {
      meta.set(keyOf(e.library, e.name), e);
      all.push(e);
      // Winner rule: only PUBLIC entries are routing targets (impl twins + façades excluded).
      if (e.visibility === "public") {
        const rk = keyOf(led.sourceLibraryName, e.name);
        const arr = routeCandidates.get(rk);
        if (arr) arr.push({ library: e.library, name: e.name });
        else routeCandidates.set(rk, [{ library: e.library, name: e.name }]);
      }
    }
  }
  return {
    lookup: (id) => meta.get(keyOf(id.library, id.name)),
    entries: () => all,
    sourceOf: (lib) => libToSource.get(lib),
    route: (source, name) => {
      const cands = routeCandidates.get(keyOf(source, name));
      if (cands === undefined || cands.length === 0) return { kind: "missing" };
      if (cands.length === 1) return { kind: "resolved", id: cands[0] };
      return { kind: "ambiguous", candidates: cands };
    },
  };
}

/**
 * The closure-level `OperandResolver` (§4.5), routing-first-then-metadata across the three ref key-spaces.
 * `resolveRawLibrary(fromLibrary, rawLibraryName)` resolves a raw qualified ref's LIBRARY token to a source
 * library name using the referring source's scope (`lookupKnownLibrary` — the `local-package-same-name`
 * ambiguity). When omitted, key-space (c) falls back to treating the qualified library token AS a source name
 * (correct when a ref names its target source directly). A miss at every key-space returns a sentinel
 * identity — the prover fails the composite closed rather than the resolver throwing.
 */
export function makeClosureOperandResolver(
  index: ClosureIndex,
  resolveRawLibrary?: (fromLibrary: string, rawLibraryName: string) => string | undefined,
): OperandResolver {
  const routeOr = (source: string, name: string, detail: string): DefineIdentity => {
    const r = index.route(source, name);
    return r.kind === "resolved" ? r.id : unresolvedIdentity(`${detail} [${r.kind}]`);
  };
  return (fromLibrary, ref) => {
    if (typeof ref !== "string") {
      // (c) A raw qualified authored ref: the referring source's SCOPE is AUTHORITATIVE and consulted FIRST
      // (code review #5). A raw library token can coincide with an unrelated emitted identity (the
      // `local-package-same-name` collision), so trying a direct index hit first would silently mis-resolve;
      // when the scope resolver answers, route by the resolved source. (2b.0 exercises this seam with an
      // injected resolver; 2b.3 wires the production `resolveRawLibrary` from `buildLibraryScopes` /
      // `lookupKnownLibrary`.)
      const scoped = resolveRawLibrary?.(fromLibrary, ref.libraryName);
      if (scoped !== undefined) return routeOr(scoped, ref.name, `${ref.libraryName}.${ref.name}`);
      // (a) A ref that ALREADY denotes an enrolled emitted identity — a RENDERED façade operand (a rendered
      // layer identity the scope resolver has no answer for, so this is its path).
      if (index.lookup({ library: ref.libraryName, name: ref.name }) !== undefined) {
        return { library: ref.libraryName, name: ref.name };
      }
      // No scope answer and not a direct identity → treat the qualified token AS a source name (the
      // no-resolver default), else fail-closed.
      return routeOr(ref.libraryName, ref.name, `${ref.libraryName}.${ref.name}`);
    }
    // (a) bare ref into its own emitted library?
    if (index.lookup({ library: fromLibrary, name: ref }) !== undefined) {
      return { library: fromLibrary, name: ref };
    }
    // (b) bare ref → map `fromLibrary`→source, then route.
    const source = index.sourceOf(fromLibrary);
    if (source === undefined) return unresolvedIdentity(`${ref} from ${fromLibrary} [no-source]`);
    return routeOr(source, ref, `${ref} from ${fromLibrary}`);
  };
}

/**
 * The CLOSURE-level totality REPORT (§4.5 / 2b.0). Builds the index + routing over the policy-library ledgers,
 * wires the closure `OperandResolver`, and runs `proveWholeBoundaryTotality` in REPORT mode — the completeness
 * cross-check runs over the policy libraries' emitted headers (catalog libraries are excluded by the caller,
 * else every catalog define reports `uncovered`). 2b.0 introduces this call in REPORT mode so the resolver +
 * routing are exercised over a real closure BEFORE 2b.4 makes the gate HARD.
 */
export function reportClosureTotality(
  ledgers: readonly LibraryLedger[],
  resolveRawLibrary?: (fromLibrary: string, rawLibraryName: string) => string | undefined,
): ProofResult {
  const index = buildClosureIndex(ledgers);
  const resolver = makeClosureOperandResolver(index, resolveRawLibrary);
  const headers = ledgers.flatMap((l) => extractEmittedDefineHeaders(l.cql, l.libraryIdentity));
  return proveWholeBoundaryTotality(index.entries(), headers, resolver);
}

// ===========================================================================
// #189 Slice C 2b.4a — the HARD boundary-totality gate (ENFORCE mode)
// ===========================================================================
//
// The gate turns the closure totality proof from a test-only REPORT into a production emit failure: a
// blocking finding makes emit `success:false`. Its result is a DISCRIMINATED structure, NOT a bare
// `ProofFailure[]` (disc 454, both arms) — the proof surfaces FOUR independently-blocking families
// (`failures` / `unclassified` / `uncovered` / `orphanEntries`), and the gate adds two producer-integrity
// checks (missing metadata, `in-place` obligation source). A bare array would silently drop the completeness
// and producer surfaces — worse than the current test-only report.
//
// SCOPE (disc 454 §4): three still-live non-total boolean FORMS are REPORTED, not failed — each an entry
// carrying a FORM-KEYED `stagingExclusion` code (set at its producing branch), with a named death point. The
// scope is INTENTIONAL staging: it shrinks to empty as 2c/2e/2b.4b land (a T7-blocking condition, §6). Coverage
// and producer-integrity findings are NEVER eligible for a staging exemption — they are lane-independent
// producer bugs, exactly what the gate exists to catch.

/** One finding from the enforce gate. `proof-failure`/`unclassified` reference an enrolled boolean subject;
 *  `uncovered-define`/`orphan-entry` are completeness holes; `missing-metadata`/`unverified-obligation-source`
 *  are producer-integrity defects. */
export type ClosureGateFinding =
  | { kind: "proof-failure"; failure: ProofFailure }
  | { kind: "unclassified"; failure: ProofFailure }
  | { kind: "uncovered-define"; header: EmittedDefineHeader }
  | { kind: "orphan-entry"; header: EmittedDefineHeader }
  | { kind: "missing-metadata"; library: string; name: string; field: "result" | "visibility" | "obligationSource" }
  | { kind: "unverified-obligation-source"; library: string; name: string };

/** The enforce gate's result. `blocking` fails emit; `excluded` is REPORT-only (staging-exempt live forms +
 *  the proof's inherently-incomplete `unclassified`). `proof` is the raw `ProofResult` for the report surface. */
export type ClosureGateResult = {
  blocking: ClosureGateFinding[];
  excluded: ClosureGateFinding[];
  proof: ProofResult;
};

const BOOLEAN_RESULT_TYPE = "Boolean";

/** Render a one-line human summary of a finding for an emit-error `details` list. */
export function describeClosureGateFinding(f: ClosureGateFinding): string {
  switch (f.kind) {
    case "proof-failure":
    case "unclassified":
      return `${f.kind} "${f.failure.name}" (${f.failure.library}): ${f.failure.reason}`;
    case "uncovered-define":
      return `emitted define "${f.header.name}" (${f.header.library}) has no ledger entry`;
    case "orphan-entry":
      return `enrolled entry "${f.header.name}" (${f.header.library}) was not emitted`;
    case "missing-metadata":
      return `enrolled define "${f.name}" (${f.library}) is missing ${f.field}`;
    case "unverified-obligation-source":
      return `enrolled define "${f.name}" (${f.library}) has obligationSource "in-place" — not a verified raw obligation`;
  }
}

/**
 * Run the closure totality proof in ENFORCE mode and partition its findings into blocking vs report-only.
 *
 *   - `failures`  → blocking, UNLESS the referenced entry carries a `stagingExclusion` (a form-keyed live form).
 *   - `unclassified` → REPORT-only (the proof's own `incomplete` semantics — a form the classifier cannot yet
 *     certify never ships a false `total`; family (c) lives here, and the T7 gate requires it empty).
 *   - `uncovered` / `orphanEntries` → ALWAYS blocking (never staging-exempt — completeness holes are producer bugs).
 *   - producer-integrity → blocking: a boolean subject missing `result`/`visibility`/`obligationSource`, or one
 *     whose `obligationSource === "in-place"` (an unverified obligation — the gate-side half of raw-map ownership).
 */
export function enforceClosureTotality(
  ledgers: readonly LibraryLedger[],
  resolveRawLibrary?: (fromLibrary: string, rawLibraryName: string) => string | undefined,
): ClosureGateResult {
  const index = buildClosureIndex(ledgers);
  const resolver = makeClosureOperandResolver(index, resolveRawLibrary);
  const headers = ledgers.flatMap((l) => extractEmittedDefineHeaders(l.cql, l.libraryIdentity));
  const proof = proveWholeBoundaryTotality(index.entries(), headers, resolver);

  const blocking: ClosureGateFinding[] = [];
  const excluded: ClosureGateFinding[] = [];

  // The set of enrolled identities that are NOT proven total (a hard failure or an incomplete unclassified) —
  // the operands a composite must NOT depend on to be total.
  const notTotal = new Set<string>();
  for (const f of proof.failures) notTotal.add(keyOf(f.library, f.name));
  for (const f of proof.unclassified) notTotal.add(keyOf(f.library, f.name));

  // PROVEN-THROUGH-EXCLUDED (disc 454 gpt56 #2 + disc 455 both arms): a staging-exempt LEAF is excused, AND a
  // composite that fails ONLY because it delegates (transitively) to excused leaves is ALSO excused — else a
  // composite over a bare-scalar leaf (`layered-name-collision` "Top") would block though its non-totality is
  // fully explained by an already-excused form. Fixed point, with TWO soundness guards the panel caught:
  //  (a) the composite's OWN discharge must be locally total (`nodeLocallyTotal`) — a composite that fails on
  //      its own metadata (`nullable`/mismatched discharge) is a producer bug the staging scope does not
  //      explain, so it must NOT be laundered by having healthy operands (disc 455 Claude arm);
  //  (b) each operand must be a PROVEN-TOTAL BOOLEAN subject (enrolled, `resultType === "Boolean"`, not in
  //      `notTotal`) OR excused — a POSITIVE check. The old `!notTotal.has(opKey)` was NEGATIVE, so a NON-boolean
  //      operand (never a proof subject → never in `notTotal`) read as "covered" and a boolean-over-CodeableConcept
  //      composite was excused instead of blocked (disc 454 gpt56 #2 / disc 455 both arms). An UNRESOLVED operand
  //      is never covered → the composite stays blocking, so a genuine missing ref is not laundered.
  const excused = new Set<string>();
  for (const e of index.entries()) {
    if (e.stagingExclusion !== undefined) excused.add(keyOf(e.library, e.name));
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of proof.failures) {
      const k = keyOf(f.library, f.name);
      if (excused.has(k)) continue;
      const entry = index.lookup({ library: f.library, name: f.name });
      if (entry === undefined || entry.obligation.kind !== "composite") continue;
      if (!nodeLocallyTotal(entry)) continue; // (a) fails on its OWN discharge → never excused
      const allCovered = entry.obligation.operands.every((op) => {
        const r = resolver(entry.library, op);
        const opEntry = index.lookup(r);
        if (opEntry === undefined) return false; // unresolved operand — never covered
        const opKey = keyOf(r.library, r.name);
        if (excused.has(opKey)) return true;
        // (b) POSITIVE: covered only if the operand is a PROVEN-TOTAL BOOLEAN subject (enrolled, `resultType`
        // Boolean, not in `notTotal`). A NON-boolean operand is NEVER "covered" here — the exists-bridge
        // composition-totality rule was reverted (disc 455, both arms: shape-inference is unsound; the durable fix
        // records per-operand lowering evidence at the producing branch).
        return opEntry.resultType === BOOLEAN_RESULT_TYPE && !notTotal.has(opKey);
      });
      if (allCovered) {
        excused.add(k);
        changed = true;
      }
    }
  }

  // A `failure` references an enrolled boolean subject; a miss (no entry — a cross-lib resolver sentinel) is
  // never excused → blocking.
  for (const failure of proof.failures) {
    if (excused.has(keyOf(failure.library, failure.name))) excluded.push({ kind: "proof-failure", failure });
    else blocking.push({ kind: "proof-failure", failure });
  }
  // `unclassified` is inherently INCOMPLETE (report), not a hard failure — never blocking here.
  for (const failure of proof.unclassified) excluded.push({ kind: "unclassified", failure });
  // Completeness holes are producer bugs — always blocking, never staging-exempt.
  for (const header of proof.uncovered) blocking.push({ kind: "uncovered-define", header });
  for (const header of proof.orphanEntries) blocking.push({ kind: "orphan-entry", header });

  // Producer-integrity over the boolean SUBJECT set (the entries the proof certifies): missing routing metadata
  // is a fail-closed producer bug (a non-routable entry silently drops from candidacy); an `in-place` obligation
  // source is an unverified obligation (disc-440 (a) — the gate-side half of raw-map ownership).
  for (const entry of index.entries()) {
    if (entry.resultType !== BOOLEAN_RESULT_TYPE) continue;
    if (entry.result === undefined) blocking.push({ kind: "missing-metadata", library: entry.library, name: entry.name, field: "result" });
    if (entry.visibility === undefined) blocking.push({ kind: "missing-metadata", library: entry.library, name: entry.name, field: "visibility" });
    if (entry.obligationSource === undefined) blocking.push({ kind: "missing-metadata", library: entry.library, name: entry.name, field: "obligationSource" });
    else if (entry.obligationSource === "in-place") blocking.push({ kind: "unverified-obligation-source", library: entry.library, name: entry.name });
  }

  return { blocking, excluded, proof };
}
