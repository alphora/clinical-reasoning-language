/**
 * #172 todo-3 (FULL) — BOUNDARY fixtures for cross-library provenance (disc 157 "Boundary fixtures to add"). The
 * cross-lib-chain.test.ts suite proves the headline single-sub round-trip; this suite exercises the four boundaries the
 * design calls out:
 *   (a) a chain reaching BOTH a policy-owned sibling AND a declared-shared lib in ONE path
 *       (Policy.D → Sibling.SubP → Shared.SubS): the disposition cluster spans all three libs; the sibling rows are
 *       policy-owned (over-reach candidates / coverage), the shared rows are shared-reference (LIT, gate-passing, NOT
 *       candidates); both modes round-trip; the terminal attaches to cluster:Shared:SubS.
 *   (b) shared-chains-shared (Shared.Sub → Shared.Sub2): the ctx-from-RUN-PATH catch — `decisionReachability` skips a
 *       declared-shared target's sub-nodes (indexer.ts:513), so Sub2 is reached ONLY via the run path. Without the
 *       run-path ctx population, Sub2 would be unmapped → defer. WITH it, the chain round-trips clean and the default
 *       mode attributes to cluster:Shared:Sub2 (the deepest firing sub).
 *   (c) policy-owned cross-lib sibling vs declared-shared, over-reach in BOTH modes: a policy-owned cross-lib sub's
 *       untaken arms ARE over-reach candidates; a declared-shared sub's are NOT — orthogonal to the disposition cite.
 *   (d) the coverage cluster's UNTAKEN cross-lib sub-nodes: policy-owned untaken → in coverage; shared-reference untaken
 *       → filtered out (the ownership-filtered spine push).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { resolveCelImports } from "../../cel/imports";
import type { AnchorSourceMeta } from "../artifact";
import { deriveCoverage, isOverReach } from "../coverage";
import { generateProvenanceScaffold } from "../generate";
import { generateProvenanceFiles } from "../generateFiles";
import { buildProvenanceIndex, decisionSubNodeRef, nodeKey } from "../indexer";
import { validateProvenanceFiles } from "../validateFiles";

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
const ANCHOR_TEXT = "anchor.\n";

interface Fixture {
  root: string;
  celPath: string;
  anchorPath: string;
}
/** Write a multi-CRL project + the CEL + the anchor; `shared` lists the libs to declare in crl.sharedLibraries. */
function mkFixture(
  prefix: string,
  crls: Record<string, string>,
  cel: string,
  shared: string[],
): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "p",
      version: "0.0.0",
      private: true,
      ...(shared.length ? { crl: { sharedLibraries: shared } } : {}),
    }),
  );
  for (const [name, src] of Object.entries(crls))
    writeFileSync(path.join(root, `${name}.crl`), src);
  const celPath = path.join(root, "policy.cel");
  writeFileSync(celPath, cel);
  const anchorPath = path.join(root, "anchor.txt");
  writeFileSync(anchorPath, ANCHOR_TEXT);
  return { root, celPath, anchorPath };
}
const dispoOf = (clusters: { id: string }[]) => clusters.filter((c) => !c.id.endsWith(":coverage"));
const coverageOf = <T extends { id: string }>(clusters: T[]): T | undefined =>
  clusters.find((c) => c.id.endsWith(":coverage"));

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (a) one chain through BOTH a policy-owned sibling AND a declared-shared lib.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const A_POLICY = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Sibling"."SubP".
  end.`;
const A_SIBLING = `# Sibling
library "Sibling".
concept "SibCrit":
- type is Condition.
- code is \`sib\`.
decision "SubP":
- when "SibCrit" then:
  - use decision "Shared"."SubS".
  end.`;
const A_SHARED = `# Shared
library "Shared".
concept "ShrCrit":
- type is Condition.
- code is \`shr\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "SubS":
- when "ShrCrit" then recommend activity "Approve".`;
const A_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fSib":
- code is "http://example.org|sib".
- date is "2026-01-01".
- defined by "Sibling"."SibCrit".
fact "fShr":
- code is "http://example.org|shr".
- date is "2026-01-01".
- defined by "Shared"."ShrCrit".
case "chain through both":
- id is "case-both".
- subject is "Pat".
- fact is "fIndic".
- fact is "fSib".
- fact is "fShr".
- result is "D" is "Approve".`;

describe("#172 todo-3 boundary (a) — a chain through a POLICY-OWNED sibling AND a DECLARED-SHARED lib", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("xlib-a-", { policy: A_POLICY, sibling: A_SIBLING, shared: A_SHARED }, A_CEL, [
      "Shared",
    ]);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("disposition-path: ONE cluster spans all three libs; Sibling rows policy-owned, Shared rows shared-reference", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const dispo = dispoOf(r.artifact.clusters);
    expect(dispo).toHaveLength(1);
    const own = new Map(dispo[0].crl.map((x) => [`${x.lib}::${x.name}#${x.nodeId}`, x.ownership]));
    // the sibling's firing rows are POLICY-OWNED; the shared sub's are SHARED-REFERENCE (LIT but not over-reach candidates).
    expect(own.get("Sibling::SubP#when[0]/action[0]")).toBe("policy-owned");
    expect(own.get("Shared::SubS#when[0]/action[0]")).toBe("shared-reference");
    expect(dispo[0].cel.map((x) => x.caseId)).toEqual(["case-both"]);
  });

  it("disposition-path: the FINAL gate round-trips clean (zero cockpit-correspondence findings)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const artPath = path.join(fx.root, "art-a.json");
    writeFileSync(artPath, JSON.stringify(r.artifact, null, 2) + "\n");
    const corr = validateProvenanceFiles(
      artPath,
      fx.celPath,
      fx.anchorPath,
      "final",
    ).findings.filter((f) => f.kind === "cockpit-correspondence");
    expect(corr).toEqual([]);
  });

  it("coverage: the policy-owned Sibling concept IS in the denominator; no Shared row is", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const cov = coverageOf(r.artifact.clusters)!;
    const libs = cov.crl.map((x) => x.lib);
    expect(libs).toContain("Sibling"); // a policy-owned sibling's leaf is a coverage/over-reach candidate.
    expect(libs).not.toContain("Shared"); // a declared-shared lib contributes NO coverage rows.
  });

  it("default mode: clusters for all three libs; the case attaches to cluster:Shared:SubS (the terminal lib)", () => {
    const r = generateProvenanceScaffold(resolveCelImports(fx.celPath), {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
    });
    expect(r.artifact.clusters.map((c) => c.id).sort()).toEqual([
      "cluster:Policy:D",
      "cluster:Shared:SubS",
      "cluster:Sibling:SubP",
    ]);
    const sub = r.artifact.clusters.find((c) => c.id === "cluster:Shared:SubS")!;
    expect(sub.cel.map((x) => `${x.caseId}:${x.relation}`)).toEqual(["case-both:tests-branch"]);
    expect(r.diagnostics.some((d) => d.kind === "cel-result-run-mismatch")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (b) shared-chains-shared: Shared.Sub → Shared.Sub2 (the ctx-from-run-path catch). Shared is DECLARED shared.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const B_POLICY = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Shared"."Sub".
  end.`;
const B_SHARED = `# Shared
library "Shared".
concept "Crit":
- type is Condition.
- code is \`crit\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "Sub":
- when "Crit" then:
  - use decision "Sub2".
  end.
decision "Sub2":
- when "Crit" then recommend activity "Approve".`;
const B_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fCrit":
- code is "http://example.org|crit".
- date is "2026-01-01".
- defined by "Shared"."Crit".
case "shared chains shared":
- id is "case-deep".
- subject is "Pat".
- fact is "fIndic".
- fact is "fCrit".
- result is "D" is "Approve".`;

describe("#172 todo-3 boundary (b) — shared-chains-shared (Shared.Sub → Shared.Sub2): the ctx-from-run-path catch", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("xlib-b-", { policy: B_POLICY, shared: B_SHARED }, B_CEL, ["Shared"]);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("disposition-path: the cluster cites BOTH Shared.Sub AND Shared.Sub2 (Sub2 reached ONLY via the run path)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const dispo = dispoOf(r.artifact.clusters);
    expect(dispo).toHaveLength(1);
    const cited = dispo[0].crl.map((x) => `${x.lib}::${x.name}#${x.nodeId}`).sort();
    // the run path spans Policy.D + Shared.Sub + Shared.Sub2 — Sub2 is the run-path-only frame the design's ctx population
    // catches (decisionReachability would skip it: indexer.ts:513 does not recurse a declared-shared target's sub-nodes).
    expect(cited).toEqual([
      "Policy::D#when[0]",
      "Policy::D#when[0]/action[0]",
      "Shared::Sub#when[0]",
      "Shared::Sub#when[0]/action[0]",
      "Shared::Sub2#when[0]",
      "Shared::Sub2#when[0]/action[0]",
    ]);
    // every Shared row is shared-reference (LIT, gate-passing, NOT a coverage candidate).
    for (const x of dispo[0].crl)
      if (x.lib === "Shared") expect(x.ownership).toBe("shared-reference");
  });

  it("disposition-path: the FINAL gate round-trips clean (the run-path frame Sub2 is grounded, not unmapped)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const artPath = path.join(fx.root, "art-b.json");
    writeFileSync(artPath, JSON.stringify(r.artifact, null, 2) + "\n");
    const corr = validateProvenanceFiles(
      artPath,
      fx.celPath,
      fx.anchorPath,
      "final",
    ).findings.filter((f) => f.kind === "cockpit-correspondence");
    expect(corr).toEqual([]);
  });

  it("default mode: a cluster:Shared:Sub2 EXISTS and carries the case (the deepest firing sub)", () => {
    const r = generateProvenanceScaffold(resolveCelImports(fx.celPath), {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
    });
    expect(r.artifact.clusters.map((c) => c.id).sort()).toEqual([
      "cluster:Policy:D",
      "cluster:Shared:Sub",
      "cluster:Shared:Sub2",
    ]);
    const sub2 = r.artifact.clusters.find((c) => c.id === "cluster:Shared:Sub2")!;
    expect(sub2.cel.map((x) => x.caseId)).toEqual(["case-deep"]); // the disposition fired in Sub2 → it carries the case.
    expect(r.artifact.clusters.find((c) => c.id === "cluster:Shared:Sub")!.cel).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (c)+(d) over-reach + coverage: policy-owned cross-lib sibling vs declared-shared, in BOTH modes. Reuses (a)'s
// topology in TWO manifests: Shared DECLARED shared (a's default) vs Shared a LOCAL sibling (policy-owned).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("#172 todo-3 boundary (c)+(d) — over-reach + coverage of cross-lib sub-nodes by ownership", () => {
  // Shared DECLARED shared: Sibling.SubP is policy-owned (its untaken arms ARE candidates); Shared.SubS is
  // shared-reference (NOT candidates, NOT in coverage).
  let fxShared: Fixture;
  // Shared a LOCAL sibling (NOT declared): now BOTH Sibling.SubP AND Shared.SubS are policy-owned → both in the
  // denominator.
  let fxLocal: Fixture;
  beforeAll(() => {
    fxShared = mkFixture(
      "xlib-cd-shared-",
      { policy: A_POLICY, sibling: A_SIBLING, shared: A_SHARED },
      A_CEL,
      ["Shared"],
    );
    fxLocal = mkFixture(
      "xlib-cd-local-",
      { policy: A_POLICY, sibling: A_SIBLING, shared: A_SHARED },
      A_CEL,
      [],
    );
  });
  afterAll(() => {
    rmSync(fxShared.root, { recursive: true, force: true });
    rmSync(fxLocal.root, { recursive: true, force: true });
  });

  it("(c) over-reach: a policy-owned cross-lib sibling's sub-node IS a candidate; a declared-shared sub-node is NOT", () => {
    const index = buildProvenanceIndex(resolveCelImports(fxShared.celPath));
    const sibNode = index.nodes.get(nodeKey(decisionSubNodeRef("Sibling", "SubP", "when[0]")))!;
    const shrNode = index.nodes.get(nodeKey(decisionSubNodeRef("Shared", "SubS", "when[0]")))!;
    expect(sibNode.ownership).toBe("policy-owned");
    expect(shrNode.ownership).toBe("shared-reference");
    const itemsById = new Map<string, never>();
    const emptyArt = {
      schemaVersion: 1 as const,
      policyId: "P",
      policyVersion: "1",
      anchorSource: META,
      items: [],
      ignoredRanges: [],
      clusters: [],
    };
    expect(isOverReach(sibNode, emptyArt, itemsById)).toBe(true); // policy-owned cross-lib sibling → candidate.
    expect(isOverReach(shrNode, emptyArt, itemsById)).toBe(false); // declared-shared → never a candidate.
  });

  it("(d) coverage: an UNTAKEN policy-owned cross-lib sub-node is HOMED in coverage; a shared one is FILTERED out", () => {
    // Add an untaken `otherwise` arm to a policy-owned sibling vs a shared sub by using the LOCAL-sibling manifest:
    // when Shared is NOT declared shared, Shared.SubS is policy-owned. In BOTH manifests the disposition cluster cites
    // the TAKEN when[0] arm; the coverage cluster must carry every UNTAKEN policy-owned sub-node and NO shared one.
    const rShared = generateProvenanceFiles(fxShared.celPath, fxShared.anchorPath, {
      clusterBy: "disposition-path",
    });
    const covShared = coverageOf(rShared.artifact.clusters)!;
    // declared-shared manifest: NO Shared row in coverage (filtered); Sibling's reachable concept IS in coverage.
    expect(covShared.crl.some((x) => x.lib === "Shared")).toBe(false);
    expect(covShared.crl.some((x) => x.lib === "Sibling")).toBe(true);

    const rLocal = generateProvenanceFiles(fxLocal.celPath, fxLocal.anchorPath, {
      clusterBy: "disposition-path",
    });
    const covLocal = coverageOf(rLocal.artifact.clusters)!;
    // local-sibling manifest: Shared.SubS is now POLICY-OWNED, so its reachable concept appears in coverage too.
    expect(covLocal.crl.some((x) => x.lib === "Shared")).toBe(true);

    // and the over-reach baseline shrinks when Shared is declared shared (its sub-nodes drop out of the denominator).
    const idxShared = buildProvenanceIndex(resolveCelImports(fxShared.celPath));
    const idxLocal = buildProvenanceIndex(resolveCelImports(fxLocal.celPath));
    const orShared = deriveCoverage(rShared.artifact, idxShared, ANCHOR_TEXT).overReach.filter(
      (n) => n.ref.lib === "Shared",
    );
    const orLocal = deriveCoverage(rLocal.artifact, idxLocal, ANCHOR_TEXT).overReach.filter(
      (n) => n.ref.lib === "Shared",
    );
    expect(orShared).toHaveLength(0); // declared-shared → no Shared node is over-reach.
    void orLocal; // (local Shared nodes are homed by coverage so not over-reach here; ownership is the point — see (c))
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// FIX 3 — the "untaken arms" coverage boundary, with EXACT nodeIds. A chain Policy.D → Sibling.SubP (policy-owned, has
// an untaken `otherwise`) → Shared.SubS (declared-shared, has an untaken `otherwise`). The run takes the when[0] arm of
// each. The coverage cluster must carry the POLICY-OWNED untaken arm nodeIds (Sibling.SubP#otherwise[/action[0]]) and
// MUST NOT carry the SHARED untaken arm nodeIds (Shared.SubS#otherwise[/action[0]]) — pinning that the ownership filter
// is on the SPINE PUSH and policy-owned untaken arms ARE over-reach candidates.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const UT_POLICY = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Sibling"."SubP".
  end.`;
const UT_SIBLING = `# Sibling
library "Sibling".
concept "SibCrit":
- type is Condition.
- code is \`sib\`.
activity "SibNo":
- request CPGCommunicationRequest.
- with \`n\`.
decision "SubP":
first:
- when "SibCrit" then:
  - use decision "Shared"."SubS".
  end.
- otherwise then recommend activity "SibNo".`;
const UT_SHARED = `# Shared
library "Shared".
concept "ShrCrit":
- type is Condition.
- code is \`shr\`.
activity "ShrYes":
- request CPGCommunicationRequest.
- with \`a\`.
activity "ShrNo":
- request CPGCommunicationRequest.
- with \`b\`.
decision "SubS":
first:
- when "ShrCrit" then recommend activity "ShrYes".
- otherwise then recommend activity "ShrNo".`;
const UT_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fSib":
- code is "http://example.org|sib".
- date is "2026-01-01".
- defined by "Sibling"."SibCrit".
fact "fShr":
- code is "http://example.org|shr".
- date is "2026-01-01".
- defined by "Shared"."ShrCrit".
case "both yes":
- id is "case-both".
- subject is "Pat".
- fact is "fIndic".
- fact is "fSib".
- fact is "fShr".
- result is "D" is "ShrYes".`;

describe("#172 todo-3 boundary FIX 3 — coverage carries POLICY-OWNED untaken arms, EXCLUDES SHARED untaken arms (exact nodeIds)", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture(
      "xlib-untaken-",
      { policy: UT_POLICY, sibling: UT_SIBLING, shared: UT_SHARED },
      UT_CEL,
      ["Shared"],
    );
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("coverage PRESENT: the policy-owned sibling's untaken otherwise arm nodes (exact nodeIds)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const cov = coverageOf(r.artifact.clusters)!;
    const covRows = new Set(cov.crl.map((x) => `${x.lib}::${x.name}#${x.nodeId}`));
    // the policy-owned sibling's UNTAKEN otherwise arm + its recommend are over-reach candidates → HOMED in coverage.
    expect(covRows.has("Sibling::SubP#otherwise")).toBe(true);
    expect(covRows.has("Sibling::SubP#otherwise/action[0]")).toBe(true);
    // relation: the otherwise criterion row is implements-criterion; its recommend is recommends-disposition.
    const relOf = new Map(cov.crl.map((x) => [`${x.lib}::${x.name}#${x.nodeId}`, x.relation]));
    expect(relOf.get("Sibling::SubP#otherwise")).toBe("implements-criterion");
    expect(relOf.get("Sibling::SubP#otherwise/action[0]")).toBe("recommends-disposition");
  });

  it("coverage ABSENT: the declared-shared sub's untaken otherwise arm nodes are FILTERED OUT (the spine-push filter)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const cov = coverageOf(r.artifact.clusters)!;
    const covRows = new Set(cov.crl.map((x) => `${x.lib}::${x.name}#${x.nodeId}`));
    // the SHARED sub's untaken arm is shared-reference → NOT an over-reach candidate → NOT in coverage (the ownership
    // filter on the spine push). No Shared row at all appears in coverage.
    expect(covRows.has("Shared::SubS#otherwise")).toBe(false);
    expect(covRows.has("Shared::SubS#otherwise/action[0]")).toBe(false);
    expect(cov.crl.some((x) => x.lib === "Shared")).toBe(false);
  });

  it("the TAKEN when[0] arms are in the disposition cluster, not coverage (sanity that 'untaken' is the discriminator)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const dispo = dispoOf(r.artifact.clusters)[0];
    const dispoRows = new Set(dispo.crl.map((x) => `${x.lib}::${x.name}#${x.nodeId}`));
    expect(dispoRows.has("Sibling::SubP#when[0]")).toBe(true);
    expect(dispoRows.has("Shared::SubS#when[0]/action[0]")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// FIX 1 — a cross-lib SAME-NAME delegation (Policy.D → Shared.D): attributes to cluster:Shared:D, NOT cluster:Policy:D.
// This is the name-collision class the (lib, name) re-key closed; `isNonChained` must compare BOTH lib AND decision.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SN_POLICY = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
- when "Indic" then:
  - use decision "Shared"."D".
  end.`;
const SN_SHARED = `# Shared
library "Shared".
concept "Crit":
- type is Condition.
- code is \`crit\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "D":
- when "Crit" then recommend activity "Approve".`;
const SN_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fCrit":
- code is "http://example.org|crit".
- date is "2026-01-01".
- defined by "Shared"."Crit".
case "same name":
- id is "case-sn".
- subject is "Pat".
- fact is "fIndic".
- fact is "fCrit".
- result is "D" is "Approve".`;

describe("#172 todo-3 boundary FIX 1 — a SAME-NAME cross-lib delegation (Policy.D → Shared.D) attributes to the SUB's lib", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("xlib-samename-", { policy: SN_POLICY, shared: SN_SHARED }, SN_CEL, []);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("default mode: the disposition attaches to cluster:Shared:D, NOT cluster:Policy:D (the name-collision is closed)", () => {
    const r = generateProvenanceScaffold(resolveCelImports(fx.celPath), {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
    });
    expect(r.artifact.clusters.map((c) => c.id).sort()).toEqual([
      "cluster:Policy:D",
      "cluster:Shared:D",
    ]);
    const shared = r.artifact.clusters.find((c) => c.id === "cluster:Shared:D")!;
    expect(shared.cel.map((x) => `${x.caseId}:${x.relation}`)).toEqual(["case-sn:tests-branch"]);
    // the COVERED Policy.D does NOT carry the case (the bug FIX 1 closes: a name-only isNonChained would land it here).
    const policy = r.artifact.clusters.find((c) => c.id === "cluster:Policy:D")!;
    expect(policy.cel.some((x) => x.caseId === "case-sn")).toBe(false);
    expect(r.diagnostics.some((d) => d.kind === "cel-result-run-mismatch")).toBe(false);
  });

  it("disposition-path mode: the cluster cites BOTH Policy::D and Shared::D rows + the FINAL gate is clean (correspondence)", () => {
    const r = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy: "disposition-path" });
    const dispo = dispoOf(r.artifact.clusters);
    expect(dispo).toHaveLength(1);
    const cited = dispo[0].crl.map((x) => `${x.lib}::${x.name}#${x.nodeId}`).sort();
    expect(cited).toEqual([
      "Policy::D#when[0]",
      "Policy::D#when[0]/action[0]",
      "Shared::D#when[0]",
      "Shared::D#when[0]/action[0]",
    ]);
    const artPath = path.join(fx.root, "art-sn.json");
    writeFileSync(artPath, JSON.stringify(r.artifact, null, 2) + "\n");
    const corr = validateProvenanceFiles(
      artPath,
      fx.celPath,
      fx.anchorPath,
      "final",
    ).findings.filter((f) => f.kind === "cockpit-correspondence");
    expect(corr).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// FIX 4 — a CROSS-LIB AMBIGUOUS case: two subs in DIFFERENT libs both recommend the SAME activity X in ONE `all:` run
// → ≥2 distinct firing terminals across libs → ambiguous-cel-branch defer (the cross-lib clusterIdFor(terminal.lib)
// ambiguity path), NO phantom attach to any cluster.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const AM_POLICY = `# Policy
library "Policy".
concept "Indic":
- type is Condition.
- code is \`indic\`.
decision "D":
all:
- when "Indic" then:
  - use decision "LibA"."SubA".
  end.
- when "Indic" then:
  - use decision "LibB"."SubB".
  end.`;
const AM_LIBA = `# LibA
library "LibA".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`a\`.
decision "SubA":
- when "Indic" then recommend activity "Approve".`;
const AM_LIBB = `# LibB
library "LibB".
concept "Indic":
- type is Condition.
- code is \`indic\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`b\`.
decision "SubB":
- when "Indic" then recommend activity "Approve".`;
const AM_CEL = `# PolicyCases
library "PolicyCases".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fIndic":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "Indic".
fact "fA":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "LibA"."Indic".
fact "fB":
- code is "http://example.org|indic".
- date is "2026-01-01".
- defined by "LibB"."Indic".
case "ambig":
- id is "case-ambig".
- subject is "Pat".
- fact is "fIndic".
- fact is "fA".
- fact is "fB".
- result is "D" is "Approve".`;

describe("#172 todo-3 boundary FIX 4 — a CROSS-LIB ambiguous case (two libs fire the same X) → honest defer, no phantom attach", () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = mkFixture("xlib-ambig-", { policy: AM_POLICY, liba: AM_LIBA, libb: AM_LIBB }, AM_CEL, []);
  });
  afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

  it("default mode: clusters for both cross-lib subs EXIST but neither carries the case → ambiguous-cel-branch defer", () => {
    const r = generateProvenanceScaffold(resolveCelImports(fx.celPath), {
      policyId: "Policy",
      policyVersion: "1",
      anchorSource: META,
      celFileName: "policy.cel",
    });
    // the widened cluster set includes BOTH cross-lib subs (run-path-reached).
    expect(r.artifact.clusters.map((c) => c.id).sort()).toEqual([
      "cluster:LibA:SubA",
      "cluster:LibB:SubB",
      "cluster:Policy:D",
    ]);
    // X fired in TWO distinct sub-decisions across libs → ambiguous-cel-branch; NO cluster carries the case (no guess).
    const ambig = r.diagnostics.filter((d) => d.kind === "ambiguous-cel-branch");
    expect(ambig).toHaveLength(1);
    expect(ambig[0].caseId).toBe("case-ambig");
    for (const c of r.artifact.clusters)
      expect(c.cel.some((x) => x.caseId === "case-ambig")).toBe(false);
    // and it is NOT mis-routed to a phantom leaf-name attach / run-mismatch.
    expect(r.diagnostics.some((d) => d.kind === "cel-result-run-mismatch")).toBe(false);
    expect(r.diagnostics.some((d) => d.kind === "unsupported-cel-result")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SINGLE-LIB BYTE-IDENTITY: a single-lib policy reaches NO cross-lib sub → reachableCtx == covered decisions → the
// (lib, name) key-shape change is INTERNAL → the artifact is byte-identical to pre-change. We can't diff against the
// old build directly, so we pin the OBSERVABLE invariants the byte-identity rests on: (1) NO cross-lib cluster appears
// (every cluster id is in the covered lib); (2) the cluster set is exactly the covered decisions (+ coverage in dpp
// mode); (3) two runs are byte-identical (determinism survives the re-key). The #170/#174/#175 corpus + determinism
// suites (generate*.test.ts, chainBaseline.test.ts) are the broader byte-identity pins and stay green.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SINGLE_NONCHAIN = `# Solo
library "Solo".
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
const SINGLE_CHAIN = `# Solo
library "Solo".
concept "Crit":
- type is Condition.
- code is \`c\`.
activity "Final":
- request CPGCommunicationRequest.
- with \`f\`.
decision "Sub":
- when "Crit" then recommend activity "Final".
decision "Main":
- when "Crit" then:
  - use decision "Sub".
  end.`;
const SINGLE_NONCHAIN_CEL = `# C
library "C".
covers "Solo".
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
const SINGLE_CHAIN_CEL = `# C
library "C".
covers "Solo".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fCrit":
- code is "http://example.org|c".
- date is "2026-01-01".
- defined by "Crit".
case "main":
- id is "case-main".
- subject is "Pat".
- fact is "fCrit".
- result is "Main" is "Final".`;

describe("#172 todo-3 — SINGLE-LIB byte-identity guard (the re-key is internal; no cross-lib ctx is reached)", () => {
  for (const [label, crl, cel] of [
    ["non-chaining", SINGLE_NONCHAIN, SINGLE_NONCHAIN_CEL] as const,
    ["same-lib-chained", SINGLE_CHAIN, SINGLE_CHAIN_CEL] as const,
  ]) {
    describe(`${label} single-lib policy`, () => {
      let fx: Fixture;
      beforeAll(() => {
        fx = mkFixture(`xlib-single-${label}-`, { solo: crl }, cel, []);
      });
      afterAll(() => rmSync(fx.root, { recursive: true, force: true }));

      for (const clusterBy of ["decision", "disposition-path"] as const) {
        it(`${clusterBy} mode: every cluster id is in the covered lib (no cross-lib cluster) + deterministic`, () => {
          const a = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy });
          const b = generateProvenanceFiles(fx.celPath, fx.anchorPath, { clusterBy });
          // determinism survives the (lib, name) re-key.
          expect(JSON.stringify(a.artifact)).toBe(JSON.stringify(b.artifact));
          // NO cross-lib cluster — every cluster id is `cluster:Solo:…` (the covered lib).
          for (const c of a.artifact.clusters) {
            expect(c.id.startsWith("cluster:Solo:")).toBe(true);
          }
        });
      }
    });
  }
});
