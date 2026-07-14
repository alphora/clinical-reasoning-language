// #212 flags→MV — the pure flag record model. (Ported from crl-vscode node:test → jest on the move to core, disc 248.)
import { coerceFlag, coerceFlagStatus, isOpen, isValidFlagId } from "../mvFlag";

const valid = {
  schemaVersion: 1,
  id: "f1",
  category: "validation",
  tag: "validation-concern",
  gist: "BMI is wrong",
  status: "open",
  fields: { kind: "narrative-error", ref: "#42" },
  anchor: { scope: "decision", name: "D", library: "L", occurrenceKey: "action[0]~sig", label: "recommend X" },
  createdAt: "2026-07-13T00:00:00.000Z",
};

test("coerceFlagStatus: exactly 'resolved' stays; ANYTHING else → open (unknown/absent must BLOCK, never clear)", () => {
  expect(coerceFlagStatus("resolved")).toBe("resolved");
  for (const v of ["open", "bogus", "", undefined, null, 1, {}]) expect(coerceFlagStatus(v)).toBe("open");
});

test("isOpen: everything-not-resolved is open", () => {
  expect(isOpen({ status: "open" } as never)).toBe(true);
  expect(isOpen({ status: "resolved" } as never)).toBe(false);
});

test("coerceFlag: a valid record round-trips (fields map + anchor preserved)", () => {
  const f = coerceFlag(valid)!;
  expect(f).toBeTruthy();
  expect(f.id).toBe("f1");
  expect(f.category).toBe("validation");
  expect(f.status).toBe("open");
  expect(f.fields).toEqual({ kind: "narrative-error", ref: "#42" });
  expect(f.anchor).toEqual({ scope: "decision", name: "D", library: "L", occurrenceKey: "action[0]~sig", label: "recommend X" });
  expect(f.schemaVersion).toBe(1);
});

test("coerceFlag: a bad/absent status coerces to open (never dropped, never cleared) — the gate must not silently pass", () => {
  expect(coerceFlag({ ...valid, status: "bogus" })!.status).toBe("open");
  expect(coerceFlag({ ...valid, status: undefined })!.status).toBe("open");
});

test("coerceFlag: structurally-invalid records → undefined (the store turns undefined into a WARNING → gate error, never a silent drop)", () => {
  expect(coerceFlag(null)).toBeUndefined();
  expect(coerceFlag([])).toBeUndefined();
  expect(coerceFlag("x")).toBeUndefined();
  expect(coerceFlag({ ...valid, id: "" })).toBeUndefined();
  expect(coerceFlag({ ...valid, tag: undefined })).toBeUndefined();
  expect(coerceFlag({ ...valid, gist: 5 })).toBeUndefined();
  expect(coerceFlag({ ...valid, createdAt: undefined })).toBeUndefined();
  expect(coerceFlag({ ...valid, anchor: undefined })).toBeUndefined();
  expect(coerceFlag({ ...valid, anchor: { scope: "decision", name: "D" } })).toBeUndefined();
  expect(coerceFlag({ ...valid, anchor: { scope: "bogus", name: "D", label: "x" } })).toBeUndefined();
});

test("coerceFlag: schemaVersion MUST be exactly 1 — absent/forward/non-numeric ⇒ undefined", () => {
  expect(coerceFlag({ ...valid, schemaVersion: undefined })).toBeUndefined();
  expect(coerceFlag({ ...valid, schemaVersion: 2 })).toBeUndefined();
  expect(coerceFlag({ ...valid, schemaVersion: "1" })).toBeUndefined();
});

test("coerceFlag: id must be a FILE-SAFE token — separators / .. / whitespace ⇒ undefined", () => {
  for (const bad of ["../x", "a/b", "a\\b", "..", ".", " ", "a b", "a.json"]) expect(coerceFlag({ ...valid, id: bad })).toBeUndefined();
  expect(coerceFlag({ ...valid, id: "f-1_2ABC" })).toBeTruthy();
});

test("isValidFlagId: accepts host uuids/tokens; rejects separators, dot-segments, blanks", () => {
  expect(isValidFlagId("3f2a-9b_C")).toBe(true);
  for (const bad of ["", " ", "../x", "a/b", "a\\b", "..", ".", "a.b", 5, null, undefined]) expect(isValidFlagId(bad)).toBe(false);
});

test("coerceFlag: category — absent ⇒ default 'validation'; 'extraction' preserved; PRESENT-but-invalid ⇒ undefined", () => {
  expect(coerceFlag({ ...valid, category: "extraction" })!.category).toBe("extraction");
  expect(coerceFlag({ ...valid, category: undefined })!.category).toBe("validation");
  expect(coerceFlag({ ...valid, category: "bogus" })).toBeUndefined();
});

test("coerceFlag: non-string fields values are dropped from the map (a bad field isn't fatal)", () => {
  const f = coerceFlag({ ...valid, fields: { kind: "x", bad: 5, also: null } })!;
  expect(f.fields).toEqual({ kind: "x" });
});

test("coerceFlag: optional anchor bits (library/entityId/occurrenceKey) omitted when absent/empty", () => {
  const f = coerceFlag({ ...valid, anchor: { scope: "library", name: "L", label: "the library" } })!;
  expect(f.anchor).toEqual({ scope: "library", name: "L", label: "the library" });
});
