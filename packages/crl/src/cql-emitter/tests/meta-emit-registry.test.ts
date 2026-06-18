import { readFileSync } from "fs";
import * as path from "path";

import { describe, expect, it } from "@jest/globals";

import { emitCQL, EMIT_CQL_COMMENT_TAGS } from "../emitCQL";

// The emitter renders only the registry's `emit.cql: true` tags into CQL block
// comments. This suite (a) drift-guards the emitter's allowlist against the
// registry, and (b) checks the actual emit behavior end-to-end.

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const REGISTRY = path.join(REPO_ROOT, "spec", "metadata-registry.json");

function lib(name: string, body: string): string {
  return `# ${name}\nlibrary "${name}".\n${body}`;
}
const term = (n: string) => `terminology "${n}":\n- valueset is \`${n}\`.\n`;

describe("meta emit ↔ registry sync", () => {
  it("EMIT_CQL_COMMENT_TAGS exactly matches the registry's emit.cql=true tags", () => {
    const registry = JSON.parse(readFileSync(REGISTRY, "utf-8")) as {
      tags: { id: string; emit?: { cql?: boolean } }[];
    };
    const registryEmit = registry.tags
      .filter((t) => t.emit?.cql === true)
      .map((t) => t.id)
      .sort();
    expect([...EMIT_CQL_COMMENT_TAGS].sort()).toEqual(registryEmit);
  });

  it("the five emit.cql tags include the two deferred-logic tags", () => {
    for (const t of [
      "logic-expression-text",
      "crl-future-expression",
      "ke-feedback",
      "business-logic-deferred",
      "clinical-logic-deferred",
    ]) {
      expect(EMIT_CQL_COMMENT_TAGS.has(t)).toBe(true);
    }
  });
});

describe("meta emit behavior", () => {
  it("emits emit.cql tags as a block comment; omits non-emit tags + untyped notes", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Annotated":\n- type is Observation.\n- value type is Quantity.\n` +
        "- meta is `@logic-expression-text: most recent BMI is increasing`.\n" +
        '- meta is `@crl-future-expression: increasing "BMI Obs" over last 3 "Encounter"`.\n' +
        "- meta is `@ke-feedback: confirm a single elevated reading suffices`.\n" +
        "- meta is `@business-logic-deferred: tie-break when two readings share a timestamp`.\n" +
        "- meta is `@clinical-logic-deferred: exclude hospice patients from the cohort`.\n" +
        "- meta is `@description: should NOT reach CQL`.\n" +
        "- meta is `a plain untyped note that should NOT reach CQL`.\n" +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    const cql = r.result ?? "";

    // All five emit.cql tags land in the block comment.
    for (const tag of [
      "@logic-expression-text:",
      "@crl-future-expression:",
      "@ke-feedback:",
      "@business-logic-deferred:",
      "@clinical-logic-deferred:",
    ]) {
      expect(cql).toContain(tag);
    }
    // Non-emit tag and untyped note do NOT reach the CQL.
    expect(cql).not.toContain("@description:");
    expect(cql).not.toContain("a plain untyped note");

    // The deferred-logic tags are inside a block comment above the define.
    expect(cql).toMatch(
      /\/\*[\s\S]*@business-logic-deferred:[\s\S]*@clinical-logic-deferred:[\s\S]*\*\/\ndefine "Annotated":/,
    );
  });

  it("`@cql-comment` emits its body as a comment with the tag prefix stripped", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Passthrough":\n- type is Observation.\n- value type is Quantity.\n` +
        "- meta is `@cql-comment: see SME guidance doc section 4.2`.\n" +
        "- meta is `@ke-feedback: keep tag prefix here`.\n" +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    const cql = r.result ?? "";
    // Body present, prefix stripped.
    expect(cql).toContain(" * see SME guidance doc section 4.2");
    expect(cql).not.toContain("@cql-comment:");
    // Other emit.cql tags still keep their prefix.
    expect(cql).toContain(" * @ke-feedback: keep tag prefix here");
  });

  it("a concept whose only meta is non-emit tags gets no block comment", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Plain":\n- type is Observation.\n- value type is Quantity.\n` +
        "- meta is `@description: internal note`.\n" +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).not.toMatch(/\*\/\ndefine "Plain":/);
  });
});
