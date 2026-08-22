import { readFileSync } from "fs";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { buildCEL } from "../../cel";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
import { librariesReferencedBy } from "../../cql-emitter/layeredEmit";
import { runCel } from "../../cre/run";
import { buildEdgeIndex, declKey } from "../../migration/migrationInventory";
import type { RegistryEntry } from "../../imports/types";
import { buildCRL } from "../../index";
import { definitionConceptRefs } from "../../provenance/indexer";
import { Validator } from "../../validator/validator";
import { flattenDefinedAsBody } from "../inferenceWalk";
import {
  BranchConditionAnd,
  BranchConditionNot,
  BranchConditionOr,
  BranchConditionRef,
  Concept,
  DefinedAsBooleanComposition,
  DefinedAsDefinition,
  getRefLibrary,
  getRefName,
} from "../types";

import { parseInput } from "./parseInput";

// Concept boolean composition, Todo 1 (design of record `tmp/DESIGN-concept-boolean-composition.md`).
// The NEW `defined as ( <boolean> )` family — plain `and`/`or`/`not` over SEPARATE boolean facts
// (QM population logic etc.), a THIRD composition family distinct from subsumption `sem-or` and
// refinement `sem-and`/`sem-not`. T1 is grammar + AST + consumer-safety ONLY: emit stays inert
// behind a sentinel until T3, so these tests exercise PARSING, the parenthesized-only / no-mixing
// boundary, the degenerate-alias invariant, and that NO consumer silently drops an operand.
//
// ⚠ These tests parse against the WORKING-TREE parser (`buildCRL` / `parseInput`), NOT the CRL MCP
// tool — the MCP server runs a provisioned globalStorage COPY that lags an un-released grammar
// change, so it reports the new syntax as a parse error. The working tree is the authority here.

const conceptNamed = (src: string, name: string): Concept => {
  const ast = parseInput(src);
  return ast.statements.find((s) => s.type === "Concept" && s.name === name) as Concept;
};

const booleanBody = (src: string, name: string): DefinedAsBooleanComposition => {
  const def = conceptNamed(src, name).definition as DefinedAsDefinition;
  expect(def.type).toBe("DefinedAsDefinition");
  expect(def.body.type).toBe("DefinedAsBooleanComposition");
  return def.body as DefinedAsBooleanComposition;
};

const boolConcept = (body: string) =>
  `library "T".\nconcept "A":\n- value type is boolean.\n- ${body}`;

describe("defined as ( boolean composition ) — parsing", () => {
  it("`and` builds a BranchConditionAnd over the two operand refs", () => {
    const b = booleanBody(boolConcept(`defined as ("B" and "C").`), "A");
    expect(b.expression.type).toBe("BranchConditionAnd");
    const ands = b.expression as BranchConditionAnd;
    expect(ands.operands.map((o) => getRefName((o as BranchConditionRef).ref))).toEqual(["B", "C"]);
  });

  it("`or` builds a BranchConditionOr", () => {
    const b = booleanBody(boolConcept(`defined as ("B" or "C").`), "A");
    expect(b.expression.type).toBe("BranchConditionOr");
  });

  it("`not` builds a BranchConditionNot over the operand ref", () => {
    const b = booleanBody(boolConcept(`defined as (not "B").`), "A");
    expect(b.expression.type).toBe("BranchConditionNot");
    const not = b.expression as BranchConditionNot;
    expect(not.operand.type).toBe("BranchConditionRef");
    expect(getRefName((not.operand as BranchConditionRef).ref)).toBe("B");
  });

  it("a homogeneous chain `A and B and C` flattens to ONE n-ary And (3 operands)", () => {
    const b = booleanBody(boolConcept(`defined as ("B" and "C" and "D").`), "A");
    expect(b.expression.type).toBe("BranchConditionAnd");
    expect((b.expression as BranchConditionAnd).operands).toHaveLength(3);
  });

  it("parentheses preserve nesting: `(B or C) and D` → And[ Or[B,C], D ]", () => {
    const b = booleanBody(boolConcept(`defined as (("B" or "C") and "D").`), "A");
    const ands = b.expression as BranchConditionAnd;
    expect(ands.type).toBe("BranchConditionAnd");
    expect(ands.operands).toHaveLength(2);
    expect(ands.operands[0]!.type).toBe("BranchConditionOr");
    expect(ands.operands[1]!.type).toBe("BranchConditionRef");
  });

  it("preserves a qualified operand ref (library + name)", () => {
    const b = booleanBody(boolConcept(`defined as ("Lib"."B" and "C").`), "A");
    const first = (b.expression as BranchConditionAnd).operands[0] as BranchConditionRef;
    expect(getRefLibrary(first.ref)).toBe("Lib");
    expect(getRefName(first.ref)).toBe("B");
  });

  it("`not not B` builds nested Not (T1 does NOT collapse — NNF is a T3 concern)", () => {
    const b = booleanBody(boolConcept(`defined as (not not "B").`), "A");
    const outer = b.expression as BranchConditionNot;
    expect(outer.type).toBe("BranchConditionNot");
    expect(outer.operand.type).toBe("BranchConditionNot");
    expect((outer.operand as BranchConditionNot).operand.type).toBe("BranchConditionRef");
  });

  it("`not (B or C)` builds Not over the group", () => {
    const b = booleanBody(boolConcept(`defined as (not ("B" or "C")).`), "A");
    const not = b.expression as BranchConditionNot;
    expect(not.type).toBe("BranchConditionNot");
    expect(not.operand.type).toBe("BranchConditionOr");
  });
});

describe("defined as ( boolean composition ) — parenthesized-only, no operator mixing", () => {
  // The bright line: boolean composition MUST be parenthesized (like `defined as exists (...)`),
  // and a bare mixed `and`/`or` chain is rejected exactly as in a `when` guard (shared builder).

  it("mixed bare `and`/`or` is a DIAGNOSTIC, not a silent build (assert the message, not the node)", () => {
    const built = buildCRL(boolConcept(`defined as ("B" and "C" or "D").`));
    expect(built.success).toBe(false);
    expect(JSON.stringify(built.errors)).toMatch(/mixed 'and'\/'or'/);
  });

  it("an UNPARENTHESIZED `defined as A and B` is a parse error (parenthesized-only pin)", () => {
    expect(buildCRL(boolConcept(`defined as "B" and "C".`)).success).toBe(false);
  });

  it("an UNPARENTHESIZED `defined as not A` is a parse error", () => {
    expect(buildCRL(boolConcept(`defined as not "B".`)).success).toBe(false);
  });

  it("mixing sem-* and boolean operators in one group is a parse error", () => {
    expect(buildCRL(boolConcept(`defined as ("B" and "C" sem-or "D").`)).success).toBe(false);
  });

  it("a malformed `and` tail `(B and)` is rejected", () => {
    expect(buildCRL(boolConcept(`defined as ("B" and).`)).success).toBe(false);
  });

  it("a malformed `not` tail `(not)` is rejected", () => {
    expect(buildCRL(boolConcept(`defined as (not).`)).success).toBe(false);
  });
});

describe("defined as ( boolean composition ) — degenerate stays DefinedAsComposition (alias invariant)", () => {
  // An operator-free `("B")` is a genuine ATN ambiguity resolved by alternative ORDER to
  // `DefinedAsComposition` (a bare-ref alias). T1 deliberately does NOT normalize it to a bare ref
  // (would drift existing AST/goldens); T2 owns the alias invariant. Pin the resolution here.

  it("`(\"B\")` resolves to DefinedAsComposition, not the boolean family", () => {
    const def = conceptNamed(boolConcept(`defined as ("B").`), "A").definition as DefinedAsDefinition;
    expect(def.body.type).toBe("DefinedAsComposition");
  });

  it("`((\"B\"))` also stays DefinedAsComposition", () => {
    const def = conceptNamed(boolConcept(`defined as (("B")).`), "A").definition as DefinedAsDefinition;
    expect(def.body.type).toBe("DefinedAsComposition");
  });
});

describe("defined as ( boolean composition ) — consumer safety (no operand silently dropped)", () => {
  it("flattenDefinedAsBody returns BOTH operand refs", () => {
    const L = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
    const body: DefinedAsBooleanComposition = {
      type: "DefinedAsBooleanComposition",
      expression: {
        type: "BranchConditionAnd",
        operands: [
          { type: "BranchConditionRef", ref: "B", location: L },
          { type: "BranchConditionRef", ref: "C", location: L },
        ],
        location: L,
      },
      location: L,
    };
    expect(flattenDefinedAsBody(body).map(getRefName)).toEqual(["B", "C"]);
  });

  it("definitionConceptRefs surfaces both operands as direct edges", () => {
    const src = boolConcept(`defined as ("B" and "C").`);
    const c = conceptNamed(src, "A");
    expect(definitionConceptRefs(c).map(getRefName)).toEqual(expect.arrayContaining(["B", "C"]));
  });

  it("reference resolution flags an UNRESOLVED operand (referenceResolver walks each ref)", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("Present" and "Missing").
concept "Present":
- value type is boolean.
- code is \`present\`.`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    const unresolved = errors.filter((e) => e.kind === "unresolved-reference");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(JSON.stringify(unresolved)).toContain("Missing");
    // The resolved operand must NOT be reported.
    expect(JSON.stringify(unresolved)).not.toContain("Present");
  });

  it("cycle detection catches a SELF cycle A → (A and B) (the tolerant-walker silent-miss)", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("A" and "B").
concept "B":
- value type is boolean.
- code is \`b\`.`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    expect(errors.some((e) => e.kind === "reference-cycle")).toBe(true);
  });

  it("cycle detection catches a MUTUAL cycle A → (B and X), B → (A and Y)", () => {
    const src = `library "T".
concept "A":
- value type is boolean.
- defined as ("B" and "X").
concept "B":
- value type is boolean.
- defined as ("A" and "Y").
concept "X":
- value type is boolean.
- code is \`x\`.
concept "Y":
- value type is boolean.
- code is \`y\`.`;
    const built = buildCRL(src);
    expect(built.success && built.result).toBeTruthy();
    const errors = new Validator().validate(built.result!).errors;
    expect(errors.some((e) => e.kind === "reference-cycle")).toBe(true);
  });
});

describe("defined as ( boolean composition ) — corpus parse superset", () => {
  // The grammar change only ADDS an alternative to `daBody`; it must not regress any existing parse.
  // Every worked-corpus library must still build with ZERO lex/parse/builder diagnostics.
  const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
  const CORPUS = path.join(REPO_ROOT, "src/tests/fixtures/corpus");
  const files = [
    "cms22/cms22.crl",
    "cms22/cms22-inferences.crl",
    "cms22/cms22-externalconcepts.crl",
    "cms22/cms22-externalprimitives.crl",
    "cms22/cms22-strategy.crl",
    "cms69/cms69.crl",
    "cms69/cms69-inferences.crl",
    "cms69/cms69-externalconcepts.crl",
    "cms69/cms69-externalprimitives.crl",
    "cms69/cms69-strategy.crl",
  ];

  it.each(files)("%s builds with zero parse/builder diagnostics", (rel) => {
    const src = readFileSync(path.join(CORPUS, rel), "utf8");
    const built = buildCRL(src);
    if (!built.success) {
      throw new Error(`${rel} regressed: ${JSON.stringify(built.errors, null, 2)}`);
    }
    expect(built.success).toBe(true);
  });
});

describe("defined as ( boolean composition ) — #189 Slice 0b: LOWERS to and/or/not (emit) + EVALUATES (CRE)", () => {
  // Slice 0b activates the boolean family. Emit lowers `("A" and "B")` to ONE compound total boolean; the
  // operands must be proven-total scalar booleans (the migration's `defined as exists` shape). A non-total
  // operand or a non-scalar-boolean parent is a LOUD emit error — NO fabricated `Coalesce` (charter §4).
  // run_decision now EVALUATES it closed-world (`and`/`or`/`not` over operand booleans), replacing the T1
  // sentinel/crash the earlier round guarded. ⚠ Operands are `defined as exists` (total scalar booleans post
  // #270 Slice 0a); a bare `code is` records concept is NOT total and is rejected below.

  // Two `defined as exists` operands over local record sets — the canonical migration shape.
  const BASE = `library "T".
concept "Present Records":
- type is Observation.
- shape is RecordSet.
- code is \`present\`.
concept "Also Records":
- type is Observation.
- shape is RecordSet.
- code is \`also\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present Records" ).
concept "Has Also":
- value type is boolean.
- defined as exists ( "Also Records" ).`;

  const emit = (bothDecl: string) =>
    emitCQLFromAST(parseInput(`${BASE}\nconcept "Both":\n${bothDecl}`), {
      canonicalBase: "http://example.org/crl/test",
    });

  it("`and` lowers to a BARE compound boolean `\"Has Present\" and \"Has Also\"` (no Coalesce — operands gate-proven total)", () => {
    const res = emit(`- value type is boolean.\n- defined as ( "Has Present" and "Has Also" ).`);
    expect(res.success, JSON.stringify(res.errors)).toBe(true);
    const cql = res.result ?? "";
    expect(cql).toContain(`define "Both":`);
    expect(cql).toContain(`"Has Present" and "Has Also"`);
    // The composition leaf policy references operands BARE — a defensive `Coalesce` there would MASK a
    // totality-proof failure (charter §4 no-magic), unlike the criterion-define policy.
    expect(cql).not.toContain(`Coalesce("Has Present"`);
  });

  it("`or` and `not` lower structurally with minimal parens", () => {
    const res = emit(`- value type is boolean.\n- defined as ( "Has Present" or not "Has Also" ).`);
    expect(res.success, JSON.stringify(res.errors)).toBe(true);
    expect(res.result ?? "").toContain(`"Has Present" or not "Has Also"`);
  });

  it("a NON-total operand → LOUD emit error (emit-boolean-composition-operand-not-total), naming the offender", () => {
    // "Present Records" is a `shape is RecordSet` records concept — NOT a total scalar boolean. Composing it
    // directly (instead of `exists`-wrapping) must fail loud, never fabricate a `Coalesce`.
    const res = emit(`- value type is boolean.\n- defined as ( "Has Present" and "Present Records" ).`);
    expect(res.success).toBe(false);
    const errs = JSON.stringify(res.errors);
    expect(errs).toContain("emit-boolean-composition-operand-not-total");
    expect(errs).toContain("Present Records");
  });

  it("a non-`Scalar<boolean>` PARENT (value type Quantity) → rejected (emit-boolean-composition-parent-not-scalar-boolean)", () => {
    const res = emit(`- value type is Quantity.\n- defined as ( "Has Present" and "Has Also" ).`);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("emit-boolean-composition-parent-not-scalar-boolean");
  });

  // --- CRE truth table: run_decision EVALUATES the composition (was the T1 loud sentinel / crash) ---
  const decisionLib = `# M
library "M".
concept "Present Records":
- type is Observation.
- shape is RecordSet.
- code is \`present\`.
concept "Also Records":
- type is Observation.
- shape is RecordSet.
- code is \`also\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present Records" ).
concept "Has Also":
- value type is boolean.
- defined as exists ( "Also Records" ).
concept "Both":
- value type is boolean.
- defined as ( "Has Present" and "Has Also" ).
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Both" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

  const runCase = (celCase: string) => {
    const cel = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "A Present Record":
- code is "http://example.org/x|present".
- defined by "Present Records".
fact "An Also Record":
- code is "http://example.org/x|also".
- defined by "Also Records".
${celCase}`;
    const crl = parseInput(decisionLib);
    const built = buildCEL(cel);
    if (!built.success || !built.result)
      throw new Error("CEL build failed: " + JSON.stringify(built.errors));
    const coversTarget: RegistryEntry = {
      name: crl.library.name,
      filePath: "inline.crl",
      ast: crl,
      isRoot: true,
      origin: "root",
    };
    const graph: ResolvedCelGraph = {
      filePath: "inline.cel",
      cel: built.result,
      coversTarget,
      celParseErrors: [],
      diagnostics: [],
    };
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    return run;
  };

  it("BOTH operands present → `and` true → Approve (the composition EVALUATES, not a runtimeError)", () => {
    const run = runCase(`case "both":
- subject is "Pat".
- fact is "A Present Record".
- fact is "An Also Record".
- result is "D" is "Approve".`);
    expect(run.status).toBe("pass"); // produced Approve = expected → and-of-exists evaluated true
  });

  it("ONE operand present → `and` false → Deny (closed-world; the missing exists falsifies the `and`)", () => {
    const run = runCase(`case "only present":
- subject is "Pat".
- fact is "A Present Record".
- result is "D" is "Deny".`);
    expect(run.status).toBe("pass"); // produced Deny = expected → an impl that ignored the missing operand would fail
  });

  it("NEITHER operand present → `and` false → Deny", () => {
    const run = runCase(`case "neither":
- subject is "Pat".
- result is "D" is "Deny".`);
    expect(run.status).toBe("pass");
  });
});

describe("defined as ( boolean composition ) — cross-lib dependency + migration inventory (no operand dropped)", () => {
  it("librariesReferencedBy surfaces a FOREIGN qualified boolean operand's library", () => {
    // The layered-emit dependency lane must see boolean operands (else a cross-lib operand's include is dropped).
    const a = parseInput(`library "Root".
concept "Local":
- value type is boolean.
- code is \`local\`.
concept "C":
- value type is boolean.
- defined as ("Local" and "Other"."X").`);
    expect([...librariesReferencedBy(a, "Root")]).toEqual(["Other"]); // not "Root" (self), not bare "Local"
  });

  it("the #189 flip-safety inventory records each boolean operand as a consumer edge (was silently dropped)", () => {
    // ⚠ REGRESSION GUARD for the round-1 missed-walker (`migrationInventory.walkConceptEdges`). Both arms caught it.
    const ast = parseInput(`library "L".
concept "X":
- type is Observation.
- value type is boolean.
- code is \`x\`.
concept "Y":
- type is Observation.
- value type is boolean.
- code is \`y\`.
concept "C":
- value type is boolean.
- defined as ("X" and "Y").`);
    const edges = buildEdgeIndex([{ filePath: "L.crl", ast }]).get(declKey("L", "X")) ?? [];
    expect(edges.map((e) => e.edgeKind)).toContain("composition-operand");
    expect(edges.some((e) => e.ownerName === "C")).toBe(true);
  });
});

describe("defined as ( boolean composition ) — #189 Slice 0b: or/not CRE truth table + both-rep (disc 464 rework)", () => {
  // Round-1 code review (both arms): only `and` was CRE-tested; `not` is where the closed-world subtleties
  // live. A parameterized decision `when "Both"` where "Both" is the given composition body, over two
  // `defined as exists` operands.
  const runComp = (bothBody: string, celCase: string) => {
    const M = `# M
library "M".
concept "Present Records":
- type is Observation.
- shape is RecordSet.
- code is \`present\`.
concept "Also Records":
- type is Observation.
- shape is RecordSet.
- code is \`also\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present Records" ).
concept "Has Also":
- value type is boolean.
- defined as exists ( "Also Records" ).
concept "Both":
- value type is boolean.
- defined as ${bothBody}.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "D":
first:
- when "Both" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const cel = `# MC
library "MC".
covers "M".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "A Present Record":
- code is "http://example.org/x|present".
- defined by "Present Records".
fact "An Also Record":
- code is "http://example.org/x|also".
- defined by "Also Records".
${celCase}`;
    const crl = parseInput(M);
    const built = buildCEL(cel);
    if (!built.success || !built.result)
      throw new Error("CEL build failed: " + JSON.stringify(built.errors));
    const coversTarget: RegistryEntry = {
      name: crl.library.name,
      filePath: "inline.crl",
      ast: crl,
      isRoot: true,
      origin: "root",
    };
    const graph: ResolvedCelGraph = {
      filePath: "inline.cel",
      cel: built.result,
      coversTarget,
      celParseErrors: [],
      diagnostics: [],
    };
    const [run] = runCel(graph).runs;
    expect(run).toBeDefined();
    return run;
  };

  const present = `- subject is "Pat".\n- fact is "A Present Record".`;
  const both = `- subject is "Pat".\n- fact is "A Present Record".\n- fact is "An Also Record".`;
  const neither = `- subject is "Pat".`;

  it("`or`: neither → Deny, one → Approve, both → Approve", () => {
    const b = `( "Has Present" or "Has Also" )`;
    expect(runComp(b, `case "n":\n${neither}\n- result is "D" is "Deny".`).status).toBe("pass");
    expect(runComp(b, `case "o":\n${present}\n- result is "D" is "Approve".`).status).toBe("pass");
    expect(runComp(b, `case "b":\n${both}\n- result is "D" is "Approve".`).status).toBe("pass");
  });

  it("`not`: operand ABSENT → not-true → Approve; operand PRESENT → not-false → Deny (closed-world)", () => {
    const b = `( not "Has Present" )`;
    expect(runComp(b, `case "absent":\n${neither}\n- result is "D" is "Approve".`).status).toBe("pass");
    expect(runComp(b, `case "present":\n${present}\n- result is "D" is "Deny".`).status).toBe("pass");
  });

  it("nested `not ( A or B )`: neither → Approve, one → Deny", () => {
    const b = `( not ( "Has Present" or "Has Also" ) )`;
    expect(runComp(b, `case "neither":\n${neither}\n- result is "D" is "Approve".`).status).toBe("pass");
    expect(runComp(b, `case "one":\n${present}\n- result is "D" is "Deny".`).status).toBe("pass");
  });

  it("a `code is` + boolean composition (both-rep) → LOUD `emit-boolean-composition-both-rep`, not a phantom `(unknown)` operand", () => {
    // disc 464 Claude #2b: `lowerLocalCodes` folds a `code is` + boolean composition into the both-rep union;
    // the folded twin's predicate is false, and the error path used to report offender "(unknown)". The
    // dedicated both-rep guard now refuses on the right axis (#257-deferred multi-representation).
    const res = emitCQLFromAST(
      parseInput(`library "T".
concept "Present Records":
- type is Observation.
- shape is RecordSet.
- code is \`present\`.
concept "Has Present":
- value type is boolean.
- defined as exists ( "Present Records" ).
concept "Also Present":
- value type is boolean.
- defined as exists ( "Present Records" ).
concept "Both":
- type is Observation.
- value type is boolean.
- code is \`both\`.
- defined as ( "Has Present" and "Also Present" ).`),
      { canonicalBase: "http://example.org/crl/test" },
    );
    expect(res.success).toBe(false);
    const errs = JSON.stringify(res.errors);
    expect(errs).toContain("emit-boolean-composition-both-rep");
    expect(errs).not.toContain("(unknown)");
  });
});
