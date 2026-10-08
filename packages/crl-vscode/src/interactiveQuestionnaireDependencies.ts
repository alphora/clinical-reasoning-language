/** Optional editing convenience derived from the complete applied definition tree.
 * Any unresolved delegation invalidates the proof. The evaluator remains authoritative. */
export function interactiveQuestionnaireDependencies(definitions: any, planId: string): Record<string, string[]> {
  const resources = (definitions?.entry ?? []).map((e: any) => e.resource);
  const plans = resources.filter((r: any) => r?.resourceType === "PlanDefinition");
  const root = plans.filter((r: any) => r.id === planId);
  if (root.length !== 1) return {};
  let complete = true;
  const uses = new Map<string, Set<string>[]>();
  const inputs = (a: any): string[] => (a.input ?? []).flatMap((i: any) => i.profile ?? []);
  const walk = (actions: any[], parents: Set<string>, ordered: boolean, stack: Set<any>) => {
    const prior = new Set<string>();
    for (const a of actions ?? []) {
      const own = inputs(a), dependencies = new Set([...parents, ...(ordered ? prior : [])]);
      for (const profile of own) {
        const set = new Set(dependencies); set.delete(profile);
        const occurrences = uses.get(profile) ?? []; occurrences.push(set); uses.set(profile, occurrences);
      }
      const childParents = new Set([...dependencies, ...own]);
      const any = (a.extension ?? []).some((e: any) => e.url === "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior" &&
        (e.valueString ?? e.valueCode) === "any");
      walk(a.action, childParents, any, stack);
      if (a.definitionCanonical) {
        const [url, version] = a.definitionCanonical.split("|");
        const targets = resources.filter((r: any) => r?.url === url && (!version || r.version === version));
        if (targets.length !== 1) complete = false;
        else if (targets[0].resourceType === "PlanDefinition") {
          if (stack.has(targets[0])) complete = false;
          else walk(targets[0].action, childParents, false, new Set([...stack, targets[0]]));
        } else if (targets[0].resourceType !== "ActivityDefinition") complete = false;
      }
      for (const profile of own) prior.add(profile);
    }
  };
  walk(root[0].action, new Set(), false, new Set(root));
  if (!complete) return {};
  return Object.fromEntries([...uses].map(([profile, occurrences]) => [profile,
    [...occurrences[0]].filter(parent => occurrences.every(set => set.has(parent)))]));
}
