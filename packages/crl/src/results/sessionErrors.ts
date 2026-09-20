// REFACTOR:grounded: native errors are examined even when a Questionnaire was returned successfully.
export interface SessionDiagnostic { severity: "error" | "warning"; source: "native-resource" | "stdout" | "stderr"; message: string; path?: string }
export function inspectSessionOutcome(parameters: unknown, stdout: string, stderr: string): SessionDiagnostic[] {
  const diagnostics: SessionDiagnostic[] = [];
  const params = parameters as Record<string, unknown> | undefined;
  if (!params || params.resourceType !== "Parameters") return [{ severity: "error", source: "native-resource", message: "Native output must be a Parameters resource." }];
  const visitParameters = (parts: unknown, path: string): void => {
    if (!Array.isArray(parts)) return;
    parts.forEach((part, i) => {
      if (!part || typeof part !== "object") return;
      const p = part as Record<string, unknown>;
      if (p.name === "error" && (Object.keys(p).some(k => k.startsWith("value")) || p.resource || p.part)) diagnostics.push({ severity: "error", source: "native-resource", message: "Native Parameters contains an error.", path: path + "/" + i });
      visitParameters(p.part, path + "/" + i + "/part");
    });
  };
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) { value.forEach((v, i) => visit(v, path + "/" + i)); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, any>;
    if (object.resourceType === "Parameters") visitParameters(object.parameter, path + "/parameter");
    if (object.resourceType === "OperationOutcome" && Array.isArray(object.issue)) object.issue.forEach((issue: Record<string, any>, i: number) => {
      if (["fatal", "error", "warning"].includes(issue?.severity)) diagnostics.push({ severity: issue.severity === "warning" ? "warning" : "error", source: "native-resource", message: String(issue.diagnostics ?? issue.details?.text ?? issue.code ?? "Native OperationOutcome"), path: path + "/issue/" + i });
    });
    for (const [key, child] of Object.entries(object)) visit(child, path + "/" + key);
  };
  visit(params, "");
  for (const [source, log] of [["stdout", stdout], ["stderr", stderr]] as const) for (const line of log.split(/\r?\n/)) {
    if (/\bERROR\b|\bFATAL\b|\bException\b|encountered exception/i.test(line)) diagnostics.push({ severity: "error", source, message: line });
    else if (/\bWARN(?:ING)?\b/.test(line)) diagnostics.push({ severity: "warning", source, message: line });
  }
  return diagnostics;
}
