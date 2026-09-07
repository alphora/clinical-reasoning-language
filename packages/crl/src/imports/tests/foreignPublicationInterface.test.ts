import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { emitCQLImports } from "../emit";
import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";

// REFACTOR:grounded (#320, review 563): a foreign-only decision guard needs a real
// CQL namespace with its actual dependency, without a dummy local concept facade.
const directories: string[] = [];
const foreign = `library "Foreign".
concept "X":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`x\`.
- shape reduction is most recent.
`;
const local = `concept "Unused":
- type is Observation.
- value type is boolean.
- code is \`unused\`.
- definition is exists this.
`;
const decision = `activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
decision "D":
first:
- when "Foreign"."X" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
`;
function project(root: string, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "crl-foreign-anchor-"));
  directories.push(dir);
  for (const [name, value] of Object.entries({
    "package.json": JSON.stringify({ name: "foreign-anchor", version: "1.0.0", crl: { canonicalBase: "https://example.org/foreign-anchor", date: "2026-09-06" } }),
    "root.crl": root, "foreign.crl": foreign, ...extra,
  })) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value, "utf8");
  }
  return path.join(dir, "root.crl");
}
afterEach(() => {
  for (const dir of directories.splice(0)) {
    if (!path.resolve(dir).startsWith(path.join(path.resolve(tmpdir()), "crl-foreign-anchor-"))) throw new Error("Unexpected fixture path");
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("foreign publication decision namespace", () => {
  it("materializes and includes the actual foreign target when local declarations are unused by guards", () => {
    const file = project('library "Policy".\n' + local + decision);
    const result = emitCQLImports(file);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const iface = result.cqlByLibrary.find((e) => e.sourceLibraryName === "Policy" && e.role === "interface")!;
    expect(iface).toBeDefined();
    const target = [...result.publicationTargets!.values()].find((e) => e.define === "X")!;
    expect(iface.includes).toContain(target.libraryName);
    expect(iface.includes).not.toContain("Foreign");
    expect(iface.cql).not.toContain('define "X":');
    expect(iface.cql).not.toContain('define "Unused":');
    const fhir = emitFhirDefFromPath(file);
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    expect(fhir.resources.some((e) => e.sourceKind === "Decision")).toBe(true);
  });

  it("also works with no local concept declaration, using the existing name-keeping root", () => {
    const file = project('library "Policy".\n' + decision);
    const cql = emitCQLImports(file);
    expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
    // REFACTOR:grounded (#320, review 563 I3): this is the existing unsplit root,
    // whose actual foreign dependency must still resolve; it is not a new Interface reservation.
    const root = cql.cqlByLibrary.find((e) => e.sourceLibraryName === "Policy")!;
    expect(root.libraryName).toBe("Policy");
    expect(root.role).not.toBe("interface");
    const target = [...cql.publicationTargets!.values()].find((e) => e.define === "X")!;
    expect(root.includes).toContain(target.libraryName);
    expect(root.includes).not.toContain("Foreign");
    expect(root.cql).toContain(`include ${target.libraryName}`);
    const fhir = emitFhirDefFromPath(file);
    expect(fhir.success, JSON.stringify(fhir.errors)).toBe(true);
    const plan = fhir.resources.find((e) => e.sourceKind === "Decision")!.resource as { library: string[] };
    expect(plan.library).toContain(`https://example.org/foreign-anchor/Library/${target.libraryName}`);
  });

  it("reserves the new Interface identity during collision preflight", () => {
    const file = project('library "Policy".\ninclude "ForeignAnchorInterface".\n' + local + decision, {
      "collision.crl": 'library "ForeignAnchorInterface".\nterminology "Codes":\n- system is \`http://example.org/codes\`.\n- code is \`a\`.\n',
    });
    const result = emitCQLImports(file);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.kind?.includes("collision") && e.message?.includes("ForeignAnchorInterface"))).toBe(true);
  });
});
