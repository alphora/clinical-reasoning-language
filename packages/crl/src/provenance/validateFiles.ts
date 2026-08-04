/**
 * File-level provenance resolution + validation — the shared implementation behind the `crl-validate-provenance` CLI
 * bin, the `validate_provenance` MCP tool, AND the correspondence view-model (so none can drift). `resolveProvenance`
 * does the read-files → resolve-CRL-closure → build-index → derive-coverage → run-§9-validators pipeline ONCE and
 * returns every intermediate the consumers need (the validator projection threw the index/coverage/anchorText away).
 * Throws on unreadable/invalid input — callers (CLI / MCP handler / cockpit) catch and present.
 */
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { effectiveCaseId } from "../cel/ast/caseId";
import type { CELCase } from "../cel/ast/types";
import { resolveCelImports } from "../cel/imports";
import type { ResolvedCelGraph } from "../cel/imports/types";

import type { AnchorSourceMeta, ProvenanceArtifact } from "./artifact";
import { buildCockpitModelFromResolved } from "./cockpitModel";
import { checkCockpitCorrespondence, type CorrespondenceCheckResult } from "./correspondenceCheck";
import { deriveCoverage, type CoverageReport } from "./coverage";
import {
  classifyDerivedFrom,
  DERIVED_FROM_GATE_ENFORCED,
  isWellFormedSha256,
} from "./derivedFromPolicy";
import {
  buildProvenanceIndex,
  type ProvNodeRef,
  type ProvenanceIndex,
  type ProvenanceIndexDiagnostic,
} from "./indexer";
import { parseProvenanceArtifact } from "./loadArtifact";
import {
  validateProvenance,
  WAIVER_KINDS,
  type ProvenanceFinding,
  type ProvenanceValidationMode,
  type Severity,
} from "./validators";

/** Every intermediate of the provenance pipeline — consumed by both the validator projection and the cockpit model. */
export interface ResolveProvenanceResult {
  artifact: ProvenanceArtifact;
  anchor: { filePath: string; text: string; meta: AnchorSourceMeta };
  graph: ResolvedCelGraph;
  index: ProvenanceIndex;
  coverage: CoverageReport;
  findings: ProvenanceFinding[];
  celCaseIds: Map<string, Set<string>>;
  frozenCaseIds: Map<string, Set<string>>;
  errorCount: number;
  manualReviewCount: number;
  warningCount: number;
  /** Count of attribution-class findings (the coverage backlog). In worklist mode these are graded "warning"; in final mode they are at native severity. */
  worklistCount: number;
  /** Count of WAIVER-kind findings (the judge-lens escape hatches) — FINAL mode only (worklist skips them); all manual-review. */
  waiverCount: number;
  /** Of `waiverCount`, the ones flagged `scrutiny:"scrutinize"` (the Judge must adjudicate); the rest are routine rubber-stamps. */
  waiverScrutinizeCount: number;
  pass: boolean;
}

/** The outcome of hashing a resolved source file — every failure is a DISCRIMINATED value (never a throw), so a broken
 *  trail target becomes a finding, not a crash of the whole validate run. */
type ResolvedSourceHash =
  | { kind: "ok"; hash: string }
  | { kind: "unresolved"; detail: string } // ENOENT / ENOTDIR — the source named by the trail is not here (incl. a dangling symlink)
  | { kind: "unreadable"; detail: string }; // present but not a readable regular file (dir/device/fifo, EACCES/EPERM/ELOOP/EIO, too-large)

// Open READ-ONLY and NON-BLOCKING: on POSIX a plain `open(fifo, O_RDONLY)` BLOCKS until a writer appears — and since
// carrier-relative `../` can legally name any local path (repo-containment was dropped), a mis-authored trail pointing at a
// FIFO would hang the whole validate run (CLI, MCP, AND the cockpit load). O_NONBLOCK makes that open return immediately, so
// the `fstat` gate rejects it as `unreadable` (a hang is worse than the crash the discriminated contract already prevents).
// O_NONBLOCK is a no-op for a regular file's reads; it is absent on Windows (→ 0), where FIFOs aren't reachable this way.
const SOURCE_OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/**
 * #250 Todo C — hash a resolved source file over its RAW bytes, mapping every filesystem failure to a discriminated outcome.
 * Opens the path ONCE (read-only + non-blocking) and `fstat`s the DESCRIPTOR (the object verified regular is the object read
 * — closes the stat→read TOCTOU and a FIFO block/swap), then hashes in bounded chunks (no whole-file buffer, no
 * `readFileSync` ≥2 GiB throw). Follows symlinks — a single named file with no recursion, so E2's reparse-cycle/forced-sweep
 * hazard does not apply here. NEVER throws (even `closeSync` is guarded) — a broken trail target must never crash validation.
 */
function hashResolvedSource(path: string): ResolvedSourceHash {
  let fd: number;
  try {
    fd = openSync(path, SOURCE_OPEN_FLAGS);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const detail = e instanceof Error ? e.message : String(e);
    // ENOENT (absent / dangling symlink target) and ENOTDIR (a path component isn't a directory) mean "not here"; every
    // other open failure (EACCES/EPERM/ELOOP/EIO/…) is "present but unreadable" — an error we cannot read as absence.
    return code === "ENOENT" || code === "ENOTDIR"
      ? { kind: "unresolved", detail }
      : { kind: "unreadable", detail };
  }
  try {
    if (!fstatSync(fd).isFile()) {
      return {
        kind: "unreadable",
        detail: "not a regular file (directory / device / fifo / socket)",
      };
    }
    const h = createHash("sha256");
    const buf = Buffer.allocUnsafe(1 << 20); // 1 MiB window
    let n: number;
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    return { kind: "ok", hash: "sha256:" + h.digest("hex") };
  } catch (e) {
    return { kind: "unreadable", detail: e instanceof Error ? e.message : String(e) };
  } finally {
    // A `closeSync` failure (EIO on close over NFS, EBADF) must NOT override the discriminated return with a throw — that is
    // the one remaining path by which a bad trail target could crash the run. Swallow it; the digest is already computed.
    try {
      closeSync(fd);
    } catch {
      /* ignore — nothing actionable, and the outcome is already determined */
    }
  }
}

/**
 * #250 Todo C — the fs half of the `derivedFrom` gate: resolve the artifact's `anchorSource.derivedFrom` against the CARRIER
 * dir (`dirname(artifactPath)`), require a regular file, and hash it against the recorded `derivedFromHash` oracle.
 * Contract-AGNOSTIC (anchor-self `.txt`/textHash and upstream-source `.docx`/bytes both satisfy resolve→hash→compare; no
 * marker is read — the `anchor-self ⇒ derivedFromHash===textHash` tell invariant is Todo D). Cascade: B (pure) owns a
 * non-`ok` path and the pure `derived-from-oracle-malformed` check owns a bad oracle, so C acts ONLY when both are clean; it
 * then emits at most one of unresolved / source-unreadable / hash-mismatch. Findings set `class:"integrity"` + the gated
 * severity EXPLICITLY (they bypass `validateProvenance`'s post-pass). A broken trail target is a FINDING, never a thrown
 * pipeline error — `resolveProvenance`'s throw-on-unreadable contract covers its PRIMARY inputs (artifact/cel/anchor), not
 * the source the trail points at.
 */
export function derivedFromResolutionFindings(
  artifactPath: string,
  artifact: ProvenanceArtifact,
): ProvenanceFinding[] {
  const a = artifact.anchorSource;
  if (classifyDerivedFrom(a.derivedFrom) !== "ok" || !isWellFormedSha256(a.derivedFromHash)) {
    return []; // B owns the bad path; the pure oracle-malformed check owns the bad oracle; C only runs when both are clean.
  }
  const severity: Severity = DERIVED_FROM_GATE_ENFORCED ? "error" : "warning";
  const resolved = resolve(dirname(artifactPath), a.derivedFrom);
  const finding = (kind: ProvenanceFinding["kind"], message: string): ProvenanceFinding => ({
    kind,
    severity,
    class: "integrity",
    message,
  });
  const hashed = hashResolvedSource(resolved);
  if (hashed.kind === "unresolved") {
    return [
      finding(
        "derived-from-unresolved",
        `anchorSource.derivedFrom "${a.derivedFrom}" does not resolve to a file on this machine (resolved to "${resolved}": ${hashed.detail}) — the source document the trail points at is not in this clone (#250).`,
      ),
    ];
  }
  if (hashed.kind === "unreadable") {
    return [
      finding(
        "derived-from-source-unreadable",
        `anchorSource.derivedFrom "${a.derivedFrom}" resolves to "${resolved}" but could not be read as a regular file (${hashed.detail}) — the source trail cannot be verified (#250).`,
      ),
    ];
  }
  if (hashed.hash !== a.derivedFromHash) {
    return [
      finding(
        "derived-from-hash-mismatch",
        `anchorSource.derivedFrom "${a.derivedFrom}" resolves to "${resolved}" but its bytes hash to ${hashed.hash}, not the recorded derivedFromHash ${a.derivedFromHash} — the source content changed since it was recorded (or an un-smudged git-LFS pointer is checked out in its place) (#250).`,
      ),
    ];
  }
  return [];
}

export function resolveProvenance(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
  mode: ProvenanceValidationMode = "final",
): ResolveProvenanceResult {
  // #250 F — fail-closed on an unknown schemaVersion / bad envelope (never a blind cast). resolveProvenance's contract is
  // throw-on-invalid-input; the loader's coded failure becomes that throw, naming the offending value.
  const parsed = parseProvenanceArtifact(JSON.parse(readFileSync(artifactPath, "utf8")));
  if (!parsed.ok) {
    throw new Error(
      `provenance artifact "${artifactPath}" is not loadable [${parsed.code}]: ${parsed.message}`,
    );
  }
  const artifact = parsed.artifact;
  const anchorText = readFileSync(anchorPath, "utf8");
  const graph = resolveCelImports(celPath);
  const index = buildProvenanceIndex(graph);

  // caseId sets from the resolved .cel, keyed by both basename and absolute path (the artifact's CelNodeRef.file may use either).
  const cases = (graph.cel?.statements ?? []).filter((s): s is CELCase => s.type === "CELCase");
  const effective = new Set(cases.map((c, i) => effectiveCaseId(c, i)));
  const frozen = new Set(
    cases.filter((c) => c.caseId !== undefined).map((c) => c.caseId as string),
  );
  const celCaseIds = new Map([
    [basename(celPath), effective],
    [graph.filePath, effective],
  ]);
  const frozenCaseIds = new Map([
    [basename(celPath), frozen],
    [graph.filePath, frozen],
  ]);

  const coverage = deriveCoverage(artifact, index, anchorText);
  // Pure §9 validators + the #250 Todo C fs resolve/hash checks (this layer has `artifactPath`, so the CARRIER dir; the pure
  // validator is fs-free). MERGE then recompute every count + pass from the merged set — the C findings are `integrity`, so
  // worklist/waiver counts are unaffected, but errorCount/warningCount/pass must see them.
  const findings = [
    ...validateProvenance(artifact, index, anchorText, { celCaseIds, frozenCaseIds, mode }),
    ...derivedFromResolutionFindings(artifactPath, artifact),
  ];
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    artifact,
    anchor: { filePath: anchorPath, text: anchorText, meta: artifact.anchorSource },
    graph,
    index,
    coverage,
    findings,
    celCaseIds,
    frozenCaseIds,
    errorCount,
    manualReviewCount: findings.filter((f) => f.severity === "manual-review").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    worklistCount: findings.filter((f) => f.class === "attribution").length,
    waiverCount: findings.filter((f) => WAIVER_KINDS.has(f.kind)).length,
    // Constrain to WAIVER_KINDS (not just scrutiny==="scrutinize") so a stray non-waiver scrutiny can never push this
    // above waiverCount and make the CLI's derived routine count (waiverCount - waiverScrutinizeCount) go negative.
    waiverScrutinizeCount: findings.filter(
      (f) => WAIVER_KINDS.has(f.kind) && f.scrutiny === "scrutinize",
    ).length,
    // pass stays errorCount===0: in worklist mode the attribution backlog is "warning" → doesn't fail.
    pass: errorCount === 0,
  };
}

export interface ValidateProvenanceFilesResult {
  policyId: string;
  policyVersion: string;
  diagnostics: ProvenanceIndexDiagnostic[];
  findings: ProvenanceFinding[];
  errorCount: number;
  manualReviewCount: number;
  warningCount: number;
  /** Count of attribution-class findings (the coverage backlog) — the KE's "remaining work" tally; warning-graded in worklist mode. */
  worklistCount: number;
  /** Count of WAIVER-kind findings (the judge-lens escape hatches to adjudicate) — FINAL mode only; all manual-review. */
  waiverCount: number;
  /** Of `waiverCount`, the ones flagged `scrutiny:"scrutinize"` (the Judge must adjudicate); the rest are routine rubber-stamps. */
  waiverScrutinizeCount: number;
  pass: boolean;
}

const QUOTE = (s: string): string => `"${s}"`;
const refList = (refs: ProvNodeRef[]): string =>
  refs.map((r) => r.nodeId ?? `${r.kind} ${r.name}`).join(", ");

/** Map one cockpit-correspondence result to a ProvenanceFinding. Integrity/error (never softened); the ref navigates
 *  to the first bleed/miss row where available. The unmapped-runtime-node message names the delegated nodeId and cites
 *  #171/#173 — it is a tool-deferred join gap, NOT an artifact defect, so it does not blame the artifact. */
function correspondenceFinding(c: CorrespondenceCheckResult): ProvenanceFinding {
  if (c.kind === "mismatch") {
    const phrases: string[] = [];
    const parts: string[] = [];
    if (c.bleed.length) {
      phrases.push("lights rows it doesn't walk");
      parts.push(`bleed: ${refList(c.bleed)}`);
    }
    if (c.miss.length) {
      phrases.push("misses rows on its path");
      parts.push(`missing: ${refList(c.miss)}`);
    }
    const ref = c.bleed[0] ?? c.miss[0];
    return {
      kind: "cockpit-correspondence",
      severity: "error",
      class: "integrity",
      // phrases joined with " / " (no empty branch → no double-space); the parts detail follows in parens.
      message: `cockpit correspondence: case ${QUOTE(c.caseName)} ${phrases.join(" / ")} (${parts.join("; ")})`,
      ...(ref ? { ref } : {}),
    };
  }
  let detail: string;
  if (c.reason === "render-failed") {
    detail = `scenario render failed — cannot verify the cockpit against the cases${
      c.details && c.details.length ? ` (${c.details.join("; ")})` : ""
    }`;
  } else if (c.reason === "unmapped-runtime-node") {
    detail = `${c.reason}: delegated node(s) ${(c.details ?? []).join(", ")} have no provenance/structure row — a same-library inlined \`use decision\` the runtime VM nests under the caller but provenance addresses standalone (deferred join, #171/#173); not an artifact defect`;
  } else {
    detail = c.reason;
  }
  return {
    kind: "cockpit-correspondence",
    severity: "error",
    class: "integrity",
    message: `cockpit correspondence unchecked for case ${QUOTE(c.caseName)}: ${detail}`,
  };
}

/** Thin projection of `resolveProvenance` — the findings + counts surface for the CLI and the `validate_provenance` MCP tool. */
export function validateProvenanceFiles(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
  mode: ProvenanceValidationMode = "final",
): ValidateProvenanceFilesResult {
  const r = resolveProvenance(artifactPath, celPath, anchorPath, mode);

  // FINAL mode ONLY: fold in the provenance↔cockpit correspondence gate. It runs the cockpit's OWN resolution
  // (crlAnchorsForUnits over the real crlRevealMaps) against each case's run path — green ⇒ the cockpit lights exactly
  // each case's path. Worklist mode SKIPS it (the in-progress scaffold's correspondence isn't a "remaining-work" item).
  const correspondenceFindings: ProvenanceFinding[] =
    mode === "final"
      ? checkCockpitCorrespondence(buildCockpitModelFromResolved(r, { artifactPath, celPath })).map(
          correspondenceFinding,
        )
      : [];

  // MERGE (do not mutate r.findings) then RECOMPUTE the severity counts + pass from the merged set — the stale
  // r.errorCount/r.pass predate the correspondence findings. cockpit-correspondence is neither attribution nor a
  // waiver, so worklist/waiver counts are unchanged (carried from r).
  const findings = [...r.findings, ...correspondenceFindings];
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    policyId: r.artifact.policyId,
    policyVersion: r.artifact.policyVersion,
    diagnostics: r.index.diagnostics,
    findings,
    errorCount,
    manualReviewCount: findings.filter((f) => f.severity === "manual-review").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    worklistCount: r.worklistCount,
    waiverCount: r.waiverCount,
    waiverScrutinizeCount: r.waiverScrutinizeCount,
    pass: errorCount === 0,
  };
}
