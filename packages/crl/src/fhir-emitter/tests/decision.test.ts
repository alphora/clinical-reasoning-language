import { describe, expect, it } from "vitest";

import type {
  Action,
  ActionStatement,
  Activity,
  ActivityType,
  BlockBody,
  BlockQualifier,
  BranchBlock,
  BranchCondition,
  Concept,
  ConceptType,
  Decision,
  OtherwiseBlock,
  RecommendActivity,
  UseDecision,
  WhenBlock,
  WhenBlockBody,
} from "../../ast/types";
import { libraryCanonicalUrl, libraryId } from "../library";
import {
  type ActivityResolver,
  type CaseFeatureInputResolver,
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
// #224 iii.1 — a menu ActionStatement carrying an `unless`/`only when` guard. `guardRef`
// is bare (string) or qualified (`{libraryName,name}`). `guardLoc` lets a test pin the
// diagnostic location distinctly from the statement location.
const GUARD_LOC = { start: { line: 7, column: 3 }, end: { line: 7, column: 3 } } as const;
function guarded(
  action: Action,
  polarity: "unless" | "only-when",
  guardRef: string | { libraryName: string; name: string },
): ActionStatement {
  return {
    type: "ActionStatement",
    action,
    guard: { type: "ActionGuard", polarity, conceptName: guardRef, location: GUARD_LOC },
    location: LOC,
  };
}
function block(qualifier: BlockQualifier | undefined, statements: BlockBody["statements"]): BlockBody {
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
    condition: { type: "BranchConditionRef", ref: condition, location: LOC },
    body,
    location: LOC,
  };
}
// #224 compound-guard condition builders.
function refC(ref: string): BranchCondition {
  return { type: "BranchConditionRef", ref, location: LOC };
}
function andC(...operands: BranchCondition[]): BranchCondition {
  return { type: "BranchConditionAnd", operands, location: LOC };
}
function orC(...operands: BranchCondition[]): BranchCondition {
  return { type: "BranchConditionOr", operands, location: LOC };
}
function whenC(condition: BranchCondition, body: WhenBlockBody): WhenBlock {
  return { type: "WhenBlock", condition, body, location: LOC };
}
function otherwise(body: WhenBlockBody): OtherwiseBlock {
  return { type: "OtherwiseBlock", body, location: LOC };
}
function decision(name: string, statements: BranchBlock[], qualifier?: BlockQualifier): Decision {
  return {
    type: "Decision",
    name,
    body: {
      type: "DecisionBody",
      statements,
      location: LOC,
      ...(qualifier !== undefined ? { qualifier } : {}),
    },
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
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableplandefinition",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishableplandefinition",
    ]);
    expect((r.type as { coding: Array<{ code: string }> }).coding[0]!.code).toBe("workflow-definition");
  });


  it("emits `version` from package.json (CRMI shareable floor)", () => {
    const d = decision("Top", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    expect(r.version).toBe("1.0.0");
  });

  it("emits 3 knowledgeCapability extensions (NOT executable)", () => {
    const d = decision("Top", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    const extensions = r.extension as Array<{ url: string; valueCode: string }>;
    const capCodes = extensions
      .filter((e) => e.url.endsWith("/cqf-knowledgeCapability"))
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
    // Use a `first:` decision so the walk also covers the synthetic top-level switch
    // WRAPPER (the one new action shape this lane introduces at the root) — its key
    // set must stay ⊆ allowed with the required trio present, at every depth.
    const d = decision(
      "Top",
      [when("C1", block(undefined, [when("C2", leaf(recommend("A")))])), otherwise(leaf(recommend("B")))],
      "first",
    );
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
  it("emits additive CRMI plandefinition profiles (no CPG strategy profile) + eca-rule type", () => {
    const d = decision("Sub", [when("C", leaf(recommend("A")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, false, { clock: FIXED_CLOCK },
    );
    const r = resource!.resource as Record<string, unknown>;
    expect((r.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableplandefinition",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishableplandefinition",
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

  // Menu `any:` (a "pick one of these" selection, NOT ordered first-applicable) keeps
  // the phase-1 crl-logical-switch stand-in until its FHIR selection semantics are
  // settled (GitHub #184) — deliberately NOT migrated to cqf-applicabilityBehavior,
  // which would assert the wrong operational meaning on a selection group.
  it("any: qualifier keeps the crl-logical-switch stand-in (deferred to #184)", () => {
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

/* ─── Per-action guards (`unless` / `only when`) — #224 iii.1 ─────── */

describe("decision — per-action guard emit (#224 iii.1)", () => {
  // The qualifier the negated form uses = the PD's `library[]` target name. Tests call
  // emitDecisionPlanDefinition with libraryReferenceSuffix defaulting to undefined, so the
  // qualifier is the name-keeping Root name for this metadata.
  const Q = libraryId(METADATA, undefined);

  type Cond = { kind: string; expression: { language: string; expression: string } };
  // Depth-first find of the first action with the given title in a PlanDefinition tree.
  function findAction(r: Record<string, unknown>, title: string): Record<string, unknown> | undefined {
    const stack = [...((r.action as Array<Record<string, unknown>>) ?? [])];
    while (stack.length) {
      const a = stack.pop()!;
      if (a.title === title) return a;
      if (a.action) stack.push(...(a.action as Array<Record<string, unknown>>));
    }
    return undefined;
  }
  // A decision whose `when "Top"` body is a one-item `any:` menu holding the guarded action.
  function guardedMenu(item: ActionStatement): Decision {
    return decision("D", [when("Top", block("any", [item]))], "first");
  }
  function emitGuarded(
    d: Decision,
    opts: { concept?: ConceptResolver; input?: CaseFeatureInputResolver; lib?: string } = {},
  ) {
    return emitDecisionPlanDefinition(
      d,
      opts.lib ?? "Lib",
      METADATA,
      opts.concept ?? RESOLVE_ALL,
      RESOLVE_ACT_OK,
      RESOLVE_DEC_OK,
      true,
      { clock: FIXED_CLOCK },
      undefined,
      opts.input ?? (() => []),
    );
  }

  it("`only when C` → positive text/cql-identifier (bare, byte-identical to a when atom)", () => {
    const { resource } = emitGuarded(guardedMenu(guarded(recommend("A"), "only-when", "Eligible")));
    const cond = (findAction(resource!.resource as Record<string, unknown>, "A")!.condition as Cond[])[0]!;
    expect(cond.kind).toBe("applicability");
    expect(cond.expression.language).toBe("text/cql-identifier");
    expect(cond.expression.expression).toBe("Eligible");
  });

  it("`unless C` (multi-word) → negated `not Coalesce(\"<Lib>\".\"<name>\", false)`", () => {
    const { resource } = emitGuarded(
      guardedMenu(guarded(recommend("A"), "unless", "Has Antihypertensive Contraindication")),
    );
    const cond = (findAction(resource!.resource as Record<string, unknown>, "A")!.condition as Cond[])[0]!;
    expect(cond.kind).toBe("applicability");
    expect(cond.expression.language).toBe("text/cql-expression");
    // library-qualified (cqf's synthetic expression library resolves the concept there,
    // disc 310) + Coalesce (null-safe two-valued, matches CRE — disc 310 round 2).
    expect(cond.expression.expression).toBe(
      `not Coalesce("${Q}"."Has Antihypertensive Contraindication", false)`,
    );
  });

  it("an UNGUARDED menu action emits no condition[] (byte-unchanged from pre-iii.1)", () => {
    const { resource } = emitGuarded(decision("D", [when("Top", block("any", [leaf(recommend("A"))]))], "first"));
    const a = findAction(resource!.resource as Record<string, unknown>, "A")!;
    expect(a.condition).toBeUndefined();
    expect(a.definitionCanonical).toBe(RESOLVE_ACT_OK("A"));
  });

  it("resolves BOTH an unresolved guard AND an unresolved leaf; suppresses the item; guard diag at guard.location", () => {
    const conceptResolver: ConceptResolver = (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      return name === "Missing Guard" ? null : name;
    };
    const activityResolver: ActivityResolver = (ref) =>
      (typeof ref === "string" ? ref : ref.name) === "Missing Act" ? null : RESOLVE_ACT_OK(ref);
    const d = guardedMenu(guarded(recommend("Missing Act"), "unless", "Missing Guard"));
    const { unmatched } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, conceptResolver, activityResolver, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const guardIdx = unmatched.findIndex((u) => u.kind === "unresolved-concept" && u.text.includes("Missing Guard"));
    const leafIdx = unmatched.findIndex((u) => u.text.includes("Missing Act"));
    expect(guardIdx).toBeGreaterThanOrEqual(0); // report-everything: both surface
    expect(leafIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(leafIdx); // guard resolved (and diagnosed) BEFORE the leaf
    expect(unmatched[guardIdx]!.line).toBe(GUARD_LOC.start.line); // diagnostic at the guard's own span
  });

  it("adds the guard concept as action.input[] (case-feature parity with a when atom)", () => {
    const inputResolver: CaseFeatureInputResolver = (name) =>
      name === "Has Contraindication"
        ? [{ name: "Has Contraindication", canonical: "http://example.org/sd/has-contra" }]
        : [];
    const { resource } = emitGuarded(
      guardedMenu(guarded(recommend("A"), "unless", "Has Contraindication")),
      { input: inputResolver },
    );
    const a = findAction(resource!.resource as Record<string, unknown>, "A")!;
    const inputs = a.input as Array<{ profile: string[] }>;
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.profile).toEqual(["http://example.org/sd/has-contra"]);
  });

  it("self-qualified `unless MyLib.\"C\"` inside MyLib normalizes to bare C (condition parity, F5)", () => {
    const d = guardedMenu(guarded(recommend("A"), "unless", { libraryName: "MyLib", name: "Contra" }));
    const { resource } = emitGuarded(d, { lib: "MyLib" });
    const cond = (findAction(resource!.resource as Record<string, unknown>, "A")!.condition as Cond[])[0]!;
    // normalized to bare `Contra`, then qualified with the emitting library's PD-target name.
    expect(cond.expression.expression).toBe(
      `not Coalesce("${libraryId(METADATA, undefined)}"."Contra", false)`,
    );
  });

  it("`only when C` also contributes action.input[] (shared case-feature path)", () => {
    const inputResolver: CaseFeatureInputResolver = (name) =>
      name === "Eligible" ? [{ name: "Eligible", canonical: "http://example.org/sd/eligible" }] : [];
    const { resource } = emitGuarded(guardedMenu(guarded(recommend("A"), "only-when", "Eligible")), {
      input: inputResolver,
    });
    const inputs = (findAction(resource!.resource as Record<string, unknown>, "A")!.input as Array<{
      profile: string[];
    }>);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.profile).toEqual(["http://example.org/sd/eligible"]);
  });

  it("a guarded `use decision` member lowers its guard + resolves the sub-decision leaf", () => {
    const { resource } = emitGuarded(guardedMenu(guarded(useDec("Sub"), "unless", "Blocker")));
    const a = findAction(resource!.resource as Record<string, unknown>, "Sub")!;
    expect((a.condition as Cond[])[0]!.expression.expression).toBe(`not Coalesce("${Q}"."Blocker", false)`);
    expect(a.definitionCanonical).toBe(RESOLVE_DEC_OK("Sub"));
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

  it("rule 4 + 7 (round-6): all-the-way-up cascade fires decision-cascade-suppressed ONLY (no separate cascade warning per level)", () => {
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
    // Per Rule 7: cascade-suppression goes all the way up to root →
    // decision-cascade-suppressed fires; no intermediate cascade-warning
    // (those are subsumed by the root-level error).
    expect(errors.filter((e) => e.kind === "unresolved-reference-cascade-suppression")).toHaveLength(0);
    expect(resource).toBeNull();
    expect(errors.some((e) => e.kind === "decision-cascade-suppressed")).toBe(true);
  });

  it("rule 4 + 7 (round-6): mixed top-level (cascade + survive) emits ONE cascade warning at the cascade root", () => {
    // Top-level has 2 WhenBlocks: "CascadeBranch" whose subtree all
    // suppresses + "SurvivingBranch" that emits. The cascade warning
    // fires at CascadeBranch (its parent — the decision itself —
    // does NOT cascade).
    const d = decision("D", [
      when("CascadeBranch", block(undefined, [
        when("Missing1", leaf(recommend("A"))),
        when("Missing2", leaf(recommend("B"))),
      ])),
      when("SurvivingBranch", leaf(recommend("C"))),
    ]);
    const partial: ConceptResolver = (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      return name.startsWith("Missing") ? null : name;
    };
    const { resource, errors } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, partial, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(resource).not.toBeNull();
    // Exactly 1 cascade warning — at CascadeBranch, the cascade root.
    expect(errors.filter((e) => e.kind === "unresolved-reference-cascade-suppression")).toHaveLength(1);
    // The 2 unresolved-concept UnmatchedReferences ARE collected (rule 1 fires per concept).
  });

  it("rule 7 (round-6 Claude): deeply-nested all-suppress emits ZERO mid-tree cascade warnings (decision-cascade-suppressed subsumes)", () => {
    // Outer → Mid1 → [Leaf1, Leaf2] + Mid2 → [Leaf3, Leaf4]; all 4 leaves unresolved.
    // Pre-fix bug emitted 3 cascade warnings (Mid1, Mid2, Outer) + 1 decision-cascade.
    // Post-fix: 0 cascade warnings + 1 decision-cascade.
    const d = decision("D", [
      when("Outer", block(undefined, [
        when("Mid1", block(undefined, [
          when("MissingLeaf1", leaf(recommend("A"))),
          when("MissingLeaf2", leaf(recommend("B"))),
        ])),
        when("Mid2", block(undefined, [
          when("MissingLeaf3", leaf(recommend("C"))),
          when("MissingLeaf4", leaf(recommend("D"))),
        ])),
      ])),
    ]);
    const partial: ConceptResolver = (ref) => {
      const name = typeof ref === "string" ? ref : ref.name;
      return name.startsWith("Missing") ? null : name;
    };
    const { errors } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, partial, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(errors.filter((e) => e.kind === "unresolved-reference-cascade-suppression")).toHaveLength(0);
    expect(errors.filter((e) => e.kind === "decision-cascade-suppressed")).toHaveLength(1);
  });

  it("rule 6: all top-level actions cascade-suppressed → decision-cascade-suppressed + skip resource", () => {
    const d = decision("D", [when("Missing", leaf(recommend("A")))]);
    const { resource, errors } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_NONE as ConceptResolver, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    expect(resource).toBeNull();
    expect(errors.some((e) => e.kind === "decision-cascade-suppressed")).toBe(true);
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
    expect((subR.meta as { profile: string[] }).profile).toEqual([
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareableplandefinition",
      "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishableplandefinition",
    ]);
  });

  it("Strategy → Sub-decision reference uses planDefinitionCanonicalUrl (byte-equality)", () => {
    const root = decision("Root", [when("C1", leaf(useDec("Sub")))]);
    const sub = decision("Sub", [when("C2", leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [root, sub], [activity("A")], [concept("C1"), concept("C2")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    const rootR = (resources.find((r) => (r.resource as { id: string }).id === "lib-root")!.resource as Record<string, unknown>);
    const action = (rootR.action as Array<Record<string, unknown>>)[0]!;
    expect(action.definitionCanonical).toBe(planDefinitionCanonicalUrl(METADATA, "Sub"));
  });

  it("Recommend activity in decision → definitionCanonical = recommendationDefinitionCanonicalUrl", () => {
    const d = decision("D", [when("C", leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    const r = resources[0]!.resource as Record<string, unknown>;
    const action = (r.action as Array<Record<string, unknown>>)[0]!;
    expect(action.definitionCanonical).toBe(recommendationDefinitionCanonicalUrl(METADATA, "A"));
  });

  it("library[0] byte-equals libraryCanonicalUrl", () => {
    const d = decision("D", [when("C", leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    const r = resources[0]!.resource as Record<string, unknown>;
    expect((r.library as string[])[0]).toBe(libraryCanonicalUrl(METADATA));
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

  it("round-6 C1 regression: foreign-qualified `use decision` does NOT create a phantom local cycle even when name collides", () => {
    // Local decision "A" uses foreign `"OtherLib"."A"`. Pre-fix bug:
    // collectUseDecisions stripped the qualifier → recorded a self-loop
    // on local A → emitted circular-decision-reference. Post-fix: foreign
    // ref is normalized + ignored for graph purposes; cascade-suppression
    // fires from unresolved leaf instead.
    const a = decision("A", [when("C", leaf(useDec({ libraryName: "OtherLib", name: "A" })))]);
    const { errors, unmatched } = emitDecisionPlanDefinitionsForLibrary(
      [a], [], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    expect(errors.some((e) => e.kind === "circular-decision-reference")).toBe(false);
    expect(unmatched.some((u) => u.kind === "unresolved-decision")).toBe(true);
  });

  it("round-6 C1 regression: foreign-qualified `use decision` does NOT misclassify local same-name decision as sub-decision", () => {
    // Root references `"OtherLib"."Sub"` (foreign), and local `Sub` has
    // no incoming refs. Pre-fix bug: foreign edge stripped → recorded
    // phantom Root→Sub edge → local Sub misclassified as sub-decision.
    // Post-fix: both Root and Sub classified as roots.
    const root = decision("Root", [when("C", leaf(useDec({ libraryName: "OtherLib", name: "Sub" })))]);
    const sub = decision("Sub", [when("C", leaf(recommend("X")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [root, sub], [activity("X")], [concept("C")], "Lib", METADATA, { clock: FIXED_CLOCK },
    );
    // Local Sub should be classified as a Strategy (no incoming local refs).
    const subResource = resources.find((r) => (r.resource as { id: string }).id === "lib-sub");
    expect(subResource).toBeDefined();
    const subProfiles = (subResource!.resource as { meta: { profile: string[] } }).meta.profile;
    expect(subProfiles).toContain("http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition");
  });

  it("libraryName contract: when slug ≠ name (`\"My Library\"` vs `my-library`), qualified ref still resolves locally", () => {
    const d = decision("D", [when({ libraryName: "My Library", name: "C" }, leaf(recommend("A")))]);
    const { resources } = emitDecisionPlanDefinitionsForLibrary(
      [d], [activity("A")], [concept("C")], "My Library", METADATA, { clock: FIXED_CLOCK },
    );
    expect(resources).toHaveLength(1);
  });
});

/* ─── otherwise / first emit paths (phase-1 stand-in) ──────────────── */

describe("decision — otherwise and first emit", () => {
  it("first: top-level wraps branches in a cqf-applicabilityBehavior switch group; otherwise is conditionless + LAST", () => {
    const d = decision(
      "Cov",
      [when("Excl", leaf(recommend("Deny"))), otherwise(leaf(recommend("Approve")))],
      "first",
    );
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const root = (resource!.resource as { action: Array<Record<string, unknown>> }).action;
    // first: → ONE grouping action carrying the standard switch extension. It has the
    // title/description/code every action needs (Strategy property invariant).
    expect(root).toHaveLength(1);
    const group = root[0]!;
    expect(group).toHaveProperty("title");
    expect(group).toHaveProperty("description");
    expect(group).toHaveProperty("code");
    expect(group.extension).toEqual([
      { url: "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior", valueString: "any" },
    ]);
    const actions = group.action as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(2);
    // Child ORDER is load-bearing under applicabilityBehavior "any" (first-applicable):
    // the conditioned branch first, the unconditional `otherwise` LAST (true fallthrough).
    expect(actions[0]!.condition).toBeDefined();
    expect(actions[1]!.condition).toBeUndefined();
    expect(actions[1]!.definitionCanonical).toBeDefined();
  });

  it("unresolved leaf under otherwise suppresses that branch but keeps surviving siblings", () => {
    const d = decision(
      "Cov",
      [when("Excl", leaf(recommend("Deny"))), otherwise(leaf(recommend("Missing")))],
      "first",
    );
    const onlyDeny: ActivityResolver = (ref) =>
      (typeof ref === "string" ? ref : ref.name) === "Deny" ? RESOLVE_ACT_OK(ref) : null;
    const { resource, unmatched } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, onlyDeny, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const root = (resource!.resource as { action: Array<Record<string, unknown>> }).action;
    expect(root).toHaveLength(1); // first: wraps even a single survivor (predictable shape)
    const actions = root[0]!.action as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(1); // otherwise suppressed, when survives
    expect(unmatched.some((u) => u.kind === "unresolved-activity")).toBe(true);
  });

  it("first: nested block carries the cqf-applicabilityBehavior extension (branch-switch)", () => {
    const d = decision("Cov", [
      when(
        "C",
        block("first", [
          when("A", leaf(recommend("X"))),
          when("B", leaf(recommend("Y"))),
        ]),
      ),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    // No top-level qualifier → no wrapper; the nested first: block's parent (the
    // `when C` action) IS the grouping action, so it carries the switch extension.
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    const ext = action.extension as Array<{ url: string; valueString?: string }> | undefined;
    expect(ext?.some((e) => e.url.endsWith("/cqf-applicabilityBehavior") && e.valueString === "any")).toBe(true);
  });

  it("all: nested block carries NO extension (emit-neutral)", () => {
    const d = decision("Cov", [
      when(
        "C",
        block("all", [
          when("A", leaf(recommend("X"))),
          when("B", leaf(recommend("Y"))),
        ]),
      ),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(action.extension).toBeUndefined();
  });
});

/* ─── action-level `input` (DTR case-feature, FIRST-CASE scope) ──── */

describe("decision — action-level case-feature `input` (DTR pattern)", () => {
  // A resolver that returns a case-feature SD canonical for a single eligible
  // (LocalPrimitives boolean) concept name, null otherwise — the orchestrator builds
  // exactly this shape.
  const CF_URL = `${METADATA.canonicalBase}/StructureDefinition/lib-active-crohns-disease`;
  const CF_URL_2 = `${METADATA.canonicalBase}/StructureDefinition/lib-severe-flare`;
  // New array contract: each condition resolves to its ORDERED recursive `code is`
  // closure (here each test condition is a single direct `code is` concept → one
  // entry). Returns [] for an ineligible condition.
  // #189 2d — the resolver carries each input's NATURAL resource type (REQUIRED; no Observation fallback).
  const cfResolver: CaseFeatureInputResolver = (name) =>
    name === "Active Crohns Disease"
      ? [{ name: "Active Crohns Disease", canonical: CF_URL, resourceType: "Condition" }]
      : name === "Severe Flare"
        ? [{ name: "Severe Flare", canonical: CF_URL_2, resourceType: "Condition" }]
        : [];

  // A case-feature input carries BOTH the cpg-input-text label and the cpg-input-description
  // (valueMarkdown), per the truth-set example goldens, and its NATURAL resource `type` (#189 2d).
  const cfInput = (name: string, canonical: string, resourceType: string): Record<string, unknown> => ({
    extension: [
      { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text", valueString: `${name}?` },
      { url: "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description", valueMarkdown: name },
    ],
    type: resourceType,
    profile: [canonical],
  });

  function whenQualified(libraryName: string, name: string, body: WhenBlockBody): WhenBlock {
    return {
      type: "WhenBlock",
      condition: {
        type: "BranchConditionRef",
        ref: { type: "QualifiedReference", libraryName, name, location: LOC },
        location: LOC,
      },
      body,
      location: LOC,
    };
  }

  it("a `when` LocalPrimitives-boolean concept gets one action.input with the right profile + cpg-input-text \"<name>?\"", () => {
    const d = decision("Triage", [when("Active Crohns Disease", leaf(recommend("Refer to GI")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", cfResolver,
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(action.input).toEqual([cfInput("Active Crohns Disease", CF_URL, "Condition")]);
  });

  it("#189 2d: the resolver's NATURAL `resourceType` becomes `action.input.type` (no Observation fallback)", () => {
    // The flip resolves `resourceType` from the concept's descriptor (Condition, MedicationRequest, …); it is
    // REQUIRED on every input and there is NO forced-`Observation` fallback (that was the hack). A concept that
    // does not resolve to a gatherable record yields NO input at all (the orchestrator handles that upstream),
    // so an emitted input always carries a type the case-feature lane stands behind.
    const medResolver: CaseFeatureInputResolver = (name) =>
      name === "Active Crohns Disease"
        ? [{ name: "Active Crohns Disease", canonical: CF_URL, resourceType: "MedicationRequest" }]
        : [];
    const d = decision("Triage", [when("Active Crohns Disease", leaf(recommend("Refer to GI")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", medResolver,
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    const inputs = action.input as Array<{ type: string; profile: string[] }>;
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.type).toBe("MedicationRequest"); // the descriptor's natural type, verbatim
    expect(inputs[0]!.profile).toEqual([CF_URL]);
  });

  it("a `when` condition the resolver returns null for (ExternalPrimitives/Inferences — no case-feature SD) gets NO input", () => {
    const d = decision("Triage", [when("Referral Reason", leaf(recommend("Refer to GI")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", cfResolver,
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(action.input).toBeUndefined();
  });

  it("a QUALIFIED (cross-library) `when` ref is skipped — never queries the resolver → no input", () => {
    // Even if the resolver WOULD match the bare name, a qualified ref must NOT
    // produce an input (mirror interfaceSurface's qualified-ref skip).
    const d = decision("Triage", [
      whenQualified("OtherLib", "Active Crohns Disease", leaf(recommend("Refer to GI"))),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", cfResolver,
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(action.input).toBeUndefined();
  });

  it("the default resolver (omitted arg) attaches NO input — keeps cms / per-library callers unchanged", () => {
    const d = decision("Triage", [when("Active Crohns Disease", leaf(recommend("Refer to GI")))]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK },
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(action.input).toBeUndefined();
  });

  it("a NESTED `when` on an eligible LocalPrimitives-boolean concept gets its OWN action.input (no aggregation, any depth)", () => {
    // Both the top `when` AND the nested `when` reference eligible concepts. Each
    // when-action carries its OWN condition's input — the nested one is NOT skipped
    // for being nested, and the top one carries only ITS own input (no descendant
    // aggregation).
    const d = decision("Triage", [
      when(
        "Active Crohns Disease",
        block(undefined, [when("Severe Flare", leaf(recommend("Refer to GI")))]),
      ),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", cfResolver,
    );
    const top = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    // Top carries ONLY its own input (Active Crohns Disease), not the descendant's.
    expect(top.input).toEqual([cfInput("Active Crohns Disease", CF_URL, "Condition")]);
    const child = (top.action as Array<Record<string, unknown>>)[0]!;
    // Nested when-action carries its OWN condition's input.
    expect(child.input).toEqual([cfInput("Severe Flare", CF_URL_2, "Condition")]);
  });

  it("a nested `when` the resolver returns null for gets NO input (its OWN condition is not case-feature-eligible)", () => {
    // Top `when` LocalPrimitives (gets input) nesting a `when` the resolver returns
    // null for. The child's lack of input is because ITS condition is ineligible,
    // NOT because it is nested.
    const d = decision("Triage", [
      when(
        "Active Crohns Disease",
        block(undefined, [when("Referral Reason", leaf(recommend("Refer to GI")))]),
      ),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", cfResolver,
    );
    const top = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(top.input).toBeDefined();
    const child = (top.action as Array<Record<string, unknown>>)[0]!;
    expect(child.input).toBeUndefined();
  });

  it("a SAME-library qualified `when` ref (self-qualified) gets its input — consistent with its condition (F2)", () => {
    // `Lib."Active Crohns Disease"` inside library "Lib" is normalized to bare
    // `Active Crohns Disease` for BOTH the condition and the input — so the input
    // attaches, unlike a genuinely cross-library ref.
    const d = decision("Triage", [
      whenQualified("Lib", "Active Crohns Disease", leaf(recommend("Refer to GI"))),
    ]);
    const { resource } = emitDecisionPlanDefinition(
      d, "Lib", METADATA, RESOLVE_ALL, RESOLVE_ACT_OK, RESOLVE_DEC_OK, true, { clock: FIXED_CLOCK }, "", cfResolver,
    );
    const action = (resource!.resource as { action: Array<Record<string, unknown>> }).action[0]!;
    expect(action.input).toEqual([cfInput("Active Crohns Disease", CF_URL, "Condition")]);
  });
});

/* ─── #224 i.3 — compound-guard structural emit (and / or DNF) ───── */

type Act = Record<string, unknown>;
const acts = (a: unknown): Act[] => (a as { action?: Act[] }).action ?? [];
const rootActions = (resource: { resource: unknown } | null): Act[] =>
  acts(resource!.resource);
const condExprs = (a: Act): string[] =>
  ((a.condition as Array<{ expression: { expression: string } }>) ?? []).map(
    (c) => c.expression.expression,
  );
const hasAnyBehavior = (a: Act): boolean =>
  ((a.extension as Array<{ url: string; valueString?: string }>) ?? []).some(
    (e) => e.url.includes("cqf-applicabilityBehavior") && e.valueString === "any",
  );

function emitTop(d: Decision, inputResolver?: CaseFeatureInputResolver, conceptResolver = RESOLVE_ALL) {
  return emitDecisionPlanDefinition(
    d,
    "Lib",
    METADATA,
    conceptResolver,
    RESOLVE_ACT_OK,
    RESOLVE_DEC_OK,
    true,
    { clock: FIXED_CLOCK },
    "",
    inputResolver,
  );
}

const notC = (operand: BranchCondition): BranchCondition => ({
  type: "BranchConditionNot",
  operand,
  location: LOC,
});

describe("decision — #224 iii.3 negated guard → per-literal FHIR emit", () => {
  // The negated literal's library qualifier (= the emitted PD `library[]` target id).
  const Q = libraryId(METADATA, undefined);
  const condLangs = (a: Act): string[] =>
    ((a.condition as Array<{ expression: { language: string } }>) ?? []).map(
      (c) => c.expression.language,
    );

  it("`A and not B` → ONE arm, positive `A` (cql-identifier) + negated `not Coalesce(...)` (cql-expression)", () => {
    const d = decision(
      "Top",
      [whenC(andC(refC("A"), notC(refC("B"))), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { resource, errors, unmatched } = emitTop(d);
    expect(errors).toEqual([]);
    expect(unmatched).toEqual([]);
    const children = acts(rootActions(resource)[0]); // [A∧¬B arm, otherwise]
    expect(children).toHaveLength(2);
    const arm = children[0]!;
    expect(arm.title).toBe("A and not B");
    expect(condExprs(arm)).toEqual(["A", `not Coalesce("${Q}"."B", false)`]);
    expect(condLangs(arm)).toEqual(["text/cql-identifier", "text/cql-expression"]);
    expect(children[1]!.title).toBe("otherwise");
  });

  it("a single `when not B` → one action, one negated condition, title `not B` (routes through DNF)", () => {
    const d = decision(
      "Top",
      [whenC(notC(refC("B")), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { resource, errors } = emitTop(d);
    expect(errors).toEqual([]);
    const children = acts(rootActions(resource)[0]);
    const arm = children[0]!;
    expect(arm.title).toBe("not B");
    expect(condExprs(arm)).toEqual([`not Coalesce("${Q}"."B", false)`]);
    expect(condLangs(arm)).toEqual(["text/cql-expression"]);
  });

  it("De Morgan: `not (A and B)` → TWO arms of ONE negated literal each (spliced under first:)", () => {
    const d = decision(
      "Top",
      [whenC(notC(andC(refC("A"), refC("B"))), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { resource, errors } = emitTop(d);
    expect(errors).toEqual([]);
    const children = acts(rootActions(resource)[0]); // [¬A arm, ¬B arm, otherwise]
    expect(children.map((c) => c.title)).toEqual(["not A", "not B", "otherwise"]);
    expect(condExprs(children[0]!)).toEqual([`not Coalesce("${Q}"."A", false)`]);
    expect(condExprs(children[1]!)).toEqual([`not Coalesce("${Q}"."B", false)`]);
  });

  it("De Morgan: `not (A or B)` → ONE arm of TWO negated literals (¬A ∧ ¬B)", () => {
    const d = decision(
      "Top",
      [whenC(notC(orC(refC("A"), refC("B"))), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { resource, errors } = emitTop(d);
    expect(errors).toEqual([]);
    const children = acts(rootActions(resource)[0]); // [¬A∧¬B arm, otherwise]
    expect(children[0]!.title).toBe("not A and not B");
    expect(condExprs(children[0]!)).toEqual([
      `not Coalesce("${Q}"."A", false)`,
      `not Coalesce("${Q}"."B", false)`,
    ]);
    expect(children[1]!.title).toBe("otherwise");
  });

  it("De Morgan under flat/no-qualifier: `not (A and B)` → ONE `any` wrapper over the two ¬ arms", () => {
    const d = decision("Top", [whenC(notC(andC(refC("A"), refC("B"))), leaf(recommend("X")))]); // flat
    const top = rootActions(emitTop(d).resource);
    expect(top).toHaveLength(1);
    expect(hasAnyBehavior(top[0]!)).toBe(true);
    const arms = acts(top[0]);
    expect(arms.map((a) => a.title)).toEqual(["not A", "not B"]);
    expect(condExprs(arms[0]!)).toEqual([`not Coalesce("${Q}"."A", false)`]);
  });

  it("a negated atom's concept STILL contributes action.input[] (parity with iii.1 `unless`)", () => {
    const inputResolver: CaseFeatureInputResolver = (name) =>
      name === "B" ? [cf("B", "urn:B")] : [];
    const d = decision("Top", [whenC(notC(refC("B")), leaf(recommend("X")))], "first");
    const arm = acts(rootActions(emitTop(d, inputResolver).resource)[0])[0]!;
    const profiles = (arm.input as Array<{ profile: string[] }>).map((i) => i.profile[0]);
    expect(profiles).toEqual(["urn:B"]);
  });

  it("an unresolved NEGATED atom suppresses the whole guard (parity with positive)", () => {
    const resolveOnlyA: ConceptResolver = (ref) =>
      (typeof ref === "string" ? ref : ref.name) === "A" ? "A" : null;
    const d = decision(
      "Top",
      [whenC(andC(refC("A"), notC(refC("B"))), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { unmatched, resource } = emitTop(d, undefined, resolveOnlyA);
    expect(unmatched.some((u) => u.kind === "unresolved-concept" && u.text === '"B"')).toBe(true);
    const children = acts(rootActions(resource)[0]);
    expect(children).toHaveLength(1); // only `otherwise` survives
    expect(children[0]!.title).toBe("otherwise");
  });
});

describe("decision — #224 i.3 compound-guard structural emit", () => {
  it("`and` guard → ONE action carrying N ANDed applicability conditions", () => {
    const d = decision(
      "Top",
      [whenC(andC(refC("A"), refC("B")), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { resource, unmatched, errors } = emitTop(d);
    expect(unmatched).toEqual([]);
    expect(errors).toEqual([]);
    const children = acts(rootActions(resource)[0]); // under the first: switch wrapper
    expect(children).toHaveLength(2); // [A∧B arm, otherwise]
    expect(condExprs(children[0]!)).toEqual(["A", "B"]);
    expect(children[0]!.definitionCanonical).toContain("lib-x-recommendation");
    expect(children[1]!.title).toBe("otherwise");
  });

  it("`or` guard under `first:` → arms SPLICED as ordered siblings (no wrapper, otherwise not starved)", () => {
    const d = decision(
      "Top",
      [whenC(orC(refC("A"), refC("B")), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const children = acts(rootActions(emitTop(d).resource)[0]);
    expect(children).toHaveLength(3); // [armA, armB, otherwise]
    expect(condExprs(children[0]!)).toEqual(["A"]);
    expect(condExprs(children[1]!)).toEqual(["B"]);
    expect(children[2]!.title).toBe("otherwise");
    // arms are bare siblings — NOT wrapped in an unconditional "any" grouping
    expect(hasAnyBehavior(children[0]!)).toBe(false);
    expect(hasAnyBehavior(children[1]!)).toBe(false);
  });

  it("`or` guard under flat/no-qualifier → ONE `cqf-applicabilityBehavior any` wrapper over the arms", () => {
    const d = decision("Top", [whenC(orC(refC("A"), refC("B")), leaf(recommend("X")))]); // flat
    const top = rootActions(emitTop(d).resource);
    expect(top).toHaveLength(1);
    expect(hasAnyBehavior(top[0]!)).toBe(true);
    const arms = acts(top[0]);
    expect(arms).toHaveLength(2);
    expect(condExprs(arms[0]!)).toEqual(["A"]);
    expect(condExprs(arms[1]!)).toEqual(["B"]);
  });

  it("`(A or B) and C` → DNF arms [A,C] then [B,C] (exact order)", () => {
    const d = decision(
      "Top",
      [
        whenC(andC(orC(refC("A"), refC("B")), refC("C")), leaf(recommend("X"))),
        otherwise(leaf(recommend("Y"))),
      ],
      "first",
    );
    const children = acts(rootActions(emitTop(d).resource)[0]);
    expect(condExprs(children[0]!)).toEqual(["A", "C"]);
    expect(condExprs(children[1]!)).toEqual(["B", "C"]);
    expect(children[2]!.title).toBe("otherwise");
  });

  it("compound `or` inside a NESTED `first:` block splices under the parent when-action", () => {
    // when "G" then { first: when (A or B) then X ; otherwise Y }
    const inner = block("first", [
      whenC(orC(refC("A"), refC("B")), leaf(recommend("X"))),
      otherwise(leaf(recommend("Y"))),
    ]);
    const d = decision("Top", [when("G", inner)], "first");
    const gAction = acts(rootActions(emitTop(d).resource)[0])[0]!; // the `when G` action
    const nested = acts(gAction);
    expect(nested.map((n) => n.title)).toEqual(["A", "B", "otherwise"]); // spliced, not wrapped
    expect(hasAnyBehavior(gAction)).toBe(true); // parent carries the nested-first "any"
  });

  it("per-arm `input` = arm-aware union over the arm's atoms, deduped by canonical (first-seen)", () => {
    const inputResolver: CaseFeatureInputResolver = (name) => {
      if (name === "A") return [cf("A", "urn:A"), cf("Shared", "urn:S")];
      if (name === "B") return [cf("B", "urn:B")];
      if (name === "C") return [cf("C", "urn:C"), cf("Shared", "urn:S")];
      return [];
    };
    const d = decision(
      "Top",
      [whenC(andC(orC(refC("A"), refC("B")), refC("C")), leaf(recommend("X")))],
      "first",
    );
    const children = acts(rootActions(emitTop(d, inputResolver).resource)[0]);
    const profiles = (a: Act) => (a.input as Array<{ profile: string[] }>).map((i) => i.profile[0]);
    // arm [A,C]: A→urn:A,urn:S ; C→urn:C, urn:S(dup dropped) → [A, S, C]
    expect(profiles(children[0]!)).toEqual(["urn:A", "urn:S", "urn:C"]);
    // arm [B,C]: B→urn:B ; C→urn:C, urn:S → [B, C, S]
    expect(profiles(children[1]!)).toEqual(["urn:B", "urn:C", "urn:S"]);
  });

  it("a faithful multi-category model (4×5 = 20 arms) EMITS — the cap is NOT an authoring gate (#224 KE)", () => {
    // "qualifying diagnosis (1 of 4) and qualifying severity (1 of 5)" — a plausible
    // faithful decision that the old 16-arm cap wrongly BLOCKED. It must just emit its
    // 20 arms; the emitter never distorts what is modelable.
    const wideOr = (p: string, k: number) =>
      orC(...Array.from({ length: k }, (_, i) => refC(`${p}${i}`)));
    const guard = andC(wideOr("dx", 4), wideOr("sev", 5)); // 4 × 5 = 20
    const d = decision("Top", [whenC(guard, leaf(recommend("X")))], "first");
    const { errors, resource } = emitTop(d);
    expect(errors.find((e) => e.kind === "compound-guard-expansion-overflow")).toBeUndefined();
    expect(acts(rootActions(resource)[0])).toHaveLength(20);
  });

  it("resource envelope: a pathological `and`-of-`or`s (>256 arms) → hard overflow, NO CQL, no OOM", () => {
    // 4^5 = 1024 arms — well past the materialization envelope. The SATURATING count
    // catches it BEFORE any 2^N allocation; the branch is suppressed with a boundary
    // signal, NEVER a CQL fallback and NEVER a prescribed restructure.
    const wideOr = (n: number) => orC(...Array.from({ length: 4 }, (_, i) => refC(`${n}_${i}`)));
    const guard = andC(wideOr(1), wideOr(2), wideOr(3), wideOr(4), wideOr(5)); // 4^5 = 1024
    const d = decision(
      "Top",
      [whenC(guard, leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { errors, resource } = emitTop(d);
    const overflow = errors.find((e) => e.kind === "compound-guard-expansion-overflow");
    expect(overflow).toBeDefined();
    expect(overflow!.message).toMatch(/materialization envelope|resource boundary/i);
    // the message must NOT prescribe the trap-prone "nest under first:" remedy
    expect(overflow!.message).not.toMatch(/hoist|nest.*first/i);
    // suppressed; only `otherwise` survives — no arm emitted, no CQL
    const children = acts(rootActions(resource)[0]);
    expect(children).toHaveLength(1);
    expect(children[0]!.title).toBe("otherwise");
  });

  it("an unresolved atom suppresses the WHOLE compound `when`; every bad atom is reported", () => {
    const resolveOnlyA: ConceptResolver = (ref) =>
      (typeof ref === "string" ? ref : ref.name) === "A" ? "A" : null;
    const d = decision(
      "Top",
      [whenC(andC(refC("A"), refC("B")), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { unmatched, resource } = emitTop(d, undefined, resolveOnlyA);
    const bad = unmatched.filter((u) => u.kind === "unresolved-concept").map((u) => u.text);
    expect(bad).toContain('"B"'); // raw refDisplay, parity with single-ref path
    const children = acts(rootActions(resource)[0]);
    expect(children).toHaveLength(1); // compound when suppressed; only otherwise
    expect(children[0]!.title).toBe("otherwise");
  });

  it("shared body emitted ONCE — an unresolved leaf under a 2-arm `or` reports ONE diagnostic, not per-arm", () => {
    const resolveActNotX: ActivityResolver = (ref) =>
      (typeof ref === "string" ? ref : ref.name) === "X" ? null : RESOLVE_ACT_OK(ref);
    const d = decision(
      "Top",
      [whenC(orC(refC("A"), refC("B")), leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { unmatched } = emitDecisionPlanDefinition(
      d,
      "Lib",
      METADATA,
      RESOLVE_ALL,
      resolveActNotX,
      RESOLVE_DEC_OK,
      true,
      { clock: FIXED_CLOCK },
    );
    // "X" is shared by both arms — body emitted once → ONE unresolved-activity, not two.
    expect(unmatched.filter((u) => u.kind === "unresolved-activity")).toHaveLength(1);
  });

  it("duplicate atom `A and A` → two applicability conditions, ONE deduped input", () => {
    const inputResolver: CaseFeatureInputResolver = (name) =>
      name === "A" ? [cf("A", "urn:A")] : [];
    const d = decision("Top", [whenC(andC(refC("A"), refC("A")), leaf(recommend("X")))], "first");
    const arm = acts(rootActions(emitTop(d, inputResolver).resource)[0])[0]!;
    expect(condExprs(arm)).toEqual(["A", "A"]); // duplicates preserved in condition[]
    expect((arm.input as Array<{ profile: string[] }>).map((i) => i.profile[0])).toEqual(["urn:A"]);
  });

  it("same-library qualified atom `A and Lib.\"B\"` (in library Lib) is normalized + included", () => {
    // Lib."B" inside library "Lib" strips to bare "B" — resolves like a local ref and
    // gets its inputs, byte-consistent with the condition it emits.
    const inputResolver: CaseFeatureInputResolver = (name) =>
      name === "A" ? [cf("A", "urn:A")] : name === "B" ? [cf("B", "urn:B")] : [];
    const d = decision(
      "Top",
      [whenC(andC(refC("A"), refQC("Lib", "B")), leaf(recommend("X")))],
      "first",
    );
    const arm = acts(rootActions(emitTop(d, inputResolver).resource)[0])[0]!;
    expect(condExprs(arm)).toEqual(["A", "B"]); // qualifier stripped, both resolve
    expect((arm.input as Array<{ profile: string[] }>).map((i) => i.profile[0])).toEqual([
      "urn:A",
      "urn:B",
    ]);
  });

  it("genuinely-foreign atom `A and Other.\"B\"` (unresolved cross-lib) suppresses the whole guard", () => {
    // v0: a cross-library concept ref does not resolve → whole compound `when`
    // suppressed, reported with the RAW qualified diagnostic (not the bare name).
    const resolveLocalOnly: ConceptResolver = (ref) => (typeof ref === "string" ? ref : null);
    const d = decision(
      "Top",
      [
        whenC(andC(refC("A"), refQC("Other", "B")), leaf(recommend("X"))),
        otherwise(leaf(recommend("Y"))),
      ],
      "first",
    );
    const { unmatched, resource } = emitTop(d, undefined, resolveLocalOnly);
    const bad = unmatched.filter((u) => u.kind === "unresolved-concept").map((u) => u.text);
    expect(bad).toContain('"Other"."B"'); // raw qualified refDisplay
    const children = acts(rootActions(resource)[0]);
    expect(children).toHaveLength(1); // whole compound when suppressed; only otherwise
    expect(children[0]!.title).toBe("otherwise");
  });

  it("two foreign atoms with the SAME name in DIFFERENT libraries → distinct diagnostics (atomKey)", () => {
    const resolveLocalOnly: ConceptResolver = (ref) => (typeof ref === "string" ? ref : null);
    const d = decision(
      "Top",
      [whenC(andC(refQC("LibX", "A"), refQC("LibY", "A")), leaf(recommend("X")))],
      "first",
    );
    const { unmatched } = emitTop(d, undefined, resolveLocalOnly);
    const bad = unmatched.filter((u) => u.kind === "unresolved-concept").map((u) => u.text);
    // both reported (distinct atomKeys q:[LibX,A] vs q:[LibY,A]) — not collapsed to one
    expect(bad).toContain('"LibX"."A"');
    expect(bad).toContain('"LibY"."A"');
  });

  it("a 17-wide `or` EMITS 17 spliced arms — the old 16 gate no longer bites (#224 KE)", () => {
    const wide = orC(...Array.from({ length: 17 }, (_, i) => refC(`r${i}`)));
    const d = decision(
      "Top",
      [whenC(wide, leaf(recommend("X"))), otherwise(leaf(recommend("Y")))],
      "first",
    );
    const { errors, resource } = emitTop(d);
    expect(errors.find((e) => e.kind === "compound-guard-expansion-overflow")).toBeUndefined();
    const children = acts(rootActions(resource)[0]);
    expect(children.filter((c) => c.title !== "otherwise")).toHaveLength(17);
  });

  it("`or` under an explicit `all:` qualifier → the `any` wrapper (named disc-286 contract case)", () => {
    const d = decision("Top", [whenC(orC(refC("A"), refC("B")), leaf(recommend("X")))], "all");
    const top = rootActions(emitTop(d).resource);
    expect(top).toHaveLength(1);
    expect(hasAnyBehavior(top[0]!)).toBe(true);
    expect(acts(top[0]).map((a) => condExprs(a))).toEqual([["A"], ["B"]]);
  });
});

const cf = (name: string, canonical: string) => ({ name, canonical });
const refQC = (libraryName: string, name: string): BranchCondition => ({
  type: "BranchConditionRef",
  ref: { type: "QualifiedReference", libraryName, name, location: LOC },
  location: LOC,
});
