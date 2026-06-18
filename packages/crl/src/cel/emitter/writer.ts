import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";

import type { EmitResult } from "./types";

/**
 * Write an EmitResult's resources to disk under <outDir>/<resource.outputPath>/<id>.json.
 * Returns the count of files written.
 */
export function writeEmitResult(result: EmitResult, outDir: string): number {
  let count = 0;
  for (const c of result.emittedCases) {
    for (const r of c.resources) {
      const dir = path.join(outDir, r.outputPath);
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${r.id}.json`);
      writeFileSync(file, JSON.stringify(r.body, null, 2) + "\n", "utf-8");
      count += 1;
    }
  }
  return count;
}
