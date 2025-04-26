const PLAN_DEFINITION_URLS = [
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition",
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition",
];

import { toIdentifier, toString } from "../utils/fshPathFunctions";

import { emitActivityBlock } from "./activityDefinition";

interface ActionNode {
  title?: string;
  description?: string;
  conditionExpression?: string;
  definitionCanonical?: string;
  children: ActionNode[];
  extension?: any[];
}

interface FshRule {
  path: string;
  value?: unknown;
}

interface Instance {
  instanceOf?: string;
  name?: string;
  title?: string;
  description?: string;
  rules?: FshRule[];
}

function emitWhenBlocksRecursive(
  nodes: ActionNode[],
  activities: { id: string; name: string; value: string | undefined; original: string }[],
  allInstances: any[],
  instance: any,
  indent = "    ",
  doReferences: { id: string; placeholder: string }[],
): string {
  let output = "";
  // Group nodes by conditionExpression (use '' for undefined/empty)
  const groups: { [cond: string]: ActionNode[] } = {};
  for (const node of nodes) {
    const cond = node.conditionExpression || "";
    if (!groups[cond]) groups[cond] = [];
    groups[cond].push(node);
  }
  for (const cond in groups) {
    const group = groups[cond];
    // Only stack comments for all action titles above when "" then: blocks
    if (cond === "") {
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
      output += emitWhenBlocksRecursive(
        node.children,
        activities,
        allInstances,
        instance,
        indent + "    ",
        doReferences,
      );
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
          if (typeof node.definitionCanonical === "string") {
            if (node.definitionCanonical.startsWith("Canonical(")) {
              canonicalValueStr = node.definitionCanonical.replace(/^Canonical\((.*)\)$/, "$1");
            } else {
              canonicalValueStr = node.definitionCanonical;
            }
          } else if (
            typeof node.definitionCanonical === "object" &&
            "entityName" in node.definitionCanonical
          ) {
            canonicalValueStr = (node.definitionCanonical as { entityName: string }).entityName;
          }
        }
        // Calculate hasPlanDef for this node
        let hasPlanDef = false;
        if (canonicalValueStr) {
          const referenced = allInstances.find((inst) => inst.name === canonicalValueStr);
          if (
            referenced &&
            referenced.instanceOf &&
            PLAN_DEFINITION_URLS.includes(referenced.instanceOf)
          ) {
            hasPlanDef = true;
          }
        }
        // Indent each use/do line to the next level
        const actionLine = emitActivityBlock(
          node,
          canonicalValueStr,
          allInstances,
          activities,
          indent + "    ",
          hasPlanDef,
          doReferences,
        ).trim();
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
        if (typeof node.definitionCanonical === "string") {
          if (node.definitionCanonical.startsWith("Canonical(")) {
            canonicalValueStr = node.definitionCanonical.replace(/^Canonical\((.*)\)$/, "$1");
          } else {
            canonicalValueStr = node.definitionCanonical;
          }
        } else if (
          typeof node.definitionCanonical === "object" &&
          "entityName" in node.definitionCanonical
        ) {
          canonicalValueStr = (node.definitionCanonical as { entityName: string }).entityName;
        }
      }
      let hasPlanDef = false;
      if (canonicalValueStr) {
        const referenced = allInstances.find((inst) => inst.name === canonicalValueStr);
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
      let actionLine = emitActivityBlock(
        node,
        canonicalValueStr,
        allInstances,
        activities,
        "",
        hasPlanDef,
        doReferences,
      ).trim();
      // Remove leading indentation from actionLine if present
      if (actionLine.startsWith(":")) actionLine = actionLine.slice(1).trim();
      output += ` ${actionLine}\n`;
    }
  }
  return output;
}

// Update parseActions to extract description
function parseActions(rules: FshRule[], basePath = "action"): ActionNode[] {
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
      if (subPath.startsWith(".action[+]")) {
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
      } else if (subPath.startsWith(".action[=]")) {
        continue;
      } else if (subPath === ".extension[+]") {
        // Start a new extension object
        currentExtension = {};
        currentExtensions.push(currentExtension);
      } else if (subPath.startsWith(".extension[=]")) {
        // Set properties on the most recent extension object
        if (!currentExtension) {
          currentExtension = {};
          currentExtensions.push(currentExtension);
        }
        if (subPath.endsWith(".url")) currentExtension.url = rule.value;
        if (subPath.endsWith(".valueMarkdown")) currentExtension.valueMarkdown = rule.value;
      } else {
        if (subPath === ".title" && typeof rule.value === "string") currentNode.title = rule.value;
        if (subPath === ".description" && typeof rule.value === "string") currentNode.description = rule.value;
        if (subPath.endsWith(".condition[=].expression.expression") && typeof rule.value === "string")
          currentNode.conditionExpression = rule.value;
        if (subPath === ".definitionCanonical" && typeof rule.value === "string")
          currentNode.definitionCanonical = rule.value;
      }
    }
  }
  if (currentNode) {
    if (currentExtensions.length > 0) currentNode.extension = currentExtensions;
    nodes.push(currentNode);
  }
  return nodes;
}

export function mapPlanDefinitionToDecision(
  instance: Instance,
  allInstances: Instance[],
): {
  decision: string;
  activities: { id: string; name: string; value: string | undefined; original: string }[];
  doReferences: { id: string; placeholder: string }[];
} {
  if (!instance.instanceOf || !PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
    return { decision: "", activities: [], doReferences: [] };
  }
  let description = instance.description;
  if (!description) {
    const descriptionRule = (instance.rules || []).find((r) => r.path === "Description");
    description =
      descriptionRule && typeof descriptionRule.value === "string"
        ? descriptionRule.value
        : undefined;
  }
  const title = instance.title || (instance.rules || []).find((r) => r.path === "Title")?.value;
  const plandefTitle = title ? toIdentifier(String(title)) : "[UnnamedPlanDefinition]";
  const plandefDescription = description ? toString(String(description)) : "";
  const citationRule = (instance.rules || []).find((r) => r.path === "relatedArtifact[=].citation");
  let citation =
    citationRule && typeof citationRule.value === "string" ? toString(citationRule.value) : "";
  // Remove outer quotes from citation if present
  if (citation.startsWith('"') && citation.endsWith('"')) {
    citation = citation.slice(1, -1);
  }

  let output = "";
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
  const activities: { id: string; name: string; value: string | undefined; original: string }[] =
    [];
  const doReferences: { id: string; placeholder: string }[] = [];

  output += emitWhenBlocksRecursive(
    actionTree,
    activities,
    allInstances,
    instance,
    "    ",
    doReferences,
  );
  output += "done\n\n";
  return { decision: output, activities, doReferences };
}
