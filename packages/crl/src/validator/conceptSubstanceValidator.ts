import type { CRL, Concept } from "../ast/types";
import type { SourceContext } from "../imports/scopes";

import type { ConceptSubstanceFinding, ValidationError } from "./validator";

/**
 * ⭐⭐ A CONCEPT MUST CARRY SOME SUBSTANCE — a local `code is`, a definition, or a representation.
 *
 * Without one of those the concept declares a name, a type and nothing that can ever produce a value: no
 * question is asked of it, no record is retrieved for it, and nothing computes it. It is inert.
 *
 * ⚠⚠ THIS RULE USED TO LIVE IN THE AST BUILDER, WHERE IT THREW. Moved here on operator instruction
 * (2026-09-02), because building is the wrong place for a SEMANTIC rule and the cost was concrete:
 *
 *   · An `AstError` ABORTS THE BUILD, so the file produced ONE diagnostic and every other validator was
 *     skipped. An author with an inert concept AND three real problems elsewhere saw only the inert one,
 *     fixed it, re-ran, and met the next problem — one round trip per defect.
 *   · MEASURED while writing the inline-answer-options tests: a fixture meant to exercise
 *     `answer-options-unanswerable` reported only `AstError` and NONE of the answer-options findings,
 *     which is how the misplacement was noticed at all.
 *   · A builder error carries no severity and no finding kind, so no consumer could special-case it and
 *     the editor could not present it like every other diagnostic.
 *
 * ⚠ THE RULE IS UNCHANGED — what was invalid before is still invalid. Only WHERE it is reported moved, so
 * the concept now reaches the AST and every other validator gets to speak about it too.
 *
 * ⚠ An EMPTY `code is \`\`.` does NOT count as substance: it leaves the concept un-assertable. But the
 * empty value is still PRESERVED on the AST, so the CQL emit's `lowerLocalCodes` can raise its own explicit
 * empty-code diagnostic for the mixed case (an empty code beside a real definition). Do not "simplify" this
 * by coalescing an empty code to `undefined` at parse time.
 */
export class ConceptSubstanceValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const out: ValidationError[] = [];
    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.check(stmt, { libraryName: scope.currentLibrary, filePath: scope.filePath }, out);
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.check(stmt as Concept, {}, out);
      }
    }
    return out;
  }

  private check(
    concept: Concept,
    attribution: { libraryName?: string; filePath?: string },
    out: ValidationError[],
  ): void {
    const hasCode = concept.code !== undefined && concept.code !== "";
    if (hasCode || concept.definition !== undefined || concept.representations.length > 0) return;

    out.push({
      kind: "concept-no-substance",
      conceptName: concept.name,
      message:
        `Concept "${concept.name}" declares no local \`code is\`, no definition, and no representation, so ` +
        `nothing can ever give it a value: no question is asked of it, no record is retrieved for it, and ` +
        `nothing computes it. Add a local \`code is\` to make it answerable, a \`definition is\` / ` +
        `\`defined as\` to compute it, or a \`source representation\` to read it from data.`,
      location: concept.location,
      severity: "error",
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    } as ConceptSubstanceFinding);
  }
}
