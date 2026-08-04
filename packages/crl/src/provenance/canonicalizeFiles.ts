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
 */
import { writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { buildAnchorArtifact } from "./canonicalize";
import type { CanonicalizeError, CanonicalizeWarning } from "./canonicalize";
import { toCarrierRelative } from "./derivedFromPolicy";

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
 * Rejects (compared by `path.resolve`, so `./x.docx` and `x.docx` collide) any derivation that would OVERWRITE the input
 * `.docx` — reachable two ways: `--out` equal to `--in`, and the default derivation when `--in` already ends in `.txt`
 * (`rx.txt` → strip → `rx` + `.txt` = the input). Either would clobber the source the sidecar's `derivedFrom`/
 * `derivedFromHash` then point at (the buffer is already read, so the text survives, but the on-disk source would not).
 * Also rejects a text/sidecar collision — defensive; the non-empty suffix makes it unreachable, but the guard proves it.
 */
export function deriveAnchorOutputPaths(inPath: string, outPath?: string): AnchorOutputPaths {
  const txtPath = outPath ?? inPath.replace(/\.[^./\\]+$/, "") + ".txt";
  const metaPath = txtPath.replace(/\.txt$/i, "") + SIDECAR_SUFFIX;
  const rIn = resolve(inPath);
  if (resolve(txtPath) === rIn) {
    return {
      ok: false,
      reason: `the text output "${txtPath}" would overwrite the input source "${inPath}" (pass an --out that differs from --in)`,
    };
  }
  if (resolve(metaPath) === rIn) {
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
    }
  // A fail-closed canonicalization is a DOMAIN result (structured error preserved for the MCP success:false envelope).
  | { ok: false; stage: "canonicalize"; error: CanonicalizeError; warnings: CanonicalizeWarning[] }
  // Operational failures. `paths` (bad output derivation) and `carrier` (no carrier-relative representation) fail BEFORE
  // any write — nothing is on disk. `write` may leave PARTIAL output: the two files are written sequentially and are not
  // transactional (per-file atomic writes in A-hardening would still not make the PAIR atomic), so a sidecar-write
  // failure leaves the `.txt` behind. The `message` says which file failed and whether the output is partial.
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

  // Written separately so the `write`-stage message can report which file failed AND whether output is now partial: a
  // failed text write leaves nothing; a failed sidecar write leaves the `.txt` without its `.anchormeta.json`.
  try {
    writeFileSync(txtPath, built.text, "utf8");
  } catch (e) {
    return {
      ok: false,
      stage: "write",
      message: `failed to write the canonical text "${txtPath}" (it may be absent or truncated — writeFileSync truncates on open; A-hardening's writeFileAtomic makes this all-or-nothing): ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    writeFileSync(metaPath, JSON.stringify(built.meta, null, 2) + "\n", "utf8");
  } catch (e) {
    return {
      ok: false,
      stage: "write",
      message: `wrote the canonical text "${txtPath}" but failed to write the sidecar "${metaPath}" — output is PARTIAL (the .txt exists without its .anchormeta.json): ${e instanceof Error ? e.message : String(e)}`,
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
  };
}
