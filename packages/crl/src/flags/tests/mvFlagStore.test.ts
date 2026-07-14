// #212 flags→MV — the flag STORE IO (per-flag files under `.crl/flags/`). (Ported node:test → jest, disc 248.)
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flagStoreDir, loadFlags, saveFlag, removeFlag } from "../mvFlagStore";
import type { MvFlag } from "../mvFlag";

const mkFlag = (id: string, over: Partial<MvFlag> = {}): MvFlag =>
  ({
    schemaVersion: 1, id, category: "validation", tag: "validation-concern", gist: `g-${id}`,
    status: "open", fields: {}, anchor: { scope: "library", name: "L", label: "lib" }, createdAt: "2026-07-13T00:00:00.000Z", ...over,
  }) as MvFlag;
const tmp = () => mkdtempSync(join(tmpdir(), "mvflagstore-"));

test("loadFlags: a missing dir → empty, NO warning (a fresh policy)", () => {
  const r = loadFlags(join(tmp(), "does-not-exist"));
  expect(r).toEqual({ flags: [] });
});

test("saveFlag → loadFlags: per-flag files round-trip; each flag is its own <id>.json", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a"));
  saveFlag(d, mkFlag("b", { status: "resolved" }));
  expect(existsSync(join(d, "a.json")) && existsSync(join(d, "b.json"))).toBe(true);
  const r = loadFlags(d);
  expect(r.warning).toBeUndefined();
  expect(r.flags.map((f) => f.id).sort()).toEqual(["a", "b"]);
  expect(r.flags.find((f) => f.id === "b")!.status).toBe("resolved");
});

test("saveFlag: overwrites the same id atomically (no leftover .tmp)", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a", { gist: "first" }));
  saveFlag(d, mkFlag("a", { gist: "second" }));
  const r = loadFlags(d);
  expect(r.flags.length).toBe(1);
  expect(r.flags[0].gist).toBe("second");
  expect(readdirSync(d).some((f) => f.endsWith(".tmp"))).toBe(false);
});

test("removeFlag: deletes the file; idempotent on a missing id", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a"));
  removeFlag(d, "a");
  expect(existsSync(join(d, "a.json"))).toBe(false);
  removeFlag(d, "a");
  removeFlag(d, "never");
});

test("loadFlags: ignores stray non-.json files (a crash-residue .tmp, editor junk) with NO warning", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a"));
  writeFileSync(join(d, "a.json.999.tmp"), "partial", "utf8");
  writeFileSync(join(d, "notes.txt"), "hi", "utf8");
  writeFileSync(join(d, ".DS_Store"), "x", "utf8");
  const r = loadFlags(d);
  expect(r.flags.length).toBe(1);
  expect(r.warning).toBeUndefined();
});

test("loadFlags: a file whose basename ≠ its record id is REJECTED with a warning (identity contract)", () => {
  const d = tmp();
  writeFileSync(join(d, "a.json"), JSON.stringify(mkFlag("b")), "utf8");
  const r = loadFlags(d);
  expect(r.flags.length).toBe(0);
  expect(r.warning).toBeTruthy();
  expect(r.warning).toMatch(/a\.json/);
});

test("loadFlags: a record with an unsafe id (path traversal) is REJECTED with a warning", () => {
  const d = tmp();
  writeFileSync(join(d, "evil.json"), JSON.stringify(mkFlag("../../escape")), "utf8");
  const r = loadFlags(d);
  expect(r.flags.length).toBe(0);
  expect(r.warning).toBeTruthy();
});

test("saveFlag/removeFlag: refuse an unsafe id (defense in depth — never join() a `../x`)", () => {
  const d = tmp();
  expect(() => saveFlag(d, mkFlag("../../x"))).toThrow(/unsafe id/);
  expect(() => removeFlag(d, "../../x")).toThrow(/unsafe id/);
});

test("loadFlags: an invalid/malformed record is NOT dropped silently — it sets a WARNING (→ the caller blocks the gate)", () => {
  const d = tmp();
  saveFlag(d, mkFlag("good"));
  writeFileSync(join(d, "broken.json"), "{ not json", "utf8");
  writeFileSync(join(d, "wrong.json"), JSON.stringify({ id: "wrong" }), "utf8");
  const r = loadFlags(d);
  expect(r.flags.length).toBe(1);
  expect(r.flags[0].id).toBe("good");
  expect(r.warning).toBeTruthy();
  expect(r.warning).toMatch(/broken\.json/);
  expect(r.warning).toMatch(/wrong\.json/);
});

test("flagStoreDir: a path not inside a policy src/ → undefined (mirrors medicalValidationSidecarPath)", () => {
  expect(flagStoreDir(join(tmpdir(), "nowhere", "x.cel"))).toBeUndefined();
});
