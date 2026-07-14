// #212 flags→MV slice 1 — the flag STORE IO (per-flag files under `.crl/flags/`). fs-based (no vscode), so the harness loads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { flagStoreDir, loadFlags, saveFlag, removeFlag } = await load("mvFlagStore.ts");

const mkFlag = (id, over = {}) => ({
  schemaVersion: 1, id, category: "validation", tag: "validation-concern", gist: `g-${id}`,
  status: "open", fields: {}, anchor: { scope: "library", name: "L", label: "lib" }, createdAt: "2026-07-13T00:00:00.000Z", ...over,
});
const tmp = () => mkdtempSync(join(tmpdir(), "mvflagstore-"));

test("loadFlags: a missing dir → empty, NO warning (a fresh policy)", () => {
  const r = loadFlags(join(tmp(), "does-not-exist"));
  assert.deepEqual(r, { flags: [] });
});

test("saveFlag → loadFlags: per-flag files round-trip; each flag is its own <id>.json", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a"));
  saveFlag(d, mkFlag("b", { status: "resolved" }));
  assert.ok(existsSync(join(d, "a.json")) && existsSync(join(d, "b.json")), "one file per flag");
  const r = loadFlags(d);
  assert.equal(r.warning, undefined);
  assert.deepEqual(r.flags.map((f) => f.id).sort(), ["a", "b"]);
  assert.equal(r.flags.find((f) => f.id === "b").status, "resolved");
});

test("saveFlag: overwrites the same id atomically (no leftover .tmp)", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a", { gist: "first" }));
  saveFlag(d, mkFlag("a", { gist: "second" }));
  const r = loadFlags(d);
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0].gist, "second");
  assert.ok(!readdirSync(d).some((f) => f.endsWith(".tmp")), "no leftover tmp");
});

test("removeFlag: deletes the file; idempotent on a missing id", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a"));
  removeFlag(d, "a");
  assert.ok(!existsSync(join(d, "a.json")));
  removeFlag(d, "a"); // no throw
  removeFlag(d, "never"); // no throw
});

test("loadFlags: ignores stray non-.json files (a crash-residue .tmp, editor junk) with NO warning", () => {
  const d = tmp();
  saveFlag(d, mkFlag("a"));
  writeFileSync(join(d, "a.json.999.tmp"), "partial", "utf8"); // a crashed concurrent write's tmp
  writeFileSync(join(d, "notes.txt"), "hi", "utf8");
  writeFileSync(join(d, ".DS_Store"), "x", "utf8");
  const r = loadFlags(d);
  assert.equal(r.flags.length, 1, "only the .json flag loads");
  assert.equal(r.warning, undefined, "non-.json files are not flag records → no warning");
});

test("loadFlags: a file whose basename ≠ its record id is REJECTED with a warning (identity contract; blocks removeFlag reappear-bug)", () => {
  const d = tmp();
  writeFileSync(join(d, "a.json"), JSON.stringify(mkFlag("b")), "utf8"); // file `a.json` but record id `b`
  const r = loadFlags(d);
  assert.equal(r.flags.length, 0, "the mismatched record is not loaded under the wrong key");
  assert.ok(r.warning, "the mismatch is surfaced (store identity unknown → gate blocks)");
  assert.match(r.warning, /a\.json/);
});

test("loadFlags: a record with an unsafe id (path traversal) is REJECTED with a warning, never trusted into a path", () => {
  const d = tmp();
  writeFileSync(join(d, "evil.json"), JSON.stringify(mkFlag("../../escape")), "utf8");
  const r = loadFlags(d);
  assert.equal(r.flags.length, 0);
  assert.ok(r.warning, "unsafe id → invalid record → warning");
});

test("saveFlag/removeFlag: refuse an unsafe id (defense in depth — never join() a `../x`)", () => {
  const d = tmp();
  assert.throws(() => saveFlag(d, mkFlag("../../x")), /unsafe id/);
  assert.throws(() => removeFlag(d, "../../x"), /unsafe id/);
});

test("loadFlags: an invalid/malformed record is NOT dropped silently — it sets a WARNING (→ the caller blocks the gate)", () => {
  const d = tmp();
  saveFlag(d, mkFlag("good"));
  writeFileSync(join(d, "broken.json"), "{ not json", "utf8"); // malformed JSON
  writeFileSync(join(d, "wrong.json"), JSON.stringify({ id: "wrong" }), "utf8"); // valid JSON, invalid flag (no tag/gist/anchor)
  const r = loadFlags(d);
  assert.equal(r.flags.length, 1, "the good flag still loads");
  assert.equal(r.flags[0].id, "good");
  assert.ok(r.warning, "a warning is raised for the 2 bad records (→ gate error, never a silent under-count)");
  assert.match(r.warning, /broken\.json/);
  assert.match(r.warning, /wrong\.json/);
});

test("flagStoreDir: a path not inside a policy src/ → undefined (mirrors medicalValidationSidecarPath)", () => {
  assert.equal(flagStoreDir(join(tmpdir(), "nowhere", "x.cel")), undefined);
});

console.log("mvFlagStore.test: ok");
