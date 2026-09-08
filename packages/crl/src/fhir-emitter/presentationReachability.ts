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
type Occurrence = { profile: string; text: string; path: string; constraints: ReadonlyMap<string, boolean> };
const behaviorUrl = "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior";
const textUrl = "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text";
const descriptionUrl = "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description";

/**
 * REFACTOR:grounded — check actual emitted inputs before CQFramework deduplicates profiles.
 * A visited action contributes its own questions; its descendants require true applicability.
 * First-match siblings are visited only after previous siblings are false. No CQL exclusivity
 * is guessed. Delegated plans contribute to the same form under the caller's constraints.
 */
export function checkPresentationReachability(resources: readonly EmittedResource[], droppedPaths: ReadonlySet<string> = new Set()): CRLError[] {
  const plans = new Map(resources.filter((r) => r.resourceType === "PlanDefinition")
    .map((r) => r.resource as Plan).filter((p) => p.url).map((p) => [p.url!, p]));
  const errors: CRLError[] = [];
  const profileNames = new Map(resources.filter((r) => r.resourceType === "StructureDefinition")
    .map((r) => r.resource as { url?: string; title?: string }).map((r) => [r.url, r.title]));
  for (const [rootUrl, root] of plans) {
    const occurrences: Occurrence[] = [];
    const fail = (kind: string, message: string) => {
      if (!errors.some((e) => e.kind === kind && e.message === message)) errors.push({ type: "Validation", kind, message });
    };
    const walk = (actions: readonly Action[], inherited: ReadonlyMap<string, boolean>, path: string,
      first: boolean, stack: ReadonlySet<string>): void => {
      const visited = new Map(inherited);
      for (let index = 0; index < actions.length; index++) {
        const action = actions[index];
        const key = `${path}/${index}`;
        for (const input of action.input ?? []) {
          for (const profile of input.profile ?? []) {
            const text = JSON.stringify([input.extension?.find((e) => e.url === textUrl)?.valueString ?? profileNames.get(profile) ?? "",
              input.extension?.find((e) => e.url === descriptionUrl)?.valueMarkdown ?? ""]);
            occurrences.push({ profile, text, path: key, constraints: new Map(visited) });
          }
        }
        const descendants = new Map(visited);
        const conditional = (action.condition?.length ?? 0) > 0;
        if (conditional) descendants.set(key, true);
        const behavior = action.extension?.find((e) => e.url === behaviorUrl);
        walk(action.action ?? [], descendants, key, (behavior?.valueString ?? behavior?.valueCode)?.toLowerCase() === "any", stack);
        const target = action.definitionCanonical?.split("|")[0];
        if (target && plans.has(target)) {
          if (stack.has(target)) fail("presentation-delegation-unverified", `Cyclic PlanDefinition delegation prevents presentation verification for ${rootUrl}.`);
          else walk(plans.get(target)!.action ?? [], descendants, `${key}->${target}`, false, new Set([...stack, target]));
        } else if (target?.includes("/PlanDefinition/") && !droppedPaths.has(`PlanDefinition/${target.split("/").at(-1)}.json`)) {
          fail("presentation-delegation-unverified", `PlanDefinition ${target} is unavailable for presentation verification in ${rootUrl}.`);
        }
        if (first) {
          if (!conditional) break;
          visited.set(key, false);
        }
      }
    };
    walk(root.action ?? [], new Map(), rootUrl, false, new Set([rootUrl]));
    const byProfile = new Map<string, Occurrence[]>();
    for (const occurrence of occurrences) {
      for (const prior of byProfile.get(occurrence.profile) ?? []) {
        if (prior.text === occurrence.text) continue;
        const compatible = [...prior.constraints].every(([key, outcome]) =>
          !occurrence.constraints.has(key) || occurrence.constraints.get(key) === outcome);
        if (compatible) fail("presentation-overlap", `Question profile ${occurrence.profile} has conflicting presentations that can coexist in ${rootUrl}: ${prior.path} and ${occurrence.path}.`);
      }
      byProfile.set(occurrence.profile, [...(byProfile.get(occurrence.profile) ?? []), occurrence]);
    }
  }
  return errors;
}
