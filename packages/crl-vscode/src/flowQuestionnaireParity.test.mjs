// #242 PARITY: the MV Tree/Flow pane and the Questionnaire pane decompose a compound `when` guard into the SAME
// STRUCTURE. They use TWO SEPARATE decomposers — the flow's AST-side `branchConditionToDefStruct` (crl core, via
// `buildGuardOutlines`) and the questionnaire's runtime-view `buildGuardStruct` (questionnaireModel.ts) — so this pins
// they agree, which is the operator's actual complaint (#242: the flow collapsed a compound to one opaque node while
// the questionnaire fully decomposed it). We compare a full, INJECTIVE shape serialization (kind + JSON-encoded
// `lib`/`name` identity + ORDERED children + composite bodies + criterion boundaries) — NOT an atom SET — so
// operator-tree shape, positional duplication, `not`-wrapper survival, and criterion boundaries are all in scope.
//
// WHERE THE PANES AGREE (pinned below): `and`/`or`/`not`, nesting, positional duplication, `defined as` composite
// bodies, and `criterion` boundaries + bodies (single-ref, nested, and compound-body).
//
// WHERE THEY DIVERGE BY CONSTRUCTION (pre-existing, orthogonal to #242 — the flow renderer has host-safety caps the
// questionnaire lacks; surfaced by this test, NOT introduced by it):
//   (a) WIDTH CAP — the flow caps an `and`/`or` guard at GUARD_OPERAND_CAP (100) operands + a `+N more` stub; the
//       questionnaire is uncapped. #246 raised this from 10 → 100, so every realistic authored guard now AGREES (pinned
//       below at 11 operands); the residual divergence only bites past 100 (beyond any authored guard — unit-tested in
//       guardOutline.test.ts, not fixtured here to keep the graph render light).
//   (b) CROSS-LIBRARY operand — the flow degrades a cross-lib/unresolved ref to an `external` stub; the questionnaire
//       keeps a plain `leaf`. Noted, not fixtured (needs a multi-lib project — heavier than this suite's scope).
//   (c) DEEP criterion chains (> DEF_MAX_EXPR_DEPTH hops) — the flow elides with a `…`; the questionnaire recurses.
//       Noted, not fixtured. The criterion cases below stay well under the hop cap.
//   (d) NESTED criterion boundaries (a `criterion` referenced inside another `criterion`'s body) — the flow keeps the
//       inner named box at every hop (#233); the questionnaire FLATTENS it (criterion boxes are #233 FLOW-ONLY).
//       Pinned as an ACCEPTED divergence below. (A criterion's own COMPOUND body — `and`/`or`/leaves — DOES agree.)
// The `criterion` node's `lib` is intentionally NOT compared: criteria are library-local (the flow stamps the
// decision's lib, the questionnaire leaves it unset), and the criterion BODY's leaves still compare `lib`.
//
// Built the LIGHT way (resolveCelImports → renderScenario / buildGuardOutlines) — NO provenance artifact (deliberate:
// #242's principle is that provenance must never change the tree's shape). The defExpr index feeding BOTH decomposers
// comes from the SAME `assembleConceptProjections` the cockpit itself calls (not a hand-copy that could drift).
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  resolveCelImports,
  renderScenario,
  buildGuardOutlines,
  assembleConceptProjections,
  nodeKey,
  conceptDeclRef,
} from "@smile-digital-health/crl";

import { buildQuestionnaire } from "./questionnaireModel.ts";

const check = test;
const booleanResolver = () => ["boolean"];

const tmpRoots = [];
afterAll(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
});

// Write a CRL+CEL project to a temp dir and resolve it ONCE — returns the shared graph + the NAMED scenario (a wrong
// case name fails loudly rather than silently testing scenarios[0]).
function project(files, celName, caseName) {
  const root = mkdtempSync(join(tmpdir(), "parity-"));
  tmpRoots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "parity-fixture", version: "1.0.0", private: true }));
  for (const [name, contents] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  const graph = resolveCelImports(join(root, celName));
  const rendered = renderScenario(graph, { case: caseName });
  const sv = rendered.scenarios.find((s) => s.case.name === caseName);
  assert.ok(sv, `case "${caseName}" rendered (errors: ${JSON.stringify(rendered.errors)})`);
  return { graph, sv, rootLib: sv.decision?.libraryName };
}

// A defExpr resolver over the shared index — the SAME `DefExprEntry` shape both decomposers consume (so a `defined as`
// operand hangs its composite body identically in both panes, exactly as the cockpit wires it).
const defExprResolver = (defIndex, rootLib) => (lib, name) => defIndex.get(nodeKey(conceptDeclRef(lib ?? rootLib, name)));

// INJECTIVE shape serialization of an expr tree (DefStructExpr OR QExpr — same kinds). Identity components are
// JSON-encoded so a CRL name/lib containing `:`/`(`/`,`/`[` etc. can never collide two distinct trees. A criterion's
// body is `.operand` (flow) or `.body` (questionnaire). THROWS on any unknown kind AND on a missing operand/body — a
// new/malformed variant must fail loudly on BOTH sides, never serialize to a shared placeholder (the exact
// permissiveness this oracle exists to catch).
function shape(e) {
  if (!e || !e.kind) throw new Error(`shape(): missing/kindless node: ${JSON.stringify(e)}`);
  const id = (x) => JSON.stringify([x.lib, x.name]);
  switch (e.kind) {
    case "leaf":
      return `L${id(e)}${e.composite ? `{${shape(e.composite)}}` : ""}`;
    case "external":
      return `X${id(e)}`;
    case "and":
      return `AND[${e.operands.map(shape).join(",")}]`;
    case "or":
      return `OR[${e.operands.map(shape).join(",")}]`;
    case "not":
      return `NOT(${shape(e.operand)})`;
    case "criterion": {
      const body = e.operand ?? e.body;
      if (!body) throw new Error(`shape(): criterion ${JSON.stringify(e.name)} has no body (operand/body)`);
      return `CR${JSON.stringify(e.name)}(${shape(body)})`; // lib normalized out — criteria are library-local (see header)
    }
    case "more":
      return `+${e.count}`;
    default:
      throw new Error(`shape(): unknown expr kind "${e.kind}"`);
  }
}

// The flow's decomposition of the fixture's SINGLE compound `when` (buildGuardOutlines omits single-refs + otherwise).
function flowShape(graph, defIndex) {
  const outlines = [...buildGuardOutlines(graph, defIndex).values()];
  assert.equal(outlines.length, 1, "the fixture has exactly one compound guard → one outline");
  return shape(outlines[0].expr);
}

// The questionnaire's guard-kind `.expansion` QExpr for the same compound `when`, given the SAME defExpr as the flow.
function questRow(sv, rootLib, defIndex) {
  const q = buildQuestionnaire(sv, booleanResolver, rootLib, { defExpr: defExprResolver(defIndex, rootLib) });
  const rows = q.questions.filter((x) => x.expansion && x.expansionKind === "guard");
  assert.equal(rows.length, 1, "exactly one compound-guard row with a guard-kind expansion");
  return rows[0];
}

function bothShapes(guard, holds, { extra = "", result = "Deny" } = {}) {
  const { graph, sv, rootLib } = project({ "g.crl": crlWith(guard, extra), "g.cel": celWith(holds, result) }, "g.cel", "c");
  const defIndex = assembleConceptProjections(graph).defExpr; // the cockpit's OWN assembly → both decomposers
  return { flow: flowShape(graph, defIndex), quest: shape(questRow(sv, rootLib, defIndex).expansion) };
}

// A/B/C are `code is` Source; Inf is `defined as ( A sem-or B )`; Crit/Crit2 are `criterion`s (added via `extra`).
const CONCEPTS = `concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
concept "C":
- type is Condition.
- code is \`c\`.`;
const INF = `\nconcept "Inf":\n- defined as ( "A" sem-or "B" ).`;
const CRIT = `\ncriterion "Crit":\n- when ( "C" ).`;
const CRIT_NESTED = `\ncriterion "Crit":\n- when ( "C" ).\ncriterion "Crit2":\n- when ( "Crit" ).`;
const CRIT_COMPOUND = `\ncriterion "Crit":\n- when ( "A" and "C" ).`;
const crlWith = (guard, extra = "") => `library "G".
${CONCEPTS}${extra}
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
decision "G":
first:
- when ${guard} then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
const factOf = (n) => `fact "f${n}":
- code is "http://example.org|${n.toLowerCase()}".
- date is "2026-01-01".
- defined by "${n}".`;
// `- result is "G" is "<result>"` BINDS the case to decision "G" (so `sv.decision`/`rootLib` resolve + the compound is
// evaluated). It does NOT gate `.expansion`: the questionnaire attaches a guard box for a SATISFIED compound too
// (questionnaireModel.ts attachGuardStruct); the result value just has to match the fired disposition.
const celWith = (holds, result) => `library "GC".
covers "G".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
${holds.map(factOf).join("\n")}
case "c":
- subject is "Pat".
${holds.map((n) => `- fact is "f${n}".`).join("\n")}
- result is "G" is "${result}".`;

const agree = (guard, holds, opts) => {
  const { flow, quest } = bothShapes(guard, holds, opts);
  assert.equal(flow, quest, `flow and questionnaire must decompose \`${guard}\` identically`);
  return flow;
};

check("#242 parity: `A and B` (FAILED) — identical structure", () => {
  assert.equal(agree(`"A" and "B"`, ["A"]), `AND[L["G","A"],L["G","B"]]`);
});

check("#242 parity: `A and B` (SATISFIED) — a satisfied compound also expands, identically (not a failed-only path)", () => {
  assert.equal(agree(`"A" and "B"`, ["A", "B"], { result: "Approve" }), `AND[L["G","A"],L["G","B"]]`);
});

check("#242 parity: `( A or B ) and C` — nested Boolean SHAPE (not just atoms) matches", () => {
  assert.equal(agree(`( "A" or "B" ) and "C"`, ["A"]), `AND[OR[L["G","A"],L["G","B"]],L["G","C"]]`);
});

check("#242 parity: `A and A` — positional DUPLICATION preserved on both sides (never deduped)", () => {
  assert.equal(agree(`"A" and "A"`, []), `AND[L["G","A"],L["G","A"]]`);
});

check("#242 parity: `A and Inf` — the `defined as` operand hangs its composite body in BOTH panes", () => {
  assert.equal(agree(`"A" and "Inf"`, ["B"], { extra: INF }), `AND[L["G","A"],L["G","Inf"]{OR[L["G","A"],L["G","B"]]}]`);
});

check("#242 parity: `A and Crit` — a single-ref `criterion` boundary + body match", () => {
  assert.equal(agree(`"A" and "Crit"`, ["A"], { extra: CRIT }), `AND[L["G","A"],CR"Crit"(L["G","C"])]`);
});

check("#242 KNOWN DIVERGENCE: a NESTED criterion (criterion → criterion) — flow keeps the inner box (#233), questionnaire flattens it", () => {
  const { flow, quest } = bothShapes(`"A" and "Crit2"`, ["A"], { extra: CRIT_NESTED });
  assert.equal(flow, `AND[L["G","A"],CR"Crit2"(CR"Crit"(L["G","C"]))]`, "flow preserves the inner Crit boundary at every hop (#233)");
  assert.equal(quest, `AND[L["G","A"],CR"Crit2"(L["G","C"])]`, "questionnaire flattens the inner criterion (criterion boxes are #233 FLOW-ONLY)");
  assert.notEqual(flow, quest, "nested criterion boundaries are a KNOWN divergence (see header) — #233 is flow-only, orthogonal to #242");
});

check("#242 parity: `B and Crit` where Crit = `A and C` — a COMPOUND criterion body matches", () => {
  assert.equal(agree(`"B" and "Crit"`, ["B"], { extra: CRIT_COMPOUND }), `AND[L["G","B"],CR"Crit"(AND[L["G","A"],L["G","C"]])]`);
});

check("#242 parity: `not A` — the NOT wrapper SURVIVES on both sides (atom never flattened out of its negation)", () => {
  assert.equal(agree(`not "A"`, ["A"]), `NOT(L["G","A"])`);
});

// #246: an 11-operand `and` now AGREES — the flow guard cap was raised 10 → GUARD_OPERAND_CAP(100), so every realistic
// authored guard shows all its operands in the Tree (matching the uncapped Questionnaire). The >100 ceiling divergence
// is unit-tested in guardOutline.test.ts (a 101-operand graph render is too heavy for this suite).
check("#246 parity: an 11-operand `and` — the Tree shows ALL 11 operands (matches the uncapped Questionnaire)", () => {
  const names = Array.from({ length: 11 }, (_, i) => `W${i}`);
  const concepts = names.map((n) => `\nconcept "${n}":\n- type is Condition.\n- code is \`${n.toLowerCase()}\`.`).join("");
  const guard = names.map((n) => `"${n}"`).join(" and ");
  const flow = agree(guard, ["W0"], { extra: concepts }); // W0 holds, rest absent → compound FAILS; both decompose fully
  assert.ok(!flow.includes("+"), "no `+N more` stub under the raised cap — all 11 operands render");
  assert.equal(flow, `AND[${names.map((n) => `L["G","${n}"]`).join(",")}]`, "all 11 operands, in order");
});

// disc 340 (G1/C2) PIN — the accepted #242 behavior for a single-`not` guard. The atom X migrates onto its own outline
// leaf (flag target + shown), but that leaf's left-click CASE-SELECT is inert under `not`: the leaf reflects X's RAW
// truth while a satisfied `when not X` needs X FALSE — opposite polarities — so the leaf never lights `.flow-leaf-yes`.
// We pin the questionnaire-model polarity (which MIRRORS the flow's concept-truth lighting rule) in BOTH cells.
const notLeafAnswer = (holds, result) => {
  const { graph, sv, rootLib } = project({ "g.crl": crlWith(`not "A"`), "g.cel": celWith(holds, result) }, "g.cel", "c");
  const defIndex = assembleConceptProjections(graph).defExpr;
  const exp = questRow(sv, rootLib, defIndex).expansion;
  assert.equal(exp.kind, "not");
  return exp.operand.answer;
};
check("#242 not-polarity: the atom tracks X's RAW truth, decoupled from `not`-guard satisfaction (why leaf case-select is inert)", () => {
  // X true → the `not A` guard FAILS, yet the atom answers "yes" (raw truth) — a satisfied-guard filter would miss it.
  assert.equal(notLeafAnswer(["A"], "Deny"), "yes");
  // X false → the `not A` guard is SATISFIED, yet the atom answers "no" — so the leaf never lights on this satisfied
  // path (concept-truth lighting is opposite the guard) → its case-select is polarity-dead. The atom stays shown + flaggable.
  assert.equal(notLeafAnswer([], "Approve"), "no");
});
