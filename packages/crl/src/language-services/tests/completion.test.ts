// Unit tests for the headless completion logic (#132 step 3b). The extension's golden
// oracle proves byte-for-byte behavior-preservation against the old providers; these give
// core its own coverage of the compute* branches with plain inputs (no vscode).
import {
  computeNarrativeCompletion,
  computeTypeCompletion,
  computeValuetypeCompletion,
  computeParamTypeCompletion,
  computeRequestCompletion,
  computeConceptRefCompletion,
} from "../completion";
import { CONCEPT_TYPES, CONCEPT_VALUETYPES, PARAMETER_TYPES, ACTIVITY_TYPES, type Pattern } from "../catalog";
import type { ProjectIndex } from "../projectIndex";

const PATTERNS: Pattern[] = [
  {
    canonical: "Has(X)",
    category: "Classification",
    narrative: "has <X>",
    signature: "Has(X: ConceptRef)",
    cqlFunction: "CRLCommon.Has",
  },
];

describe("computeNarrativeCompletion (#132 step 3b)", () => {
  it("returns snippet items in a `- definition is ` body", () => {
    const items = computeNarrativeCompletion("- definition is ", PATTERNS);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      label: "has <X>",
      kind: "snippet",
      insertText: 'has "${1:X}"',
      insertTextFormat: "snippet",
      detail: "Has(X: ConceptRef)",
      documentation:
        "**Has(X)** — *Classification*\n\nNarrative: `has <X>`\n\nSignature: `Has(X: ConceptRef)`\n\nCQL: `CRLCommon.Has`",
      sortText: "has",
    });
  });

  it("returns [] outside a definition-is body", () => {
    expect(computeNarrativeCompletion("- when x", PATTERNS)).toEqual([]);
  });
});

describe("computeType/Valuetype/ParamTypeCompletion (#132 step 3b)", () => {
  it("type slot → every CONCEPT_TYPE as a typeParameter item", () => {
    const items = computeTypeCompletion("- type is ");
    expect(items).toHaveLength(CONCEPT_TYPES.length);
    expect(items[0]).toEqual({
      label: CONCEPT_TYPES[0],
      kind: "typeParameter",
      detail: `FHIR resource type — \`type is ${CONCEPT_TYPES[0]}.\``,
    });
  });

  it("type slot miss → []", () => {
    expect(computeTypeCompletion("- when ")).toEqual([]);
  });

  it("valuetype + param slots return their full allowlists", () => {
    expect(computeValuetypeCompletion("- value type is ")).toHaveLength(CONCEPT_VALUETYPES.length);
    expect(computeParamTypeCompletion("- param type is ")).toHaveLength(PARAMETER_TYPES.length);
  });

  it("request slot → every ACTIVITY_TYPE as a typeParameter item", () => {
    const items = computeRequestCompletion("- request ");
    expect(items).toHaveLength(ACTIVITY_TYPES.length);
    expect(items[0]).toEqual({
      label: ACTIVITY_TYPES[0],
      kind: "typeParameter",
      detail: `CPG activity type — \`request ${ACTIVITY_TYPES[0]}.\``,
    });
  });

  it("request slot miss → []", () => {
    expect(computeRequestCompletion("- type is ")).toEqual([]);
  });

  it("request slot accepts the grammar's optional `do not perform` modifier", () => {
    expect(computeRequestCompletion("- request do not perform ")).toHaveLength(ACTIVITY_TYPES.length);
  });
});

describe("computeConceptRefCompletion (#132 step 3b)", () => {
  const emptyIndex = { getDeclarations: () => [] } as unknown as ProjectIndex;
  const source = ['concept "BMI":', "- type is Observation.", 'terminology "Codes":', '- coded from "x".'].join(
    "\n",
  );

  it("orphan path: `when` narrows to concepts", () => {
    const items = computeConceptRefCompletion(source, "/x.crl", '- when "', { line: 9, character: 8 }, emptyIndex);
    expect(items.map((i) => i.label)).toEqual(["BMI"]);
    expect(items[0].kind).toBe("variable");
  });

  it("orphan path: `coded from` narrows to terminologies", () => {
    const items = computeConceptRefCompletion(
      source,
      "/x.crl",
      '- coded from "',
      { line: 9, character: 14 },
      emptyIndex,
    );
    expect(items.map((i) => i.label)).toEqual(["Codes"]);
    expect(items[0].kind).toBe("reference");
  });

  it("declaration-header prefix is suppressed → []", () => {
    expect(computeConceptRefCompletion(source, "/x.crl", 'concept "', { line: 9, character: 9 }, emptyIndex)).toEqual(
      [],
    );
  });

  it("unquoted type slot is suppressed → []", () => {
    expect(
      computeConceptRefCompletion(source, "/x.crl", '- type is "', { line: 9, character: 11 }, emptyIndex),
    ).toEqual([]);
  });

  it("no open quote → []", () => {
    expect(computeConceptRefCompletion(source, "/x.crl", "- when x", { line: 9, character: 8 }, emptyIndex)).toEqual(
      [],
    );
  });

  it("indexed path: qualifier + expectedKind filter together", () => {
    const decls = [
      { name: "BMI", kind: "concept", libraryName: "Vitals", origin: "local", type: "Observation", filePath: "/p.crl", line: 0 },
      { name: "Codes", kind: "terminology", libraryName: "Vitals", origin: "local", filePath: "/p.crl", line: 1 },
      { name: "Other", kind: "concept", libraryName: "Misc", origin: "local", filePath: "/p.crl", line: 2 },
    ];
    const idx = { getDeclarations: () => decls } as unknown as ProjectIndex;
    // `when "Vitals".` → concept + qualifier Vitals → BMI only.
    const items = computeConceptRefCompletion("", "/x.crl", '- when "Vitals".', { line: 0, character: 16 }, idx);
    expect(items.map((i) => i.label)).toEqual(["BMI"]);
  });

  it("indexed path: narrative slot drops a parameter shadowed by a same-name concept", () => {
    const decls = [
      { name: "Lookback", kind: "concept", libraryName: "L", origin: "local", filePath: "/p.crl", line: 0 },
      { name: "Lookback", kind: "parameter", libraryName: "L", origin: "local", type: "Period", filePath: "/p.crl", line: 1 },
    ];
    const idx = { getDeclarations: () => decls } as unknown as ProjectIndex;
    const items = computeConceptRefCompletion("", "/x.crl", '- definition is has "', { line: 0, character: 21 }, idx);
    expect(items.map((i) => `${i.label}:${i.kind}`)).toEqual(["Lookback:variable"]);
  });

  it("indexed path: a qualified ref whose library matches nothing → []", () => {
    const decls = [
      { name: "BMI", kind: "concept", libraryName: "Vitals", origin: "local", filePath: "/p.crl", line: 0 },
    ];
    const idx = { getDeclarations: () => decls } as unknown as ProjectIndex;
    expect(
      computeConceptRefCompletion("", "/x.crl", '- when "Missing".', { line: 0, character: 17 }, idx),
    ).toEqual([]);
  });

  it("buildRefItem includes the Body line when bodyPreview is present", () => {
    const decls = [
      {
        name: "BMI",
        kind: "concept",
        libraryName: "Vitals",
        origin: "local",
        type: "Observation",
        bodyPreview: 'definition is has "X"',
        filePath: "/p.crl",
        line: 0,
      },
    ];
    const idx = { getDeclarations: () => decls } as unknown as ProjectIndex;
    const items = computeConceptRefCompletion("", "/x.crl", '- when "', { line: 0, character: 8 }, idx);
    expect(items[0].documentation).toBe(
      '**BMI** — concept\n\nLibrary: `Vitals`\n\nType: `Observation`\n\nBody: `definition is has "X"`',
    );
  });

  it("uses the prefix slice, not the whole line (cursor before EOL)", () => {
    const decls = [
      { name: "BMI", kind: "concept", libraryName: "Vitals", origin: "local", filePath: "/p.crl", line: 0 },
    ];
    const idx = { getDeclarations: () => decls } as unknown as ProjectIndex;
    // The full line has a closing quote + trailing text after the cursor; only `- when "`
    // (the slice up to the cursor) is an open quote, so the slice — not the line — must drive.
    const items = computeConceptRefCompletion("", "/x.crl", '- when "" trailing', { line: 0, character: 8 }, idx);
    expect(items.map((i) => i.label)).toEqual(["BMI"]);
  });
});
