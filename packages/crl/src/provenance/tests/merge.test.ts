import { createHash } from "crypto";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { resolveCelImports } from "../../cel/imports";
import type {
  AnchorSourceMeta,
  CelNodeRef,
  CrlNodeRef,
  Item,
  ProvenanceArtifact,
} from "../artifact";
import { generateProvenanceScaffold, mergeScaffold } from "../generate";

// ── fixture: reuse generate.test.ts's covered policy — a `defined as` composite criterion over two leaves, a when-gated
//    recommend + an otherwise recommend; a companion .cel with FROZEN cases (tests-branch / tests-otherwise / a boolean
//    concept assertion). The scaffold's single cluster is `cluster:Policy:Dec`. ─────────────────────────────────────────
const POLICY_CRL = `# P
library "Policy".
concept "LeafA":
- type is Condition.
- code is \`a\`.
concept "LeafB":
- type is Condition.
- code is \`b\`.
concept "Crit":
- defined as ( "LeafA" sem-or "LeafB" ).
activity "Approve":
- request CPGCommunicationRequest.
- with \`ap\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`dn\`.
decision "Dec":
first:
- when "Crit" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;

const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "approve case":
- id is "case-approve".
- subject is "Pat".
- result is "Dec" is "Approve".
case "deny case":
- id is "case-deny".
- subject is "Pat".
- result is "Dec" is "Deny".
case "leaf case":
- id is "case-leaf".
- subject is "Pat".
- result is "LeafA" is true.`;

const ANCHOR = "Approve when criteria are met; otherwise deny.\n";
const TEXT_HASH =
  "sha256:" + createHash("sha256").update(Buffer.from(ANCHOR, "utf8")).digest("hex");

const META: AnchorSourceMeta = {
  path: "anchor.txt",
  derivedFrom: "x.docx",
  derivedFromHash: "sha256:0",
  canonicalizer: "crl-anchor-docx-text",
  canonicalizerVersion: "1.0.0",
  textHash: TEXT_HASH,
  offsetUnit: "utf8-byte",
  unicodeNormalization: "NFC",
  rangeConvention: "half-open",
};

const OPTS = {
  policyId: "P",
  policyVersion: "1",
  anchorSource: META,
  celFileName: "f.cel",
};

let root: string;
let celPath: string;
beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "prov-merge-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "p", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/p" } }),
  );
  writeFileSync(path.join(root, "policy.crl"), POLICY_CRL);
  celPath = path.join(root, "f.cel");
  writeFileSync(celPath, CEL);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const freshScaffold = (): ProvenanceArtifact =>
  generateProvenanceScaffold(resolveCelImports(celPath), OPTS).artifact;

/** Deep-clone an artifact so a test can mutate `previous` without touching the shared fresh scaffold. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const CLUSTER_ID = "cluster:Policy:Dec";

/** Build a realistic `previous` = a generated scaffold + simulated KE work: one source item, linked into the cluster
 *  (cluster.items + a crl ref flipped to "linked"), and an ignoredRange. Returns the artifact + the keys it touched. */
function previousWithKEWork(): {
  previous: ProvenanceArtifact;
  itemId: string;
  linkedCrlKey: string;
  linkedCrlRef: CrlNodeRef;
} {
  const previous = clone(freshScaffold());
  const cluster = previous.clusters.find((c) => c.id === CLUSTER_ID)!;

  // a hand-authored SOURCE item (attributing the `when` criterion to a span of the anchor text).
  const item: Item = {
    id: "i-crit",
    origin: "source",
    text: "Approve when criteria are met",
    sourceRefs: [{ start: 0, end: 29 }],
    role: "criterion",
    roleStatus: "reconciled",
    linkRequirement: "must-link-decision",
  };
  previous.items.push(item);
  cluster.items.push(item.id);

  // flip the criterion's CRL ref (the `when[0]` decision sub-node) to status "linked" — the KE's link.
  const linked = cluster.crl.find(
    (r) => r.relation === "implements-criterion" && r.nodeId === "when[0]",
  )!;
  linked.status = "linked";

  // a KE-recorded ignoredRange (page chrome the KE marked as deliberately unmodeled).
  previous.ignoredRanges.push({ start: 46, end: 47, reason: "trailing newline" });

  return { previous, itemId: item.id, linkedCrlKey: "", linkedCrlRef: linked };
}

describe("mergeScaffold — no-op / load-bearing preservation", () => {
  it("preserves every authored/source item, the ignoredRanges, and every KE-edited ref status", () => {
    const { previous, itemId } = previousWithKEWork();
    const fresh = freshScaffold();
    const { artifact } = mergeScaffold(previous, fresh);

    // the authored item survives verbatim.
    expect(artifact.items.map((it) => it.id)).toContain(itemId);
    expect(artifact.items.find((it) => it.id === itemId)).toEqual(
      previous.items.find((it) => it.id === itemId),
    );

    // the ignoredRange survives.
    expect(artifact.ignoredRanges).toEqual(previous.ignoredRanges);

    // the cluster's item link survives, and the linked CRL ref stays "linked".
    const cluster = artifact.clusters.find((c) => c.id === CLUSTER_ID)!;
    expect(cluster.items).toContain(itemId);
    const linked = cluster.crl.find((r) => r.nodeId === "when[0]")!;
    expect(linked.status).toBe("linked");
    expect(linked.relation).toBe("implements-criterion");

    // envelope fields come from fresh.
    expect(artifact.schemaVersion).toBe(fresh.schemaVersion);
    expect(artifact.policyId).toBe(fresh.policyId);
    expect(artifact.anchorSource).toEqual(fresh.anchorSource); // same hash → fresh anchorSource
  });
});

describe("mergeScaffold — idempotent on the artifact", () => {
  it("merge(merge(P,F).artifact, F).artifact === merge(P,F).artifact (byte-identical JSON)", () => {
    const { previous } = previousWithKEWork();
    const fresh = freshScaffold();
    const once = mergeScaffold(previous, fresh).artifact;
    const twice = mergeScaffold(once, fresh).artifact;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe("mergeScaffold — removed CRL node", () => {
  it("a PROVISIONAL previous-only crl ref is dropped + a removed-node diagnostic is emitted", () => {
    const previous = clone(freshScaffold());
    const fresh = freshScaffold();
    // remove a node from fresh that previous still has as PROVISIONAL (LeafB — never KE-touched in this previous).
    const freshCluster = fresh.clusters.find((c) => c.id === CLUSTER_ID)!;
    const removed = freshCluster.crl.find((r) => r.name === "LeafB")!;
    const removedKey = JSON.stringify([removed.lib, removed.kind, removed.name, removed.nodeId ?? null]);
    freshCluster.crl = freshCluster.crl.filter((r) => r.name !== "LeafB");

    const { artifact, diagnostics } = mergeScaffold(previous, fresh);
    const cluster = artifact.clusters.find((c) => c.id === CLUSTER_ID)!;
    expect(cluster.crl.some((r) => r.name === "LeafB")).toBe(false);
    expect(
      diagnostics.some((d) => d.kind === "removed-node" && d.nodeKey === removedKey),
    ).toBe(true);
  });

  it("a KE-touched (linked) previous-only crl ref is KEPT as needs-relink + needs-relink + orphaned-link diagnostics", () => {
    const { previous, itemId } = previousWithKEWork();
    const fresh = clone(freshScaffold());
    // remove the very node the KE linked (the when[0] criterion) from fresh.
    const freshCluster = fresh.clusters.find((c) => c.id === CLUSTER_ID)!;
    freshCluster.crl = freshCluster.crl.filter((r) => r.nodeId !== "when[0]");

    const { artifact, diagnostics } = mergeScaffold(previous, fresh);
    const cluster = artifact.clusters.find((c) => c.id === CLUSTER_ID)!;
    const kept = cluster.crl.find((r) => r.nodeId === "when[0]");
    expect(kept).toBeDefined();
    expect(kept!.status).toBe("needs-relink");
    expect(kept!.relation).toBe("implements-criterion"); // relation preserved

    expect(diagnostics.some((d) => d.kind === "needs-relink" && d.surface === "crl")).toBe(true);
    const orphaned = diagnostics.find((d) => d.kind === "orphaned-link");
    expect(orphaned).toBeDefined();
    expect(orphaned!.itemIds).toContain(itemId); // the item linked through this cluster is flagged

    // IDEMPOTENT across the needs-relink path: re-merging the result against the same fresh keeps the needs-relink ref
    // (now KE-touched via its needs-relink status) stable — no oscillation back to dropped/added.
    const twice = mergeScaffold(artifact, fresh).artifact;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(artifact));
  });
});

describe("mergeScaffold — renamed decision", () => {
  it("a previous cluster with no fresh match → orphaned-cluster with the linked item id; the item survives in items[]", () => {
    const { previous, itemId } = previousWithKEWork();
    // simulate a RENAME: the previous cluster is for Policy:Dec; build a fresh whose cluster is a DIFFERENT id.
    const fresh = clone(freshScaffold());
    const freshCluster = fresh.clusters[0];
    freshCluster.id = "cluster:Policy:DecRenamed";
    freshCluster.label = "DecRenamed";

    const { artifact, diagnostics } = mergeScaffold(previous, fresh);

    // the authored item survives at the artifact level regardless of cluster fate.
    expect(artifact.items.map((it) => it.id)).toContain(itemId);

    const orphan = diagnostics.find(
      (d) => d.kind === "orphaned-cluster" && d.cluster === CLUSTER_ID,
    );
    expect(orphan).toBeDefined();
    expect(orphan!.itemIds).toContain(itemId);

    // fresh's renamed cluster is present; the old id is gone (no phantom cluster re-added).
    expect(artifact.clusters.map((c) => c.id)).toEqual(["cluster:Policy:DecRenamed"]);
  });

  it("an authored item whose supports.cluster names the gone cluster is included in orphaned-cluster itemIds", () => {
    const previous = clone(freshScaffold());
    const cluster = previous.clusters.find((c) => c.id === CLUSTER_ID)!;
    const authored: Item = {
      id: "i-rationale",
      origin: "authored",
      text: "clinical assumption glue",
      authoredKind: "clinical-assumption",
      supports: { cluster: CLUSTER_ID, items: [] },
    };
    previous.items.push(authored);
    cluster.items.push(authored.id);

    const fresh = clone(freshScaffold());
    fresh.clusters[0].id = "cluster:Policy:DecRenamed";

    const { diagnostics } = mergeScaffold(previous, fresh);
    const orphan = diagnostics.find((d) => d.kind === "orphaned-cluster" && d.cluster === CLUSTER_ID)!;
    expect(orphan.itemIds).toContain("i-rationale");
  });
});

describe("mergeScaffold — CEL relation override preserved", () => {
  it("a KE-edited cel relation survives a fresh re-derivation that picks a different relation (key ignores relation)", () => {
    const previous = clone(freshScaffold());
    const cluster = previous.clusters.find((c) => c.id === CLUSTER_ID)!;
    // KE-edit the case-approve cel ref: flip relation to tests-otherwise + mark it linked.
    const celRef = cluster.cel.find((r) => r.caseId === "case-approve")!;
    celRef.relation = "tests-otherwise";
    celRef.status = "linked";

    // fresh re-derives case-approve with the ORIGINAL relation (tests-branch).
    const fresh = freshScaffold();
    const freshRef = fresh.clusters
      .find((c) => c.id === CLUSTER_ID)!
      .cel.find((r) => r.caseId === "case-approve")!;
    expect(freshRef.relation).toBe("tests-branch"); // sanity: fresh disagrees with the KE

    const { artifact } = mergeScaffold(previous, fresh);
    const merged = artifact.clusters
      .find((c) => c.id === CLUSTER_ID)!
      .cel.find((r: CelNodeRef) => r.caseId === "case-approve")!;
    expect(merged.relation).toBe("tests-otherwise"); // KE override kept
    expect(merged.status).toBe("linked");
  });
});

describe("mergeScaffold — source-changed", () => {
  it("P.textHash != F.textHash → source-changed diagnostic AND merged.anchorSource === P.anchorSource (sourceRefs preserved)", () => {
    const { previous } = previousWithKEWork();
    const fresh = clone(freshScaffold());
    // simulate a re-canonicalization onto NEW source text.
    fresh.anchorSource = { ...fresh.anchorSource, textHash: "sha256:DIFFERENT" };

    const { artifact, diagnostics } = mergeScaffold(previous, fresh);
    expect(diagnostics.some((d) => d.kind === "source-changed")).toBe(true);
    // the previous anchorSource is KEPT (so the validator keeps emitting anchor-hash-drift durably).
    expect(artifact.anchorSource).toEqual(previous.anchorSource);
    // sourceRefs on the authored item are not stripped.
    const item = artifact.items.find((it) => it.id === "i-crit")!;
    expect(item.sourceRefs).toEqual([{ start: 0, end: 29 }]);
  });
});

describe("mergeScaffold — dangling-item-id", () => {
  it("a surviving cluster.items id not present in items[] → a dangling-item-id diagnostic", () => {
    const previous = clone(freshScaffold());
    const cluster = previous.clusters.find((c) => c.id === CLUSTER_ID)!;
    cluster.items.push("ghost-item"); // a link with no backing item

    const fresh = freshScaffold();
    const { diagnostics, artifact } = mergeScaffold(previous, fresh);
    const dangling = diagnostics.find(
      (d) => d.kind === "dangling-item-id" && d.cluster === CLUSTER_ID,
    );
    expect(dangling).toBeDefined();
    expect(dangling!.itemIds).toEqual(["ghost-item"]);
    // the dangling id is still carried verbatim into the merged cluster (items[] is taken from previous).
    expect(artifact.clusters.find((c) => c.id === CLUSTER_ID)!.items).toContain("ghost-item");
  });
});
