// REFACTOR:grounded - shared declaration-owned definition and question traversal.
import type { ReferenceName } from "../ast/types";
import { conceptDependencies } from "../ast/conceptDependencies";
import { hasLocalPublicationContribution, publicationProducerOperands, type PublicationDescriptor, type PublicationProgram } from "./publicationProgram";

/** Gather admitted answer slots by declaration identity. Definitions retain the complete
 * dependency closure; question inputs follow only dependencies the producer can request. */
export function publicationCaseFeatures(program: PublicationProgram, source: string, ref: ReferenceName, purpose: "definitions" | "questions" | "dependencies"): PublicationDescriptor[] {
  const seen = new Set<string>();
  const result: PublicationDescriptor[] = [];
  const visit = (owner: string, reference: ReferenceName): void => {
    const declaration = program.declarations.lookupConcept(owner, reference);
    if (declaration.kind !== "hit" || seen.has(declaration.identity.key)) return;
    seen.add(declaration.identity.key);
    const descriptor = program.get(declaration.identity.key);
    if (descriptor !== undefined) {
      if (purpose === "dependencies" || hasLocalPublicationContribution(descriptor)) result.push(descriptor);
      // Available-value membership reads the supplied set without requesting absent answers.
      // Keep its own coded answer above and its full definition/CQL closure in the other walk.
      if (purpose === "questions" && descriptor.producer?.kind === "anyMembership" && descriptor.producer.availableValuesOnly) return;
      // REFACTOR:grounded (#320, plan589): both BMI inputs remain answerable dependencies.
      for (const operand of publicationProducerOperands(descriptor.producer)) visit(operand.sourceIdentity, operand.conceptName);
      return;
    }
    for (const dependency of conceptDependencies(declaration.node)) visit(declaration.identity.sourceIdentity, dependency);
  };
  visit(source, ref);
  return result;
}

