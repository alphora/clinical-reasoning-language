const PLAN_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition'
];

import { emitActivityBlock } from './activityDefinition';

import { toIdentifier, toString } from '../utils/fshPathFunctions';

interface ActionNode {
  title?: string;
  description?: string;
  conditionExpression?: string;
  definitionCanonical?: string;
  children: ActionNode[];
  extension?: any[];
}

function emitWhenBlocksRecursive(
  nodes: ActionNode[],
  activities: { id: string, name: string, value: string | undefined, original: string }[],
  allInstances: any[],
  instance: any,
  indent = '    ',
  doReferences: { id: string, placeholder: string }[]
): string {
  let output = '';
  for (const node of nodes) {
    // If node has no conditionExpression but has a definitionCanonical (use/decision reference), emit a when ... then use ...
    if (!node.conditionExpression && node.definitionCanonical) {
      // Calculate canonicalValueStr for this node
      let canonicalValueStr: string | undefined = undefined;
      if (typeof node.definitionCanonical === 'string') {
        if (node.definitionCanonical.startsWith('Canonical(')) {
          canonicalValueStr = node.definitionCanonical.replace(/^Canonical\((.*)\)$/, '$1');
        } else {
          canonicalValueStr = node.definitionCanonical;
        }
      } else if (typeof node.definitionCanonical === 'object' && 'entityName' in node.definitionCanonical) {
        canonicalValueStr = (node.definitionCanonical as { entityName: string }).entityName;
      }
      // Calculate hasPlanDef for this node
      let hasPlanDef = false;
      if (canonicalValueStr) {
        const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
        if (
          referenced &&
          referenced.instanceOf &&
          PLAN_DEFINITION_URLS.includes(referenced.instanceOf)
        ) {
          hasPlanDef = true;
        }
      }
      // Use the title or a placeholder for the when condition
      const whenLabel = node.title || node.description || canonicalValueStr || '[UnnamedDecisionReference]';
      output += `${indent}when "${whenLabel}" then use "${canonicalValueStr}".\n`;
      continue;
    }
    if (!node.conditionExpression) {
      if (node.children.length > 0) {
        output += emitWhenBlocksRecursive(node.children, activities, allInstances, instance, indent, doReferences);
      }     continue;
    }
    if (node.children.length > 0 && node.definitionCanonical) {
      throw new Error('[emitWhenBlocksRecursive] Node has both children and definitionCanonical, which is ambiguous and violates the grammar.');
    }
    if (node.children.length > 0) {
      output += `${indent}when "${node.conditionExpression}" then:\n`;
      output += emitWhenBlocksRecursive(node.children, activities, allInstances, instance, indent + '    ', doReferences);
      output += `${indent}done\n`;
      continue;
    }
    // Calculate canonicalValueStr for this node
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
    // Calculate hasPlanDef for this node
    let hasPlanDef = false;
    if (canonicalValueStr) {
      const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
      if (
        referenced &&
        referenced.instanceOf &&
        PLAN_DEFINITION_URLS.includes(referenced.instanceOf)
      ) {
        hasPlanDef = true;
      }
    }
    // Delegate activity emission to activityDefinition helper
    output += `${indent}when "${node.conditionExpression}" then`;
    output += emitActivityBlock(node, canonicalValueStr, allInstances, activities, indent, hasPlanDef, doReferences);
  }
  return output;
}

// Update parseActions to extract description
function parseActions(rules: any[], basePath = 'action'): ActionNode[] {
  const nodes: ActionNode[] = [];
  let currentNode: ActionNode | null = null;
  let currentExtensions: any[] = [];
  let currentExtension: any = null;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Match action[+] at this level
    if (rule.path === `${basePath}[+]`) {
      // Start a new action node
      if (currentNode) {
        if (currentExtensions.length > 0) currentNode.extension = currentExtensions;
        nodes.push(currentNode);
      }
      currentNode = { children: [] };
      currentExtensions = [];
      currentExtension = null;
    } else if (rule.path.startsWith(`${basePath}[=]`)) {
      // Property or nested action of the current node
      if (!currentNode) continue; // Defensive: skip if no current node
      const subPath = rule.path.slice(`${basePath}[=]`.length);
      if (subPath.startsWith('.action[+]')) {
        // Start a new child action
        const childBase = `${basePath}[=].action`;
        const childRules: any[] = [];
        let j = i;
        while (j < rules.length && rules[j].path.startsWith(childBase)) {
          childRules.push(rules[j]);
          j++;
        }
        currentNode.children = parseActions(childRules, childBase);
        i = j - 1;
      } else if (subPath.startsWith('.action[=]')) {
        continue;
      } else if (subPath === '.extension[+]') {
        // Start a new extension object
        currentExtension = {};
        currentExtensions.push(currentExtension);
      } else if (subPath.startsWith('.extension[=]')) {
        // Set properties on the most recent extension object
        if (!currentExtension) {
          currentExtension = {};
          currentExtensions.push(currentExtension);
        }
        if (subPath.endsWith('.url')) currentExtension.url = rule.value;
        if (subPath.endsWith('.valueMarkdown')) currentExtension.valueMarkdown = rule.value;
      } else {
        if (subPath === '.title') currentNode.title = rule.value;
        if (subPath === '.description') currentNode.description = rule.value;
        if (subPath.endsWith('.condition[=].expression.expression')) currentNode.conditionExpression = rule.value;
        if (subPath === '.definitionCanonical') currentNode.definitionCanonical = rule.value;
      }
    }
  }
  if (currentNode) {
    if (currentExtensions.length > 0) currentNode.extension = currentExtensions;
    nodes.push(currentNode);
  }
  return nodes;
}

export function mapPlanDefinitionToDecision(instance: any, allInstances: any[]): { decision: string, activities: { id: string, name: string, value: string | undefined, original: string }[], doReferences: { id: string, placeholder: string }[] } {
  if (!PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
    return { decision: '', activities: [], doReferences: [] };
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
  const activities: { id: string, name: string, value: string | undefined, original: string }[] = [];
  const doReferences: { id: string, placeholder: string }[] = [];

  output += emitWhenBlocksRecursive(actionTree, activities, allInstances, instance, '    ', doReferences);
  output += 'done\n\n';
  return { decision: output, activities, doReferences };
}
