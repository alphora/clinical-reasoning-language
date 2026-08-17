// #236 Step J — the ACCEPTANCE battery. The headline claim of the flip is quantitative: a
// criterion lowers to ONE named boolean define referenced BY IDENTITY, so a doubling-DAG that
// would inline-expand to 2^k leaves instead emits LINEARLY (one define per criterion, each
// referencing its predecessor by name), and the CRE serialized trace is linear in DISTINCT
// criteria per case (body once, references after). These pin the anti-#236-blowup contract
// end-to-end, at the emitted-CQL define-body level AND the run-trace level — the two places a
// regression to inline expansion would reappear.

import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../emit";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";
import type { BranchConditionTrace } from "../../cre/run";

function withFixture<T>(crlSrc: string, celSrc: string, fn: (paths: { crl: string; cel: string }) => T): T {
  const root = mkdtempSync(path.join(os.tmpdir(), "crit-accept-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/x", date: "2026-06-04" } }),
    );
    const crl = path.join(root, "p.crl");
    const cel = path.join(root, "f.cel");
    writeFileSync(crl, crlSrc);
    writeFileSync(cel, celSrc);
    return fn({ crl, cel });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// The CQL text of one `define "<name>":` stanza (its body, up to the next `define ` or EOF).
function defineBody(cql: string, name: string): string {
  const start = cql.indexOf(`define "${name}":`);
  if (start < 0) return "";
  const after = cql.slice(start + `define "${name}":`.length);
  const next = after.indexOf("\ndefine ");
  return next < 0 ? after : after.slice(0, next);
}

// A doubling chain C0..CN: C0 = Gate and Gate; C_k = C_{k-1} and C_{k-1}. Inlined this is 2^(k+1)
// leaves; as a define DAG it is N+1 defines, each referencing its predecessor twice by name.
function doublingChain(n: number): string {
  const crit = [`criterion "C0":\n- when ( "Gate" and "Gate" ).`];
  for (let k = 1; k <= n; k++) crit.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return `# P
library "P".
concept "Gate":
- type is Observation.
- code is \`gate\`.
- shape is RecordSet.
${crit.join("\n")}
decision "D":
first:
- when "C${n}" then recommend activity "Act".
- otherwise then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;
}

const NOFACTS_CEL = `# C
library "C".
covers "P".
fact "Pat":
- name is "Pat".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "D" is "No".`;

describe("#236 Step J — emit define-DAG linearity (no exponential blow-up)", () => {
  it("a depth-12 doubling chain emits exactly one define per criterion, each referencing its predecessor by NAME", () => {
    withFixture(doublingChain(12), NOFACTS_CEL, ({ crl }) => {
      const r = emitCQLImports(crl);
      expect(r.success).toBe(true);
      const iface = r.cqlByLibrary.find((e) => e.libraryName === "PInterface")?.cql ?? "";
      // Exactly 13 criterion defines (C0..C12) — linear in DISTINCT criteria, not 2^13 leaves.
      expect((iface.match(/define "C\d+"/g) ?? []).length).toBe(13);
      // The DAG EDGE (the anti-expansion proof, closing the free-floating-substring gap): the body
      // of `define "C12"` references its predecessor "C11" by name EXACTLY TWICE (the two operands of
      // its `and`) — NOT an inlined subtree of leaves. A regression to inline expansion would put
      // thousands of "Gate" references here instead.
      const c12 = defineBody(iface, "C12");
      expect((c12.match(/"C11"/g) ?? []).length).toBe(2);
      expect(c12).not.toContain('"Gate"'); // the leaf is reached only transitively, never inlined here
      expect(c12).toMatch(/Coalesce\("C11", false\) and Coalesce\("C11", false\)/); // per-operand totalized
      // Linear SIZE: the whole Interface library stays small (a 2^13-leaf expansion could not fit).
      expect(iface.length).toBeLessThan(4000);
    });
  });

  it("a compound criterion body lowers structurally (per-operand Coalesce), referenced by identity", () => {
    const crl = `# P
library "P".
concept "A":
- type is Observation.
- code is \`a\`.
- shape is RecordSet.
concept "B":
- type is Observation.
- code is \`b\`.
- shape is RecordSet.
concept "C":
- type is Observation.
- code is \`c\`.
- shape is RecordSet.
criterion "Eligible":
- when ( "A" and ( "B" or "C" ) ).
decision "D":
first:
- when "Eligible" then recommend activity "Act".
- otherwise then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;
    withFixture(crl, NOFACTS_CEL.replace('is "No"', 'is "No"'), ({ crl: crlPath }) => {
      const r = emitCQLImports(crlPath);
      expect(r.success).toBe(true);
      const iface = r.cqlByLibrary.find((e) => e.libraryName === "PInterface")?.cql ?? "";
      const body = defineBody(iface, "Eligible");
      // The criterion body is emitted ONCE as `Coalesce("A",false) and (Coalesce("B",false) or Coalesce("C",false))`
      // — per-operand totalized leaves, the guard's own shape, no NNF/DNF materialization.
      expect(body).toContain('Coalesce("A", false)');
      expect(body).toContain('Coalesce("B", false)');
      expect(body).toContain('Coalesce("C", false)');
    });
  });
});

// Recursively collect every `op:"criterion"` node in a serialized run trace (through when-node
// conditionTrace and every nested operand/operand/body).
function collectCriterionTraces(node: unknown, out: BranchConditionTrace[] = []): BranchConditionTrace[] {
  if (Array.isArray(node)) {
    for (const c of node) collectCriterionTraces(c, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const n = node as Record<string, unknown>;
  if (n.op === "criterion") out.push(n as unknown as BranchConditionTrace);
  for (const key of ["conditionTrace", "operand", "body"]) if (n[key]) collectCriterionTraces(n[key], out);
  for (const key of ["operands", "children"]) if (Array.isArray(n[key])) collectCriterionTraces(n[key], out);
  return out;
}

describe("#236 Step J — serialized run-trace linearity (body once, references after)", () => {
  it("a criterion referenced TWICE in a case yields exactly one bodied trace node + one reference node", () => {
    // An `all:` decision guards two branches by the SAME criterion → both evaluate. The run trace
    // must carry the criterion BODY on its first occurrence this case and `reference:true` on the
    // second (the DAG-collapse analogue in the trace) — never two independent expanded subtrees.
    const crl = `# P
library "P".
concept "A":
- type is Observation.
- code is \`a\`.
- shape is RecordSet.
concept "B":
- type is Observation.
- code is \`b\`.
- shape is RecordSet.
criterion "Elig":
- when ( "A" and "B" ).
decision "D":
all:
- when "Elig" then recommend activity "Act".
- when "Elig" then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;
    const cel = `# C
library "C".
covers "P".
fact "Pat":
- name is "Pat".
- defined by "Patient".
fact "fA":
- code is "http://e|a".
- defined by "P"."A".
fact "fB":
- code is "http://e|b".
- defined by "P"."B".
case "both":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "D" is "Act".`;
    withFixture(crl, cel, ({ cel: celPath }) => {
      const run = runCel(resolveCelImports(celPath)).runs.find((r) => r.case === "both")!;
      const crits = collectCriterionTraces(run.trace);
      // Two occurrences of "Elig" in the case, both naming it.
      const elig = crits.filter((c) => c.op === "criterion" && c.criterion.name === "Elig");
      expect(elig.length).toBe(2);
      // EXACTLY ONE carries the body; EXACTLY ONE is a bare reference — the serialized linearity.
      const bodied = elig.filter((c) => (c as { body?: unknown }).body !== undefined);
      const refs = elig.filter((c) => (c as { reference?: boolean }).reference === true);
      expect(bodied.length).toBe(1);
      expect(refs.length).toBe(1);
      // A `reference` node never carries a body (they are mutually exclusive per occurrence).
      expect((refs[0] as { body?: unknown }).body).toBeUndefined();
    });
  });
});
