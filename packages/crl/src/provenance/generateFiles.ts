/**
 * File-level provenance SCAFFOLD generation — the shared implementation behind the `crl-generate-provenance` CLI bin
 * AND the `generate_provenance` MCP tool (so the two cannot drift, mirroring how `validateProvenanceFiles` is shared
 * between the validate CLI + tool). Does the read-files → derive-anchor-meta → resolve-CRL-closure → generate-scaffold
 * (→ optional merge-onto-an-existing-artifact) pipeline ONCE and returns the artifact + BOTH diagnostic channels.
 *
 * The anchor is the ALREADY-CANONICAL text (a `.txt` produced by `crl-canonicalize-source`): we hash the provided
 * bytes — we do NOT re-canonicalize a `.docx` here. `derivedFrom`/`derivedFromHash` therefore point at the `.txt`
 * itself (the canonical artifact is its own source from this CLI's standpoint), with the same sha256 as `textHash`.
 *
 * Throws on unreadable/invalid input (the anchor read, the CEL resolution, a malformed `--merge` JSON) — callers (the
 * CLI / the MCP handler) catch and present.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { resolveCelImports } from "../cel/imports";

import type { AnchorSourceMeta, ProvenanceArtifact } from "./artifact";
import { CANONICALIZER_NAME, CANONICALIZER_VERSION } from "./canonicalize";
import { classifyDerivedFrom, toCarrierRelative } from "./derivedFromPolicy";
import { repoEscapeAdvisory } from "./repoEscape";
import {
  generateProvenanceScaffold,
  mergeScaffold,
  type GenerateDiagnostic,
  type MergeDiagnostic,
} from "./generate";
import { collectLibs } from "./indexer";
import { parseProvenanceArtifact } from "./loadArtifact";

/** sha256 of a UTF-8 string, in the `sha256:<lowercase-hex>` shape the canonicalizer + validators use for textHash. */
function sha256Hex(text: string): string {
  return "sha256:" + createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/** Build the §6 anchor metadata for an ALREADY-CANONICAL `.txt`. We hash the provided bytes (NOT a `.docx`): the
 *  canonical text is its own source here (the Model-A / `anchor-self` contract — `derivedFrom` names the anchor `.txt`
 *  itself and `derivedFromHash === textHash` by construction), so `validate_provenance` reads only `textHash`, never the
 *  back-pointers.
 *
 *  #250 A — `derivedFrom` is written CARRIER-RELATIVE + POSIX (relative to `carrierDir`, the directory of the file that
 *  will carry this record — the artifact JSON), so the anchor resolves on any clone; `derivedFromContract` is stamped
 *  `anchor-self`. FAILS LOUDLY (throws) when no carrier-relative representation exists (anchor + artifact on different
 *  drives) rather than emit a value the #250 detector would reject.
 *
 *  NOTE — this DIVERGES from canonicalize.ts's AnchorMeta contract (`upstream-source`: `derivedFrom` is the source `.docx`,
 *  `derivedFromHash` is the `.docx` bytes). This CLI treats the canonical `.txt` as its OWN source; a consumer wanting the
 *  true `.docx` provenance reads the `<name>.anchormeta.json` sidecar. Threading that sidecar through here is deferred. */
function anchorMetaFor(
  anchorPath: string,
  anchorText: string,
  carrierDir: string,
): AnchorSourceMeta {
  const textHash = sha256Hex(anchorText);
  const rel = toCarrierRelative(anchorPath, carrierDir);
  if (!rel.ok) {
    throw new Error(
      `cannot record a carrier-relative derivedFrom for anchor "${anchorPath}" against carrier dir "${carrierDir}": ${rel.reason} (attempted "${rel.attempted}"). The anchor and the artifact destination must be on the same drive.`,
    );
  }
  return {
    // match how the artifact's anchorSource.path reads elsewhere (the canonicalize CLI stores the basename).
    path: basename(anchorPath),
    derivedFrom: rel.path,
    derivedFromHash: textHash,
    derivedFromContract: "anchor-self",
    canonicalizer: CANONICALIZER_NAME,
    canonicalizerVersion: CANONICALIZER_VERSION,
    textHash,
    offsetUnit: "utf8-byte",
    unicodeNormalization: "NFC",
    rangeConvention: "half-open",
  };
}

/**
 * #250 A — REBASE the `derivedFrom` of a PRESERVED (Rule-1 drift-keep) anchorSource from the previous carrier dir to the
 * output carrier dir. The MARKER is already guaranteed upstream by `mergeScaffold`'s `ensureAnchorMarker` (so the merged
 * artifact is loader-valid regardless of this step); this dir-aware step lives in the wrapper because `mergeScaffold` is
 * path-ignorant. Two cases the design pins (disc 377 / P3):
 *   - a legacy ABSOLUTE/MALFORMED `derivedFrom` is copied VERBATIM — rebasing a dead path would MASK the defect the
 *     detector must keep surfacing; candidate recovery is the normalizer E's job;
 *   - a valid carrier-relative path that CANNOT be rebased (the old + new carriers are on different drives) THROWS —
 *     silently keeping it would leave a lexically-`ok` path that resolves against the WRONG carrier (undetectable), the
 *     exact defect class #250 exists to kill. Fail loud, consistent with the fresh producer.
 */
function rebasePreservedDerivedFrom(
  a: AnchorSourceMeta,
  previousCarrierDir: string,
  newCarrierDir: string,
): AnchorSourceMeta {
  if (classifyDerivedFrom(a.derivedFrom) !== "ok") return a;
  const rebased = toCarrierRelative(resolve(previousCarrierDir, a.derivedFrom), newCarrierDir);
  if (!rebased.ok) {
    throw new Error(
      `cannot rebase the preserved derivedFrom "${a.derivedFrom}" from "${previousCarrierDir}" to the merged artifact's carrier "${newCarrierDir}": ${rebased.reason}. The merge destination and the source must be on the same drive.`,
    );
  }
  return { ...a, derivedFrom: rebased.path };
}

export interface GenerateProvenanceFilesResult {
  policyId: string;
  policyVersion: string;
  artifact: ProvenanceArtifact;
  /**
   * The FRESH-scaffold worklist / over-reach BASELINE (attribution-needed, over-reach baseline, CEL freeze/ambiguity,
   * …) — ALWAYS present, computed on the all-provisional fresh scaffold. This is the DIFF ORIGIN, NOT the merged
   * artifact's residual: when `merged` is true the returned `artifact` is the merged one but these diagnostics still
   * describe the pre-merge baseline. For the merged artifact's residual, run `validate_provenance` on the output.
   */
  diagnostics: GenerateDiagnostic[];
  /** merge-channel diagnostics (source-changed, needs-relink, orphaned-cluster, …) — present ONLY when `--merge` ran. */
  mergeDiagnostics?: MergeDiagnostic[];
  /** true ⇔ the fresh scaffold was overlaid onto an existing artifact via mergeScaffold (the returned artifact is merged). */
  merged: boolean;
  /** #250 A — producer advisories (non-blocking; ride the return envelope / stderr, never the artifact). e.g. the P8
   *  dest-less fallback. Present only when non-empty. */
  advisories?: string[];
}

/**
 * Generate a provenance scaffold from a policy `.cel` + its canonical anchor-source `.txt`.
 *
 * @param celPath        absolute path to the policy `.cel` (imports walk to the nearest package.json).
 * @param anchorPath     absolute path to the canonical anchor-source `.txt` (already canonicalized; we hash its bytes).
 * @param opts.policyVersion          policy version stamped into the artifact (default "1").
 * @param opts.existingArtifactPath   when set, the fresh scaffold is merged onto this existing artifact (mergeScaffold);
 *                                    the returned artifact is the MERGED one + `mergeDiagnostics` is populated.
 * @param opts.clusterBy              clustering strategy (#174): "decision" (DEFAULT) = one cluster per covered decision;
 *                                    "disposition-path" = one cluster per run path + a policy-owned-leaf coverage cluster.
 *                                    NOTE: changing clusterBy is a STRUCTURAL mode switch, not a safe regen — a `--merge`
 *                                    across modes orphans the prior mode's clusters (surfaced as merge diagnostics).
 * @param opts.artifactCarrierPath    #250 A — the path the artifact JSON will be WRITTEN to; `anchorSource.derivedFrom` is
 *                                    made relative to its directory (the carrier). When OMITTED (the artifact is returned
 *                                    inline / to stdout, not persisted here) it falls back to the anchor's own directory
 *                                    and emits an advisory (P8): a caller persisting the artifact elsewhere must run the
 *                                    E-normalizer on save.
 */
export function generateProvenanceFiles(
  celPath: string,
  anchorPath: string,
  opts?: {
    policyVersion?: string;
    existingArtifactPath?: string;
    clusterBy?: "decision" | "disposition-path";
    artifactCarrierPath?: string;
  },
): GenerateProvenanceFilesResult {
  const policyVersion = opts?.policyVersion ?? "1";
  const anchorText = readFileSync(anchorPath, "utf8");

  // #250 A — the carrier is the artifact JSON's directory. Known when the caller passes its destination; otherwise the
  // artifact is not persisted here (inline / stdout), so assume the LIKELY re-save location + advise (P8): a --merge is
  // normally regenerated IN PLACE (the existing artifact's dir); a fresh generate colocates with the anchor.
  const advisories: string[] = [];
  let carrierDir: string;
  if (opts?.artifactCarrierPath) {
    carrierDir = dirname(opts.artifactCarrierPath);
  } else {
    const existingPath = opts?.existingArtifactPath;
    carrierDir = existingPath ? dirname(existingPath) : dirname(anchorPath);
    advisories.push(
      `derivedFrom was made relative to ${existingPath ? "the existing artifact's directory (assumed in-place re-save)" : "the anchor's own directory"} because no artifact destination was given. If you persist the artifact anywhere else, run the provenance normalizer on save (once available) so derivedFrom stays resolvable (#250).`,
    );
  }
  const anchorSource = anchorMetaFor(anchorPath, anchorText, carrierDir);

  // #250 A-hardening (P1/T11) — advise (non-blocking) when the anchor resolves outside the carrying checkout.
  const escape = repoEscapeAdvisory(anchorPath, carrierDir);
  if (escape) advisories.push(escape);

  const graph = resolveCelImports(celPath);
  // policyId = the covered library name (the scaffold's spine). A null coversName means there is no policy anchor: the
  // scaffold would be EMPTY (generate surfaces a no-policy-anchor diagnostic via the index). Rather than silently emit
  // an empty "success" artifact that drops that reason, THROW — the CLI's try/catch + the MCP handler turn it into a
  // clean stderr error / success:false envelope (mirroring resolveProvenance's throw-on-bad-input contract).
  const { coversName } = collectLibs(graph);
  if (!coversName) {
    throw new Error(
      `no covered policy library resolved from ${celPath} (its \`covers\` target did not resolve to a known CRL library).`,
    );
  }
  const policyId = coversName;
  const celFileName = basename(celPath);

  const fresh = generateProvenanceScaffold(graph, {
    policyId,
    policyVersion,
    anchorSource,
    celFileName,
    ...(opts?.clusterBy !== undefined ? { clusterBy: opts.clusterBy } : {}),
  });

  // No --merge: the fresh scaffold IS the result; only the generate channel is populated.
  if (!opts?.existingArtifactPath) {
    return {
      policyId,
      policyVersion,
      artifact: fresh.artifact,
      diagnostics: fresh.diagnostics,
      merged: false,
      ...(advisories.length ? { advisories } : {}),
    };
  }

  // --merge: overlay the fresh STRUCTURE onto the existing artifact's preserved KE WORK (items, ref statuses, …). The
  // merged artifact is the result; we surface BOTH channels — the merge diagnostics (what the re-gen changed) AND the
  // generate diagnostics (the up-to-date attribution worklist against the fresh structure).
  // #250 F — fail-closed on the --merge target's envelope (never a blind cast); generateProvenanceFiles throws on bad
  // input (the CLI/MCP catch + present), so the loader's coded failure becomes that throw.
  const parsedExisting = parseProvenanceArtifact(
    JSON.parse(readFileSync(opts.existingArtifactPath, "utf8")),
  );
  if (!parsedExisting.ok) {
    throw new Error(
      `--merge artifact "${opts.existingArtifactPath}" is not loadable [${parsedExisting.code}]: ${parsedExisting.message}`,
    );
  }
  const existing = parsedExisting.artifact;
  const merge = mergeScaffold(existing, fresh.artifact);

  // #250 A — the carrier rebase of a PRESERVED anchor. `mergeScaffold` already ensured the marker (loader-validity); it
  // preserves `previous.anchorSource` ONLY across an anchor-text drift, whose derivedFrom is relative to the PREVIOUS
  // carrier dir. Detect that by the SAME semantic condition mergeScaffold Rule 1 branches on — the textHash drift — NOT
  // reference identity (a future defensive copy inside mergeScaffold would silently disable an identity check).
  let mergedArtifact = merge.artifact;
  if (existing.anchorSource.textHash !== fresh.artifact.anchorSource.textHash) {
    mergedArtifact = {
      ...mergedArtifact,
      anchorSource: rebasePreservedDerivedFrom(
        mergedArtifact.anchorSource,
        dirname(opts.existingArtifactPath),
        carrierDir,
      ),
    };
  }
  return {
    policyId,
    policyVersion,
    artifact: mergedArtifact,
    diagnostics: fresh.diagnostics,
    mergeDiagnostics: merge.diagnostics,
    merged: true,
    ...(advisories.length ? { advisories } : {}),
  };
}
