// #212 flags→MV slice 2 — the legacy FlagInstance→ReadFlag adapter. Pure (type-only crl import + node:crypto), harness-loadable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { legacyToMvFlag, storeReadFlag, LEGACY_CREATED_AT } = await load("mvFlagLegacy.ts");
const { isValidFlagId } = await load("mvFlag.ts");

// A minimal FlagInstance (the CRL-core shape collectFlags returns).
const fi = (over = {}) => ({
  tag: "validation-concern", canonicalTag: "validation-concern", category: "validation", status: "open",
  key: undefined, fields: new Map(), body: "BMI looks wrong", scope: "decision", targetName: "D", libraryName: "L",
  filePath: "e:/p/src/crl/x.crl", lineLocation: { start: { line: 12, column: 2 }, end: { line: 12, column: 40 } }, ...over,
});

test("origin is 'legacy'; src carries the RAW source coordinates + raw parsed values", () => {
  const rf = legacyToMvFlag(fi({ tag: "vc-alias", status: "pending", key: "abc123" }));
  assert.equal(rf.origin, "legacy");
  assert.equal(rf.src.filePath, "e:/p/src/crl/x.crl");
  assert.equal(rf.src.lineLocation.start.line, 12);
  assert.equal(rf.src.tag, "vc-alias", "src.tag is the RAW tag (for the write-back stale-guard), not the canonical");
  assert.equal(rf.src.rawStatus, "pending", "src.rawStatus is the UNCOERCED status");
  assert.equal(rf.src.key, "abc123");
});

test("status is coerced for the gate view; only exactly 'resolved' resolves", () => {
  assert.equal(legacyToMvFlag(fi({ status: "resolved" })).flag.status, "resolved");
  assert.equal(legacyToMvFlag(fi({ status: "open" })).flag.status, "open");
  assert.equal(legacyToMvFlag(fi({ status: "pending" })).flag.status, "open", "unknown status → open (blocks the gate)");
});

test("tag = canonicalTag (display/gate); gist = body", () => {
  const rf = legacyToMvFlag(fi({ tag: "vc-alias", canonicalTag: "validation-concern" }));
  assert.equal(rf.flag.tag, "validation-concern");
  assert.equal(rf.flag.gist, "BMI looks wrong");
});

test("category is LENIENT (a live legacy flag is never dropped): extraction kept; absent/unknown → validation", () => {
  assert.equal(legacyToMvFlag(fi({ category: "extraction" })).flag.category, "extraction");
  assert.equal(legacyToMvFlag(fi({ category: undefined })).flag.category, "validation");
  assert.equal(legacyToMvFlag(fi({ category: "bogus" })).flag.category, "validation");
});

test("occurrence key promotion: decision + `nodeId~sig` → anchor.occurrenceKey; label carries the signature", () => {
  const rf = legacyToMvFlag(fi({ scope: "decision", key: "action[0]~(top)→L:DoThing" }));
  assert.equal(rf.flag.anchor.occurrenceKey, "action[0]~(top)→L:DoThing");
  assert.equal(rf.flag.dedupKey, undefined);
  assert.match(rf.flag.anchor.label, /\(top\)→L:DoThing/);
});

test("a non-occurrence `; key` (a re-add-guard hash, no `~`) → dedupKey, NOT occurrenceKey", () => {
  const rf = legacyToMvFlag(fi({ scope: "decision", key: "9f2ab7c1" }));
  assert.equal(rf.flag.anchor.occurrenceKey, undefined);
  assert.equal(rf.flag.dedupKey, "9f2ab7c1");
});

test("a bare `when[0]`-looking key with NO `~` is NOT promoted (missing signature = lost fingerprint safety) → dedupKey", () => {
  const rf = legacyToMvFlag(fi({ scope: "decision", key: "when[0]" }));
  assert.equal(rf.flag.anchor.occurrenceKey, undefined);
  assert.equal(rf.flag.dedupKey, "when[0]");
});

test("occurrence-looking key on a CONCEPT (not a decision) is NOT promoted → dedupKey (occurrenceKey is decision-only)", () => {
  const rf = legacyToMvFlag(fi({ scope: "concept", key: "action[0]~sig" }));
  assert.equal(rf.flag.anchor.occurrenceKey, undefined);
  assert.equal(rf.flag.dedupKey, "action[0]~sig");
});

test("fields split: `status`/`key` dropped from the map; `ref` + tag-specific fields preserved", () => {
  const rf = legacyToMvFlag(fi({ fields: new Map([["status", "open"], ["key", "abc"], ["ref", "#42"], ["kind", "narrative-error"]]) }));
  assert.deepEqual(rf.flag.fields, { ref: "#42", kind: "narrative-error" });
});

test("anchor: scope/name/library from the FlagInstance; concept without a library omits it", () => {
  const dec = legacyToMvFlag(fi({ scope: "decision", targetName: "D", libraryName: "L" })).flag.anchor;
  assert.deepEqual({ scope: dec.scope, name: dec.name, library: dec.library }, { scope: "decision", name: "D", library: "L" });
  const lib = legacyToMvFlag(fi({ scope: "library", targetName: "L", libraryName: "L" })).flag.anchor;
  assert.equal(lib.scope, "library");
  const noLib = legacyToMvFlag(fi({ scope: "concept", targetName: "C", libraryName: undefined })).flag.anchor;
  assert.equal(noLib.library, undefined);
});

test("id is DETERMINISTIC + file-safe: same input → same id; a different line → a different id; passes isValidFlagId", () => {
  const a = legacyToMvFlag(fi()).flag.id;
  const b = legacyToMvFlag(fi()).flag.id;
  const c = legacyToMvFlag(fi({ lineLocation: { start: { line: 99, column: 0 }, end: { line: 99, column: 3 } } })).flag.id;
  assert.equal(a, b, "stable across loads (no randomUUID)");
  assert.notEqual(a, c, "distinct source line → distinct id");
  assert.ok(isValidFlagId(a), "legacy-<hex> is a file-safe token");
});

test("createdAt is the fixed legacy sentinel (deterministic, not a per-load 'now')", () => {
  assert.equal(legacyToMvFlag(fi()).flag.createdAt, LEGACY_CREATED_AT);
});

test("storeReadFlag wraps a persisted record with origin 'store' (no src)", () => {
  const mv = legacyToMvFlag(fi()).flag;
  const rf = storeReadFlag(mv);
  assert.equal(rf.origin, "store");
  assert.equal(rf.flag, mv);
  assert.equal(rf.src, undefined);
});

console.log("mvFlagLegacy.test: ok");
