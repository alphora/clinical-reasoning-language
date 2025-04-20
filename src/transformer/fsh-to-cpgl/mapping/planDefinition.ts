const PLAN_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition'
];

import { ACTIVITY_DEFINITION_URLS } from './activityDefinition';

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
 
    let canonicalValueStr: string | undefined = undefined;
    if (node.definitionCanonical) {
      if (typeof node.definitionCanonical === 'string') {
        if (node.definitionCanonical.startsWith('Canonical(')) {
          canonicalValueStr = node.definitionCanonical.replace(/^Canonical\((.*)\)$/, '$1');
        } else {
          canonicalValueStr = node.definitionCanonical;
        }
      } else if (typeof node.definitionCanonical === 'object' && 'entityName' in node.definitionCanonical) {
        canonicalValueStr = (node.definitionCanonical as { entityName: string }).entityName;
      }
    }
    const activityName = node.title ? toIdentifier(node.title) : 'UnnamedActivity';
    const activityDescription = node.description ? toString(node.description)  : 'TODO: fill in message.';
    // Generate a unique identifier for this activity (name + hash of description)
    let doIdentifier = activityName;
    let hasPlanDef = false;
    let hasActivityDef = false;
    let useIdentifier = '';
    const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
    if (canonicalValueStr) {
      if (referenced && PLAN_DEFINITION_URLS.includes(referenced.instanceOf)) {
        hasPlanDef = true;
        let refDescription = referenced.description;
        if (!refDescription) {
          const descRule = (referenced.rules || []).find((r: any) => r.path === 'Description');
          refDescription = descRule ? descRule.value : '[UnnamedPlanDefinition]';
        }
        useIdentifier = toIdentifier(refDescription);
      } else if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
        hasActivityDef = true;
      }
    }
    output += `${indent}when "${node.conditionExpression}" then`;
    if (hasPlanDef && hasActivityDef) {
      output += `:\n`;
      output += `${indent}    use ${useIdentifier}.\n`;
      output += `${indent}    do ${doIdentifier}.\n`;
      output += `${indent}done\n`;
      // Only call getActivityPerformClause with the resolved ActivityDefinition instance
      let activityDefInstance = null;
      if (canonicalValueStr) {
        const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
        if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
          activityDefInstance = referenced;
        }
      }
      if (activityDefInstance) {
        console.log('[DEBUGGING] getActivityPerformClause called with ActivityDefinition:', { name: activityDefInstance.name, instanceOf: activityDefInstance.instanceOf });
        activities.push({ name: doIdentifier, original: `activity ${doIdentifier} ${getActivityPerformClause(activityDefInstance)}\n\n` });
      } else {
        activities.push({ name: doIdentifier, original: `activity ${doIdentifier} // TODO: activity details.\n\n` });
      }
    } else if (hasPlanDef) {
      output += ` use ${useIdentifier}.\n`;
    } else if (hasActivityDef) {
      output += ` do ${doIdentifier}.\n`;
      // Only call getActivityPerformClause with the resolved ActivityDefinition instance
      let activityDefInstance = null;
      if (canonicalValueStr) {
        const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
        if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
          activityDefInstance = referenced;
        }
      }
      if (activityDefInstance) {
        console.log('[DEBUGGING] getActivityPerformClause called with ActivityDefinition:', { name: activityDefInstance.name, instanceOf: activityDefInstance.instanceOf });
        activities.push({ name: doIdentifier, original: `activity ${doIdentifier} ${getActivityPerformClause(activityDefInstance)}\n\n` });
      } else {
        activities.push({ name: doIdentifier, original: `activity ${doIdentifier} // TODO: activity details.\n\n` });
      }
    } else {
      // Neither: emit a CPGCommunicationRequest activity (unique per name+description)
      output += ` do ${doIdentifier}.\n`;
      activities.push({ name: doIdentifier, original: `activity ${doIdentifier} perform CPGCommunicationRequest\n    of ${activityDescription}.\n\n` });
    }
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

// Helper to extract kind and code-display from an ActivityDefinition instance
function getActivityPerformClause(activityDef: any): string {
  // Extract kind from rules
  let kind: string | undefined = undefined;
  if (activityDef && Array.isArray(activityDef.rules)) {
    const kindRule = activityDef.rules.find((r: any) => r.path === 'kind');
    if (kindRule) {
      if (typeof kindRule.value === 'string') {
        kind = 'CPG' + kindRule.value.replace(/#/g, '');
      } else if (kindRule.value && typeof kindRule.value === 'object' && 'code' in kindRule.value) {
        kind = 'CPG' + String(kindRule.value.code).replace(/#/g, '');
      }
    }
    if (!kindRule) {
      console.log('[DEBUGGING] No kind rule found. All rule paths/values:', activityDef.rules.map((r: any) => ({ path: r.path, value: r.value })));
    }
  }
  if (!kind) {
    kind = 'TODO';
  }
  // Extract code-display from rules
  let codeDisplay: string | undefined = undefined;
  if (activityDef && Array.isArray(activityDef.rules)) {
    // Prefer productCodeableConcept
    const pccRule = activityDef.rules.find((r: any) => r.path === 'productCodeableConcept');
    if (pccRule) {
      if (typeof pccRule.value === 'object' && pccRule.value !== null) {
        if ('display' in pccRule.value && pccRule.value.display) {
          codeDisplay = `"${pccRule.value.display}"`;
        } else if ('code' in pccRule.value && pccRule.value.code) {
          codeDisplay = `"${pccRule.value.code}"`;
        }
      } else if (typeof pccRule.value === 'string') {
        // Fallback: extract quoted string
        const match = /^.*?"(.*?)"$/.exec(pccRule.value);
        if (match) {
          codeDisplay = `"${match[1]}"`;
        }
      }
    }
    if (!pccRule) {
      console.log('[DEBUGGING] No productCodeableConcept rule found. All rule paths/values:', activityDef.rules.map((r: any) => ({ path: r.path, value: r.value })));
    }
    // Fallback to dynamicValue logic (do not change)
    if (!codeDisplay) {
      // Find all dynamicValue rules
      const dvRules = activityDef.rules.filter((r: any) => r.path.startsWith('dynamicValue'));
      for (const rule of dvRules) {
        // Look for a rule like 'dynamicValue[=].path' with value 'code.coding'
        if (rule.path.endsWith('.path') && rule.value === 'code.coding') {
          // Find the corresponding description
          const prefix = rule.path.replace(/\.path$/, '');
          const descRule = activityDef.rules.find((r: any) => r.path === `${prefix}.expression.description`);
          if (descRule && typeof descRule.value === 'string') {
            codeDisplay = `"${descRule.value}"`;
            break;
          }
        }
      }
    }
  }
  if (!codeDisplay) {
    codeDisplay = 'TODO';
  }
  return `perform ${kind}\n    of ${codeDisplay}.`;
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
