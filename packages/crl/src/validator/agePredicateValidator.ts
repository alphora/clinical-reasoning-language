import { CRL } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { matchNarrative } from "../template-match";
import {
  isAgeAtStartOfPrefix,
  isAgeTodayPrefix,
  sanctionedAgeAnchoredOp,
  sanctionedAgeTodayOp,
} from "../template-match/agePredicate";

import { ValidationError } from "./validator";

// #215 — reject an ATTEMPTED age predicate that is NOT a sanctioned one (an unsupported
// comparator such as `less than`, or a non-year unit) at AUTHOR time. Without this,
// `validate_crl` returned success for `age today less than 21 years` / `age today under
// 21 months` while `emit_crl` produced a loud unmatched sentinel — a validate/emit
// divergence the KE flagged (#215 Ask 2).
//
// Screens BOTH predicate prefixes — `age today <…>` and `age at start of <…>`. Each is
// unambiguously a predicate ATTEMPT: neither shares a prefix with the only bare age
// calculation (`age at <ConceptRef>`), so screening cannot false-positive a legal form.
// The "is it sanctioned?" test is the SHARED classifier (template-match/agePredicate) the
// emit lowering gate also uses, so validate and emit cannot drift on the sanctioned op set.
//
// Out of scope (deliberate): `value type is boolean` enforcement for both-rep age
// concepts (tracked separately — a nonsensical declaration, not a wrong determination);
// and `sem-not` over an age concept (operator decision — existing content stays valid;
// `sem-not` lives in a `DefinedAsDefinition`, which this validator never inspects).

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

  private check(stmt: CRL["statements"][number], attribution: Attribution, errors: ValidationError[]): void {
    if (stmt.type !== "Concept") return;
    if (stmt.definition?.type !== "DefinitionIsDefinition") return;
    const body = stmt.definition.body;

    const family = isAgeTodayPrefix(body)
      ? "age today"
      : isAgeAtStartOfPrefix(body)
        ? "age at start of"
        : null;
    if (family === null) return;

    // It IS an age-predicate attempt — require the whole narrative to match a sanctioned
    // age op (over the no-arg `AgeAt()` for `age today`, or `AgeAt(StartOf(<ref>))` for the
    // anchored form). Non-year units fail here too (the matcher's year-guard makes them
    // unknown → not sanctioned).
    const matched = matchNarrative(body);
    const sanctioned =
      family === "age today" ? sanctionedAgeTodayOp(matched) : sanctionedAgeAnchoredOp(matched);
    if (sanctioned !== null) return;

    errors.push({
      kind: "age-predicate-unsupported",
      conceptName: stmt.name,
      message:
        `Concept "${stmt.name}": unsupported \`${family}\` predicate. Supported: ` +
        `\`${family} <at least | at most | under | younger than> <n> years\` — a YEARS ` +
        `quantity only. Use \`under\` (not \`less than\`); do NOT use month/day units ` +
        `(age is computed in whole years).`,
      location: body.location,
      severity: "error",
      ...attribution,
    });
  }
}
