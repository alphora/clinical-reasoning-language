// #189 emit-flip · T4 — scanner tests. Exercises the pure lib against real fixtures + inline CRL so
// an internal-API change breaks THIS suite loudly (the T7-staleness-gate guarantee). Assertions
// prefer invariants (closed-set equation, oracle↔validator reconciliation) and specific
// classifications over absolute repo counts, which drift as fixtures are added.

import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept } from "../../ast/types";
import {
  isBareScalarCodeTarget,
  migrationClassFor,
  buildEdgeIndex,
  declKey,
  runInventory,
  diffOracleAgainstValidator,
  valueReadPathBlocker,
  type ExclusionRule,
} from "../migrationInventory";
import { THIS_REPO_EXCLUSIONS } from "../repoExclusions";

const CRL_ROOT = path.resolve(__dirname, "..", "..", ".."); // packages/crl
const REPO_ROOT = path.resolve(CRL_ROOT, "..", ".."); // monorepo root

function parse(src: string): CRL {
  const r = buildCRL(src);
  if (!r.success || !r.result) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  return r.result;
}
function conceptNamed(ast: CRL, name: string): Concept {
  const c = ast.statements.find((s): s is Concept => s.type === "Concept" && s.name === name);
  if (!c) throw new Error(`no concept "${name}"`);
  return c;
}
const fixture = (rel: string): string => path.join(CRL_ROOT, "src", rel);

// ---------------------------------------------------------------------------------------------
describe("oracle — isBareScalarCodeTarget", () => {
  const ast = parse(`library "T".

concept "Bare Bool":
- type is Condition.
- value type is boolean.
- code is \`x\`.

concept "Pure Question":
- type is Observation.
- value type is boolean.
- code is \`q\`.

concept "Has Reduction":
- type is Observation.
- value type is boolean.
- code is \`y\`.
- definition is exists this.

concept "Both Rep":
- type is Observation.
- value type is boolean.
- code is \`z\`.
- defined as "Bare Bool".

concept "No Local Code":
- type is Observation.
- value type is boolean.
- defined as "Bare Bool".

concept "Record Set":
- type is Observation.
- value type is boolean.
- shape is RecordSet.
- code is \`w\`.
`);

  it("flags a bare Scalar code-is concept", () => {
    // `type is Condition` deliberately — see the pure-question exemption directly below.
    expect(isBareScalarCodeTarget(conceptNamed(ast, "Bare Bool"))).toBe(true);
  });
  // #189 null/pause (panel disc 517) — a PURE QUESTION must never reach the migration worklist: the
  // `boolean-presence` step ("add `- definition is exists this.`") would convert a question that PAUSES
  // into a derivation that never can. The oracle imports the shared predicate rather than re-deriving it,
  // so it cannot drift from the validator on the one exemption whose absence deletes the pause.
  it("does NOT flag a PURE QUESTION — migrating it would delete the pause", () => {
    expect(isBareScalarCodeTarget(conceptNamed(ast, "Pure Question"))).toBe(false);
  });
  it("does NOT flag a code-is + reduction", () => {
    expect(isBareScalarCodeTarget(conceptNamed(ast, "Has Reduction"))).toBe(false);
  });
  it("does NOT flag a code-is + defined-as (both-rep, exempt)", () => {
    expect(isBareScalarCodeTarget(conceptNamed(ast, "Both Rep"))).toBe(false);
  });
  it("does NOT flag a concept with no local code", () => {
    expect(isBareScalarCodeTarget(conceptNamed(ast, "No Local Code"))).toBe(false);
  });
  it("does NOT flag a RecordSet code-is (canonical retrieve)", () => {
    expect(isBareScalarCodeTarget(conceptNamed(ast, "Record Set"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("migration class", () => {
  it("boolean → boolean-presence", () => {
    const ast = parse(`library "T".
concept "P":
- type is Observation.
- value type is boolean.
- code is \`x\`.
`);
    expect(migrationClassFor(conceptNamed(ast, "P")).migrationClass).toBe("boolean-presence");
  });

  it("single non-boolean rep → value-read", () => {
    const ast = parse(`library "T".
concept "Q":
- type is Observation.
- value type is Quantity.
- code is \`x\`.
`);
    expect(migrationClassFor(conceptNamed(ast, "Q")).migrationClass).toBe("value-read");
  });

  it("no single value type → value-type-unresolved", () => {
    const ast = parse(`library "T".
concept "R":
- type is Observation.
- value type is boolean.
- code is \`x\`.
`);
    const noVt: Concept = { ...conceptNamed(ast, "R"), valueTypes: [] };
    expect(migrationClassFor(noVt).migrationClass).toBe("value-type-unresolved");
  });
});

// ---------------------------------------------------------------------------------------------
describe("valueReadPathBlocker — value-read viability (design §8)", () => {
  it("Condition value-read is modeled-valueless → blocker", () => {
    const ast = parse(`library "T".
concept "Cond Val":
- type is Condition.
- value type is CodeableConcept.
- code is \`c\`.
`);
    expect(valueReadPathBlocker(conceptNamed(ast, "Cond Val"))).toContain("modeled-valueless");
  });

  it("missing `type is` defaults to Observation (admits CodeableConcept) → no blocker", () => {
    const ast = parse(`library "T".
concept "Bare CC":
- value type is CodeableConcept.
- type is Observation.
- code is \`x\`.
`);
    expect(valueReadPathBlocker(conceptNamed(ast, "Bare CC"))).toBeNull();
  });

  it("boolean presence is not a value-read → no blocker", () => {
    const ast = parse(`library "T".
concept "P":
- value type is boolean.
- code is \`p\`.
`);
    expect(valueReadPathBlocker(conceptNamed(ast, "P"))).toBeNull();
  });

  it("ServiceRequest.code value-read → no blocker (#189 B1 — SR.code is now modeled; was `unmodeled`)", () => {
    // The one deliberate NON-emit classification shift of B1 (gpt56 disc 497): before B1
    // `valueReadValueTypes("ServiceRequest","code")` was `undefined` (blocker "unmodeled"); B1 models SR.code as a
    // CodeableConcept value-read (the source datum), so the inventory now classifies this shape as viable.
    const ast = parse(`library "T".
concept "SR Code":
- type is ServiceRequest.
- value element is ServiceRequest.code.
- value type is CodeableConcept.
- code is \`sr\`.
`);
    expect(valueReadPathBlocker(conceptNamed(ast, "SR Code"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe("edge index — consumption roles", () => {
  it("records a defined-as-target edge to the consumed concept", () => {
    const ast = parse(`library "L".
concept "A":
- type is Observation.
- value type is boolean.
- code is \`a\`.
concept "B":
- type is Observation.
- value type is boolean.
- defined as "A".
`);
    const edges = buildEdgeIndex([{ filePath: "L.crl", ast }]).get(declKey("L", "A")) ?? [];
    expect(edges.map((e) => e.edgeKind)).toContain("defined-as-target");
    expect(edges[0].ownerName).toBe("B");
  });

  it("records a when-guard edge and a criterion-body edge", () => {
    const ast = parse(`library "L".
concept "G":
- type is Observation.
- value type is boolean.
- code is \`g\`.
criterion "Crit":
- when ( "G" ).
activity "Act":
- request CPGServiceRequest.
decision "D":
- when "G" then recommend activity "Act".
`);
    const kinds = (buildEdgeIndex([{ filePath: "L.crl", ast }]).get(declKey("L", "G")) ?? []).map(
      (e) => e.edgeKind,
    );
    expect(kinds).toContain("when-guard");
    expect(kinds).toContain("criterion-body");
  });
});

// ---------------------------------------------------------------------------------------------
describe("reconcile diff — oracle vs authoritative validator (pure)", () => {
  it("agree when the sets are equal", () => {
    const a = new Set(["f1c1", "f1c2"]);
    const b = new Set(["f1c1", "f1c2"]);
    expect(diffOracleAgainstValidator(a, b).ok).toBe(true);
  });
  it("oracle-only key → a hard divergence of kind oracle-only", () => {
    const r = diffOracleAgainstValidator(new Set(["only-oracle"]), new Set());
    expect(r.ok).toBe(false);
    expect(r.divergences[0].kind).toBe("oracle-only");
  });
  it("validator-only key → a hard divergence of kind warning-only", () => {
    const r = diffOracleAgainstValidator(new Set(), new Set(["only-validator"]));
    expect(r.ok).toBe(false);
    expect(r.divergences[0].kind).toBe("warning-only");
  });
});

// ---------------------------------------------------------------------------------------------
describe("runInventory — integration over real fixture sub-roots", () => {
  const NONE: ExclusionRule[] = [];

  it("code-is-basic: closed-set holds, reconciles, and has NOTHING left to migrate", () => {
    const rep = runInventory({ root: fixture("cql-emitter/tests/fixtures/code-is-basic"), exclusions: NONE });
    expect(rep.counts.included + rep.counts.excluded + rep.counts.buildFailed).toBe(rep.counts.discovered);
    expect(rep.reconcile.ok).toBe(true);
    expect(rep.failures).toEqual([]);
    const names = rep.targets.map((t) => t.decl.conceptName);
    // #189: "Adult Patient" is `type is Observation` + boolean + `code is` = a PURE QUESTION, so it is
    // EXEMPT and off the worklist — its `Observation.value[x]` IS the answer slot and `exists this` would
    // destroy the pause. "Active Crohns Disease" is `type is Condition`: nowhere to store a boolean, so it
    // is not a question and IS still a migration target.
    expect(names).not.toContain("Adult Patient");
    // #189 T5 step 2b MIGRATED this fixture: "Active Crohns Disease" now carries `definition is exists this`,
    // the canonical spelling for a `type is Condition` boolean (the value type names the RESULT of the
    // `exists`), so it is a derivation rather than a bare leaf and is off the worklist. The inventory going
    // EMPTY here is the migration landing, not coverage being lost — the inventory's own machinery is
    // exercised by the unit cases above and by the other fixture roots below.
    expect(names).not.toContain("Active Crohns Disease");
    expect(names).not.toContain("Adult With Crohns");
    expect(rep.targets).toEqual([]);
  });

  it("patient-age: the age posrep concept is a value-projection-exempt NON-target", () => {
    const rep = runInventory({ root: fixture("fhir-emitter/tests/fixtures/patient-age"), exclusions: NONE });
    expect(rep.reconcile.ok).toBe(true);
    const exempt = rep.nonTargets.find((n) => n.reason === "value-projection-reduction-exempt");
    expect(exempt).toBeDefined();
    expect(rep.targets.map((t) => t.decl.conceptName)).not.toContain(exempt!.decl.conceptName);
  });

  it("a value-read target with no `type is` DEFAULTS to Observation — viable, no blocker", () => {
    // `Local` (ruleb-cross-lib-composition) is CodeableConcept + code is, no `type is`. It defaults to
    // Observation, whose `value` admits CodeableConcept, so `most recent this` IS applicable — no blocker
    // (panel R2: the emitter defaults the resource, effectiveRepresentation.ts:273).
    const rep = runInventory({
      root: fixture("validator/tests/fixtures/ruleb-cross-lib-composition"),
      exclusions: NONE,
    });
    const local = rep.targets.find((t) => t.decl.conceptName === "Local");
    expect(local).toBeDefined();
    expect(local!.migrationClass).toBe("value-read");
    expect(local!.blockers).toEqual([]);
  });

  it("a bare target inside an EXCLUDED family is enumerated as an excluded-target, not a target", () => {
    const rep = runInventory({
      root: fixture("fhir-emitter/tests/fixtures/cross-lib-activity-missing"),
      exclusions: [{ contains: "/cross-lib-activity-missing/", reason: "intentional-error fixture" }],
    });
    expect(rep.excludedTargets.map((e) => e.decl.conceptName)).toContain("Active Crohns Disease");
    expect(rep.targets.map((t) => t.decl.conceptName)).not.toContain("Active Crohns Disease");
    expect(rep.counts.included + rep.counts.excluded + rep.counts.buildFailed).toBe(rep.counts.discovered);
  });
});

// ---------------------------------------------------------------------------------------------
describe("scan integrity", () => {
  it("a dead exclusion rule (matches 0 files) fails the scan", () => {
    const rep = runInventory({
      root: fixture("cql-emitter/tests/fixtures/code-is-basic"),
      exclusions: [{ contains: "/this/matches/nothing/", reason: "n/a" }],
    });
    expect(rep.failures.some((f) => f.includes("dead exclusion rule"))).toBe(true);
  });

  it("exclusion takes precedence over build state (an excluded broken.crl is excluded, not build-failed)", () => {
    const rep = runInventory({
      root: fixture("imports/tests/fixtures/source-path-parse-failure"),
      exclusions: [{ contains: "/source-path-parse-failure/", reason: "intentional parse-failure fixture" }],
    });
    const broken = rep.census.find((c) => c.filePath.endsWith("broken.crl"));
    expect(broken?.category).toBe("excluded");
    expect(rep.counts.buildFailed).toBe(0);
  });

  it("FULL repo scan with the shipped manifest is clean — no dead rules, closed set, reconciled", () => {
    // This is the T7-staleness-gate basis: the real manifest over the whole repo. It also proves the
    // manifest has no dead rules against the tree (panel R1 Claude #9).
    const rep = runInventory({ root: REPO_ROOT, exclusions: THIS_REPO_EXCLUSIONS });
    expect(rep.failures).toEqual([]);
    expect(rep.reconcile.ok).toBe(true);
    expect(rep.counts.included + rep.counts.excluded + rep.counts.buildFailed).toBe(rep.counts.discovered);
  });
});
