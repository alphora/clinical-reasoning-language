import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { emitCQLImports } from "../../imports/emit";

/**
 * ⭐⭐ #189 — A HETEROGENEOUS SOURCE ARM IS CONSTRUCTED, NEVER UNIONED RAW.
 *
 * ⚠⚠ WHAT THIS REPLACED WAS A SILENT DROP (disc 533, measured). An `Observation` concept with an
 * unprojected `type is ServiceRequest` representation emitted successfully, retrieved the source record, and
 * published `null`: the space's `where O.value is …` filter discarded it, because a ServiceRequest has no
 * `value`. The author declared a representation, the record was FOUND, and it contributed nothing — with no
 * diagnostic on either lane. Charter §3 is the rule the fix restores: a heterogeneous arm must be PROJECTED
 * INTO THE CONCEPT'S TYPE before joining the space, exactly as the goal's Condition arm is.
 *
 * ⭐ `where S.<element> is not null` IS THE PAUSE SEMANTICS, not tidiness. A source record carrying no datum
 * contributes NO candidate, so the concept publishes null and the question is ASKED. Contributing a
 * value-less candidate instead would deny — the #189 defect in miniature.
 */
const FIXTURE = path.resolve(__dirname, "fixtures/heterogeneous-source/heterogeneous-source.crl");

const emitted = (): readonly { libraryName: string; cql: string }[] => {
  const r = emitCQLImports(FIXTURE);
  expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
  return (r.cqlByLibrary ?? []) as readonly { libraryName: string; cql: string }[];
};

const cqlFor = (suffix: string): string => {
  const lib = emitted().find((l) => l.libraryName.endsWith(suffix));
  expect(lib, `library *${suffix} not emitted`).toBeDefined();
  return lib!.cql;
};

describe("#189 — the heterogeneous source arm constructs", () => {
  it("⭐ builds ONE candidate per source record, filtered on the DATUM being present", () => {
    const inferences = cqlFor("Inferences");
    // The retrieve stays honest (the ServiceRequest records); the arm turns each into the concept's type.
    expect(inferences).toContain("where S.code is not null");
    expect(inferences).toMatch(/return CRLConstruct\w+\(/);
  });

  it("⭐ the candidate carries the CONCEPT's local code and case-feature profile, not the source's", () => {
    const inferences = cqlFor("Inferences");
    // Identity is the concept's, so the constructed record survives the space's conforming filter and
    // competes on recency with a clinician's own `code is` answer.
    expect(inferences).toContain("'requested-service'");
    expect(inferences).toContain("/StructureDefinition/heterogeneoussource-requested-service'");
  });

  it("⭐ reads the MODEL-RESOLVED canonical carrier as the candidate's VALUE", () => {
    // ⚠ NOT the authored element — there is none, and authoring one would change nothing. The read comes
    // from `FHIR_VALUE_READ_MODEL` keyed by the CONCEPT's value type (`effectiveRepresentation`), which is
    // why the fixture's posrep carries only `type is` + `coded from`, exactly as the goal's four posreps do.
    // An earlier cut of this fixture decorated the posrep with `value element is`/`value type is` and this
    // test claimed it "reads the declared value element". Both arms caught it: deleting those two lines left
    // the emit BYTE-IDENTICAL, so the test passed for a reason that was not true — and a fixture is a
    // language ORACLE, so it was teaching a decorative form as if it were load-bearing.
    expect(cqlFor("Inferences")).toContain("(S.code as FHIR.CodeableConcept)");
  });

  it("⭐⭐ the arm is PARENTHESISED, so a following union term cannot be swallowed by the return", () => {
    // ⚠ The alias binds correctly either way (a query source must be fully parenthesized) — VERIFIED by
    // execution. What is greedy is `returnClause`: `return F(S) union <next term>` folds the next term INTO
    // the return, which is the measured `Union(FHIR.Observation, list<FHIR.Observation>)` failure the
    // projected arm already hit. This arm is only ever final today; the parens make that not matter.
    expect(cqlFor("Inferences")).toMatch(/union \(\([A-Za-z]+ExternalPrimitives\./);
  });

  it("⭐⭐ the existence interface carries the SAME datum filter as the candidate space", () => {
    // ⚠ MEASURED contradiction (panel round 10): a raw `exists (EP."V Source")` answers from the RETRIEVE,
    // while the concept answers from the CONSTRUCTED space. Where coding and datum are different elements
    // (Condition: `code` vs `onset`) the two disagree inside one library — V publishes null and the interface
    // says a member exists. Here they coincide, so this pins the SHAPE that keeps them agreeing.
    expect(cqlFor("Inferences")).toMatch(
      /or exists \(\([A-Za-z]+ExternalPrimitives\."Requested Service Source"\) S where S\.code is not null\)/,
    );
  });

  it("⭐ stamps the candidate from the SOURCE record, so recency stays the source's own date", () => {
    expect(cqlFor("Inferences")).toContain("(S).authoredOn.value");
  });

  it("⭐⭐ DEFINES every constructor it CALLS — a dangling call fails to TRANSLATE", () => {
    // ⚠ MEASURED, not theoretical. The first cut emitted the CALL while `emitGeneratedConstructors`
    // gathered only PRODUCER and BOUNDARY-TRANSFORM demands. Emit reported success; the engine then died
    // with "Could not resolve call to operator CRLConstructObservationCodeableConcept". A constructed
    // heterogeneous arm can be a library's ONLY constructor demand — it needs no producer, and it is
    // statically excluded from the boundary transform because it conforms BY CONSTRUCTION.
    for (const { libraryName, cql } of emitted()) {
      const called = [...cql.matchAll(/return (CRLConstruct\w+)\(/g)].map((m) => m[1]);
      for (const fn of new Set(called)) {
        expect(cql, `${libraryName} calls ${fn} but never defines it`).toContain(`define function ${fn}(`);
      }
    }
  });
});

describe("#189 — a REPEATING carrier is REFUSED, not reduced", () => {
  it("⭐⭐ `Encounter.type` refuses at lowering instead of emitting an untranslatable cast", () => {
    // ⚠⚠ MEASURED, and this is why the refusal exists rather than a best guess. Before it, the arm rendered
    // `(S.type as FHIR.CodeableConcept)` over a `CodeableConcept[]`; emit reported `success: true` and the
    // library then FAILED TO TRANSLATE with "Expression of type 'List of CodeableConcept' cannot be cast as a
    // value of type 'CodeableConcept'". Both panel arms called this independently.
    //
    // ⚠ A second, quieter defect rode along: `S.type is not null` is VACUOUSLY TRUE on an empty list, so the
    // datum-presence filter — the pause semantics — was dead for repeating carriers.
    //
    // The reduction (first / each / the member matching the value set) is an OPERATOR ruling, not something
    // the emitter may infer. Until one exists this is typed BUILD DEBT, and the refusal says so by name.
    const src = readFileSync(FIXTURE, "utf-8")
      .replace("- type is ServiceRequest.", "- type is Encounter.")
      .replace(/- code is `requested-service`\./, "- code is `visit-type`.");
    const dir = mkdtempSync(path.join(tmpdir(), "crl-repeating-"));
    try {
      writeFileSync(path.join(dir, "package.json"), '{ "name": "rep", "crl": { "canonicalBase": "http://e.org/r" } }');
      const f = path.join(dir, "p.crl");
      writeFileSync(f, src.replace('library "Heterogeneous Source".', 'library "Rep".'), "utf-8");
      const r = emitCQLImports(f);
      expect(r.success, "a repeating carrier must NOT emit").toBe(false);
      const msgs = (r.errors ?? []).map((e) => String((e as { message?: string }).message ?? "")).join(" | ");
      expect(msgs).toMatch(/REPEATS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
