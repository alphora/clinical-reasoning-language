import * as path from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { Validator } from "../../validator/validator";
import { matchNarrative } from "../matcher";
import { emitCQLImports } from "../../imports/emit";
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

  it("⭐⭐ the FOLDED pipeline form resolves its terminology too — it is the charter's own spelling", () => {
    // ⚠⚠ THIS TEST USED TO ASSERT ONLY `concept.definition` IS DEFINED, and it passed while the form was
    // BROKEN — a vacuous assertion, caught by review. `matchNarrative` FOLDS a pipeline by wrapping the
    // earlier call in a `NestedPatternArg`, so `"X" in "VS", then most recent this` matches as
    // `MostRecent(NestedPatternArg(Membership(…)))`. A scan of the TOP-LEVEL args never sees the
    // terminology, so the comparand was checked against the CONCEPT namespace and reported unresolved.
    const { validator, built } = predicate(
      'definition is "Requested Service" in "Covered Services", then most recent this.',
    );
    const r = validator.validate(built.result!);
    expect(r.errors.map((e) => e.kind), "the folded form must resolve its comparand").not.toContain(
      "unresolved-reference",
    );
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

describe("#189 gap 3 T3 — the lowering", () => {
  const emitFor = (): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "crl-membership-"));
    try {
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "mt", version: "1.0.0", private: true, crl: { canonicalBase: "http://example.org/mt" } }),
      );
      const file = path.join(dir, "p.crl");
      writeFileSync(
        file,
        [
          "# membership",
          'library "Mt".',
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
          "- value type is CodeableConcept.",
          "- code is `requested-service`.",
          "- definition is most recent this.",
          "- source representation:",
          "  - type is ServiceRequest.",
          '  - coded from "Requestable Services".',
          "",
          'concept "Requested Service Is Covered":',
          "- shape is Scalar.",
          "- type is Observation.",
          "- value type is boolean.",
          '- definition is "Requested Service" in "Covered Services".',
          "",
          'activity "Approve":',
          "- request CPGCommunicationRequest.",
          "- with `APPROVED`.",
          "",
          'decision "D":',
          "first:",
          '- when "Requested Service Is Covered" then recommend activity "Approve".',
        ].join("\n"),
        "utf-8",
      );
      const r = emitCQLImports(file) as { success: boolean; errors?: unknown[]; cqlByLibrary?: { libraryName: string; cql: string }[] };
      expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
      const lib = (r.cqlByLibrary ?? []).find((l) => l.libraryName.endsWith("Inferences"));
      expect(lib, "no Inferences library emitted").toBeDefined();
      return lib!.cql;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("⭐⭐ guards NULL and EMPTY before testing membership — both MEASURED to read `false` otherwise", () => {
    const cql = emitFor();
    // ⚠ CQL `in` returns a determinate FALSE for a null operand AND for a present-but-empty
    // `{coding: {}}` — both measured on the engine. Lowered naively, "nobody has said which service was
    // requested" would DENY rather than PAUSE, collapsing the unanswered row into the not-covered row — the
    // exact defect the goal fixture exists to prevent.
    expect(cql).toMatch(/is null or not exists \(.*\.coding\) then null/);
  });

  it("⭐ converts with `ToConcept` — a raw CodeableConcept is not a valid `in` operand", () => {
    expect(emitFor()).toContain("FHIRHelpers.ToConcept(");
  });

  it("⭐⭐ QUALIFIES the value set to its declaring layer", () => {
    // ⚠ MEASURED on the `$apply` harness: emit reported SUCCESS and the library failed to TRANSLATE with
    // "Could not resolve identifier Covered Services in the current library". Terminologies live in the
    // Concepts layer; the predicate emits in Inferences. The narrative requalifier hardcoded the CONCEPT slot
    // for every quoted name, so the set was left bare. Same class as the dangling constructor in gap 1.
    expect(emitFor()).toMatch(/in [A-Za-z]+ExternalConcepts\."Covered Services"/);
  });

  it("⭐ reads the SUBJECT's published value, not its representations", () => {
    // The subject is a concept that has ALREADY reduced (`most recent this`), so membership tests the ONE
    // value it publishes. Reaching through to its posrep would ignore the author's own reduction.
    expect(emitFor()).toContain('("Requested Service".value as FHIR.CodeableConcept)');
  });
});
