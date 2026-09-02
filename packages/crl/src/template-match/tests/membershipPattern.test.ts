import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { Validator } from "../../validator/validator";
import { matchNarrative } from "../matcher";
import type { Concept, DefinitionIsDefinition } from "../../ast/types";

/**
 * ⭐⭐ #189 gap 3 T1 — `"<concept>" in "<terminology>"`, the CONCEPT-LEVEL membership predicate.
 *
 * The form the charter itself writes (§3, beside `"BMI" at least 30 'kg/m2'`). It REPLACES the rep-local
 * `value projection is matches this`, which the operator retired (2026-09-02) because it was created to do
 * exactly this job and could not: its comparand was forced to be the representation's own `coded from`, so
 * the set it tested against could never differ from the set scoping the retrieve — and when those coincide
 * every retrieved record is a member BY IDENTITY and a determinate `false` is unreachable.
 *
 * ⚠ MEASURED before any of this was written: the spelling ALREADY PARSED, with `known: false`. So this slice
 * adds no grammar — only the catalog entry, the matcher template, and (later) the lowering.
 */

const HEAD = [
  "# P",
  'library "L".',
  "",
  'terminology "Covered Services":',
  "- system is `http://www.ama-assn.org/go/cpt`.",
  "- code is `37718`.",
  "",
  'concept "Requested Service":',
  "- shape is Record.",
  "- type is Observation.",
  "- value type is CodeableConcept.",
  "- code is `requested-service`.",
  "- definition is most recent this.",
  "",
];

function predicate(definition: string): { concept: Concept; validator: Validator; built: ReturnType<typeof buildCRL> } {
  const built = buildCRL(
    [
      ...HEAD,
      'concept "Requested Service Is Covered":',
      "- shape is Record.",
      "- type is Observation.",
      "- value type is boolean.",
      "- code is `requested-service-is-covered`.",
      `- ${definition}`,
    ].join("\n"),
  );
  expect(built.success, JSON.stringify(built.errors)).toBe(true);
  const concept = (built.result?.statements ?? []).find(
    (s) => (s as Concept).type === "Concept" && (s as Concept).name === "Requested Service Is Covered",
  ) as Concept;
  return { concept, validator: new Validator(), built };
}

describe("#189 gap 3 — the Membership pattern", () => {
  it("⭐⭐ resolves to a KNOWN pattern with operands in TWO namespaces", () => {
    const { concept } = predicate('definition is "Requested Service" in "Covered Services".');
    const body = (concept.definition as DefinitionIsDefinition).body;
    const matched = matchNarrative(body) as unknown as {
      pattern: string;
      known: boolean;
      args: { type: string; value: string }[];
    };
    expect(matched.known, "the catalog must know this form").toBe(true);
    expect(matched.pattern).toBe("Membership");
    // ⚠⚠ THE POINT. A quoted name parses as an `NConceptRef` either way — the narrative parser cannot tell a
    // concept from a terminology. The ROLE comes from POSITION, and it must be carried in the ARG TYPE,
    // because no consumer downstream can recover it. Passing the set as a `ConceptRefArg` would make
    // `resolveProducerCandidates` demand a recency stamp from a value set.
    expect(matched.args.map((a) => a.type)).toEqual(["ConceptRefArg", "TerminologyRefArg"]);
    expect(matched.args.map((a) => a.value)).toEqual(["Requested Service", "Covered Services"]);
  });

  it("⭐ the terminology operand resolves in the TERMINOLOGY namespace, not the concept one", () => {
    // Before the resolver learned the pattern this reported: Unresolved reference "Covered Services" …
    // (no concept or parameter declared with this name) — for a perfectly good terminology.
    const { concept, validator, built } = predicate('definition is "Requested Service" in "Covered Services".');
    expect(concept).toBeDefined();
    const r = validator.validate(built.result!);
    expect(r.errors.map((e) => e.kind)).not.toContain("unresolved-reference");
  });

  it("⭐ an UNDECLARED terminology still fails loudly", () => {
    const { validator, built } = predicate('definition is "Requested Service" in "No Such Set".');
    const r = validator.validate(built.result!);
    expect(r.errors.map((e) => e.kind)).toContain("unresolved-reference");
  });

  it("⭐ the reduction may follow it, so the predicate can MERGE with a local answer", () => {
    // `, then most recent this` is what makes membership a PRODUCER whose candidate competes with a
    // clinician's direct answer on recency — the goal's "newer answer says no" row.
    const { concept } = predicate(
      'definition is "Requested Service" in "Covered Services", then most recent this.',
    );
    expect(concept.definition).toBeDefined();
  });

  it("⚠ an unmatched narrative is untouched — the resolver's namespace routing is pattern-scoped", () => {
    // The routing keys on a MATCHED `TerminologyRefArg` span. A narrative that matches nothing must keep
    // reporting its refs against the concept namespace exactly as before.
    const { validator, built } = predicate('definition is "Requested Service" wibbled by "No Such Thing".');
    const r = validator.validate(built.result!);
    expect(r.errors.map((e) => e.kind)).toContain("unresolved-reference");
  });
});

describe("#189 gap 3 T2 — membership validation", () => {
  const build = (operandValueType: string, scopeSet: string | null) =>
    buildCRL(
      [
        "# P",
        'library "L".',
        "",
        'terminology "Requestable Services":',
        "- system is `http://www.ama-assn.org/go/cpt`.",
        "- code is `37718`.",
        "- code is `37722`.",
        "",
        'terminology "Covered Services":',
        "- system is `http://www.ama-assn.org/go/cpt`.",
        "- code is `37718`.",
        "",
        'concept "Requested Service":',
        "- shape is Record.",
        "- type is Observation.",
        `- value type is ${operandValueType}.`,
        "- code is `requested-service`.",
        "- definition is most recent this.",
        ...(scopeSet
          ? ["- source representation:", "  - type is ServiceRequest.", `  - coded from "${scopeSet}".`]
          : []),
        "",
        'concept "Requested Service Is Covered":',
        "- shape is Record.",
        "- type is Observation.",
        "- value type is boolean.",
        "- code is `requested-service-is-covered`.",
        '- definition is "Requested Service" in "Covered Services".',
      ].join("\n"),
    );

  it("⭐ the tested value must be CODED — a membership test reads a code", () => {
    for (const vt of ["Quantity", "boolean"]) {
      const built = build(vt, "Requestable Services");
      expect(built.success).toBe(true);
      const r = new Validator().validate(built.result!);
      expect(r.errors.map((e) => e.kind), `value type ${vt} must be rejected`).toContain(
        "use-site-type-mismatch",
      );
    }
    const ok = build("CodeableConcept", "Requestable Services");
    const r = new Validator().validate(ok.result!);
    expect(r.errors.map((e) => e.kind)).not.toContain("use-site-type-mismatch");
  });

  it("⭐⭐ scope == comparand WARNS — the determinate NO is unreachable from source data", () => {
    // Every record surviving a filter for set X is a member of X, so the predicate can only answer yes or
    // nothing. This is the identity collapse the two-terminology model exists to prevent.
    const built = build("CodeableConcept", "Covered Services");
    const r = new Validator().validate(built.result!);
    expect(r.warnings.map((e) => e.kind)).toContain("membership-scope-equals-comparand");
    // ⚠ A WARNING, NOT AN ERROR, and the reason is load-bearing: the collapse is a tautology for the SOURCE
    // arm only. A local `code is` answer never passes through the retrieve, so a concept answered directly
    // can still produce a `false`. Erroring would reject an authoring that works.
    expect(r.errors.map((e) => e.kind)).not.toContain("membership-scope-equals-comparand");
    expect(r.isValid).toBe(true);
  });

  it("⭐ differing sets are clean — the warning must not fire on the correct shape", () => {
    const built = build("CodeableConcept", "Requestable Services");
    const r = new Validator().validate(built.result!);
    expect(r.warnings.map((e) => e.kind)).not.toContain("membership-scope-equals-comparand");
  });

  it("⚠ an operand with NO representation cannot collapse — stays silent", () => {
    const built = build("CodeableConcept", null);
    const r = new Validator().validate(built.result!);
    expect(r.warnings.map((e) => e.kind)).not.toContain("membership-scope-equals-comparand");
  });
});
