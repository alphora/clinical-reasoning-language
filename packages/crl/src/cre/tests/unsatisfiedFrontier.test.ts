import { describe, it, expect } from "vitest";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";

import { renderScenario } from "../viewModel";
import {
  unsatisfiedFrontier,
  frontierShortLabel,
  frontierTooltip,
  type BranchConditionView,
  type Frontier,
} from "../viewModel";

// #224 i.4b — "which conjunct failed": the unsatisfied frontier of a false compound guard,
// plus its two display-only formatters. Unit-tested on constructed `BranchConditionView`
// literals (precise over every rule) + ONE real round-trip pinning "healthy ⇒ never opaque".

// ── builders ──────────────────────────────────────────────────────────────────
const ref = (name: string, satisfied?: boolean, libraryName?: string): BranchConditionView => ({
  op: "ref",
  ...(satisfied !== undefined ? { satisfied } : {}),
  concept: { name, ...(libraryName ? { libraryName } : {}) },
});
const and = (satisfied: boolean | undefined, ...operands: BranchConditionView[]): BranchConditionView => ({
  op: "and",
  ...(satisfied !== undefined ? { satisfied } : {}),
  operands,
});
const or = (satisfied: boolean | undefined, ...operands: BranchConditionView[]): BranchConditionView => ({
  op: "or",
  ...(satisfied !== undefined ? { satisfied } : {}),
  operands,
});

const kinds = (f: Frontier): string[] => f.map((i) => i.kind);
const hasOpaque = (f: Frontier): boolean =>
  f.some((i) => i.kind === "opaque" || (i.kind === "no-alternative" && i.alternatives.some((a) => hasOpaque(a.frontier))));

describe("unsatisfiedFrontier — shape rules", () => {
  it("`A and B`, B false → the false conjunct [B]", () => {
    const f = unsatisfiedFrontier(and(false, ref("A", true), ref("B", false)));
    expect(f).toEqual([{ kind: "ref", concept: { name: "B" } }]);
  });

  it("`A or B` all-false → one `no-alternative` carrying per-alt sub-frontiers + labels", () => {
    const f = unsatisfiedFrontier(or(false, ref("A", false), ref("B", false)));
    expect(f).toEqual([
      {
        kind: "no-alternative",
        alternatives: [
          { label: "A", frontier: [{ kind: "ref", concept: { name: "A" } }] },
          { label: "B", frontier: [{ kind: "ref", concept: { name: "B" } }] },
        ],
      },
    ]);
  });

  it("`(A or B) and C`, C false while (A or B) holds → [C]", () => {
    const f = unsatisfiedFrontier(and(false, or(true, ref("A", true), ref("B", false)), ref("C", false)));
    expect(f).toEqual([{ kind: "ref", concept: { name: "C" } }]);
  });

  it("`A and B` both false → both conjuncts surface", () => {
    const f = unsatisfiedFrontier(and(false, ref("A", false), ref("B", false)));
    expect(kinds(f)).toEqual(["ref", "ref"]);
    expect(f.map((i) => (i.kind === "ref" ? i.concept.name : "?"))).toEqual(["A", "B"]);
  });

  it("`A and A` false → dedup to one ref", () => {
    const f = unsatisfiedFrontier(and(false, ref("A", false), ref("A", false)));
    expect(f).toEqual([{ kind: "ref", concept: { name: "A" } }]);
  });

  it("cross-lib `A and Lib.A` (distinct-looking, same identity) dedups by concept key", () => {
    // With the i.4 root fix, a bare and a self-qualified leaf carry the SAME resolved libraryName,
    // so they dedup. Here two leaves with the SAME concrete identity collapse to one.
    const f = unsatisfiedFrontier(and(false, ref("A", false, "Lib"), ref("A", false, "Lib")));
    expect(f).toEqual([{ kind: "ref", concept: { name: "A", libraryName: "Lib" } }]);
  });

  it("all-satisfied `and` → empty frontier", () => {
    expect(unsatisfiedFrontier(and(true, ref("A", true), ref("B", true)))).toEqual([]);
  });

  it("dedups repeated `no-alternative` items (`(A or B) and (A or B)`)", () => {
    const g = or(false, ref("A", false), ref("B", false));
    const f = unsatisfiedFrontier(and(false, g, g));
    expect(kinds(f)).toEqual(["no-alternative"]);
  });

  it("dedups NESTED sub-frontiers too — `A or (B and B)` → alt 2 carries ONE `B`, not two", () => {
    const f = unsatisfiedFrontier(or(false, ref("A", false), and(false, ref("B", false), ref("B", false))));
    expect(f).toHaveLength(1);
    const item = f[0]!;
    if (item.kind === "no-alternative") {
      expect(item.alternatives[1]!.frontier).toEqual([{ kind: "ref", concept: { name: "B" } }]);
    } else throw new Error("expected no-alternative");
  });

  it("does NOT collapse `no-alternative` items that RENDER alike but differ in concept identity (structural key)", () => {
    // `(LibA.A or X) and (LibB.A or X)` all-false: both OR-groups render bare as "A or X", but their alternatives
    // carry distinct resolved libraryNames → the structural key keeps them distinct (never drops a real blocker).
    const gA = or(false, ref("A", false, "LibA"), ref("X", false));
    const gB = or(false, ref("A", false, "LibB"), ref("X", false));
    const f = unsatisfiedFrontier(and(false, gA, gB));
    expect(kinds(f)).toEqual(["no-alternative", "no-alternative"]);
  });
});

describe("unsatisfiedFrontier — opaque is the DRIFT-only escape hatch", () => {
  it("a HEALTHY (fully-evaluated) false compound NEVER yields opaque", () => {
    const healthy: BranchConditionView[] = [
      and(false, ref("A", true), ref("B", false)),
      and(false, ref("A", false), ref("B", false)),
      or(false, ref("A", false), ref("B", false)),
      and(false, or(true, ref("A", true), ref("B", false)), ref("C", false)),
      and(false, or(false, ref("A", false), ref("B", false)), ref("C", false)),
    ];
    for (const v of healthy) expect(hasOpaque(unsatisfiedFrontier(v))).toBe(false);
  });

  it("a degraded subtree (child `satisfied` undefined, node false) → opaque", () => {
    // zipConditionTrace degrades a structurally-mismatched subtree to unevaluated (no `satisfied`);
    // a false parent that can't pinpoint a false child falls back to opaque, labelled with the node.
    const f = unsatisfiedFrontier(and(false, ref("A", undefined)));
    expect(f).toEqual([{ kind: "opaque", label: "A" }]);
  });

  it("a false `or` with a degraded alternative → that alternative collapses to its own opaque (never a silent empty alt)", () => {
    const f = unsatisfiedFrontier(or(false, ref("A", false), ref("B", undefined)));
    expect(f).toHaveLength(1);
    const item = f[0]!;
    expect(item.kind).toBe("no-alternative");
    if (item.kind === "no-alternative") {
      expect(item.alternatives[1]!.frontier).toEqual([{ kind: "opaque", label: "B" }]);
    }
  });

  it("a zip-degraded `or` ROOT (node false, own `satisfied` undefined) → opaque, NOT an empty frontier", () => {
    // The `and` branch has an inline opaque fallback; an `or` root whose `satisfied` never resolved would otherwise
    // slip through as []. The top-level guard catches it so the label is never a trailing "unmet: ".
    const degradedOrRoot: BranchConditionView = { op: "or", operands: [ref("A", undefined), ref("B", undefined)] };
    const f = unsatisfiedFrontier(degradedOrRoot);
    expect(f).toEqual([{ kind: "opaque", label: "A or B" }]);
  });
});

describe("frontierShortLabel", () => {
  it("single ref → the concept name", () => {
    expect(frontierShortLabel([{ kind: "ref", concept: { name: "B" } }])).toBe("B");
  });
  it("no-alternative → fixed phrase", () => {
    expect(frontierShortLabel(unsatisfiedFrontier(or(false, ref("A", false), ref("B", false))))).toBe(
      "no alternative held",
    );
  });
  it("opaque → its label; multiple → joined", () => {
    expect(
      frontierShortLabel([
        { kind: "ref", concept: { name: "A" } },
        { kind: "opaque", label: "X" },
      ]),
    ).toBe("A, X");
  });
  it("empty frontier → empty string", () => {
    expect(frontierShortLabel([])).toBe("");
  });
});

describe("frontierTooltip — per-alternative detail", () => {
  it("`A or (B and C)` all-false with C the blocker of alt 2 → the disc example string", () => {
    const v = or(false, ref("A", false), and(false, ref("B", true), ref("C", false)));
    expect(frontierTooltip(unsatisfiedFrontier(v))).toBe("alt 1 (A): unmet; alt 2 (B and C): C unmet");
  });
  it("a top-level ref frontier → '<name> unmet' (reads cleanly inside a mixed frontier)", () => {
    expect(frontierTooltip([{ kind: "ref", concept: { name: "B" } }])).toBe("B unmet");
  });
  it("mixed frontier `(A or B) and C` all-false → OR breakdown + bare conjunct, no dangling token", () => {
    const v = and(false, or(false, ref("A", false), ref("B", false)), ref("C", false));
    expect(frontierTooltip(unsatisfiedFrontier(v))).toBe("alt 1 (A): unmet; alt 2 (B): unmet; C unmet");
  });
  it("nested `or` alternative → 'unmet' (NOT the ungrammatical 'no alternative held unmet')", () => {
    // `A or (B or C)` all-false: alt 2 is a nested false `or` → wholly unmet.
    const v = or(false, ref("A", false), or(false, ref("B", false), ref("C", false)));
    expect(frontierTooltip(unsatisfiedFrontier(v))).toBe("alt 1 (A): unmet; alt 2 (B or C): unmet");
  });
});

// ── round-trip: a real false compound guard through renderScenario ─────────────
function graphFrom(crlSrc: string, celSrc: string): ResolvedCelGraph {
  const crl = parseInput(crlSrc);
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  const coversTarget: RegistryEntry = {
    name: crl.library.name,
    filePath: "inline.crl",
    ast: crl,
    isRoot: true,
    origin: "root",
  };
  return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
}

describe("unsatisfiedFrontier — real round-trip (renderScenario)", () => {
  const CRL = `library "GuardLib".
concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.
decision "D":
first:
- when "Leaf A" and "Leaf B" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
activity "Approve":
- request CPGServiceRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.`;

  // Leaf A present, Leaf B ABSENT → the `and` guard is evaluated-false.
  const CEL = `library "Cases".
covers "GuardLib".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://e|leaf-a".
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
case "onlyA":
- subject is "Pat".
- fact is "fA".
- result is "D" is "Deny".`;

  it("the false `and` guard's expr yields [Leaf B] with NO opaque (healthy trace)", () => {
    const vm = renderScenario(graphFrom(CRL, CEL));
    const when = vm.scenarios[0]!.tree.find((n) => n.kind === "when")!;
    expect(when.condition!.satisfied).toBe(false);
    const f = unsatisfiedFrontier(when.condition!.expr);
    expect(hasOpaque(f)).toBe(false);
    expect(f).toEqual([{ kind: "ref", concept: { name: "Leaf B", libraryName: "GuardLib" } }]);
  });
});
