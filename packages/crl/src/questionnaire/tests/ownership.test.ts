import { describe, it, expect } from "vitest";

import {
  PRODUCER_ID_MARKER,
  questionnaireArtifactId,
  celResourceId,
  isProducerOwnedId,
} from "../../index";

/**
 * ⭐⭐ OWNERSHIP MUST BE DECIDABLE, because two writers share one directory.
 *
 * `QuestionnaireResponse` is in the emitter's `SUBJECT_RESOURCES`, so a CEL fact can legitimately emit a
 * QR into `<compartment>/questionnaireresponse/` — exactly where the questionnaire producer writes. A
 * producer that prunes "its own" output by directory, or a pane that binds the first file it finds, will
 * therefore reach authored case data. The ONLY safe basis is an id-level test.
 *
 * ⚠ THE REJECTED DESIGN, recorded so it is not re-proposed: "use `celResourceId` with a reserved fact-name
 * token". Every component of that id goes through `rawSlug`, whose image is precisely the set of slugs an
 * AUTHORED name can reach — so for any reserved token there exists a fact name colliding with it, and
 * ownership is undecidable. The property below is what makes the marker sound instead.
 */
describe("producer ownership is decidable against every emitter id", () => {
  it("⭐ NO emitter id can contain the marker — `rawSlug` collapses hyphen runs", () => {
    // Names chosen to ATTACK the marker: embedded double hyphens, the literal marker as a name, symbols
    // that could survive as hyphens, and the arrow suffix real case names carry.
    const hostile = [
      "q--questionnaire",
      "q -- questionnaire",
      "already--doubled",
      "a -> b",
      "certify.Approve",
      "Case A!",
      "  leading and trailing  ",
      "q__questionnaire",
      "q\u2014questionnaire", // em dash
    ];
    for (const lib of hostile) {
      for (const c of hostile) {
        for (const f of hostile) {
          const id = celResourceId(lib, c, f);
          expect(id).not.toContain("--");
          expect(isProducerOwnedId(id)).toBe(false);
        }
      }
    }
  });

  it("⭐ every producer id IS owned, and stays within the FHIR id cap", () => {
    for (const kind of ["questionnaire", "questionnaireresponse"] as const) {
      const id = questionnaireArtifactId(
        "A Deliberately Very Long Clinical Reasoning Library Name For Capping",
        "a deliberately very long authored case name -> unmet (ordered precedence)",
        kind,
      );
      expect(isProducerOwnedId(id)).toBe(true);
      expect(id.startsWith(PRODUCER_ID_MARKER)).toBe(true);
      expect(id.length).toBeLessThanOrEqual(64); // FHIR id regex
      expect(/^[A-Za-z0-9\-.]{1,64}$/.test(id)).toBe(true);
    }
  });

  it("⚠ the marker is a PREFIX, so the cap cannot truncate it away", () => {
    // `uniqueCapSlug` truncates the TAIL. A suffix marker would be sliced off exactly on the long names
    // that need disambiguating most — i.e. it would fail silently, on the hard cases only.
    const id = questionnaireArtifactId("x".repeat(200), "y".repeat(200), "questionnaire");
    expect(id.startsWith(PRODUCER_ID_MARKER)).toBe(true);
    expect(isProducerOwnedId(id)).toBe(true);
  });

  it("⭐ the two kinds do not collide for one case", () => {
    const q = questionnaireArtifactId("Lib", "case one", "questionnaire");
    const qr = questionnaireArtifactId("Lib", "case one", "questionnaireresponse");
    expect(q).not.toBe(qr);
  });

  it("⭐ producer ids are DETERMINISTIC — a re-run overwrites, never accumulates", () => {
    const a = questionnaireArtifactId("Lib", "case one", "questionnaire");
    const b = questionnaireArtifactId("Lib", "case one", "questionnaire");
    expect(a).toBe(b);
  });
});
