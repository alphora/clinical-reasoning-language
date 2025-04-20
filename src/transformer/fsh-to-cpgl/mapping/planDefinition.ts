const PLAN_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition'
];

interface ActionNode {
  title: string;
  path: string;
  children: ActionNode[];
}

function buildActionTree(rules: any[]): ActionNode[] {
  const titleRules = rules.filter((rule: any) => rule.path && rule.path.endsWith('title'));
  console.log('[DEBUGGING] action.title rules:');
  for (const rule of titleRules) {
    console.log(`  path: ${rule.path}  value: ${rule.value}`);
  }
  // Map from path to node
  const nodeMap: Record<string, ActionNode> = {};
  // Map from parent path to array of child nodes
  const parentMap: Record<string, ActionNode[]> = {};

  for (const rule of titleRules) {
    const path = rule.path.replace(/\.title$/, '');
    const node: ActionNode = { title: rule.value, path, children: [] };
    nodeMap[path] = node;
    // Determine parent path
    const segments = path.split('.action[=]');
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join('.action[=]') : '';
    if (!parentMap[parentPath]) parentMap[parentPath] = [];
    parentMap[parentPath].push(node);
  }

  // Recursively attach children
  function attachChildren(node: ActionNode) {
    const children = parentMap[node.path] || [];
    node.children = children;
    for (const child of children) {
      attachChildren(child);
    }
  }

  // Roots are those whose parent path is ''
  const roots = parentMap[''] || [];
  for (const root of roots) {
    attachChildren(root);
  }

  function printTree(nodes: ActionNode[], indent = '') {
    for (const node of nodes) {
      console.log(`${indent}- ${node.title} (${node.path})`);
      if (node.children.length > 0) {
        printTree(node.children, indent + '  ');
      }
    }
  }
  console.log('[DEBUGGING] Action tree:');
  printTree(roots);

  return roots;
}

function normalizeActivityName(title: string): string {
  const base = title.replace(/[^a-zA-Z0-9]/g, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function emitWhenBlocks(nodes: ActionNode[], activities: string[], emittedActivities: Set<string>, indent = '    '): string {
  let output = '';
  for (const node of nodes) {
    if (node.children.length > 0) {
      output += `${indent}when "${node.title}" then:\n`;
      output += emitWhenBlocks(node.children, activities, emittedActivities, indent + '    ');
      output += `${indent}done\n`;
    } else {
      const activityName = normalizeActivityName(node.title);
      output += `${indent}when "${node.title}" then do "${activityName}".\n`;
      if (!emittedActivities.has(activityName)) {
        activities.push(`activity "${activityName}" perform ... // TODO: activity details\n`);
        emittedActivities.add(activityName);
      }
    }
  }
  return output;
}

export function mapPlanDefinitionToDecision(instance: any): string {
  if (!PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
    return '';
  }
  const decisionName = instance.name || '[UnnamedPlanDefinition]';
  let output = '';
  output += `decision "${decisionName}":\n`;

  const activities: string[] = [];
  const emittedActivities = new Set<string>();
  const actionTree = buildActionTree(instance.rules || []);
  output += emitWhenBlocks(actionTree, activities, emittedActivities);

  output += 'done\n';
  for (const act of activities) {
    output += act;
  }
  return output;
} 