import { readFileSync } from "fs";

import { buildCEL } from "../index";
import { findProjectRoot, buildRegistry } from "../../imports";
import { canonicalizeFsPath } from "../../imports/paths";

import type { ResolvedCelGraph, CelImportDiagnostic } from "./types";

export interface ResolveCelImportsOptions {
  /**
   * In-memory file overlay map, keyed by absolute canonical path. Forwarded
   * to `buildRegistry` so editor/MCP overlays propagate into the CRL closure
   * scan. The .cel file itself is also overlaid if its canonical path is
   * present in this map.
   */
  overlays?: ReadonlyMap<string, string>;
}

/**
 * Resolve a .cel file's external dependencies. Builds the underlying CRL
 * registry (using CRL's existing closure-walk + `package.json` discovery)
 * and resolves the `covers` declaration against it.
 *
 * Heavy lifting (cross-reference correctness, qualified `defined by`
 * resolution, intent/leaf-ref checks) belongs to the CEL validator (Todo 4).
 * This resolver's job is the structural bridge: parse → find project root →
 * build CRL registry → match `covers`.
 */
export function resolveCelImports(
  filePath: string,
  options: ResolveCelImportsOptions = {},
): ResolvedCelGraph {
  const canonical = canonicalizeFsPath(filePath);
  const diagnostics: CelImportDiagnostic[] = [];

  // 1. Parse the .cel file (overlay-aware).
  const source = options.overlays?.get(canonical) ?? readFileSync(canonical, "utf-8");
  const built = buildCEL(source);
  const cel = built.success ? built.result : undefined;
  const celParseErrors = built.errors ?? [];

  // 2. Find the project root.
  const projectRoot = findProjectRoot(canonical);
  if (!projectRoot) {
    diagnostics.push({
      kind: "project-root-not-found",
      severity: "error",
      fromPath: canonical,
    });
    return {
      filePath: canonical,
      ...(cel ? { cel } : {}),
      celParseErrors,
      diagnostics,
    };
  }

  // 3. Build the CRL registry for the same project.
  const { registry, diagnostics: crlDiags } = buildRegistry(projectRoot, options.overlays);
  for (const d of crlDiags) {
    diagnostics.push({ kind: "crl-import", severity: d.severity, underlying: d });
  }

  // 4. Resolve `covers` (if present).
  let coversTarget: ResolvedCelGraph["coversTarget"] = undefined;
  if (cel?.covers) {
    const name = cel.covers.name;
    // Local siblings win; package-installed libraries are the fallback.
    coversTarget = registry.byNameLocal.get(name) ?? registry.byNamePackage.get(name);
    if (!coversTarget) {
      diagnostics.push({
        kind: "unresolved-covers",
        severity: "error",
        coversName: name,
        filePath: canonical,
      });
    }
  } else if (cel && cel.statements.some((s) => s.type === "CELCase")) {
    // Pitch v4: covers is required when the file has at least one case.
    diagnostics.push({
      kind: "covers-missing-but-cases-present",
      severity: "error",
      filePath: canonical,
    });
  }

  return {
    filePath: canonical,
    ...(cel ? { cel } : {}),
    projectRoot,
    crlRegistry: registry,
    ...(coversTarget ? { coversTarget } : {}),
    celParseErrors,
    diagnostics,
  };
}
