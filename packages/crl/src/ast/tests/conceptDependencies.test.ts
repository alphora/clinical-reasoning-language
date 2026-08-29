import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import type { CRL, Concept } from "../types";
import { conceptDependencies } from "../conceptDependencies";

/**
 * #189 — the concept DEPENDENCY EDGE: which concepts does a definition READ?
 *
 * ⚠ This is what the case-feature question walk traverses, so an edge form that returns `[]` by accident is
 * indistinguishable from "this concept depends on nothing" — and that is exactly how the walk came to reach
 * ONE question on a chain where four concepts carried codes. Every definition form gets a case here, and the
 * ref-less ones are pinned as deliberately empty rather than left to a fallback.
 */

const parse = (src: string): CRL => {
  const r = buildCRL(src) as unknown as { success: boolean; result?: CRL };
  expect(r.success, src).toBe(true);
  return r.result!;
};

const depsOf = (src: string, name: string): string[] => {
  const c = parse(src).statements.find(
    (s) => s.type === "Concept" && (s as Concept).name === name,
  ) as Concept;
  return conceptDependencies(c).map((r) => (typeof r === "string" ? r : r.name));
};

const LEAVES =
  'library "T".\n' +
  'concept "A":\n- type is Observation.\n- value type is Quantity.\n- code is `a`.\n' +
  'concept "B":\n- type is Observation.\n- value type is Quantity.\n- code is `b`.\n' +
  'concept "C":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is `c`.\n';

describe("conceptDependencies — every definition form is an edge", () => {
  it("`defined as` composition — the operands, left to right", () => {
    expect(
      depsOf(
        LEAVES + 'concept "D":\n- value type is boolean.\n- defined as ( "A" sem-or "B" ).\n',
        "D",
      ),
    ).toEqual(["A", "B"]);
  });

  it("⭐ `definition is` narrative — the concept arguments, left to right", () => {
    // The form the walk used to treat as edge-less. `of "A" and "B"` is a narrative argument GROUP, not a
    // composition, so it is reached through the conjunction arm rather than `flattenDefinedAsBody`.
    expect(
      depsOf(
        LEAVES +
          'concept "D":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n' +
          '- definition is body mass index of "A" and "B".\n',
        "D",
      ),
    ).toEqual(["A", "B"]);
  });

  it("⭐ `definition is` narrative — a single ref argument", () => {
    expect(
      depsOf(
        LEAVES +
          'concept "D":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n' +
          "- definition is \"A\" at least 30 'kg/m2'.\n",
        "D",
      ),
    ).toEqual(["A"]);
  });

  it("⭐ reduction over a NAMED target — the named concept", () => {
    expect(
      depsOf(
        LEAVES +
          'concept "D":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n' +
          '- definition is most recent "C".\n',
        "D",
      ),
    ).toEqual(["C"]);
  });

  it("⚠ reduction over `this` is NOT an edge — it reads the concept's OWN records", () => {
    // Following it would make the concept its own dependency. The distinction is "this concept IS an answer
    // slot" versus "this concept DEPENDS on one"; the walk lists the concept itself by pre-order regardless.
    expect(
      depsOf(
        'library "T".\nconcept "D":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n' +
          "- code is `d`.\n- definition is most recent this.\n",
        "D",
      ),
    ).toEqual([]);
  });

  it("a bare `code is` concept has no definition and therefore no edges", () => {
    expect(depsOf(LEAVES, "A")).toEqual([]);
  });

  it("duplicates are PRESERVED — the caller's traversal dedups, not this function", () => {
    expect(
      depsOf(
        LEAVES +
          'concept "D":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n' +
          '- definition is body mass index of "A" and "A".\n',
        "D",
      ),
    ).toEqual(["A", "A"]);
  });
});
