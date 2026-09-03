import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateCELFile } from "../../../index";

/**
 * ⭐⭐ #280 defect 1 — A BARE-TYPE FACT WITH THE RIGHT CODE AND THE WRONG SYSTEM POPULATES NOTHING, SILENTLY.
 *
 * The emitted CQL retrieves `[Observation: <code> from "<local codesystem>"]`, so an instance whose
 * `code.coding.system` is anything else is NEVER retrieved — every case then returns the residual
 * disposition regardless of its facts. The issue reports committed QA data doing exactly this.
 *
 * ⚠ THE NATURAL WRONG VALUE IS THE BARE `canonicalBase`. The local CodeSystem url is
 * `<canonicalBase>/CodeSystem/<domain>-local`, and nothing tells an author that.
 *
 * ⚠ THE BOUNDARY WAS MEASURED BEFORE THE FIX, not assumed: the QUALIFIED spelling
 * (`defined by "Lib"."Concept"`) already warned via `fact-code-not-in-local-set`; only the BARE-TYPE
 * spelling fell through both that lane and the source-membership lane beside it. Both directions are pinned
 * below so a later change cannot quietly collapse them into one rule that misses a case again.
 */
const PROJECT = {
  "package.json": JSON.stringify({
    name: "sy",
    version: "1.0.0",
    private: true,
    crl: { canonicalBase: "http://example.org/sy", status: "draft", experimental: true },
  }),
  "p.crl": `library "Sy".

concept "Q":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`q\`.
`,
};

const project = (cel: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "crl-bare-sys-"));
  for (const [name, body] of Object.entries(PROJECT)) writeFileSync(join(dir, name), body);
  const celPath = join(dir, "c.cel");
  writeFileSync(celPath, cel);
  return celPath;
};

const kinds = (cel: string): string[] => {
  const v = validateCELFile(project(cel)) as unknown as {
    errors?: { kind: string }[];
    warnings?: { kind: string }[];
  };
  return [...(v.errors ?? []), ...(v.warnings ?? [])].map((x) => x.kind);
};

const HEAD = `library "SyCases".
covers "Sy".

fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
`;

describe("#280 defect 1 — a bare-type fact with the wrong local system", () => {
  it("⭐ WARNS when the code matches a local concept but the system does not", () => {
    // `http://example.org/sy` is the bare canonicalBase — the natural wrong value. The concept's local
    // code lives at `<base>/CodeSystem/<domain>-local`.
    const found = kinds(
      HEAD +
        `
fact "Bare Wrong System":
- code is "http://example.org/sy|q".
- value is true.
- defined by "Observation".
`,
    );
    expect(found).toContain("fact-code-wrong-local-system");
  });

  it("⭐ does NOT warn when the system is right", () => {
    const found = kinds(
      HEAD +
        `
fact "Bare Right System":
- code is "http://example.org/sy/CodeSystem/sy-local|q".
- value is true.
- defined by "Observation".
`,
    );
    expect(found).not.toContain("fact-code-wrong-local-system");
  });

  it("⚠ does NOT warn on an UNRELATED bare-type datum — it is a NEAR MISS rule, not a whitelist", () => {
    // A code that matches no local concept is an ordinary source/context resource. Warning here would fire
    // on the legitimate source-authoring lane beside this one.
    const found = kinds(
      HEAD +
        `
fact "Unrelated":
- code is "http://loinc.org|1234-5".
- value is true.
- defined by "Observation".
`,
    );
    expect(found).not.toContain("fact-code-wrong-local-system");
  });

  it("⚠ the QUALIFIED spelling stays with its own rule, not this one", () => {
    // Pinned so the two lanes are not merged into one that misses a spelling.
    const found = kinds(
      HEAD +
        `
fact "Qualified Wrong System":
- code is "http://example.org/sy|q".
- value is true.
- defined by "Sy"."Q".
`,
    );
    expect(found).toContain("fact-code-not-in-local-set");
    expect(found).not.toContain("fact-code-wrong-local-system");
  });
});
