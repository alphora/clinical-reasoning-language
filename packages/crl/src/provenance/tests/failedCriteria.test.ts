/**
 * #173 T2 — unit tests for the two PURE failed-criteria selectors (failedCriteria.ts): `allUnsatisfiedCriteria` ("All"
 * mode) and `failedCriterionFrontier` ("Blocking" mode, default). Disc 158 §"WHICH criteria" / §"Trigger" / §"Slice T2".
 *
 * Strategy: hand-built duck-typed `FcViewNode` trees for the focused cases, PLUS two REAL-VM-derived scenarios for the
 * load-bearing paths — the `first:`-preemption frontier (what All-mode gets wrong) and the deep same-lib delegation
 * frontier (the blocker buried in an inlined sub). The real-VM derivations prove the duck-type matches the live
 * `ViewNode` shape (evaluated / condition.satisfied / unreachedReason / guardedOut), not just my reading of it.
 */
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { renderScenario } from "../../cre/viewModel";
import type { RegistryEntry } from "../../imports/types";
import {
  allUnsatisfiedCriteria,
  failedCriterionFrontier,
  type FcScenario,
  type FcViewNode,
} from "../failedCriteria";

// ── tiny duck-typed tree builders ──────────────────────────────────────────────
const SRC = { filePath: "inline.crl", range: {} };
/** A `when` with an explicit evaluated/satisfied state. `satisfied: undefined` + evaluated:false models an unreached
 *  branch; pass `preempted:true` to mark a first:-preempted branch. */
const when = (
  nodeId: string,
  opts: { evaluated: boolean; satisfied?: boolean; preempted?: boolean; concept?: string },
  children: FcViewNode[] = [],
): FcViewNode => ({
  nodeId,
  kind: "when",
  label: `when ${opts.concept ?? "C"}`,
  source: SRC,
  evaluated: opts.evaluated,
  ...(opts.preempted ? { unreachedReason: "preempted" as const } : {}),
  condition: {
    concept: { name: opts.concept ?? "C" },
    ...(opts.satisfied !== undefined ? { satisfied: opts.satisfied } : {}),
  },
  children,
});
const otherwise = (
  nodeId: string,
  opts: { evaluated: boolean; preempted?: boolean },
  children: FcViewNode[] = [],
): FcViewNode => ({
  nodeId,
  kind: "otherwise",
  label: "otherwise",
  source: SRC,
  evaluated: opts.evaluated,
  ...(opts.preempted ? { unreachedReason: "preempted" as const } : {}),
  children,
});
/** A recommend-activity action; `label` is the disposition name (matched against expected.branch). A `guardedOut` action
 *  carries a guard `{polarity, concept}` (the cockpit's display payload) — pass `guard` to model it. */
const action = (
  nodeId: string,
  label: string,
  opts: {
    evaluated: boolean;
    produced?: boolean;
    guardedOut?: boolean;
    guard?: { polarity: "unless" | "only-when"; concept: string };
  } = { evaluated: true },
): FcViewNode => ({
  nodeId,
  kind: "action",
  label,
  source: SRC,
  evaluated: opts.evaluated,
  ...(opts.guardedOut ? { guardedOut: true } : {}),
  ...(opts.guard
    ? {
        guard: {
          polarity: opts.guard.polarity,
          concept: { name: opts.guard.concept },
          evaluated: true,
          satisfied: opts.guard.polarity === "unless",
        },
      }
    : {}),
  action: { actionKind: "recommend-activity", produced: opts.produced ?? false },
});
/** A `use decision` delegation action (never a producible disposition). Pass inlined `children` to model an expanded
 *  sub-tree. */
const useDecision = (
  nodeId: string,
  target: string,
  opts: {
    evaluated: boolean;
    guardedOut?: boolean;
    guard?: { polarity: "unless" | "only-when"; concept: string };
  },
  children: FcViewNode[] = [],
): FcViewNode => ({
  nodeId,
  kind: "action",
  label: target,
  source: SRC,
  evaluated: opts.evaluated,
  ...(opts.guardedOut ? { guardedOut: true } : {}),
  ...(opts.guard
    ? {
        guard: {
          polarity: opts.guard.polarity,
          concept: { name: opts.guard.concept },
          evaluated: true,
          satisfied: opts.guard.polarity === "unless",
        },
      }
    : {}),
  action: { actionKind: "use-decision", produced: false },
  ...(children.length ? { children } : {}),
});

const sv = (status: FcScenario["status"], branch: string | null, tree: FcViewNode[]): FcScenario => ({
  status,
  expected: branch === null ? null : { decision: "Main", branch },
  tree,
});

// ── allUnsatisfiedCriteria ──────────────────────────────────────────────────────
describe("allUnsatisfiedCriteria — every evaluated-unsatisfied when, any case", () => {
  it("collects all false whens including ones on UNTAKEN branches", () => {
    // Two top-level whens: when[0] satisfied (taken), when[1] false. Under when[0], a nested false when on an UNTAKEN
    // inner branch. All-mode collects EVERY evaluated-unsatisfied when regardless of reachability of its body.
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "A" }, [
        when("when[0]/when[0]", { evaluated: true, satisfied: false, concept: "B" }),
        when("when[0]/when[1]", { evaluated: true, satisfied: true, concept: "C" }, [
          action("when[0]/when[1]/action[0]", "Approve", { evaluated: true, produced: true }),
        ]),
      ]),
      when("when[1]", { evaluated: true, satisfied: false, concept: "D" }),
    ];
    const got = allUnsatisfiedCriteria(sv("fail", "Approve", tree));
    expect(got.map((g) => g.nodeId)).toEqual(["when[0]/when[0]", "when[1]"]);
    expect(got.every((g) => g.reason === "unsatisfied-when")).toBe(true);
    expect(got[0].conceptLabel).toBe("when B");
    // display carries the precise false-when concept (FIX 3).
    expect(got[0].display).toEqual({ reason: "unsatisfied-when", guard: "single", concept: { name: "B" } });
    expect(got[1].display).toEqual({ reason: "unsatisfied-when", guard: "single", concept: { name: "D" } });
  });

  it("does NOT collect unreached (evaluated:false) whens, nor satisfied whens", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "A" }),
      when("when[1]", { evaluated: false, concept: "B" }), // unreached → not a false when
      when("when[2]", { evaluated: false, preempted: true, concept: "C" }), // preempted → not collected by All
    ];
    expect(allUnsatisfiedCriteria(sv("pass", null, tree))).toEqual([]);
  });

  it("is any-case: a PASS with false whens on untaken branches still collects them", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "A" }, [
        action("when[0]/action[0]", "Approve", { evaluated: true, produced: true }),
      ]),
      when("when[1]", { evaluated: true, satisfied: false, concept: "B" }),
    ];
    const got = allUnsatisfiedCriteria(sv("pass", "Approve", tree));
    expect(got.map((g) => g.nodeId)).toEqual(["when[1]"]);
  });
});

// ── compound guards (#224 i.4b): the widened display carries guardLabel + frontier ───────────────────────────────
// Minimal `BranchConditionView` literals for the duck-typed fixtures (tests aren't in the tsc program).
const bcRef = (name: string, satisfied: boolean) => ({ op: "ref" as const, satisfied, concept: { name } });
const bcAnd = (satisfied: boolean, ...operands: ReturnType<typeof bcRef>[]) => ({
  op: "and" as const,
  satisfied,
  operands,
});
const compoundWhen = (
  nodeId: string,
  expr: ReturnType<typeof bcAnd>,
  satisfied: boolean,
  guardLabel: string,
  children: FcViewNode[] = [],
): FcViewNode => ({
  nodeId,
  kind: "when",
  label: `when ${guardLabel}`,
  source: SRC,
  evaluated: true,
  condition: { expr, satisfied },
  children,
});

describe("compound-guard display (#224 i.4b) — guardLabel + unsatisfied frontier", () => {
  const tree = () => [
    compoundWhen("when[0]", bcAnd(false, bcRef("A", true), bcRef("B", false)), false, "A and B", [
      action("when[0]/action[0]", "Approve", { evaluated: false }),
    ]),
    otherwise("otherwise", { evaluated: true }, [
      action("otherwise/action[0]", "Deny", { evaluated: true, produced: true }),
    ]),
  ];

  it("frontier: a false `A and B` blocker carries guard:compound + guardLabel + [B]", () => {
    const got = failedCriterionFrontier(sv("fail", "Approve", tree()));
    expect(got).toHaveLength(1);
    expect(got[0].reason).toBe("unsatisfied-when");
    expect(got[0].display).toEqual({
      reason: "unsatisfied-when",
      guard: "compound",
      guardLabel: "A and B",
      frontier: [{ kind: "ref", concept: { name: "B" } }],
    });
  });

  it("all-mode: the same compound false `when` carries the compound display", () => {
    const got = allUnsatisfiedCriteria(sv("fail", "Approve", tree()));
    const compound = got.find((g) => g.nodeId === "when[0]")!;
    expect(compound.display).toMatchObject({ guard: "compound", guardLabel: "A and B" });
  });
});

// ── #224 iii.3b: negation (real VM). A false `when not X` (X established) blocks the expected branch;
//    the frontier pinpoints X as a `negated-ref` (never opaque), carrying its frame-resolved lib. ──
describe("negation frontier (#224 iii.3b) — a false `when not X` [real VM]", () => {
  it("`when not Contra` false (Contra established) → guard:compound, guardLabel `not Contra`, [negated-ref Contra]", () => {
    const r = renderScenario(graphFrom(NEG_CRL, NEG_CEL));
    expect(r.scenarios).toHaveLength(1);
    const scenario = r.scenarios[0];
    expect(scenario.status).toBe("fail");
    expect(scenario.expected).toEqual({ decision: "Main", branch: "Approve" });

    // VM-signal sanity: the `when not Contra` gate evaluated false (Contra established → `not` false).
    const gate = scenario.tree[0];
    expect(gate.nodeId).toBe("when[0]");
    expect(gate.evaluated).toBe(true);
    expect(gate.condition?.satisfied).toBe(false);

    const got = failedCriterionFrontier(scenario as unknown as FcScenario);
    expect(got).toHaveLength(1);
    expect(got[0].reason).toBe("unsatisfied-when");
    expect(got[0].display).toEqual({
      reason: "unsatisfied-when",
      guard: "compound",
      guardLabel: "not Contra",
      frontier: [{ kind: "negated-ref", concept: { name: "Contra", libraryName: "NEG" } }],
    });
    // NOT opaque — the whole point of iii.3b.
    if (got[0].display.reason === "unsatisfied-when" && got[0].display.guard === "compound")
      expect(got[0].display.frontier.some((i) => i.kind === "opaque")).toBe(false);
  });

  it("`when not ( A or B )` — not-over-COMPOUND, real zip → pinpoints the established disjunct (not opaque)", () => {
    // The zip walks `BranchConditionNot` over an `or` operand (viewModel `zipConditionTrace`). A established
    // → `(A or B)` true → `not` false → branch blocked; the frontier must pinpoint A as `negated-ref`, NOT
    // fall back to opaque. (The criterion-expansion form `when not <criterion=(A or B)>` is covered on the
    // questionnaire render path, which builds criterion tables; `graphFrom` here is criterion-table-free.)
    const r = renderScenario(graphFrom(NEGCPD_CRL, NEGCPD_CEL));
    const scenario = r.scenarios[0];
    expect(scenario.status).toBe("fail");
    const got = failedCriterionFrontier(scenario as unknown as FcScenario);
    expect(got).toHaveLength(1);
    expect(got[0].reason).toBe("unsatisfied-when");
    if (got[0].display.reason === "unsatisfied-when" && got[0].display.guard === "compound") {
      expect(got[0].display.frontier).toEqual([{ kind: "negated-ref", concept: { name: "A", libraryName: "NC" } }]);
    } else throw new Error(`expected a compound unsatisfied-when, got ${JSON.stringify(got[0].display)}`);
  });
});

// ── failedCriterionFrontier — pass/error are empty ───────────────────────────────
describe("failedCriterionFrontier — self-gating empties", () => {
  it("status==='pass' → empty (the expected fired; nothing blocked it)", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "A" }, [
        action("when[0]/action[0]", "Approve", { evaluated: true, produced: true }),
      ]),
      when("when[1]", { evaluated: true, satisfied: false, concept: "B" }),
    ];
    expect(failedCriterionFrontier(sv("pass", "Approve", tree))).toEqual([]);
  });

  it("status==='error' → empty (partial trace, expected path undefined)", () => {
    const tree = [when("when[0]", { evaluated: true, satisfied: false, concept: "A" })];
    expect(failedCriterionFrontier(sv("error", "Approve", tree))).toEqual([]);
  });

  it("expected.branch names a disposition with NO action node anywhere → empty (authoring inconsistency)", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: false, concept: "A" }, [
        action("when[0]/action[0]", "Deny", { evaluated: false }),
      ]),
    ];
    // expected "Approve" — but only "Deny" exists in the tree.
    expect(failedCriterionFrontier(sv("fail", "Approve", tree))).toEqual([]);
  });

  it("expected.branch matches only a USE-DECISION row (no recommend-activity of that name) → empty (FIX 1)", () => {
    // A `use decision "Sub"` whose target name == expected.branch, guarded out. It is NOT a producible disposition →
    // it must NOT be collected as a target site (so its guardedOut is NOT surfaced as a blocker). No recommend-activity
    // named "Sub" exists → frontier empty (an authoring inconsistency the cockpit surfaces elsewhere).
    const tree = [
      otherwise("otherwise", { evaluated: true }, [
        useDecision("otherwise/action[0]", "Sub", {
          evaluated: true,
          guardedOut: true,
          guard: { polarity: "unless", concept: "Contra" },
        }),
      ]),
    ];
    expect(failedCriterionFrontier(sv("fail", "Sub", tree))).toEqual([]);
  });
});

// ── failedCriterionFrontier — blocker case (a): own/ancestor unsatisfied when ─────
describe("failedCriterionFrontier — (a) gating when false", () => {
  it("the expected disposition's gating when is false → that when is the frontier", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: false, concept: "Indic" }, [
        action("when[0]/action[0]", "Approve", { evaluated: false }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    expect(got).toHaveLength(1);
    expect(got[0].nodeId).toBe("when[0]");
    expect(got[0].reason).toBe("unsatisfied-when");
    expect(got[0].conceptLabel).toBe("when Indic");
    expect(got[0].display).toEqual({ reason: "unsatisfied-when", guard: "single", concept: { name: "Indic" } });
  });

  it("a SHALLOWER guarded-out delegation ancestor wins over a deeper would-be blocker (realistic priority)", () => {
    // REALISTIC priority (gpt55-4 — NOT two stacked false whens, which is an impossible VM state: a false outer when's
    // body is not evaluated, so an inner when under it is evaluated:false). Here a guarded-out `use decision` ancestor
    // gates the whole sub-tree; the deeper recommend "Approve" is unreached. The shallower guarded delegation row wins.
    const tree = [
      otherwise("otherwise", { evaluated: true }, [
        useDecision(
          "otherwise/action[0]",
          "Sub",
          { evaluated: true, guardedOut: true, guard: { polarity: "unless", concept: "Contra" } },
          [
            otherwise("otherwise/action[0]/otherwise", { evaluated: false }, [
              action("otherwise/action[0]/otherwise/action[0]", "Approve", { evaluated: false }),
            ]),
          ],
        ),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    expect(got).toHaveLength(1);
    expect(got[0].nodeId).toBe("otherwise/action[0]"); // the guarded delegation ancestor, not the deep recommend
    expect(got[0].reason).toBe("guarded-out");
    expect(got[0].display).toEqual({
      reason: "guarded-out",
      polarity: "unless",
      concept: { name: "Contra" },
    });
  });
});

// ── failedCriterionFrontier — blocker case (c): guardedOut ───────────────────────
describe("failedCriterionFrontier — (c) the expected action guarded out", () => {
  it("the expected action is guarded out → the guard (the action's own row) is the frontier, display = polarity+concept", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "Indic" }, [
        action("when[0]/action[0]", "Approve", {
          evaluated: true,
          guardedOut: true,
          guard: { polarity: "only-when", concept: "Eligible" },
        }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    expect(got).toHaveLength(1);
    expect(got[0].nodeId).toBe("when[0]/action[0]");
    expect(got[0].reason).toBe("guarded-out");
    // FIX 3: the cockpit renders "only-when Eligible" from `display` alone — no second VM lookup.
    expect(got[0].display).toEqual({
      reason: "guarded-out",
      polarity: "only-when",
      concept: { name: "Eligible" },
    });
  });
});

// ── failedCriterionFrontier — multi-site ─────────────────────────────────────────
describe("failedCriterionFrontier — multi-site (the disposition name repeats)", () => {
  it("expected disposition appears under TWO branches → the frontier set spans both blockers", () => {
    const tree = [
      when("when[0]", { evaluated: true, satisfied: false, concept: "Path1" }, [
        action("when[0]/action[0]", "Approve", { evaluated: false }),
      ]),
      when("when[1]", { evaluated: true, satisfied: true, concept: "Path2" }, [
        action("when[1]/action[0]", "Approve", { evaluated: true, guardedOut: true }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    // site 1 blocked by its false when; site 2 blocked by its own guardedOut.
    expect(got.map((g) => ({ id: g.nodeId, r: g.reason }))).toEqual([
      { id: "when[0]", r: "unsatisfied-when" },
      { id: "when[1]/action[0]", r: "guarded-out" },
    ]);
  });

  it("dedups when two target sites resolve to the SAME blocker nodeId", () => {
    // Two Approve actions under the SAME false when → one frontier entry (set semantics).
    const tree = [
      when("when[0]", { evaluated: true, satisfied: false, concept: "Indic" }, [
        action("when[0]/action[0]", "Approve", { evaluated: false }),
        action("when[0]/action[1]", "Approve", { evaluated: false }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    expect(got.map((g) => g.nodeId)).toEqual(["when[0]"]);
  });

  it("an `all:`/`any:` menu — two same-label recommends with DISTINCT guards, both guarded out → both surface (gpt55-8)", () => {
    // A satisfied `when` opens a menu of two `recommend "Order"` items (same disposition name), each with its OWN guard,
    // both guarded out. Each is a distinct target SITE blocked by case (c) on ITS OWN row → two frontier entries (no
    // dedup: distinct nodeIds), each carrying its own guard concept in `display`.
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "Indic" }, [
        action("when[0]/action[0]", "Order", {
          evaluated: true,
          guardedOut: true,
          guard: { polarity: "unless", concept: "AllergyA" },
        }),
        action("when[0]/action[1]", "Order", {
          evaluated: true,
          guardedOut: true,
          guard: { polarity: "unless", concept: "AllergyB" },
        }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Order", tree));
    expect(got.map((g) => g.nodeId)).toEqual(["when[0]/action[0]", "when[0]/action[1]"]);
    expect(got.map((g) => (g.display.reason === "guarded-out" ? g.display.concept?.name : null))).toEqual([
      "AllergyA",
      "AllergyB",
    ]);
  });
});

// ── failedCriterionFrontier — the "surface nothing" guard ────────────────────────
describe("failedCriterionFrontier — a target with no applicable blocker surfaces nothing (no guessing)", () => {
  it("the target action is reached on a satisfied path but unproduced for another reason → empty", () => {
    // when satisfied, action evaluated, NOT guardedOut, NOT produced (e.g. an all:-menu sibling chosen elsewhere).
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "Indic" }, [
        action("when[0]/action[0]", "Approve", { evaluated: true, produced: false }),
      ]),
    ];
    expect(failedCriterionFrontier(sv("fail", "Approve", tree))).toEqual([]);
  });
});

// ── failedCriterionFrontier — (b) first:-PREEMPTION (LOAD-BEARING, real VM) ───────
describe("failedCriterionFrontier — (b) first:-preemption [LOAD-BEARING, real VM]", () => {
  it("an earlier matched when diverted the run → the frontier is the MATCHED earlier sibling, not a false when", () => {
    // Real VM: first: { when Early (matches) → Quick ; when Late (PREEMPTED) → Slow }. Case supplies Early AND Late,
    // expects "Slow". Early short-circuits; when[1] is evaluated:false + unreachedReason:"preempted". The frontier is
    // the MATCHED prior sibling when[0] (satisfied:TRUE) — the case All-mode entirely MISSES (no false when exists).
    const r = renderScenario(graphFrom(PRE_CRL, PRE_CEL));
    expect(r.scenarios).toHaveLength(1);
    const scenario = r.scenarios[0];
    expect(scenario.status).toBe("fail");
    expect(scenario.expected).toEqual({ decision: "Main", branch: "Slow" });

    // EXPLICIT VM-SIGNAL ASSERTIONS (gpt55-2): pin the exact preemption shape this selector depends on, so a future VM
    // change to the signal fails THIS test loudly (not just indirectly via the result). The expected-branch node
    // (when[1], the `Slow` site's gating when) is evaluated:false + unreachedReason:"preempted"; the matched prior
    // sibling (when[0], `when Early`) is evaluated:true + condition.satisfied:true.
    const early = scenario.tree[0];
    const late = scenario.tree[1];
    expect(early.nodeId).toBe("when[0]");
    expect(early.evaluated).toBe(true);
    expect(early.condition?.satisfied).toBe(true);
    expect(late.nodeId).toBe("when[1]");
    expect(late.evaluated).toBe(false);
    expect(late.unreachedReason).toBe("preempted");
    expect(late.condition?.satisfied).toBeUndefined(); // a preempted when carries NO satisfied

    // SANITY: All-mode finds nothing here (the diverting when is satisfied, the expected when is unreached).
    expect(allUnsatisfiedCriteria(scenario as unknown as FcScenario)).toEqual([]);

    const got = failedCriterionFrontier(scenario as unknown as FcScenario);
    expect(got).toHaveLength(1);
    expect(got[0].nodeId).toBe("when[0]"); // the MATCHED Early branch, not when[1] (the preempted expected branch)
    expect(got[0].reason).toBe("preemption");
    expect(got[0].conceptLabel).toBe("when Early");
    expect(got[0].display).toEqual({ reason: "preemption", siblingKind: "when", concept: { name: "Early" } });
  });

  it("(b) hand-built: the matched prior sibling is an OTHERWISE → that otherwise is the frontier", () => {
    // first: { when A (false) ; otherwise (matched, diverts) → Other ; when Expected (PREEMPTED) → Approve }.
    const tree = [
      when("when[0]", { evaluated: true, satisfied: false, concept: "A" }),
      otherwise("otherwise", { evaluated: true }, [
        action("otherwise/action[0]", "Other", { evaluated: true, produced: true }),
      ]),
      when("when[1]", { evaluated: false, preempted: true, concept: "Expected" }, [
        action("when[1]/action[0]", "Approve", { evaluated: false }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    expect(got).toHaveLength(1);
    expect(got[0].nodeId).toBe("otherwise");
    expect(got[0].reason).toBe("preemption");
    expect(got[0].display).toEqual({ reason: "preemption", siblingKind: "otherwise" });
  });

  it("(b) NESTED groups: the preempted target's INNER prior sibling wins, NOT the outer cousin (gpt55-3)", () => {
    // Outer first: { when[0]=Trigger (matches, enters its body) ; when[1] (cousin, preempted) }. INSIDE when[0]'s body
    // is an INNER ordered group: { when[0]/when[0]=InnerEarly (matches → diverts) ; when[0]/when[1]=Expected (PREEMPTED)
    // → Approve }. The expected branch is preempted by its OWN INNER prior sibling (InnerEarly). `matchedPriorSibling`
    // must return InnerEarly (the SAME inner group), never the outer cousin when[0] (Trigger) or when[1].
    const tree = [
      when("when[0]", { evaluated: true, satisfied: true, concept: "Trigger" }, [
        when("when[0]/when[0]", { evaluated: true, satisfied: true, concept: "InnerEarly" }, [
          action("when[0]/when[0]/action[0]", "Other", { evaluated: true, produced: true }),
        ]),
        when("when[0]/when[1]", { evaluated: false, preempted: true, concept: "Expected" }, [
          action("when[0]/when[1]/action[0]", "Approve", { evaluated: false }),
        ]),
      ]),
      when("when[1]", { evaluated: false, preempted: true, concept: "OuterCousin" }, [
        action("when[1]/action[0]", "Approve", { evaluated: false }),
      ]),
    ];
    const got = failedCriterionFrontier(sv("fail", "Approve", tree));
    // TWO target sites (Approve appears in the inner preempted branch AND the outer cousin). The inner site's blocker is
    // InnerEarly (its inner prior sibling). The outer cousin site (when[1]) is itself preempted → its prior sibling is
    // the matched when[0] (Trigger). So the frontier set = { InnerEarly, Trigger } — and CRITICALLY the inner site does
    // NOT resolve to the outer cousin. Assert InnerEarly is present and is the inner-group sibling.
    const ids = got.map((g) => g.nodeId).sort();
    expect(ids).toContain("when[0]/when[0]"); // InnerEarly — the SAME inner group, the load-bearing assertion
    // every entry is a preemption blocker (a MATCHED sibling), none is the false/cousin path
    expect(got.every((g) => g.reason === "preemption")).toBe(true);
    const inner = got.find((g) => g.nodeId === "when[0]/when[0]")!;
    expect(inner.display).toEqual({
      reason: "preemption",
      siblingKind: "when",
      concept: { name: "InnerEarly" },
    });
  });
});

// ── failedCriterionFrontier — DEEP same-lib delegation (real VM) ──────────────────
describe("failedCriterionFrontier — deep delegation: blocker buried in an inlined sub [real VM]", () => {
  it("the expected disposition is produced-site deep in an inlined sub; its blocker is the sub's false when", () => {
    // Real VM: Main→Sub1→Sub2→Sub3 (all bare same-lib, inlined). Sub3 gates "Final" on a `Gate` concept the case does
    // NOT supply → "Final" fails deep. The frontier must find the deep target (Final at the inlined leaf) and walk its
    // ancestor chain to the Sub3-local `when Gate` (false) — the caller-local INLINED nodeId (T3 re-roots it).
    const r = renderScenario(graphFrom(DEEP_CRL, DEEP_CEL));
    const scenario = r.scenarios[0];
    expect(scenario.status).toBe("fail");
    expect(scenario.expected).toEqual({ decision: "Main", branch: "Final" });

    const got = failedCriterionFrontier(scenario as unknown as FcScenario);
    expect(got).toHaveLength(1);
    // the blocker is the DEEP inlined `when Gate` row — the LAST when ancestor before the Final action.
    expect(got[0].nodeId).toBe(
      "otherwise/action[0]/when[0]/action[0]/when[0]/action[0]/when[0]",
    );
    expect(got[0].reason).toBe("unsatisfied-when");
    expect(got[0].conceptLabel).toBe("when Gate");
    expect(got[0].display).toEqual({ reason: "unsatisfied-when", guard: "single", concept: { name: "Gate" } });
  });
});

// ── failedCriterionFrontier — guarded-out delegation ancestor with a deep inlined target (real VM, gpt55-5) ─────────
describe("failedCriterionFrontier — guarded-out use-decision ancestor of an inlined target [real VM]", () => {
  it("a guarded-out `use decision` whose inlined sub has the expected recommend → frontier = the GUARDED DELEGATION ROW", () => {
    // Real VM: Main --otherwise--> use decision "Sub" UNLESS "Contra". The case supplies Contra, so the use-decision is
    // guardedOut:true — but the VM STILL inlines its sub-tree (expansion is resolvability-based, guardedOut is a separate
    // projected flag), so "Approve" exists as a deep recommend at otherwise/action[0]/otherwise/action[0] (evaluated:
    // false). The frontier must walk the target's ancestor chain, hit the guarded-out delegation row, and return IT
    // (reason guarded-out, display = unless Contra) — NOT the deep child, NOT empty.
    const r = renderScenario(graphFrom(GRD_CRL, GRD_CEL));
    const scenario = r.scenarios[0];
    expect(scenario.status).toBe("fail");
    expect(scenario.expected).toEqual({ decision: "Main", branch: "Approve" });

    // VM-signal sanity: the delegation row is guardedOut AND expanded (has inlined children).
    const useRow = scenario.tree[0].children![0];
    expect(useRow.nodeId).toBe("otherwise/action[0]");
    expect(useRow.action?.actionKind).toBe("use-decision");
    expect(useRow.guardedOut).toBe(true);
    expect(useRow.children && useRow.children.length).toBeGreaterThan(0);

    const got = failedCriterionFrontier(scenario as unknown as FcScenario);
    expect(got).toHaveLength(1);
    expect(got[0].nodeId).toBe("otherwise/action[0]"); // the guarded delegation row, NOT the deep Approve recommend
    expect(got[0].reason).toBe("guarded-out");
    expect(got[0].display).toEqual({
      reason: "guarded-out",
      polarity: "unless",
      concept: { name: "Contra" },
    });
  });
});

// ── fixtures (real-VM) ───────────────────────────────────────────────────────────
const PRE_CRL = `# PRE
library "PRE".
concept "Early":
- type is Condition.
- code is \`early\`.
concept "Late":
- type is Condition.
- code is \`late\`.
activity "Quick":
- request CPGCommunicationRequest.
- with \`q\`.
activity "Slow":
- request CPGCommunicationRequest.
- with \`s\`.
decision "Main":
first:
- when "Early" then recommend activity "Quick".
- when "Late" then recommend activity "Slow".`;
const PRE_CEL = `# PREC
library "PREC".
covers "PRE".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fEarly":
- code is "http://example.org|early".
- date is "2026-01-01".
- defined by "Early".
fact "fLate":
- code is "http://example.org|late".
- date is "2026-01-01".
- defined by "Late".
case "pre":
- id is "case-pre".
- subject is "Pat".
- fact is "fEarly".
- fact is "fLate".
- result is "Main" is "Slow".`;

const NEG_CRL = `# NEG
library "NEG".
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
decision "Main":
first:
- when not "Contra" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
const NEG_CEL = `# NEGC
library "NEGC".
covers "NEG".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "neg":
- subject is "Pat".
- fact is "fContra".
- result is "Main" is "Approve".`;

const NEGCPD_CRL = `# NC
library "NC".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
decision "Main":
first:
- when not ( "A" or "B" ) then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
const NEGCPD_CEL = `# NCC
library "NCC".
covers "NC".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
case "nc":
- subject is "Pat".
- fact is "fA".
- result is "Main" is "Approve".`;

const DEEP_CRL = `# DEEP
library "DEEP".
concept "Indic":
- type is Condition.
- code is \`indic\`.
concept "Gate":
- type is Condition.
- code is \`gate\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "Sub3":
- when "Gate" then recommend activity "Final".
decision "Sub2":
- when "Indic" then:
  - use decision "Sub3".
  end.
decision "Sub1":
- when "Indic" then:
  - use decision "Sub2".
  end.
decision "Main":
first:
- otherwise then:
  - use decision "Sub1".
  end.`;
const DEEP_CEL = `# DEEPC
library "DEEPC".
covers "DEEP".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "deepfail":
- id is "case-deepfail".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

const GRD_CRL = `# GRD
library "GRD".
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "Sub":
- otherwise then recommend activity "Approve".
decision "Main":
- otherwise then:
  - use decision "Sub" unless "Contra".
  end.`;
const GRD_CEL = `# GRDC
library "GRDC".
covers "GRD".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "grd":
- id is "case-grd".
- subject is "Pat".
- fact is "fContra".
- result is "Main" is "Approve".`;

// ── graph helper (mirrors runPath.test.ts) ───────────────────────────────────────
function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) {
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  }
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  return {
    filePath: "inline.cel",
    cel: built.result,
    coversTarget,
    celParseErrors: [],
    diagnostics: [],
  };
}
