import { FSHLoadResult } from './sushi-loader';
import { mapPlanDefinitionToDecision } from './mapping/planDefinition';
import { mapActivityDefinitionToActivity } from './mapping/activityDefinition';
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

  output += '// [DEBUGGING] CPG-L generated from FSH instances\n';

  // Collect all activities for file-wide deduplication
  const activityDeduplicator = new ActivityDeduplicator();
  const decisions: string[] = [];

  for (const inst of instances) {
    // For demonstration, call all mapping helpers for every instance
    const planDefResult = mapPlanDefinitionToDecision(inst, instances);
    decisions.push(planDefResult.decision);
    for (const act of planDefResult.activities) {
      activityDeduplicator.add({ text: act.original });
    }
    output += mapActivityDefinitionToActivity(inst);
    output += mapConcept(inst);
    output += mapTerminology(inst);
    output += '\n';
  }

  // Emit all decisions
  for (const dec of decisions) {
    output += dec;
  }

  // Emit unique activities at the end
  for (const uniqueAct of activityDeduplicator.getUniqueActivities()) {
    output += uniqueAct.text;
  }

  return output;
} 