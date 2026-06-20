// Headless CEL diagnostics (#4 slice 4). Maps the CEL validator's findings to plain LsDiagnostic[]. The
// validator is INJECTED (like the CRL computeDiagnostics DIs validateCRL) so the lean language-services
// subpath doesn't pull the CEL validator/resolver. The extension adapter owns the DiagnosticCollection
// lifecycle (events, debounce, overlays, the cross-file .crl→.cel re-validate).
import type { LsDiagnostic, ZeroBasedRange } from "./contracts";
import { toZeroBasedRange } from "./contracts";
import { canonicalize } from "./paths";
import type { CELValidationError } from "../cel/validator/types";

/** validateCELFile's shape (injected by the adapter, which imports it from the core root). */
export type CelFileValidator = (
  filePath: string,
  opts: { soft?: boolean; overlays?: ReadonlyMap<string, string> },
) => { errors: CELValidationError[]; warnings: CELValidationError[] };

const ONE_CHAR: ZeroBasedRange = { startLine: 0, startCol: 0, endLine: 0, endCol: 1 };

/**
 * Validate a .cel and return its diagnostics as LsDiagnostic[]. `source` is overlaid for the .cel (the
 * in-editor buffer) on top of `overlays` (unsaved .crl buffers), so validation sees the live edits. Keeps
 * only diagnostics ATTRIBUTED to this .cel (its covers/fact/result errors + re-attributed covered-library
 * dependency signals); diagnostics carrying a different file's path are dropped.
 *
 * Paths are CANONICALIZED first: the validator attributes errors to the canonical path (uppercase Windows
 * drive) and the resolver looks the .cel overlay up by the canonical key — so the raw `doc.uri.fsPath`
 * (lowercase drive) would both miss the overlay and fail the self-file filter, silently dropping every
 * squiggle on Windows. canonicalize() matches the resolver's canonicalizeFsPath.
 */
export function computeCelDiagnostics(
  filePath: string,
  source: string,
  overlays: ReadonlyMap<string, string>,
  validate: CelFileValidator,
): LsDiagnostic[] {
  const self = canonicalize(filePath);
  const merged = new Map(overlays);
  merged.set(self, source);
  const { errors, warnings } = validate(self, { soft: true, overlays: merged });
  return [...errors, ...warnings]
    .filter((e) => canonicalize(e.filePath ?? self) === self)
    .map((e) => ({
      filePath: self,
      range: e.location ? toZeroBasedRange(e.location) : ONE_CHAR,
      severity: e.severity,
      message: e.message,
      code: e.kind,
      source: "crl-cel",
    }));
}
