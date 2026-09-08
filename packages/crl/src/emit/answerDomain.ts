import type { Concept, CRL, Location, Terminology, ValueFrom } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { publicationCodeKey, readFinitePublicationTerminology } from "./publicationDomain";
import type { PublicationCode } from "./publicationProgram";
import { buildLibraryScopes, lookupKnownLibrary } from "../imports/scopes";
import type { Registry, RegistryEntry } from "../imports/types";

// REFACTOR:grounded (#320, 615): declarations own answer codes; concepts declare only exclusions.
export interface AnswerMember extends PublicationCode {
  readonly display: string;
  readonly location?: Location;
}
export interface AnswerDomainError {
  readonly kind: "error";
  readonly code: string;
  readonly message: string;
  readonly location?: Location;
}
export type AnswerDomainResult = AnswerDomainError | {
  readonly kind: "resolved";
  readonly members: readonly AnswerMember[];
  readonly qualifying: readonly AnswerMember[];
};

/** Finite means every authored segment is enumerated, not just that some codes were found. */
export function readFiniteAnswerMembers(terminology: Readonly<Terminology>):
  AnswerDomainError | { readonly kind: "resolved"; readonly members: readonly AnswerMember[] } {
  const finite = readFinitePublicationTerminology(terminology);
  if (finite.kind === "error") return finite;
  let system: string | undefined;
  const members: AnswerMember[] = [];
  const seen = new Set<string>();
  for (const line of terminology.body) {
    if (line.type === "TerminologySystem") system = line.system;
    if (line.type !== "TerminologyCode") continue;
    const key = publicationCodeKey({ system: system!, code: line.code });
    if (seen.has(key)) return { kind: "error", code: "answer-options-duplicate-code",
      message: `Answer terminology "${terminology.name}" repeats ${system}|${line.code}.`, location: line.location };
    seen.add(key);
    if (!line.display?.trim()) return { kind: "error", code: "answer-options-missing-display",
      message: `Answer code ${system}|${line.code} requires an authored display.`, location: line.location };
    members.push(Object.freeze({ system: system!, code: line.code, display: line.display, location: line.location }));
  }
  return { kind: "resolved", members: Object.freeze(members) };
}

export function classifyAnswerMembers(valueFrom: ValueFrom, members: readonly AnswerMember[]): AnswerDomainResult {
  const excluded = new Set<string>();
  for (const exception of valueFrom.notQualifying ?? []) {
    const matches = members.filter((member) => member.code === exception.code);
    if (matches.length !== 1) return { kind: "error", code: "answer-options-invalid-exception",
      message: `Nonqualifying code ${JSON.stringify(exception.code)} must identify exactly one member of the answer ValueSet; found ${matches.length}.`, location: exception.location };
    const key = publicationCodeKey(matches[0]);
    if (excluded.has(key)) return { kind: "error", code: "answer-options-duplicate-exception",
      message: `Nonqualifying code ${JSON.stringify(exception.code)} is declared more than once.`, location: exception.location };
    excluded.add(key);
  }
  return { kind: "resolved", members,
    qualifying: Object.freeze(members.filter((member) => !excluded.has(publicationCodeKey(member)))) };
}

export function resolveAnswerDomain(valueFrom: ValueFrom, terminology: Readonly<Terminology>): AnswerDomainResult {
  const result = readFiniteAnswerMembers(terminology);
  return result.kind === "error" ? result : classifyAnswerMembers(valueFrom, result.members);
}

/** Local AST adapter only. Cross-library callers must use their existing owner/visibility resolver. */
export function localAnswerTerminology(ast: CRL, concept: Readonly<Concept>): Terminology | undefined {
  if (!concept.valueFrom) return undefined;
  const ref = concept.valueFrom.terminologyName;
  const library = getRefLibrary(ref);
  if (library !== null && library !== ast.library.name) return undefined;
  const matches = ast.statements.filter((s): s is Terminology => s.type === "Terminology" && s.name === getRefName(ref));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Resolve from the concept's actual owner, preserving explicit package includes and local shadows. */
export function answerTerminologyResolver(owner: RegistryEntry, registry?: Registry) {
  const scope = registry ? buildLibraryScopes([owner], [], registry).get(owner.filePath) : undefined;
  const entries = registry ? [owner, ...registry.byNameLocal.values(), ...registry.byNamePackage.values()] : [owner];
  return (ref: import("../ast/types").ReferenceName): Terminology | undefined => {
    const qualifier = getRefLibrary(ref);
    const target = qualifier === null || qualifier === owner.name ? owner : (() => {
      if (!scope) return undefined;
      const known = lookupKnownLibrary(scope, qualifier);
      if (!known || (known.origin === "package" && !scope.explicitIncludes.has(qualifier))) return undefined;
      return entries.find((entry) => entry.filePath === known.filePath);
    })();
    const matches = target?.ast.statements.filter((node): node is Terminology => node.type === "Terminology" && node.name === getRefName(ref));
    return matches?.length === 1 ? matches[0] : undefined;
  };
}
