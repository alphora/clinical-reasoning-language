import { FSHLoadResult } from './sushi-loader';
import { mapPlanDefinitionToDecision } from './mapping/planDefinition';
import { mapConcept } from './mapping/concept';
import { mapTerminology } from './mapping/terminology';
import { ActivityDeduplicator } from './utils/activityDeduplication';
import { toIdentifier } from './utils/fshPathFunctions';

/**
 * Transform FSH (parsed with SUSHI) to CPG-L.
 * @param fshResult The result from sushi-loader
 * @returns The CPG-L output as a string
 */
export function transformFSHToCPGL(fshResult: FSHLoadResult): string {
  const { instances } = fshResult;
  let output = '';

  // Collect all activities and do references for file-wide deduplication and postprocessing
  const activityDeduplicator = new ActivityDeduplicator();
  const decisions: string[] = [];
  const allActivities: { id: string, name: string, value: string | undefined, original: string }[] = [];
  const allDoReferences: { id: string, placeholder: string }[] = [];
  const allConceptIdentifiers = new Set<string>();

  for (const inst of instances) {
    // For demonstration, call all mapping helpers for every instance
    const planDefResult = mapPlanDefinitionToDecision(inst, instances);
    decisions.push(planDefResult.decision);
    for (const act of planDefResult.activities) {
      activityDeduplicator.add({ name: act.name, value: act.value, original: act.original });
      allActivities.push(act);
    }
    for (const ref of planDefResult.doReferences) {
      allDoReferences.push(ref);
    }
    // Collect concept identifiers from PlanDefinition action trees
    if (inst.instanceOf && (inst.instanceOf.includes('strategydefinition') || inst.instanceOf.includes('recommendationdefinition'))) {
      // Traverse rules to find all condition.expression.expression values
      for (const rule of inst.rules || []) {
        if (rule.path.endsWith('.condition[=].expression.expression') && rule.value) {
          allConceptIdentifiers.add(rule.value);
        }
      }
    }
  }

  // Collect all terminology blocks for activities
  const activityTerminologies: { identifier: string, code: string, system: string }[] = [];
  for (const act of allActivities) {
    if ((act as any).terminology && (act as any).terminology.code) {
      activityTerminologies.push((act as any).terminology);
    }
  }

  // Emit all decisions
  let finalOutput = '';
  for (const dec of decisions) {
    finalOutput += dec;
  }

  // --- POSTPROCESSING: Deduplicate, assign unique names, and replace placeholders ---
  // 1. Deduplicate activities by (name, value) and assign unique names with suffixes
  const dedupedMap = new Map<string, { uniqueName: string, activity: typeof allActivities[0] }>();
  const nameValueCount = new Map<string, number>();
  const idToFinalName: Record<string, string> = {};

  for (const act of allActivities) {
    const key = `${act.name}::${act.value ?? ''}`;
    let count = nameValueCount.get(act.name) || 0;
    if (!dedupedMap.has(key)) {
      count += 1;
      nameValueCount.set(act.name, count);
      const uniqueName = act.name + (count > 1 ? `_${count}` : '');
      dedupedMap.set(key, { uniqueName, activity: act });
      idToFinalName[act.id] = uniqueName;
    } else {
      // Already deduped, use the same unique name
      const { uniqueName } = dedupedMap.get(key)!;
      idToFinalName[act.id] = uniqueName;
    }
  }

  // 2. Replace all <<ACTIVITY_REF:...>> placeholders in the output with the correct quoted unique name
  finalOutput = finalOutput.replace(/<<ACTIVITY_REF:(activity_\d+)>>/g, (_, id) => toIdentifier(idToFinalName[id]));

  // 3. Emit unique activities at the end, using the assigned unique names
  for (const { uniqueName, activity } of dedupedMap.values()) {
    // Extract the base name from the original (without quotes)
    const activityRegex = /activity\s+"([^"]+)"/;
    const match = activity.original.match(activityRegex);
    let replaced = activity.original;
    if (match) {
      // uniqueName is already baseName + suffix (no quotes)
      replaced = activity.original.replace(activityRegex, `activity ${toIdentifier(uniqueName)}`);
    } else {
      console.warn(`Could not match activity identifier in: ${activity.original}`);
    }
    finalOutput += replaced;
  }

  // Emit concept and terminology blocks for all unique concept identifiers
  if (allConceptIdentifiers.size > 0) {
    finalOutput += '\n' + mapConcept(Array.from(allConceptIdentifiers));
    finalOutput += '\n' + mapTerminology(Array.from(allConceptIdentifiers));
  }

  // Emit unique activity terminology blocks
  if (activityTerminologies.length > 0) {
    // Deduplicate by identifier+body, suffix if needed
    const termMap = new Map<string, { body: string, count: number }>();
    for (const term of activityTerminologies) {
      const baseId = term.identifier;
      const body = `system \`${term.system}\` code \`${term.code}\``;
      let id = baseId;
      let count = 1;
      while (termMap.has(id) && termMap.get(id)!.body !== body) {
        count++;
        id = `${baseId}_${count}`;
      }
      if (!termMap.has(id)) {
        termMap.set(id, { body, count });
        finalOutput += `\nterminology "${id}" ${body}.`;
      }
    }
  }

  return finalOutput;
} 