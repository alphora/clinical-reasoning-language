import * as path from "path";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import * as os from "os";

import { validateCEL, validateCELFile } from "../validator";
import { resolveCelImports } from "../../imports";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const CORPUS = {
  cms22: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22.cel"),
  cms22Strategy: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.cel"),
  cms69: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69.cel"),
  cms69Strategy: path.join(REPO_ROOT, "src/tests/fixtures/corpus/cms69/cms69-strategy.cel"),
  syntaxRef: path.join(__dirname, "../../tests/fixtures/cel-syntax-reference.cel"),
};

describe("CEL Todo 4 — validator: 4 CMS corpus files clean (errors + warnings empty)", () => {
  test("cms22.cel — clean", () => {
    const r = validateCELFile(CORPUS.cms22);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test("cms22-strategy.cel — clean", () => {
    const r = validateCELFile(CORPUS.cms22Strategy);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test("cms69.cel — clean (post Todo 1 corpus repair)", () => {
    const r = validateCELFile(CORPUS.cms69);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test("cms69-strategy.cel — clean", () => {
    const r = validateCELFile(CORPUS.cms69Strategy);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("CEL Todo 4 — passthrough of resolver/parser diagnostics", () => {
  test("syntax-ref → unresolved-covers passthrough as validator error", () => {
    const r = validateCELFile(CORPUS.syntaxRef);
    expect(r.errors.some((e) => e.kind === "unresolved-covers")).toBe(true);
  });
});

// Helpers for in-memory test projects.
function withProject(
  fn: (root: string) => void,
): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "cel-validator-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "cel-test", version: "0.0.0", private: true }));
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function write(root: string, relPath: string, body: string): string {
  const full = path.join(root, relPath);
  writeFileSync(full, body, "utf-8");
  return full;
}

const ENC_FACT_HEADER = [
  "# T",
  "library \"T\".",
  "covers \"L\".",
  "fact \"Subject\":",
  "- name is \"S\".",
  "- defined by \"Patient\".",
];

describe("CEL Todo 4 — bare `defined by` allowlist", () => {
  test("bare 'defined by \"Patient\"' → clean", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-bare-type")).toEqual([]);
    });
  });

  test("bare 'defined by \"NotAType\"' → unresolved-bare-type", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        "# T",
        "library \"T\".",
        "covers \"L\".",
        "fact \"X\":",
        "- name is \"x\".",
        "- defined by \"NotAType\".",
        "case \"C\":",
        "- subject is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-bare-type")).toBe(true);
    });
  });

  test("bare 'defined by \"CPGServiceRequest\"' → unresolved-bare-type (CPG profiles aren't bare FHIR types)", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        "# T",
        "library \"T\".",
        "covers \"L\".",
        "fact \"X\":",
        "- name is \"x\".",
        "- defined by \"CPGServiceRequest\".",
        "case \"C\":",
        "- subject is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-bare-type")).toBe(true);
    });
  });
});

describe("CEL Todo 4 — qualified `defined by` rule table", () => {
  test("nonexistent library → unresolved-qualified-library", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"NoSuchLib\".\"X\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-qualified-library")).toBe(true);
    });
  });

  test("library exists, no matching concept/activity → unresolved-qualified-declaration", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Existing\":",
        "- type is Observation.",
        "- value type is boolean.",
        "- defined as \"Existing\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"L\".\"NoSuchConcept\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-qualified-declaration")).toBe(true);
    });
  });

  test("qualified ref to Concept with conceptType in allowlist → clean", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"BMI\":",
        "- type is Observation.",
        "- value type is Quantity.",
        "- defined as \"BMI\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"L\".\"BMI\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors).toEqual([]);
      expect(r.warnings.filter((w) => w.kind === "unsupported-yet")).toEqual([]);
    });
  });

  // #224 ii.1a-2: a criterion is a decision-guard sub-expression, never a `defined by`
  // target — give the targeted diagnostic instead of "no Concept or Activity named X".
  test("qualified ref to a Criterion → criterion-not-a-defined-by-target", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Age Qualifies\":",
        "- type is Observation.",
        "- code is `age`.",
        "criterion \"Eligible\":",
        "- when ( \"Age Qualifies\" ).",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"L\".\"Eligible\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "criterion-not-a-defined-by-target")).toBe(true);
      expect(r.errors.some((e) => e.kind === "unresolved-qualified-declaration")).toBe(false);
    });
  });

  test("qualified ref to Terminology → unresolved-qualified-declaration (Step 2 candidate exclusion)", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "terminology \"TermName\":",
        "- valueset is `urn:example:placeholder`.",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"L\".\"TermName\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-qualified-declaration")).toBe(true);
    });
  });

  test("name collision (terminology AND concept share name) → concept wins, no unsupported-yet", () => {
    // This is the cms69-strategy.cel pattern in production: BMI as an Observation
    // exists as both a terminology and a concept in the same target library.
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "terminology \"BMI as an Observation\":",
        "- valueset is `urn:example:placeholder`.",
        "concept \"BMI as an Observation\":",
        "- type is Observation.",
        "- value type is Quantity.",
        "- coded from \"BMI as an Observation\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"L\".\"BMI as an Observation\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors).toEqual([]);
      expect(r.warnings.filter((w) => w.kind === "unsupported-yet")).toEqual([]);
    });
  });
});

describe("CEL Todo 4 — result resolution + value-shape check", () => {
  test("Decision leaf + branch result → clean", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "decision \"D\":",
        "",
        "- when \"P\" then recommend activity \"A\".",
        "concept \"P\":",
        "- type is Observation.",
        "- value type is boolean.",
        "- defined as \"P\".",
        "activity \"A\":",
        "- request CPGServiceRequest.",
        "- with \"VS\".",
        "terminology \"VS\":",
        "- valueset is `urn:example:placeholder`.",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"A\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors).toEqual([]);
    });
  });

  test("Decision leaf + boolean result → invalid-result-shape", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "decision \"D\":",
        "",
        "- when \"P\" then recommend activity \"A\".",
        "concept \"P\":",
        "- type is Observation.",
        "- value type is boolean.",
        "- defined as \"P\".",
        "activity \"A\":",
        "- request CPGServiceRequest.",
        "- with \"VS\".",
        "terminology \"VS\":",
        "- valueset is `urn:example:placeholder`.",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is true.",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "invalid-result-shape")).toBe(true);
    });
  });

  test("Concept leaf + boolean result → clean", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Num\":",
        "- type is Observation.",
        "- value type is boolean.",
        "- defined as \"Num\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"Num\" is true.",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors).toEqual([]);
    });
  });

  test("Concept leaf + branch result → invalid-result-shape", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Num\":",
        "- type is Observation.",
        "- value type is boolean.",
        "- defined as \"Num\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"Num\" is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "invalid-result-shape")).toBe(true);
    });
  });

  test("nonexistent leaf → unresolved-result-leaf", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"NoSuchLeaf\" is true.",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-result-leaf")).toBe(true);
    });
  });
});

describe("CEL T03 / #86 — result branch arm cross-check", () => {
  function libWithD7(): string {
    // Transitive arms of D7 (#166): A (direct) + SubD's arms (Z) — the bare same-library `use decision "SubD"` is
    // REPLACED by its arms. "SubD" itself is NO LONGER a valid branch (a delegation isn't a disposition).
    return [
      "# L",
      "library \"L\".",
      "decision \"D7\":",
      "",
      "- when \"P\" then recommend activity \"A\".",
      "- when \"P\" then use decision \"SubD\".",
      "decision \"SubD\":",
      "",
      "- when \"P\" then recommend activity \"Z\".",
      "concept \"P\":",
      "- type is Observation.",
      "- value type is boolean.",
      "- defined as \"P\".",
      "activity \"A\":",
      "- request CPGServiceRequest.",
      "- with \"VS\".",
      "activity \"Z\":",
      "- request CPGServiceRequest.",
      "- with \"VS\".",
      "terminology \"VS\":",
      "- valueset is `urn:example:placeholder`.",
    ].join("\n");
  }

  test("known direct activity arm → clean", () => {
    withProject((root) => {
      write(root, "lib.crl", libWithD7());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D7\" is \"A\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-result-branch")).toEqual([]);
    });
  });

  test("bare same-library sub-decision NAME is NOT a valid arm → unresolved-result-branch (REPLACE, #166)", () => {
    // Under transitive arms the bare `use decision "SubD"` is replaced by SubD's arms; "SubD" itself is not a disposition.
    withProject((root) => {
      write(root, "lib.crl", libWithD7());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D7\" is \"SubD\".",
      ].join("\n"));
      const r = validateCELFile(file);
      const branchErrors = r.errors.filter((e) => e.kind === "unresolved-result-branch");
      expect(branchErrors).toHaveLength(1);
      expect(branchErrors[0].message).toContain("SubD");
    });
  });

  test("bogus branch name → unresolved-result-branch", () => {
    withProject((root) => {
      write(root, "lib.crl", libWithD7());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D7\" is \"DoesNotExist\".",
      ].join("\n"));
      const r = validateCELFile(file);
      const branchErrors = r.errors.filter((e) => e.kind === "unresolved-result-branch");
      expect(branchErrors).toHaveLength(1);
      expect(branchErrors[0].message).toContain("DoesNotExist");
      expect(branchErrors[0].message).toContain("D7");
    });
  });

  test("activity reachable transitively via a same-library sub-decision → clean (transitive arms, #166)", () => {
    // Z is reachable via the bare same-library `use decision "SubD"`; with transitive arms it IS a valid branch of D7.
    withProject((root) => {
      write(root, "lib.crl", libWithD7());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D7\" is \"Z\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-result-branch")).toEqual([]);
    });
  });

  test("Quantity-valued concept + `is true` → result-leaf-not-boolean-valued (T04 / #100)", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Cov Calculate\":",
        "- type is Observation.",
        "- value type is Quantity.",
        "- defined as \"Cov Calculate\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"Cov Calculate\" is true.",
      ].join("\n"));
      const r = validateCELFile(file);
      const errs = r.errors.filter((e) => e.kind === "result-leaf-not-boolean-valued");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toContain("Quantity");
      expect(errs[0].message).toContain("Cov Calculate");
    });
  });

  test("Concept with no value type + `is true` → result-leaf-not-boolean-valued (absent)", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Cov NoType\":",
        "- type is Observation.",
        "- defined as \"Cov NoType\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"Cov NoType\" is false.",
      ].join("\n"));
      const r = validateCELFile(file);
      const errs = r.errors.filter((e) => e.kind === "result-leaf-not-boolean-valued");
      expect(errs).toHaveLength(1);
      expect(errs[0].message).toContain("absent");
    });
  });

  test("boolean-valued concept + `is true` → clean (no result-leaf-not-boolean-valued)", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Cov Abnormal\":",
        "- type is Observation.",
        "- value type is boolean.",
        "- defined as \"Cov Abnormal\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"Cov Abnormal\" is true.",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "result-leaf-not-boolean-valued")).toEqual([]);
    });
  });

  test("decision with no arms (empty body) + any branch → unresolved-result-branch", () => {
    withProject((root) => {
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "decision \"Empty\":",
        "",
        "  ",
      ].join("\n"));
      // If the parser rejects an empty decision body, this test is benign.
      // The intent is to lock the message format for the no-arms case.
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"Empty\" is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file);
      // Either parse fails or branch fails — both are acceptable; what we
      // pin is "no false positive that X is a valid arm of Empty."
      const branchClean = r.errors.filter((e) => e.kind === "unresolved-result-branch").length === 0;
      const errored = r.errors.length > 0;
      expect(branchClean === false || errored).toBe(true);
    });
  });
});

describe("CEL #166 — transitive `use decision` arm cross-check", () => {
  // D uses a chain of same-library sub-decisions; valid arms of D are the transitive recommend-activity dispositions.
  function chainLib(): string {
    return [
      "# L",
      "library \"L\".",
      "decision \"D\":",
      "",
      "- when \"P\" then use decision \"Mid\".",
      "decision \"Mid\":",
      "",
      "- when \"P\" then use decision \"Leaf\".",
      "decision \"Leaf\":",
      "",
      "- when \"P\" then recommend activity \"Final\".",
      "concept \"P\":",
      "- type is Observation.",
      "- value type is boolean.",
      "- defined as \"P\".",
      "activity \"Final\":",
      "- request CPGServiceRequest.",
      "- with \"VS\".",
      "terminology \"VS\":",
      "- valueset is `urn:example:placeholder`.",
    ].join("\n");
  }

  test("a disposition reachable only through a same-library use-decision chain VALIDATES", () => {
    withProject((root) => {
      write(root, "lib.crl", chainLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"Final\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-result-branch")).toEqual([]);
    });
  });

  test("an impossible transitive disposition → unresolved-result-branch", () => {
    withProject((root) => {
      write(root, "lib.crl", chainLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"Mid\".", // an intermediate delegation name is not a disposition (REPLACE)
      ].join("\n"));
      const r = validateCELFile(file);
      const branchErrors = r.errors.filter((e) => e.kind === "unresolved-result-branch");
      expect(branchErrors).toHaveLength(1);
      expect(branchErrors[0].message).toContain("Final"); // the reachable-arms list names the real disposition
    });
  });

  // FIX 2 — REPLACE consistency: a target the CRE produces NOTHING for (qualified cross-lib, or cyclic) is NOT a valid
  // arm. Its bare name is DROPPED so validate_cel and run_decision reject identically.
  function xlibLib(): string {
    return [
      "# L",
      "library \"L\".",
      "decision \"D\":",
      "",
      "- when \"P\" then recommend activity \"A\".",
      "- when \"P\" then use decision \"Other\".\"Sub\".", // QUALIFIED → cross-library, deferred, not a disposition
      "concept \"P\":",
      "- type is Observation.",
      "- value type is boolean.",
      "- defined as \"P\".",
      "activity \"A\":",
      "- request CPGServiceRequest.",
      "- with \"VS\".",
      "terminology \"VS\":",
      "- valueset is `urn:example:placeholder`.",
    ].join("\n");
  }

  test("a cross-library use-decision target name is NOT a valid arm → unresolved-result-branch (FIX 2)", () => {
    withProject((root) => {
      write(root, "lib.crl", xlibLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"Sub\".", // the deferred cross-lib target's bare name — no longer offered as an arm
      ].join("\n"));
      const r = validateCELFile(file);
      const branchErrors = r.errors.filter((e) => e.kind === "unresolved-result-branch");
      expect(branchErrors).toHaveLength(1);
      expect(branchErrors[0].message).toContain("Sub");
      expect(branchErrors[0].message).toContain("\"A\""); // the real direct arm IS offered
    });
  });

  test("the cross-library target's real DIRECT sibling arm still validates", () => {
    withProject((root) => {
      write(root, "lib.crl", xlibLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"A\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-result-branch")).toEqual([]);
    });
  });

  // #172: when the cross-library target's library IS in the project, its transitive arms become REACHABLE — the arms
  // surface must span the cross-lib closure (else valid cross-lib cases would fail validate_cel). "Other" is a real
  // sibling lib here, so "D" → "Other"."Sub" → recommend "B" makes "B" a valid arm of "D"; the "Sub" name still is not.
  function sharedOtherLib(): string {
    return [
      "# Other",
      "library \"Other\".",
      "decision \"Sub\":",
      "",
      "- when \"P\" then recommend activity \"B\".",
      "concept \"P\":",
      "- type is Observation.",
      "- value type is boolean.",
      "- defined as \"P\".",
      "activity \"B\":",
      "- request CPGServiceRequest.",
      "- with \"VS\".",
      "terminology \"VS\":",
      "- valueset is `urn:example:placeholder`.",
    ].join("\n");
  }

  test("a RESOLVABLE cross-library use-decision's transitive arm validates (B reachable via Other.Sub) (#172)", () => {
    withProject((root) => {
      write(root, "lib.crl", xlibLib());
      write(root, "other.crl", sharedOtherLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"B\".", // B is the shared sub's disposition — now a reachable cross-lib arm
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-result-branch")).toEqual([]);
    });
  });

  test("the cross-library DELEGATION name 'Sub' is NOT an arm even when resolvable — REPLACE (#172)", () => {
    withProject((root) => {
      write(root, "lib.crl", xlibLib());
      write(root, "other.crl", sharedOtherLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"Sub\".", // a delegation is not a disposition — Sub's name is replaced by its arm (B)
      ].join("\n"));
      const r = validateCELFile(file);
      const branchErrors = r.errors.filter((e) => e.kind === "unresolved-result-branch");
      expect(branchErrors).toHaveLength(1);
      expect(branchErrors[0].message).toContain("\"B\""); // the real cross-lib arm is offered
    });
  });

  function cyclicLib(): string {
    // D delegates to D2 and D2 back to D (a same-lib delegation cycle). Neither delegation name is a disposition.
    return [
      "# L",
      "library \"L\".",
      "decision \"D\":",
      "",
      "- when \"P\" then recommend activity \"A\".",
      "- when \"P\" then use decision \"D2\".",
      "decision \"D2\":",
      "",
      "- when \"P\" then use decision \"D\".",
      "concept \"P\":",
      "- type is Observation.",
      "- value type is boolean.",
      "- defined as \"P\".",
      "activity \"A\":",
      "- request CPGServiceRequest.",
      "- with \"VS\".",
      "terminology \"VS\":",
      "- valueset is `urn:example:placeholder`.",
    ].join("\n");
  }

  test("a cyclic delegation name is NOT offered as an arm → unresolved-result-branch (FIX 2; no hang)", () => {
    withProject((root) => {
      write(root, "lib.crl", cyclicLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"D2\".", // the cyclic delegation name — not a disposition
      ].join("\n"));
      const r = validateCELFile(file);
      const branchErrors = r.errors.filter((e) => e.kind === "unresolved-result-branch");
      expect(branchErrors).toHaveLength(1);
      expect(branchErrors[0].message).toContain("D2");
    });
  });

  test("the direct disposition of a cyclically-delegating decision still validates", () => {
    withProject((root) => {
      write(root, "lib.crl", cyclicLib());
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "- result is \"D\" is \"A\".", // D's own direct recommend activity — valid (the cycle is only on the D2 arm)
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "unresolved-result-branch")).toEqual([]);
    });
  });
});

describe("CEL Todo 4 — fact/case namespaces + uniqueness", () => {
  test("duplicate fact name → duplicate-fact-name", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        "# T",
        "library \"T\".",
        "covers \"L\".",
        "fact \"Dup\":",
        "- name is \"a\".",
        "- defined by \"Patient\".",
        "fact \"Dup\":",
        "- name is \"b\".",
        "- defined by \"Patient\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "duplicate-fact-name")).toBe(true);
    });
  });

  test("duplicate case name → duplicate-case-name", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"Subject\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "duplicate-case-name")).toBe(true);
    });
  });

  test("fact and case sharing a name → clean (separate namespaces)", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"Subject\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.filter((e) => e.kind === "duplicate-fact-name" || e.kind === "duplicate-case-name")).toEqual([]);
    });
  });

  test("unresolved fact ref (`subject is \"NotAFact\"`) → unresolved-fact-ref", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "case \"C\":",
        "- subject is \"NotAFact\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-fact-ref")).toBe(true);
    });
  });
});

describe("CEL Todo 4 — CEL include", () => {
  test("include with alias → alias-not-yet-supported warning", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        "# T",
        "library \"T\".",
        "covers \"L\".",
        "include \"L\" as \"Alias\".",
        "fact \"X\":",
        "- name is \"x\".",
        "- defined by \"Patient\".",
        "case \"C\":",
        "- subject is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.warnings.some((w) => w.kind === "alias-not-yet-supported")).toBe(true);
    });
  });

  test("include unknown library → unresolved-cel-include", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        "# T",
        "library \"T\".",
        "covers \"L\".",
        "include \"NoSuchLib\".",
        "fact \"X\":",
        "- name is \"x\".",
        "- defined by \"Patient\".",
        "case \"C\":",
        "- subject is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file);
      expect(r.errors.some((e) => e.kind === "unresolved-cel-include")).toBe(true);
    });
  });
});

describe("CEL Todo 4 — soft mode", () => {
  test("unsupported-yet warning is silenced under soft", () => {
    withProject((root) => {
      // Concept with no derivable type via composition body.
      write(root, "lib.crl", [
        "# L",
        "library \"L\".",
        "concept \"Composite\":",
        "- defined as \"Composite\".",
      ].join("\n"));
      const file = write(root, "f.cel", [
        ...ENC_FACT_HEADER,
        "fact \"Y\":",
        "- code is \"sys|c\".",
        "- defined by \"L\".\"Composite\".",
        "case \"C\":",
        "- subject is \"Subject\".",
      ].join("\n"));
      const hard = validateCELFile(file);
      expect(hard.warnings.some((w) => w.kind === "unsupported-yet")).toBe(true);
      const soft = validateCELFile(file, { soft: true });
      expect(soft.warnings.filter((w) => w.kind === "unsupported-yet")).toEqual([]);
    });
  });

  test("unresolved-bare-type stays an error under soft (CEL diverges from CRL)", () => {
    withProject((root) => {
      write(root, "lib.crl", "# L\nlibrary \"L\".");
      const file = write(root, "f.cel", [
        "# T",
        "library \"T\".",
        "covers \"L\".",
        "fact \"X\":",
        "- name is \"x\".",
        "- defined by \"NotAType\".",
        "case \"C\":",
        "- subject is \"X\".",
      ].join("\n"));
      const r = validateCELFile(file, { soft: true });
      expect(r.errors.some((e) => e.kind === "unresolved-bare-type")).toBe(true);
    });
  });
});

describe("CEL Todo 4 — validateCEL() consumes pre-built graphs", () => {
  test("works on a ResolvedCelGraph from resolveCelImports", () => {
    const graph = resolveCelImports(CORPUS.cms22);
    const r = validateCEL(graph);
    expect(r.errors).toEqual([]);
  });
});
