import type { CRLError } from "../types/errors";
import type { EmittedResource } from "./types";

type Action = {
  condition?: unknown[];
  input?: { profile?: string[]; extension?: { url?: string; valueString?: string; valueMarkdown?: string }[] }[];
  action?: Action[];
  extension?: { url?: string; valueString?: string; valueCode?: string }[];
  definitionCanonical?: string;
};
type Plan = { url?: string; action?: Action[] };
type Inputs = Map<string, Map<string, string>>; // profile -> wording -> one source witness
type Summary = { inputs: Inputs; errors: Map<string, CRLError> };
const behaviorUrl = "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior";
const textUrl = "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text";
const descriptionUrl = "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description";
const empty = (): Summary => ({ inputs: new Map(), errors: new Map() });

// REFACTOR:grounded: summaries retain distinct wording and a witness, not every caller path.
// Concurrent summaries cross-check; exclusive alternatives contribute only their union.
function merge(into: Summary, from: Summary, concurrent: boolean, site?: string): void {
  for (const [key, error] of from.errors) into.errors.set(key, error);
  for (const [profile, variants] of from.inputs) {
    const prior = into.inputs.get(profile);
    if (!prior) { into.inputs.set(profile, new Map(variants)); continue; }
    if (concurrent) for (const [wording, witness] of variants) for (const [other, previous] of prior) {
      if (wording === other) continue;
      const key = JSON.stringify([site, profile, ...[wording, other].sort()]);
      if (!into.errors.has(key)) into.errors.set(key, { type: "Validation", kind: "presentation-overlap",
        message: `Question profile ${profile} has conflicting presentations that can coexist at ${site}: ${other} at ${previous} and ${wording} at ${witness}.` });
    }
    for (const [wording, witness] of variants) if (!prior.has(wording)) prior.set(wording, witness);
  }
}

/** Check structurally coexisting presentations before native profile deduplication.
 * Diagnostics identify defining/composing sites; shared callers do not repeat them.
 * As before, independent invocation contexts are not correlated by CQL truth. */
export function checkPresentationReachability(resources: readonly EmittedResource[], droppedPaths: ReadonlySet<string> = new Set()): CRLError[] {
  const plans = new Map(resources.filter(r => r.resourceType === "PlanDefinition")
    .map(r => r.resource as Plan).filter(p => p.url).map(p => [p.url!, p]));
  const profileNames = new Map(resources.filter(r => r.resourceType === "StructureDefinition")
    .map(r => r.resource as { url?: string; title?: string }).map(p => [p.url, p.title]));
  const memo = new Map<string, Summary>();
  const visiting = new Set<string>();
  const errorSummary = (message: string): Summary => ({ inputs: new Map(), errors: new Map([[message,
    { type: "Validation", kind: "presentation-delegation-unverified", message }]]) });
  // REFACTOR:grounded: a cyclic graph has no complete compositional summary.
  // Detect it once before memoization instead of caching a caller-relative cut or
  // repeating the whole graph from each root. Refuse affected plans explicitly;
  // unrelated plans still receive overlap and missing-target checks.
  const edges = (actions: readonly Action[], path: string, first: boolean): { target: string; site: string }[] => {
    const result: { target: string; site: string }[] = [];
    for (const [index, action] of actions.entries()) {
      const site = `${path}/${index}`, behavior = action.extension?.find(e => e.url === behaviorUrl);
      result.push(...edges(action.action ?? [], site, (behavior?.valueString ?? behavior?.valueCode)?.toLowerCase() === "any"));
      const target = action.definitionCanonical?.split("|")[0];
      if (target && plans.has(target)) result.push({ target, site });
      if (first && !action.condition?.length) break;
    }
    return result;
  };
  const graph = new Map([...plans].map(([url, plan]) => [url, edges(plan.action ?? [], url, false)]));
  const checked = new Set<string>(), tainted = new Set<string>(), cycleErrors: CRLError[] = [];
  const checkCycles = (url: string): void => {
    if (checked.has(url)) return;
    visiting.add(url);
    for (const { target, site } of graph.get(url) ?? []) {
      if (visiting.has(target)) {
        tainted.add(target);
        cycleErrors.push({ type: "Validation", kind: "presentation-delegation-unverified",
          message: `Cyclic PlanDefinition delegation at ${site} to ${target} prevents presentation verification for its callers; resolve the cycle before checking their overlaps.` });
      }
      else checkCycles(target);
    }
    visiting.delete(url); checked.add(url);
  };
  for (const url of [...plans.keys()].sort()) checkCycles(url);
  const callers = new Map<string, Set<string>>();
  for (const [url, edges] of graph) for (const { target } of edges) {
    const parents = callers.get(target) ?? new Set<string>();
    parents.add(url); callers.set(target, parents);
  }
  const pending = [...tainted];
  for (let i = 0; i < pending.length; i++) for (const caller of callers.get(pending[i]) ?? []) {
    if (!tainted.has(caller)) { tainted.add(caller); pending.push(caller); }
  }
  const ownInputs = (action: Action, path: string): Summary => {
    const result = empty();
    for (const input of action.input ?? []) for (const profile of input.profile ?? []) {
      const wording = JSON.stringify([input.extension?.find(e => e.url === textUrl)?.valueString ?? profileNames.get(profile) ?? "",
        input.extension?.find(e => e.url === descriptionUrl)?.valueMarkdown ?? ""]);
      merge(result, { inputs: new Map([[profile, new Map([[wording, path]])]]), errors: new Map() }, true, path);
    }
    return result;
  };
  // REFACTOR:grounded: first-match guard inputs survive a false condition; descendants do not.
  // Only prior guards' own inputs coexist with a later first sibling's full summary.
  const actionsSummary = (actions: readonly Action[], path: string, first: boolean): Summary => {
    const result = empty(), prefix = empty();
    for (const [index, action] of actions.entries()) {
      const site = `${path}/${index}`, own = ownInputs(action, site), full = empty();
      merge(full, own, false);
      const behavior = action.extension?.find(e => e.url === behaviorUrl);
      merge(full, actionsSummary(action.action ?? [], site, (behavior?.valueString ?? behavior?.valueCode)?.toLowerCase() === "any"), true, site);
      const target = action.definitionCanonical?.split("|")[0];
      if (target && plans.has(target)) merge(full, planSummary(target), true, site);
      else if (target?.includes("/PlanDefinition/") && !droppedPaths.has(`PlanDefinition/${target.split("/").at(-1)}.json`))
        merge(full, errorSummary(`PlanDefinition ${target} is unavailable for presentation verification at ${site}.`), false);
      if (first) {
        const coexist = empty();
        merge(coexist, prefix, false); merge(coexist, full, true, site);
        merge(result, coexist, false);
        if (!(action.condition?.length)) break;
        merge(prefix, own, true, site);
      } else merge(result, full, true, site);
    }
    return result;
  };
  const planSummary = (url: string): Summary => {
    const cached = memo.get(url);
    if (cached) return cached;
    const result = actionsSummary(plans.get(url)!.action ?? [], url, false);
    memo.set(url, result);
    return result;
  };
  const errors = new Map<string, CRLError>();
  for (const url of [...plans.keys()].sort().filter(url => !tainted.has(url))) for (const [key, error] of planSummary(url).errors) {
    // One diagnostic per source conflict/delegation, even through many calling plans.
    if (!errors.has(key)) errors.set(key, error);
  }
  return [...cycleErrors, ...errors.values()];
}
