// #212 flags→MV slice 1 — the pure flag record model. PURE (type-only imports), so the shared harness loads it directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { coerceFlag, coerceFlagStatus, isOpen, isValidFlagId } = await load("mvFlag.ts");

const valid = {
  schemaVersion: 1, id: "f1", category: "validation", tag: "validation-concern", gist: "BMI is wrong",
  status: "open", fields: { kind: "narrative-error", ref: "#42" },
  anchor: { scope: "decision", name: "D", library: "L", occurrenceKey: "action[0]~sig", label: "recommend X" },
  createdAt: "2026-07-13T00:00:00.000Z",
};

test("coerceFlagStatus: exactly 'resolved' stays; ANYTHING else → open (unknown/absent must BLOCK, never clear)", () => {
  assert.equal(coerceFlagStatus("resolved"), "resolved");
  for (const v of ["open", "bogus", "", undefined, null, 1, {}]) assert.equal(coerceFlagStatus(v), "open", `${JSON.stringify(v)} → open`);
});

test("isOpen: everything-not-resolved is open", () => {
  assert.equal(isOpen({ status: "open" }), true);
  assert.equal(isOpen({ status: "resolved" }), false);
});

test("coerceFlag: a valid record round-trips (fields map + anchor preserved)", () => {
  const f = coerceFlag(valid);
  assert.ok(f);
  assert.equal(f.id, "f1");
  assert.equal(f.category, "validation");
  assert.equal(f.status, "open");
  assert.deepEqual(f.fields, { kind: "narrative-error", ref: "#42" });
  assert.deepEqual(f.anchor, { scope: "decision", name: "D", library: "L", occurrenceKey: "action[0]~sig", label: "recommend X" });
  assert.equal(f.schemaVersion, 1);
});

test("coerceFlag: a bad/absent status coerces to open (never dropped, never cleared) — the gate must not silently pass", () => {
  assert.equal(coerceFlag({ ...valid, status: "bogus" }).status, "open");
  assert.equal(coerceFlag({ ...valid, status: undefined }).status, "open");
});

test("coerceFlag: structurally-invalid records → undefined (the store turns undefined into a WARNING → gate error, never a silent drop)", () => {
  assert.equal(coerceFlag(null), undefined);
  assert.equal(coerceFlag([]), undefined);
  assert.equal(coerceFlag("x"), undefined);
  assert.equal(coerceFlag({ ...valid, id: "" }), undefined, "missing id");
  assert.equal(coerceFlag({ ...valid, tag: undefined }), undefined, "missing tag");
  assert.equal(coerceFlag({ ...valid, gist: 5 }), undefined, "non-string gist");
  assert.equal(coerceFlag({ ...valid, createdAt: undefined }), undefined, "missing createdAt");
  assert.equal(coerceFlag({ ...valid, anchor: undefined }), undefined, "missing anchor");
  assert.equal(coerceFlag({ ...valid, anchor: { scope: "decision", name: "D" } }), undefined, "anchor missing label");
  assert.equal(coerceFlag({ ...valid, anchor: { scope: "bogus", name: "D", label: "x" } }), undefined, "bad anchor scope");
});

test("coerceFlag: schemaVersion MUST be exactly 1 — absent/forward/non-numeric ⇒ undefined (never mis-read a future record as v1)", () => {
  assert.equal(coerceFlag({ ...valid, schemaVersion: undefined }), undefined, "absent version");
  assert.equal(coerceFlag({ ...valid, schemaVersion: 2 }), undefined, "forward version");
  assert.equal(coerceFlag({ ...valid, schemaVersion: "1" }), undefined, "string version");
});

test("coerceFlag: id must be a FILE-SAFE token — separators / .. / whitespace ⇒ undefined (a `../x` id must never reach a join())", () => {
  for (const bad of ["../x", "a/b", "a\\b", "..", ".", " ", "a b", "a.json"])
    assert.equal(coerceFlag({ ...valid, id: bad }), undefined, `${JSON.stringify(bad)} → undefined`);
  assert.ok(coerceFlag({ ...valid, id: "f-1_2ABC" }), "a uuid-ish token is accepted");
});

test("isValidFlagId: accepts host uuids/tokens; rejects separators, dot-segments, blanks", () => {
  assert.equal(isValidFlagId("3f2a-9b_C"), true);
  for (const bad of ["", " ", "../x", "a/b", "a\\b", "..", ".", "a.b", 5, null, undefined]) assert.equal(isValidFlagId(bad), false, `${JSON.stringify(bad)}`);
});

test("coerceFlag: category — absent ⇒ default 'validation'; 'extraction' preserved; PRESENT-but-invalid ⇒ undefined (won't silently relabel provenance)", () => {
  assert.equal(coerceFlag({ ...valid, category: "extraction" }).category, "extraction");
  assert.equal(coerceFlag({ ...valid, category: undefined }).category, "validation");
  assert.equal(coerceFlag({ ...valid, category: "bogus" }), undefined, "a present bad category is a corruption, not a default");
});

test("coerceFlag: non-string fields values are dropped from the map (a bad field isn't fatal)", () => {
  const f = coerceFlag({ ...valid, fields: { kind: "x", bad: 5, also: null } });
  assert.deepEqual(f.fields, { kind: "x" });
});

test("coerceFlag: optional anchor bits (library/entityId/occurrenceKey) omitted when absent/empty", () => {
  const f = coerceFlag({ ...valid, anchor: { scope: "library", name: "L", label: "the library" } });
  assert.deepEqual(f.anchor, { scope: "library", name: "L", label: "the library" });
});

console.log("mvFlag.test: ok");
