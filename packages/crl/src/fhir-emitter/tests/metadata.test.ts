import { describe, expect, it } from "@jest/globals";

import { normalizePackageMetadata, readPackageMetadata } from "../metadata";

const COMPLETE_PKG = {
  name: "cms22-demo",
  version: "1.0.0",
  description: "CMS22 Blood Pressure Control demonstration corpus",
  author: "Smile Digital Health <ops@smiledigitalhealth.com> (https://smiledigitalhealth.com)",
  crl: {
    canonicalBase: "http://hl7.org/fhir/us/cqfmeasures/crl/cms22",
    status: "draft",
    experimental: true,
    jurisdiction: [],
    useContext: [],
  },
};

describe("fhir-emitter metadata.normalizePackageMetadata", () => {
  it("returns a complete CpgMetadata for a fully-populated package.json", () => {
    const r = normalizePackageMetadata(COMPLETE_PKG);
    expect(r.metadata).not.toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.metadata!.version).toBe("1.0.0");
    expect(r.metadata!.canonicalBase).toBe("http://hl7.org/fhir/us/cqfmeasures/crl/cms22");
    expect(r.metadata!.publisher).toBe("Smile Digital Health");
    expect(r.metadata!.contact).toEqual([
      { system: "email", value: "ops@smiledigitalhealth.com" },
      { system: "url", value: "https://smiledigitalhealth.com" },
    ]);
    expect(r.metadata!.status).toBe("draft");
    expect(r.metadata!.experimental).toBe(true);
    expect(r.metadata!.jurisdiction).toEqual([]);
    expect(r.metadata!.useContext).toEqual([]);
  });

  it("missing `version` is a hard error (CRMI requires version on emitted FHIR)", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "missing-package-version")).toBe(true);
  });

  it("R1 — missing `name` is a hard error (name is the policy id / FHIR id base)", () => {
    const r = normalizePackageMetadata({
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "missing-package-name")).toBe(true);
  });

  it("R1 — empty/whitespace `name` is a hard error", () => {
    const r = normalizePackageMetadata({
      name: "   ",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "missing-package-name")).toBe(true);
  });

  it("R1 — a non-slug-clean `name` (uppercase) is a hard error (lossy slug)", () => {
    const r = normalizePackageMetadata({
      name: "My_Policy@scope",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "lossy-package-name-slug")).toBe(true);
  });

  it.each([
    ["@acme/policy", "scoped npm name (@ + /)"],
    ["foo.bar", "dotted name"],
    ["MyPolicy", "pure-uppercase camelCase"],
  ])(
    "R1 — a lossy-slug `name` %p (%s) is a hard error (lossy-package-name-slug)",
    (name) => {
      const r = normalizePackageMetadata({
        name,
        version: "1.0.0",
        crl: { canonicalBase: "http://example.org/x" },
      });
      expect(r.metadata).toBeNull();
      expect(r.errors.some((e) => e.kind === "lossy-package-name-slug")).toBe(true);
    },
  );

  it("F6 — an over-long policy-id slug (> 64 chars) is a hard error (oversized-package-name-slug)", () => {
    // The CQL lane names layer libraries from the RAW name while the FHIR lane
    // caps policyIdBase to 64; a slug-clean name whose slug exceeds 64 chars would
    // drift the two lanes' ids. 65 slug-clean chars → rejected.
    const longName = "a".repeat(65); // slug-clean (lowercase ascii), 65 chars
    const r = normalizePackageMetadata({
      name: longName,
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "oversized-package-name-slug")).toBe(true);
  });

  it("F6 — a slug-clean name at exactly 64 chars is accepted (boundary)", () => {
    const name64 = "a".repeat(64); // exactly the FHIR id limit
    const r = normalizePackageMetadata({
      name: name64,
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).not.toBeNull();
    expect(r.errors.some((e) => e.kind === "oversized-package-name-slug")).toBe(false);
  });

  it("R1 — a slug-clean `name` is accepted and flows to metadata.name", () => {
    const r = normalizePackageMetadata({
      name: "rx501-145-medical-policy",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).not.toBeNull();
    expect(r.metadata!.name).toBe("rx501-145-medical-policy");
    expect(r.errors).toEqual([]);
  });

  it("defaults missing author, status, experimental, jurisdiction, useContext", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata).not.toBeNull();
    expect(r.metadata!.version).toBe("1.0.0");
    expect(r.metadata!.publisher).toBe("unknown");
    expect(r.metadata!.contact).toEqual([]);
    expect(r.metadata!.status).toBe("draft");
    expect(r.metadata!.experimental).toBe(true);
    expect(r.metadata!.jurisdiction).toEqual([]);
    expect(r.metadata!.useContext).toEqual([]);
  });

  it("title is empty when description is empty (emitter defaults to library name)", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata!.title).toBe("");
    expect(r.metadata!.description).toBe("");
  });

  it("title is the first line of description when description is multiline", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      description: "Short title\n\nLonger description on a separate line.",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata!.title).toBe("Short title");
    expect(r.metadata!.description).toBe("Short title\n\nLonger description on a separate line.");
  });

  it("Δ3 — missing crl.canonicalBase → error envelope, metadata null", () => {
    const r = normalizePackageMetadata({ name: "foo", version: "1.0.0" });
    expect(r.metadata).toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.kind).toBe("missing-canonical-url-base");
  });

  it("author-as-object form", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      author: { name: "Smile", email: "a@b.com", url: "https://b.com" },
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata!.publisher).toBe("Smile");
    expect(r.metadata!.contact).toEqual([
      { system: "email", value: "a@b.com" },
      { system: "url", value: "https://b.com" },
    ]);
  });

  it("Δ12 — malformed crl.useContext (not an array) → error", () => {
    const r = normalizePackageMetadata({
      crl: {
        canonicalBase: "http://example.org/x",
        useContext: "not-an-array",
      },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "malformed-crl-metadata")).toBe(true);
  });

  it("Δ12 — malformed crl.useContext entry shape → error", () => {
    const r = normalizePackageMetadata({
      crl: {
        canonicalBase: "http://example.org/x",
        useContext: [{ code: "wrong-shape" }],
      },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "malformed-crl-metadata")).toBe(true);
  });

  it("Δ12 — malformed crl.jurisdiction (not an array) → error", () => {
    const r = normalizePackageMetadata({
      crl: { canonicalBase: "http://example.org/x", jurisdiction: 42 },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "malformed-crl-metadata")).toBe(true);
  });

  it("Δ12 — rejects unknown crl.status value", () => {
    const r = normalizePackageMetadata({
      crl: { canonicalBase: "http://example.org/x", status: "bogus" },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "malformed-crl-metadata")).toBe(true);
  });

  it("non-object package.json → error envelope", () => {
    const r = normalizePackageMetadata(42);
    expect(r.metadata).toBeNull();
    expect(r.errors[0]!.kind).toBe("unreadable-package-json");
  });

  it("round-2 (gpt55 important #4) strips trailing slash from canonicalBase", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/base/" },
    });
    expect(r.metadata!.canonicalBase).toBe("http://example.org/base");
  });

  it("round-2 (gpt55 important #4) collapses multiple trailing slashes", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      crl: { canonicalBase: "http://example.org/base///" },
    });
    expect(r.metadata!.canonicalBase).toBe("http://example.org/base");
  });

  it("round-2 (gpt55 important #6) parses email-only author '<email>'", () => {
    const r = normalizePackageMetadata({
      name: "foo",
      version: "1.0.0",
      author: "<ops@example.org>",
      crl: { canonicalBase: "http://example.org/x" },
    });
    expect(r.metadata!.publisher).toBe("unknown");
    expect(r.metadata!.contact).toContainEqual({ system: "email", value: "ops@example.org" });
  });

  it("round-2 (gpt55 important #7) validates jurisdiction inner coding shape", () => {
    const r = normalizePackageMetadata({
      crl: {
        canonicalBase: "http://example.org/x",
        jurisdiction: [{ coding: [{ system: "x" }] }], // missing `code`
      },
    });
    expect(r.metadata).toBeNull();
    expect(r.errors.some((e) => e.kind === "malformed-crl-metadata")).toBe(true);
  });
});

describe("fhir-emitter metadata.readPackageMetadata (filesystem)", () => {
  it("Δ14 — unreadable path returns error envelope (does NOT throw)", () => {
    const r = readPackageMetadata("/no/such/path/that/exists");
    expect(r.metadata).toBeNull();
    expect(r.errors[0]!.kind).toBe("unreadable-package-json");
  });

  it("reads the cms22 corpus package.json end-to-end", () => {
    const corpus = require("path").resolve(
      __dirname,
      "..",
      "..",
      "tests",
      "fixtures",
      "corpus",
      "cms22",
    );
    const r = readPackageMetadata(corpus);
    expect(r.metadata).not.toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.metadata!.canonicalBase).toBe("http://hl7.org/fhir/us/cqfmeasures/crl/cms22");
    expect(r.metadata!.publisher).toBe("Smile Digital Health");
  });
});
