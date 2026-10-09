// REFACTOR:grounded: load the selected policy's case from its ordinary results manifest.
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathWithin, resolveCelSuite } from "../cel/suite";
import { suiteResultsManifestPath, type ProducerManifest } from "./manifest";

export interface SuiteResultRead { q?: unknown; qr?: unknown; lookedFor: string; definitionClosureSha256?: string; stale?: boolean; }
export function readSuiteResult(inputPath: string, compartmentDir: string, expectedDefinitionClosureSha256?: string): SuiteResultRead {
  const selected = resolveCelSuite(inputPath);
  if (!selected.ok) return { lookedFor: selected.diagnostics.map(d => d.message).join("; ") };
  const root = selected.suite.projectRoot, file = join(root, suiteResultsManifestPath());
  try {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as ProducerManifest;
    const entries = manifest.cases.filter(c => c.compartmentDir === compartmentDir);
    if (entries.length !== 1) return { lookedFor: "No unique native result for this case. Run emit_results." };
    const entry = entries[0];
    if (entry.state !== "generated") return { lookedFor: `Native result: ${entry.state}${entry.reason ? ` — ${entry.reason}` : ""}` };
    const actual = manifest.provenance?.definitionClosureSha256;
    const stale = expectedDefinitionClosureSha256 !== undefined && actual !== expectedDefinitionClosureSha256;
    const out: SuiteResultRead = { lookedFor: stale ? 'Native results use different or unidentified definitions. Refresh before reviewing them as current.' : file,
      ...(typeof actual === 'string' ? { definitionClosureSha256: actual } : {}), ...(stale ? { stale: true } : {}) };
    const owned = realpathSync(join(root, "tests/results/fhir", compartmentDir));
    if (!pathWithin(realpathSync(root), owned)) throw new Error("Result compartment escapes its policy root.");
    for (const artifact of entry.artifacts ?? []) {
      if (artifact.resourceType !== "Questionnaire" && artifact.resourceType !== "QuestionnaireResponse") continue;
      const target = realpathSync(resolve(root, artifact.path));
      if (!pathWithin(owned, target)) throw new Error("Result artifact escapes its case compartment.");
      const resource = JSON.parse(readFileSync(target, "utf8"));
      if (resource.resourceType !== artifact.resourceType || resource.id !== artifact.id) throw new Error("Result resource identity differs from its manifest.");
      if (artifact.resourceType === "Questionnaire") out.q = resource;
      else out.qr = resource;
    }
    return out;
  } catch (error) { return { lookedFor: `Cannot load native results: ${String(error)} Run emit_results.` }; }
}
