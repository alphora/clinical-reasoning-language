// Unit tests for the headless hover logic (#132 step 3). The extension's golden oracle
// proves byte-for-byte behavior-preservation against the old providers; these tests give
// core its own coverage of the compute* branches, testable with plain inputs (no catalog,
// no vscode, no extension). Markdown strings are pinned verbatim — they ARE the contract.
import {
  computeNarrativeHover,
  computeTypeValuetypeHover,
  computeConceptRefHover,
  type CompiledNarrativePattern,
} from "../hover";
import type { IndexedDeclaration, ProjectIndex } from "../projectIndex";

const HAS_PATTERN: CompiledNarrativePattern = {
  canonical: "Has(X)",
  category: "Classification",
  narrative: "has <X>",
  signature: "Has(X: ConceptRef)",
  cqlFunction: "CRLCommon.Has",
  matcher: /has\s+"[^"]+"/,
};

describe("computeNarrativeHover (#132 step 3)", () => {
  const line = '- definition is has "Diabetes".';

  it("returns a hover for the longest catalog match containing the cursor", () => {
    const h = computeNarrativeHover(line, { line: 0, character: 18 }, [HAS_PATTERN]);
    expect(h).toEqual({
      markdown:
        "**Has(X)** — *Classification*\n\n" +
        "Narrative: `has <X>`\n\n" +
        "Signature: `Has(X: ConceptRef)`\n\n" +
        "CQL: `CRLCommon.Has`",
      range: { startLine: 0, startCol: 16, endLine: 0, endCol: 30 },
    });
  });

  it("returns null on a non-`definition is` line", () => {
    expect(computeNarrativeHover('- when has "Diabetes".', { line: 0, character: 8 }, [HAS_PATTERN])).toBeNull();
  });

  it("returns null when the cursor is outside every match", () => {
    expect(computeNarrativeHover(line, { line: 0, character: 2 }, [HAS_PATTERN])).toBeNull();
  });
});

describe("computeTypeValuetypeHover (#132 step 3)", () => {
  const allow = {
    conceptTypes: ["Observation", "Condition"],
    valueTypes: ["Quantity", "boolean"],
    paramTypes: ["Patient", "Period"],
    activityTypes: ["CPGServiceRequest", "CPGCommunicationRequest"],
  };

  it("hovers a valid `- type is X.` token", () => {
    const h = computeTypeValuetypeHover("- type is Observation.", { line: 3, character: 12 }, allow);
    expect(h).toEqual({
      markdown:
        "**Observation** — FHIR resource type\n\n" +
        "Used in `- type is Observation.` to declare the concept's FHIR resource type.",
      range: { startLine: 3, startCol: 10, endLine: 3, endCol: 21 },
    });
  });

  it("warns on an unrecognized type, listing the valid set", () => {
    const h = computeTypeValuetypeHover("- type is Foo.", { line: 0, character: 11 }, allow);
    expect(h?.markdown).toBe(
      "**Foo** — FHIR resource type\n\n⚠ Not in the recognized type set. Valid: Observation, Condition.",
    );
  });

  it("hovers a valid `- value type is X.` token", () => {
    const h = computeTypeValuetypeHover("- value type is Quantity.", { line: 0, character: 18 }, allow);
    expect(h?.markdown).toBe(
      "**Quantity** — FHIR value type\n\nUsed in `- value type is Quantity.` to declare the concept's value-bearing type.",
    );
  });

  it("hovers `- param type is Patient.` with the context-Patient note", () => {
    const h = computeTypeValuetypeHover("- param type is Patient.", { line: 0, character: 18 }, allow);
    expect(h?.markdown).toBe(
      "**Patient** — CRL parameter type\n\n" +
        "Used in `- param type is Patient.` to declare a patient-scoped runtime input. " +
        "The emitter collapses this to CQL `context Patient`; the parameter's quoted CRL name is not emitted, and the CQL `context Patient` line has no per-name identifier.",
    );
  });

  it("hovers a valid `- request X.` token (activity request type)", () => {
    const h = computeTypeValuetypeHover("- request CPGServiceRequest.", { line: 0, character: 18 }, allow);
    expect(h?.markdown).toBe(
      "**CPGServiceRequest** — CPG activity type\n\nUsed in `- request CPGServiceRequest.` to declare the activity's request resource type.",
    );
  });

  it("warns on an unrecognized request type, listing the valid set", () => {
    const h = computeTypeValuetypeHover("- request Nope.", { line: 0, character: 12 }, allow);
    expect(h?.markdown).toBe(
      "**Nope** — CPG activity type\n\n⚠ Not in the recognized activity type set. Valid: CPGServiceRequest, CPGCommunicationRequest.",
    );
  });

  it("hovers the type after the `do not perform` modifier", () => {
    const h = computeTypeValuetypeHover("- request do not perform CPGServiceRequest.", { line: 0, character: 30 }, allow);
    expect(h?.markdown).toBe(
      "**CPGServiceRequest** — CPG activity type\n\nUsed in `- request CPGServiceRequest.` to declare the activity's request resource type.",
    );
  });

  it("returns null when the cursor is off the token", () => {
    expect(computeTypeValuetypeHover("- type is Observation.", { line: 0, character: 2 }, allow)).toBeNull();
  });
});

describe("computeConceptRefHover (#132 step 3)", () => {
  const source = ['concept "Diabetic":', '- definition is has "Diabetes".'].join("\n");
  const refLine = '- when "Diabetic" then recommend activity "Refer".';
  const emptyIndex = { getDeclarations: () => [] } as unknown as ProjectIndex;

  it("orphan path (empty index): resolves a quoted ref via the file-local scan", () => {
    const h = computeConceptRefHover(source, "/x.crl", refLine, { line: 9, character: 12 }, emptyIndex);
    expect(h).toEqual({
      markdown: "**Diabetic** — concept\n\nBody: `definition is has \"Diabetes\"`\n\nDeclared at line 1.",
      range: { startLine: 9, startCol: 7, endLine: 9, endCol: 17 },
    });
  });

  it("indexed path: resolves via the project index with library + filePath", () => {
    const decl: IndexedDeclaration = {
      name: "Diabetic",
      kind: "concept",
      libraryName: "Conditions",
      filePath: "/proj/conditions.crl",
      line: 4,
    } as IndexedDeclaration;
    const idx = { getDeclarations: () => [decl] } as unknown as ProjectIndex;
    const h = computeConceptRefHover(source, "/x.crl", refLine, { line: 9, character: 12 }, idx);
    expect(h?.markdown).toBe(
      "**Diabetic** — concept\n\nLibrary: `Conditions`\n\nDeclared at `/proj/conditions.crl`:5.",
    );
  });

  it("indexed path: resolves a qualified `\"Lib\".\"Ref\"` reference via the qualifier filter", () => {
    const decl = {
      name: "Diabetic",
      kind: "concept",
      libraryName: "Conditions",
      filePath: "/proj/conditions.crl",
      line: 4,
    } as IndexedDeclaration;
    const idx = { getDeclarations: () => [decl] } as unknown as ProjectIndex;
    const qualifiedLine = '- when "Conditions"."Diabetic" then recommend activity "Refer".';
    const h = computeConceptRefHover("", "/x.crl", qualifiedLine, { line: 0, character: 25 }, idx);
    expect(h?.markdown).toBe(
      "**Diabetic** — concept\n\nLibrary: `Conditions`\n\nDeclared at `/proj/conditions.crl`:5.",
    );
    expect(h?.range).toEqual({ startLine: 0, startCol: 20, endLine: 0, endCol: 30 });
  });

  it("indexed path: a qualified ref whose library does not match misses (null)", () => {
    const decl = {
      name: "Diabetic",
      kind: "concept",
      libraryName: "Conditions",
      filePath: "/p.crl",
      line: 4,
    } as IndexedDeclaration;
    const idx = { getDeclarations: () => [decl] } as unknown as ProjectIndex;
    const line = '- when "Other"."Diabetic" then recommend activity "Refer".';
    expect(computeConceptRefHover("", "/x.crl", line, { line: 0, character: 18 }, idx)).toBeNull();
  });

  it("returns null when the cursor is not on a quoted reference", () => {
    expect(computeConceptRefHover(source, "/x.crl", refLine, { line: 9, character: 2 }, emptyIndex)).toBeNull();
  });
});
