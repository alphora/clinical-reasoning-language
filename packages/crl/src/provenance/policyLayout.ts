// #212 — the policy source-layout primitive. Given any path inside a policy artifact (a `.cel`, a `.crl`, …), find the
// policy's `src/` directory (the one carrying `provenance/`). Extracted to core (from crl-vscode's provenanceFindings) so the
// flag store (`flags/mvFlagStore`) AND the crl-vscode provenance/MV code share ONE resolver; crl-vscode re-exports it, so its
// existing consumers stay edit-free. Pure (node:fs + path); no crl-vscode deps.
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Walk UP from `startPath` to the nearest ancestor directory named `src` that contains a `provenance/` child — the policy's
 *  source root. `undefined` when none is found (the path isn't inside a discoverable policy artifact). NOTE: despite the
 *  parameter name, ANY path under the tree resolves (it walks up from `dirname(startPath)`), not only a `.cel`. */
export function findPolicySrc(startPath: string): string | undefined {
  let dir = dirname(startPath);
  for (;;) {
    if (basename(dir) === "src" && existsSync(join(dir, "provenance"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
