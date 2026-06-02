import * as path from "path";

/**
 * Canonical form for filesystem paths used as keys in registries / overlay
 * maps. Resolves to absolute and on Windows uppercases the drive letter so
 * that two paths that differ only by drive-letter case (a real divergence
 * between `path.resolve` output and VS Code's `Uri.fsPath`) still compare
 * equal.
 *
 * Must be applied at BOTH set-time and lookup-time anywhere paths flow
 * across the package/extension boundary (overlay map keys are the canonical
 * example).
 */
export function canonicalizeFsPath(p: string): string {
  const resolved = path.resolve(p);
  if (process.platform === "win32" && /^[a-z]:/.test(resolved)) {
    return resolved.charAt(0).toUpperCase() + resolved.slice(1);
  }
  return resolved;
}
