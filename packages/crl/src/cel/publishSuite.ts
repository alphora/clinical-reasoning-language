// REFACTOR:grounded: aggregate the whole MV set before invoking the existing writer once.
import { join } from "node:path";
import { resolveEmitOutput } from "../emit-layout";
import { CEL_DATA_MANIFEST, writeEmitResult } from "./emitter/writer";
import type { EmitResult } from "./emitter/types";
import { emitCelSuite } from "./suiteEmit";
import { resolveCelSuite, type CelSuiteDiagnostic } from "./suite";
import { mvOffPathWarnings } from "./offPathWarnings";

export type PublishCelSuiteOutcome =
  | { ok: false; diagnostics: CelSuiteDiagnostic[] | EmitResult["diagnostics"]; error?: string }
  | { ok: true; result: EmitResult; written: string[]; manifest: string };

export function publishMvCel(inputPath: string, artifactRoot: string): PublishCelSuiteOutcome {
  const selected = resolveCelSuite(inputPath);
  if (!selected.ok) return selected;
  try {
    const emission = emitCelSuite(selected.suite);
    if (emission.result.diagnostics.some(d => d.severity === "error")) return { ok: false, diagnostics: emission.result.diagnostics };
    emission.result.diagnostics.push(...mvOffPathWarnings(selected.suite, new Date(emission.clock)));
    const location = resolveEmitOutput("cel", inputPath, artifactRoot);
    if (!location.ok) return { ok: false, diagnostics: [], error: location.reason };
    const out = location.dir;
    const written = writeEmitResult(emission.result, out);
    return { ok: true, result: emission.result, written, manifest: join(out, CEL_DATA_MANIFEST) };
  } catch (error) { return { ok: false, diagnostics: [], error: String(error) }; }
}
