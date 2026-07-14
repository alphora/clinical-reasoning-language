/**
 * #175 final slice (Path 3, disc 154) — the DEFAULT `clusterBy:"decision"` provenance generate mode is now CHAIN-AWARE.
 *
 * A chained same-lib `use decision` case's branch result `D is X` (X fires in a SUB-decision) attaches to the SUB's
 * cluster + arm (where its disposition actually fired), instead of orphaning the sub-clusters + emitting
 * `ambiguous-cel-branch`/`unsupported-cel-result`. NON-chained cases stay BYTE-IDENTICAL (purely additive).
 *
 * Coverage:
 *  - chained-resolves (the headline): the chain fixture → the case lands in the SUB cluster, sub-clusters populated, no
 *    orphan diagnostic.
 *  - D also recommends X but the run fired the sub's X → routes to the sub, not D.
 *  - chained-ambiguous (X fired in two subs in one run) → `ambiguous-cel-branch`, no attach-to-guess.
 *  - result/run mismatch (`D is X`, run produced Y) → `cel-result-run-mismatch`.
 *  - name-collision (falls through to today's path), render-fail-still-scaffolds, unfrozen chained (`unfrozen-case`, no ref).
 *  - boolean unchanged on a chained policy.
 *  - BYTE-IDENTICAL non-chained: the whole #170/#174 corpus + the determinism test are covered by their own suites; here
 *    we additionally assert a non-chained policy's default output is byte-identical with chain-aware code present.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolveCelImports } from "../../cel/imports";
import * as cre from "../../cre";
import { vi, type MockInstance } from "vitest";
import type { AnchorSourceMeta } from "../artifact";
import { generateProvenanceScaffold } from "../generate";

import { CHAIN_CRL, CHAIN_CEL } from "./fixtures/chainFixture";

const META: AnchorSourceMeta = {
  path: "anchor.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: "sha256:0",
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

const OPTS = { policyId: "P", policyVersion: "1", anchorSource: META, celFileName: "f.cel" };

interface Fx {
  root: string;
  celPath: string;
}
function mkFx(prefix: string, crl: string, cel: string): Fx {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true }),
  );
  writeFileSync(path.join(root, "policy.crl"), crl);
  const celPath = path.join(root, "f.cel");
  writeFileSync(celPath, cel);
  return { root, celPath };
}
const gen = (fx: Fx, opts = OPTS) => generateProvenanceScaffold(resolveCelImports(fx.celPath), opts);
const celOf = (r: ReturnType<typeof gen>, clusterId: string) =>
  r.artifact.clusters.find((c) => c.id === clusterId)?.cel ?? [];
const diagKinds = (r: ReturnType<typeof gen>) => r.diagnostics.map((d) => d.kind);

// ── 1) chained-resolves (THE HEADLINE) ────────────────────────────────────────────────────────────────────────────
describe("#175 default-mode chain-aware — the headline: a chained case lands in the SUB cluster, NOT covered D", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-resolves-", CHAIN_CRL, CHAIN_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("`Main is Final` (Final fires at Sub3) attaches to cluster:CHAIN:Sub3 with tests-branch; Main carries nothing", () => {
    const r = gen(fx, { ...OPTS, policyId: "CHAIN" });
    // Sub3 (the firing sub) carries the case; the covered decision Main does NOT.
    expect(celOf(r, "cluster:CHAIN:Sub3").map((x) => `${x.caseId}:${x.relation}`)).toEqual([
      "case-deep:tests-branch",
    ]);
    expect(celOf(r, "cluster:CHAIN:Main")).toEqual([]);
    // and NO orphan diagnostics for it — the #175 repro is gone.
    expect(diagKinds(r)).not.toContain("ambiguous-cel-branch");
    expect(diagKinds(r)).not.toContain("unsupported-cel-result");
    expect(diagKinds(r)).not.toContain("cel-result-run-mismatch");
  });
});

// ── 2) D ALSO recommends X directly, but the RUN fired the sub's X → routes to the SUB, not D ───────────────────────
// Main's `otherwise` directly recommends "Final" (so "Final" matches Main's OWN spine too — the old leaf-name path would
// pick Main), but the case satisfies Indic → walks the when[0] arm → use Sub → Sub recommends Final. The run fired in Sub.
const DUAL_CRL = `# DUAL
library "DUAL".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "Sub":
- when "Indic" then recommend activity "Final".
decision "Main":
first:
- when "Indic" then:
  - use decision "Sub".
  end.
- otherwise then recommend activity "Final".`;
const DUAL_CEL = `# C
library "C".
covers "DUAL".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "dual":
- id is "case-dual".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

describe("#175 default-mode — D directly recommends X too, but the run fired the SUB's X → routes to the sub", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-dual-", DUAL_CRL, DUAL_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the case lands in cluster:DUAL:Sub (where Final fired), NOT cluster:DUAL:Main (which also recommends Final)", () => {
    const r = gen(fx, { ...OPTS, policyId: "DUAL" });
    expect(celOf(r, "cluster:DUAL:Sub").map((x) => `${x.caseId}:${x.relation}`)).toEqual([
      "case-dual:tests-branch",
    ]);
    expect(celOf(r, "cluster:DUAL:Main")).toEqual([]);
  });
});

// ── 3) chained-AMBIGUOUS: X fired in TWO subs in ONE run → ambiguous-cel-branch, no attach-to-guess ────────────────
// Main is `all:` over two whens, each delegating to a sub that recommends "Final". Both fire → "Final" produced TWICE
// in two distinct sub frames → ambiguous; DEFER (don't pick a cluster).
const AMBIG_CRL = `# AMB
library "AMB".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "SubA":
- when "Indic" then recommend activity "Final".
decision "SubB":
- when "Indic" then recommend activity "Final".
decision "Main":
all:
- when "Indic" then:
  - use decision "SubA".
  end.
- when "Indic" then:
  - use decision "SubB".
  end.`;
const AMBIG_CEL = `# C
library "C".
covers "AMB".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "ambig":
- id is "case-ambig".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

describe("#175 default-mode — X fired in TWO subs in one run → ambiguous-cel-branch, no attach-to-guess", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-ambig-", AMBIG_CRL, AMBIG_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("emits ambiguous-cel-branch and attaches the case to NO cluster (neither SubA nor SubB nor Main)", () => {
    const r = gen(fx, { ...OPTS, policyId: "AMB" });
    const ambig = r.diagnostics.filter((d) => d.kind === "ambiguous-cel-branch");
    expect(ambig).toHaveLength(1);
    expect(ambig[0].caseId).toBe("case-ambig");
    // no cluster carries the case (no guessed attach).
    for (const c of r.artifact.clusters) {
      expect(c.cel.some((x) => x.caseId === "case-ambig")).toBe(false);
    }
  });
});

// ── 4) result/run MISMATCH: `Main is Other`, but the run produced "Final" → cel-result-run-mismatch ───────────────
// Reuse the DUAL policy but assert a disposition the run did NOT produce. (Main also recommends "Final" on otherwise, but
// the when[0]/use-Sub path is taken and produces Final; the result names a different, un-produced target.)
const MISMATCH_CRL = `# MIS
library "MIS".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
activity "Other":
- request CPGCommunicationRequest.
- with \`o\`.
decision "Sub":
- when "Indic" then recommend activity "Final".
decision "Main":
first:
- when "Indic" then:
  - use decision "Sub".
  end.
- otherwise then recommend activity "Other".`;
const MISMATCH_CEL = `# C
library "C".
covers "MIS".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "mismatch":
- id is "case-mismatch".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Other".`;

describe("#175 default-mode — result claims a disposition the run did not produce → cel-result-run-mismatch", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-mismatch-", MISMATCH_CRL, MISMATCH_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("`Main is Other` (run produced Final) → cel-result-run-mismatch, no cluster attach", () => {
    const r = gen(fx, { ...OPTS, policyId: "MIS" });
    const mm = r.diagnostics.filter((d) => d.kind === "cel-result-run-mismatch");
    expect(mm).toHaveLength(1);
    expect(mm[0].caseId).toBe("case-mismatch");
    // it names the produced target(s) (Final).
    expect(mm[0].message).toContain("Final");
    // no cluster carries the case.
    for (const c of r.artifact.clusters) {
      expect(c.cel.some((x) => x.caseId === "case-mismatch")).toBe(false);
    }
  });
});

// ── 5) NAME-COLLISION on a CHAINING decision → HONEST DEFER, NO ref to D (disc 155 FIX 2) ──────────────────────────
// Two cases share the name "dup" (one frozen, one unfrozen). The shared name is unsafe to join → runPath undefined. On a
// CHAINING decision we MUST NOT fall through to today's leaf-name path (it would phantom-attach a tests-branch ref to D's
// cluster); instead we DEFER honestly (cel-result-run-mismatch, run-path-unavailable wording), NO ref anywhere.
const COLLISION_CEL = `# C
library "C".
covers "CHAIN".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "dup":
- id is "case-dup1".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".
case "dup":
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

describe("#175 default-mode — a name-collision on a CHAINING decision DEFERS honestly (no phantom ref to D)", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-collision-", CHAIN_CRL, COLLISION_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("does not crash; emits cel-result-run-mismatch (run path unavailable) and NO ref to Main (or any cluster)", () => {
    const r = gen(fx, { ...OPTS, policyId: "CHAIN" });
    // NO ref lands anywhere for the colliding case — not on the firing sub, NOT on the covered Main.
    expect(celOf(r, "cluster:CHAIN:Sub3").some((x) => x.caseId === "case-dup1")).toBe(false);
    expect(celOf(r, "cluster:CHAIN:Main").some((x) => x.caseId === "case-dup1")).toBe(false);
    expect(r.artifact.clusters.every((c) => c.cel.length === 0)).toBe(true);
    // it deferred honestly (chaining decision + undefined run path), NOT a pre-#175 unsupported-cel-result D-attach.
    const mm = r.diagnostics.filter((d) => d.kind === "cel-result-run-mismatch");
    expect(mm.length).toBeGreaterThanOrEqual(1);
    expect(mm.some((d) => /run path is unavailable/.test(d.message))).toBe(true);
    expect(r.diagnostics.some((d) => d.kind === "unsupported-cel-result")).toBe(false);
  });
});

// ── 5b) FIX 2 — a DUAL-shape policy (D ALSO recommends X) with a forced render-fail: NO ref lands in D's cluster ────
// The DUAL policy's Main directly recommends "Final" on otherwise, so today's leaf-name path WOULD attach the case to
// cluster:DUAL:Main. With the run path forced unavailable (render-fail), a chaining decision must DEFER — never that
// phantom Main attach. This is the worst-case the honest-defer gate exists to close.
describe("#175 default-mode FIX 2 — a chaining D that also recommends X: a forced render-fail attaches NO ref to D", () => {
  let fx: Fx;
  let spy: MockInstance;
  beforeAll(() => {
    fx = mkFx("def-chain-dual-renderfail-", DUAL_CRL, DUAL_CEL);
    spy = vi.spyOn(cre, "renderScenario").mockReturnValue({
      schemaVersion: 1,
      success: false,
      source: { celFilePath: fx.celPath },
      caseCount: 0,
      passCount: 0,
      failCount: 0,
      errorCount: 0,
      scenarios: [],
      errors: ["forced render failure"],
    });
  });
  afterAll(() => {
    spy.mockRestore();
    rmSync(fx.root, { recursive: true, force: true });
  });

  it("no ref lands in cluster:DUAL:Main (despite Main directly recommending Final); the case defers", () => {
    const r = gen(fx, { ...OPTS, policyId: "DUAL" });
    // the phantom attach the honest-defer gate exists to PREVENT: Main must NOT carry the case.
    expect(celOf(r, "cluster:DUAL:Main").some((x) => x.caseId === "case-dual")).toBe(false);
    expect(r.artifact.clusters.every((c) => !c.cel.some((x) => x.caseId === "case-dual"))).toBe(true);
    // it deferred (cel-result-run-mismatch), not a pre-#175 leaf-name attach.
    expect(r.diagnostics.some((d) => d.kind === "cel-result-run-mismatch")).toBe(true);
  });
});

// ── 6) RENDER-FAIL still scaffolds: the structural artifact emits; a CHAINING policy's cases DEFER (no ref to D) ─────
describe("#175 default-mode — a wholesale render failure still emits the structural scaffold; chaining cases DEFER", () => {
  let fx: Fx;
  let spy: MockInstance;
  beforeAll(() => {
    fx = mkFx("def-chain-renderfail-", CHAIN_CRL, CHAIN_CEL);
    spy = vi.spyOn(cre, "renderScenario").mockReturnValue({
      schemaVersion: 1,
      success: false,
      source: { celFilePath: fx.celPath },
      caseCount: 0,
      passCount: 0,
      failCount: 0,
      errorCount: 0,
      scenarios: [],
      errors: ["forced render failure"],
    });
  });
  afterAll(() => {
    spy.mockRestore();
    rmSync(fx.root, { recursive: true, force: true });
  });

  it("the per-decision clusters + over-reach baseline + attribution worklist still emit; the chaining case defers (no ref)", () => {
    const r = gen(fx, { ...OPTS, policyId: "CHAIN" });
    // the structural clusters are all present (Main + Sub1..Sub3).
    expect(r.artifact.clusters.map((c) => c.id).sort()).toEqual([
      "cluster:CHAIN:Main",
      "cluster:CHAIN:Sub1",
      "cluster:CHAIN:Sub2",
      "cluster:CHAIN:Sub3",
    ]);
    // the structural diagnostics still emit (over-reach baseline + attribution worklist) — the artifact is NOT aborted.
    expect(r.diagnostics.some((d) => d.kind === "overreach-baseline")).toBe(true);
    expect(r.diagnostics.some((d) => d.kind === "attribution-needed")).toBe(true);
    // FIX 2: with no run path, the CHAINING case DEFERS — NO ref to the firing sub AND NO phantom ref to Main.
    expect(r.artifact.clusters.every((c) => c.cel.length === 0)).toBe(true);
    expect(r.diagnostics.some((d) => d.kind === "cel-result-run-mismatch")).toBe(true);
    // and it does NOT regress to the pre-#175 unsupported-cel-result D-attach.
    expect(r.diagnostics.some((d) => d.kind === "unsupported-cel-result")).toBe(false);
  });
});

// ── 7) UNFROZEN chained → unfrozen-case, no ref ───────────────────────────────────────────────────────────────────
const UNFROZEN_CEL = `# C
library "C".
covers "CHAIN".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "deep unfrozen":
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

describe("#175 default-mode — an UNFROZEN chained case → unfrozen-case diagnostic, no ref attached", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-unfrozen-", CHAIN_CRL, UNFROZEN_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("emits unfrozen-case and attaches NO ref to any cluster", () => {
    const r = gen(fx, { ...OPTS, policyId: "CHAIN" });
    expect(r.diagnostics.some((d) => d.kind === "unfrozen-case")).toBe(true);
    for (const c of r.artifact.clusters) expect(c.cel).toEqual([]);
    // and it is NOT mis-routed to a cel-result-run-mismatch / ambiguous diagnostic.
    expect(r.diagnostics.some((d) => d.kind === "ambiguous-cel-branch")).toBe(false);
  });
});

// ── 7b) FIX 3 — the SAME sub/terminal fired twice in an `all:` run → ONE distinct firing ref → SINGLE attach ────────
// Main is `all:` over two whens, BOTH delegating to the SAME sub "Sub" (which recommends "Final"). The CRE inlines Sub
// twice, so "Final" is produced TWICE — but both produced terminals re-root to the IDENTICAL Sub#when[0]/action[0] ref.
// The refKey dedup must collapse them → exactly ONE distinct firing → a SINGLE attach to cluster:SAME:Sub, NOT ambiguous.
const SAME_CRL = `# SAME
library "SAME".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "Sub":
- when "Indic" then recommend activity "Final".
decision "Main":
all:
- when "Indic" then:
  - use decision "Sub".
  end.
- when "Indic" then:
  - use decision "Sub".
  end.`;
const SAME_CEL = `# C
library "C".
covers "SAME".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "same":
- id is "case-same".
- subject is "Pat".
- fact is "fIndic".
- result is "Main" is "Final".`;

describe("#175 default-mode FIX 3 — the SAME sub terminal fired twice → ONE distinct firing → single attach, no ambiguity", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-same-", SAME_CRL, SAME_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("attaches once to cluster:SAME:Sub (tests-branch) and does NOT flag ambiguous-cel-branch", () => {
    const r = gen(fx, { ...OPTS, policyId: "SAME" });
    expect(celOf(r, "cluster:SAME:Sub").map((x) => `${x.caseId}:${x.relation}`)).toEqual([
      "case-same:tests-branch",
    ]);
    // exactly one cel ref overall for the case (no double-count), and NO ambiguity.
    const refs = r.artifact.clusters.flatMap((c) => c.cel).filter((x) => x.caseId === "case-same");
    expect(refs).toHaveLength(1);
    expect(r.diagnostics.some((d) => d.kind === "ambiguous-cel-branch")).toBe(false);
  });
});

// ── 7c) FIX 4 — a CHAINING policy with a NON-unfrozen DEFERRED classify (no-produced-action) → the line-1073 defer ──
// Main chains `use decision "Sub"` ONLY behind `when "Indic"`. The case does NOT satisfy Indic → the run produces NO
// action → classify defers with reason `no-produced-action` (a comparable run path can't be ground). It is frozen + the
// decision chains → the chaining-but-unclusterable defer fires (NOT a phantom attach to Main), with the run-not-clusterable
// message + reason — exercising the deferred-classify variant of cel-result-run-mismatch (distinct from the firing-0 one).
const NOPROD_CRL = `# NOPROD
library "NOPROD".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "Sub":
- when "Indic" then recommend activity "Final".
decision "Main":
first:
- when "Indic" then:
  - use decision "Sub".
  end.`;
const NOPROD_CEL = `# C
library "C".
covers "NOPROD".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "noprod":
- id is "case-noprod".
- subject is "Pat".
- result is "Main" is "Final".`;

describe("#175 default-mode FIX 4 — a chaining policy's no-produced-action case hits the deferred-classify defer (no phantom attach)", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-noprod-", NOPROD_CRL, NOPROD_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("emits the deferred-classify cel-result-run-mismatch (reason in message) and NO ref to Main", () => {
    const r = gen(fx, { ...OPTS, policyId: "NOPROD" });
    const mm = r.diagnostics.filter((d) => d.kind === "cel-result-run-mismatch");
    expect(mm.length).toBeGreaterThanOrEqual(1);
    // the DEFERRED-classify variant: its message says the run path is "not clusterable (<reason>)" — NOT the firing-0
    // "claims a disposition the run did not produce" wording. The reason for a no-Indic run is no-produced-action.
    const deferredVariant = mm.find((d) => /not clusterable/.test(d.message));
    expect(deferredVariant).toBeDefined();
    expect(deferredVariant!.message).toContain("no-produced-action");
    expect(deferredVariant!.caseId).toBe("case-noprod");
    // NO ref anywhere for the case (no phantom attach to Main).
    expect(r.artifact.clusters.every((c) => !c.cel.some((x) => x.caseId === "case-noprod"))).toBe(true);
  });
});

// ── 8) BOOLEAN result UNCHANGED on a chained policy ───────────────────────────────────────────────────────────────
// A boolean (fact) result on the chain policy still fans to EVERY reachable cluster via conceptToClusterIds (#171),
// independent of the run path — the documented asymmetry. "Indic" gates Main + every sub, so it reaches all four.
const BOOL_CEL = `# C
library "C".
covers "CHAIN".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
case "indic boolean":
- id is "case-bool".
- subject is "Pat".
- fact is "fIndic".
- result is "Indic" is true.`;

describe("#175 default-mode — a BOOLEAN result on a chained policy fans to all reachable clusters (asymmetry, unchanged)", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-chain-bool-", CHAIN_CRL, BOOL_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the asserts-fact ref fans to every cluster whose decision reaches Indic (run-path-independent)", () => {
    const r = gen(fx, { ...OPTS, policyId: "CHAIN" });
    const carrying = r.artifact.clusters
      .filter((c) => c.cel.some((x) => x.caseId === "case-bool" && x.relation === "asserts-fact"))
      .map((c) => c.id)
      .sort();
    // Indic gates Main + Sub1 + Sub2 + Sub3 → all four clusters carry the fact (a fact is about the concept wherever
    // reachable, NOT the single path taken — the documented branch-vs-boolean asymmetry).
    expect(carrying).toEqual([
      "cluster:CHAIN:Main",
      "cluster:CHAIN:Sub1",
      "cluster:CHAIN:Sub2",
      "cluster:CHAIN:Sub3",
    ]);
  });
});

// ── 9) BYTE-IDENTICAL non-chained (additive guard) ────────────────────────────────────────────────────────────────
// A simple non-chained policy: the chain-aware code present must NOT change its default output. (The full #170/#174
// corpus + the determinism test live in generate.test.ts / generate-disposition-path.test.ts; this is a focused extra.)
const NONCHAIN_CRL = `# N
library "N".
concept "Crit":
- type is Condition.
- code is \`c\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`d\`.
decision "Dec":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
const NONCHAIN_CEL = `# C
library "C".
covers "N".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fCrit":
- code is "http://example.org|c".
- date is "2026-01-01".
- defined by "Crit".
case "approve":
- id is "case-approve".
- subject is "Pat".
- fact is "fCrit".
- result is "Dec" is "Approve".
case "deny":
- id is "case-deny".
- subject is "Pat".
- result is "Dec" is "Deny".`;

describe("#175 default-mode — a NON-chained policy's default output is byte-identical (purely additive)", () => {
  let fx: Fx;
  beforeAll(() => {
    fx = mkFx("def-nonchain-", NONCHAIN_CRL, NONCHAIN_CEL);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("the approve case → tests-branch on Dec, the deny case → tests-otherwise on Dec (the pre-#175 leaf-name path)", () => {
    const r = gen(fx, { ...OPTS, policyId: "N" });
    const cel = celOf(r, "cluster:N:Dec")
      .map((x) => `${x.caseId}:${x.relation}`)
      .sort();
    expect(cel).toEqual(["case-approve:tests-branch", "case-deny:tests-otherwise"]);
    // no chained-path diagnostics ever fired for a non-chained policy.
    expect(r.diagnostics.some((d) => d.kind === "cel-result-run-mismatch")).toBe(false);
  });

  it("two runs are byte-identical (determinism holds with the chain-aware render present)", () => {
    const a = gen(fx, { ...OPTS, policyId: "N" });
    const b = gen(fx, { ...OPTS, policyId: "N" });
    expect(JSON.stringify(a.artifact)).toBe(JSON.stringify(b.artifact));
    expect(JSON.stringify(a.diagnostics)).toBe(JSON.stringify(b.diagnostics));
  });
});
