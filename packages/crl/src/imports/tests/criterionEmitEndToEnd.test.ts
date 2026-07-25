// #224 ii.1c — end-to-end CQL emit through the PUBLIC entry (`emitCQLImports`) over a
// decision whose guard references a `criterion`. This exercises the emit-family seams that
// run OUTSIDE the FHIR decision lane — the CQL emit closure (S6, `computeCqlEmitClosure`) and
// the Interface re-export surface (S8, `interfaceSurface`) — proving they EXPAND the guard
// (never trip the un-expanded-criterion tripwire) and that a concept referenced only via the
// criterion body still surfaces on the Interface. Also proves the C1 fix: an envelope-
// breaching criterion is a STRUCTURED error at this boundary, never an uncaught throw.

import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect } from "vitest";

import { emitCQLImports } from "../emit";

const ACTIVITIES = `activity "Act":
- request CPGServiceRequest.
- with \`ok\`.
activity "No":
- request CPGCommunicationRequest.
- with \`no\`.`;

// A decision-bearing `code is` policy (→ the layered split path, which runs interfaceSurface)
// whose guard is a criterion; "Gate Concept" is referenced ONLY through the criterion body.
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
${ACTIVITIES}`;

// Doubling-chain criterion C0..C10: C0 = Gate and Gate (2 atoms); C_k = C_{k-1} and C_{k-1}
// → 2^(k+1). C10 materializes 2048 leaves > the 1024 atom cap.
function overflowPolicy(): string {
  const criteria = [`criterion "C0":\n- when ( "Gate Concept" and "Gate Concept" ).`];
  for (let k = 1; k <= 10; k++) criteria.push(`criterion "C${k}":\n- when ( "C${k - 1}" and "C${k - 1}" ).`);
  return `# Policy
library "Policy".
concept "Gate Concept":
- type is Observation.
- code is \`gate\`.
${criteria.join("\n")}
decision "PolicyDec":
first:
- when "C10" then recommend activity "Act".
- otherwise then recommend activity "No".
${ACTIVITIES}`;
}

function withPolicy<T>(policySrc: string, fn: (root: string) => T): T {
  const root = mkdtempSync(path.join(os.tmpdir(), "crit-cql-"));
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "policy",
        version: "0.0.0",
        private: true,
        crl: { canonicalBase: "http://example.org/x" },
      }),
    );
    writeFileSync(path.join(root, "policy.crl"), policySrc);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("#224 ii.1c — criterion CQL emit (closure + interface surface)", () => {
  it("emits successfully and re-exports the criterion-only concept on the INTERFACE library", () => {
    withPolicy(POLICY, (root) => {
      const result = emitCQLImports(path.join(root, "policy.crl"));
      // Success proves S6 (computeCqlEmitClosure) + S8 (interfaceSurface) EXPANDED the
      // criterion guard rather than throwing the un-expanded-criterion tripwire.
      expect(result.success).toBe(true);
      // Assert specifically the INTERFACE library (`PolicyInterface`) re-exports the
      // criterion-body concept — NOT merely that some LocalSource library mentions the name
      // (which would pass trivially). The re-export existing proves S8 followed the criterion.
      const iface = result.cqlByLibrary.find((e) => e.libraryName === "PolicyInterface")?.cql ?? "";
      expect(iface).toContain("Gate Concept");
    });
  });

  it("an envelope-breaching criterion is a STRUCTURED error at the boundary, not a crash (C1)", () => {
    withPolicy(overflowPolicy(), (root) => {
      // Must not throw out of the public API (the pre-fix behavior was an uncaught
      // CriterionExpansionError from interfaceSurface).
      const result = emitCQLImports(path.join(root, "policy.crl"));
      expect(result.success).toBe(false);
      const overflow = (result.errors ?? []).find((e) => e.kind === "criterion-expansion-overflow");
      expect(overflow).toBeDefined();
    });
  });
});
