const PLAN_DEFINITION_URLS = [
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition',
  'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-recommendationdefinition'
];

export function mapPlanDefinitionToDecision(instance: any): string {
  if (!PLAN_DEFINITION_URLS.includes(instance.instanceOf)) {
    return '';
  }
  const decisionName = instance.name || '[UnnamedPlanDefinition]';
  let output = '';
  output += `decision "${decisionName}":\n`;

  // Find top-level actions (action.title rules)
  const actionTitles = (instance.rules || [])
    .filter((rule: any) => rule.path && rule.path.startsWith('action') && rule.path.endsWith('title'))
    .map((rule: any) => rule.value);

  for (const title of actionTitles) {
    output += `    when "${title}" then do "...".\n`;
    // TODO: Map nested actions, definitionCanonical, etc.
  }

  output += 'done\n';
  return output;
} 