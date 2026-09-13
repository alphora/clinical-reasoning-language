// REFACTOR:grounded: aggregate independent graphs before the one suite write.
import { emitCelToFhir } from "./emitter";
import type { EmitDiagnostic, EmitResult } from "./emitter/types";
import { validateCEL } from "./validator";
import type { CELCase } from "./ast/types";
import { type CelSuite } from "./suite";

export interface CelSuiteEmission {
  result: EmitResult;
  clock: string;
}

/** In-memory aggregation shared by MV and regression. */
export function emitCelSuite(suite: CelSuite, now = new Date()): CelSuiteEmission {
  const result: EmitResult = { emittedCases: [], diagnostics: [] };
  const paths = new Set<string>();
  for (const file of suite.files) {
    const validation = validateCEL(file.graph, { now });
    result.diagnostics.push(...validation.errors, ...validation.warnings);
    if (validation.errors.length) continue;
    const emitted = emitCelToFhir(file.graph, { now });
    result.diagnostics.push(...emitted.diagnostics);
    const cases = (file.graph.cel?.statements ?? []).filter((s): s is CELCase => s.type === "CELCase");
    const byName = new Map(cases.map(c => [c.name, c]));
    for (const c of emitted.emittedCases) {
      const source = byName.get(c.caseName);
      for (const r of c.resources) {
        const target = `${r.outputPath}/${r.id}.json`;
        if (paths.has(target)) result.diagnostics.push({ kind: "id-collision", severity: "error", message: `Suite output collision at ${target}`, filePath: file.path, caseSlug: c.caseSlug });
        paths.add(target);
      }
      result.emittedCases.push({ ...c, sourceFile: file.sourceFile, ...(source?.caseId ? { caseId: source.caseId } : {}) });
    }
    const missing = cases.filter(c => !emitted.emittedCases.some(e => e.caseName === c.name));
    for (const c of missing) result.diagnostics.push({ kind: "precondition-failed", severity: "error", message: `Declared case "${c.name}" did not emit; the suite cannot be published.`, filePath: file.path });
  }
  const diagnostics = new Map<string, EmitDiagnostic>();
  for (const d of result.diagnostics) diagnostics.set(JSON.stringify(d), d);
  result.diagnostics = [...diagnostics.values()];
  // Diagnostics retain the failed candidate; never return a publishable partial set.
  if (result.diagnostics.some(d => d.severity === "error")) result.emittedCases = [];
  return { result, clock: now.toISOString() };
}
