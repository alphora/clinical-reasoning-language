// REFACTOR:grounded — unreleased operation-local external publication assembly.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitCrlTwoLane, captureExternalSupport, captureExternalDecision, createExternalBindings } from "../../index";
import { assertCapturedClosure, checkedArtifactUnion } from "../../emit/externalBindings";
import { computeFhirEmitClosure } from "../computeEmitClosure";
import { resolveImports } from "../index";

const dirs: string[] = [];
const date = "2026-11-22";
const answer = (name: string, code: string) => `concept "${name}":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`${code}\`.
- shape reduction is most recent.
presentation for "${name}":
- question text is "${name}?".
`;
const request = answer("Request", "request");
const helper = `library "Supplemental Inputs".
${request}
concept "Calculate Supplemental Uncertainty":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Request" has a value.
- shape reduction is most recent.
`;
function project(name: string, files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "crl-external-")); dirs.push(dir);
  const all = { "package.json": JSON.stringify({ name, version: "1.0.0", description: "Synthetic external binding", crl: { canonicalBase: "https://example.org/bindings" } }), ...files };
  for (const [path, text] of Object.entries(all)) { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}
function fixtures(criterion = false) {
  const supplement = project("supplement-001", {
    "root.crl": `library "Supplement".
decision "Supplement decision":
- when "Supplemental Inputs"."Calculate Supplemental Uncertainty" then use decision "Parent"."Parent decision".
`,
    "inputs.crl": helper,
    "parent-stub.crl": `library "Parent". activity "Stub": - request CPGTaskRequest.
decision "Parent decision": - otherwise then recommend activity "Stub".`,
  });
  const parent = project("parent-001", {
    "root.crl": `library "Parent".
${answer("Assessment", "assessment")}
${criterion ? 'criterion "Shared": - when ("Supplemental Inputs"."Calculate Supplemental Uncertainty").' : ''}
activity "Met": - request CPGTaskRequest.
decision "Parent decision":
- when ${criterion ? '"Shared"' : '"Supplemental Inputs"."Calculate Supplemental Uncertainty"'} then recommend activity "Met".
`,
    "stub.crl": `library "Supplemental Inputs". ${answer("Calculate Supplemental Uncertainty", "compilation-only-stub")}`,
  });
  return { supplement, parent, s: join(supplement, "root.crl"), p: join(parent, "root.crl") };
}
afterEach(() => { for (const dir of dirs.splice(0)) { if (!dir.startsWith(join(tmpdir(), "crl-external-"))) throw Error("Unexpected fixture"); rmSync(dir, { recursive: true, force: true }); } });

describe("independent source-informed external bindings", () => {
  it.each([false, true])("preserves ordinary original-context identities and complete content (explicit helper include=%s)", explicit => {
    const f = fixtures();
    if (explicit) writeFileSync(f.s, readFileSync(f.s, "utf8").replace('library "Supplement".', 'library "Supplement".\ninclude "Supplemental Inputs".'));
    const ordinary = emitCrlTwoLane(f.s, { date });
    expect(ordinary.success, JSON.stringify(ordinary.hardErrors)).toBe(true);
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const originalHelper = ordinary.cql.cqlByLibrary.filter(c => c.filePath === join(f.supplement, "inputs.crl"));
    expect(originalHelper.length).toBeGreaterThan(0);
    for (const cql of originalHelper) expect(provider.support.cql.find(c => c.value.libraryName === cql.libraryName)?.value).toEqual(cql);
    for (const captured of provider.support.resources) expect(ordinary.fhir.resources.find(r => r.relativePath === captured.value.relativePath)).toEqual(captured.value);
    for (const type of ["Library", "CodeSystem", "StructureDefinition"]) expect(provider.support.resources.some(r => r.value.resourceType === type)).toBe(true);
    const vocabulary = ordinary.fhir.resources.filter(r => r.sourceLibraryName === "Supplemental Inputs" && ["CodeSystem", "ValueSet", "StructureDefinition"].includes(r.resourceType));
    expect(vocabulary.length).toBeGreaterThan(0);
    for (const original of vocabulary) expect(provider.support.resources.find(r => r.value.relativePath === original.relativePath)?.value).toEqual(original);
  });

  it("refuses a missing qualified CQL dependency instead of silently skipping it", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const bad = structuredClone(provider.support);
    bad.cql[0].value.cql += "\ninclude missing.qualified.Support version '1' called Missing\n";
    expect(() => assertCapturedClosure(bad, provider.canonicalBases)).toThrow(/missing.qualified.Support/);
  });

  it("preserves presentation-group profiles outside the helper's computational operands", () => {
    const f = fixtures();
    const grouped = helper.replace('question text is "Request?".', 'question text is "Request?". - choice group is "Panel".') +
      answer("Independent", "independent").replace('question text is "Independent?".', 'question text is "Independent?". - choice group is "Panel".') +
      'presentation group "Panel": - question text is "Choose". - columns is 2. - control is checkbox.';
    writeFileSync(join(f.supplement, "inputs.crl"), grouped);
    const ordinary = emitCrlTwoLane(f.s, { date });
    expect(ordinary.success, JSON.stringify(ordinary.hardErrors)).toBe(true);
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const profile = ordinary.fhir.resources.find(r => r.resourceType === "StructureDefinition" && String(r.resource.url).endsWith("-independent"));
    expect(profile).toBeDefined();
    expect(provider.support.resources.find(r => r.value.relativePath === profile!.relativePath)?.value).toEqual(profile);
  });

  it.each([true, false])("retains a shared package only when originally admitted (admitted=%s)", admitted => {
    const dir = project("package-closure", {
      "root.crl": 'library "Root". include "Parent". decision "Route": - when "H"."Answer" then use decision "Parent"."Route".',
      "parent.crl": `library "Parent". ${admitted ? 'include "X".' : ''} activity "Met": - request CPGTaskRequest. decision "Route": - otherwise then recommend activity "Met".`,
      "h.crl": 'library "H". include "X". concept "Answer": - definition is "X"."Answer".',
      "node_modules/x/package.json": JSON.stringify({name:"x",version:"1.0.0",crl:{libraries:["x.crl"]}}),
      "node_modules/x/x.crl": 'library "X". concept "Answer": - definition is true.',
    });
    const graph = resolveImports(join(dir, "root.crl"));
    expect(graph.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);
    expect(graph.registry?.byNamePackage.has("X")).toBe(true);
    expect(graph.resolvedLibraries.some(e => e.name === "X")).toBe(admitted);
    const parent = graph.resolvedLibraries.find(e => e.name === "Parent")!;
    const closure = computeFhirEmitClosure(graph, new Set([parent.filePath]));
    expect(closure.some(e => e.name === "H")).toBe(true);
    expect(closure.some(e => e.name === "Parent")).toBe(false);
    expect(closure.some(e => e.name === "X")).toBe(admitted);
  });

  it("pins a replaced parent placeholder used during validation", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const parent = captureExternalDecision(f.p, { library: "Parent", decision: "Parent decision" }, {
      date, externalBindings: createExternalBindings({ publications: [{consumerSource:f.p,reference:{library:"Supplemental Inputs",concept:"Calculate Supplemental Uncertainty"},provider}] }),
    });
    const stub = join(f.parent, "stub.crl");
    writeFileSync(stub, readFileSync(stub, "utf8") + "\n");
    const result = emitCrlTwoLane(f.s, { date, externalBindings:createExternalBindings({decisions:[{consumerSource:f.s,reference:{library:"Parent",decision:"Parent decision"},provider:parent}]}) });
    expect(result.success).toBe(false);
    expect(result.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({kind:"external-binding-stale-source"})]));
  });

  it.each([false, true])("borrows the original Boolean export and input closure before parent emission (criterion=%s)", criterion => {
    const f = fixtures(criterion);
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    expect(provider.support.resources.some(r => ["PlanDefinition", "ActivityDefinition"].includes(r.value.resourceType))).toBe(false);
    const bindings = createExternalBindings({ publications: [{ consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider }] });
    const result = emitCrlTwoLane(f.p, { date, externalBindings: bindings });
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    expect(result.fhir.resources.some(r => r.resource.url === "https://example.org/bindings/PlanDefinition/parent-001")).toBe(true);
    const cql = result.cqlLibraries.map(x => x.cql).join("\n");
    expect(cql).toContain('FHIRHelpers.ToBoolean((Supplement001SupplementalInputsInferences."Calculate Supplemental Uncertainty").value as FHIR.boolean)');
    expect(cql).not.toContain("compilation-only-stub");
    expect(JSON.stringify(result.fhir.resources.filter(x => x.resourceType === "PlanDefinition"))).toContain("https://example.org/bindings/StructureDefinition/supplement-001-supplemental-inputs-request");
    for (const original of provider.support.cql) expect(result.cqlLibraries.find(x => x.outputFilename === original.value.outputFilename)?.cql).toBe(original.value.cql);
    for (const original of provider.support.resources) expect(result.fhir.resources.find(x => x.relativePath === original.value.relativePath)?.resource).toEqual(original.value.resource);
  });

  it("binds the original parent entry without regenerating it inside the supplement", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const parentBindings = createExternalBindings({ publications: [{ consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider }] });
    const parent = captureExternalDecision(f.p, { library: "Parent", decision: "Parent decision" }, { date, externalBindings: parentBindings });
    const bindings = createExternalBindings({ decisions: [{ consumerSource: f.s, reference: { library: "Parent", decision: "Parent decision" }, provider: parent }] });
    const result = emitCrlTwoLane(f.s, { date, externalBindings: bindings });
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const entry = result.fhir.resources.find(x => x.resource.url === "https://example.org/bindings/PlanDefinition/supplement-001")!;
    expect(JSON.stringify(entry.resource)).toContain("https://example.org/bindings/PlanDefinition/parent-001");
    expect(result.fhir.resources.filter(x => x.resourceType === "PlanDefinition" && x.sourceKind === "Decision")).toHaveLength(2);
    expect(JSON.stringify(result.fhir.resources)).not.toContain('"title":"Stub"');
    expect(result.cql.cqlByLibrary.filter(x => x.sourceLibraryName === "Parent").every(x => x.filePath.startsWith(f.parent))).toBe(true);
    expect(result.externalAssembly?.provenance.length).toBeGreaterThan(1);
  });

  it("coalesces identical borrowed content, retains all origins and rejects disagreement", () => {
    const f = fixtures();
    const a = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const union = checkedArtifactUnion([a.support, a.support]);
    expect(union.resources).toHaveLength(a.support.resources.length);
    expect(union.resources.every(x => x.origins.length === 2)).toBe(true);
    const bad = structuredClone(a.support);
    bad.resources[0].value.resource.title = "conflict";
    expect(() => checkedArtifactUnion([a.support, bad])).toThrow(/conflict/i);
    const cqlBad = structuredClone(a.support);
    cqlBad.cql[0].value.cql += "\n";
    expect(() => checkedArtifactUnion([a.support, cqlBad])).toThrow(/conflict/i);
  });
  it("captures implicit catalog dependencies and the original exact publication target", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const names = new Set(provider.support.cql.map(c => c.value.libraryName));
    for (const item of provider.support.cql) for (const match of item.value.cql.matchAll(/^\s*include\s+("(?:\\.|[^"\\])*"|[^\s]+)/gm)) {
      const identifier = match[1].replace(/^"|"$/g, "");
      if (!["FHIRHelpers", "hl7.fhir.uv.cql.FHIRHelpers"].includes(identifier)) expect(names.has(identifier), identifier).toBe(true);
    }
    expect(provider.publicationTargets.find(([identity]) => identity === provider.selected.descriptor.identity.key)?.[1]).toEqual(provider.selected.target);
    expect(provider.support.resources.some(r => ["PlanDefinition", "ActivityDefinition"].includes(r.value.resourceType))).toBe(false);
  });

  it("refuses duplicate bindings, private producer consumption, consumed mixed sources and stale pins", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const binding = { consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider };
    const duplicate = emitCrlTwoLane(f.p, { date, externalBindings: createExternalBindings({ publications: [binding, binding] }) });
    expect(duplicate.success).toBe(false);
    expect(duplicate.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "external-binding-ambiguous" })]));
    const original = readFileSync(f.p, "utf8");
    writeFileSync(f.p, original + '\nconcept "Private consumer": - shape is Record. - type is Observation. - value type is boolean. - definition is "Supplemental Inputs"."Calculate Supplemental Uncertainty" has a value. - shape reduction is most recent.\n');
    const producer = emitCrlTwoLane(f.p, { date, externalBindings: createExternalBindings({ publications: [binding] }) });
    expect(producer.success).toBe(false);
    expect(producer.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "external-binding-producer-unsupported" })]));
    writeFileSync(f.p, original);
    writeFileSync(join(f.parent, "stub.crl"), 'library "Supplemental Inputs".\n' + answer("Calculate Supplemental Uncertainty", "compilation-only-stub") + answer("Another", "another"));
    writeFileSync(f.p, original.replace('then recommend activity "Met".', 'then recommend activity "Met".\n- when "Supplemental Inputs"."Another" then recommend activity "Met".'));
    const mixed = emitCrlTwoLane(f.p, { date, externalBindings: createExternalBindings({ publications: [binding] }) });
    expect(mixed.success).toBe(false);
    expect(mixed.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "external-binding-mixed-source" })]));
    writeFileSync(join(f.supplement, "inputs.crl"), helper + "\n");
    const stale = emitCrlTwoLane(f.p, { date, externalBindings: createExternalBindings({ publications: [binding] }) });
    expect(stale.success).toBe(false);
    expect(stale.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "external-binding-stale-source" })]));
  });

  it("retains available-value operands under original profiles and codes without creating a helper question", () => {
    const f = fixtures();
    const coded = `library "Supplemental Inputs".
terminology "Options": - system is \`urn:synthetic:options\`. - code is \`yes\` display is \`Yes\`. - code is \`no\` display is \`No\`.
terminology "Uncertain": - system is \`urn:synthetic:options\`. - code is \`no\`.
concept "Request":
- shape is Record. - type is Observation. - value type is CodeableConcept.
- code is \`request\`. - value domain is answer options. - value from is "Options".
- shape reduction is most recent.
presentation for "Request": - question text is "Request?".
concept "Dose":
- shape is Record. - type is Observation. - value type is CodeableConcept.
- code is \`dose\`. - value domain is answer options. - value from is "Options".
- shape reduction is most recent.
presentation for "Dose": - question text is "Dose?".
concept "Calculate Supplemental Uncertainty":
- shape is Record. - type is Observation. - value type is boolean.
- definition is any available value of "Request" and "Dose" in "Uncertain" using validity of "Request".
- shape reduction is most recent.
`;
    writeFileSync(join(f.supplement, "inputs.crl"), coded);
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const result = emitCrlTwoLane(f.p, { date, externalBindings: createExternalBindings({ publications: [{
      consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider,
    }] }) });
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    const parent = result.fhir.resources.find(r => r.resource.url === "https://example.org/bindings/PlanDefinition/parent-001")!;
    expect(JSON.stringify(parent.resource)).toContain("CRL retention presence ");
    expect(JSON.stringify(parent.resource)).toContain("https://example.org/bindings/StructureDefinition/supplement-001-supplemental-inputs-request");
    const parentCql = result.cql.cqlByLibrary.filter(c => c.filePath === f.p).map(c => c.cql).join("\n");
    expect(parentCql).toContain("https://example.org/bindings/CodeSystem/supplement-001-supplemental-inputs-local");
    expect(JSON.stringify(result.fhir.resources.filter(r => r.resourceType === "StructureDefinition"))).not.toContain("compilation-only-stub");
    expect(result.externalAssembly?.sourceEvaluation).toBe("unsupported");
  });

  it("keeps transitive provenance and refuses a changed helper after capturing the parent", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const parent = captureExternalDecision(f.p, { library: "Parent", decision: "Parent decision" }, {
      date, externalBindings: createExternalBindings({ publications: [{ consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider }] }),
    });
    expect(parent.support.cql.find(c => c.value.libraryName === provider.selected.target.libraryName)?.origins.map(p => p.snapshotId))
      .toContain(provider.provenance.snapshotId);
    expect(parent.provenance.sourceHashes[join(f.supplement, "inputs.crl")]).toBe(provider.provenance.sourceHashes[join(f.supplement, "inputs.crl")]);
    writeFileSync(join(f.supplement, "inputs.crl"), helper + "\n");
    const result = emitCrlTwoLane(f.s, { date, externalBindings: createExternalBindings({ decisions: [{
      consumerSource: f.s, reference: { library: "Parent", decision: "Parent decision" }, provider: parent,
    }] }) });
    expect(result.success).toBe(false);
    expect(result.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "external-binding-stale-source" })]));
  });

  it("rejects missing exports, non-Boolean exports and unsafe/conflicting inventories", () => {
    const f = fixtures();
    expect(() => captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Missing" }, { date })).toThrow(/publication/i);
    writeFileSync(join(f.supplement, "inputs.crl"), helper.replace("value type is boolean.", "value type is text."));
    expect(() => captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Request" }, { date })).toThrow(/Boolean Observation/);
    writeFileSync(join(f.supplement, "inputs.crl"), helper);
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const bad = structuredClone(provider.support);
    bad.resources[0].value.relativePath = "../outside.json";
    expect(() => checkedArtifactUnion([bad])).toThrow(/Unsafe/);
    const canonicalConflict = structuredClone(provider.support);
    const first = canonicalConflict.resources[0].value;
    first.resource.id = "other";
    first.relativePath = first.resourceType + "/other.json";
    expect(() => checkedArtifactUnion([provider.support, canonicalConflict])).toThrow(/conflict/i);
  });

  it("does not emit an explicit include descendant reachable only through an external decision", () => {
    const f = fixtures();
    const original = readFileSync(f.s, "utf8");
    writeFileSync(f.s, original.replace('library "Supplement".', 'library "Supplement".\ninclude "Parent".'));
    writeFileSync(join(f.supplement, "parent-stub.crl"), 'library "Parent".\ninclude "Orphan".\nactivity "Stub": - request CPGTaskRequest.\ndecision "Parent decision": - otherwise then recommend activity "Stub".');
    writeFileSync(join(f.supplement, "orphan.crl"), 'library "Orphan".\n' + answer("Orphan", "orphan-stub-only"));
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const parent = captureExternalDecision(f.p, { library: "Parent", decision: "Parent decision" }, {
      date, externalBindings: createExternalBindings({ publications: [{
        consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider,
      }] }),
    });
    const result = emitCrlTwoLane(f.s, { date, externalBindings: createExternalBindings({ decisions: [{
      consumerSource: f.s, reference: { library: "Parent", decision: "Parent decision" }, provider: parent,
    }] }) });
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    expect(result.cqlLibraries.map(c => c.cql).join("\n")).not.toContain("orphan-stub-only");
    expect(JSON.stringify(result.fhir.resources)).not.toContain("orphan-stub-only");
  });

  it("checks embedded CQL attachment bytes against the actual original file", () => {
    const f = fixtures();
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const bad = structuredClone(provider.support);
    const library = bad.resources.find(r => r.value.resourceType === "Library")!.value.resource;
    const content = library.content as { contentType: string; data?: string; url?: string }[];
    content[0].data = Buffer.from("changed CQL\n").toString("base64");
    expect(() => checkedArtifactUnion([bad])).toThrow(/attachment bytes conflict/i);
  });

  it("refuses an actual differing-base catalog path conflict without rewriting either resource", () => {
    const f = fixtures();
    const packagePath = join(f.supplement, "package.json");
    const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
    metadata.crl.canonicalBase = "https://example.org/different-supplement";
    writeFileSync(packagePath, JSON.stringify(metadata));
    const provider = captureExternalSupport(f.s, { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, { date });
    const originalCatalog = provider.support.resources.find(r => r.value.resourceType === "Library" && r.value.resource.id === "CRLCommon")!;
    expect(originalCatalog.value.resource.url).toBe("https://example.org/different-supplement/Library/CRLCommon");
    const before = JSON.stringify(originalCatalog.value.resource);
    const result = emitCrlTwoLane(f.p, { date, externalBindings: createExternalBindings({ publications: [{
      consumerSource: f.p, reference: { library: "Supplemental Inputs", concept: "Calculate Supplemental Uncertainty" }, provider,
    }] }) });
    expect(result.success).toBe(false);
    expect(result.hardErrors).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "external-binding-resource-conflict" })]));
    expect(JSON.stringify(originalCatalog.value.resource)).toBe(before);
  });

});
