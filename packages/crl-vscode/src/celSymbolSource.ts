// Shared CRL-symbol source for the CEL language-service adapters (#4 fix). The .cel services resolve their
// CRL symbols (the covered library's concepts/decisions/activities) via the .cel's covered CLOSURE —
// resolveCelImports — the same path render_scenario + the CEL validator use. NOT the CRL ProjectIndex: it
// gates on isCrlProject (a package.json crl.libraries or ≥2 root .crl) and seeds from the workspace folder,
// so for a .cel whose covered .crl sits outside a CRL-project layout (e.g. a policy fixture) it returns the
// WRONG project's declarations (or none) — hover/definition/completion on concepts/decisions then find
// nothing. Overlays the live .cel buffer + unsaved LOCAL .crl buffers (package libraries under node_modules
// are read from disk — scanNodeModules is not overlay-aware) so covers/decls reflect in-editor edits.
//
// Resolves fresh per call. For the small projects this targets that's cheap; a registry cache is a deferred
// perf optimization if large projects lag on completion (resolveCelImports rebuilds the .crl closure each
// call, and completion fires per trigger char). A cache must invalidate on overlay change — key it on the
// index's overlay version (the ProjectIndex already clears its cache on every setOverlay), not a naive memoize.
import * as vscode from "vscode";
import { resolveCelImports } from "@smile-digital-health/crl";
import { canonicalize, celSymbolsIndex, type CelSymbolSource, type ProjectIndex } from "@smile-digital-health/crl/language-services";

const EMPTY: CelSymbolSource = { getAllProjectDeclarations: () => [], getAllProjectLibraries: () => [] };

export function celSymbolSource(document: vscode.TextDocument, index: ProjectIndex): CelSymbolSource {
  try {
    const overlays = new Map(index.getOverlays());
    overlays.set(canonicalize(document.uri.fsPath), document.getText()); // canonical key — resolver looks up canonically
    return celSymbolsIndex(resolveCelImports(document.uri.fsPath, { overlays }));
  } catch (e) {
    // mid-edit covers / fs error → degrade to no CRL symbols rather than throw inside a provider. Log so a real
    // regression (a throw inside celSymbolsIndex) isn't silently invisible; covers typos surface via diagnostics.
    console.warn(`celSymbolSource: ${e instanceof Error ? e.message : String(e)}`);
    return EMPTY;
  }
}
