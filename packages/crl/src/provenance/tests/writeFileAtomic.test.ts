import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFileAtomic } from "../writeFileAtomic";

describe("writeFileAtomic", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "crl-atomic-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes the content and leaves no temp file behind", () => {
    const p = join(tmp, "a.txt");
    writeFileAtomic(p, "hello");
    expect(readFileSync(p, "utf8")).toBe("hello");
    expect(readdirSync(tmp)).toEqual(["a.txt"]); // the sibling temp was renamed away, not left
  });

  it("replaces an existing destination", () => {
    const p = join(tmp, "a.txt");
    writeFileSync(p, "old");
    writeFileAtomic(p, "new");
    expect(readFileSync(p, "utf8")).toBe("new");
    expect(readdirSync(tmp)).toEqual(["a.txt"]);
  });

  it("accepts a Buffer", () => {
    const p = join(tmp, "b.bin");
    writeFileAtomic(p, Buffer.from("bytes"));
    expect(readFileSync(p, "utf8")).toBe("bytes");
  });

  it("throws when the target directory does not exist, leaving no stray temp in the parent", () => {
    expect(() => writeFileAtomic(join(tmp, "no-such-dir", "a.txt"), "x")).toThrow();
    expect(readdirSync(tmp)).toEqual([]); // the temp lived in the missing dir; nothing leaks into tmp
  });

  it("cleans up the temp when the rename fails AFTER the temp was written (destination is a directory)", () => {
    // The temp write succeeds (a fresh sibling file); the rename file→existing-directory fails on every platform, so the
    // catch's unlink is exercised — the branch the missing-dir case above never reaches.
    const dest = join(tmp, "a.txt");
    mkdirSync(dest);
    expect(() => writeFileAtomic(dest, "x")).toThrow();
    expect(readdirSync(tmp)).toEqual(["a.txt"]); // only the dir remains; the unique temp was unlinked
  });
});
