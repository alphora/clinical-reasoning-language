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