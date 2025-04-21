import { toIdentifier, toString } from '../utils/fshPathFunctions';

export const ACTIVITY_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-communicationactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-collectinformationactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-enrollmentactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-generatereportactivityn',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-medicationrequestactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-dispensemedicationactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-administermedicationactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-documentmedicationactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-immunizationactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-servicerequestactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-proposediagnosisactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recorddetectedissueactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recordinferenceactivity',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-reportflagactivity',
];

function formatActivityValue(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.length > 80 ? `\n    of ${value}` : ` of ${value}`;
}

export function getActivityPerformClause(activityDef: any, doIdentifier: string): { clauseString: string, value: string | undefined } {
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

  // Extract code-display from rules
  let activityValue: string | undefined = undefined;
  let value: string | undefined = undefined;
  if (activityDef && Array.isArray(activityDef.rules)) {
    // Prefer productCodeableConcept
    const pccRule = activityDef.rules.find((r: any) => r.path === 'productCodeableConcept');
    if (pccRule) {
      if (typeof pccRule.value === 'object' && pccRule.value !== null) {
        if ('display' in pccRule.value && pccRule.value.display) {
          activityValue = `"${pccRule.value.display}"`;
          value = pccRule.value.display;
        } else if ('code' in pccRule.value && pccRule.value.code) {
          activityValue = `"${pccRule.value.code}"`;
          value = pccRule.value.code;
        }
      } else if (typeof pccRule.value === 'string') {
        // Fallback: extract quoted string
        const match = /^.*?"(.*?)"$/.exec(pccRule.value);
        if (match) {
          activityValue = `"${match[1]}"`;
          value = match[1];
        }
      }
    }
    if (!pccRule) {
      console.log('[DEBUGGING] No productCodeableConcept rule found. All rule paths/values:', activityDef.rules.map((r: any) => ({ path: r.path, value: r.value })));
    }
    // Fallback to dynamicValue logic (do not change)
    if (!activityValue) {
      // Find all dynamicValue rules
      const dvRules = activityDef.rules.filter((r: any) => r.path.startsWith('dynamicValue'));
      for (const rule of dvRules) {
        // Look for a rule like 'dynamicValue[=].path' with value 'code.coding'
        if (rule.path.endsWith('.path') && rule.value === 'code.coding') {
          // Find the corresponding description
          const prefix = rule.path.replace(/\.path$/, '');
          const descRule = activityDef.rules.find((r: any) => r.path === `${prefix}.expression.description`);
          if (descRule && typeof descRule.value === 'string') {
            activityValue = `"${descRule.value}"`;
            value = descRule.value;
            break;
          }
        }
      }
    }
  }
  if (!kind && !activityValue) {
    return { clauseString: '', value };
  }
  const clauseString = `\n    perform ${kind}${formatActivityValue(activityValue)}.`;
  return { clauseString, value };
}

export function emitActivityBlock(
  node: any,
  canonicalValueStr: string | undefined,
  allInstances: any[],
  activities: { name: string, value: string | undefined, original: string }[],
  indent: string,
  hasPlanDef: boolean,
): string {
  // Compute doIdentifier and activityDescription
  const referenced = allInstances.find(inst => inst.name === canonicalValueStr);

  let doIdentifier = node.title ? toIdentifier(node.title) : 'UnnamedActivity';

  let activityDescription = node.description ? node.description : undefined;
  if (referenced && referenced.rules) {
    const descRule = referenced.rules.find((r: any) => r.path === 'Description');
    activityDescription = descRule ? descRule.value : undefined;
  }

  // Activity logic
  let hasActivityDef = false;
  let activityDefInstance = null;
  let useIdentifier = '';
  if (canonicalValueStr) {
    if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
      hasActivityDef = true;
      activityDefInstance = referenced;
    }
  }
  let output = '';
  // If both planDef and activityDef are present, emit a use and do clause
  if (hasPlanDef && hasActivityDef) {
    output += `:\n`;
    output += `${indent}    use ${useIdentifier}.\n`;
    output += `${indent}    do ${doIdentifier}.\n`;
    output += `${indent}done\n`;
    if (activityDefInstance) {
      const { clauseString, value } = getActivityPerformClause(activityDefInstance, doIdentifier);
      activities.push({ name: doIdentifier, value, original: `activity ${doIdentifier} ${clauseString}\n\n` });
    } else {
      activities.push({ name: doIdentifier, value: undefined, original: `activity ${doIdentifier} // TODO: activity details.\n\n` });
    }
  }
  // If only planDef is present, emit a use clause
  else if (hasPlanDef) {
    output += ` use ${useIdentifier}.\n`;
  }
  // If only activityDef is present, emit a do clause
  else if (hasActivityDef) {
    output += ` do ${doIdentifier}.\n`;
    if (activityDefInstance) {
      const { clauseString, value } = getActivityPerformClause(activityDefInstance, doIdentifier);
      activities.push({ name: doIdentifier, value, original: `activity ${doIdentifier} ${clauseString}\n\n` });
    } else {
      activities.push({ name: doIdentifier, value: undefined, original: `activity ${doIdentifier} // TODO: activity details.\n\n` });
    }
  } else {
    // Neither: emit a CPGCommunicationRequest activity
    output += ` do ${doIdentifier}.\n`;
    activities.push({ name: doIdentifier, value: activityDescription, original: `activity ${doIdentifier}\n    perform CPGCommunicationRequest${formatActivityValue('"' + (activityDescription || 'TODO: fill in message.') + '"')}.\n\n` });
  }
  return output;
} 