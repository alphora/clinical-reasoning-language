import { describe, expect, it } from "@jest/globals";

import type {
  Action,
  Activity,
  ActivityType,
  BlockBody,
  Concept,
  ConceptType,
  Decision,
  RecommendActivity,
  UseDecision,
  WhenBlock,
  WhenBlockBody,
} from "../../ast/types";
import { libraryCanonicalUrl } from "../library";
import {
  type ActivityResolver,
  type ConceptResolver,
  type DecisionResolver,
  emitDecisionPlanDefinition,
  emitDecisionPlanDefinitionsForLibrary,
  planDefinitionCanonicalUrl,
} from "../decision";
import { recommendationDefinitionCanonicalUrl } from "../recommendation";
import type { CpgMetadata } from "../types";

const LOC = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const;
const FIXED_CLOCK = () => new Date("2026-06-04T15:30:00.000Z");

const METADATA: CpgMetadata = {
  version: "1.0.0",
  name: "lib",
  title: "Lib",
  description: "Test library",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/sdh/demo",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const RESOLVE_ALL: ConceptResolver = (ref) => (typeof ref === "string" ? ref : ref.name);
const RESOLVE_ACT_OK: ActivityResolver = (ref) =>
  `${METADATA.canonicalBase}/PlanDefinition/lib-${slugifyTest(
    typeof ref === "string" ? ref : ref.name,
  )}-recommendation`;
const RESOLVE_DEC_OK: DecisionResolver = (ref) =>
  `${METADATA.canonicalBase}/PlanDefinition/lib-${slugifyTest(typeof ref === "string" ? ref : ref.name)}`;
const RESOLVE_NONE: () => null = () => null;

function slugifyTest(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function recommend(name: string): RecommendActivity {
  return { type: "RecommendActivity", activityName: name, location: LOC };
}
function useDec(name: string): UseDecision {
  return { type: "UseDecision", decisionName: name, location: LOC };
}
function leaf(action: Action): WhenBlockBody {
  return { type: "ActionStatement", action, location: LOC };
}
function block(qualifier: "any" | "all" | undefined, statements: BlockBody["statements"]): BlockBody {
  const body: BlockBody = {
    type: "BlockBody",
    statements,
    location: LOC,
  };
  if (qualifier !== undefined) body.qualifier = qualifier;
  return body;
}
function when(condition: string, body: WhenBlockBody): WhenBlock {
  return {
    type: "WhenBlock",
    conceptName: condition,
    body,
    location: LOC,
  };
}
function decision(name: string, statements: WhenBlock[]): Decision {
  return {
    type: "Decision",
    name,
    body: { type: "DecisionBody", statements, location: LOC },
    location: LOC,
  };
}
function concept(name: string): Concept {
  return {
    type: "Concept",
    name,
    valueTypes: [],
    conceptType: undefined,
    location: LOC,
  };
}
function activity(name: string): Activity {
  return {
    type: "Activity",
    name,
    body: {
      type: "ActivityBody",
      request: {
        type: "ActivityRequest",
        activityType: "CPGServiceRequest" as ActivityType,
        location: LOC,
      },
      location: LOC,
    },
    location: LOC,
  };
}

/* ─── emitDecisionPlanDefinition — single-decision shape tests ───── */

describe("decision — emitDecisionPlanDefinition Strategy (isRoot=true)", () => {
  it("emits Strategy profile + workflow-definition type when isRoot=true", () => {
    const d = decision("Top", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d,
      "Lib",
      METADATA,
      RESOLVE_ALL,
      RESOLVE_ACT_OK,
      RESOLVE_DEC_OK,
      true,
      { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition",
      "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-publishableplandefinition",
    ]);
    expect((r.type as { coding: Array<{ code: string }> }).coding[0]!.code).toBe("workflow-definition");
  });

  it("does NOT emit version field (no-version rule)", () => {
    const d = decision("Top", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    expect(r.version).toBeUndefined();
  });

  it("emits 3 knowledgeCapability extensions (NOT executable)", () => {
    const d = decision("Top", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const extensions = r.extension as Array<{ url: string; valueCode: string }>;
    const capCodes = extensions
      .filter((e) => e.url.endsWith("/cpg-knowledgeCapability"))
      .map((e) => e.valueCode);
    expect(capCodes).toEqual(["shareable", "computable", "publishable"]);
  });

  it("Strategy property test (round-3 F6): action key set ⊆ allowed set; forbidden 7 absent at all depths", () => {
    const STRATEGY_FORBIDDEN = new Set([
      "type", "groupingBehavior", "requiredBehavior", "precheckBehavior",
      "cardinalityBehavior", "transform", "dynamicValue",
    ]);
    const STRATEGY_ALLOWED = new Set([
      "title", "description", "code", "condition", "definitionCanonical",
      "action", "extension", "input", "output", "relatedAction", "selectionBehavior",
    ]);
    const STRATEGY_REQUIRED = new Set(["title", "description", "code"]);
    const d = decision("Top", [
      when("C1", block(undefined, [when("C2", leaf(recommend("A")))])),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    function walk(actions: Array<Record<string, unknown>>): void {
      for (const a of actions) {
        for (const key of Object.keys(a)) {
          expect(STRATEGY_FORBIDDEN.has(key)).toBe(false);
          expect(STRATEGY_ALLOWED.has(key)).toBe(true);
        }
        for (const required of STRATEGY_REQUIRED) {
          expect(a).toHaveProperty(required);
        }
        if (a.action) walk(a.action as Array<Record<string, unknown>>);
      }
    }
    walk(r.action as Array<Record<string, unknown>>);
  });
});

describe("decision — emitDecisionPlanDefinition Sub-decision (isRoot=false)", () => {
  it("emits publishable-only profile + eca-rule type", () => {
    const d = decision("Sub", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, false, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-publishableplandefinition",
    ]);
    expect((r.type as { coding: Array<{ code: string }> }).coding[0]!.code).toBe("eca-rule");
  });
});

/* ─── Action tree mapping ────────────────────────────────────────── */

describe("decision — action tree mapping", () => {
  it("WhenBlock condition becomes action.condition with text/cql-identifier", () => {
    const d = decision("D", [when("My Concept", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const action = (r.action as Array<Record<string, unknown>>)[0]!;
    const cond = (action.condition as Array<{ kind: string; expression: { language: string; expression: string } }>)[0]!;
    expect(cond.kind).toBe("applicability");
    expect(cond.expression.language).toBe("text/cql-identifier");
    expect(cond.expression.expression).toBe("My Concept");
  });

  it("recommend activity X → definitionCanonical = Recommendation URL", () => {
    const d = decision("D", [when("C", leaf(recommend("Colonoscopy")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const action = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(action.definitionCanonical).toBe(RESOLVE_ACT_OK("Colonoscopy"));
  });

  it("use decision Y → definitionCanonical = sub-decision PlanDef URL", () => {
    const d = decision("D", [when("C", leaf(useDec("OtherDecision")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const action = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(action.definitionCanonical).toBe(RESOLVE_DEC_OK("OtherDecision"));
  });

  it("nested when/then → nested action.action[]", () => {
    const d = decision("D", [
      when("Outer", block(undefined, [when("Inner", leaf(recommend("A")))])),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const outer = (r.action as Array<Record<string, unknown>>)[0]!;
    expect((outer.condition as Array<{ expression: { expression: string } }>)[0]!.expression.expression).toBe("Outer");
    const inner = (outer.action as Array<Record<string, unknown>>)[0]!;
    expect((inner.condition as Array<{ expression: { expression: string } }>)[0]!.expression.expression).toBe("Inner");
    expect(inner.definitionCanonical).toBe(RESOLVE_ACT_OK("A"));
  });

  it("any: qualifier emits crl-logical-switch extension on parent action with URL from canonicalBase", () => {
    const d = decision("D", [
      when("Outer", block("any", [
        when("InnerA", leaf(recommend("A"))),
        when("InnerB", leaf(recommend("B"))),
      ])),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const outer = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(outer.extension).toEqual([
      {
        url: `${METADATA.canonicalBase}/StructureDefinition/crl-logical-switch`,
        valueBoolean: true,
      },
    ]);
  });

  it("all: or no qualifier → no crl-logical-switch extension", () => {
    const d = decision("D", [
      when("Outer", block("all", [when("Inner", leaf(recommend("A")))])),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const outer = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(outer.extension).toBeUndefined();
  });
});

/* ─── Cascade-suppression rules ──────────────────────────────────── */

describe("decision — cascade-suppression rules", () => {
  it("rule 1: unresolved concept suppresses entire WhenBlock + unresolved-concept UnmatchedReference", () => {
    const d = decision("D", [when("Missing Concept", leaf(recommend("A")))]);
    const { resource, unmatched } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_NONE as ConceptResolver, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(unmatched.some((u) => u.kind === "unresolved-concept")).toBe(true);
    // Only one WhenBlock → root suppressed entirely.
    expect(resource).toBeNull();
  });

  it("rule 2: unresolved activity ref suppresses the WhenBlock + unresolved-activity", () => {
    const d = decision("D", [when("C", leaf(recommend("Missing")))]);
    const { resource, unmatched } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_NONE as ActivityResolver, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(unmatched.some((u) => u.kind === "unresolved-activity")).toBe(true);
    expect(resource).toBeNull();
  });

  it("rule 3: mixed children (some emit, some suppress) → emit parent with survivors, NO cascade diagnostic", () => {
    // Mixed: concept "Present" resolves, "Missing" doesn't.
    const mixedResolver: ConceptResolver = (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      return name === "Missing" ? null : name;
    };
    const d = decision("D", [
      when("Outer", block(undefined, [
        when("Missing", leaf(recommend("A"))),
        when("Present", leaf(recommend("B"))),
      ])),
    ]);
    const { resource, errors, unmatched } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, mixedResolver, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(resource).not.toBeNull();
    expect(unmatched.some((u) => u.kind === "unresolved-concept")).toBe(true);
    // NO aggregate cascade warning for mixed case.
    expect(errors.some((e) => e.kind === "unresolved-reference-cascade-suppression")).toBe(false);
    const r = resource!.resource as Record<string, unknown>;
    const outer = (r.action as Array<Record<string, unknown>>)[0]!;
    const children = outer.action as Array<Record<string, unknown>>;
    expect(children).toHaveLength(1);
    expect((children[0]!.condition as Array<{ expression: { expression: string } }>)[0]!.expression.expression).toBe("Present");
  });

  it("rule 4: all children suppress → parent suppressed + unresolved-reference-cascade-suppression warning", () => {
    const d = decision("D", [
      when("Outer", block(undefined, [
        when("Missing1", leaf(recommend("A"))),
        when("Missing2", leaf(recommend("B"))),
      ])),
    ]);
    const onlyOuterResolves: ConceptResolver = (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      return name === "Outer" ? name : null;
    };
    const { resource, errors } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, onlyOuterResolves, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(errors.some((e) => e.kind === "unresolved-reference-cascade-suppression")).toBe(true);
    // The outer WhenBlock's only child is suppressed → outer cascade-suppresses too →
    // root has zero surviving actions → strategy-root-cascade-suppressed + skip.
    expect(resource).toBeNull();
    expect(errors.some((e) => e.kind === "strategy-root-cascade-suppressed")).toBe(true);
  });

  it("rule 6: all top-level actions cascade-suppressed → strategy-root-cascade-suppressed + skip resource", () => {
    const d = decision("D", [when("Missing", leaf(recommend("A")))]);
    const { resource, errors } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_NONE as ConceptResolver, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(resource).toBeNull();
    expect(errors.some((e) => e.kind === "strategy-root-cascade-suppressed")).toBe(true);
  });

  it("rule 5: top-level mixed → resource emits with surviving actions only", () => {
    const mixed: ConceptResolver = (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      return name === "Missing" ? null : name;
    };
    const d = decision("D", [
      when("Missing", leaf(recommend("A"))),
      when("Present", leaf(recommend("B"))),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, mixed, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(resource).not.toBeNull();
    const r = resource!.resource as Record<string, unknown>;
    const actions = r.action as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(1);
    expect((actions[0]!.condition as Array<{ expression: { expression: string } }>)[0]!.expression.expression).toBe("Present");
  });
});

/* ─── Closure-level wrapper ──────────────────────────────────────── */

describe("decision — emitDecisionPlanDefinitionsForLibrary", () => {
  it("classifies root vs sub via dependency graph", () => {
    const root = decision("Root", [when("C1", leaf(useDec("Sub")))]);
    const sub = decision("Sub", [when("C2", leaf(recommend("A")))]);
    const acts = [activity("A")];
    const cons = [concept("C1"), concept("C2")];
    const { resources, errors } = emitDecisionPlanDefinitionsForLibrary(
      [root, sub], acts, cons, "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors).toEqual([]);
    expect(resources).toHaveLength(2);
    const byId = new Map(resources.map((r) => [(r.resource as { id: string }).id, r.resource as Record<string, unknown>]));
    const rootR = byId.get("lib-root")!;
    const subR = byId.get("lib-sub")!;
    expect((rootR.meta as { profile: string[] }).profile).toContain("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition");
    expect((subR.meta as { profile: string[] }).profile).not.toContain("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition");
    expect((subR.meta as { profile: string[] }).profile).toEqual(["http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-publishableplandefinition"]);
  });

  it("Strategy → Sub-decision reference uses planDefinitionCanonicalUrl (byte-equality)", () => {
    const root = decision("Root", [when("C1", leaf(useDec("Sub")))]);
    const sub = decision("Sub", [when("C2", leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [root, sub], [activity("A")], [concept("C1"), concept("C2")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    const rootR = (resources.find((r) => (r.resource as { id: string }).id === "lib-root")!.resource as Record<string, unknown>);
    const action = (rootR.action as Array<Record<string, unknown>>)[0]!;
    expect(action.definitionCanonical).toBe(planDefinitionCanonicalUrl(METADATA.canonicalBase, "Lib", "Sub"));
  });

  it("Recommend activity in decision → definitionCanonical = recommendationDefinitionCanonicalUrl", () => {
    const d = decision("D", [when("C", leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    const r = resources[0]!.resource as Record<string, unknown>;
    const action = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(action.definitionCanonical).toBe(recommendationDefinitionCanonicalUrl(METADATA.canonicalBase, "Lib", "A"));
  });

  it("library[0] byte-equals libraryCanonicalUrl", () => {
    const d = decision("D", [when("C", leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    const r = resources[0]!.resource as Record<string, unknown>;
    expect((r.library as string[])[0]).toBe(libraryCanonicalUrl(METADATA.canonicalBase, "Lib"));
  });

  it("cycle: A → B → A → circular-decision-reference + skip both", () => {
    const a = decision("A", [when("C", leaf(useDec("B")))]);
    const b = decision("B", [when("C", leaf(useDec("A")))]);
    const { resources, errors } = emitDecisionPlanDefinitionsForLibrary(
      [a, b], [], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors.some((e) => e.kind === "circular-decision-reference")).toBe(true);
    expect(resources).toHaveLength(0);
  });

  it("empty-strategy-entrypoint fires ONLY when acyclic + no root + decisions exist", () => {
    // Two decisions, each referenced by the other — that's a cycle.
    // empty-strategy-entrypoint should NOT fire; circular-decision-reference does.
    const a = decision("A", [when("C", leaf(useDec("B")))]);
    const b = decision("B", [when("C", leaf(useDec("A")))]);
    const { errors } = emitDecisionPlanDefinitionsForLibrary(
      [a, b], [], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors.some((e) => e.kind === "empty-strategy-entrypoint")).toBe(false);
    expect(errors.some((e) => e.kind === "circular-decision-reference")).toBe(true);
  });

  it("intra-Decision slug collision: two decisions slugify identically → slug-collision + skip both", () => {
    const a = decision("Foo Bar", [when("C", leaf(recommend("X")))]);
    const b = decision("foo bar", [when("C", leaf(recommend("X")))]);
    const { resources, errors } = emitDecisionPlanDefinitionsForLibrary(
      [a, b], [activity("X")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors.some((e) => e.kind === "slug-collision")).toBe(true);
    expect(resources).toHaveLength(0);
  });

  it("same-library qualified ref `\"Lib\".\"C\"` is treated as local (matches validator)", () => {
    const d = decision("D", [when({ libraryName: "Lib", name: "C" }, leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(resources).toHaveLength(1);
    const action = ((resources[0]!.resource as { action: Array<Record<string, unknown>> }).action)[0]!;
    expect((action.condition as Array<{ expression: { expression: string } }>)[0]!.expression.expression).toBe("C");
  });

  it("true cross-library qualified ref → unresolved-decision (Todo 4 will resolve)", () => {
    const d = decision("D", [when("C", leaf(useDec({ libraryName: "OtherLib", name: "X" })))]);
    const { resources, unmatched } = emitDecisionPlanDefinitionsForLibrary(
      [d], [], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(unmatched.some((u) => u.kind === "unresolved-decision")).toBe(true);
    // Root cascade-suppressed since the only action's leaf is unresolved.
    expect(resources).toHaveLength(0);
  });

  it("libraryName contract: when slug ≠ name (`\"My Library\"` vs `my-library`), qualified ref still resolves locally", () => {
    const d = decision("D", [when({ libraryName: "My Library", name: "C" }, leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "My Library", METADATA, { clock: FIXED_CLOCK },
    );
    expect(resources).toHaveLength(1);
  });
});
