// Path canonicalization for language services + the import resolver (#132 step 2).
// Extracted from projectIndex so the host abstraction (host.ts) does not depend on the
// Node-coupled projectIndex module — keeps the dependency direction leaf-ward and lets
// the future projectIndex→host wiring avoid an import cycle.
import * as path from "node:path";

/**
 * Canonicalize an absolute path to match `IndexedDeclaration.filePath` (uppercase drive
 * on Windows — set by the package's `canonicalizeFsPath`). Without this, every
 * "is this decl in the current file?" filter strips its entire input on Windows.
 */
export function canonicalize(absPath: string): string {
  const resolved = path.resolve(absPath);
  if (process.platform === "win32" && /^[a-z]:/.test(resolved)) {
    return resolved.charAt(0).toUpperCase() + resolved.slice(1);
  }
  return resolved;
}
