import { describe, expect, it } from "@jest/globals";

import { capSlug, pascalCaseName, slugify } from "../slug";

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
      expect(pascalCaseName("BP Codes")).toBe("BpCodes");
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
});
