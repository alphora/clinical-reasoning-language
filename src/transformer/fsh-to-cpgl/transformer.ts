import { FSHLoadResult } from './sushi-loader';
import { mapPlanDefinitionToDecision } from './mapping/planDefinition';
import { mapConcept } from './mapping/concept';
import { mapTerminology } from './mapping/terminology';
import { ActivityDeduplicator } from './utils/activityDeduplication';

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
    output += mapConcept(inst);
    output += mapTerminology(inst);
    output += '\n';
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
  finalOutput = finalOutput.replace(/<<ACTIVITY_REF:(activity_\d+)>>/g, (_, id) => `"${idToFinalName[id]}"`);

  // 3. Emit unique activities at the end, using the assigned unique names
  for (const { uniqueName, activity } of dedupedMap.values()) {
    // Replace the name in the activity definition with the unique name (with suffix inside quotes)
    // Assumes the activity definition starts with: activity <name>
    const original = activity.original;
    const replaced = original.replace(
      new RegExp(`activity \\S+`),
      `activity ${uniqueName}`
    );
    finalOutput += replaced;
  }

  return finalOutput;
} 