import { parseInput } from "../../ast/tests/parseInput";
import { idOf } from "../../ast/decisionSpine";
import type { CRL, Decision, QualifiedReference, ReferenceName } from "../../ast/types";
import type { Registry, RegistryEntry } from "../../imports/types";

import { buildGlobalDecisionMap, makeResolveDecision } from "../decisionResolver";

/**
 * #172 todo-1 — the NON-behavioral cross-library decision resolver infrastructure. These tests pin the parts the
 * same-library tests can't exercise (cross-library resolution + local-first precedence) and the `(lib,name)` cycle-key
 * invariant — even though the 4 deferral guards still defer, so NONE of this is yet recursed.
 */

const LOC = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 }, startOffset: 0, endOffset: 1 };
const qref = (libraryName: string, name: string): QualifiedReference => ({
  type: "QualifiedReference",
  libraryName,
  name,
  location: LOC as QualifiedReference["location"],
});

/** A minimal CRL library with a single trivial decision named `decName`. */
function libWith(libName: string, decName: string): CRL {
  return parseInput(`# ${libName}
library "${libName}".
activity "Act":
- request CPGCommunicationRequest.
- with \`x\`.
decision "${decName}":
first:
- otherwise then recommend activity "Act".`);
}

function entry(ast: CRL, origin: RegistryEntry["origin"], filePath: string): RegistryEntry {
  return { name: ast.library.name, filePath, ast, isRoot: origin === "root", origin };
}

describe("#172 todo-1 — global (lib,name) decision map + shared resolver", () => {
  it("resolves a cross-library (lib,name) target even though it is not yet recursed", () => {
    const covered = libWith("Policy", "Root");
    const shared = libWith("Shared", "Sub");
    const registry: Registry = {
      byNameLocal: new Map([["Shared", entry(shared, "local", "/shared.crl")]]),
      byNamePackage: new Map(),
    };
    const map = buildGlobalDecisionMap({
      crlRegistry: registry,
      coveredLib: "Policy",
      coveredFilePath: "/policy.crl",
      coveredStatements: covered.statements.filter((s): s is Decision => s.type === "Decision"),
    });
    const resolve = makeResolveDecision(map);

    // A QUALIFIED ref "Shared"."Sub" binds the shared lib's decision, with its OWN lib + file (for todo-2's sub-frame).
    const r = resolve("Policy", qref("Shared", "Sub"));
    expect(r).toBeDefined();
    expect(r!.decision.name).toBe("Sub");
    expect(r!.lib).toBe("Shared");
    expect(r!.filePath).toBe("/shared.crl");

    // A BARE ref resolves against the CALLER lib — same-library, the only path that recurses today.
    const same = resolve("Policy", "Root");
    expect(same!.decision.name).toBe("Root");
    expect(same!.lib).toBe("Policy");
    expect(same!.filePath).toBe("/policy.crl");

    // An unknown (lib,name) → undefined (todo-2 turns this into an unresolved-cross-lib diagnostic).
    expect(resolve("Policy", qref("Shared", "Missing"))).toBeUndefined();
    expect(resolve("Nope", "Root")).toBeUndefined();
  });

  it("LOCAL-FIRST precedence on a same-name local+package collision (matches indexer.ts:12-13)", () => {
    // Two libs both named "Shared" declaring a decision "Sub" — one local, one package, distinguished by file path.
    const localShared = libWith("Shared", "Sub");
    const packageShared = libWith("Shared", "Sub");
    const registry: Registry = {
      byNameLocal: new Map([["Shared", entry(localShared, "local", "/local/shared.crl")]]),
      byNamePackage: new Map([["Shared", entry(packageShared, "package", "/pkg/shared.crl")]]),
    };
    const map = buildGlobalDecisionMap({
      crlRegistry: registry,
      coveredLib: "Policy",
      coveredFilePath: "/policy.crl",
      coveredStatements: [],
    });
    const resolve = makeResolveDecision(map);
    // LOCAL wins: package added first, local overwrites → the file is the LOCAL one.
    expect(resolve("Policy", qref("Shared", "Sub"))!.filePath).toBe("/local/shared.crl");
  });

  it("the covered library's own decisions win for its name (added last; inline-graph path has no registry)", () => {
    const covered = libWith("Policy", "Root");
    // No registry at all (inline-graph path) — the covered statements are the only source.
    const map = buildGlobalDecisionMap({
      coveredLib: "Policy",
      coveredFilePath: "/policy.crl",
      coveredStatements: covered.statements.filter((s): s is Decision => s.type === "Decision"),
    });
    const resolve = makeResolveDecision(map);
    expect(resolve("Policy", "Root")!.filePath).toBe("/policy.crl");
  });
});

describe("#172 todo-1 — the (lib,name) cycle key", () => {
  it("still detects a same-library self-cycle (no regression vs the old bare-name key)", () => {
    // Within ONE library the lib prefix is constant, so idOf(lib,name) collapses to a 1:1 rename of the bare name —
    // a same-library re-entry is still caught.
    const seen = new Set<string>([idOf("Policy", "Sub")]);
    expect(seen.has(idOf("Policy", "Sub"))).toBe(true); // re-entering Policy.Sub → cycle
  });

  it("does NOT false-collide A.Sub vs B.Sub (the bare-name key WOULD have)", () => {
    // The whole point of the (lib,name) re-key: two libraries each with a decision "Sub" are DISTINCT keys, so a
    // cross-library walk through A.Sub then B.Sub is not a spurious cycle. The old bare "Sub" key would have collided.
    const seen = new Set<string>([idOf("A", "Sub")]);
    expect(seen.has(idOf("B", "Sub"))).toBe(false); // B.Sub is NOT on the path → no false cycle
    expect(idOf("A", "Sub")).not.toBe(idOf("B", "Sub"));
  });
});
