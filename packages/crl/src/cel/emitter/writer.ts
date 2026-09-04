import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import * as path from "path";

import type { EmitResult } from "./types";

/** The compartment root every CEL resource is written under. The whole of what this emitter owns. */
const CEL_COMPARTMENT_ROOT = "patient";

/** Name of the on-disk manifest, beside the tree it describes. */
export const CEL_DATA_MANIFEST = "cel-data-manifest.json";

/** One planned write: the resolved target, the exact bytes, and their hash. */
interface PlannedWrite {
  file: string;
  rel: string;
  bytes: string;
  sha256: string;
  id: string;
  resourceType: string;
}

/**
 * ⭐⭐ PLAN AND VALIDATE EVERY WRITE BEFORE ANYTHING IS DELETED.
 *
 * ⚠⚠ THIS ORDERING IS THE SAFETY PROPERTY, not a style choice. The wipe used to run first while the
 * traversal check ran per-resource inside the write loop, so a malformed `EmitResult` DELETED the tree
 * and only then threw. MEASURED before the fix: a call that failed its own containment check left
 * pre-existing case data gone. The one failure that used to write nothing became the one that destroyed
 * the most. Do NOT move the wipe above this function.
 *
 * ⭐ It also removes a hazard instead of documenting one: bytes are serialized ONCE here, and are both
 * written and hashed from this object, so a manifest `sha256` cannot drift from the file it describes.
 * The previous shape re-serialized `body` in a second function and asked future editors to keep the two
 * in sync — a matched pair a test can only catch AFTER it diverges. Same pattern the results producer
 * already uses (`results/runProducer.ts`: bytes once, write bytes, hash bytes).
 */
function planWrites(result: EmitResult, baseAbs: string): PlannedWrite[] {
  const basePrefix = baseAbs.endsWith(path.sep) ? baseAbs : baseAbs + path.sep;
  const plan: PlannedWrite[] = [];
  for (const c of result.emittedCases) {
    for (const r of c.resources) {
      const file = path.resolve(path.join(baseAbs, r.outputPath, `${r.id}.json`));
      if (file !== baseAbs && !file.startsWith(basePrefix)) {
        throw new Error(
          `Path traversal blocked: resolved write target "${file}" escapes outDir "${baseAbs}" ` +
            `(outputPath: "${r.outputPath}", id: "${r.id}")`,
        );
      }
      const bytes = `${JSON.stringify(r.body, null, 2)}\n`;
      plan.push({
        file,
        // `/`-joined to match what the emitter produces, so a manifest path is portable and a consumer
        // on any platform resolves it against the tree root the same way.
        rel: `${r.outputPath}/${r.id}.json`,
        bytes,
        sha256: createHash("sha256").update(bytes, "utf8").digest("hex"),
        id: r.id,
        resourceType: r.resourceType,
      });
    }
  }
  return plan;
}

/**
 * ⭐⭐ WIPE THE COMPARTMENT TREE. The CEL data tree is ours.
 *
 * ⚠ OPERATOR RULING: "we own the cel folders too so we should delete everything then populate."
 * `<out>/patient/` is generated output, so anything in it this emit did not produce is superseded.
 * Do not hand-author there.
 *
 * WHY A WIPE RATHER THAN AN OVERWRITE, measured in the field: a CEL suite went 47 → 48 cases with 12
 * case ids renamed, and the old compartments simply stayed — 60 directories and 964 stale files for a
 * 48-case suite, because overwriting leaves a renamed case's entire directory behind.
 *
 * ⭐ AND THE COST IS NOT LOCAL. The knowledge engineer's downstream mirror-and-prune reported `0 pruned`
 * and was CORRECT — the stale directories were in its SOURCE, so it copied all 964 into the published
 * artifact and certified them. A non-pruning generator does not merely leave junk in its own output: it
 * converts every downstream consumer's correct prune into a no-op, silently, because "source and
 * destination agree" is exactly what a mirror is supposed to report.
 *
 * ⚠ THE OLD MANIFEST GOES WITH IT. If a write fails after this point, NO manifest is the honest state —
 * leaving the previous one would have it certify a tree that was just deleted, which is the same
 * manufactured confidence one level in.
 */
function wipeCompartmentTree(baseAbs: string): void {
  // `maxRetries` is for Windows: an AV scanner or the indexer holding a handle yields a transient
  // EPERM/ENOTEMPTY on a recursive delete, and this tree reaches ~1000 files in the field.
  rmSync(path.join(baseAbs, CEL_COMPARTMENT_ROOT), { recursive: true, force: true, maxRetries: 3 });
  rmSync(path.join(baseAbs, CEL_DATA_MANIFEST), { force: true, maxRetries: 3 });
}

/**
 * The manifest, written beside the tree, LAST.
 *
 * ⚠ A FACT, NOT A PROMISE. Asked for by the consuming project ahead of pruning, and their reasoning is
 * the right one: "a manifest is a fact I can check; a prune is an action I have to trust." The wipe
 * makes the tree correct; this makes it AUDITABLE — by anyone, later, with no memory of what the run
 * wrote. `emit_cel` previously returned its resource list in the RESPONSE only, so the tree could be
 * checked solely by whoever still held that response.
 *
 * ⚠ NO `generatedAt`. `emit_cel` is a pure function of the `.cel` source — there is no run to timestamp,
 * and a clock here would make every re-emit a git diff over a byte-identical tree, defeating the
 * cheapest staleness check available: re-emit and see whether `git status` is clean. (The questionnaire
 * manifest keeps its `generatedAt` because an ENGINE RUN is a real event with a real time.)
 *
 * ⚠ `artifacts`, not `resources` — the same key `ProducerManifest` uses, so "one verification routine
 * covers both trees" is a true claim rather than a nearly-true one.
 *
 * Per-artifact `sha256` lets a consumer verify the listed files exactly. ⚠ That is integrity OF THE
 * LISTED ARTIFACTS, not proof the tree holds nothing else: for that a consumer must also enumerate the
 * tree and compare its path SET against this manifest.
 */
function writeDataManifest(result: EmitResult, plan: PlannedWrite[], baseAbs: string): string {
  let i = 0;
  const cases = result.emittedCases.map((c) => {
    const artifacts = plan.slice(i, i + c.resources.length).map((w) => ({
      id: w.id,
      resourceType: w.resourceType,
      path: w.rel,
      sha256: w.sha256,
    }));
    i += c.resources.length;
    return { caseName: c.caseName, compartmentDir: c.compartmentDir, artifacts };
  });
  const file = path.join(baseAbs, CEL_DATA_MANIFEST);
  writeFileSync(file, `${JSON.stringify({ schemaVersion: 1, cases }, null, 2)}\n`, "utf-8");
  return file;
}

/**
 * Write an EmitResult's resources to disk under <outDir>/<resource.outputPath>/<id>.json.
 * Returns the absolute paths written, in emit order.
 *
 * `outputPath`/`id` are internally slugified today, but this writer is a public surface reachable over
 * MCP (the `emit_cel` `out` directory), so guard against a traversal via `..`/absolute components:
 * resolve each target and verify it stays under the resolved `outDir`. (Lexical check — it does not
 * follow a pre-existing symlink out of the tree.) Throws on violation, BEFORE anything is deleted — the
 * caller (CLI: exit non-zero; MCP: isError) surfaces it.
 *
 * `sink`, when provided, is the accumulator: each written path is pushed as it is written, so a caller
 * wrapping this in try/catch can read the partial list on a mid-loop FILESYSTEM failure (disk full,
 * EPERM). ⚠ It stays EMPTY on a validation failure — planning happens first, so an invalid result writes
 * nothing at all. The root `outDir` is created up front (matching the CLI) so a zero-resource result
 * still materializes the directory.
 *
 * ⚠ `<outDir>/patient/` is WIPED and repopulated, and a `cel-data-manifest.json` is left beside it.
 * See `wipeCompartmentTree` for why a wipe rather than an overwrite.
 */
export function writeEmitResult(result: EmitResult, outDir: string, sink?: string[]): string[] {
  const written: string[] = sink ?? [];
  const baseAbs = path.resolve(outDir);
  mkdirSync(baseAbs, { recursive: true });

  // ⚠ PLAN AND VALIDATE FIRST. Nothing is deleted until every target is known-good.
  const plan = planWrites(result, baseAbs);

  wipeCompartmentTree(baseAbs);

  for (const w of plan) {
    mkdirSync(path.dirname(w.file), { recursive: true });
    writeFileSync(w.file, w.bytes, "utf-8");
    written.push(w.file);
  }

  // ⚠ NOT pushed into `written`: that array means RESOURCE paths, and a caller counting or mirroring it
  // must not have the manifest silently change its meaning. Callers needing the path use the exported
  // `CEL_DATA_MANIFEST`, or the `manifest` field on the MCP response.
  writeDataManifest(result, plan, baseAbs);
  return written;
}
