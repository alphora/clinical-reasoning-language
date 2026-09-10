import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { emitCQLImports, emitCQLImportsFromPrepared } from "../emit";
import { resolveImports } from "../index";
import { preparePublicationContext } from "../preparePublicationContext";

// REFACTOR:grounded (#320, review 560) — actual split identities and raw scoped admission
// are the contract. These tests verify generated routing, not runtime selector correctness.
const directories: string[] = [];
const base = "https://example.org/publication";
const publication = (name = "Answer", code = "answer") => `concept "${name}":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`${code}\`.
- shape reduction is most recent.
`;
const choice = `concept "Choice":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`choice\`.
- value domain is answer options.
- value from is "Fixture Choice Answer Options":
  - not qualifying is \`no\`.
- shape reduction is most recent.


terminology "Fixture Choice Answer Options":
- system is \`https://example.org/answer-codes\`.
- code is \`yes\` display is \`Yes\`.
- code is \`no\` display is \`No\`.
`;
const membership = (operand: string) => `concept "Result":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is ${operand} in qualifying.
- shape reduction is most recent.
`;
function project(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), "crl-publication-emit-"));
  directories.push(directory);
  for (const [name, source] of Object.entries({
    "package.json": JSON.stringify({ name: "publication", version: "1.0.0", crl: { canonicalBase: base } }),
    ...files,
  })) {
    const file = path.join(directory, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source, "utf8");
  }
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.join(path.resolve(tmpdir()), "crl-publication-emit-")))
      throw new Error("Unexpected temporary fixture path");
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("prepared publication imports emission", () => {
  // REFACTOR:grounded (#320, review 562): a producer must consume the operand's
  // selected envelope through the actual manifest target, after raw syntax disappears.
  it("routes a foreign selected operand to its physical envelope without a dangling source include", () => {
    const directory = project({
      "root.crl": 'library "Consumer".\n' + membership('"Answers"."Choice"'),
      "answers.crl": 'library "Answers".\n' + choice,
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const target = [...result.publicationTargets!.values()].find((item) => item.define === "Choice")!;
    expect(target).toEqual({ libraryName: "PublicationAnswersInferences", define: "Choice" });
    const consumer = result.cqlByLibrary.find((item) => item.cql.includes('define "Result":'))!;
    expect(consumer.includes).toContain(target.libraryName);
    expect(consumer.cql).toContain(`${target.libraryName}."__CRL_PublicationEnvelope_v1_Choice"`);
    expect(consumer.cql).not.toMatch(/include Answers(?:\s|$)/);
    for (const item of result.cqlByLibrary) expect(item.includes).not.toContain(item.libraryName);
    expect(consumer.cql).not.toContain("ToConcept");
  });

  it("preserves same-source envelope routing and nonblocking no-negative warning", () => {
    const directory = project({ "root.crl": 'library "Source".\n' +
      choice.replace(/:\n  - not qualifying is[^\n]*\n/, ".\n") + membership('"Choice"') });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.warnings?.some((warning) => warning.kind === "answer-options-all-qualifying")).toBe(true);
    const producer = result.cqlByLibrary.find((item) => item.cql.includes('define "Result":'))!;
    expect(producer.cql).toContain('"__CRL_PublicationEnvelope_v1_Choice"');
    for (const item of result.cqlByLibrary) expect(item.includes).not.toContain(item.libraryName);
  });

  it("emits from the prepared source and metadata after the files disappear", () => {
    const directory = project({ "root.crl": 'library "Source".\n' + publication() });
    const root = path.join(directory, "root.crl");
    const pathResult = emitCQLImports(root);
    const prepared = preparePublicationContext(resolveImports(root), { canonicalBase: base, policyId: "publication" });
    unlinkSync(root);
    unlinkSync(path.join(directory, "package.json"));
    const result = emitCQLImportsFromPrepared(prepared);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.cqlByLibrary).toEqual(pathResult.cqlByLibrary);
    expect(result.graph).toBe(prepared.graph);
    const descriptor = prepared.publications.descriptors[0];
    const target = result.publicationTargets?.get(descriptor.identity.key);
    expect(target).toEqual({ libraryName: "PublicationInferences", define: "Answer" });
    const emitted = result.cqlByLibrary.find((entry) => entry.libraryName === target?.libraryName)!;
    expect(emitted.cql).toContain('define "Answer":');
    expect(emitted.includes).toContain("PublicationLocalElements");
    expect(emitted.ledgerEntries?.find((entry) => entry.name === "Answer")).toMatchObject({ result: { shape: "Record", resourceType: "Observation" } });
  });

  it("keeps an unsupported opt-in as an authored-site failure with no partial artifacts", () => {
    const directory = project({ "root.crl": 'library "Source".\n' + publication().replace("shape is Record.", "shape is RecordSet.") });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toEqual([]);
    expect(result.errors).toMatchObject([{ kind: "publication-unsupported-form", line: 7 }]);
  });

  it("routes a foreign Boolean publication through its actual split library and nullable value", () => {
    const directory = project({
      "root.crl": `library "Consumer".
criterion "Read":
- when ( "Answers"."Answer" and "Answers"."Answer" ).
activity "Proceed":
- request CPGServiceRequest.
decision "Use":
- when "Read" then recommend activity "Proceed".
`,
      "answers.crl": 'library "Answers".\n' + publication(),
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const consumer = result.cqlByLibrary.find((entry) => entry.sourceLibraryName === "Consumer")!;
    expect(consumer.cql).toContain("include PublicationAnswersInferences");
    expect(consumer.cql).toContain('FHIRHelpers.ToBoolean((PublicationAnswersInferences."Answer").value as FHIR.boolean)');
    expect(consumer.cql).not.toMatch(/include Answers(?:\s|$)/);
    expect([...result.publicationTargets!.values()]).toContainEqual({ libraryName: "PublicationAnswersInferences", define: "Answer" });
  });

  it.each([false, true])("includes a foreign same-named publication read by an emitted criterion (nested=%s)", (nested) => {
    const directory = project({
      "root.crl": 'library "Consumer".\n' + publication("X", "local-x") + `
criterion "Ready":
- when ("X" or "Answers"."X").
${nested ? 'criterion "Outer":\n- when ("Ready").\n' : ''}
activity "Proceed":
- request CPGServiceRequest.
decision "Use":
- when "${nested ? "Outer" : "Ready"}" then recommend activity "Proceed".
`,
      "answers.crl": 'library "Answers".\n' + publication("X", "foreign-x"),
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const iface = result.cqlByLibrary.find((entry) => entry.sourceLibraryName === "Consumer" && entry.role === "interface")!;
    const target = [...result.publicationTargets!.values()].find((entry) => entry.define === "X" && entry.libraryName.includes("Answers"))!;
    expect(iface.cql).toContain(`FHIRHelpers.ToBoolean((${target.libraryName}."X").value as FHIR.boolean)`);
    expect(iface.includes).toContain(target.libraryName);
    expect(iface.cql).toContain(`include ${target.libraryName}`);
    expect(result.cqlByLibrary.some((entry) => entry.libraryName === target.libraryName)).toBe(true);
    expect(iface.cql).not.toMatch(/include Answers(?:\s|$)/);
  });

  it("rejects unsupported publication composition explicitly", () => {
    const directory = project({
      "root.crl": 'library "Consumer".\nconcept "Read":\n- value type is boolean.\n- defined as ( "Answers"."Answer" and "Answers"."Answer" ).\n',
      "answers.crl": 'library "Answers".\n' + publication(),
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success).toBe(false);
    expect(result.errors).toMatchObject([{ kind: "publication-unsupported-context" }]);
    expect(result.cqlByLibrary).toEqual([]);
  });

  it("does not grant a caller access to a package publication loaded by another owner", () => {
    const directory = project({
      "root.crl": `library "Consumer".
include "Bridge".
criterion "Read":
- when ( "Pkg"."Answer" ).
activity "Proceed":
- request CPGServiceRequest.
decision "Use":
- when "Read" then recommend activity "Proceed".
`,
      "bridge.crl": 'library "Bridge".\ninclude "Pkg".\n',
      "node_modules/pkg/package.json": JSON.stringify({ name: "pkg", version: "1.0.0", crl: { libraries: ["pkg.crl"] } }),
      "node_modules/pkg/pkg.crl": 'library "Pkg".\n' + publication(),
    });
    const prepared = preparePublicationContext(resolveImports(path.join(directory, "root.crl")), { canonicalBase: base, policyId: "publication" });
    expect(prepared.publications.descriptors).toHaveLength(1);
    expect(prepared.publications.lookup(prepared.graph.rootPath, {
      type: "QualifiedReference", libraryName: "Pkg", name: "Answer", location: prepared.graph.resolvedLibraries[0].ast.location,
    })).toMatchObject({ kind: "error" });
    const result = emitCQLImportsFromPrepared(prepared);
    expect(result.success).toBe(false);
    expect(result.cqlByLibrary).toEqual([]);
  });

  it("routes a self-qualified decision use without adding a self include", () => {
    const directory = project({
      "root.crl": 'library "Source".\n' + publication() + `activity "Proceed":
- request CPGServiceRequest.
decision "Use":
- when "Source"."Answer" then recommend activity "Proceed".
`,
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const iface = result.cqlByLibrary.find((entry) => entry.role === "interface")!;
    // The façade carries the selected envelope unchanged, then projects its Record.
    expect(iface.cql).toContain('PublicationInferences."__CRL_PublicationEnvelope_v1_Answer"');
    expect(iface.cql).toContain('"__CRL_PublicationSelection_v1_Record"("__CRL_PublicationEnvelope_v1_Answer")');
    for (const entry of result.cqlByLibrary) expect(entry.includes).not.toContain(entry.libraryName);
    expect([...result.publicationTargets!.values()]).toContainEqual({ libraryName: "PublicationInferences", define: "Answer" });
  });

  it("uses the actual renamed root when an activity keeps the source unsplit", () => {
    const directory = project({
      "package.json": JSON.stringify({ name: "publication", crl: { canonicalBase: base } }),
      "root.crl": 'library "Source Name".\n' + publication() + 'activity "Proceed":\n- request CPGServiceRequest.\n',
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect([...result.publicationTargets!.values()]).toEqual([{ libraryName: "SourceName", define: "Answer" }]);
    const source = result.cqlByLibrary.find((entry) => entry.sourceLibraryName === "Source Name")!;
    expect(source.role).toBe("root");
    expect(source.cql).toContain("library SourceName");
    expect(source.includes).toEqual([]);
  });

  it("does not permit a legacy reference merely because the target has a publication", () => {
    const directory = project({
      "root.crl": 'library "Consumer".\nconcept "Read":\n- value type is boolean.\n- defined as "Answers"."Legacy".\n',
      "answers.crl": 'library "Answers".\n' + publication() + 'concept "Legacy":\n- value type is boolean.\n- defined as exists ( "Answer" ).\n',
    });
    const result = emitCQLImports(path.join(directory, "root.crl"));
    expect(result.success).toBe(false);
    expect(result.errors).toMatchObject([{ kind: "emit-cross-library-ref-into-split-library" }]);
    expect(result.cqlByLibrary).toEqual([]);
  });
});
