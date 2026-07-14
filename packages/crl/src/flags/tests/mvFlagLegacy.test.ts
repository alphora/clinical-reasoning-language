// #212 flags→MV — the legacy FlagInstance→ReadFlag adapter. (Ported node:test → jest, disc 248.)
import { legacyToMvFlag, storeReadFlag, LEGACY_CREATED_AT } from "../mvFlagLegacy";
import { isValidFlagId } from "../mvFlag";
import type { FlagInstance } from "../../meta/collectFlags";

// A minimal FlagInstance (the CRL-core shape collectFlags returns).
const fi = (over: Partial<FlagInstance> = {}): FlagInstance =>
  ({
    tag: "validation-concern", canonicalTag: "validation-concern", category: "validation", status: "open",
    key: undefined, fields: new Map<string, string>(), body: "BMI looks wrong", scope: "decision", targetName: "D", libraryName: "L",
    filePath: "e:/p/src/crl/x.crl", lineLocation: { start: { line: 12, column: 2 }, end: { line: 12, column: 40 } }, ...over,
  }) as FlagInstance;

test("origin is 'legacy'; src carries the RAW source coordinates + raw parsed values", () => {
  const rf = legacyToMvFlag(fi({ tag: "vc-alias", status: "pending", key: "abc123" }));
  expect(rf.origin).toBe("legacy");
  if (rf.origin !== "legacy") return;
  expect(rf.src.filePath).toBe("e:/p/src/crl/x.crl");
  expect(rf.src.lineLocation.start.line).toBe(12);
  expect(rf.src.tag).toBe("vc-alias");
  expect(rf.src.rawStatus).toBe("pending");
  expect(rf.src.key).toBe("abc123");
});

test("status is coerced for the gate view; only exactly 'resolved' resolves", () => {
  expect(legacyToMvFlag(fi({ status: "resolved" })).flag.status).toBe("resolved");
  expect(legacyToMvFlag(fi({ status: "open" })).flag.status).toBe("open");
  expect(legacyToMvFlag(fi({ status: "pending" })).flag.status).toBe("open");
});

test("tag = canonicalTag (display/gate); gist = body", () => {
  const rf = legacyToMvFlag(fi({ tag: "vc-alias", canonicalTag: "validation-concern" }));
  expect(rf.flag.tag).toBe("validation-concern");
  expect(rf.flag.gist).toBe("BMI looks wrong");
});

test("category is LENIENT: extraction kept; absent/unknown → validation", () => {
  expect(legacyToMvFlag(fi({ category: "extraction" })).flag.category).toBe("extraction");
  expect(legacyToMvFlag(fi({ category: undefined })).flag.category).toBe("validation");
  expect(legacyToMvFlag(fi({ category: "bogus" })).flag.category).toBe("validation");
});

test("occurrence key promotion: decision + `nodeId~sig` → anchor.occurrenceKey; label carries the signature", () => {
  const rf = legacyToMvFlag(fi({ scope: "decision", key: "action[0]~(top)→L:DoThing" }));
  expect(rf.flag.anchor.occurrenceKey).toBe("action[0]~(top)→L:DoThing");
  expect(rf.flag.dedupKey).toBeUndefined();
  expect(rf.flag.anchor.label).toMatch(/\(top\)→L:DoThing/);
});

test("a non-occurrence `; key` (a re-add-guard hash, no `~`) → dedupKey, NOT occurrenceKey", () => {
  const rf = legacyToMvFlag(fi({ scope: "decision", key: "9f2ab7c1" }));
  expect(rf.flag.anchor.occurrenceKey).toBeUndefined();
  expect(rf.flag.dedupKey).toBe("9f2ab7c1");
});

test("a bare `when[0]`-looking key with NO `~` is NOT promoted → dedupKey", () => {
  const rf = legacyToMvFlag(fi({ scope: "decision", key: "when[0]" }));
  expect(rf.flag.anchor.occurrenceKey).toBeUndefined();
  expect(rf.flag.dedupKey).toBe("when[0]");
});

test("occurrence-looking key on a CONCEPT (not a decision) is NOT promoted → dedupKey", () => {
  const rf = legacyToMvFlag(fi({ scope: "concept", key: "action[0]~sig" }));
  expect(rf.flag.anchor.occurrenceKey).toBeUndefined();
  expect(rf.flag.dedupKey).toBe("action[0]~sig");
});

test("fields split: `status`/`key` dropped from the map; `ref` + tag-specific fields preserved", () => {
  const rf = legacyToMvFlag(fi({ fields: new Map([["status", "open"], ["key", "abc"], ["ref", "#42"], ["kind", "narrative-error"]]) }));
  expect(rf.flag.fields).toEqual({ ref: "#42", kind: "narrative-error" });
});

test("anchor: scope/name/library from the FlagInstance; concept without a library omits it", () => {
  const dec = legacyToMvFlag(fi({ scope: "decision", targetName: "D", libraryName: "L" })).flag.anchor;
  expect({ scope: dec.scope, name: dec.name, library: dec.library }).toEqual({ scope: "decision", name: "D", library: "L" });
  const lib = legacyToMvFlag(fi({ scope: "library", targetName: "L", libraryName: "L" })).flag.anchor;
  expect(lib.scope).toBe("library");
  const noLib = legacyToMvFlag(fi({ scope: "concept", targetName: "C", libraryName: undefined })).flag.anchor;
  expect(noLib.library).toBeUndefined();
});

test("id is DETERMINISTIC + file-safe: same input → same id; a different line → a different id", () => {
  const a = legacyToMvFlag(fi()).flag.id;
  const b = legacyToMvFlag(fi()).flag.id;
  const c = legacyToMvFlag(fi({ lineLocation: { start: { line: 99, column: 0 }, end: { line: 99, column: 3 } } })).flag.id;
  expect(a).toBe(b);
  expect(a).not.toBe(c);
  expect(isValidFlagId(a)).toBe(true);
});

test("createdAt is the fixed legacy sentinel (deterministic, not a per-load 'now')", () => {
  expect(legacyToMvFlag(fi()).flag.createdAt).toBe(LEGACY_CREATED_AT);
});

test("storeReadFlag wraps a persisted record with origin 'store' (no src)", () => {
  const mv = legacyToMvFlag(fi()).flag;
  const rf = storeReadFlag(mv);
  expect(rf.origin).toBe("store");
  expect(rf.flag).toBe(mv);
  expect((rf as { src?: unknown }).src).toBeUndefined();
});
