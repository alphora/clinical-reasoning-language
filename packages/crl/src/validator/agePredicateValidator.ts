import { CRL } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { matchNarrative } from "../template-match";
import { isAgeAtStartOfPrefix, sanctionedAgeAnchoredOp } from "../template-match/agePredicate";
import {
  ageRetirementMessage,
  isRetiredAgeTodayDefinition,
  resolveAgeConcept,
} from "../template-match/recencyProjectionOverride";

import type { AgePredicateReason } from "./validator";
import { ValidationError } from "./validator";

// #215 / #257 — author-time enforcement of the patient-age surface. THREE jobs:
//
//  (1) RETIREMENT (#257). An authored `definition is age today <cmp> <Q>` is the RETIRED
//      carve-out — patient age is now modeled as a Patient `source representation` over
//      `Patient.birthDate` with a `value projection`. Any `definition is age today …` (sanctioned
//      or not) is an error pointing at the posrep fix (`ageRetirementMessage` shows both the
//      local-override and standalone variants). This is the author-time half of the retirement;
//      the emit pipeline (`emitCQLFromAST`) is the emit-boundary half. The two SHARE
//      `isRetiredAgeTodayDefinition` + `ageRetirementMessage` so they cannot drift.
//
//  (2) ANCHORED (#215, unchanged). `definition is age at start of "<anchor>" <cmp> <Q>` computes
//      over another concept (the anchor), so it STAYS a concept-level `definition is` (A.5 forbids
//      it as a datum-local projection). An unsanctioned comparator/unit there is still rejected.
//
//  (3) POSREP PROJECTION (#257). A posrep `value projection is age today …` must be a sanctioned
//      age predicate ON the built Patient age carrier. An unsanctioned attempt, or a sanctioned
//      projection on the wrong carrier, is rejected — the SAME `resolveRecencyProjection` +
//      messages the emit lowering uses, so validate and emit cannot drift on the sanctioned set.
//
// The "is it sanctioned?" tests are the SHARED classifiers (`template-match`), so `validate_crl`
// and `emit_crl` cannot disagree on the accepted age forms (the #215 divergence this closes).

type Attribution = { libraryName?: string; filePath?: string };

export class AgePredicateValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    if (sources) {
      // Multi-file mode: walk each statement with its owning scope so the diagnostic
      // carries libraryName/filePath (else an error in a sibling library is squiggled on
      // the wrong file — see validationErrorToLs's `?? docFilePath` fallback).
      for (const { stmt, scope } of sources) {
        this.check(stmt, { libraryName: scope.currentLibrary, filePath: scope.filePath }, errors);
      }
    } else {
      for (const stmt of ast.statements) this.check(stmt, {}, errors);
    }
    return errors;
  }

  private check(
    stmt: CRL["statements"][number],
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    if (stmt.type !== "Concept") return;

    // (1) RETIREMENT — an authored `definition is age today …` migrates to a posrep.
    if (isRetiredAgeTodayDefinition(stmt)) {
      const body =
        stmt.definition?.type === "DefinitionIsDefinition" ? stmt.definition.body : undefined;
      errors.push({
        kind: "age-predicate-unsupported",
        reason: "definition-retired",
        conceptName: stmt.name,
        message: ageRetirementMessage(stmt.name),
        location: body?.location ?? stmt.location,
        severity: "error",
        ...attribution,
      });
    }

    // (2) ANCHORED `age at start of …` — still a sanctioned concept-level `definition is`.
    //     DELIBERATELY stays YEARS-ONLY (#257 T2 Q2): only the age-TODAY projection widened to
    //     months (need-driven, rx501-098); there is no anchored-months policy and it would need
    //     `AgeInMonthsAt(anchor)` overloads. Do NOT "harmonize" this message or the four
    //     `ageAtStartOf*` matchers to months to match the age-today surface.
    if (stmt.definition?.type === "DefinitionIsDefinition") {
      const body = stmt.definition.body;
      if (isAgeAtStartOfPrefix(body) && sanctionedAgeAnchoredOp(matchNarrative(body)) === null) {
        errors.push({
          kind: "age-predicate-unsupported",
          reason: "unsupported-comparator",
          conceptName: stmt.name,
          message:
            `Concept "${stmt.name}": unsupported \`age at start of\` predicate. Supported: ` +
            `\`age at start of "<anchor>" <at least | at most | under | younger than> <n> years\` ` +
            `— a YEARS quantity only. Use \`under\` (not \`less than\`); do NOT use month/day ` +
            `units (age is computed in whole years).`,
          location: body.location,
          severity: "error",
          ...attribution,
        });
      }
    }

    // (3) WHOLE-CONCEPT age SHAPE — the SHARED `resolveAgeConcept` classifier the emit lowering also
    //     consults, so validate and emit cannot drift on the concept-shape lattice (not just the
    //     sanctioned comparator set). Every age-shaped mis-authoring (unsanctioned / wrong-carrier /
    //     3-way / 3-rep / non-Observation local / definition+posrep / non-boolean value type /
    //     multiple age posreps) is reported here EXCEPT the `anchored` case, whose author-time owner
    //     is A.5 (`value-projection-references-concept`) — reporting it here too would double-report.
    const shape = resolveAgeConcept(stmt);
    if (shape.kind === "error" && !shape.anchored) {
      const firstRepLoc = (stmt.representations ?? [])[0];
      errors.push({
        kind: "age-predicate-unsupported",
        reason: reasonForErrorKind(shape.errorKind),
        conceptName: stmt.name,
        message: shape.message,
        location: firstRepLoc?.valueProjection?.body.location ?? firstRepLoc?.location ?? stmt.location,
        severity: "error",
        ...attribution,
      });
    }
  }
}

/** Map a shared emit-error kind to the validator's `reason` sub-discriminator. */
function reasonForErrorKind(errorKind: string): AgePredicateReason {
  if (errorKind === "emit-age-projection-unsupported") return "projection-unsupported";
  if (errorKind === "emit-age-projection-wrong-carrier") return "projection-wrong-carrier";
  return "projection-shape"; // concept-shape lattice (3-way / 3-rep / non-Observation / value type)
}
