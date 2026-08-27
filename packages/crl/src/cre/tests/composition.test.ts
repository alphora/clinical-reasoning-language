import { readFileSync } from "fs";
import { join } from "path";

import { parseInput } from "../../ast/tests/parseInput";
import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { Registry, RegistryEntry } from "../../imports/types";

import { runCel } from "../run";
import type { CaseRun, CompositionTrace } from "../run";

/** Single-library inline graph (crlRegistry absent — concept map falls back to coversTarget). */
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
  return { filePath: "inline.cel", cel: built.result, coversTarget, celParseErrors: [], diagnostics: [] };
}

/** Multi-library inline graph — builds a crlRegistry so cross-library operands resolve. */
function graphFromMulti(crlSrcs: string[], celSrc: string, coveredLibName: string): ResolvedCelGraph {
  const built = buildCEL(celSrc);
  if (!built.success || !built.result) {
    throw new Error("inline CEL build failed: " + JSON.stringify(built.errors));
  }
  const byNameLocal = new Map<string, RegistryEntry>();
  let coversTarget: RegistryEntry | undefined;
  crlSrcs.forEach((src, i) => {
    const crl = parseInput(src);
    const name = crl.library.name;
    const entry: RegistryEntry = {
      name,
      filePath: `inline-${i}.crl`,
      ast: crl,
      isRoot: name === coveredLibName,
      origin: "local",
    };
    if (name) byNameLocal.set(name, entry);
    if (name === coveredLibName) coversTarget = entry;
  });
  if (!coversTarget) throw new Error(`covered library "${coveredLibName}" not found`);
  const crlRegistry: Registry = { byNameLocal, byNamePackage: new Map() };
  return { filePath: "inline.cel", cel: built.result, coversTarget, crlRegistry, celParseErrors: [], diagnostics: [] };
}

function statuses(graph: ResolvedCelGraph): string[] {
  return runCel(graph).runs.map((r) => `${r.case}:${r.status}`);
}

function whenNode(run: CaseRun, concept: string) {
  return run.trace.find((n) => n.concept === concept);
}

const ACTIVITIES = `activity "Approve":
- request CPGServiceRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.`;

const PATIENT = `fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".`;

describe("CRE — defined as composition (#126)", () => {
  // ---- sem-and (composite is pure-composition: no type/code) ----
  const AND_CRL = `# A
library "AndLib".
concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.
concept "A And B":
- defined as ( "Leaf A" sem-and "Leaf B" ).
decision "D":
first:
- when "A And B" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  // CEL uses QUALIFIED `defined by "Lib"."Concept"` (the shape validate_cel accepts;
  // a bare `defined by "X"` is read as a FHIR type).
  const AND_CEL = `# AC
library "AndCases".
covers "AndLib".
${PATIENT}
fact "fA":
- date is "2026-01-01".
- defined by "AndLib"."Leaf A".
fact "fB":
- date is "2026-01-01".
- defined by "AndLib"."Leaf B".
fact "fAB":
- date is "2026-01-01".
- defined by "AndLib"."A And B".
case "both leaves -> approve":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "D" is "Approve".
case "drop A -> deny":
- subject is "Pat".
- fact is "fB".
- result is "D" is "Deny".
case "drop B -> deny":
- subject is "Pat".
- fact is "fA".
- result is "D" is "Deny".
case "neither -> deny":
- subject is "Pat".
- result is "D" is "Deny".
case "direct fact on pure composite -> rejected":
- subject is "Pat".
- fact is "fAB".
- result is "D" is "Approve".`;

  it("sem-and: satisfied iff ALL operands are asserted (drop either → unsatisfied)", () => {
    expect(statuses(graphFrom(AND_CRL, AND_CEL))).toEqual([
      "both leaves -> approve:pass",
      "drop A -> deny:pass",
      "drop B -> deny:pass",
      "neither -> deny:pass",
      // #189 (a): a fact directly asserting the RESOURCELESS composite "A And B" is now rejected — the case
      // errors (it has no FHIR resource, so `$apply` has no equivalent). The composite is satisfied only via
      // its operands ("both leaves" above), never by direct name-assertion.
      "direct fact on pure composite -> rejected:error",
    ]);
  });

  it("asserted ∪ composed removed (#189 (a)): a direct fact on a RESOURCELESS composite is rejected, not magically satisfied", () => {
    const run = runCel(graphFrom(AND_CRL, AND_CEL)).runs.find((r) =>
      r.case.startsWith("direct fact on pure composite"),
    )!;
    expect(run.status).toBe("error");
    expect(
      run.diagnostics.some((d) => /read-only/.test(d) && /A And B/.test(d)),
    ).toBe(true);
  });

  // ---- coded composite: `direct || composed` SURVIVES for a concept WITH a `code is` (a real record) ----
  // The (a) reject removes the magic ONLY for a resourceless-derived concept. A composite that ALSO carries a
  // `code is` + `type is` is a real case-feature: it may be asserted directly (its own resource) OR computed via
  // its composition — the legitimate union. This exercises the CRE's `direct || composed`; the coded-composite
  // EMIT of that union is #189-deferred (only the member-existence-fold shape emits total), so this is a
  // tree-lane test, not an emit-parity claim.
  const CODED_AND_CRL = `# CA
library "CodedAndLib".
concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.
concept "Coded AB":
- type is Observation.
- code is \`coded-ab\`.
- defined as ( "Leaf A" sem-and "Leaf B" ).
decision "D":
first:
- when "Coded AB" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const CODED_AND_CEL = `# CAC
library "CodedAndCases".
covers "CodedAndLib".
${PATIENT}
fact "fCodedAB":
- date is "2026-01-01".
- defined by "CodedAndLib"."Coded AB".
case "direct fact on CODED composite -> approve (composition false, direct true)":
- subject is "Pat".
- fact is "fCodedAB".
- result is "D" is "Approve".`;

  // A BARE fact (no authored `code is`) on the coded composite: the DEGENERATE member — a member of the named
  // concept's local set by construction, so `direct=true` in BOTH the projectless harness and a project lane (panel
  // disc 511 Claude #5 — an authored token would ride the projectless name-fallback and prove less).
  it("coded composite: `direct || composed` survives — a directly-asserted coded composite approves even with a false composition", () => {
    const r = runCel(graphFrom(CODED_AND_CRL, CODED_AND_CEL));
    expect(r.runs[0].status).toBe("pass");
    const node = whenNode(r.runs[0], "Coded AB")!;
    expect(node.satisfied).toBe(true); // satisfied by the direct fact (its own record)
    expect(node.composition?.satisfied).toBe(false); // composition itself is false (no leaves asserted)
  });

  // ---- sem-or ----
  const OR_CRL = `# O
library "OrLib".
concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.
concept "A Or B":
- defined as ( "Leaf A" sem-or "Leaf B" ).
decision "D":
first:
- when "A Or B" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const OR_CEL = `# OC
library "OrCases".
covers "OrLib".
${PATIENT}
fact "fA":
- date is "2026-01-01".
- defined by "OrLib"."Leaf A".
fact "fB":
- date is "2026-01-01".
- defined by "OrLib"."Leaf B".
case "A only -> approve":
- subject is "Pat".
- fact is "fA".
- result is "D" is "Approve".
case "B only -> approve":
- subject is "Pat".
- fact is "fB".
- result is "D" is "Approve".
case "neither -> deny":
- subject is "Pat".
- result is "D" is "Deny".`;

  it("sem-or: satisfied iff ANY operand is asserted", () => {
    expect(statuses(graphFrom(OR_CRL, OR_CEL))).toEqual([
      "A only -> approve:pass",
      "B only -> approve:pass",
      "neither -> deny:pass",
    ]);
  });

  // ---- sem-not (closed-world) + nesting + group ----
  const NEST_CRL = `# N
library "NestLib".
concept "Indication":
- type is Observation.
- code is \`indication\`.
concept "Contra":
- type is Observation.
- code is \`contra\`.
concept "Eligible":
- defined as ( "Indication" sem-and ( sem-not "Contra" ) ).
decision "D":
first:
- when "Eligible" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const NEST_CEL = `# NC
library "NestCases".
covers "NestLib".
${PATIENT}
fact "fInd":
- date is "2026-01-01".
- defined by "NestLib"."Indication".
fact "fContra":
- date is "2026-01-01".
- defined by "NestLib"."Contra".
case "indication, no contra -> approve":
- subject is "Pat".
- fact is "fInd".
- result is "D" is "Approve".
case "indication + contra -> deny (sem-not closed-world)":
- subject is "Pat".
- fact is "fInd".
- fact is "fContra".
- result is "D" is "Deny".
case "no indication -> deny":
- subject is "Pat".
- result is "D" is "Deny".`;

  it("sem-not is closed-world (absence ⇒ true) + nesting + group", () => {
    expect(statuses(graphFrom(NEST_CRL, NEST_CEL))).toEqual([
      "indication, no contra -> approve:pass",
      "indication + contra -> deny (sem-not closed-world):pass",
      "no indication -> deny:pass",
    ]);
  });

  // ---- cross-library operand (qualified ref into an imported leaf) ----
  const LEAVES_CRL = `# L
library "LeavesLib".
concept "Leaf X":
- type is Observation.
- code is \`leaf-x\`.`;

  const MAIN_CRL = `# M
library "MainLib".
concept "Has X":
- defined as "LeavesLib"."Leaf X".
decision "D":
first:
- when "Has X" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const MAIN_CEL = `# MC
library "MainCases".
covers "MainLib".
${PATIENT}
fact "fX":
- date is "2026-01-01".
- defined by "LeavesLib"."Leaf X".
case "imported leaf present -> approve":
- subject is "Pat".
- fact is "fX".
- result is "D" is "Approve".
case "imported leaf absent -> deny":
- subject is "Pat".
- result is "D" is "Deny".`;

  it("composition resolves a cross-library operand (qualified ref into an imported leaf)", () => {
    expect(statuses(graphFromMulti([LEAVES_CRL, MAIN_CRL], MAIN_CEL, "MainLib"))).toEqual([
      "imported leaf present -> approve:pass",
      "imported leaf absent -> deny:pass",
    ]);
  });

  // ---- cycle guard (validator forbids this; CRE must terminate, not loop) ----
  const CYCLE_CRL = `# CY
library "CycleLib".
concept "A":
- defined as "B".
concept "B":
- defined as "A".
decision "D":
first:
- when "A" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const CYCLE_CEL = `# CYC
library "CycleCases".
covers "CycleLib".
${PATIENT}
case "cyclic composition -> deny + diagnostic":
- subject is "Pat".
- result is "D" is "Deny".`;

  it("cycle guard: cyclic `defined as` terminates (unsatisfied) with a diagnostic", () => {
    const r = runCel(graphFrom(CYCLE_CRL, CYCLE_CEL));
    expect(r.runs[0].status).toBe("pass"); // resolves to Deny, as asserted
    expect(r.runs[0].diagnostics.some((d) => /cycle/.test(d))).toBe(true);
  });

  // ---- satisfiable-cycle: a node on a cycle is still satisfiable via an alternate
  //      branch; the cycle-break false must not poison the cache (don't-memoize invariant) ----
  const SATCYCLE_CRL = `# SC
library "SatCycleLib".
concept "Leaf":
- type is Observation.
- code is \`leaf\`.
concept "A":
- defined as ( "B" sem-or "Leaf" ).
concept "B":
- defined as "A".
decision "D":
first:
- when "A" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const SATCYCLE_CEL = `# SCC
library "SatCycleCases".
covers "SatCycleLib".
${PATIENT}
fact "fLeaf":
- date is "2026-01-01".
- defined by "SatCycleLib"."Leaf".
case "satisfiable via alternate branch despite cycle -> approve":
- subject is "Pat".
- fact is "fLeaf".
- result is "D" is "Approve".`;

  it("satisfiable-cycle: A is satisfied via its non-cyclic operand despite the B↔A cycle", () => {
    const r = runCel(graphFrom(SATCYCLE_CRL, SATCYCLE_CEL));
    expect(r.runs[0].status).toBe("pass"); // A = (B[cycle→false] sem-or Leaf[true]) = true → Approve
    expect(r.runs[0].diagnostics.some((d) => /cycle/.test(d))).toBe(true);
  });

  // ---- trace sub-evaluation (drop-one) ----
  it("trace exposes the composition sub-evaluation (which operand failed)", () => {
    const drop = runCel(graphFrom(AND_CRL, AND_CEL)).runs.find((r) => r.case.startsWith("drop A"))!;
    const node = whenNode(drop, "A And B")!;
    expect(node.satisfied).toBe(false);
    const comp = node.composition as CompositionTrace;
    expect(comp.op).toBe("sem-and");
    expect(comp.satisfied).toBe(false);
    expect(comp.operands!.find((o) => o.concept === "Leaf A")!.satisfied).toBe(false); // dropped
    expect(comp.operands!.find((o) => o.concept === "Leaf B")!.satisfied).toBe(true);
  });

  // ---- nested composite: a ref operand that is itself `defined as` carries its sub-trace ----
  const NESTED_CRL = `# NS
library "NestedLib".
concept "Leaf D":
- type is Observation.
- code is \`leaf-d\`.
concept "Leaf E":
- type is Observation.
- code is \`leaf-e\`.
concept "Inner":
- defined as ( "Leaf D" sem-and "Leaf E" ).
concept "Outer":
- defined as "Inner".
decision "D":
first:
- when "Outer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const NESTED_CEL = `# NSC
library "NestedCases".
covers "NestedLib".
${PATIENT}
fact "fD":
- date is "2026-01-01".
- defined by "NestedLib"."Leaf D".
case "inner composite fails (drop E) -> deny":
- subject is "Pat".
- fact is "fD".
- result is "D" is "Deny".`;

  it("nested composite: the ref trace carries the referenced composite's own sub-evaluation", () => {
    const run = runCel(graphFrom(NESTED_CRL, NESTED_CEL)).runs[0];
    const outer = whenNode(run, "Outer")!;
    expect(outer.satisfied).toBe(false);
    // Outer is a bare alias to Inner → the when's composition is the ref to Inner.
    expect(outer.composition?.op).toBe("ref");
    expect(outer.composition?.concept).toBe("Inner");
    const innerComp = outer.composition?.composition as CompositionTrace; // Inner's own sem-and
    expect(innerComp.op).toBe("sem-and");
    expect(innerComp.operands!.find((o) => o.concept === "Leaf E")!.satisfied).toBe(false);
  });

  // ---- guard referencing a composite ----
  const GUARD_CRL = `# G
library "GuardLib".
concept "Trigger":
- type is Observation.
- code is \`trigger\`.
concept "Leaf A":
- type is Observation.
- code is \`leaf-a\`.
concept "Leaf B":
- type is Observation.
- code is \`leaf-b\`.
concept "Both":
- defined as ( "Leaf A" sem-and "Leaf B" ).
decision "D":
- when "Trigger" then:
  any:
  - recommend activity "Base".
  - recommend activity "Extra" only when "Both".
  end.
activity "Base":
- request CPGServiceRequest.
- with \`base\`.
activity "Extra":
- request CPGServiceRequest.
- with \`extra\`.`;

  const GUARD_CEL = `# GC
library "GuardCases".
covers "GuardLib".
${PATIENT}
fact "fT":
- date is "2026-01-01".
- defined by "GuardLib"."Trigger".
fact "fA":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf A".
fact "fB":
- date is "2026-01-01".
- defined by "GuardLib"."Leaf B".
case "composite guard holds -> extra offered":
- subject is "Pat".
- fact is "fT".
- fact is "fA".
- fact is "fB".
- result is "D" is "Extra".
case "composite guard fails (drop a leaf) -> base only":
- subject is "Pat".
- fact is "fT".
- fact is "fA".
- result is "D" is "Base".`;

  it("a per-action guard may reference a composite; its sub-evaluation rides the guard trace", () => {
    const r = runCel(graphFrom(GUARD_CRL, GUARD_CEL));
    expect(r.runs.map((x) => `${x.case}:${x.status}`)).toEqual([
      "composite guard holds -> extra offered:pass",
      "composite guard fails (drop a leaf) -> base only:pass",
    ]);
    const dropped = r.runs[1];
    const trigger = whenNode(dropped, "Trigger")!;
    const extra = trigger.children!.find((n) => n.node === "Extra")!;
    expect(extra.guardedOut).toBe(true);
    expect(extra.guard?.composition?.satisfied).toBe(false); // "Both" failed (Leaf B missing)
  });

  // ---- unresolvable operand → diagnostic (so sem-not can't silently invert) ----
  const GHOST_CRL = `# GH
library "GhostLib".
concept "Safe":
- defined as ( sem-not "Ghost" ).
decision "D":
first:
- when "Safe" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
${ACTIVITIES}`;

  const GHOST_CEL = `# GHC
library "GhostCases".
covers "GhostLib".
${PATIENT}
case "sem-not over an undeclared operand -> diagnostic":
- subject is "Pat".
- result is "D" is "Approve".`;

  it("unresolvable operand emits a diagnostic (sem-not over a typo must not silently pass clean)", () => {
    const run = runCel(graphFrom(GHOST_CRL, GHOST_CEL)).runs[0];
    // sem-not(false) is true under closed-world, so the disposition is Approve — but
    // the operand is undeclared, which the CRE flags rather than passing silently.
    expect(run.diagnostics.some((d) => /Ghost/.test(d) && /resolves to no concept or fact/.test(d))).toBe(true);
  });
});

describe("CRE — dme101-030 decomposed acceptance fixture (#126)", () => {
  const dir = join(__dirname, "fixtures/dme101-030-composition");
  const crl = readFileSync(join(dir, "policy.crl"), "utf-8");
  const cel = readFileSync(join(dir, "cases.cel"), "utf-8");

  it("all 12 cases pass the oracle", () => {
    const r = runCel(graphFrom(crl, cel));
    expect(r.runs.length).toBe(12);
    const failures = r.runs.filter((x) => x.status !== "pass").map((x) => `${x.case}:${x.status}`);
    expect(failures).toEqual([]);
  });

  it("canary: the six-element composite is satisfied via the n-ary sem-and", () => {
    const r = runCel(graphFrom(crl, cel));
    const canary = r.runs.find((x) => x.case.startsWith("documented nonunion (all six"))!;
    expect(canary.status).toBe("pass");
    const node = whenNode(canary, "Documented Nonunion")!;
    expect(node.satisfied).toBe(true);
    expect(node.composition?.op).toBe("sem-and");
    expect(node.composition?.satisfied).toBe(true);
    expect(node.composition?.operands?.length).toBe(6);
  });

  it("drop-one-leaf: the specific missing operand breaks the composite (for the right reason)", () => {
    const r = runCel(graphFrom(crl, cel));
    const drop = r.runs.find((x) => x.case.startsWith("missing: nonunion exists"))!;
    const node = whenNode(drop, "Documented Nonunion")!;
    expect(node.satisfied).toBe(false);
    const comp = node.composition!;
    expect(comp.satisfied).toBe(false);
    const missing = comp.operands!.find((o) => o.concept === "Nonunion Exists")!;
    expect(missing.satisfied).toBe(false);
    const others = comp.operands!.filter((o) => o.concept !== "Nonunion Exists");
    expect(others.every((o) => o.satisfied)).toBe(true);
  });
});
