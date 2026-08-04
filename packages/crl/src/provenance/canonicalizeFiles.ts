/**
 * File-level anchor-source canonicalization — the shared implementation behind the `crl-canonicalize-source` CLI bin
 * AND the `canonicalize_source` MCP tool (so the two cannot drift, mirroring `generateProvenanceFiles` /
 * `validateProvenanceFiles`). Owns the two pieces of logic the CLI + MCP previously each copied: deriving the `.txt` +
 * `<name>.anchormeta.json` output paths, and writing both files. Each caller keeps its OWN input read (the MCP handler
 * adds a size guard the CLI does not) and its OWN result presentation (CLI stderr+exit vs MCP envelope).
 *
 * #250 A — this is the `upstream-source` producer's write half: `derivedFrom` (the `.docx` back-pointer) is written
 * CARRIER-RELATIVE + POSIX, relative to the SIDECAR's directory (the file that carries it), so it resolves on any clone.
 * When the `.docx` and its sidecar are on different drives there is no carrier-relative representation, so we FAIL LOUD
 * (a discriminated failure) rather than stamp a value the #250 detector would rightly reject. `buildAnchorArtifact`
 * stamps `derivedFromContract: "upstream-source"`.
 *
 * #250 A-hardening — both files are written tear-free via {@link writeFileAtomic} (T14), and a best-effort
 * {@link repoEscapeAdvisory} rides the result when the `.docx` resolves outside the carrying checkout (P1/T11).
 */
import { basename, dirname } from "node:path";

import { buildAnchorArtifact } from "./canonicalize";
import type { CanonicalizeError, CanonicalizeWarning } from "./canonicalize";
import { samePath, toCarrierRelative } from "./derivedFromPolicy";
import { repoEscapeAdvisory } from "./repoEscape";
import { writeFileAtomic } from "./writeFileAtomic";

/** The sidecar suffix appended to the text artifact's stem: `<stem>.anchormeta.json`. */
const SIDECAR_SUFFIX = ".anchormeta.json";

export type AnchorOutputPaths =
  | { ok: true; txtPath: string; metaPath: string }
  | { ok: false; reason: string };

/**
 * Derive the canonical `.txt` and the `<name>.anchormeta.json` sidecar paths from the input `.docx` path and an optional
 * explicit `--out`. The SINGLE home for this rule (the CLI + MCP handler previously duplicated it, a drift risk):
 *   - `txtPath` = the explicit `outPath`, else the input path with its last extension replaced by `.txt`;
 *   - `metaPath` = the text path with a trailing `.txt` (case-insensitive) stripped, then `.anchormeta.json` appended
 *     (so a `.txt` output yields `<name>.anchormeta.json`; an output that is not `.txt` yields `<out>.anchormeta.json`).
 * Rejects (compared by {@link samePath} — resolves vs CWD, and folds case on win32 so `RX.docx` IS `rx.docx`) any
 * derivation that would OVERWRITE the input `.docx` — reachable two ways: `--out` equal to `--in`, and the default
 * derivation when `--in` already ends in `.txt` (`rx.txt` → strip → `rx` + `.txt` = the input). Either would clobber the
 * source the sidecar's `derivedFrom`/`derivedFromHash` then point at (the buffer is already read, so the text survives,
 * but the on-disk source would not). Also rejects a text/sidecar collision — defensive; the non-empty suffix makes it
 * unreachable, but the guard proves it.
 */
export function deriveAnchorOutputPaths(inPath: string, outPath?: string): AnchorOutputPaths {
  const txtPath = outPath ?? inPath.replace(/\.[^./\\]+$/, "") + ".txt";
  const metaPath = txtPath.replace(/\.txt$/i, "") + SIDECAR_SUFFIX;
  if (samePath(txtPath, inPath)) {
    return {
      ok: false,
      reason: `the text output "${txtPath}" would overwrite the input source "${inPath}" (pass an --out that differs from --in)`,
    };
  }
  if (samePath(metaPath, inPath)) {
    return {
      ok: false,
      reason: `the sidecar "${metaPath}" would overwrite the input source "${inPath}"`,
    };
  }
  if (metaPath === txtPath) {
    return {
      ok: false,
      reason: `the sidecar path "${metaPath}" collides with the text output path "${txtPath}"`,
    };
  }
  return { ok: true, txtPath, metaPath };
}

export type CanonicalizeToFilesResult =
  | {
      ok: true;
      txtPath: string;
      metaPath: string;
      textHash: string;
      offsetUnit: "utf8-byte";
      byteLength: number;
      warnings: CanonicalizeWarning[];
      /** #250 A-hardening — non-blocking producer advisories (e.g. the `.docx` resolves outside the checkout). Present
       *  only when non-empty; rides the return envelope / stderr, never the determinism-bearing sidecar fields. */
      advisories?: string[];
    }
  // A fail-closed canonicalization is a DOMAIN result (structured error preserved for the MCP success:false envelope).
  | { ok: false; stage: "canonicalize"; error: CanonicalizeError; warnings: CanonicalizeWarning[] }
  // Operational failures. `paths` (bad output derivation) and `carrier` (no carrier-relative representation) fail BEFORE
  // any write — nothing is on disk. `write` may leave PARTIAL output: each file is written atomically (writeFileAtomic),
  // but the two writes are NOT transactional as a pair, so a sidecar-write failure leaves the `.txt` behind. The
  // `message` says which file failed and whether the output is partial.
  | { ok: false; stage: "paths" | "carrier" | "write"; message: string };

/**
 * Canonicalize an already-read `.docx` buffer to its `.txt` + `.anchormeta.json` sidecar, on disk.
 *
 * The caller owns reading `input` (so it can apply its own size guard) and presenting the result. `outPath` is the
 * optional explicit `--out` for the text artifact; the sidecar is derived beside it via {@link deriveAnchorOutputPaths}.
 */
export function canonicalizeSourceToFiles(
  input: Buffer,
  inPath: string,
  outPath?: string,
): CanonicalizeToFilesResult {
  const paths = deriveAnchorOutputPaths(inPath, outPath);
  if (!paths.ok) return { ok: false, stage: "paths", message: paths.reason };
  const { txtPath, metaPath } = paths;

  // #250 A — carrier is the SIDECAR's directory (the record lives in `<name>.anchormeta.json`). Cross-drive → fail loud.
  const carrierDir = dirname(metaPath);
  const rel = toCarrierRelative(inPath, carrierDir);
  if (!rel.ok) {
    return {
      ok: false,
      stage: "carrier",
      message: `cannot record a carrier-relative derivedFrom for the source "${inPath}" against the sidecar directory "${carrierDir}": ${rel.reason} (attempted "${rel.attempted}"). The .docx and its .anchormeta.json sidecar must be on the same drive.`,
    };
  }

  const built = buildAnchorArtifact(input, basename(txtPath), rel.path);
  if (!built.ok)
    return { ok: false, stage: "canonicalize", error: built.error, warnings: built.warnings };

  // #250 A-hardening (P1/T11) — advise (non-blocking) when the `.docx` resolves outside the carrying checkout.
  const escape = repoEscapeAdvisory(inPath, carrierDir);

  // Each file is written tear-free (writeFileAtomic); reported separately so the `write`-stage message can name the
  // failed file AND whether the output is partial: a failed text write leaves NOTHING (atomic); a failed sidecar write
  // leaves the `.txt` without its `.anchormeta.json` (the pair is not transactional).
  try {
    writeFileAtomic(txtPath, built.text);
  } catch (e) {
    return {
      ok: false,
      stage: "write",
      // Atomic: the failed rename never touched the target, so no NEW text landed and any pre-existing "${txtPath}" is unchanged.
      message: `failed to write the canonical text "${txtPath}" (no new text was written; any existing file is unchanged): ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    writeFileAtomic(metaPath, JSON.stringify(built.meta, null, 2) + "\n");
  } catch (e) {
    return {
      ok: false,
      stage: "write",
      // The new .txt already landed atomically; the sidecar did NOT, so it is now MISSING (fresh) or STALE (a prior
      // sidecar left in place, mismatched with the new text) — either way the pair on disk is inconsistent.
      message: `wrote the canonical text "${txtPath}" but failed to write the sidecar "${metaPath}" — the sidecar is now MISSING or STALE and inconsistent with the new text: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    ok: true,
    txtPath,
    metaPath,
    textHash: built.meta.textHash,
    offsetUnit: built.meta.offsetUnit,
    byteLength: Buffer.byteLength(built.text, "utf8"),
    warnings: built.meta.warnings,
    ...(escape ? { advisories: [escape] } : {}),
  };
}
