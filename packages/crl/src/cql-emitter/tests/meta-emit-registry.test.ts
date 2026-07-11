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

  it("the core narrative + deferred-logic emit tags stay enabled", () => {
    for (const t of [
      "logic-expression-text",
      "crl-future-expression",
      "ke-feedback",
      "business-logic-deferred",
      "clinical-logic-deferred",
      "cql-comment",
    ]) {
      expect(EMIT_CQL_COMMENT_TAGS.has(t)).toBe(true);
    }
  });

  it("#203 Todo 5: the four review-flag tags are now emit.cql=true", () => {
    for (const t of ["customer-confirmable", "internal-inconsistency", "open-fork", "fidelity-defect"]) {
      expect(EMIT_CQL_COMMENT_TAGS.has(t)).toBe(true);
    }
  });

  it("#203 Todo 5: every tag with emit.suppressWhenStatus is emit.cql=true and its statuses ⊆ its status enum", () => {
    const registry = JSON.parse(readFileSync(REGISTRY, "utf-8")) as {
      tags: {
        id: string;
        emit?: { cql?: boolean; suppressWhenStatus?: string[] };
        extraFields?: { status?: { values?: string[] } };
      }[];
    };
    const gated = registry.tags.filter((t) => t.emit?.suppressWhenStatus);
    expect(gated.length).toBeGreaterThan(0); // ke-feedback + the 4 flags
    for (const t of gated) {
      expect(t.emit?.cql).toBe(true); // a suppress gate on a non-emitting tag is meaningless
      const allowed = t.extraFields?.status?.values ?? [];
      for (const s of t.emit?.suppressWhenStatus ?? []) expect(allowed).toContain(s);
    }
  });

  it("#203 Todo 5: every emit.cql tag whose status enum has `resolved` DECLARES suppressWhenStatus incl resolved", () => {
    // Guards the OTHER direction (gpt55 impl review): deleting `suppressWhenStatus` from a resolvable emit tag must FAIL,
    // else a resolved flag/ke-feedback would silently start emitting again (noise) with no test catching it.
    const registry = JSON.parse(readFileSync(REGISTRY, "utf-8")) as {
      tags: {
        id: string;
        emit?: { cql?: boolean; suppressWhenStatus?: string[] };
        extraFields?: { status?: { values?: string[] } };
      }[];
    };
    for (const t of registry.tags) {
      const resolvable = t.emit?.cql === true && (t.extraFields?.status?.values ?? []).includes("resolved");
      if (resolvable) expect(t.emit?.suppressWhenStatus ?? []).toContain("resolved");
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

describe("#203 Todo 5 — status-aware flag emit", () => {
  // Emit a concept carrying one meta line; return the CQL (concept meta is the only CQL emit lane for flags).
  const emitWithMeta = (metaLine: string): string => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "C":\n- type is Observation.\n- meta is \`${metaLine}\`.\n- coded from "BMI VS".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    return r.result ?? "";
  };

  it("an OPEN flag emits; a RESOLVED flag does NOT (the core rule)", () => {
    expect(emitWithMeta("@open-fork: AR vs IL; status open; ref #12")).toContain("@open-fork:");
    expect(emitWithMeta("@open-fork: AR vs IL; status resolved; ref #12")).not.toContain("@open-fork:");
  });

  it("a flag with ABSENT status emits (defaults open — conservative)", () => {
    expect(emitWithMeta("@customer-confirmable: confirm the reading")).toContain("@customer-confirmable:");
  });

  it("an ALIAS of a flag emits when open / suppresses when resolved (canonicalized)", () => {
    // over-reach-to-fix is an alias of fidelity-defect (which requires a `direction` field).
    expect(emitWithMeta("@over-reach-to-fix: axillary over-reach; direction over-reach; status open")).toContain("@over-reach-to-fix:");
    expect(emitWithMeta("@over-reach-to-fix: axillary over-reach; direction over-reach; status resolved")).not.toContain("@over-reach-to-fix:");
  });

  it("REGRESSION: a resolved ke-feedback is now SUPPRESSED (was status-blind before Todo 5); open/deferred still emit", () => {
    expect(emitWithMeta("@ke-feedback: confirm a single reading suffices; status resolved")).not.toContain("@ke-feedback:");
    expect(emitWithMeta("@ke-feedback: confirm a single reading suffices; status open")).toContain("@ke-feedback:");
    expect(emitWithMeta("@ke-feedback: parked pending SME; status deferred")).toContain("@ke-feedback:"); // deferred is NOT a suppress status
  });

  it("BYTE-SAFETY: the RAW line is rendered — `; status`/`; direction` fields survive (not parsed.body)", () => {
    const cql = emitWithMeta("@fidelity-defect: axillary only; direction over-reach; status open");
    expect(cql).toContain("@fidelity-defect: axillary only; direction over-reach; status open");
  });

  it("only an EXACT suppress status suppresses — an annotated status still emits (emitter runs no validator)", () => {
    expect(emitWithMeta("@open-fork: x; status resolved (pending Dr X)")).toContain("@open-fork:"); // not exactly `resolved` → emits
  });

  it("duplicate status is last-wins (matches parseMetaTag/collectFlags): trailing resolved suppresses", () => {
    expect(emitWithMeta("@open-fork: x; status open; status resolved")).not.toContain("@open-fork:");
    expect(emitWithMeta("@open-fork: x; status resolved; status open")).toContain("@open-fork:");
  });

  it("@cql-comment is NOT status-gated — `; status resolved` still emits (no suppressWhenStatus), prefix stripped", () => {
    const cql = emitWithMeta("@cql-comment: keep me; status resolved");
    expect(cql).toContain("keep me; status resolved"); // whole body incl the literal `; status resolved`, prefix stripped
    expect(cql).not.toContain("@cql-comment:");
  });

  it("TABLE-DRIVEN over EVERY flag tag: open emits, resolved suppresses (drives the GENERATED const → catches a stale regen)", () => {
    // Reads the flag ids from the source JSON but exercises emit through the emitter (which reads the generated const),
    // so a `suppressWhenStatus` edit that forgot to regenerate registry.generated.ts fails HERE (gpt55/Claude impl review).
    // Covers customer-confirmable + internal-inconsistency, which no other behavior test drove through the resolved path.
    const registry = JSON.parse(readFileSync(REGISTRY, "utf-8")) as { tags: { id: string; flag?: boolean }[] };
    const flagIds = registry.tags.filter((t) => t.flag === true).map((t) => t.id);
    expect(flagIds.sort()).toEqual(["customer-confirmable", "fidelity-defect", "internal-inconsistency", "open-fork"]);
    for (const id of flagIds) {
      expect(emitWithMeta(`@${id}: probe; status open`)).toContain(`@${id}:`); // open → emits
      expect(emitWithMeta(`@${id}: probe; status resolved`)).not.toContain(`@${id}:`); // resolved → suppressed
    }
  });
});
