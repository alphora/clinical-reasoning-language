"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_DEFINITION_URLS = void 0;
exports.getActivityPerformClause = getActivityPerformClause;
exports.getNextActivityId = getNextActivityId;
exports.emitActivityBlock = emitActivityBlock;
const fshPathFunctions_1 = require("../utils/fshPathFunctions");
exports.ACTIVITY_DEFINITION_URLS = [
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-communicationactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-collectinformationactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-enrollmentactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-generatereportactivityn",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-medicationrequestactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-dispensemedicationactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-administermedicationactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-documentmedicationactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-immunizationactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-proposediagnosisactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recorddetectedissueactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recordinferenceactivity",
    "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-reportflagactivity",
];
function formatActivityValue(value) {
    if (!value) {
        return "";
    }
    return value.length > 80 ? `\n    of ${value}` : ` of ${value}`;
}
function getActivityPerformClause(activityDef) {
    let kind = undefined;
    let doNotPerform = false;
    if (activityDef && Array.isArray(activityDef.rules)) {
        const kindRule = activityDef.rules.find((r) => r.path === "kind");
        if (kindRule) {
            if (typeof kindRule.value === "string") {
                kind = "CPG" + kindRule.value.replace(/#/g, "");
            }
            else if (kindRule.value && typeof kindRule.value === "object" && "code" in kindRule.value) {
                kind = "CPG" + String(kindRule.value.code).replace(/#/g, "");
            }
        }
        const doNotPerformRule = activityDef.rules.find((r) => r.path === "doNotPerform");
        if (doNotPerformRule && doNotPerformRule.value === true) {
            doNotPerform = true;
        }
        if (!kindRule) {
        }
    }
    let activityValue = undefined;
    let value = undefined;
    let terminology = undefined;
    if (activityDef && Array.isArray(activityDef.rules)) {
        const pccRule = activityDef.rules.find((r) => r.path === "medicationCodeableConcept");
        if (pccRule) {
            if (typeof pccRule.value === "object" &&
                pccRule.value !== null &&
                "display" in pccRule.value &&
                typeof pccRule.value.display === "string") {
                activityValue = `"${pccRule.value.display}"`;
                value = pccRule.value.display;
                const system = "system" in pccRule.value && typeof pccRule.value.system === "string"
                    ? pccRule.value.system
                    : "";
                const code = "code" in pccRule.value && typeof pccRule.value.code === "string"
                    ? pccRule.value.code
                    : "";
                const displayStr = pccRule.value.display;
                if (displayStr && code && system) {
                    terminology = { identifier: displayStr, code, system };
                }
            }
            else if (typeof pccRule.value === "object" &&
                pccRule.value !== null &&
                "code" in pccRule.value &&
                typeof pccRule.value.code === "string") {
                activityValue = `"${pccRule.value.code}"`;
                value = pccRule.value.code;
            }
            else if (typeof pccRule.value === "string") {
                const match = /^.*?"(.*?)"$/.exec(pccRule.value);
                if (match) {
                    activityValue = `"${match[1]}"`;
                    value = match[1];
                }
            }
        }
        if (!activityValue) {
            const dvRules = activityDef.rules.filter((r) => r.path.startsWith("dynamicValue"));
            for (const rule of dvRules) {
                if (rule.path.endsWith(".path") && rule.value === "code.coding") {
                    const prefix = rule.path.replace(/\.path$/, "");
                    const descRule = activityDef.rules.find((r) => r.path === `${prefix}.expression.description`);
                    const exprRule = activityDef.rules.find((r) => r.path === `${prefix}.expression.expression`);
                    if (descRule && typeof descRule.value === "string") {
                        activityValue = `"${descRule.value}"`;
                        value = descRule.value;
                    }
                    if (exprRule && typeof exprRule.value === "string") {
                        const codeStr = (0, fshPathFunctions_1.extractCodeExpression)(exprRule.value);
                        let system = "", code = "";
                        const sysMatch = /system "([^"]+)"/.exec(codeStr);
                        const codeMatch = /code "([^"]+)"/.exec(codeStr);
                        if (sysMatch)
                            system = sysMatch[1];
                        if (codeMatch)
                            code = codeMatch[1];
                        if (descRule && typeof descRule.value === "string" && code) {
                            terminology = { identifier: descRule.value, code, system };
                        }
                    }
                }
            }
        }
    }
    if (!kind && !activityValue) {
        return { clauseString: "", value };
    }
    const clauseString = `\n    ${doNotPerform ? "do not perform" : "perform"} ${kind}${formatActivityValue(activityValue)}`;
    return { clauseString, value, terminology };
}
let activityIdCounter = 0;
function getNextActivityId() {
    return `activity_${++activityIdCounter}`;
}
function emitActivityBlock(node, canonicalValueStr, allInstances, activities, indent, hasPlanDef, doReferences) {
    const referenced = allInstances.find((inst) => inst.name === canonicalValueStr);
    const doIdentifier = node.title ? (0, fshPathFunctions_1.toIdentifier)(node.title) : "UnnamedActivity";
    let activityDescription = node.description ? node.description : undefined;
    if (referenced && referenced.rules) {
        const descRule = referenced.rules.find((r) => r.path === "Description");
        activityDescription = descRule ? descRule.value : undefined;
    }
    let hasActivityDef = false;
    let activityDefInstance = null;
    let useIdentifier = "";
    if (canonicalValueStr) {
        if (referenced && exports.ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf || "")) {
            hasActivityDef = true;
            activityDefInstance = referenced;
        }
        if (hasPlanDef && referenced && referenced.title) {
            useIdentifier = (0, fshPathFunctions_1.toIdentifier)(referenced.title);
        }
        else if (hasPlanDef && canonicalValueStr) {
            useIdentifier = (0, fshPathFunctions_1.toIdentifier)(canonicalValueStr);
        }
    }
    let rationale = undefined;
    if (Array.isArray(node.extension)) {
        const rationaleExt = node.extension.find((ext) => ext.url === "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-rationale" &&
            typeof ext.valueMarkdown === "string" &&
            ext.valueMarkdown.trim() !== "");
        if (rationaleExt) {
            rationale = `\n    because \`${rationaleExt.valueMarkdown.replace(/`/g, "`")}\``;
        }
    }
    let output = "";
    if (hasPlanDef && hasActivityDef) {
        output += `:\n`;
        output += `${indent}    use ${useIdentifier}.\n`;
        const activityId = getNextActivityId();
        const placeholder = `<<ACTIVITY_REF:${activityId}>>`;
        output += `${indent}    do ${placeholder}.\n`;
        output += `${indent}done\n`;
        if (activityDefInstance) {
            const { clauseString, value, terminology } = getActivityPerformClause(activityDefInstance);
            activities.push({
                id: activityId,
                name: doIdentifier,
                value,
                original: `activity ${doIdentifier}${clauseString}${rationale ?? ""}.\n\n`,
                ...(terminology ? { terminology } : {}),
            });
            doReferences.push({ id: activityId, placeholder });
        }
        else {
            activities.push({
                id: activityId,
                name: doIdentifier,
                value: undefined,
                original: `activity ${doIdentifier} // TODO: activity details${rationale ?? ""}.\n\n`,
            });
            doReferences.push({ id: activityId, placeholder });
        }
    }
    else if (hasPlanDef) {
        output += ` use ${useIdentifier}.\n`;
    }
    else if (hasActivityDef) {
        const activityId = getNextActivityId();
        const placeholder = `<<ACTIVITY_REF:${activityId}>>`;
        output += ` do ${placeholder}.\n`;
        if (activityDefInstance) {
            const { clauseString, value, terminology } = getActivityPerformClause(activityDefInstance);
            activities.push({
                id: activityId,
                name: doIdentifier,
                value,
                original: `activity ${doIdentifier}${clauseString}${rationale ?? ""}.\n\n`,
                ...(terminology ? { terminology } : {}),
            });
            doReferences.push({ id: activityId, placeholder });
        }
        else {
            activities.push({
                id: activityId,
                name: doIdentifier,
                value: undefined,
                original: `activity ${doIdentifier} // TODO: activity details${rationale ?? ""}.\n\n`,
            });
            doReferences.push({ id: activityId, placeholder });
        }
    }
    else {
        const activityId = getNextActivityId();
        const placeholder = `<<ACTIVITY_REF:${activityId}>>`;
        output += ` do ${placeholder}.\n`;
        activities.push({
            id: activityId,
            name: doIdentifier,
            value: activityDescription,
            original: `activity ${doIdentifier}\n    perform CPGCommunicationRequest${formatActivityValue("`" + (activityDescription || "TODO: fill in message.") + "`")}${rationale ?? ""}.\n\n`,
        });
        doReferences.push({ id: activityId, placeholder });
    }
    return output;
}
//# sourceMappingURL=activityDefinition.js.map