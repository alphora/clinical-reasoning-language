// Canonical entry point for FSH-to-CPGL transformation.
// Expects a path to a SUSHI-compatible FSH project directory (containing sushi-config.yaml and input/fsh/).
import { FSHTank } from 'fsh-sushi/dist/import/FSHTank';
import { importConfiguration } from 'fsh-sushi/dist/import/importConfiguration';
import * as path from 'path';
import * as fs from 'fs';
import { importText } from 'fsh-sushi/dist/import/importText';
import { RawFSH } from 'fsh-sushi/dist/import/RawFSH';

/**
 * Transform FSH (parsed with SUSHI) to CPG-L.
 * @param fshProjectDir The path to a SUSHI-compatible FSH project directory
 * @returns The CPG-L output as a string
 */
export function transformFSHToCPGL(fshProjectDir: string): string {
  const configPath = path.join(fshProjectDir, 'sushi-config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`sushi-config.yaml not found in ${fshProjectDir}`);
  }
  const configYaml = fs.readFileSync(configPath, 'utf8');
  const config = importConfiguration(configYaml, configPath);

  // This will recursively load all FSH files under input/fsh/
  const fshDir = path.join(fshProjectDir, 'input', 'fsh');
  function getAllFSHFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFSHFiles(filePath));
      } else if (filePath.endsWith('.fsh')) {
        results.push(filePath);
      }
    }
    return results;
  }
  const fshFiles = getAllFSHFiles(fshDir);
  console.log('[DEBUGGING] FSH files found:', fshFiles);
  const rawFSHes = fshFiles.map(f => new RawFSH(fs.readFileSync(f, 'utf8'), f));
  console.log('[DEBUGGING] Number of RawFSH loaded:', rawFSHes.length);
  const fshDocs = importText(rawFSHes);
  console.log('[DEBUGGING] Number of FSHDocuments created:', fshDocs.length);

  const tank = new FSHTank(fshDocs, config);
  const instances = tank.getAllInstances();
  console.log('[DEBUGGING] Number of FSH instances loaded:', instances.length);

  // Collect all activities and do references for file-wide deduplication and postprocessing
  const activityDeduplicator = new (require('./utils/activityDeduplication').ActivityDeduplicator)();
  const decisions: string[] = [];
  const allActivities: { id: string, name: string, value: string | undefined, original: string, terminology?: { identifier: string, code: string, system: string } }[] = [];
  const allDoReferences: { id: string, placeholder: string }[] = [];
  const allConceptIdentifiers = new Set<string>();

  const { mapPlanDefinitionToDecision } = require('./mapping/planDefinition');
  const { mapConcept } = require('./mapping/concept');
  const { mapTerminology } = require('./mapping/terminology');
  const { toIdentifier } = require('./utils/fshPathFunctions');

  let planDefCount = 0;
  for (const inst of instances) {
    if (inst.instanceOf && inst.instanceOf.toLowerCase().includes('plandefinition')) {
      planDefCount++;
    }
    const planDefResult = mapPlanDefinitionToDecision(inst, instances);
    decisions.push(planDefResult.decision);
    for (const act of planDefResult.activities) {
      activityDeduplicator.add({ name: act.name, value: act.value, original: act.original });
      allActivities.push(act);
    }
    for (const ref of planDefResult.doReferences) {
      allDoReferences.push(ref);
    }
    // Collect concept identifiers from PlanDefinition action trees
    if (inst.instanceOf && (inst.instanceOf.includes('strategydefinition') || inst.instanceOf.includes('recommendationdefinition'))) {
      for (const rule of inst.rules || []) {
        if (
          rule.path &&
          rule.path.endsWith('.condition[=].expression.expression') &&
          'value' in rule &&
          typeof (rule as any).value === 'string' &&
          (rule as any).value
        ) {
          allConceptIdentifiers.add((rule as any).value);
        }
      }
    }
  }
  console.log('[DEBUGGING] PlanDefinitions found:', planDefCount);
  console.log('[DEBUGGING] Decisions collected:', decisions.length);
  console.log('[DEBUGGING] Activities collected:', allActivities.length);
  console.log('[DEBUGGING] Do references collected:', allDoReferences.length);

  // Collect all terminology blocks for activities
  const activityTerminologies: { identifier: string, code: string, system: string }[] = [];
  for (const act of allActivities) {
    if ((act as any).terminology && (act as any).terminology.code) {
      activityTerminologies.push((act as any).terminology);
    }
  }

  // Emit all decisions
  let finalOutput = '';
  for (const dec of decisions) {
    finalOutput += dec;
  }

  // --- POSTPROCESSING: Deduplicate, assign unique names, and replace placeholders ---
  const dedupedMap = new Map<string, { uniqueName: string, activity: typeof allActivities[0] }>();
  const nameValueCount = new Map<string, number>();
  const idToFinalName: Record<string, string> = {};

  for (const act of allActivities) {
    const key = `${act.name}::${act.value ?? ''}`;
    let count = nameValueCount.get(act.name) || 0;
    if (!dedupedMap.has(key)) {
      count += 1;
      nameValueCount.set(act.name, count);
      const uniqueName = act.name + (count > 1 ? `_${count}` : '');
      dedupedMap.set(key, { uniqueName, activity: act });
      idToFinalName[act.id] = uniqueName;
    } else {
      const { uniqueName } = dedupedMap.get(key)!;
      idToFinalName[act.id] = uniqueName;
    }
  }

  finalOutput = finalOutput.replace(/<<ACTIVITY_REF:(activity_\d+)>>/g, (_, id) => toIdentifier(idToFinalName[id]));

  for (const { uniqueName, activity } of dedupedMap.values()) {
    const activityRegex = /activity\s+"([^"]+)"/;
    const match = activity.original.match(activityRegex);
    let replaced = activity.original;
    if (match) {
      replaced = activity.original.replace(activityRegex, `activity ${toIdentifier(uniqueName)}`);
    } else {
      console.warn(`Could not match activity identifier in: ${activity.original}`);
    }
    finalOutput += replaced;
  }

  // Emit concept and terminology blocks for all unique concept identifiers
  if (allConceptIdentifiers.size > 0) {
    finalOutput += '\n' + mapConcept(Array.from(allConceptIdentifiers));
    finalOutput += '\n' + mapTerminology(Array.from(allConceptIdentifiers));
  }

  // Emit unique activity terminology blocks
  if (activityTerminologies.length > 0) {
    const termMap = new Map<string, { body: string, count: number }>();
    for (const term of activityTerminologies) {
      const baseId = term.identifier;
      const body = `system \`${term.system}\` code \`${term.code}\``;
      let id = baseId;
      let count = 1;
      while (termMap.has(id) && termMap.get(id)!.body !== body) {
        count++;
        id = `${baseId}_${count}`;
      }
      if (!termMap.has(id)) {
        termMap.set(id, { body, count });
        finalOutput += `\nterminology "${id}" ${body}.`;
      }
    }
  }

  console.log('[DEBUGGING] Final CPG-L output before return:', finalOutput.length > 500 ? finalOutput.slice(0, 500) + '... [truncated]' : finalOutput);
  return finalOutput;
} 