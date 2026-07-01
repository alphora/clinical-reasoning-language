import { describe, expect, it } from "@jest/globals";

import { createHash } from "node:crypto";

import {
  capSlug,
  pascalCaseName,
  pascalCaseNameForId,
  rawSlug,
  slugify,
  uniqueCapSlug,
} from "../slug";

describe("fhir-emitter slug helpers", () => {
  describe("slugify", () => {
    it("basic ASCII names", () => {
      expect(slugify("BP Codes")).toBe("bp-codes");
      expect(slugify("Has History Of")).toBe("has-history-of");
      expect(slugify("CMS22 Asserted")).toBe("cms22-asserted");
    });

    it("collapses hyphen runs + strips leading/trailing", () => {
      expect(slugify("--foo---bar--")).toBe("foo-bar");
      expect(slugify("a  -  b")).toBe("a-b");
    });

    it("strips non-alphanumeric characters", () => {
      expect(slugify("BP/Cholesterol Codes")).toBe("bpcholesterol-codes");
      expect(slugify("HBA1c (Diabetes)")).toBe("hba1c-diabetes");
    });

    it("Δ6 caps at 64 chars and trims trailing hyphens after truncation", () => {
      const long = "a".repeat(50) + " " + "b".repeat(50);
      const s = slugify(long);
      expect(s.length).toBeLessThanOrEqual(64);
      expect(s.endsWith("-")).toBe(false);
    });

    it("Δ6 returns 'unnamed' for input that's empty after strip (non-ASCII)", () => {
      expect(slugify("高血圧")).toBe("unnamed");
      expect(slugify("")).toBe("unnamed");
      expect(slugify("///")).toBe("unnamed");
    });
  });

  describe("pascalCaseName", () => {
    it("basic ASCII names", () => {
      expect(pascalCaseName("BP Codes")).toBe("BPCodes"); // preserves the already-uppercase "BP" token
      expect(pascalCaseName("cms22-asserted")).toBe("Cms22Asserted");
      expect(pascalCaseName("has history of")).toBe("HasHistoryOf");
    });

    it("handles mixed separators (hyphen, underscore, whitespace)", () => {
      expect(pascalCaseName("foo_bar-baz qux")).toBe("FooBarBazQux");
    });

    it("Δ15 caps at 255 chars", () => {
      const long = "token ".repeat(60);
      const out = pascalCaseName(long);
      expect(out.length).toBeLessThanOrEqual(255);
    });

    it("Δ15 returns 'Unnamed' on empty-after-strip", () => {
      expect(pascalCaseName("")).toBe("Unnamed");
      expect(pascalCaseName("高血圧")).toBe("Unnamed");
    });

    it("round-2 (gpt55 C2) prefixes 'X' when leading char isn't [A-Z]", () => {
      expect(pascalCaseName("123 codes")).toBe("X123Codes");
      expect(pascalCaseName("9-lives")).toBe("X9Lives");
      expect(pascalCaseName("Codes")).toBe("Codes");
    });
  });

  describe("capSlug (round-2 gpt55 C1)", () => {
    it("passes through slugs at or under 64 chars unchanged", () => {
      expect(capSlug("foo-bar")).toBe("foo-bar");
    });

    it("truncates slugs over 64 chars and trims trailing hyphens", () => {
      const long = "a".repeat(40) + "-" + "b".repeat(40);
      const capped = capSlug(long);
      expect(capped.length).toBeLessThanOrEqual(64);
      expect(capped.endsWith("-")).toBe(false);
    });

    it("round-2 invariant: combined library+terminology slug stays at or under 64 char FHIR id limit", () => {
      const librarySlug = "a".repeat(64);
      const terminologySlug = "b".repeat(64);
      const combined = capSlug(librarySlug + "-" + terminologySlug);
      expect(combined.length).toBeLessThanOrEqual(64);
    });
  });

  describe("uniqueCapSlug (truncation-collision safety)", () => {
    it("returns an at-or-under-64 raw slug UNCHANGED (no churn)", () => {
      expect(uniqueCapSlug("foo-bar")).toBe("foo-bar");
      const exactly64 = "a".repeat(64);
      expect(uniqueCapSlug(exactly64)).toBe(exactly64);
    });

    it("trips the hash branch at the exact 65-char threshold → 64-char hashed id", () => {
      const raw65 = "a".repeat(65); // smallest input that exceeds the 64 cap
      const out = uniqueCapSlug(raw65);
      const expectedHash = createHash("sha256").update(raw65, "utf8").digest("hex").slice(0, 12);
      expect(out.length).toBe(64);
      expect(out.endsWith(`-${expectedHash}`)).toBe(true);
    });

    it("is self-defensive against a mis-fed (non-rawSlug) input: no leading hyphen, no '--', never empty", () => {
      // A hyphen-leading over-length input a caller should never pass (violates the
      // rawSlug contract) — the internal trim keeps the id well-formed anyway.
      const hyphenLead = "-".repeat(10) + "x".repeat(70);
      const outLead = uniqueCapSlug(hyphenLead);
      expect(outLead.startsWith("-")).toBe(false);
      expect(outLead).not.toContain("--");
      expect(outLead).toMatch(/^[a-z0-9.-]{1,64}$/);

      // Pathological all-hyphen 51-char prefix → the stem trims to empty → bare hash.
      const allHyphenPrefix = "-".repeat(60) + "x".repeat(20);
      const outHash = uniqueCapSlug(allHyphenPrefix);
      const expectedHash = createHash("sha256").update(allHyphenPrefix, "utf8").digest("hex").slice(0, 12);
      expect(outHash).toBe(expectedHash);
      expect(outHash.startsWith("-")).toBe(false);
    });

    it("two raw slugs sharing the first 51 chars but differing after → DISTINCT ids", () => {
      const prefix = "a".repeat(60); // > 64 once each tail is added
      const idX = uniqueCapSlug(prefix + "-xxxxx");
      const idY = uniqueCapSlug(prefix + "-yyyyy");
      expect(idX).not.toBe(idY);
    });

    it("appends the deterministic sha256[0:12] suffix over the FULL raw string", () => {
      const raw = "casefeature-fixture-" + "z".repeat(80);
      const expectedHash = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 12);
      const out = uniqueCapSlug(raw);
      // <stem(51)>-<hash(12)> = 64 chars exactly; ends on the hash.
      expect(out.length).toBe(64);
      expect(out.endsWith(`-${expectedHash}`)).toBe(true);
      expect(out).toMatch(/^[a-z0-9.-]{1,64}$/);
      expect(out.slice(0, out.length - 13).endsWith("-")).toBe(false); // no `--` at the stem/hash boundary
    });

    it("hash is over the FULL raw, not the truncated stem (tail-only difference still separates)", () => {
      // Identical first 60 chars, differ only at char 70 — past the 51-char stem.
      const a = "b".repeat(69) + "-alpha";
      const b = "b".repeat(69) + "-betaa";
      expect(uniqueCapSlug(a)).not.toBe(uniqueCapSlug(b));
    });

    it("is pure — same input → same output", () => {
      const raw = rawSlug("Some Very Long Concept Name " + "x".repeat(60));
      expect(uniqueCapSlug(raw)).toBe(uniqueCapSlug(raw));
    });

    it("does NOT separate lossy-normalization collisions at <=64 (left to the closure backstop)", () => {
      // Two DISTINCT names collapsing to the same <=64 raw slug never hit the >64
      // hash branch, so uniqueCapSlug returns the same id — by design.
      expect(uniqueCapSlug(rawSlug("A/B"))).toBe(uniqueCapSlug(rawSlug("AB")));
    });
  });

  describe("pascalCaseNameForId (#186 — cap-safe PascalCase layered identity S)", () => {
    // FHIR id regex (subset used here) and FHIR name regex (hyphen-free) — S must
    // satisfy BOTH as ONE identical string.
    const ID_CHARS = /^[A-Za-z0-9.]+$/; // no hyphen/underscore on the S path
    const NAME_RE = /^[A-Z][A-Za-z0-9]{0,63}$/; // leading [A-Z], hyphen/underscore-free, <=64

    it("(a) a <=64 pascal is returned UNCHANGED and equals pascalCaseName (no churn)", () => {
      for (const raw of ["cms22-asserted", "example-semand-Interface", "BP Codes"]) {
        const out = pascalCaseNameForId(raw);
        expect(out).toBe(pascalCaseName(raw));
        expect(out.length).toBeLessThanOrEqual(64);
        expect(out).toMatch(NAME_RE);
        expect(out).toMatch(ID_CHARS);
        expect(out).not.toContain("-");
        expect(out).not.toContain("_");
      }
    });

    it("(b) a 65+-char pascal → exactly-64 result matching BOTH the FHIR id AND name regex", () => {
      // 70 word-chars → pascal length 70 (> 64) → hash branch.
      const raw = "a".repeat(70);
      const out = pascalCaseNameForId(raw);
      expect(out.length).toBe(64);
      expect(out).toMatch(ID_CHARS); // legal FHIR id (no hyphen/underscore)
      expect(out).toMatch(NAME_RE); // legal FHIR name (leading [A-Z], hyphen-free)
      // <stem(52)><hash(12)> = the bare-hex, no-separator join.
      const expectedHash = createHash("sha256")
        .update("A" + "a".repeat(69), "utf8") // pascalCaseNameUncapped: leading upper + rest
        .digest("hex")
        .slice(0, 12);
      expect(out.endsWith(expectedHash)).toBe(true);
      expect(out.slice(52)).toBe(expectedHash); // hash abuts the 52-char stem (no separator)
    });

    it("(c) two inputs sharing the first ~52 pascal chars but diverging after → DISTINCT", () => {
      // 60 shared leading chars (> 52 stem) + divergent tails past the cap.
      const base = "z".repeat(60);
      const idX = pascalCaseNameForId(base + " alpha");
      const idY = pascalCaseNameForId(base + " betaa");
      expect(idX).not.toBe(idY);
      // Their 52-char stems are identical; only the hash distinguishes them.
      expect(idX.slice(0, 52)).toBe(idY.slice(0, 52));
      expect(idX.slice(52)).not.toBe(idY.slice(52));
    });

    it("(d) two inputs identical through 255 normalized chars but divergent after → DISTINCT (uncapped-hash fix)", () => {
      // The hardening bug: hashing pascalCaseName (255-capped) collides these.
      // pascalCaseNameForId hashes the UNCAPPED pascal → they separate.
      const shared = "q".repeat(300); // pascal length 300 (> 255)
      const a = pascalCaseNameForId(shared + " x1");
      const b = pascalCaseNameForId(shared + " x2");
      expect(a).not.toBe(b);
      // Sanity: pascalCaseName DOES collapse them (proves the fix is load-bearing).
      expect(pascalCaseName(shared + " x1")).toBe(pascalCaseName(shared + " x2"));
    });

    it("is pure — same input → same output", () => {
      const raw = "Some Very Long Layer Name " + "y".repeat(60);
      expect(pascalCaseNameForId(raw)).toBe(pascalCaseNameForId(raw));
    });
  });
});
