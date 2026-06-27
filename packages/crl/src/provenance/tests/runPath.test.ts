/**
 * #175 todo-1 — unit tests for the chain-aware run-path decomposer `producedRuntimePathRefs` (runPath.ts).
 *
 * PURE tests: feed hand-built MinimalViewNode trees (and ONE tree derived from the real VM via the CHAIN fixture) and
 * assert the exact ordered RuntimePathRef[] per produced action. No consumer wiring is exercised here (that is todo-2).
 *
 * Coverage: depth 1 / 2 / 3, an `all:` menu producing two dispositions, a sub reached via two parent branches, the
 * three leaf-causes (qualified / unresolved / cyclic), and the BACK-COMPAT reduction (no-boundary == ancestorChain).
 */
import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { renderScenario } from "../../cre/viewModel";
import type { RegistryEntry } from "../../imports/types";
import {
  ancestorChain,
  collectProduced,
  producedRuntimePathRefs,
  type MinimalViewNode,
  type ProducedRunPath,
  type RuntimePathRef,
} from "../runPath";

import { CHAIN_CRL, CHAIN_CEL, CHAIN_ROOT } from "./fixtures/chainFixture";

/** Run the decomposer, assert EVERY path is fully grounded (gaps empty — the real-VM / well-formed-tree case), and
 *  return just the ordered `refs` per path so the per-test assertions stay focused on re-rooting. The malformed-tree
 *  test below uses `producedRuntimePathRefs` directly to inspect `gaps`. */
function groundedRefs(
  tree: MinimalViewNode[],
  root: { lib: string; decision: string },
): RuntimePathRef[][] {
  const paths: ProducedRunPath[] = producedRuntimePathRefs(tree, root);
  for (const p of paths) expect(p.gaps).toEqual([]); // honesty invariant: no gaps on a well-formed tree
  return paths.map((p) => p.refs);
}

// ── tiny tree builders ────────────────────────────────────────────────────────
const when = (nodeId: string, children: MinimalViewNode[]): MinimalViewNode => ({
  nodeId,
  kind: "when",
  children,
});
const otherwise = (nodeId: string, children: MinimalViewNode[]): MinimalViewNode => ({
  nodeId,
  kind: "otherwise",
  children,
});
/** A produced `recommend activity` leaf. */
const recommend = (nodeId: string): MinimalViewNode => ({
  nodeId,
  kind: "action",
  action: { produced: true, actionKind: "recommend-activity" },
});
/** An EXPANDED bare same-lib `use decision` boundary (inlined children). */
const useExpanded = (
  nodeId: string,
  target: string,
  children: MinimalViewNode[],
  libraryName?: string,
): MinimalViewNode => ({
  nodeId,
  kind: "action",
  action: {
    produced: false,
    actionKind: "use-decision",
    expanded: true,
    target: { name: target, ...(libraryName ? { libraryName } : {}) },
  },
  children,
});
/** A LEAF (un-expanded) `use decision` — qualified / unresolved / cyclic re-entry all share this shape. */
const useLeaf = (nodeId: string, target: string, libraryName?: string): MinimalViewNode => ({
  nodeId,
  kind: "action",
  action: {
    produced: false,
    actionKind: "use-decision",
    expanded: false,
    target: { name: target, ...(libraryName ? { libraryName } : {}) },
  },
});

const ref = (lib: string, decision: string, nodeId: string): RuntimePathRef => ({ lib, decision, nodeId });

describe("producedRuntimePathRefs — depth 1 / 2 / 3 chains", () => {
  it("depth 1: a single expanded use-decision → Main's delegation row + Sub's path", () => {
    // Main.when[0] --use Sub--> Sub.when[0]/action[0] (recommend)
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        useExpanded("when[0]/action[0]", "Sub", [
          when("when[0]/action[0]/when[0]", [recommend("when[0]/action[0]/when[0]/action[0]")]),
        ]),
      ]),
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toEqual([
      [
        ref("L", "Main", "when[0]"),
        ref("L", "Main", "when[0]/action[0]"), // the use-Sub boundary row (Main-local)
        ref("L", "Sub", "when[0]"), // re-rooted into Sub
        ref("L", "Sub", "when[0]/action[0]"), // the terminal recommend, Sub-local
      ],
    ]);
  });

  it("depth 2: Main → Sub1 → Sub2 → recommend (intermediate boundary rows present)", () => {
    const tree: MinimalViewNode[] = [
      otherwise("otherwise", [
        useExpanded("otherwise/action[0]", "Sub1", [
          when("otherwise/action[0]/when[0]", [
            useExpanded("otherwise/action[0]/when[0]/action[0]", "Sub2", [
              when("otherwise/action[0]/when[0]/action[0]/when[0]", [
                recommend("otherwise/action[0]/when[0]/action[0]/when[0]/action[0]"),
              ]),
            ]),
          ]),
        ]),
      ]),
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toEqual([
      [
        ref("L", "Main", "otherwise"),
        ref("L", "Main", "otherwise/action[0]"),
        ref("L", "Sub1", "when[0]"),
        ref("L", "Sub1", "when[0]/action[0]"),
        ref("L", "Sub2", "when[0]"),
        ref("L", "Sub2", "when[0]/action[0]"),
      ],
    ]);
  });

  it("depth 3 (the CHAIN fixture, derived from the REAL VM): Main→Sub1→Sub2→Sub3→Final", () => {
    const r = renderScenario(graphFrom(CHAIN_CRL, CHAIN_CEL));
    expect(r.scenarios).toHaveLength(1);
    const sv = r.scenarios[0];
    expect(sv.status).toBe("pass");
    // sanity: the produced action is the deep inlined id
    const produced: MinimalViewNode[] = [];
    collectProduced(sv.tree as unknown as MinimalViewNode[], produced);
    expect(produced.map((p) => p.nodeId)).toEqual([
      "otherwise/action[0]/when[0]/action[0]/when[0]/action[0]/when[0]/action[0]",
    ]);

    const paths = groundedRefs(sv.tree as unknown as MinimalViewNode[], CHAIN_ROOT);
    expect(paths).toEqual([
      [
        ref("CHAIN", "Main", "otherwise"),
        ref("CHAIN", "Main", "otherwise/action[0]"),
        ref("CHAIN", "Sub1", "when[0]"),
        ref("CHAIN", "Sub1", "when[0]/action[0]"),
        ref("CHAIN", "Sub2", "when[0]"),
        ref("CHAIN", "Sub2", "when[0]/action[0]"),
        ref("CHAIN", "Sub3", "when[0]"),
        ref("CHAIN", "Sub3", "when[0]/action[0]"),
      ],
    ]);
  });
});

describe("producedRuntimePathRefs — multiple produced paths", () => {
  it("an `all:` menu producing TWO chained dispositions → two paths", () => {
    // Main.when[0] is an `all:` menu with two items, each delegating to a different expanded sub that produces.
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        useExpanded("when[0]/action[0]", "SubA", [
          when("when[0]/action[0]/when[0]", [recommend("when[0]/action[0]/when[0]/action[0]")]),
        ]),
        useExpanded("when[0]/action[1]", "SubB", [
          otherwise("when[0]/action[1]/otherwise", [
            recommend("when[0]/action[1]/otherwise/action[0]"),
          ]),
        ]),
      ]),
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toEqual([
      [
        ref("L", "Main", "when[0]"),
        ref("L", "Main", "when[0]/action[0]"),
        ref("L", "SubA", "when[0]"),
        ref("L", "SubA", "when[0]/action[0]"),
      ],
      [
        ref("L", "Main", "when[0]"),
        ref("L", "Main", "when[0]/action[1]"),
        ref("L", "SubB", "otherwise"),
        ref("L", "SubB", "otherwise/action[0]"),
      ],
    ]);
  });

  it("a sub reached via TWO parent branches in one run → both delegation nodes; the sub's rows once per path", () => {
    // Main has two when-branches, BOTH delegating to the SAME expanded Sub (authored once, inlined under each parent).
    // Two produced paths: each carries its own parent delegation node but the SAME Sub-local rows (authored-node
    // coverage, disc 151 refinement 7).
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        useExpanded("when[0]/action[0]", "Sub", [
          when("when[0]/action[0]/when[0]", [recommend("when[0]/action[0]/when[0]/action[0]")]),
        ]),
      ]),
      when("when[1]", [
        useExpanded("when[1]/action[0]", "Sub", [
          when("when[1]/action[0]/when[0]", [recommend("when[1]/action[0]/when[0]/action[0]")]),
        ]),
      ]),
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toEqual([
      [
        ref("L", "Main", "when[0]"),
        ref("L", "Main", "when[0]/action[0]"),
        ref("L", "Sub", "when[0]"),
        ref("L", "Sub", "when[0]/action[0]"),
      ],
      [
        ref("L", "Main", "when[1]"),
        ref("L", "Main", "when[1]/action[0]"),
        ref("L", "Sub", "when[0]"), // SAME Sub-local rows, re-rooted under the SECOND parent's prefix
        ref("L", "Sub", "when[0]/action[0]"),
      ],
    ]);
  });
});

describe("producedRuntimePathRefs — the three leaf-causes (no spurious re-root, no dropped produced action)", () => {
  // For each leaf-cause, a SECOND when-branch produces normally — so we can assert the leaf contributes nothing extra
  // AND the produced action is still found (never dropped). The leaf use-decision itself is never `produced`, so it is
  // not on any produced path → emits no ref at all in these trees, which is correct (it is not an ancestor of the
  // produced action). The KEY guarantee: the decomposer does NOT push a frame / re-root into the non-inlined target.

  const sharedProducer = when("when[1]", [recommend("when[1]/action[0]")]);

  it("QUALIFIED `Lib.Sub` use-decision (expanded:false, leaf) → no re-root; the real path is unaffected", () => {
    const tree: MinimalViewNode[] = [
      when("when[0]", [useLeaf("when[0]/action[0]", "Sub", "OtherLib")]),
      sharedProducer,
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toEqual([[ref("L", "Main", "when[1]"), ref("L", "Main", "when[1]/action[0]")]]);
  });

  it("UNRESOLVED target (expanded:false, leaf, no children) → no re-root", () => {
    const tree: MinimalViewNode[] = [
      when("when[0]", [useLeaf("when[0]/action[0]", "Missing")]),
      sharedProducer,
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toEqual([[ref("L", "Main", "when[1]"), ref("L", "Main", "when[1]/action[0]")]]);
  });

  it("CYCLIC re-entry (outer expands, inner re-entry is a leaf) → decompose to the boundary row, NOT into the cycle target", () => {
    // Main --use A (expanded)--> A.when[0] --use Main (CYCLIC re-entry, leaf)--> stops. A ALSO recommends on otherwise.
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        useExpanded("when[0]/action[0]", "A", [
          when("when[0]/action[0]/when[0]", [
            useLeaf("when[0]/action[0]/when[0]/action[0]", "Main"), // cyclic re-entry: leaf, no re-root
          ]),
          otherwise("when[0]/action[0]/otherwise", [
            recommend("when[0]/action[0]/otherwise/action[0]"),
          ]),
        ]),
      ]),
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "Main" });
    // The produced action is under A's otherwise; the cyclic leaf under A's when[0] contributes no spurious frame/ref.
    expect(paths).toEqual([
      [
        ref("L", "Main", "when[0]"),
        ref("L", "Main", "when[0]/action[0]"),
        ref("L", "A", "otherwise"),
        ref("L", "A", "otherwise/action[0]"),
      ],
    ]);
  });
});

describe("producedRuntimePathRefs — the honesty contract (malformed trees → gaps, never a fabricated ref)", () => {
  // These trees are structurally IMPOSSIBLE on a real VM — they exist only to lock the residual-unmapped invariant
  // (disc 151 ref 5): a node the decomposer can't ground adds its raw nodeId to `gaps` and emits NO ref, and the
  // produced action below it is still recorded (never dropped) so the consumer can route it to unmapped-runtime-node.
  // These are the ONLY branches reachable solely via a malformed tree → they need explicit tests, not just prose.

  it("(a) a node whose nodeId is NOT under its frame's prefix → that node gaps; the produced action is NOT dropped", () => {
    // The recommend's nodeId does not extend the use-boundary's nodeId (`when[9]/...` is not under `when[0]/action[0]`).
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        useExpanded("when[0]/action[0]", "Sub", [
          // mis-prefixed child: not under "when[0]/action[0]" → cannot be stripped → gap, no ref.
          recommend("when[9]/orphan/action[0]"),
        ]),
      ]),
    ];
    const paths = producedRuntimePathRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toHaveLength(1); // the produced action is recorded, NOT dropped
    const p = paths[0];
    expect(p.gaps).toEqual(["when[9]/orphan/action[0]"]); // the ungroundable node is surfaced
    // the grounded prefix (Main's two delegation rows) is still present; NO fabricated ref for the orphan.
    expect(p.refs).toEqual([
      ref("L", "Main", "when[0]"),
      ref("L", "Main", "when[0]/action[0]"),
    ]);
    expect(p.refs.some((r) => r.decision === "" || r.decision === undefined)).toBe(false);
  });

  it("(b) a produced action below a missing-`target.name` expanded boundary → ungrounded; gaps non-empty, no `decision:''` ref", () => {
    // An expanded use-decision whose target carries NO name (the `?? \"\"` fabrication we DROPPED). Its inlined children
    // recurse in an UNGROUNDED frame: every descendant gaps, the boundary's OWN row is still grounded under Main.
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        {
          nodeId: "when[0]/action[0]",
          kind: "action",
          action: {
            produced: false,
            actionKind: "use-decision",
            expanded: true,
            target: { name: "" }, // ABSENT target name (empty) → ungrounded sub-frame
          },
          children: [
            when("when[0]/action[0]/when[0]", [
              recommend("when[0]/action[0]/when[0]/action[0]"),
            ]),
          ],
        },
      ]),
    ];
    const paths = producedRuntimePathRefs(tree, { lib: "L", decision: "Main" });
    expect(paths).toHaveLength(1); // produced action recorded, NOT dropped
    const p = paths[0];
    // grounded: ONLY Main's path rows (the when + the boundary's own action row); the ungrounded sub rows are gaps.
    expect(p.refs).toEqual([
      ref("L", "Main", "when[0]"),
      ref("L", "Main", "when[0]/action[0]"),
    ]);
    expect(p.gaps).toEqual([
      "when[0]/action[0]/when[0]",
      "when[0]/action[0]/when[0]/action[0]",
    ]);
    // CRITICAL: no fabricated `decision: ""` ref leaked in.
    expect(p.refs.some((r) => r.decision === "")).toBe(false);
  });
});

describe("producedRuntimePathRefs — BACK-COMPAT: no-boundary case reduces to ancestorChain", () => {
  it("a NON-chained tree → each produced path == its inclusive ancestorChain (all under the root frame)", () => {
    // The #170 minimal D: when[0]/when[0]/action[0] (approve) + when[0]/otherwise/action[0] + otherwise/action[0].
    const tree: MinimalViewNode[] = [
      when("when[0]", [
        when("when[0]/when[0]", [recommend("when[0]/when[0]/action[0]")]),
        otherwise("when[0]/otherwise", [recommend("when[0]/otherwise/action[0]")]),
      ]),
      otherwise("otherwise", [recommend("otherwise/action[0]")]),
    ];
    const paths = groundedRefs(tree, { lib: "L", decision: "D" });

    // Derive the EXPECTED from the OLD primitive (collectProduced + ancestorChain) and compare 1:1.
    const produced: MinimalViewNode[] = [];
    collectProduced(tree, produced);
    const expected = produced.map((p) =>
      ancestorChain(p.nodeId).map((id) => ref("L", "D", id)),
    );
    expect(paths).toEqual(expected);

    // explicit form, for readability
    expect(paths).toEqual([
      [
        ref("L", "D", "when[0]"),
        ref("L", "D", "when[0]/when[0]"),
        ref("L", "D", "when[0]/when[0]/action[0]"),
      ],
      [
        ref("L", "D", "when[0]"),
        ref("L", "D", "when[0]/otherwise"),
        ref("L", "D", "when[0]/otherwise/action[0]"),
      ],
      [ref("L", "D", "otherwise"), ref("L", "D", "otherwise/action[0]")],
    ]);
  });
});

// ── graph helper (mirrors run.test.ts / provenance index.ts) ────────────────────
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
