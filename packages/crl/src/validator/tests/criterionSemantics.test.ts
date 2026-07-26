import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { Validator, type ValidationError } from "../validator";
import { ReferenceResolver } from "../referenceResolver";
import type { LibraryScope, SourceContext } from "../../imports/scopes";
import type { Decision } from "../../ast/types";
import type { RegistryEntry } from "../../imports/types";

// #224 ii.1a-2 — SEMANTIC validation for `criterion`: name uniqueness
// (concept XOR criterion) + empty name; cycle detection over the criterion graph;
// and targeted `criterion-misuse` diagnostics for a criterion name in a
// concept-only slot (`defined as`, `sem-*` composition, `definition is` narrative,
// an action guard). Runs end-to-end through buildCRL (so classification has run)
// then the Validator, mirroring the real single-file path.

function validate(src: string): ValidationError[] {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("build failed: " + JSON.stringify(built.errors));
  }
  return new Validator().validate(built.result).errors;
}

// Soft-mode result: `errors` are the findings that survived soft demotion.
// A criterion misuse / cycle is a structural defect (NOT incomplete-authoring
// state), so it must stay an ERROR even under soft.
function validateSoft(src: string): { errors: ValidationError[]; warnings: ValidationError[] } {
  const built = buildCRL(src);
  if (!built.success || !built.result) {
    throw new Error("build failed: " + JSON.stringify(built.errors));
  }
  const r = new Validator().validate(built.result, { soft: true });
  return { errors: r.errors, warnings: r.warnings };
}

const CONCEPTS = `concept "Age Qualifies":
- type is Observation.
- code is \`age\`.
concept "Has Diagnosis":
- type is Condition.
- code is \`dx\`.`;

const ACTS = `activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.`;

const CRIT = `criterion "Eligible":
- when ( "Age Qualifies" and "Has Diagnosis" ).`;

describe("criterion — name uniqueness (concept XOR criterion)", () => {
  it("concept then criterion with the SAME name → duplicate-name (names the prior kind)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "Age Qualifies":
- when ( "Has Diagnosis" ).
${ACTS}`);
    const dup = errs.filter((e) => e.kind === "duplicate-name");
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toMatch(/already declared as a concept/i);
  });

  it("criterion then concept with the SAME name → duplicate-name (order-independent)", () => {
    const errs = validate(`library "G".
criterion "Age Qualifies":
- when ( "Has Diagnosis" ).
${CONCEPTS}
${ACTS}`);
    const dup = errs.filter((e) => e.kind === "duplicate-name");
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toMatch(/already declared as a criterion/i);
  });

  it("two criteria with the SAME name → duplicate criterion name", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "Eligible":
- when ( "Age Qualifies" ).
criterion "Eligible":
- when ( "Has Diagnosis" ).
${ACTS}`);
    const dup = errs.filter((e) => e.kind === "duplicate-name");
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toContain("Duplicate criterion name: Eligible");
  });

  it("a DECISION and a criterion may share a name (per-kind bucket, not shared)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
decision "Eligible":
first:
- when "Age Qualifies" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTS}`);
    expect(errs.filter((e) => e.kind === "duplicate-name")).toHaveLength(0);
  });

  it("an empty criterion name → empty-name", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "":
- when ( "Age Qualifies" ).
${ACTS}`);
    const empty = errs.filter((e) => e.kind === "empty-name");
    expect(empty).toHaveLength(1);
    expect(empty[0].message).toContain("Criterion name cannot be empty");
  });
});

describe("criterion — cycle detection", () => {
  it("a self-referential criterion → criterion-cycle", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "Loop":
- when ( "Loop" and "Age Qualifies" ).
${ACTS}`);
    const cyc = errs.filter((e) => e.kind === "criterion-cycle");
    expect(cyc).toHaveLength(1);
    expect(cyc[0].message).toMatch(/Criterion cycle detected/);
  });

  it("a mutual A→B→A criterion cycle → criterion-cycle", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "A":
- when ( "B" and "Age Qualifies" ).
criterion "B":
- when ( "A" and "Has Diagnosis" ).
${ACTS}`);
    const cyc = errs.filter((e) => e.kind === "criterion-cycle");
    expect(cyc.length).toBeGreaterThanOrEqual(1);
  });

  it("an acyclic criterion chain A→B is NOT a cycle", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "A":
- when ( "B" and "Age Qualifies" ).
criterion "B":
- when ( "Has Diagnosis" ).
${ACTS}`);
    expect(errs.filter((e) => e.kind === "criterion-cycle")).toHaveLength(0);
  });
});

describe("criterion — concept-only-slot misuse", () => {
  it("a criterion in a `defined as` bare ref → criterion-misuse (defined-as)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
concept "Combo":
- type is Observation.
- defined as "Eligible".
${ACTS}`);
    const mis = errs.filter((e) => e.kind === "criterion-misuse");
    expect(mis).toHaveLength(1);
    expect(mis[0]).toMatchObject({ kind: "criterion-misuse", slot: "defined-as" });
    // the message names the LEGAL places (a `when` guard OR a criterion body) — it
    // must not falsely imply a criterion is only usable in a `when` guard.
    expect(mis[0].message).toMatch(/`when` guard or another criterion's body/);
    // it must NOT degrade to a generic unresolved-reference
    expect(errs.some((e) => e.kind === "unresolved-reference")).toBe(false);
  });

  it("a criterion in a `sem-*` composition → criterion-misuse (composition)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
concept "Combo":
- type is Observation.
- defined as ( "Eligible" sem-or "Age Qualifies" ).
${ACTS}`);
    const mis = errs.filter((e) => e.kind === "criterion-misuse");
    expect(mis).toHaveLength(1);
    expect(mis[0].slot).toBe("composition");
  });

  it("a criterion in a `definition is` narrative → criterion-misuse (narrative)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
concept "Combo":
- definition is "Eligible" present.
${ACTS}`);
    const mis = errs.filter((e) => e.kind === "criterion-misuse");
    expect(mis).toHaveLength(1);
    expect(mis[0].slot).toBe("narrative");
  });

  it("a criterion in an action guard (`unless`) → criterion-misuse (action-guard)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
decision "Menu":
- when "Age Qualifies" then:
  any:
  - recommend activity "Approve".
  - recommend activity "Deny" unless "Eligible".
  end.
${ACTS}`);
    const mis = errs.filter((e) => e.kind === "criterion-misuse");
    expect(mis).toHaveLength(1);
    expect(mis[0].slot).toBe("action-guard");
    expect(mis[0].message).toMatch(/action guard/);
  });

  it("a criterion in an action guard (`only when`) → criterion-misuse (action-guard)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
decision "Menu":
- when "Age Qualifies" then:
  any:
  - recommend activity "Approve".
  - recommend activity "Deny" only when "Eligible".
  end.
${ACTS}`);
    const mis = errs.filter((e) => e.kind === "criterion-misuse");
    expect(mis).toHaveLength(1);
    expect(mis[0].slot).toBe("action-guard");
  });
});

describe("criterion — valid uses produce NO misuse/unresolved", () => {
  it("a criterion used in a decision `when` guard is valid", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
decision "D":
first:
- when "Eligible" and "Age Qualifies" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTS}`);
    expect(errs.filter((e) => e.kind === "criterion-misuse")).toHaveLength(0);
    expect(errs.filter((e) => e.kind === "unresolved-reference")).toHaveLength(0);
  });

  it("a criterion referencing another criterion in its body is valid", () => {
    const errs = validate(`library "G".
${CONCEPTS}
${CRIT}
criterion "Fully Eligible":
- when ( "Eligible" and "Age Qualifies" ).
${ACTS}`);
    expect(errs.filter((e) => e.kind === "criterion-misuse")).toHaveLength(0);
    expect(errs.filter((e) => e.kind === "unresolved-reference")).toHaveLength(0);
    expect(errs.filter((e) => e.kind === "criterion-cycle")).toHaveLength(0);
  });

  it("an undefined CONCEPT inside a criterion body → unresolved-reference (diagnosed at the criterion)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "Eligible":
- when ( "Age Qualifies" and "Nonexistent Concept" ).
${ACTS}`);
    const unresolved = errs.filter((e) => e.kind === "unresolved-reference");
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].message).toContain("Nonexistent Concept");
    // the container label names the criterion (not the generic "statement").
    expect(unresolved[0].message).toContain('in criterion "Eligible"');
  });
});

describe("criterion — misuse and cycle are structural (survive soft mode)", () => {
  it("criterion-misuse stays an ERROR under soft mode (not demoted to a warning)", () => {
    const src = `library "G".
${CONCEPTS}
${CRIT}
concept "Combo":
- type is Observation.
- defined as "Eligible".
${ACTS}`;
    const { errors, warnings } = validateSoft(src);
    expect(errors.some((e) => e.kind === "criterion-misuse")).toBe(true);
    expect(warnings.some((e) => e.kind === "criterion-misuse")).toBe(false);
  });

  it("criterion-cycle stays an ERROR under soft mode", () => {
    const src = `library "G".
${CONCEPTS}
criterion "A":
- when ( "B" and "Age Qualifies" ).
criterion "B":
- when ( "A" ).
${ACTS}`;
    const { errors, warnings } = validateSoft(src);
    expect(errors.some((e) => e.kind === "criterion-cycle")).toBe(true);
    expect(warnings.some((e) => e.kind === "criterion-cycle")).toBe(false);
  });
});

// #224 iii.2 — the decision-negation MERGE GATE. `not` parses + lowers structurally (iii.2
// language), but the emit/eval/display seams land in iii.3; until then the validator rejects any
// source-side `not` so no half-wired document ships. Non-soft-demotable structural gate.
describe("#224 iii.2 — `decision-negation-unsupported` merge gate", () => {
  const negs = (errs: ValidationError[]) => errs.filter((e) => e.kind === "decision-negation-unsupported");

  it("rejects `not` in a decision `when` guard", () => {
    const errs = validate(`library "G".
${CONCEPTS}
decision "D":
- when "Age Qualifies" and not "Has Diagnosis" then recommend activity "Approve".
${ACTS}`);
    expect(negs(errs)).toHaveLength(1);
  });

  it("rejects `not` in a NESTED `when` guard", () => {
    const errs = validate(`library "G".
${CONCEPTS}
decision "D":
- when "Age Qualifies" then:
  - when not "Has Diagnosis" then recommend activity "Approve".
  end.
${ACTS}`);
    expect(negs(errs)).toHaveLength(1);
  });

  it("rejects `not` in a criterion BODY (even an unreferenced criterion)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
criterion "Excluded":
- when ( not "Has Diagnosis" ).
decision "D":
- when "Age Qualifies" then recommend activity "Approve".
${ACTS}`);
    expect(negs(errs)).toHaveLength(1);
  });

  it("`not not A` reports ONE (outermost negation only)", () => {
    const errs = validate(`library "G".
${CONCEPTS}
decision "D":
- when not not "Has Diagnosis" then recommend activity "Approve".
${ACTS}`);
    expect(negs(errs)).toHaveLength(1);
  });

  it("stays a hard ERROR under soft mode (non-soft-demotable structural gate)", () => {
    const src = `library "G".
${CONCEPTS}
decision "D":
- when not "Has Diagnosis" then recommend activity "Approve".
${ACTS}`;
    const { errors, warnings } = validateSoft(src);
    expect(errors.some((e) => e.kind === "decision-negation-unsupported")).toBe(true);
    expect(warnings.some((e) => e.kind === "decision-negation-unsupported")).toBe(false);
  });

  it("a positive guard produces NO negation gate error", () => {
    const errs = validate(`library "G".
${CONCEPTS}
decision "D":
- when "Age Qualifies" and "Has Diagnosis" then recommend activity "Approve".
${ACTS}`);
    expect(negs(errs)).toHaveLength(0);
  });

  it("multi-file: the gate error is STAMPED with the owning source's libraryName + filePath", () => {
    // Drive the scoped (multi-file) resolver path directly so the finding carries source attribution.
    const built = buildCRL(`library "G".
${CONCEPTS}
decision "D":
- when not "Has Diagnosis" then recommend activity "Approve".
${ACTS}`);
    if (!built.success || !built.result) throw new Error("build failed");
    const decision = built.result.statements.find((s) => s.type === "Decision") as Decision;
    const emptyNames = () => ({
      concepts: new Set<string>(),
      terminologies: new Set<string>(),
      decisions: new Set<string>(),
      activities: new Set<string>(),
      parameters: new Set<string>(),
      criteria: new Set<string>(),
    });
    const scope: LibraryScope = {
      currentLibrary: "G",
      filePath: "/proj/g.crl",
      origin: "local",
      localNames: emptyNames(),
      knownLibraries: new Map(),
      explicitIncludes: new Set(),
    };
    const sources: SourceContext[] = [
      { stmt: decision, entry: { name: "G", filePath: "/proj/g.crl", ast: built.result, isRoot: true, origin: "local" } as RegistryEntry, scope },
    ];
    const errs = new ReferenceResolver().validate(built.result, sources);
    const neg = errs.find((e) => e.kind === "decision-negation-unsupported");
    expect(neg).toBeDefined();
    expect(neg!.libraryName).toBe("G");
    expect(neg!.filePath).toBe("/proj/g.crl");
  });
});
