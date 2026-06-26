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
import { basename } from "node:path";

import { resolveCelImports } from "../cel/imports";

import type { AnchorSourceMeta, ProvenanceArtifact } from "./artifact";
import { CANONICALIZER_NAME, CANONICALIZER_VERSION } from "./canonicalize";
import {
  generateProvenanceScaffold,
  mergeScaffold,
  type GenerateDiagnostic,
  type MergeDiagnostic,
} from "./generate";
import { collectLibs } from "./indexer";

/** sha256 of a UTF-8 string, in the `sha256:<lowercase-hex>` shape the canonicalizer + validators use for textHash. */
function sha256Hex(text: string): string {
  return "sha256:" + createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/** Build the §6 anchor metadata for an ALREADY-CANONICAL `.txt`. We hash the provided bytes (NOT a `.docx`): the
 *  canonical text is its own source here, so derivedFrom/derivedFromHash mirror the anchor path + its textHash.
 *
 *  NOTE — this DIVERGES from canonicalize.ts's AnchorMeta contract, where `derivedFrom` is the source `.docx` and
 *  `derivedFromHash` is the `.docx` bytes' hash. This CLI treats the canonical `.txt` as its OWN source and therefore
 *  does NOT carry the original `.docx` provenance. It is functionally harmless — `validateProvenance` reads only
 *  `textHash`, never derivedFrom/derivedFromHash — but a consumer wanting true `.docx` provenance should read the
 *  `<name>.anchormeta.json` sidecar `crl-canonicalize-source` writes. Threading that sidecar through here (so the
 *  artifact carries the real docx back-pointers) is a deferred enhancement. */
function anchorMetaFor(anchorPath: string, anchorText: string): AnchorSourceMeta {
  const textHash = sha256Hex(anchorText);
  return {
    // match how the artifact's anchorSource.path reads elsewhere (the canonicalize CLI stores the basename).
    path: basename(anchorPath),
    derivedFrom: anchorPath,
    derivedFromHash: textHash,
    canonicalizer: CANONICALIZER_NAME,
    canonicalizerVersion: CANONICALIZER_VERSION,
    textHash,
    offsetUnit: "utf8-byte",
    unicodeNormalization: "NFC",
    rangeConvention: "half-open",
  };
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
}

/**
 * Generate a provenance scaffold from a policy `.cel` + its canonical anchor-source `.txt`.
 *
 * @param celPath        absolute path to the policy `.cel` (imports walk to the nearest package.json).
 * @param anchorPath     absolute path to the canonical anchor-source `.txt` (already canonicalized; we hash its bytes).
 * @param opts.policyVersion          policy version stamped into the artifact (default "1").
 * @param opts.existingArtifactPath   when set, the fresh scaffold is merged onto this existing artifact (mergeScaffold);
 *                                    the returned artifact is the MERGED one + `mergeDiagnostics` is populated.
 */
export function generateProvenanceFiles(
  celPath: string,
  anchorPath: string,
  opts?: { policyVersion?: string; existingArtifactPath?: string },
): GenerateProvenanceFilesResult {
  const policyVersion = opts?.policyVersion ?? "1";
  const anchorText = readFileSync(anchorPath, "utf8");
  const anchorSource = anchorMetaFor(anchorPath, anchorText);

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
  });

  // No --merge: the fresh scaffold IS the result; only the generate channel is populated.
  if (!opts?.existingArtifactPath) {
    return {
      policyId,
      policyVersion,
      artifact: fresh.artifact,
      diagnostics: fresh.diagnostics,
      merged: false,
    };
  }

  // --merge: overlay the fresh STRUCTURE onto the existing artifact's preserved KE WORK (items, ref statuses, …). The
  // merged artifact is the result; we surface BOTH channels — the merge diagnostics (what the re-gen changed) AND the
  // generate diagnostics (the up-to-date attribution worklist against the fresh structure).
  const existing = JSON.parse(
    readFileSync(opts.existingArtifactPath, "utf8"),
  ) as ProvenanceArtifact;
  const merge = mergeScaffold(existing, fresh.artifact);
  return {
    policyId,
    policyVersion,
    artifact: merge.artifact,
    diagnostics: fresh.diagnostics,
    mergeDiagnostics: merge.diagnostics,
    merged: true,
  };
}
