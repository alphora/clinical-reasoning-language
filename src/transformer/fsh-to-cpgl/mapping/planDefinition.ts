const PLAN_DEFINITION_URLS = [
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition",
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition",
];

import { toIdentifier, toString } from "../utils/fshPathFunctions";

import { emitActivityBlock } from "./activityDefinition";

interface ExtensionObj {
  url: string;
  valueMarkdown?: string;
  [key: string]: unknown;
}

interface ActionNode {
  title?: string;
  description?: string;
  conditionExpression?: string;
  definitionCanonical?: string;
  children: ActionNode[];
  extension?: ExtensionObj[];
}

function emitWhenBlocksRecursive(
  nodes: ActionNode[],
  activities: { id: string; name: string; value: string | undefined; original: string }[],
  allInstances: unknown[],
  instance: unknown,
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
          const referenced = (allInstances as unknown[]).find(
            (inst): inst is { name: string; instanceOf?: string } =>
              typeof inst === "object" &&
              inst !== null &&
              "name" in inst &&
              typeof (inst as { name: unknown }).name === "string" &&
              (inst as { name: string }).name === canonicalValueStr &&
              "instanceOf" in inst &&
              typeof (inst as { instanceOf?: unknown }).instanceOf === "string",
          );
          if (
            referenced &&
            typeof referenced === "object" &&
            referenced !== null &&
            "instanceOf" in referenced &&
            PLAN_DEFINITION_URLS.includes((referenced as { instanceOf: string }).instanceOf)
          ) {
            hasPlanDef = true;
          }
        }
        // Indent each use/do line to the next level
        const actionLine = emitActivityBlock(
          node,
          canonicalValueStr,
          allInstances as any[],
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
        const referenced = (allInstances as unknown[]).find(
          (inst): inst is { name: string; instanceOf?: string } =>
            typeof inst === "object" &&
            inst !== null &&
            "name" in inst &&
            typeof (inst as { name: unknown }).name === "string" &&
            (inst as { name: string }).name === canonicalValueStr &&
            "instanceOf" in inst &&
            typeof (inst as { instanceOf?: unknown }).instanceOf === "string",
        );
        if (
          referenced &&
          typeof referenced === "object" &&
          referenced !== null &&
          "instanceOf" in referenced &&
          PLAN_DEFINITION_URLS.includes((referenced as { instanceOf: string }).instanceOf)
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
        allInstances as any[],
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
function parseActions(rules: unknown[], basePath = "action"): ActionNode[] {
  const nodes: ActionNode[] = [];
  let currentNode: ActionNode | null = null;
  let currentExtensions: ExtensionObj[] = [];
  let currentExtension: ExtensionObj | null = null;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as Record<string, unknown>;
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
    } else if (typeof rule.path === "string" && rule.path.startsWith(`${basePath}[=]`)) {
      // Property or nested action of the current node
      if (!currentNode) continue; // Defensive: skip if no current node
      const subPath = (rule.path as string).slice(`${basePath}[=]`.length);
      if (subPath.startsWith(".action[+]")) {
        // Start a new child action
        const childBase = `${basePath}[=].action`;
        const childRules: unknown[] = [];
        let j = i;
        while (
          j < rules.length &&
          typeof (rules[j] as Record<string, unknown>).path === "string" &&
          ((rules[j] as Record<string, unknown>).path as string).startsWith(childBase)
        ) {
          childRules.push(rules[j]);
          j++;
        }
        currentNode.children = parseActions(childRules, childBase);
        i = j - 1;
      } else if (subPath.startsWith(".action[=]")) {
        continue;
      } else if (subPath === ".extension[+]") {
        // Start a new extension object with required 'url' property
        currentExtension = { url: "" };
        currentExtensions.push(currentExtension);
      } else if (subPath.startsWith(".extension[=]")) {
        // Set properties on the most recent extension object
        if (!currentExtension) {
          currentExtension = { url: "" };
          currentExtensions.push(currentExtension);
        }
        if (subPath.endsWith(".url")) currentExtension.url = rule.value as string;
        if (subPath.endsWith(".valueMarkdown"))
          currentExtension.valueMarkdown = rule.value as string;
      } else {
        if (subPath === ".title") currentNode.title = rule.value as string;
        if (subPath === ".description") currentNode.description = rule.value as string;
        if (subPath.endsWith(".condition[=].expression.expression"))
          currentNode.conditionExpression = rule.value as string;
        if (subPath === ".definitionCanonical")
          currentNode.definitionCanonical = rule.value as string;
      }
    }
  }
  if (currentNode) {
    if (currentExtensions.length > 0) {
      // Only push extensions that have a non-empty url
      currentNode.extension = currentExtensions.filter(
        (ext) => ext.url !== undefined && ext.url !== null,
      );
    }
    nodes.push(currentNode);
  }
  return nodes;
}

export function mapPlanDefinitionToDecision(
  instance: unknown,
  allInstances: unknown[],
): {
  decision: string;
  activities: { id: string; name: string; value: string | undefined; original: string }[];
  doReferences: { id: string; placeholder: string }[];
} {
  if (
    typeof instance !== "object" ||
    instance === null ||
    !("instanceOf" in instance) ||
    !PLAN_DEFINITION_URLS.includes((instance as { instanceOf: string }).instanceOf)
  ) {
    return { decision: "", activities: [], doReferences: [] };
  }
  let description = (instance as { description?: string }).description;
  const rules = (instance as { rules?: unknown[] }).rules || [];
  if (!description) {
    const descriptionRule = (rules as Record<string, unknown>[]).find(
      (r) => r.path === "Description",
    );
    description = descriptionRule ? (descriptionRule.value as string) : undefined;
  }
  const title =
    (instance as { title?: string }).title ||
    (rules as Record<string, unknown>[]).find((r) => r.path === "Title")?.value;
  const plandefTitle = title ? toIdentifier(title as string) : "[UnnamedPlanDefinition]";
  const plandefDescription = description ? toString(description) : "";
  const citationRule = (rules as Record<string, unknown>[]).find(
    (r) => r.path === "relatedArtifact[=].citation",
  );
  let citation = citationRule ? toString(citationRule.value as string) : "";
  // Remove outer quotes from citation if present
  if (citation.startsWith('"') && citation.endsWith('"')) {
    citation = citation.slice(1, -1);
  }

  let output = "";
  if ((instance as { name?: string }).name) {
    output += `// Instance: ${(instance as unknown as { name: string }).name}\n`;
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
  const actionTree = parseActions(rules);

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
