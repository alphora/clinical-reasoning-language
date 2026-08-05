import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";

import type { EmitResult } from "./types";

/**
 * Write an EmitResult's resources to disk under <outDir>/<resource.outputPath>/<id>.json.
 * Returns the absolute paths written, in emit order.
 *
 * `outputPath`/`id` are internally slugified today, but this writer is a public
 * surface reachable over MCP (the `emit_cel` `out` directory), so guard against
 * a traversal via `..`/absolute components: resolve each target and verify it
 * stays under the resolved `outDir`. (Lexical check — it does not follow a
 * pre-existing symlink out of the tree.) Throws on violation — the caller (CLI:
 * exit non-zero; MCP: isError) surfaces it.
 *
 * `sink`, when provided, is the accumulator: each written path is pushed as it
 * is written, so a caller wrapping this in try/catch can read the partial list
 * on a mid-loop failure. The root `outDir` is created up front (matching the
 * CLI) so a zero-resource result still materializes the directory.
 */
export function writeEmitResult(result: EmitResult, outDir: string, sink?: string[]): string[] {
  const written: string[] = sink ?? [];
  const baseAbs = path.resolve(outDir);
  const basePrefix = baseAbs.endsWith(path.sep) ? baseAbs : baseAbs + path.sep;
  mkdirSync(baseAbs, { recursive: true });
  for (const c of result.emittedCases) {
    for (const r of c.resources) {
      const dir = path.resolve(path.join(baseAbs, r.outputPath));
      const file = path.resolve(path.join(dir, `${r.id}.json`));
      if (file !== baseAbs && !file.startsWith(basePrefix)) {
        throw new Error(
          `Path traversal blocked: resolved write target "${file}" escapes outDir "${baseAbs}" ` +
            `(outputPath: "${r.outputPath}", id: "${r.id}")`,
        );
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(r.body, null, 2) + "\n", "utf-8");
      written.push(file);
    }
  }
  return written;
}
