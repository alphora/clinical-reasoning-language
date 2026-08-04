/**
 * #250 E1 — the sanctioned provenance NORMALIZER's closed-form core: the shared implementation behind the
 * `crl-normalize-provenance` CLI bin AND the `normalize_provenance` MCP tool (so the two cannot drift, mirroring
 * `canonicalizeFiles.ts` / `generateFiles.ts` / `validateFiles.ts`). It rewrites a legacy provenance corpus into the
 * settled #250 convention — carrier-relative + POSIX `derivedFrom`, the versioned `schemaVersion:"1.1"` envelope, and the
 * `derivedFromContract` marker — so a corpus can mechanically repair itself before delivery H flips the gate to hard errors.
 *
 * WHAT "closed-form" means (design disc 383): the E1 core repairs only records it can VERIFY against the oracle already in
 * the data (`derivedFromHash`) WITHOUT searching the filesystem — an `anchor-self` record via its sibling anchor `.txt`, or
 * an `upstream-source` record whose absolute path still RESOLVES on this machine and hashes correctly. A dead upstream path
 * (the transient-worktree flavour that resolves nowhere) needs candidate DISCOVERY: the E2 layer (`discoverSource.ts`, wired
 * here behind the OPTIONAL `searchRoot`) runs ONE bounded, Dev-Drive-safe walk over a supplied search root and relocates the
 * source by hash. WITHOUT a `searchRoot`, a dead upstream path is WORKLISTED `dead-path-needs-discovery`, byte-untouched —
 * so the closed-form core still carries zero recursive-scan risk on its own. **The H gate waits on E2.**
 *
 * The invariants the design pinned (both review arms):
 *  - The branch is keyed on VERIFICATION OUTCOME (does the current `derivedFrom` resolve AND hash to the oracle?) + contract
 *    — NOT on the lexical class alone. A lexically-`ok`-but-wrong-carrier record (exactly what producer A's dest-less MCP
 *    path emits and defers to E) fails verification and is repaired, not blessed.
 *  - WRITE-ONLY-WHEN-FULLY-NORMALIZED: the marker + `schemaVersion` bump are stamped ONLY on a record whose `derivedFrom`
 *    is now `ok` + oracle-verified, in ONE atomic write per carrier file (the version↔marker invariant is never observed
 *    half-applied). An unrepairable record is left BYTE-UNTOUCHED (still 1.0, no marker) and worklisted — so a mis-inference
 *    can never be stamped permanently, and E2's later re-run sees virgin records.
 *  - The existing marker is AUTHORITATIVE — E infers contract from the tell (`derivedFromHash === textHash ⇒ anchor-self,
 *    else upstream-source`) ONLY when the record has no marker; a marker that CONTRADICTS the tell is worklisted, not replaced.
 *  - POST-WRITE REVALIDATE carries C's check itself (C does not exist yet): re-read the written bytes, re-load fail-closed,
 *    resolve the stored `derivedFrom` against the new carrier, require a regular file, and re-hash it against `derivedFromHash`.
 *    This is what makes "E exited 0 ⇒ the C-family trail checks pass" true (the D2 artifact↔sidecar cross-check runs in validate, not here).
 *
 * Reuses the shipped machinery: `classifyDerivedFrom` / `toCarrierRelative` / `samePath` / `isWellFormedSha256`
 * (derivedFromPolicy), `parseProvenanceArtifact` / `parseAnchorMeta` (the fail-closed loaders), `repoEscapeAdvisory`
 * (P1/T11), `writeFileAtomic` (T14).
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { AnchorSourceMeta, ProvenanceArtifact } from "./artifact";
import { PROVENANCE_LATEST_SCHEMA_VERSION } from "./artifact";
import type { AnchorMeta, DerivedFromContract } from "./canonicalize";
import type { DiscoveryOutcome, DiscoveryTarget } from "./discoverSource";
import { discoverSources, discoveryTargetFor } from "./discoverSource";
import {
  classifyDerivedFrom,
  contractFromTell,
  isWellFormedSha256,
  metaPathForAnchor,
  samePath,
  toCarrierRelative,
} from "./derivedFromPolicy";
import { parseAnchorMeta, parseProvenanceArtifact } from "./loadArtifact";
import { repoEscapeAdvisory } from "./repoEscape";
import { writeFileAtomic } from "./writeFileAtomic";

/** Why a record was left unrepaired. Structured (mirrors the B/C/D finding-kind discipline) so the cockpit / a driving
 *  script reads reason codes, not prose. `ambiguous` / `budget-exhausted` are the E2 discovery flavour. */
export type WorklistReason =
  | "no-oracle" // `derivedFromHash` (or the `textHash` the tell needs) is not a well-formed sha256:<hex>
  | "hash-mismatch" // upstream-source path RESOLVES but its bytes ≠ derivedFromHash — a content change, C's gate; never re-pointed
  | "dead-path-needs-discovery" // upstream-source path resolves nowhere → needs (or was not found by) the --search-root scan
  | "anchor-not-found" // anchor-self: the closed-form anchor .txt can't be located or doesn't hash to the oracle
  | "marker-tell-disagreement" // an existing marker contradicts the derivedFromHash/textHash tell → adjudicate, don't touch
  | "sidecar-hash-equals-text" // a sidecar with derivedFromHash === textHash (a real .anchormeta.json never has this)
  | "no-carrier-relative" // the verified/discovered source has no carrier-relative representation (cross-drive)
  | "ambiguous" // E2: >1 distinct file under --search-root hashed to derivedFromHash — refuse to pick, disambiguate
  | "budget-exhausted"; // E2: the discovery scan hit a ceiling before completing — uniqueness unprovable, poison every match

export interface WorklistEntry {
  /** the carrier file (artifact or sidecar) whose record could not be normalized. */
  carrier: string;
  kind: "artifact" | "sidecar";
  reason: WorklistReason;
  message: string;
}

export interface CarrierOutcome {
  path: string;
  kind: "artifact" | "sidecar";
  /** the record needed a change (path rewrite, marker stamp, or schema bump) vs what was on disk. */
  changed: boolean;
  /** a change was actually written (false in `--dry-run`, or when already normalized). */
  wrote: boolean;
}

export type NormalizeResult =
  | {
      ok: true;
      /** every processed record is now `ok` + marked (the worklist is empty) — the corpus for these carriers will pass H. */
      fullyNormalized: boolean;
      dryRun: boolean;
      carriers: CarrierOutcome[];
      worklist: WorklistEntry[];
      /** non-blocking producer advisories (e.g. the rewritten source resolves outside the checkout). Present when non-empty. */
      advisories?: string[];
    }
  // Operational failures — a bad input, an unloadable carrier, a write error, or a post-write revalidation that FAILED
  // (a rewrite bug: E must never leave a carrier it wrote in a worse state than it found it).
  | { ok: false; stage: "input" | "load" | "write" | "postwrite"; message: string };

/** Size cap for a carrier JSON read (artifact / sidecar). These records are small metadata; a pathologically large one is
 *  rejected rather than read into memory. (The upstream SOURCE that gets hashed is a corpus document — bounded by the
 *  trusted corpus, read in full for hashing per disc-375 P1, not capped here.) Mirrors the MCP handler's MAX_INPUT_BYTES. */
const MAX_CARRIER_BYTES = 1_000_000;

// ── hashing ──────────────────────────────────────────────────────────────────

/** sha256 of a file's RAW bytes in the `sha256:<lowercase-hex>` shape (matches the canonicalizer's derivedFromHash/textHash
 *  — a `.docx` is hashed as bytes, and a `.txt` written as `Buffer.from(text,"utf8")` hashes equal to its textHash). Returns
 *  null when the path is not a readable REGULAR file (a directory / device / missing path is "did not resolve", not a crash). */
function hashFileSync(p: string): string | null {
  try {
    if (!statSync(p).isFile()) return null;
    return "sha256:" + createHash("sha256").update(readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

/** Read + JSON-parse a carrier file (artifact / sidecar) under the {@link MAX_CARRIER_BYTES} cap. Returns a coded failure
 *  (never throws) so the orchestrator surfaces an oversized/unreadable/invalid carrier as an operational `{ok:false}`. */
function readCarrierJson(
  path: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  let size: number;
  try {
    size = statSync(path).size;
  } catch (e) {
    return {
      ok: false,
      message: `cannot stat "${path}": ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (size > MAX_CARRIER_BYTES) {
    return { ok: false, message: `"${path}" is too large: ${size} bytes > ${MAX_CARRIER_BYTES}.` };
  }
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    return {
      ok: false,
      message: `cannot read/parse "${path}": ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Probe a discovered sidecar path: absent (ENOENT — a Model-A corpus legitimately has none) is distinguished from a
 *  non-regular entry / a stat error (a real problem that must NOT be silently skipped as "no sidecar", per the review). */
type SidecarProbe = "absent" | "regular" | { error: string };
function probeSidecar(p: string): SidecarProbe {
  let st;
  try {
    st = statSync(p);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT"
      ? "absent"
      : {
          error: `cannot stat the discovered sidecar "${p}": ${e instanceof Error ? e.message : String(e)}`,
        };
  }
  return st.isFile()
    ? "regular"
    : { error: `the discovered sidecar path "${p}" exists but is not a regular file.` };
}

// ── per-record planning (pure decision + read-only fs verification; NO writes) ─

/** The inputs a single `derivedFrom` record exposes to the planner, uniformly for an artifact's `anchorSource` and a sidecar. */
interface RecordPlanInput {
  derivedFrom: unknown; // may be a non-string / blank legacy value (malformed) — planned, never assumed a string
  derivedFromHash: unknown; // the ORACLE (validated to sha256 shape here)
  textHash: unknown; // drives the contract tell (validated here)
  markerPresent: boolean;
  marker?: DerivedFromContract;
  carrierDir: string;
  isSidecar: boolean; // a sidecar is canonicalize-contract BY CONSTRUCTION (P4): never anchor-self
  anchorBasename: string; // `anchorSource.path` — the sibling anchor `.txt` basename for a closed-form anchor-self repair
  /** the anchor `.txt` candidate for a closed-form anchor-self repair (`--anchor` override, else sibling); artifacts only. */
  anchorCandidate?: string;
}

type RecordPlan =
  | {
      kind: "normalized";
      derivedFrom: string;
      contract: DerivedFromContract;
      resolvedSource: string;
      note?: string;
    }
  | {
      kind: "worklist";
      reason: WorklistReason;
      message: string;
      /** present ONLY on a `dead-path-needs-discovery` plan whose recorded path yielded a usable filename hint — the seed the
       *  orchestrator's single E2 walk consults. Its absence means "not recoverable by discovery" (blank/nameless path). */
      discoveryTarget?: DiscoveryTarget;
    };

const worklist = (
  reason: WorklistReason,
  message: string,
  discoveryTarget?: DiscoveryTarget,
): RecordPlan => ({
  kind: "worklist",
  reason,
  message,
  ...(discoveryTarget ? { discoveryTarget } : {}),
});

/**
 * Decide how a single record should be normalized, WITHOUT writing. Reads the filesystem only to VERIFY a candidate against
 * the oracle (resolve + hash). The whole safety argument lives here: a record reaches `normalized` only if its `derivedFrom`
 * now names a regular file whose bytes hash to `derivedFromHash`; everything else is worklisted byte-untouched.
 */
function planRecord(i: RecordPlanInput): RecordPlan {
  // 1. Oracle preflight — before any I/O. The tell needs a trustworthy textHash too.
  if (!isWellFormedSha256(i.derivedFromHash)) {
    return worklist(
      "no-oracle",
      `derivedFromHash is not a well-formed "sha256:<64 hex>" oracle (got ${JSON.stringify(i.derivedFromHash)}); cannot verify a rewrite.`,
    );
  }
  if (!isWellFormedSha256(i.textHash)) {
    return worklist(
      "no-oracle",
      `textHash is not a well-formed "sha256:<64 hex>" value (got ${JSON.stringify(i.textHash)}); cannot infer the contract.`,
    );
  }
  const oracle = i.derivedFromHash;
  const tell: DerivedFromContract = contractFromTell(oracle, i.textHash);

  // 2. Contract. A SIDECAR is canonicalize-contract (`upstream-source`) BY CONSTRUCTION (P4) — this is checked FIRST and
  // UNCONDITIONALLY, ahead of any recorded marker, so a hand-edited/foreign sidecar that already CLAIMS `anchor-self`
  // cannot slip past the by-construction rule (invariant 5). For an ARTIFACT, an existing marker is AUTHORITATIVE and the
  // tell only cross-checks it (invariant 3); an unmarked legacy 1.0 artifact infers contract from the tell (P3).
  let contract: DerivedFromContract;
  if (i.isSidecar) {
    // A genuine `.anchormeta.json`'s derivedFrom is an upstream source (never the canonical text), so its hash can never
    // equal textHash — `derivedFromHash === textHash` is impossible for a real sidecar. Surface it, don't stamp/bless it,
    // regardless of whether a marker already (wrongly) says anchor-self.
    if (tell === "anchor-self") {
      return worklist(
        "sidecar-hash-equals-text",
        `sidecar derivedFromHash === textHash — a genuine .anchormeta.json never has this (its derivedFrom is an upstream source, not the canonical text); refusing to normalize, adjudicate it.`,
      );
    }
    // A recorded sidecar marker that isn't upstream-source contradicts the by-construction contract → adjudicate, never overwrite.
    if (i.markerPresent && i.marker !== "upstream-source") {
      return worklist(
        "marker-tell-disagreement",
        `sidecar recorded derivedFromContract "${i.marker}" but a sidecar is upstream-source BY CONSTRUCTION — refusing to normalize a self-inconsistent record; adjudicate it.`,
      );
    }
    contract = "upstream-source";
  } else if (i.markerPresent) {
    if (i.marker !== tell) {
      return worklist(
        "marker-tell-disagreement",
        `the recorded derivedFromContract "${i.marker}" contradicts the derivedFromHash/textHash tell ("${tell}") — refusing to normalize a self-inconsistent record; adjudicate it.`,
      );
    }
    contract = i.marker;
  } else {
    contract = tell; // a legacy 1.0 artifact with no marker → infer from the tell (P3).
  }

  // 3. Verify the CURRENT derivedFrom against the oracle (resolve vs the carrier dir → regular file → hash).
  const cur = i.derivedFrom;
  if (typeof cur === "string" && cur.trim() !== "") {
    const resolved = resolve(i.carrierDir, cur);
    const h = hashFileSync(resolved);
    if (h === oracle) {
      // The source is confirmed. If the string is already carrier-relative POSIX, it needs no rewrite; otherwise
      // (absolute-but-verifies) rewrite it carrier-relative — the file is the same, only the stored form changes.
      if (classifyDerivedFrom(cur) === "ok") {
        return { kind: "normalized", derivedFrom: cur, contract, resolvedSource: resolved };
      }
      const rel = toCarrierRelative(resolved, i.carrierDir);
      if (!rel.ok) {
        return worklist(
          "no-carrier-relative",
          `the verified source "${resolved}" has no carrier-relative representation against "${i.carrierDir}" (cross-drive).`,
        );
      }
      return { kind: "normalized", derivedFrom: rel.path, contract, resolvedSource: resolved };
    }
    // Not verified as-is: resolves-but-wrong-hash, or resolves nowhere.
    if (contract === "upstream-source") {
      if (h !== null) {
        return worklist(
          "hash-mismatch",
          `derivedFrom "${cur}" resolves but its bytes do not match derivedFromHash — a content change, not a path defect (C's gate); refusing to re-point it.`,
        );
      }
      // Dead upstream path — seed the orchestrator's single discovery walk with the salvaged filename hint. When the recorded
      // path has NO usable filename (a trailing separator, `/gone/dir/`), discovery can't be seeded → say so, rather than
      // promise a --search-root re-run that would silently never serve it.
      const target = discoveryTargetFor(oracle, cur);
      if (target.basename === "") {
        return worklist(
          "dead-path-needs-discovery",
          `derivedFrom "${cur}" does not resolve and has no salvageable filename to seed discovery — recover it by hand.`,
        );
      }
      return worklist(
        "dead-path-needs-discovery",
        `derivedFrom "${cur}" does not resolve on this machine; re-run with an explicit --search-root to relocate the source by hash.`,
        target,
      );
    }
    // anchor-self falls through to the closed-form repair below (the anchor + oracle are known, so a stale/wrong path is repairable).
  } else if (contract === "upstream-source") {
    return worklist(
      "dead-path-needs-discovery",
      `derivedFrom is missing/blank; an upstream-source record has no filename hint to seed discovery — recover it by hand.`,
    );
  }

  // 4. anchor-self CLOSED-FORM repair — the source IS the anchor `.txt`; verify it against the oracle (= textHash) and
  //    rewrite carrier-relative to it. (A sidecar never reaches here — it is upstream-source by construction, §2.)
  const anchor = i.anchorCandidate;
  if (!anchor) {
    return worklist(
      "anchor-not-found",
      `no anchor .txt candidate for a closed-form anchor-self repair (pass --anchor, or place "${i.anchorBasename}" beside the artifact).`,
    );
  }
  const ah = hashFileSync(anchor);
  if (ah !== oracle) {
    return worklist(
      "anchor-not-found",
      `the candidate anchor "${anchor}" ${ah === null ? "is not a readable regular file" : "does not hash to derivedFromHash/textHash"} — cannot verify the closed-form repair.`,
    );
  }
  const rel = toCarrierRelative(anchor, i.carrierDir);
  if (!rel.ok) {
    return worklist(
      "no-carrier-relative",
      `the anchor "${anchor}" has no carrier-relative representation against "${i.carrierDir}" (cross-drive).`,
    );
  }
  const note =
    typeof cur === "string" && cur.trim() !== "" && basename(cur) !== basename(i.anchorBasename)
      ? `the prior derivedFrom basename "${basename(cur)}" differed from anchorSource.path "${basename(i.anchorBasename)}"; repaired to the verified anchor.`
      : undefined;
  return {
    kind: "normalized",
    derivedFrom: rel.path,
    contract,
    resolvedSource: anchor,
    ...(note ? { note } : {}),
  };
}

// ── carrier processing (plan → conditional atomic write → post-write revalidate) ─

interface CarrierRun {
  outcome: CarrierOutcome;
  worklist: WorklistEntry[];
  advisories: string[];
}

/** A post-write revalidation failure — thrown so the orchestrator surfaces it as `{ok:false, stage:"postwrite"}`. */
class PostWriteError extends Error {}

/** A carrier write failure — surfaced as `{ok:false, stage:"write"}`. */
class WriteError extends Error {}

/** The load-bearing fields a post-write reload extracts from what is ACTUALLY on disk (not the pre-write plan) — so a
 *  bug in `build()` that wrote a different `derivedFrom`/hash than planned is caught, not masked. */
type ReloadedRecord = { derivedFrom: unknown; derivedFromHash: unknown };

/** Re-read a just-written carrier and prove — from the values NOW ON DISK — that it fail-closes AND its stored derivedFrom
 *  is carrier-relative POSIX, resolves to a regular file, and re-hashes to its stored derivedFromHash, which must still equal
 *  the intended oracle (E carrying C's not-yet-existing check). Everything is read back from disk; nothing trusts the plan. */
function revalidateWritten(
  path: string,
  carrierDir: string,
  expectedOracle: string,
  reload: (raw: unknown) => ReloadedRecord | null,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new PostWriteError(
      `re-reading "${path}" after write failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const stored = reload(parsed);
  if (!stored) {
    throw new PostWriteError(
      `the carrier "${path}" is not loadable after write (envelope/shape check failed).`,
    );
  }
  // The stored oracle must be exactly the one we intended to preserve — a build() bug that altered it is caught here.
  if (stored.derivedFromHash !== expectedOracle) {
    throw new PostWriteError(
      `after writing "${path}", the stored derivedFromHash changed unexpectedly (got ${JSON.stringify(stored.derivedFromHash)}, expected "${expectedOracle}") — the rewrite is unsound.`,
    );
  }
  if (typeof stored.derivedFrom !== "string" || classifyDerivedFrom(stored.derivedFrom) !== "ok") {
    throw new PostWriteError(
      `after writing "${path}", the stored derivedFrom ${JSON.stringify(stored.derivedFrom)} is not a carrier-relative POSIX path — the rewrite is unsound.`,
    );
  }
  const h = hashFileSync(resolve(carrierDir, stored.derivedFrom));
  if (h !== expectedOracle) {
    throw new PostWriteError(
      `after writing "${path}", its stored derivedFrom "${stored.derivedFrom}" ${h === null ? "does not resolve to a regular file" : "resolves but no longer hashes to derivedFromHash"} — the rewrite is unsound.`,
    );
  }
}

/** The write-side hooks a planned carrier carries into {@link finishCarrier} — kept with the plan so the orchestrator can
 *  interpose the E2 discovery walk between planning and writing (it may REPLACE a dead-path plan before finish runs). */
interface FinishIo {
  current: { derivedFrom: unknown; contract?: DerivedFromContract; schemaVersion?: string };
  build: (derivedFrom: string, contract: DerivedFromContract) => { obj: unknown; oracle: string };
  reload: (raw: unknown) => ReloadedRecord | null;
}

/** A carrier planned but not yet written: everything {@link finishCarrier} needs, with a `plan` the orchestrator may swap
 *  for a discovery-resolved one. Splitting plan from finish is what lets a SINGLE discovery walk serve every dead record. */
interface PlannedCarrier {
  path: string;
  kind: "artifact" | "sidecar";
  carrierDir: string;
  plan: RecordPlan;
  io: FinishIo;
}

/** Plan the ARTIFACT carrier's `anchorSource` record (pure decision + read-only verification; NO write). */
function planArtifactCarrier(
  artifactPath: string,
  artifact: ProvenanceArtifact,
  anchorCandidate: string,
): PlannedCarrier {
  const carrierDir = dirname(artifactPath);
  const a: AnchorSourceMeta = artifact.anchorSource;
  const plan = planRecord({
    derivedFrom: a.derivedFrom,
    derivedFromHash: a.derivedFromHash,
    textHash: a.textHash,
    markerPresent: artifact.schemaVersion === "1.1",
    ...(a.derivedFromContract ? { marker: a.derivedFromContract } : {}),
    carrierDir,
    isSidecar: false,
    anchorBasename: a.path,
    anchorCandidate,
  });
  return {
    path: artifactPath,
    kind: "artifact",
    carrierDir,
    plan,
    io: {
      current: {
        derivedFrom: a.derivedFrom,
        contract: a.derivedFromContract,
        schemaVersion: artifact.schemaVersion,
      },
      build: (derivedFrom, contract): { obj: unknown; oracle: string } => ({
        obj: {
          ...artifact,
          schemaVersion: PROVENANCE_LATEST_SCHEMA_VERSION,
          anchorSource: { ...a, derivedFrom, derivedFromContract: contract },
        },
        oracle: a.derivedFromHash,
      }),
      reload: (raw) => {
        const p = parseProvenanceArtifact(raw);
        return p.ok
          ? {
              derivedFrom: p.artifact.anchorSource.derivedFrom,
              derivedFromHash: p.artifact.anchorSource.derivedFromHash,
            }
          : null;
      },
    },
  };
}

/** Plan a SIDECAR carrier's record. A sidecar has no schemaVersion — marker presence is its discriminant. */
function planSidecarCarrier(sidecarPath: string, meta: AnchorMeta): PlannedCarrier {
  const carrierDir = dirname(sidecarPath);
  const plan = planRecord({
    derivedFrom: meta.derivedFrom,
    derivedFromHash: meta.derivedFromHash,
    textHash: meta.textHash,
    markerPresent: meta.derivedFromContract !== undefined,
    ...(meta.derivedFromContract ? { marker: meta.derivedFromContract } : {}),
    carrierDir,
    isSidecar: true,
    anchorBasename: meta.path,
  });
  return {
    path: sidecarPath,
    kind: "sidecar",
    carrierDir,
    plan,
    io: {
      current: {
        derivedFrom: meta.derivedFrom,
        contract: meta.derivedFromContract,
        schemaVersion: undefined,
      },
      build: (derivedFrom, contract): { obj: unknown; oracle: string } => ({
        obj: { ...meta, derivedFrom, derivedFromContract: contract },
        oracle: meta.derivedFromHash,
      }),
      reload: (raw) => {
        const p = parseAnchorMeta(raw);
        return p.ok
          ? { derivedFrom: p.meta.derivedFrom, derivedFromHash: p.meta.derivedFromHash }
          : null;
      },
    },
  };
}

/**
 * #250 E2 — turn a single dead-path plan + its discovery OUTCOME into the final RecordPlan. A confirmed unique candidate
 * becomes a `normalized` upstream-source plan (rewritten carrier-relative; the post-write revalidate re-hashes it exactly as
 * any other repair); everything else stays worklisted with the precise reason. Only ever called on a plan the planner marked
 * `dead-path-needs-discovery` with a `discoveryTarget`.
 */
function applyDiscovery(
  carrierDir: string,
  searchRoot: string,
  target: DiscoveryTarget,
  outcome: DiscoveryOutcome,
): RecordPlan {
  switch (outcome.kind) {
    case "budget-exhausted":
      return worklist(
        "budget-exhausted",
        `discovery under "${searchRoot}" did not complete (${outcome.ceiling}; unscanned: unknown) — a match cannot be proven unique on a partial scan; narrow --search-root, fix the unreadable entry, or raise the budget and re-run.`,
      );
    case "ambiguous":
      return worklist(
        "ambiguous",
        `discovery under "${searchRoot}" found ${outcome.paths.length} distinct files that hash to derivedFromHash (${outcome.predicate} predicate): ${outcome.paths.join(", ")} — refusing to pick; disambiguate.`,
      );
    case "not-found":
      return worklist(
        "dead-path-needs-discovery",
        `discovery fully scanned "${searchRoot}" but no candidate (basename${target.ext ? " then extension" : ""} stage) hashed to derivedFromHash — the source is not under this root.`,
      );
    case "found": {
      const rel = toCarrierRelative(outcome.path, carrierDir);
      if (!rel.ok) {
        return worklist(
          "no-carrier-relative",
          `the discovered source "${outcome.path}" has no carrier-relative representation against "${carrierDir}" (cross-drive).`,
        );
      }
      return {
        kind: "normalized",
        derivedFrom: rel.path,
        contract: "upstream-source",
        resolvedSource: outcome.path,
        note: `relocated via discovery under "${searchRoot}" (${outcome.predicate} predicate).`,
      };
    }
  }
}

/** Shared tail: turn a planned carrier into a CarrierOutcome + worklist, doing the conditional atomic write + post-write
 *  revalidate. `changed` diffs the target against what is on disk (derivedFrom string, marker, and — artifact only —
 *  schemaVersion), so an already-normalized carrier is a byte-untouched no-op (idempotency). The `plan` read here is the
 *  FINAL one — the orchestrator may have replaced a dead-path plan with a discovery-resolved plan first. */
function finishCarrier(pc: PlannedCarrier, dryRun: boolean): CarrierRun {
  const { path, kind, carrierDir, plan, io } = pc;
  if (plan.kind === "worklist") {
    return {
      outcome: { path, kind, changed: false, wrote: false },
      worklist: [{ carrier: path, kind, reason: plan.reason, message: plan.message }],
      advisories: [],
    };
  }
  const schemaChanged =
    kind === "artifact" && io.current.schemaVersion !== PROVENANCE_LATEST_SCHEMA_VERSION;
  const changed =
    io.current.derivedFrom !== plan.derivedFrom ||
    io.current.contract !== plan.contract ||
    schemaChanged;

  // Non-blocking repo-escape advisory on the (rewritten) source (P1/T11), plus the anchor-basename note.
  const advisories: string[] = [];
  if (plan.note) advisories.push(`${path}: ${plan.note}`);
  const escape = repoEscapeAdvisory(plan.resolvedSource, carrierDir);
  if (escape) advisories.push(escape);

  if (!changed || dryRun) {
    return { outcome: { path, kind, changed, wrote: false }, worklist: [], advisories };
  }

  const { obj, oracle } = io.build(plan.derivedFrom, plan.contract);
  // Snapshot the pre-write BYTES (no encoding — a lossy utf8 decode+re-encode would restore U+FFFD for invalid sequences;
  // writeFileAtomic accepts a Buffer, so a raw snapshot restores byte-identically) so a post-write revalidation failure
  // (e.g. the source mutated between plan and write — TOCTOU) can be ROLLED BACK: invariant 2 (an unsound rewrite is never
  // left stamped) must hold under races. Best-effort — if the snapshot read fails we still write, but cannot roll back.
  let originalBytes: Buffer | undefined;
  try {
    originalBytes = readFileSync(path);
  } catch {
    originalBytes = undefined;
  }
  try {
    writeFileAtomic(path, JSON.stringify(obj, null, 2) + "\n");
  } catch (e) {
    throw new WriteError(
      `failed to write "${path}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    revalidateWritten(path, carrierDir, oracle, io.reload);
  } catch (e) {
    // Restore the original so the failed rewrite leaves the carrier no worse than found, and TELL the operator whether the
    // rollback succeeded (a swallowed restore failure would otherwise read identically to a clean rollback). The original
    // post-write error is the one that matters — its message carries the rollback status.
    let rollback: string;
    if (originalBytes === undefined) {
      rollback =
        " (no pre-write snapshot was captured; the carrier is left in the rewritten state — verify manually)";
    } else {
      try {
        writeFileAtomic(path, originalBytes);
        rollback = " (the carrier was ROLLED BACK to its pre-write state)";
      } catch {
        rollback =
          " (rollback ALSO FAILED — the carrier is left in the unsound rewritten state; manual repair needed)";
      }
    }
    throw e instanceof PostWriteError ? new PostWriteError(e.message + rollback) : e;
  }
  return { outcome: { path, kind, changed: true, wrote: true }, worklist: [], advisories };
}

// ── the top orchestrator ───────────────────────────────────────────────────────

export interface NormalizeProvenanceOpts {
  /** the provenance artifact JSON to normalize; its sidecar is auto-discovered beside the anchor. */
  artifactPath?: string;
  /** a standalone `<name>.anchormeta.json` sidecar to normalize (P4 — its own derivedFrom is in gate scope). */
  sidecarPath?: string;
  /** the anchor `.txt` for a closed-form anchor-self repair (override; else the sibling `anchorSource.path` beside the artifact). */
  anchorPath?: string;
  /** #250 E2 — an explicit directory to scan for a DEAD upstream-source path, relocating the source by hash. REQUIRED to
   *  attempt discovery: absent, a dead upstream path stays worklisted `dead-path-needs-discovery`. Never defaults to `/`. */
  searchRoot?: string;
  dryRun?: boolean;
}

/**
 * Normalize ONE carrier per invocation — either a provenance `--artifact` (plus its discovered sidecar) OR a standalone
 * `--sidecar`. Corpus-wide migration enumerates artifacts EXTERNALLY and calls this per artifact (the single-carrier surface
 * keeps I/O trivially bounded; only E2's discovery scan ever walks a tree). Never throws: operational failures return a
 * discriminated `{ok:false}`.
 */
export function normalizeProvenanceFiles(opts: NormalizeProvenanceOpts): NormalizeResult {
  const dryRun = opts.dryRun === true;
  if ((opts.artifactPath ? 1 : 0) + (opts.sidecarPath ? 1 : 0) !== 1) {
    return {
      ok: false,
      stage: "input",
      message: "exactly one of artifactPath / sidecarPath must be given.",
    };
  }
  // A supplied --search-root must be an existing directory — a typo'd root would otherwise scan nothing and report a
  // definitive "not under this root", masking the real error. Validate BEFORE any work (E2).
  if (opts.searchRoot !== undefined) {
    let st;
    try {
      st = statSync(opts.searchRoot);
    } catch (e) {
      return {
        ok: false,
        stage: "input",
        message: `searchRoot "${opts.searchRoot}" is not readable: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    if (!st.isDirectory()) {
      return {
        ok: false,
        stage: "input",
        message: `searchRoot "${opts.searchRoot}" is not a directory.`,
      };
    }
  }

  // ── Phase 1: load + PLAN every carrier (pure decision + read-only verification; NO writes yet) ──
  const planned: PlannedCarrier[] = [];
  if (opts.artifactPath) {
    const artifactPath = opts.artifactPath;
    const read = readCarrierJson(artifactPath);
    if (!read.ok) return { ok: false, stage: "load", message: read.message };
    const parsed = parseProvenanceArtifact(read.value);
    if (!parsed.ok) {
      return {
        ok: false,
        stage: "load",
        message: `artifact "${artifactPath}" is not loadable [${parsed.code}]: ${parsed.message}`,
      };
    }
    const artifact: ProvenanceArtifact = parsed.artifact;
    // `parseProvenanceArtifact` guards the ENVELOPE, not `anchorSource.path` (which it does not require to be a string).
    // The normalizer consumes it (basename/join), so guard it here rather than let `basename` throw past the "never
    // throws" contract.
    if (typeof artifact.anchorSource.path !== "string") {
      return {
        ok: false,
        stage: "load",
        message: `artifact "${artifactPath}" anchorSource.path must be a string (got ${JSON.stringify(artifact.anchorSource.path)}).`,
      };
    }

    // The closed-form anchor-self repair honours the `--anchor` OVERRIDE (the anchor may have been relocated). Sidecar
    // discovery, however, always uses the CANONICAL SIBLING (`anchorSource.path` beside the artifact) where canonicalize
    // wrote it — an `--anchor` override must NOT redirect discovery away from a real, gate-scoped sidecar (review #3).
    const siblingAnchor = join(dirname(artifactPath), basename(artifact.anchorSource.path));
    const anchorCandidate = opts.anchorPath ?? siblingAnchor;
    planned.push(planArtifactCarrier(artifactPath, artifact, anchorCandidate));

    // Discover + plan the sidecar beside the canonical anchor (P4). ENOENT ⇒ a Model-A corpus with no sidecar (skip, not a
    // defect); a non-regular entry / stat error is a real problem surfaced operationally (never silently skipped).
    const sidecarPath = metaPathForAnchor(siblingAnchor);
    if (!samePath(sidecarPath, artifactPath)) {
      const probe = probeSidecar(sidecarPath);
      if (typeof probe === "object") return { ok: false, stage: "load", message: probe.error };
      if (probe === "regular") {
        const sc = loadAndPlanSidecar(sidecarPath);
        if (!sc.ok) return { ok: false, stage: "load", message: sc.message };
        planned.push(sc.planned);
      }
    }
  } else {
    const sc = loadAndPlanSidecar(opts.sidecarPath as string);
    if (!sc.ok) return { ok: false, stage: "load", message: sc.message };
    planned.push(sc.planned);
  }

  // ── Phase 2: ONE bounded discovery walk for ALL dead-path records (E2). Gather every dead record's filename+oracle hint,
  // scan the search root once, and REPLACE each dead-path plan with its resolved plan (normalized / ambiguous / exhausted /
  // still-not-found). Only runs when a --search-root is given AND at least one record actually needs discovery. ──
  if (opts.searchRoot !== undefined) {
    const searchRoot = opts.searchRoot;
    const discoverable = planned.filter(
      (pc) =>
        pc.plan.kind === "worklist" &&
        pc.plan.reason === "dead-path-needs-discovery" &&
        pc.plan.discoveryTarget !== undefined,
    );
    if (discoverable.length > 0) {
      const targets = discoverable.map(
        (pc) =>
          (pc.plan as Extract<RecordPlan, { kind: "worklist" }>).discoveryTarget as DiscoveryTarget,
      );
      const outcomes = discoverSources(searchRoot, targets);
      discoverable.forEach((pc, i) => {
        pc.plan = applyDiscovery(pc.carrierDir, searchRoot, targets[i], outcomes[i]);
      });
    }
  }

  // ── Phase 3: FINISH each carrier — the only phase that writes (conditional atomic write + post-write revalidate) ──
  const carriers: CarrierOutcome[] = [];
  const worklist: WorklistEntry[] = [];
  const advisories: string[] = [];
  try {
    for (const pc of planned) {
      const run = finishCarrier(pc, dryRun);
      carriers.push(run.outcome);
      worklist.push(...run.worklist);
      advisories.push(...run.advisories);
    }
  } catch (e) {
    // A write/postwrite failure during a LATER carrier (the sidecar), after an earlier one (the artifact) already wrote,
    // would otherwise read as "nothing happened" — note that the artifact was normalized (a re-run is idempotent).
    const priorArtifact = carriers.some((c) => c.kind === "artifact" && c.wrote);
    const note = priorArtifact
      ? " (NOTE: the artifact was already normalized this run; re-running is idempotent — fix the sidecar and re-run)"
      : "";
    if (e instanceof PostWriteError)
      return { ok: false, stage: "postwrite", message: e.message + note };
    if (e instanceof WriteError) return { ok: false, stage: "write", message: e.message + note };
    throw e; // an unexpected error is a real bug, not an operational outcome — let it surface.
  }

  return {
    ok: true,
    fullyNormalized: worklist.length === 0,
    dryRun,
    carriers,
    worklist,
    ...(advisories.length ? { advisories } : {}),
  };
}

/** Read + fail-close a sidecar (under the carrier size cap), then PLAN it. Returns the operational failure MESSAGE or the
 *  planned carrier (unwritten — the orchestrator may interpose discovery, then finish it). */
function loadAndPlanSidecar(
  sidecarPath: string,
): { ok: true; planned: PlannedCarrier } | { ok: false; message: string } {
  const read = readCarrierJson(sidecarPath);
  if (!read.ok) return { ok: false, message: read.message };
  const parsed = parseAnchorMeta(read.value);
  if (!parsed.ok) {
    return {
      ok: false,
      message: `sidecar "${sidecarPath}" is not loadable [${parsed.code}]: ${parsed.message}`,
    };
  }
  return { ok: true, planned: planSidecarCarrier(sidecarPath, parsed.meta) };
}
