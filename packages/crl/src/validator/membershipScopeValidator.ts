import type { CRL, Concept, DefinitionIsDefinition } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { matchNarrative } from "../template-match/matcher";

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
    const matched = matchNarrative((def as DefinitionIsDefinition).body) as unknown as
      | { pattern: string; known: boolean; args: { type: string; value: string; library?: string }[] }
      | null;
    if (!matched || matched.known !== true || matched.pattern !== "Membership") return;

    const subjectArg = matched.args.find((a) => a.type === "ConceptRefArg");
    const setArg = matched.args.find((a) => a.type === "TerminologyRefArg");
    if (!subjectArg || !setArg) return;

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
