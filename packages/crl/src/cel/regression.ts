// REFACTOR:grounded: engineering checks reuse MV cases and add regression controls once.
import { runCel } from "../cre/run";
import { resolveCelSuite } from "./suite";
import { validateCEL } from "./validator";

export function runRegression(projectPath: string) {
  const selected = resolveCelSuite(projectPath, "regression");
  if (!selected.ok) return { success: false as const, diagnostics: selected.diagnostics };
  const suite = selected.suite, now = new Date();
  const files = suite.files.map(file => {
    const validation = validateCEL(file.graph);
    const run = validation.errors.length ? undefined : runCel(file.graph, { now });
    return { sourceFile: file.sourceFile, role: file.role, errors: validation.errors, warnings: validation.warnings, run };
  });
  return {
    success: files.every(file => file.run?.success === true && file.run.errors.length === 0 && file.run.runs.every(run => run.status === "pass")),
    clock: now.toISOString(),
    caseCount: files.reduce((n, file) => n + (file.run?.runs.length ?? 0), 0), files,
  };
}
