import type { Concept, ReferenceName } from "../ast/types";
import type { EmittedResource } from "../cel/emitter/types";
import type { LocalConceptMember } from "../cel/localMembership";
import { terminologyMembers } from "../cel/sourceMembership";
import type { PublicationContext } from "../emit/publicationContext";
import { matchesCelPublicationPatient } from "../emit/publicationSource";
import { matchNarrative } from "../template-match/matcher";
import type { CanonicalArg, CanonicalPatternCall } from "../template-match/canonicalTypes";

type Records = readonly EmittedResource[];
type Coding = { system: string; code: string };

function hasCoding(value: unknown, codes: readonly Coding[]): boolean {
  const coding = (value as { coding?: unknown } | undefined)?.coding;
  return Array.isArray(coding) && coding.some(c => c && codes.some(m => c.system === m.system && c.code === m.code));
}

/** Evaluate authored record filters over the very same patient resources sent to native CQL.
 * This is collection evaluation, not answer selection: existence is a separate consuming operation.
 * Unsupported forms fail when consumed; speculative off-path inspection cannot change case state.
 */
export function createRecordCollectionEvaluator(
  declarations: PublicationContext,
  resources: Records,
  subjectReference: string,
  localMember: (library: string, name: string) => LocalConceptMember | undefined,
  ownerError: (source: string, node: Readonly<Concept>) => string | undefined = () => undefined,
): (source: string, node: Readonly<Concept>) => Records {
  const memo = new Map<string, Records>();
  const visiting = new Set<string>();
  const fail = (message: string): never => { throw new Error(`record-collection-unsupported: ${message}`); };

  function evaluate(source: string, node: Readonly<Concept>): Records {
    const scopeError = ownerError(source, node);
    if (scopeError) return fail(scopeError);
    const key = JSON.stringify([source, node.name]);
    const cached = memo.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return fail(`Cycle at "${node.name}".`);
    if (node.shape !== "RecordSet" || node.shapeReduction !== undefined ||
        (node.conceptType !== "Condition" && node.conceptType !== "Observation"))
      return fail(`"${node.name}" requires an unselected Condition or Observation RecordSet.`);
    if (node.valueElement !== undefined) return fail(`"${node.name}" projects a value rather than records.`);
    const owner = declarations.getLibrary(source);
    if (!owner) return fail(`Missing owner of "${node.name}".`);
    const def = node.definition;
    // The emitter does not lower a local code plus a top-level narrative filter. Do not
    // accidentally admit that combination here by inventing a union with its operand.
    if (node.code !== undefined && def !== undefined)
      return fail(`"${node.name}" combines a local code and a definition; this RecordSet form is not supported by preview.`);
    if (def && def.type !== "CodedFromDefinition" && def.type !== "DefinitionIsDefinition")
      return fail(`"${node.name}" uses an unsupported RecordSet definition (${def.type}).`);
    // The current CQL lowering treats a boolean-annotated narrative as a scalar
    // determination even with RecordSet shape. Do not advertise collection parity
    // for that unimplemented form; raw typed retrieves/unions remain supported.
    if (def?.type === "DefinitionIsDefinition" && node.valueTypes.includes("boolean"))
      return fail(`"${node.name}" has a Boolean RecordSet filter that the emitter does not lower as records.`);
    if (node.representations.length && def !== undefined)
      return fail(`"${node.name}" combines source representations and a definition; preview does not implement that combination.`);
    if (node.representations.length > 1)
      return fail(`"${node.name}" has multiple source representations; this RecordSet union is not supported.`);

    visiting.add(key);
    try {
      const codes: Coding[] = [];
      const addTerminology = (ref: ReferenceName): void => {
        const term = declarations.lookupTerminology(source, ref, node.location);
        if (term.kind !== "hit") return fail(`Cannot resolve terminology of "${node.name}": ${term.kind}.`);
        const base = owner.artifact.canonicalBase;
        if (!base) return fail(`Missing canonical base for "${node.name}".`);
        codes.push(...terminologyMembers(term.node, base));
      };
      if (node.code !== undefined) {
        const member = localMember(owner.libraryName, node.name);
        if (!member || member.fhirType !== node.conceptType) return fail(`Cannot resolve local membership of "${node.name}".`);
        codes.push(member);
      }
      if (def?.type === "CodedFromDefinition") addTerminology(def.terminologyName);
      for (const rep of node.representations) {
        const sameValues = rep.valueTypes.length === 0 || (rep.valueTypes.length === node.valueTypes.length && rep.valueTypes.every((v, i) => v === node.valueTypes[i]));
        if (rep.conceptType !== node.conceptType || !rep.terminologyName || rep.valueProjection || rep.valueElement || !sameValues)
          return fail(`"${node.name}" requires unprojected source records of its declared type.`);
        addTerminology(rep.terminologyName);
      }
      const own = resources.filter(r => r.resourceType === node.conceptType &&
        matchesCelPublicationPatient(r.body, subjectReference) && hasCoding(r.body.code, codes));
      const operand = (arg: CanonicalArg): Records => {
        if (arg.type === "NestedPatternArg") return call(arg.pattern);
        if (arg.type === "EnumArg" && arg.value.toLowerCase() === "this") return own;
        if (arg.type !== "ConceptRefArg") return fail(`Unsupported record operand in "${node.name}".`);
        const ref: ReferenceName = arg.library ? { type: "QualifiedReference", libraryName: arg.library, name: arg.value, location: arg.location } : arg.value;
        const hit = declarations.lookupConcept(source, ref, arg.location);
        if (hit.kind !== "hit") return fail(`Cannot resolve "${arg.value}": ${hit.kind}.`);
        if (hit.node.conceptType !== node.conceptType) return fail(`Record type mismatch in "${node.name}".`);
        return evaluate(hit.identity.sourceIdentity, hit.node);
      };
      const call = (pattern: CanonicalPatternCall): Records => {
        if (!pattern.known || pattern.args.length !== 1 || !["Active", "IsVerified"].includes(pattern.pattern))
          return fail(`"${node.name}" uses unsupported record operation ${pattern.pattern}/${pattern.args.length}.`);
        if (pattern.pattern === "Active" && node.conceptType !== "Condition")
          return fail(`Active requires Condition records in "${node.name}".`);
        const input = operand(pattern.args[0]);
        if (pattern.pattern === "Active") return input.filter(r => hasCoding(r.body.clinicalStatus,
          [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }]));
        if (node.conceptType === "Condition") return input.filter(r => hasCoding(r.body.verificationStatus,
          [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }]));
        return input.filter(r => ["final", "amended", "corrected"].includes(r.body.status as string));
      };
      const result = def?.type === "DefinitionIsDefinition" ? call(matchNarrative(def.body)) : own;
      memo.set(key, result);
      return result;
    } finally { visiting.delete(key); }
  }
  return evaluate;
}
