import type { CRL, Concept, Location, NarrativeClause } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { matchNarrative, matchNarrativeStages } from "../template-match/matcher";
import { patternReturnShape } from "../template-match/patternCatalog";

import type { RecordSetUnboundedWarning, ValidationError } from "./validator";

// ⭐⭐ #189 — A `shape is RecordSet` CONCEPT THAT NEVER RESTRICTS ITS SET IS A PERFORMANCE SMELL.
//
// RULED (operator, 2026-09-01): *"A history-only record set is a performance smell. We should emit a warning
// on validation. Not an error of course but a warning. If a recordset doesn't include a query
// restriction/filter you get a warning."*
//
// ⚠⚠ WHY IT IS A WARNING AND NOT AN ERROR, and this is load-bearing: an unbounded coded history is
// **LEGAL and sometimes exactly right** — the Layered authoring option publishes `Weight Records` as its
// whole history on purpose, and charter §3 keeps all three authoring options canonical. This rule must
// never read as "RecordSet is discouraged". It says one thing only: *you did not bound this set, and the
// cost of that lands at the concept boundary.*
//
// ⭐ WHY THE COST IS REAL, not speculative. Charter §3: a consumer has to see a CASE FEATURE, and that
// transform happens at the concept BOUNDARY. For a `shape is Record` concept the boundary is ONE record, so
// it is one construction. For a `shape is RecordSet` concept the boundary is the WHOLE SET — n
// constructions, on every evaluation. **And no placement of the transform changes that**: the boundary IS
// the collection, so moving work earlier or later cannot shrink n. The only lever is a restriction that
// makes the set smaller, which is precisely what this rule notices is missing.
//
// ⚠ SCOPE — deliberately narrow, three ways, because a warning that cries wolf gets muted and then the real
// ones are invisible too:
//
//   1. Only an EXPLICITLY declared `shape is RecordSet` fires. An OMITTED shape is an open author-time
//      question (`Concept.shape` is optional by design), not a RecordSet, and `assumedShapePreMigration`'s
//      Scalar default is a migration crutch this rule must not launder into a finding.
//   2. ANY list-returning stage anywhere in the program counts as a restriction. This is deliberately
//      generous: `ComponentOf` is list-returning and MAPS rather than filters (`patternCatalog`'s
//      `preservesElements` records that it was MEASURED), so counting it means a mapped-but-unbounded set
//      escapes the warning. That is the right error to make — `preservesElements` is only populated on
//      GROUNDED patterns, so a stricter rule would fire on every ungrounded list pattern in the corpus and
//      be wrong far more often than this is.
//   3. It reports the CONCEPT, not a stage, because the fix is usually to ADD a stage that is not there.
export class RecordSetBoundValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const warnings: ValidationError[] = [];
    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.checkConcept(stmt, { libraryName: scope.currentLibrary, filePath: scope.filePath }, warnings);
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt, {}, warnings);
      }
    }
    return warnings;
  }

  private checkConcept(
    concept: Concept,
    attribution: { libraryName?: string; filePath?: string },
    warnings: ValidationError[],
  ): void {
    // §1 — EXPLICIT declaration only. `concept.shape === undefined` is an open question, not a RecordSet.
    if (concept.shape !== "RecordSet") return;

    // ⭐⭐ §4 — A `defined as` CONCEPT IS OUT OF SCOPE, and this was MEASURED, not assumed. A first cut of
    // this rule warned on 48 of 106 in-tree RecordSet concepts, and the largest class was sem-*
    // compositions like cms69's `"High BMI Follow-up Order" defined as (A sem-or B)`. Two things are wrong
    // with warning there:
    //
    //   · A composition does not RETRIEVE a set — it publishes whatever its OPERANDS publish. Its
    //     boundedness is theirs, so the restriction belongs on them, and each of them is judged by this
    //     same rule on its own.
    //   · The suggested fix is not even expressible: you cannot append `, then within last 6 months this`
    //     to a `defined as` body. A warning whose remedy does not apply is noise that teaches authors to
    //     mute the channel.
    if (concept.definition?.type === "DefinedAsDefinition") return;

    if (this.restricts(concept)) return;

    const warning: RecordSetUnboundedWarning = {
      kind: "recordset-unbounded",
      conceptName: concept.name,
      message:
        `Concept "${concept.name}" declares \`shape is RecordSet\` but its program never restricts the ` +
        `set, so it publishes the patient's WHOLE history for this code. That is legal, and sometimes ` +
        `exactly what you mean — but every consumer of this concept pays for each record in it, because ` +
        `the case-feature transform happens at the concept boundary and the boundary here is the entire ` +
        `set. If you meant a bounded window, add a restriction (\`, then within last 6 months this\`); if ` +
        `you meant one record, declare \`shape is Record\` and select one (\`definition is most recent ` +
        `this\`).`,
      location: concept.location,
      severity: "warning",
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    };
    warnings.push(warning);
  }

  /**
   * Whether ANY narrative the concept carries MIGHT restrict the set.
   *
   * ⚠⚠ "MIGHT" IS DELIBERATE, AND IT WAS A REAL BUG. The first cut asked whether a narrative DOES
   * restrict, and an UNCLASSIFIABLE narrative answered "no" — so it warned on a concept that plainly
   * restricts. MEASURED: `definition is "Weight Records" within last 6 months` is not a catalog-matched
   * pattern at all (`matchNarrative` hands back the raw text, `patternReturnShape` → `undefined`), and the
   * same is true of the in-tree `mammogram-and-bmi` fixture's two windowing definitions.
   *
   * ⚠ The in-tree blast-radius measurement did NOT catch this — every one of the 32 hits was a bare
   * `code is` / `coded from` concept with no definition at all. Only the unit test found it.
   *
   * So an unclassified narrative SUPPRESSES the warning. That is the right direction for an advisory
   * finding: we cannot tell whether it bounds the set, and a warning we cannot justify is worse than a
   * missed one — it teaches authors to mute the channel. The under-report is bounded and self-correcting
   * (classify the pattern in the catalog and the warning starts firing correctly).
   */
  private restricts(concept: Concept): boolean {
    const bodies: NarrativeClause[] = [];
    if (concept.definition?.type === "DefinitionIsDefinition") bodies.push(concept.definition.body);
    for (const rep of concept.representations ?? []) {
      if (rep.valueProjection) bodies.push(rep.valueProjection.body);
    }
    return bodies.some((body) => this.narrativeMayRestrict(body));
  }

  private narrativeMayRestrict(body: NarrativeClause): boolean {
    const staged = matchNarrativeStages(body);
    if (staged.kind === "pipeline") {
      return staged.stages.some(({ call }) => {
        // ⚠ A stage that matches NOTHING (`call === null`) is already a hard error from
        // `PipelineStageValidator`. Treat it as unknown and stay quiet rather than stacking an advisory
        // finding on top of a structural one.
        if (call === null) return true;
        const shape = patternReturnShape(call.pattern);
        return shape === undefined || shape === "list";
      });
    }
    // Not a pipeline — a single narrative. ⚠ `matchNarrativeStages` reports `not-a-pipeline` for it, so
    // reading ONLY the staged result would miss `definition is within last 6 months this` entirely.
    if (staged.kind === "malformed") return true;
    const shape = patternReturnShape(matchNarrative(body).pattern);
    return shape === undefined || shape === "list";
  }
}
