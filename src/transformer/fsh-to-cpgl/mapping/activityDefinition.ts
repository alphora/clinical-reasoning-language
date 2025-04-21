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

export function mapActivityDefinitionToActivity(instance: any): string {
  // TODO: Implement mapping from ActivityDefinition FSH instance to CPG-L activity block
  return `// [DEBUGGING] ActivityDefinition: ${instance.name}\n`;
}

export function getActivityPerformClause(activityDef: any): string {
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
  if (!kind) {
    kind = 'TODO';
  }
  // Extract code-display from rules
  let codeDisplay: string | undefined = undefined;
  if (activityDef && Array.isArray(activityDef.rules)) {
    // Prefer productCodeableConcept
    const pccRule = activityDef.rules.find((r: any) => r.path === 'productCodeableConcept');
    if (pccRule) {
      if (typeof pccRule.value === 'object' && pccRule.value !== null) {
        if ('display' in pccRule.value && pccRule.value.display) {
          codeDisplay = `"${pccRule.value.display}"`;
        } else if ('code' in pccRule.value && pccRule.value.code) {
          codeDisplay = `"${pccRule.value.code}"`;
        }
      } else if (typeof pccRule.value === 'string') {
        // Fallback: extract quoted string
        const match = /^.*?"(.*?)"$/.exec(pccRule.value);
        if (match) {
          codeDisplay = `"${match[1]}"`;
        }
      }
    }
    if (!pccRule) {
      console.log('[DEBUGGING] No productCodeableConcept rule found. All rule paths/values:', activityDef.rules.map((r: any) => ({ path: r.path, value: r.value })));
    }
    // Fallback to dynamicValue logic (do not change)
    if (!codeDisplay) {
      // Find all dynamicValue rules
      const dvRules = activityDef.rules.filter((r: any) => r.path.startsWith('dynamicValue'));
      for (const rule of dvRules) {
        // Look for a rule like 'dynamicValue[=].path' with value 'code.coding'
        if (rule.path.endsWith('.path') && rule.value === 'code.coding') {
          // Find the corresponding description
          const prefix = rule.path.replace(/\.path$/, '');
          const descRule = activityDef.rules.find((r: any) => r.path === `${prefix}.expression.description`);
          if (descRule && typeof descRule.value === 'string') {
            codeDisplay = `"${descRule.value}"`;
            break;
          }
        }
      }
    }
  }
  if (!codeDisplay) {
    codeDisplay = 'TODO';
  }
  return `perform ${kind}\n    of ${codeDisplay}.`;
}

/**
 * Emits the activity block for a given action node, handling all activity-specific logic.
 * Returns an object with the output string and any activity objects to push.
 */
export function emitActivityBlock(
  node: any,
  canonicalValueStr: string | undefined,
  allInstances: any[],
  activities: { name: string, original: string }[],
  indent: string,
  hasPlanDef: boolean
): string {
  // hasPlanDef is now passed in
  const activityName = node.title ? toIdentifier(node.title) : 'UnnamedActivity';
  const activityDescription = node.description ? toString(node.description)  : 'TODO: fill in message.';
  let doIdentifier = activityName;
  let hasActivityDef = false;
  let useIdentifier = '';
  const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
  if (canonicalValueStr) {
    // Only check for ActivityDefinition URLs here
    if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
      hasActivityDef = true;
    }
  }
  let output = '';
  if (hasPlanDef && hasActivityDef) {
    output += `:\n`;
    output += `${indent}    use ${useIdentifier}.\n`;
    output += `${indent}    do ${doIdentifier}.\n`;
    output += `${indent}done\n`;
    // Only call getActivityPerformClause with the resolved ActivityDefinition instance
    let activityDefInstance = null;
    if (canonicalValueStr) {
      const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
      if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
        activityDefInstance = referenced;
      }
    }
    if (activityDefInstance) {
      console.log('[DEBUGGING] getActivityPerformClause called with ActivityDefinition:', { name: activityDefInstance.name, instanceOf: activityDefInstance.instanceOf });
      activities.push({ name: doIdentifier, original: `activity ${doIdentifier} ${getActivityPerformClause(activityDefInstance)}\n\n` });
    } else {
      activities.push({ name: doIdentifier, original: `activity ${doIdentifier} // TODO: activity details.\n\n` });
    }
    output += ` use ${useIdentifier}.\n`;
  } else if (hasActivityDef) {
    output += ` do ${doIdentifier}.\n`;
    // Only call getActivityPerformClause with the resolved ActivityDefinition instance
    let activityDefInstance = null;
    if (canonicalValueStr) {
      const referenced = allInstances.find(inst => inst.name === canonicalValueStr);
      if (referenced && ACTIVITY_DEFINITION_URLS.includes(referenced.instanceOf)) {
        activityDefInstance = referenced;
      }
    }
    if (activityDefInstance) {
      console.log('[DEBUGGING] getActivityPerformClause called with ActivityDefinition:', { name: activityDefInstance.name, instanceOf: activityDefInstance.instanceOf });
      activities.push({ name: doIdentifier, original: `activity ${doIdentifier} ${getActivityPerformClause(activityDefInstance)}\n\n` });
    } else {
      activities.push({ name: doIdentifier, original: `activity ${doIdentifier} // TODO: activity details.\n\n` });
    }
  } else {
    // Neither: emit a CPGCommunicationRequest activity (unique per name+description)
    output += ` do ${doIdentifier}.\n`;
    activities.push({ name: doIdentifier, original: `activity ${doIdentifier} perform CPGCommunicationRequest\n    of ${activityDescription}.\n\n` });
  }
  return output;
} 