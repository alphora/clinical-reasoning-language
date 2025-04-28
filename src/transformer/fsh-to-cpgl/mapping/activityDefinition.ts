import { toIdentifier, extractCodeExpression } from "../utils/fshPathFunctions";

export const ACTIVITY_DEFINITION_URLS = [
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

function formatActivityValue(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value.length > 80 ? `\n    of ${value}` : ` of ${value}`;
}

interface ActivityDefRule {
  path: string;
  value?: unknown;
}

export interface ActivityDef {
  rules?: ActivityDefRule[];
  instanceOf?: string;
  title?: string;
  description?: string;
  extension?: { url: string; valueMarkdown?: string }[];
  name?: string;
}

export function getActivityPerformClause(activityDef: ActivityDef): {
  clauseString: string;
  value: string | undefined;
  terminology?: { identifier: string; code: string; system: string };
} {
  // Extract kind from rules
  let kind: string | undefined = undefined;
  let doNotPerform = false;
  if (activityDef && Array.isArray(activityDef.rules)) {
    const kindRule = activityDef.rules.find((r: ActivityDefRule) => r.path === "kind");
    if (kindRule) {
      if (typeof kindRule.value === "string") {
        kind = "CPG" + kindRule.value.replace(/#/g, "");
      } else if (kindRule.value && typeof kindRule.value === "object" && "code" in kindRule.value) {
        kind = "CPG" + String(kindRule.value.code).replace(/#/g, "");
      }
    }
    // Check for doNotPerform
    const doNotPerformRule = activityDef.rules.find(
      (r: ActivityDefRule) => r.path === "doNotPerform",
    );
    if (doNotPerformRule && doNotPerformRule.value === true) {
      doNotPerform = true;
    }
    if (!kindRule) {
      // Remove all console.log statements with messages prefixed with [DEBUGGING]
    }
  }

  // Extract code-display and code from rules
  let activityValue: string | undefined = undefined;
  let value: string | undefined = undefined;
  let terminology: { identifier: string; code: string; system: string } | undefined = undefined;
  if (activityDef && Array.isArray(activityDef.rules)) {
    // Prefer medicationCodeableConcept
    const pccRule = activityDef.rules.find(
      (r: ActivityDefRule) => r.path === "medicationCodeableConcept",
    );
    if (pccRule) {
      if (
        typeof pccRule.value === "object" &&
        pccRule.value !== null &&
        "display" in pccRule.value &&
        typeof pccRule.value.display === "string"
      ) {
        activityValue = `"${pccRule.value.display}"`;
        value = pccRule.value.display;
        // Terminology extraction (use system and code directly)
        const system =
          "system" in pccRule.value && typeof pccRule.value.system === "string"
            ? pccRule.value.system
            : "";
        const code =
          "code" in pccRule.value && typeof pccRule.value.code === "string"
            ? pccRule.value.code
            : "";
        const displayStr = pccRule.value.display;
        if (displayStr && code && system) {
          terminology = { identifier: displayStr, code, system };
        }
      } else if (
        typeof pccRule.value === "object" &&
        pccRule.value !== null &&
        "code" in pccRule.value &&
        typeof pccRule.value.code === "string"
      ) {
        activityValue = `"${pccRule.value.code}"`;
        value = pccRule.value.code;
      } else if (typeof pccRule.value === "string") {
        // Fallback: extract quoted string
        const match = /^.*?"(.*?)"$/.exec(pccRule.value);
        if (match) {
          activityValue = `"${match[1]}"`;
          value = match[1];
        }
      }
    }
    // Fallback to dynamicValue logic
    if (!activityValue) {
      // Find all dynamicValue rules
      const dvRules = activityDef.rules.filter((r: ActivityDefRule) =>
        r.path.startsWith("dynamicValue"),
      );
      for (const rule of dvRules) {
        // Look for a rule like 'dynamicValue[=].path' with value 'code.coding'
        if (rule.path.endsWith(".path") && rule.value === "code.coding") {
          // Find the corresponding description
          const prefix = rule.path.replace(/\.path$/, "");
          const descRule = activityDef.rules.find(
            (r: ActivityDefRule) => r.path === `${prefix}.expression.description`,
          );
          const exprRule = activityDef.rules.find(
            (r: ActivityDefRule) => r.path === `${prefix}.expression.expression`,
          );
          if (descRule && typeof descRule.value === "string") {
            activityValue = `"${descRule.value}"`;
            value = descRule.value;
          }
          if (exprRule && typeof exprRule.value === "string") {
            // Terminology extraction from CQL code expression
            const codeStr = extractCodeExpression(exprRule.value);
            // Parse system and code from codeStr
            let system = "",
              code = "";
            const sysMatch = /system "([^"]+)"/.exec(codeStr);
            const codeMatch = /code "([^"]+)"/.exec(codeStr);
            if (sysMatch) system = sysMatch[1];
            if (codeMatch) code = codeMatch[1];
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
  // Compose the clause string
  const clauseString = `\n    ${doNotPerform ? "do not perform" : "perform"} ${kind}${formatActivityValue(activityValue)}`;
  return { clauseString, value, terminology };
}

let activityIdCounter = 0;
export function getNextActivityId(): string {
  return `activity_${++activityIdCounter}`;
}

export function emitActivityBlock(
  node: ActivityDef,
  canonicalValueStr: string | undefined,
  allInstances: ActivityDef[],
  activities: {
    id: string;
    name: string;
    value: string | undefined;
    original: string;
    terminology?: { identifier: string; code: string; system: string };
  }[],
  indent: string,
  hasPlanDef: boolean,
  doReferences: { id: string; placeholder: string }[],
): string {
  // Compute doIdentifier and activityDescription
  const referenced = allInstances.find((inst: ActivityDef) => inst.name === canonicalValueStr);

  const doIdentifier = node.title ? toIdentifier(node.title as string) : "UnnamedActivity";

  let activityDescription = node.description ? (node.description as string) : undefined;
  if (referenced?.rules) {
    const descRule = referenced.rules.find((r: ActivityDefRule) => r.path === "Description");
    activityDescription = descRule ? (descRule.value as string) : undefined;
  }

  // Activity logic
  let hasActivityDef = false;
  let activityDefInstance = null;
  let useIdentifier = "";
  if (canonicalValueStr) {
    if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf ?? "")) {
      hasActivityDef = true;
      activityDefInstance = referenced;
    }
    if (hasPlanDef && referenced?.title) {
      useIdentifier = toIdentifier(referenced.title as string);
    } else if (hasPlanDef && canonicalValueStr) {
      useIdentifier = toIdentifier(canonicalValueStr);
    }
  }
  let rationale: string | undefined = undefined;
  if (Array.isArray(node.extension)) {
    const rationaleExt = node.extension.find(
      (ext: { url: string; valueMarkdown?: string }) =>
        ext.url === "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-rationale" &&
        typeof ext.valueMarkdown === "string" &&
        ext.valueMarkdown.trim() !== "",
    );
    if (rationaleExt) {
      // Format as CPGL backtick string (markdown/freetext)
      rationale = `\n    because \`${rationaleExt.valueMarkdown!.replace(/`/g, "`")}\``;
    }
  }

  let output = "";
  // If both planDef and activityDef are present, emit a use and do clause
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
    } else {
      activities.push({
        id: activityId,
        name: doIdentifier,
        value: undefined,
        original: `activity ${doIdentifier} // TODO: activity details${rationale ?? ""}.\n\n`,
      });
      doReferences.push({ id: activityId, placeholder });
    }
  }
  // If only planDef is present, emit a use clause
  else if (hasPlanDef) {
    output += ` use ${useIdentifier}.\n`;
  }
  // If only activityDef is present, emit a do clause
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
    } else {
      activities.push({
        id: activityId,
        name: doIdentifier,
        value: undefined,
        original: `activity ${doIdentifier} // TODO: activity details${rationale ?? ""}.\n\n`,
      });
      doReferences.push({ id: activityId, placeholder });
    }
  } else {
    // Neither: emit a CPGCommunicationRequest activity
    const activityId = getNextActivityId();
    const placeholder = `<<ACTIVITY_REF:${activityId}>>`;
    output += ` do ${placeholder}.\n`;
    activities.push({
      id: activityId,
      name: doIdentifier,
      value: activityDescription,
      original: `activity ${doIdentifier}\n    perform CPGCommunicationRequest${formatActivityValue("`" + (activityDescription ?? "TODO: fill in message.") + "`")}${rationale ?? ""}.\n\n`,
    });
    doReferences.push({ id: activityId, placeholder });
  }

  return output;
}
