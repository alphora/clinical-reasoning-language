import type { CRL, Concept, DefinitionIsDefinition } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { findPatternCalls } from "../template-match/referenceRoles";

import type { MembershipScopeFinding, ValidationError } from "./validator";

// ⭐⭐ #189 gap 3 — THE RETRIEVE SCOPE AND THE PREDICATE'S SET MUST DIFFER, or `false` is unreachable.
//
// RULED (operator, 2026-09-02). `coded from` on a representation states what the concept is ABOUT — which
// records are candidate answers to this question. A membership predicate then asks which of those answers
// counts as yes. If both name the SAME terminology, every record that survives the retrieve is a member BY
// IDENTITY: the predicate can only ever return `true` or nothing, the determinate `false` disappears, and the
// decision silently loses a branch it appears to have.
//
// ⚠⚠ WHY THIS IS A WARNING AND NOT AN ERROR, which is the whole subtlety: the collapse is a tautology only
// for the SOURCE arm. A concept with a local `code is` also has an ANSWER arm, and a clinician can answer it
// with a code outside the set — that answer never passes through the retrieve, so it reaches the predicate
// and `false` stays reachable. Erroring would reject an authoring that works. (An error would be defensible
// for a source-only operand; that narrowing is deliberately not taken here, because the diagnostic teaches
// the same thing either way and a warning cannot wrongly block correct content.)
//
// ⚠ It compares DECLARATION IDENTITY (the terminology's name), not extension. Two differently-named
// terminologies with identical members collapse identically, and that is mechanically checkable for
// instantiated sets — deliberately NOT done here, because a reference set's extension is unknowable to us
// (`cre-is-mechanical-not-runtime`) and a check that fired for instantiated sets only would teach an
// inconsistent rule.

export class MembershipScopeValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const out: ValidationError[] = [];
    const byName = new Map<string, Concept>();
    const collect = (stmts: readonly unknown[]): void => {
      for (const s of stmts) {
        const c = s as Concept;
        if (c.type === "Concept" && c.name) byName.set(c.name, c);
      }
    };
    collect(ast.statements);
    if (sources) for (const { stmt } of sources) collect([stmt]);

    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.check(stmt, byName, { libraryName: scope.currentLibrary, filePath: scope.filePath }, out);
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.check(stmt as Concept, byName, {}, out);
      }
    }
    return out;
  }

  private check(
    concept: Concept,
    byName: Map<string, Concept>,
    attribution: { libraryName?: string; filePath?: string },
    out: ValidationError[],
  ): void {
    const def = concept.definition;
    if (!def || def.type !== "DefinitionIsDefinition") return;
    // ⚠⚠ FIND THE CALL AT ANY DEPTH, not just at the top. `matchNarrative` folds a pipeline, so
    // `"X" in "VS", then most recent this` — the charter's own spelling — matches as
    // `MostRecent(NestedPatternArg(Membership(…)))`. Inspecting only `matched.pattern` made BOTH warnings
    // below stop firing on that form. Third reader to make this mistake; hence the shared helper.
    const calls = findPatternCalls((def as DefinitionIsDefinition).body, "Membership") as unknown as readonly {
      args: { type: string; value: string; library?: string }[];
    }[];
    if (calls.length === 0) return;
    const args = calls[0].args;

    // ⭐⭐ A MEMBERSHIP PREDICATE IS NOT DIRECTLY ASSERTABLE — RULED (operator, 2026-09-02), and it is an
    // explicit EXCEPTION to charter §3's "a boolean interface is directly assertable via its own local
    // `code is`".
    //
    // The reason is what the predicate MEANS. Coverage is a FUNCTION of which service was requested; it is
    // not an independent clinical fact anyone observes. Giving it a `code is` would create a second source of
    // truth for something definitionally derived — a clinician could assert "covered" while the datum says
    // otherwise, and the recency merge would then arbitrate between an ANSWER and its own COMPUTATION as
    // though they were peer observations of the same thing.
    //
    // ⚠ The answerable thing is the INPUT, not the conclusion: the subject carries `code is` + `value from`,
    // so the question a user is asked is "which service was requested" — strictly more informative than a
    // yes/no about coverage, and the only one a person can actually answer.
    //
    // ⚠ An ERROR, not a warning (contrast the two findings below): there is no authoring for which a coded
    // membership predicate is correct, so nothing is wrongly blocked.
    if (concept.code !== undefined) {
      out.push({
        kind: "membership-predicate-not-assertable",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" derives its value from a membership test and also declares ` +
          `\`code is\`, which would make it directly assertable. Coverage is a FUNCTION of the tested ` +
          `value, not an independent fact: a local answer here would be a second source of truth for ` +
          `something computed, and the recency merge would arbitrate between an answer and its own ` +
          `computation. Remove \`code is\` — the question to ask is the SUBJECT ` +
          `("${subjectArgName(args)}"), which carries the answer slot and its options.`,
        location: concept.location,
        severity: "error",
        ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
        ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
      } as MembershipScopeFinding);
      return;
    }

    const subjectArg = args.find((a) => a.type === "ConceptRefArg");
    const setArg = args.find((a) => a.type === "TerminologyRefArg");
    // ⭐ #189 — the INLINE-OPTIONS subset comparand (`"X" in qualifying`). It shares the subject checks
    // below (the shape rule is identical), and differs only where the two forms genuinely differ.
    const subsetArg = args.find((a) => a.type === "SubsetRefArg");
    if (!subjectArg || (!setArg && !subsetArg)) return;

    // ⚠⚠ A CROSS-LIBRARY SUBJECT CANNOT BE PROVED ANSWERABLE HERE, AND THE FAILURE IS SILENT.
    //
    // `readsAQuestion` deliberately does NOT follow qualified refs and reports a foreign operand as NOT
    // question-bearing — documented in `ast/questionReachability.ts` as the conservative direction for the
    // corpus and a KNOWN limit (O-UNIFIED), not an oversight. For most predicates that is harmless. For
    // MEMBERSHIP it is not: classified as reading evidence rather than a question, the predicate is
    // boundary-totalized, its `null` becomes `false`, and an unanswered subject DENIES instead of PAUSING —
    // destroying the three-state behaviour this construct exists to provide.
    //
    // ⚠ A WARNING, not an error: a foreign subject that really is evidence-only SHOULD be totalized, and we
    // cannot tell the two apart from here. Refusing would reject correct authoring; saying nothing would let
    // a pause disappear with no diagnostic. (Not reachable today — a separate pre-existing gate refuses
    // qualified refs into an auto-splitting library — so this is a tripwire for when that lifts.)
    // ⭐⭐ FOR THE SUBSET FORM THIS IS AN ERROR, NOT A WARNING, and the asymmetry is principled rather than
    // stricter-for-its-own-sake. The warning below is hedged because a foreign subject that really IS
    // evidence-only SHOULD be totalized, and this validator cannot tell the two apart. That ambiguity CANNOT
    // ARISE here: `in qualifying` resolves against the SUBJECT'S OWN inline `value from:` declaration, so its
    // subject is an answerable question BY CONSTRUCTION. A foreign one would be silently totalized and DENY
    // an unanswered question instead of pausing — the unrecoverable class, with no compensating legitimate
    // reading to protect.
    //
    // ⚠ It also cannot be resolved: the comparand's identity is (owning concept, subset name), and nothing
    // resolves a foreign concept's option list here. Emitting anyway would bind to nothing.
    if (subjectArg.library !== undefined && subsetArg) {
      out.push({
        kind: "membership-subset-cross-library",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" tests \`in ${subsetArg.value}\` against a subject in another library ` +
          `("${subjectArg.library}"."${subjectArg.value}"). A subset names part of the SUBJECT'S OWN ` +
          `\`value from:\` declaration, which cannot be resolved across libraries — and a cross-library ` +
          `subject cannot be proved answerable, so its unknown would be totalized to \`false\` and an ` +
          `unanswered question would DENY instead of pausing. Declare the predicate in the same library as ` +
          `its subject.`,
        location: concept.location,
        severity: "error",
        ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
        ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
      } as MembershipScopeFinding);
      return;
    }

    if (subjectArg.library !== undefined) {
      out.push({
        kind: "membership-cross-library-subject",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" tests a subject in another library ` +
          `("${subjectArg.library}"."${subjectArg.value}"). Whether that subject is ANSWERABLE cannot be ` +
          `determined across libraries, so this predicate may be treated as reading evidence and have its ` +
          `unknown totalized to \`false\` — an unanswered subject would then DENY instead of pausing. ` +
          `Declare the predicate in the same library as its subject if the three-state behaviour matters.`,
        location: concept.location,
        severity: "warning",
        ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
        ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
      } as MembershipScopeFinding);
      return;
    }

    const subject = byName.get(subjectArg.value);
    if (!subject) return; // an unresolved operand is already a reference error

    // ⚠ `in qualifying` names a subset of the SUBJECT'S declared options. Without an inline `value from:`
    // there is no set to test against, and the CQL lowering has nothing to render — it throws at emit. An
    // author-time error names the actual fix instead.
    if (subsetArg && subject.valueFrom?.kind !== "inline") {
      out.push({
        kind: "membership-subset-subject-has-no-options",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" tests \`in ${subsetArg.value}\`, but "${subjectArg.value}" declares no ` +
          `inline \`value from:\` options, so there is no subset to test against. Give the subject an inline ` +
          `\`value from:\` block whose options carry \`qualifying\` / \`not qualifying\` markers, or test ` +
          `against a named terminology instead (\`in "<terminology>"\`).`,
        location: concept.location,
        severity: "error",
        ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
        ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
      } as MembershipScopeFinding);
      return;
    }

    // ⚠⚠ THE SUBJECT MUST PUBLISH ONE RECORD, AND THIS REFUSAL REPLACES A MEASURED SILENT-WRONG EMIT.
    //
    // The lowering reads `<subject>.value as FHIR.CodeableConcept`. That is right for a concept publishing a
    // RECORD. For `shape is RecordSet` the subject is a LIST, so `.value` is a list too and the cast is a
    // list-to-singleton — MEASURED: emit reports SUCCESS and the library fails to TRANSLATE with
    // "Expression of type 'List of choice<…>' cannot be cast as a value of type 'CodeableConcept'". Exactly
    // the class of the `Encounter.type` repeating-read defect, and the panel predicted this cell before it
    // was reachable.
    //
    // ⚠ `shape is Scalar` publishes the VALUE, not a record, so the lowering would read `.value` off a
    // value. That cell is BUILDABLE (drop the `.value` step) but is not built, so it refuses too rather than
    // emitting something nobody has run. Typed BUILD DEBT (§0a), not an author error — the message says so.
    const shape = subject.shape;
    if (shape !== undefined && shape !== "Record") {
      out.push({
        kind: "membership-subject-shape-unsupported",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" tests membership over "${subjectArg.value}", which declares ` +
          `\`shape is ${shape}\`. Membership reads the ONE value its subject publishes, and only ` +
          `\`shape is Record\` publishes one: a \`RecordSet\` publishes a LIST (there is no ruled reduction ` +
          `for which record's value to test), and a \`Scalar\` publishes the value itself (readable, but that ` +
          `lowering is not built). Give the subject \`shape is Record\` and a reduction such as ` +
          `\`definition is most recent this\`.`,
        location: concept.location,
        severity: "error",
        ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
        ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
      } as MembershipScopeFinding);
      return;
    }

    // ⚠ The scope-vs-comparand rule below is TERMINOLOGY-ONLY: it compares the predicate's set against the
    // subject's `coded from` retrieve scope. A subset comparand has no such set — it names part of the
    // subject's own options — so the comparison is meaningless here, not merely inapplicable.
    if (!setArg) return;

    for (const rep of subject.representations ?? []) {
      if (!rep.terminologyName) continue;
      // ⚠ Compare the QUALIFIER too. Two libraries may each declare a terminology of the same name, and a
      // bare-name comparison would equate two distinct value sets — warning on a shape that does not
      // collapse, or missing one that does.
      if (getRefName(rep.terminologyName) !== setArg.value) continue;
      if ((getRefLibrary(rep.terminologyName) ?? undefined) !== setArg.library) continue;
      out.push({
        kind: "membership-scope-equals-comparand",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" tests whether "${subjectArg.value}" is in "${setArg.value}", but that ` +
          `same terminology also scopes "${subjectArg.value}"'s retrieve (\`coded from "${setArg.value}"\`). ` +
          `Every record the retrieve returns is therefore a member by construction, so the test can only ` +
          `answer yes or nothing — the determinate NO is unreachable from source data. ` +
          `\`coded from\` should name what the concept is ABOUT (the requestable universe); the predicate ` +
          `should name the narrower set that counts as yes. ` +
          `⚠ Not an error: a local \`code is\` answer never passes through the retrieve, so if this concept ` +
          `is answered directly a \`false\` can still arise that way.`,
        location: concept.location,
        severity: "warning",
        ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
        ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
      } as MembershipScopeFinding);
      return;
    }
  }
}

/** The membership subject's name, for the teaching diagnostic. */
function subjectArgName(args: readonly { type: string; value: string }[]): string {
  return args.find((a) => a.type === "ConceptRefArg")?.value ?? "the tested concept";
}
