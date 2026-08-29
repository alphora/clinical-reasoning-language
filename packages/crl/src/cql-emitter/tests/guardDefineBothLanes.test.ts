import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../../imports/emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";

/**
 * #189 — the SYNTHETIC GUARD DEFINE, verified where it actually fails: ACROSS THE TWO LANES.
 *
 * Under an ordered `first:`, a later branch carries the negation of its priors' guards. `not G` lowers
 * directly for an atom, a `not <atom>`, and an `or` of atoms; every other shape is NAMED and the name
 * negated, because `$apply` ANDs an action's conditions and cannot express a disjunction.
 *
 * ⚠ The failure this file exists to catch is not a wrong condition — it is a MISSING define. The FHIR lane
 * writes `not "<Lib>"."Guard L…C…"` while the CQL lane emits no such define, and `$apply` treats a dangling
 * condition as NOT-APPLICABLE: the later arm fires unconditionally and DENIES on unknown, which is the exact
 * defect the named-define form removes. That is invisible to either lane alone, and it happened (the first
 * implementation emitted from the `Decision` statement, which classifies to NO layer). So the load-bearing
 * assertion here is the cross-lane one: every guard the PlanDefinitions reference EXISTS as a define.
 */
const FIXTURE = path.resolve(__dirname, "fixtures/guard-define/guard-define.crl");

const GUARD_RE = /Guard L\d+C\d+/g;

interface Lanes {
  readonly cql: string;
  readonly planDefinitions: Record<string, unknown>[];
}

function bothLanes(): Lanes {
  const q = emitCQLImports(FIXTURE);
  expect(q.success, JSON.stringify(q.importDiagnostics ?? []).slice(0, 900)).toBe(true);
  const cql = (q.cqlByLibrary ?? []).map((l) => l.cql).join("\n\n");
  const f = emitFhirDefFromPath(FIXTURE, { date: new Date("2026-01-01T00:00:00.000Z") });
  expect(f.success, JSON.stringify(f.errors ?? [])).toBe(true);
  const planDefinitions = (f.resources ?? [])
    .map((r) => (r as { resource?: Record<string, unknown> }).resource ?? (r as Record<string, unknown>))
    .filter((r) => r.resourceType === "PlanDefinition");
  return { cql, planDefinitions };
}

/** Every `Guard L…C…` name the FHIR lane references, across all emitted PlanDefinitions. */
function referencedGuards(planDefinitions: Record<string, unknown>[]): Set<string> {
  const out = new Set<string>();
  for (const m of JSON.stringify(planDefinitions).matchAll(GUARD_RE)) out.add(m[0]);
  return out;
}

/** Every `Guard L…C…` name the CQL lane DEFINES. */
function definedGuards(cql: string): Set<string> {
  const out = new Set<string>();
  for (const m of cql.matchAll(/define "(Guard L\d+C\d+)":/g)) out.add(m[1]!);
  return out;
}

describe("#189 — synthetic guard defines agree across the CQL and FHIR lanes", () => {
  it("every guard the FHIR lane references EXISTS as a define in the emitted CQL", () => {
    const { cql, planDefinitions } = bothLanes();
    const referenced = [...referencedGuards(planDefinitions)].sort();
    const defined = definedGuards(cql);
    expect(referenced.length, "fixture must exercise the named-define form").toBeGreaterThan(0);
    expect(referenced.filter((g) => !defined.has(g))).toEqual([]);
  });

  it("no define is emitted that nothing references — an orphan means the two dispatches disagree", () => {
    const { cql, planDefinitions } = bothLanes();
    const referenced = referencedGuards(planDefinitions);
    expect([...definedGuards(cql)].filter((g) => !referenced.has(g))).toEqual([]);
  });

  it("each shape that cannot lower directly gets EXACTLY ONE exclusion condition, never zero", () => {
    // Zero is the pause-killer: an `otherwise` with no conditions is UNCONDITIONAL, and an unconditional
    // arm fires when the prior is UNKNOWN. Four decisions, four `otherwise` arms, four exclusions.
    const { planDefinitions } = bothLanes();
    const byName = new Map(planDefinitions.map((p) => [String(p.name ?? ""), p]));
    for (const decision of ["Andprior", "Notorprior", "Mixedorprior", "Nestedprior"]) {
      const pd = [...byName.entries()].find(([n]) => n.endsWith(decision))?.[1];
      expect(pd, `PlanDefinition for ${decision}`).toBeDefined();
      const guards = [...JSON.stringify(pd).matchAll(/not \\"[^"]*\\"\.\\"(Guard L\d+C\d+)\\"/g)];
      expect(guards.length, `${decision} must carry one named exclusion`).toBe(1);
    }
  });

  it("the define body is STRONG KLEENE — bare leaves, so an unknown operand makes the guard unknown", () => {
    const { cql } = bothLanes();
    const bodies = [...cql.matchAll(/define "Guard L\d+C\d+":\n\s*(.+)/g)].map((m) => m[1]!);
    expect(bodies.length).toBeGreaterThan(0);
    // A `Coalesce` here would read an unanswered question as an answered "no" — the pause-killer, one
    // layer down. Totality belongs at the arm, never per operand.
    for (const body of bodies) expect(body).not.toMatch(/Coalesce/);
  });
});
