const PLAN_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition'
];

interface ActionNode {
  title?: string;
  conditionExpression?: string;
  definitionCanonical?: string;
  children: ActionNode[];
}

function buildActionTreeFromRules(rules: any[], parentPath = 'action'): ActionNode[] {
  // Find all unique action base paths at this level (e.g., 'action[=]', 'action[=].action[=]')
  const actionBasePaths = new Set<string>();
  for (const rule of rules) {
    const match = rule.path.match(new RegExp(`^${parentPath}\[=\]`));
    if (match) {
      // The base path is up to the next property or nested action
      const basePathMatch = rule.path.match(new RegExp(`^(${parentPath}\[=\])`));
      if (basePathMatch) {
        actionBasePaths.add(basePathMatch[1]);
      }
    }
  }
  const nodes: ActionNode[] = [];
  for (const basePath of Array.from(actionBasePaths)) {
    // All rules for this action node
    const actionRules = rules.filter((r: any) => r.path.startsWith(basePath));
    const titleRule = actionRules.find((r: any) => r.path === `${basePath}.title`);
    // Find the first condition.expression.expression (if any)
    const conditionRule = actionRules.find((r: any) => r.path.endsWith('.condition[=].expression.expression'));
    const definitionCanonicalRule = actionRules.find((r: any) => r.path === `${basePath}.definitionCanonical`);
    // Recursively build children
    const children = buildActionTreeFromRules(rules, `${basePath}.action`);
    const node: ActionNode = {
      title: titleRule ? titleRule.value : undefined,
      conditionExpression: conditionRule ? conditionRule.value : undefined,
      definitionCanonical: definitionCanonicalRule ? definitionCanonicalRule.value : undefined,
      children
    };
    // [DEBUGGING] Log the node
    console.log(`[DEBUGGING] Built ActionNode:`, JSON.stringify(node, null, 2));
    nodes.push(node);
  }
  return nodes;
}

function normalizeActivityName(title: string): string {
  const base = title.replace(/[^a-zA-Z0-9]/g, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function emitWhenBlocksRecursive(
  nodes: ActionNode[],
  activities: { name: string, original: string }[],
  emittedActivities: Set<string>,
  indent = '    '
): string {
  let output = '';
  for (const node of nodes) {
    if (node.conditionExpression) {
      if (node.children.length > 0) {
        output += `${indent}when "${node.conditionExpression}" then:\n`;
        output += emitWhenBlocksRecursive(node.children, activities, emittedActivities, indent + '    ');
        output += `${indent}done\n`;
      } else {
        const activityName = node.title ? normalizeActivityName(node.title) : 'UnnamedActivity';
        output += `${indent}when "${node.conditionExpression}" then do "${activityName}".\n`;
        if (!emittedActivities.has(activityName)) {
          activities.push({ name: activityName, original: `activity "${activityName}" perform ... // TODO: activity details\n` });
          emittedActivities.add(activityName);
        }
      }
    } else if (node.children.length > 0) {
      output += emitWhenBlocksRecursive(node.children, activities, emittedActivities, indent);
    }
  }
  return output;
}

// New: Parse FSH rules into a hierarchical action tree using action[+]/action[=] semantics
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
        if (subPath.endsWith('.condition[=].expression.expression')) currentNode.conditionExpression = rule.value;
        if (subPath === '.definitionCanonical') currentNode.definitionCanonical = rule.value;
      }
    }
  }
  if (currentNode) nodes.push(currentNode);
  return nodes;
}

export function mapPlanDefinitionToDecision(instance: any): { decision: string, activities: { name: string, original: string }[] } {
  if (!PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
    return { decision: '', activities: [] };
  }
  const decisionName = instance.name || '[UnnamedPlanDefinition]';
  let output = '';
  // [DEBUGGING] Print all rules for this instance
  console.log(`[DEBUGGING] All rules for instance ${decisionName}:`);
  for (const rule of (instance.rules || [])) {
    console.log(`[DEBUGGING]   path: ${rule.path}  value: ${rule.value}`);
  }
  // Use the new parser
  const actionTree = parseActions(instance.rules || []);
  // [DEBUGGING] Print the entire constructed action tree
  console.log('[DEBUGGING] Constructed action tree:', JSON.stringify(actionTree, null, 2));
  output += `decision "${decisionName}":\n`;

  const activities: { name: string, original: string }[] = [];
  const emittedActivities = new Set<string>();
  output += emitWhenBlocksRecursive(actionTree, activities, emittedActivities);

  output += 'done\n';
  return { decision: output, activities };
} 