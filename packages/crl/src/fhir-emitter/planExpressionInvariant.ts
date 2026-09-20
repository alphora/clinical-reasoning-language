import type { PerLibraryEmit } from "../imports/emit";
import type { CRLError } from "../types/errors";
import type { EmittedResource } from "./types";

/** REFACTOR:grounded: a PlanDefinition expression must name a definition in its
 * actual bound library, not merely a same-named definition in another owner. */
export function applyPlanExpressionInvariant(
  resources: readonly EmittedResource[],
  manifest: readonly PerLibraryEmit[],
): CRLError[] {
  const errors: CRLError[] = [];
  const unversioned = (s: string): string => s.split("|")[0]!;
  const libraries = new Map<string, string>();
  for (const entry of resources) {
    if (entry.resourceType !== "Library") continue;
    const lib = entry.resource as { url?: string; name?: string };
    if (lib.url && lib.name) libraries.set(unversioned(lib.url), lib.name);
  }
  const definitions = new Map<string, Set<string>>();
  for (const entry of manifest) {
    // Some direct callers supply manifests without a ledger. Only public scalar
    // definitions are valid targets; functions/private definitions are excluded.
    const names = entry.ledgerEntries
      ? entry.ledgerEntries.filter(d => d.visibility !== "impl").map(d => d.name)
      : [...entry.cql.matchAll(/^\s*define\s+"((?:\\.|[^"\\])*)"\s*:/gm)]
          .map(m => m[1]!.replace(/\\(["\\])/g, "$1"));
    definitions.set(entry.libraryName, new Set(names));
  }
  for (const entry of resources) {
    if (entry.resourceType !== "PlanDefinition") continue;
    const pd = entry.resource as { library?: string[] };
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const obj = value as Record<string, unknown>;
      if (typeof obj.language === "string" && "expression" in obj) {
        const expression = obj.expression;
        if (obj.language !== "text/cql-identifier" || typeof expression !== "string" || !expression) {
          errors.push({ type: "Validation", kind: "plan-expression-not-identifier",
            message: 'PlanDefinition "' + (entry.sourceName ?? entry.relativePath) + '" must use a CQL identifier for every expression.' });
        } else if (manifest.length > 0) {
          const reference = typeof obj.reference === "string" ? obj.reference : pd.library?.[0];
          const owner = reference ? libraries.get(unversioned(reference)) : undefined;
          if (!owner || !definitions.get(owner)?.has(expression)) errors.push({
            type: "Validation", kind: "dangling-plan-expression-define",
            message: 'PlanDefinition "' + (entry.sourceName ?? entry.relativePath) + '" references "' + expression +
              '" in "' + (reference ?? "(no library)") + '", but that bound library has no public definition with this name.',
          });
        }
      }
      Object.values(obj).forEach(visit);
    };
    visit(entry.resource);
  }
  return errors;
}
