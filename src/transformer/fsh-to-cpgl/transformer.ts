import { FSHLoadResult } from './sushi-loader';
import { mapPlanDefinitionToDecision } from './mapping/planDefinition';
import { mapActivityDefinitionToActivity } from './mapping/activityDefinition';
import { mapConcept } from './mapping/concept';
import { mapTerminology } from './mapping/terminology';

/**
 * Transform FSH (parsed with SUSHI) to CPG-L.
 * @param fshResult The result from sushi-loader
 * @returns The CPG-L output as a string
 */
export function transformFSHToCPGL(fshResult: FSHLoadResult): string {
  const { instances } = fshResult;
  let output = '';

  output += '// [DEBUGGING] CPG-L generated from FSH instances\n';
  for (const inst of instances) {
    // For demonstration, call all mapping helpers for every instance
    output += mapPlanDefinitionToDecision(inst);
    output += mapActivityDefinitionToActivity(inst);
    output += mapConcept(inst);
    output += mapTerminology(inst);
    output += '\n';
  }

  return output;
} 