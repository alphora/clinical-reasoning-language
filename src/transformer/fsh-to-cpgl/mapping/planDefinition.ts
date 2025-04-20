const PLAN_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition'
];

import { ACTIVITY_DEFINITION_URLS, getActivityPerformClause, emitActivityBlock } from './activityDefinition';

import { toIdentifier, toString } from '../utils/fshPathFunctions';

interface ActionNode {
  title?: string;
  description?: string;
  conditionExpression?: string;
  definitionCanonical?: string;
  children: ActionNode[];
}

function emitWhenBlocksRecursive(
  nodes: ActionNode[],
  activities: { name: string, original: string }[],
  emittedActivities: Set<string>,
  allInstances: any[],
  instance: any,
  indent = '    '
): string {
  let output = '';
  for (const node of nodes) {
    if (!node.conditionExpression) {
      if (node.children.length > 0) {
        output += emitWhenBlocksRecursive(node.children, activities, emittedActivities, allInstances, instance, indent);
      }
      continue;
    }
    if (node.children.length > 0 && node.definitionCanonical) {
      throw new Error('[emitWhenBlocksRecursive] Node has both children and definitionCanonical, which is ambiguous and violates the grammar.');
    }
    if (node.children.length > 0) {
      output += `${indent}when "${node.conditionExpression}" then:\n`;
      output += emitWhenBlocksRecursive(node.children, activities, emittedActivities, allInstances, instance, indent + '    ');
      output += `${indent}done\n`;
      continue;
    }
    // Delegate activity emission to activityDefinition helper
    output += `${indent}when "${node.conditionExpression}" then`;
    output += emitActivityBlock(node, allInstances, activities, indent);
  }
  return output;
}

// Update parseActions to extract description
function parseActions(rules: any[], basePath = 'action'): ActionNode[] {
  const nodes: ActionNode[] = [];
  let currentNode: ActionNode | null = null;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Match action[+] at this level
    if (rule.path === `${basePath}[+]`) {
      // Start a new action node
      if (currentNode) nodes.push(currentNode);
      currentNode = { children: [] };
    } else if (rule.path.startsWith(`${basePath}[=]`)) {
      // Property or nested action of the current node
      if (!currentNode) continue; // Defensive: skip if no current node
      const subPath = rule.path.slice(`${basePath}[=]`.length);
      if (subPath.startsWith('.action[+]')) {
        // Start a new child action
        // Find all rules for this child action
        const childBase = `${basePath}[=].action`;
        // Find the slice of rules for this child array
        const childRules: any[] = [];
        let j = i;
        while (j < rules.length && rules[j].path.startsWith(childBase)) {
          childRules.push(rules[j]);
          j++;
        }
        currentNode.children = parseActions(childRules, childBase);
        i = j - 1;
      } else if (subPath.startsWith('.action[=]')) {
        // Property of a child action (should be handled in recursion)
        continue;
      } else {
        // Property of the current node
        if (subPath === '.title') currentNode.title = rule.value;
        if (subPath === '.description') currentNode.description = rule.value;
        if (subPath.endsWith('.condition[=].expression.expression')) currentNode.conditionExpression = rule.value;
        if (subPath === '.definitionCanonical') currentNode.definitionCanonical = rule.value;
      }
    }
  }
  if (currentNode) nodes.push(currentNode);
  return nodes;
}

export function mapPlanDefinitionToDecision(instance: any, allInstances: any[]): { decision: string, activities: { name: string, original: string }[] } {
  if (!PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
    return { decision: '', activities: [] };
  }
  let description = instance.description;
  if (!description) {
    const descriptionRule = (instance.rules || []).find((r: any) => r.path === 'Description');
    description = descriptionRule ? descriptionRule.value : undefined;
  }
  description = description ? toIdentifier(description) : '[UnnamedPlanDefinition]';
  const citationRule = (instance.rules || []).find((r: any) => r.path === 'relatedArtifact[=].citation');
  const citation = citationRule ? toString(citationRule.value) : '';
  let output = '';
  if (instance.name) {
    output += `// Instance: ${instance.name}\n`;
  }
  if (instance.title) {
    output += `// Title: ${instance.title}\n`;
  }
  if (citation) {
    output += `// ${citation}\n`;
  }
  output += `decision ${description}:\n`;
  const actionTree = parseActions(instance.rules || []);

  // Collect activity stats for all PlanDefinitions
  const activities: { name: string, original: string }[] = [];
  const emittedActivities = new Set<string>();

  output += emitWhenBlocksRecursive(actionTree, activities, emittedActivities, allInstances, instance);
  output += 'done\n\n';
  return { decision: output, activities };
}
