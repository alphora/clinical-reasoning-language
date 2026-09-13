// REFACTOR:grounded: explicit CLI/MCP validation shares suite checks and advisory CRE warnings.
// Automatic editor diagnostics continue to use the standalone validator.
import { resolve } from "node:path";
import { validateCEL, validateCELFile } from "./validator";
import { celSuiteRole, resolveCelSuite } from "./suite";
import { mvOffPathWarnings } from "./offPathWarnings";

export function validateCelCommand(filePath: string, options: { soft?: boolean } = {}) {
  const p = resolve(filePath);
  const result = validateCELFile(p, options);
  const classified = celSuiteRole(p);
  const selection = classified ? resolveCelSuite(p, classified) : undefined;
  const suiteErrors = selection && !selection.ok ? selection.diagnostics : [];
  const results = selection?.ok
    ? selection.suite.files.map(file => {
      const checked = validateCEL(file.graph, options);
      return {
        errors: checked.errors.map(d => ({ ...d, filePath: d.filePath ?? file.path })),
        warnings: checked.warnings.map(d => ({ ...d, filePath: d.filePath ?? file.path })),
      };
    }) : [result];
  const advice = selection?.ok && classified === "mv"
    ? mvOffPathWarnings({ ...selection.suite, purpose: "mv", files: selection.suite.files.filter(f => f.role === "mv") }) : [];
  return { ...result, errors: [...results.flatMap(r => r.errors), ...suiteErrors], warnings: [...results.flatMap(r => r.warnings), ...advice] };
}
