import type { CRL, Concept, ReferenceName } from "../ast/types";
import { resolveAnswerDomain } from "../emit/answerDomain";
import { findPatternCalls } from "../template-match/referenceRoles";
import { publicationAdmissionReason, readPublicationMembership, type PublicationCode, type PublicationMembershipSyntax } from "../emit/publicationProgram";
import { lookupKnownLibrary, type SourceContext, type LibraryScope } from "../imports/scopes";
import { createPublicationContext } from "../emit/publicationContext";
import { normalizePublicationCodes, publicationCodeKey, readFinitePublicationTerminology } from "../emit/publicationDomain";

import type { AnswerOptionsFinding, ValidationError } from "./validator";

// REFACTOR:grounded (#320, 615): named domains own membership and displays.
// Omitted exclusions are legal, warn, and classify every recognized offered answer positively.
export class AnswerOptionsValidator {
  public validate(ast: CRL, sources?: SourceContext[], canonicalBase?: string): ValidationError[] {
    const out: ValidationError[] = [];
    const declarations: { concept: Concept; sourceKey: string }[] = sources
      ? sources.flatMap(({ stmt, scope }) => stmt.type === "Concept"
        ? [{ concept: stmt, sourceKey: scope.filePath }] : [])
      : ast.statements.flatMap((stmt) => stmt.type === "Concept"
        ? [{ concept: stmt, sourceKey: "single-library" }] : []);
    // REFACTOR:grounded (#320, review 563 r2 I3): reuse the declaration resolver without
    // constructing another PublicationProgram or inventing canonical/domain metadata. The validator
    // intentionally includes its supplied non-emitted siblings and only its supplied source statements.
    const owners = new Map<string, { ast: CRL; scope?: LibraryScope }>();
    if (sources === undefined) owners.set("single-library", { ast });
    else for (const source of sources) {
      let owner = owners.get(source.scope.filePath);
      if (owner === undefined) {
        // Real graph scopes come from buildLibraryScopes: currentLibrary is RegistryEntry.name,
        // which the resolver obtained from this same parsed AST's library.name. Keep the raw AST
        // name authoritative here; a custom SourceContext must preserve that coherence, not ask us
        // to silently rename the declaration to repair a mismatched caller-created scope.
        owner = { ast: { ...source.entry.ast, statements: [] }, scope: source.scope };
        owners.set(source.scope.filePath, owner);
      }
      owner.ast.statements.push(source.stmt);
    }
    // Same authored system/code is one local definition even when enumerated by several ValueSets.
    if (canonicalBase) {
      const prefix = `${canonicalBase.replace(/\/$/, "")}/CodeSystem/`;
      const displays = new Map<string, string>();
      for (const owner of owners.values()) for (const statement of owner.ast.statements) {
        if (statement.type !== "Terminology") continue;
        let system: string | undefined;
        for (const line of statement.body) {
          const add = (kind: string, message: string) => out.push({ kind, conceptName: statement.name, severity: "error", message,
            location: line.location, libraryName: owner.ast.library.name, filePath: owner.scope?.filePath } as AnswerOptionsFinding);
          if (line.type === "TerminologySystem") {
            system = line.system;
            if (system.startsWith(prefix) && !/^[A-Za-z0-9.-]{1,64}$/.test(system.slice(prefix.length)))
              add("answer-options-invalid-local-system", `Locally owned CodeSystem ${system} must have a valid FHIR id of at most 64 characters.`);
          }
          if (line.type !== "TerminologyCode" || !system?.startsWith(prefix) || line.display === undefined) continue;
          const key = JSON.stringify([system, line.code]);
          const previous = displays.get(key);
          if (previous !== undefined && previous !== line.display) add("answer-options-conflicting-display", `Locally owned ${system} declares conflicting displays for code ${line.code}.`);
          else displays.set(key, line.display);
        }
      }
    }
    // Map keys provide exactly one input per scope.filePath, so repeated statement-level sources
    // cannot cause createPublicationContext's duplicate-sourceIdentity exception. Duplicate named
    // declarations remain in statements and are handled by lookup's explicit ambiguous result.
    const context = createPublicationContext({
      libraries: [...owners].map(([sourceIdentity, owner]) => ({ sourceIdentity, ast: owner.ast, artifact: {} })),
      resolveLibrary(from, qualifier) {
        const scope = owners.get(from)?.scope;
        if (scope === undefined) return { kind: "not-visible" };
        const target = lookupKnownLibrary(scope, qualifier);
        if (target === undefined) return { kind: "missing" };
        if (target.origin === "package" && !scope.explicitIncludes.has(qualifier)) return { kind: "not-visible", sourceIdentity: target.filePath };
        return { kind: "resolved", sourceIdentity: target.filePath };
      },
    });
    const resolveOperand = (from: typeof declarations[number], ref: ReferenceName): Readonly<Concept> | undefined => {
      const result = context.lookupConcept(from.sourceKey, ref);
      return result.kind === "hit" ? result.node : undefined;
    };
    const finiteTerms = new Map<string, readonly PublicationCode[] | undefined>();
    const finiteTerm = (from: string, ref: ReferenceName): { key: string; codes: readonly PublicationCode[] } | undefined => {
      const hit = context.lookupTerminology(from, ref);
      if (hit.kind !== "hit") return undefined;
      if (!finiteTerms.has(hit.identity.key)) {
        const result = readFinitePublicationTerminology(hit.node);
        finiteTerms.set(hit.identity.key, result.kind === "finite" ? result.codes : undefined);
      }
      const codes = finiteTerms.get(hit.identity.key);
      return codes === undefined ? undefined : { key: hit.identity.key, codes };
    };
    const hasNoNegativeDomain = (from: string, membership: PublicationMembershipSyntax): boolean => {
      const hit = context.lookupConcept(from, membership.operand, membership.location);
      if (hit.kind !== "hit" || publicationAdmissionReason(hit.node) !== undefined || hit.node.valueTypes[0] !== "CodeableConcept") return false;
      const operand = hit.node;
      if (membership.predicate.kind !== "terminology") return false;
      const offered = operand.valueFrom?.kind === "terminology"
        ? finiteTerm(hit.identity.sourceIdentity, operand.valueFrom.terminologyName) : { codes: [] };
      if (offered === undefined) return false;
      const domainCodes: PublicationCode[] = [];
      const terms = new Set<string>();
      for (const term of operand.valueDomain?.terms ?? []) {
        const resolved = term.type === "AnswerOptionsDomainTerm" ? { key: "answer-options", codes: offered.codes }
          : finiteTerm(hit.identity.sourceIdentity, term.terminologyName);
        if (resolved === undefined || resolved.codes.length === 0 || terms.has(resolved.key)) return false;
        terms.add(resolved.key);
        domainCodes.push(...resolved.codes);
      }
      const domain = normalizePublicationCodes(domainCodes);
      const keys = new Set(domain.map(publicationCodeKey));
      if (domain.length === 0 || offered.codes.some((code) => !keys.has(publicationCodeKey(code)))) return false;
      const qualifying = finiteTerm(from, membership.predicate.reference);
      return qualifying !== undefined && qualifying.codes.length === domain.length && qualifying.codes.every((code) => keys.has(publicationCodeKey(code)));
    };

    // Resolve each consumer in its own library; declarations can be shared across includes.
    const legacyPredicatedOn = new Set<Readonly<Concept>>();
    const publicationPredicatedOn = new Set<Readonly<Concept>>();
    for (const declaration of declarations) {
      const c = declaration.concept;
      if (c.definition?.type !== "DefinitionIsDefinition") continue;
      const membership = c.shapeReduction !== undefined && publicationAdmissionReason(c) === undefined
        ? readPublicationMembership(c) : undefined;
      if (membership !== undefined) {
        if (membership.predicate.kind === "qualifying") {
          const operand = resolveOperand(declaration, membership.operand);
          if (operand !== undefined) publicationPredicatedOn.add(operand);
        }
        if (hasNoNegativeDomain(declaration.sourceKey, membership)) {
          const scope = owners.get(declaration.sourceKey)?.scope;
          out.push({ kind: "publication-membership-no-negative-domain", conceptName: c.name,
            message: `Membership producer "${c.name}" has no negative value in its explicit domain.`,
            location: membership.location, severity: "warning",
            ...(scope === undefined ? {} : { libraryName: scope.currentLibrary, filePath: scope.filePath }),
          } as AnswerOptionsFinding);
        }
        continue;
      }
      for (const call of findPatternCalls(c.definition.body, "Membership")) {
        if (!call.args.some((a) => a.type === "SubsetRefArg")) continue;
        const subj = call.args.find((a) => a.type === "ConceptRefArg");
        if (subj?.type !== "ConceptRefArg") continue;
        const ref: ReferenceName = subj.library === undefined ? subj.value : {
          type: "QualifiedReference", libraryName: subj.library, name: subj.value, location: subj.location,
        };
        const operand = resolveOperand(declaration, ref);
        if (operand !== undefined) legacyPredicatedOn.add(operand);
      }
    }

    for (const declaration of declarations) {
      const concept = declaration.concept;
      const scope = owners.get(declaration.sourceKey)?.scope;
      const attribution = scope ? { libraryName: scope.currentLibrary, filePath: scope.filePath } : {};
      const add = (kind: string, message: string, severity: "error" | "warning", location = concept.location) =>
        out.push({ kind, conceptName: concept.name, message, severity, location, ...attribution } as AnswerOptionsFinding);
      const valueFrom = concept.valueFrom;
      const coded = concept.valueTypes.includes("CodeableConcept");
      const answerable = typeof concept.code === "string" && concept.code.trim() !== "";
      if (!valueFrom) {
        if (coded && answerable) add("answer-options-missing",
          `Concept "${concept.name}" is a coded question with no answer ValueSet. Add value from is "<terminology>".`, "warning");
        if (legacyPredicatedOn.has(concept) || publicationPredicatedOn.has(concept)) add("answer-options-resolution",
          `Concept "${concept.name}" is consumed by in qualifying and requires a named answer ValueSet.`, "error");
        continue;
      }
      if (!answerable) add("answer-options-unanswerable", `Concept "${concept.name}" declares answer options but has no local code is.`, "error", valueFrom.location);
      if (!coded) add("answer-options-not-coded", `Concept "${concept.name}" declares answer options but its value type is not CodeableConcept.`, "error", valueFrom.location);
      if (!valueFrom.notQualifying?.length) add("answer-options-all-qualifying",
        `No nonqualifying answers are declared for "${concept.name}". Every answer in the referenced ValueSet will qualify.`, "warning", valueFrom.location);
      const hit = context.lookupTerminology(declaration.sourceKey, valueFrom.terminologyName, valueFrom.location);
      if (hit.kind !== "hit") {
        add("answer-options-resolution", `The answer ValueSet for "${concept.name}" cannot resolve: ${hit.kind}.`, "error", valueFrom.location);
        continue;
      }
      // Plain external bindings remain possible; interpreting/classifying a set requires full membership.
      const opaque = hit.node.body.some((line) => line.type === "TerminologyValueset");
      if (opaque && !valueFrom.notQualifying?.length && !legacyPredicatedOn.has(concept) && !publicationPredicatedOn.has(concept) && !concept.valueDomain) continue;
      const answer = resolveAnswerDomain(valueFrom, hit.node);
      if (answer.kind === "error") add(answer.code, answer.message, "error", answer.location ?? valueFrom.location);
    }
    return out;
  }
}
