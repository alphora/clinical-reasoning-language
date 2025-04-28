"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapPlanDefinitionToDecision = mapPlanDefinitionToDecision;
const PLAN_DEFINITION_URLS = [
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition",
];
const fshPathFunctions_1 = require("../utils/fshPathFunctions");
const activityDefinition_1 = require("./activityDefinition");
function emitWhenBlocksRecursive(nodes, activities, allInstances, instance, indent = "    ", doReferences) {
    let output = "";
    const groups = {};
    for (const node of nodes) {
        const cond = node.conditionExpression ?? "";
        if (!groups[cond])
            groups[cond] = [];
        groups[cond].push(node);
    }
    for (const cond in groups) {
        const group = groups[cond];
        if (cond === "") {
            for (const node of group) {
                if (node.title) {
                    output += `${indent}// ${node.title}\n`;
                }
            }
        }
        if (group.length === 1 && group[0].children.length > 0) {
            const node = group[0];
            output += `${indent}when "${cond}" then:\n`;
            output += emitWhenBlocksRecursive(node.children, activities, allInstances, instance, indent + "    ", doReferences);
            output += `${indent}done\n`;
            continue;
        }
        if (group.length > 1) {
            output += `${indent}when "${cond}" then:\n`;
            for (const node of group) {
                let canonicalValueStr = undefined;
                if (node.definitionCanonical) {
                    if (typeof node.definitionCanonical === "string") {
                        if (node.definitionCanonical.startsWith("Canonical(")) {
                            canonicalValueStr = node.definitionCanonical.replace(/^Canonical\((.*)\)$/, "$1");
                        }
                        else {
                            canonicalValueStr = node.definitionCanonical;
                        }
                    }
                    else if (typeof node.definitionCanonical === "object" &&
                        "entityName" in node.definitionCanonical) {
                        canonicalValueStr = node.definitionCanonical.entityName;
                    }
                }
                let hasPlanDef = false;
                if (canonicalValueStr) {
                    const referenced = allInstances.find((inst) => typeof inst === "object" &&
                        inst !== null &&
                        "name" in inst &&
                        typeof inst.name === "string" &&
                        inst.name === canonicalValueStr &&
                        "instanceOf" in inst &&
                        typeof inst.instanceOf === "string");
                    if (referenced &&
                        typeof referenced === "object" &&
                        referenced !== null &&
                        "instanceOf" in referenced &&
                        PLAN_DEFINITION_URLS.includes(referenced.instanceOf)) {
                        hasPlanDef = true;
                    }
                }
                const actionLine = (0, activityDefinition_1.emitActivityBlock)(node, canonicalValueStr, allInstances, activities, indent + "    ", hasPlanDef, doReferences).trim();
                if (actionLine.length > 0) {
                    output += `${indent}    ${actionLine}\n`;
                }
            }
            output += `${indent}done\n`;
        }
        else if (group.length === 1 && group[0].children.length === 0) {
            const node = group[0];
            let canonicalValueStr = undefined;
            if (node.definitionCanonical) {
                if (typeof node.definitionCanonical === "string") {
                    if (node.definitionCanonical.startsWith("Canonical(")) {
                        canonicalValueStr = node.definitionCanonical.replace(/^Canonical\((.*)\)$/, "$1");
                    }
                    else {
                        canonicalValueStr = node.definitionCanonical;
                    }
                }
                else if (typeof node.definitionCanonical === "object" &&
                    "entityName" in node.definitionCanonical) {
                    canonicalValueStr = node.definitionCanonical.entityName;
                }
            }
            let hasPlanDef = false;
            if (canonicalValueStr) {
                const referenced = allInstances.find((inst) => typeof inst === "object" &&
                    inst !== null &&
                    "name" in inst &&
                    typeof inst.name === "string" &&
                    inst.name === canonicalValueStr &&
                    "instanceOf" in inst &&
                    typeof inst.instanceOf === "string");
                if (referenced &&
                    typeof referenced === "object" &&
                    referenced !== null &&
                    "instanceOf" in referenced &&
                    PLAN_DEFINITION_URLS.includes(referenced.instanceOf)) {
                    hasPlanDef = true;
                }
            }
            output += `${indent}when "${cond}" then`;
            let actionLine = (0, activityDefinition_1.emitActivityBlock)(node, canonicalValueStr, allInstances, activities, "", hasPlanDef, doReferences).trim();
            if (actionLine.startsWith(":"))
                actionLine = actionLine.slice(1).trim();
            output += ` ${actionLine}\n`;
        }
    }
    return output;
}
function parseActions(rules, basePath = "action") {
    const nodes = [];
    let currentNode = null;
    let currentExtensions = [];
    let currentExtension = null;
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (rule.path === `${basePath}[+]`) {
            if (currentNode) {
                if (currentExtensions.length > 0)
                    currentNode.extension = currentExtensions.filter((ext) => ext.url !== undefined && ext.url !== null && ext.url !== "");
                nodes.push(currentNode);
            }
            currentNode = { children: [] };
            currentExtensions = [];
            currentExtension = null;
        }
        else if (typeof rule.path === "string" && rule.path.startsWith(`${basePath}[=]`)) {
            if (!currentNode)
                continue;
            const subPath = rule.path.slice(`${basePath}[=]`.length);
            if (subPath.startsWith(".action[+]")) {
                const childBase = `${basePath}[=].action`;
                const childRules = [];
                let j = i;
                while (j < rules.length &&
                    typeof rules[j].path === "string" &&
                    rules[j].path.startsWith(childBase)) {
                    childRules.push(rules[j]);
                    j++;
                }
                currentNode.children = parseActions(childRules, childBase);
                i = j - 1;
            }
            else if (subPath.startsWith(".action[=]")) {
                continue;
            }
            else if (subPath === ".extension[+]") {
                currentExtension = { url: "" };
                currentExtensions.push(currentExtension);
            }
            else if (subPath.startsWith(".extension[=]")) {
                if (!currentExtension) {
                    currentExtension = { url: "" };
                    currentExtensions.push(currentExtension);
                }
                if (subPath.endsWith(".url"))
                    currentExtension.url = rule.value;
                if (subPath.endsWith(".valueMarkdown"))
                    currentExtension.valueMarkdown = rule.value;
            }
            else {
                if (subPath === ".title")
                    currentNode.title = rule.value;
                if (subPath === ".description")
                    currentNode.description = rule.value;
                if (subPath.endsWith(".condition[=].expression.expression"))
                    currentNode.conditionExpression = rule.value;
                if (subPath === ".definitionCanonical")
                    currentNode.definitionCanonical = rule.value;
            }
        }
    }
    if (currentNode) {
        if (currentExtensions.length > 0) {
            currentNode.extension = currentExtensions.filter((ext) => ext.url !== undefined && ext.url !== null && ext.url !== "");
        }
        nodes.push(currentNode);
    }
    return nodes;
}
function mapPlanDefinitionToDecision(instance, allInstances) {
    if (typeof instance !== "object" ||
        instance === null ||
        !("instanceOf" in instance) ||
        !PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
        return { decision: "", activities: [], doReferences: [] };
    }
    let description = instance.description;
    const rules = instance.rules || [];
    if (!description) {
        const descriptionRule = rules.find((r) => r.path === "Description");
        description = descriptionRule ? descriptionRule.value : undefined;
    }
    const title = instance.title ??
        rules.find((r) => r.path === "Title")?.value;
    const plandefTitle = title ? (0, fshPathFunctions_1.toIdentifier)(title) : "[UnnamedPlanDefinition]";
    const plandefDescription = description ? (0, fshPathFunctions_1.toString)(description) : "";
    const citationRule = rules.find((r) => r.path === "relatedArtifact[=].citation");
    let citation = citationRule ? (0, fshPathFunctions_1.toString)(citationRule.value) : "";
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
    const actionTree = parseActions(rules);
    const activities = [];
    const doReferences = [];
    output += emitWhenBlocksRecursive(actionTree, activities, allInstances, instance, "    ", doReferences);
    output += "done\n\n";
    return { decision: output, activities, doReferences };
}
//# sourceMappingURL=planDefinition.js.map