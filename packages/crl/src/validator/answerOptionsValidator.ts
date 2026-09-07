import type { CRL, Concept, ReferenceName } from "../ast/types";
import { findPatternCalls } from "../template-match/referenceRoles";
import { publicationAdmissionReason, readPublicationMembership, type PublicationCode, type PublicationMembershipSyntax } from "../emit/publicationProgram";
import { lookupKnownLibrary, type SourceContext, type LibraryScope } from "../imports/scopes";
import { createPublicationContext } from "../emit/publicationContext";
import { normalizePublicationCodes, publicationCodeKey, readFinitePublicationTerminology } from "../emit/publicationDomain";

import type { AnswerOptionsFinding, ValidationError } from "./validator";

// ⭐⭐ #189 gap 2 — `value from` NAMES A CODED QUESTION'S ANSWER OPTIONS, and this file polices the two ways
// that can be meaningless.
//
// MEASURED end-to-end before any of this was written: with no `value[x].binding` the generated questionnaire
// item carries NO options at all; with one it carries an inline `answerOption` coding per member, expanded
// from the emitted ValueSet. So the binding IS the dropdown, and a coded question without one is a question
// a user cannot answer.
//
// ⚠⚠ `value from` IS "OFFERED", NOT "ADMISSIBLE", and every rule here must stay inside that reading. An
// `ElementDefinition.binding` constrains FHIR conformance and NEVER evaluation — an out-of-set value still
// reaches CQL — so nothing in this file may be phrased as though CRL enforced the range. A genuine
// admissibility constraint would have to gate every value-producing leg (local assertions, CEL authoring,
// `$extract`, source candidates, producers, the CRE) and is filed as its own slice.
//
// ⚠ WHAT THIS FILE DELIBERATELY CANNOT CHECK: whether the concept's resource actually HAS a distinct
// `value[x]` answer slot. A `type is Condition` concept carries its identity ON its coding element and has no
// separate value carrier, so a binding would have nothing to land on. Resource-carrier eligibility remains
// an emitter responsibility; the shared declaration and finite-domain helpers used here do not infer a
// carrier. The emitter diagnoses that cell at the point it would otherwise silently emit nothing.

/**
 * ⭐ RULED (operator, 2026-09-01), on the absence posture: *"b)"* — a coded question with no answer set WARNS
 * now and ERRORS at the flip, following the `no-bare-scalar-code` precedent.
 *
 * RETIRE:189-validation-flip — `answer-options-missing` becomes an ERROR at the flip. Delete this note and
 * flip the severity when the 9 in-tree concepts have migrated; grep this marker to find what is owed.
 *
 * ⚠ WHY A WARNING AND NOT AN ERROR TODAY: the migration is real but small — MEASURED at 9 concepts of 634
 * carrying `value type is CodeableConcept` + `code is`, 5 of them with no representation at all. Erroring
 * before those 9 are migrated would reject content that is correct under the language as shipped.
 */
export class AnswerOptionsValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
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
      if (operand.valueFrom?.kind === "inline") {
        // This proof is independent of generated canonical metadata. Mixed inline/named domains
        // require the owning generated answer system, which this declaration-only validator lacks;
        // preparation retains that check rather than inventing a canonical here.
        return membership.predicate.kind === "qualifying" && operand.valueDomain?.terms.length === 1 &&
          operand.valueDomain.terms[0].type === "AnswerOptionsDomainTerm" &&
          operand.valueFrom.options.length > 0 && operand.valueFrom.options.every((option) => option.qualifying === true);
      }
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

    // ⭐⭐ WHICH CONCEPTS ARE THE SUBJECT OF AN `in qualifying` PREDICATE — computed ONCE, because the
    // marker requirement is a property of USE, not of the declaration (operator ruling, 2026-09-02).
    //
    // ⚠ THE WALK IS RECURSIVE, VIA `findPatternCalls`, AND THAT IS NOT OPTIONAL. `matchNarrative` FOLDS a
    // pipeline into a `NestedPatternArg`, so a reader that only inspects top-level args misses a membership
    // buried in a stage. That exact bug appeared in THREE separate readers earlier in #189, which is why the
    // shared authority exists. Do not hand-roll this walk.
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

    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.checkConcept(
            stmt,
            { libraryName: scope.currentLibrary, filePath: scope.filePath },
            out,
            legacyPredicatedOn.has(stmt), publicationPredicatedOn.has(stmt),
          );
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt as Concept, {}, out,
          legacyPredicatedOn.has(stmt), publicationPredicatedOn.has(stmt));
      }
    }
    return out;
  }

  private checkConcept(
    concept: Concept,
    attribution: { libraryName?: string; filePath?: string },
    out: ValidationError[],
    /** Obligations belong to resolved consumers, not the operand's shape marker. */
    legacyPredicatedOn: boolean,
    publicationPredicatedOn: boolean,
  ): void {
    // ⚠ EXACTLY ONE value type, and it must be the coded one. `includes(...)` was too loose: a multi-typed
    // concept has no single answer carrier (`answerCarrier` requires one), so the absence warning would tell
    // an author to add a line the emitter then REFUSES for want of a slot — warn-to-add, error-on-add, a loop
    // an AI author walks (Claude arm, code review r13).
    const isCoded = concept.valueTypes.length === 1 && concept.valueTypes[0] === "CodeableConcept";
    // Charter §3: *"A question IS an answerable. One property: a local `code is`."* Without one there is no
    // answer slot to offer options for — the concept is read-only and gets no case-feature SD at all.
    const isAnswerable = concept.code !== undefined && concept.code !== "";

    const attrib = {
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    };
    if (publicationPredicatedOn && concept.valueFrom?.kind !== "inline") {
      out.push({ kind: "answer-options-missing-marker", conceptName: concept.name,
        message: `Concept "${concept.name}" is consumed by a selected-value \`in qualifying\` producer and requires inline answer options with explicit qualifying/not qualifying markers.`,
        location: concept.valueFrom?.location ?? concept.location, severity: "error", ...attrib,
      } as AnswerOptionsFinding);
    }

    if (concept.valueFrom !== undefined) {
      if (!isAnswerable) {
        out.push({
          kind: "answer-options-unanswerable",
          conceptName: concept.name,
          message:
            `Concept "${concept.name}" declares \`value from\` but has no local \`code is\`, so it is not ` +
            `answerable and no question is ever asked of it. Answer options describe what a USER may pick; ` +
            `a read-only concept has no answer slot to offer them for. Add \`code is\`, or drop the line.`,
          location: concept.valueFrom.location,
          severity: "error",
          ...attrib,
        } as AnswerOptionsFinding);
        return;
      }
      if (!isCoded) {
        const declared = concept.valueTypes.length > 0 ? concept.valueTypes.join(", ") : "none";
        out.push({
          kind: "answer-options-not-coded",
          conceptName: concept.name,
          message:
            `Concept "${concept.name}" declares \`value from\` but its value type is \`${declared}\`, not ` +
            `\`CodeableConcept\`. Answer options are a set of CODES; there is nothing for them to bind to on ` +
            `a non-coded value. Declare \`value type is CodeableConcept\`, or drop the line.`,
          location: concept.valueFrom.location,
          severity: "error",
          ...attrib,
        } as AnswerOptionsFinding);
      }
      // ⭐⭐ #189 — INLINE OPTIONS. Everything below applies ONLY to the inline form; a terminology
      // reference has its own declaration with its own rules.
      if (concept.valueFrom.kind === "inline") {
        const options = concept.valueFrom.options;

        // A display is what a CLINICIAN READS in the generated questionnaire. The grammar cannot require it
        // (an option line is shared with the marker-less form), and it must NEVER be derived by title-casing
        // the code — that manufactures clinician-facing text the author never wrote.
        for (const o of options) {
          if (o.display.trim() !== "") continue;
          out.push({
            kind: "answer-options-missing-display",
            conceptName: concept.name,
            message:
              `Option \`${o.code}\` on concept "${concept.name}" has an empty \`display\`. The display is the ` +
              `text a clinician reads when picking this answer; it cannot be derived from the code without ` +
              `inventing wording the author never wrote. Give it one.`,
            location: o.location,
            severity: "error",
            ...attrib,
          } as AnswerOptionsFinding);
        }

        // Two options with one code are two rows of the SAME answer: whichever the emitter wrote last would
        // silently define the other's display and marker.
        const seen = new Map<string, number>();
        for (const o of options) seen.set(o.code, (seen.get(o.code) ?? 0) + 1);
        for (const [code, n] of seen) {
          if (n < 2) continue;
          out.push({
            kind: "answer-options-duplicate-code",
            conceptName: concept.name,
            message:
              `Concept "${concept.name}" declares option \`${code}\` ${n} times. One code is one answer; ` +
              `duplicates would collapse into a single option whose display and marker depend on line order.`,
            location: concept.valueFrom.location,
            severity: "error",
            ...attrib,
          } as AnswerOptionsFinding);
        }

        // ⭐⭐ THE MARKER IS REQUIRED IFF THE CONCEPT IS PREDICATED ON (operator ruling, 2026-09-02).
        // Consumer sets are resolved once in `validate` — legacy obligations remain even if the
        // operand alone was migrated. New syntax receives authoring feedback before emit preparation.
        if (legacyPredicatedOn || publicationPredicatedOn) {
          // A silent default would let a KE add an option, have a patient answer it honestly, and get a
          // determinate `false -> deny` — the UNRECOVERABLE class, since a pause is recoverable but a
          // spurious `false` looks like a decision. Adding an option must not compile until it is classified.
          for (const o of options) {
            if (o.qualifying !== undefined) continue;
            out.push({
              kind: "answer-options-missing-marker",
              conceptName: concept.name,
              message:
                `Option \`${o.code}\` on concept "${concept.name}" has no \`qualifying\` / \`not qualifying\` ` +
                `marker, and this concept IS the subject of an \`in qualifying\` predicate — so every option ` +
                `must say what it does. An unmarked option would silently count as NOT qualifying, turning an ` +
                `honest answer into a determinate denial. Mark it.`,
              location: o.location,
              severity: "error",
              ...attrib,
            } as AnswerOptionsFinding);
          }

          const marked = options.filter((o) => o.qualifying !== undefined);
          if (legacyPredicatedOn && marked.length > 0 && marked.every((o) => o.qualifying === false)) {
            out.push({
              kind: "answer-options-none-qualifying",
              conceptName: concept.name,
              message:
                `No option on concept "${concept.name}" is \`qualifying\`, so \`in qualifying\` can never be ` +
                `true and the qualifying value set is empty. Either the markers are inverted or the predicate ` +
                `is dead.`,
              location: concept.valueFrom.location,
              severity: "error",
              ...attrib,
            } as AnswerOptionsFinding);
          } else if (legacyPredicatedOn && marked.length > 1 && marked.every((o) => o.qualifying === true)) {
            out.push({
              kind: "answer-options-all-qualifying",
              conceptName: concept.name,
              message: `Every option on concept "${concept.name}" is \`qualifying\`, so \`in qualifying\` is false ` +
                `only for a code that was never offered. If a user should be able to answer in a way that ` +
                `does NOT qualify — a "none of the listed" option — the set is missing it.`,
              location: concept.valueFrom.location,
              severity: "warning",
              ...attrib,
            } as AnswerOptionsFinding);
          }
        }
      }

      return;
    }

    // ⭐ THE ABSENCE POSTURE. A coded, answerable question with no `value from` emits a `choice` item with no
    // options — the defect this slice exists to close, and it is invisible unless you run `$populate`.
    if (isCoded && isAnswerable) {
      out.push({
        kind: "answer-options-missing",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" is a coded question (\`value type is CodeableConcept\` + \`code is\`) ` +
          `with no \`value from\`, so the generated questionnaire offers NO options and the user cannot ` +
          `answer it. If this concept's value is a stored code a user picks, add ` +
          `\`value from "<terminology>"\` naming the codes to offer — the SAME terminology as a ` +
          `\`coded from\` when the offered codes and the acceptable record codes genuinely are one set, ` +
          `as they are for a request's service codes. (If its truth is instead the RECORD'S PRESENCE — a ` +
          `\`defined as exists\` boolean — it has no answer slot and wants no options.) \`value from\` ` +
          `offers ANSWERS and never scopes a retrieve; \`coded from\` scopes the RETRIEVE. They are free ` +
          `to diverge and often should: a smoking-status concept's \`coded from\` names WHICH observation, ` +
          `while its answers are never-smoked / former / current.`,
        location: concept.location,
        severity: "warning",
        ...attrib,
      } as AnswerOptionsFinding);
    }
  }
}
