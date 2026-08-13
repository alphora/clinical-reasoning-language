// #224 ii.1c — a concept referenced ONLY inside a `criterion` body must still be
// decision-REACHED (and gating). Provenance is a SOURCE-side consumer (no expansion /
// materialization), so the reachability walk FOLLOWS criterion refs into their bodies via the
// linear, memoized `guardConceptClosure` (criterionIndex.ts). Without this, "Gate Concept" —
// reachable only through `criterion "Eligible"` — would be invisible to the decision-reachability
// walk (the disc-300 closure argument, transposed to provenance). The criterion NAME-level
// declaration index (find-refs / rename) stays deferred to ii.4.

import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { resolveCelImports } from "../../cel/imports";
import { buildProvenanceIndex, type ProvNodeRef } from "../indexer";
import { buildCrlStructure } from "../crlStructure";

const CEL = `# C
library "C".
covers "Policy".
fact "Pat":
- name is "Pat".
- defined by "Patient".
case "c":
- subject is "Pat".
- result is "PolicyDec" is "Act".`;

// A policy whose decision guard is a criterion; the criterion body is the SOLE reference to
// "Gate Concept".
const POLICY = `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
criterion "Eligible":
- when ( "Gate Concept" ).
decision "PolicyDec":
first:
- when "Eligible" then recommend activity "Act".
- otherwise then recommend activity "No".
activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;

const conceptRef = (name: string): ProvNodeRef => ({ lib: "Policy", kind: "concept", name });

describe("#224 ii.1c — provenance follows criteria into their bodies", () => {
  it("a concept referenced ONLY via a criterion body is decision-reached", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "prov-crit-"));
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", private: true }),
      );
      writeFileSync(path.join(root, "policy.crl"), POLICY);
      const celPath = path.join(root, "f.cel");
      writeFileSync(celPath, CEL);
      const graph = resolveCelImports(celPath);
      const idx = buildProvenanceIndex(graph);
      // (indexer) The criterion-only concept is reached BY the decision — proving the source-
      // side body-follow (branchConditionRefs alone would skip the criterion ref and miss it).
      expect(idx.isDecisionReached(conceptRef("Gate Concept"))).toBe(true);

      // (crlStructure) The guard row bridges to the criterion BODY's concept (not a dangling
      // criterion-kind key) — proving `refKeysOf` follows the criterion.
      const structs = buildCrlStructure(graph);
      const whenRow = structs
        .flatMap((s) => s.children)
        .find((n) => n.kind === "when" && n.decision === "PolicyDec");
      expect(whenRow).toBeDefined();
      expect(whenRow!.refKeys.some((k) => k.includes("Gate Concept"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
