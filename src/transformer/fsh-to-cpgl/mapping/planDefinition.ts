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
  // Group nodes by conditionExpression (use '' for undefined/empty)
  const groups: { [cond: string]: ActionNode[] } = {};
  for (const node of nodes) {
    const cond = node.conditionExpression || '';
    if (!groups[cond]) groups[cond] = [];
    groups[cond].push(node);
  }
  for (const cond in groups) {
    const group = groups[cond];
    // Only stack comments for all action titles above when "" then: blocks
    if (cond === '') {
      for (const node of group) {
        if (node.title) {
          output += `${indent}// ${node.title}\n`;
        }
      }
    }
    // If only one node in group and it has children, recurse as before
    if (group.length === 1 && group[0].children.length > 0) {
      const node = group[0];
      output += `${indent}when "${cond}" then:\n`;
      output += emitWhenBlocksRecursive(node.children, activities, allInstances, instance, indent + '    ', doReferences);
      output += `${indent}done\n`;
      continue;
    }
    // Otherwise, emit a single when block for the group
    if (group.length > 1) {
      output += `${indent}when "${cond}" then:\n`;
      for (const node of group) {
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
        // Indent each use/do line to the next level
        let actionLine = emitActivityBlock(node, canonicalValueStr, allInstances, activities, indent + '    ', hasPlanDef, doReferences).trim();
        // If the actionLine is not empty, add indentation
        if (actionLine.length > 0) {
          output += `${indent}    ${actionLine}\n`;
        }
      }
      output += `${indent}done\n`;
    } else if (group.length === 1 && group[0].children.length === 0) {
      // Single leaf node
      const node = group[0];
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
      // Emit singleActionStatement style: when "cond" then do ... (no colon, no done)
      output += `${indent}when "${cond}" then`;
      // Remove leading/trailing whitespace from emitActivityBlock output
      let actionLine = emitActivityBlock(node, canonicalValueStr, allInstances, activities, '', hasPlanDef, doReferences).trim();
      // Remove leading indentation from actionLine if present
      if (actionLine.startsWith(':')) actionLine = actionLine.slice(1).trim();
      output += ` ${actionLine}\n`;
    }
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
  const title = instance.title || ((instance.rules || []).find((r: any) => r.path === 'Title')?.value);
  const plandefTitle = title ? toIdentifier(title) : '[UnnamedPlanDefinition]';
  const plandefDescription = description ? toString(description) : '';
  const citationRule = (instance.rules || []).find((r: any) => r.path === 'relatedArtifact[=].citation');
  let citation = citationRule ? toString(citationRule.value) : '';
  // Remove outer quotes from citation if present
  if (citation.startsWith('"') && citation.endsWith('"')) {
    citation = citation.slice(1, -1);
  }

  let output = '';
  if (instance.name) {
    output += `// Instance: ${instance.name}\n`;
  }
  if (plandefDescription) {
    let desc = plandefDescription;
    if (desc.startsWith('"') && desc.endsWith('"')) {
      desc = desc.slice(1, -1);
    }
    output += `// Description: ${desc}\n`;
  }
  if (citation) {
    output += `// Provenance: ${citation}\n`;
  }
  output += `decision ${plandefTitle}:\n`;
  const actionTree = parseActions(instance.rules || []);

  // Collect activity stats for all PlanDefinitions
  const activities: { id: string, name: string, value: string | undefined, original: string }[] = [];
  const doReferences: { id: string, placeholder: string }[] = [];

  output += emitWhenBlocksRecursive(actionTree, activities, allInstances, instance, '    ', doReferences);
  output += 'done\n\n';
  return { decision: output, activities, doReferences };
}