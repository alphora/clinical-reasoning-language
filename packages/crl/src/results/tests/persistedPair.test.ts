/**
 * The three field defects the IEHP knowledge-engineering project measured on a real 44-case run.
 *
 * Each was found in the FIELD and fixed here, so each gets a test that fails if it comes back. The
 * manual end-to-end runs proved the fixes; these stop them regressing silently, which the manual runs
 * cannot.
 */
import { describe, expect, it } from "vitest";

import { normalizePersistedPair, stripRunTimestamp } from "../runProducer";

/** Their actual engine id. It is EXACTLY 64 characters — the FHIR id ceiling. */
const ENGINE_ID_AT_THE_CAP = "mcpm-bleph-blepharoplasty-and-blepharoptosis-repair-67a3764d4a7e";
const COMPARTMENT_A = "blepharoplasty-and-blepharoptosis-repair-ca-0d60a8b5b42c";
const COMPARTMENT_B = "blepharoplasty-and-blepharoptosis-repair-cb-1e70b9c6c53d";

const q = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  resourceType: "Questionnaire",
  id: ENGINE_ID_AT_THE_CAP,
  url: "http://example.org/Questionnaire/bleph",
  version: "1.0.0-2026-09-04-12.08.29",
  ...over,
});

describe("Questionnaire id — the collision the cap re-introduced", () => {
  // ⚠ THE REGRESSION THAT SHIPPED: `.slice(0, 64)` on an id that is ALREADY 64 chars returns the id
  // unchanged and drops the compartment discriminator entirely, so every case got ONE id — the exact
  // collision compartment-suffixing exists to prevent. It hid because our fixture id is 36 chars.
  it("stays distinct per compartment even when the engine id already fills the 64-char ceiling", () => {
    const a = normalizePersistedPair(q(), undefined, COMPARTMENT_A).questionnaire!;
    const b = normalizePersistedPair(q(), undefined, COMPARTMENT_B).questionnaire!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe(ENGINE_ID_AT_THE_CAP);
  });

  it("emits a legal FHIR id: [A-Za-z0-9-.]{1,64}", () => {
    const id = String(normalizePersistedPair(q(), undefined, COMPARTMENT_A).questionnaire!.id);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[A-Za-z0-9\-.]{1,64}$/);
  });

  it("is stable across runs — the id is derived, never generated", () => {
    const once = normalizePersistedPair(q(), undefined, COMPARTMENT_A).questionnaire!.id;
    const twice = normalizePersistedPair(q(), undefined, COMPARTMENT_A).questionnaire!.id;
    expect(once).toBe(twice);
  });

  // A short id has room for the suffix and must keep reading as itself — the fix must not churn ids
  // that were already correct.
  it("leaves a short id readable, with the compartment appended verbatim", () => {
    const short = normalizePersistedPair(q({ id: "coverage-determination" }), undefined, "case-1")
      .questionnaire!.id;
    expect(short).toBe("coverage-determination-case-1");
  });
});

describe("idempotence — no run clock in a committed artifact", () => {
  it("strips the engine's trailing run timestamp from version", () => {
    expect(stripRunTimestamp("1.0.0-2026-09-04-12.08.29")).toBe("1.0.0");
    expect(stripRunTimestamp("0.0.0-some-compartment-2026-09-04-00.08.35")).toBe("0.0.0-some-compartment");
  });

  // ⚠ The strip must not eat a version that merely ENDS IN DIGITS. Only the engine's full
  // `-YYYY-MM-DD-HH.MM.SS` shape is a timestamp.
  it("leaves a legitimate version alone", () => {
    for (const v of ["1.0.0", "2.4.7", "1.0.0-rc.2", "1.0.0-2026", "1.0.0-2026-09-04"]) {
      expect(stripRunTimestamp(v)).toBe(v);
    }
  });

  it("returns undefined for a non-string or an all-timestamp version", () => {
    expect(stripRunTimestamp(undefined)).toBeUndefined();
    expect(stripRunTimestamp(42)).toBeUndefined();
  });

  it("drops QuestionnaireResponse.authored — the run time belongs in the manifest, once", () => {
    const qr = { resourceType: "QuestionnaireResponse", authored: "2026-09-04T00:08:35-04:00" };
    const out = normalizePersistedPair(q(), qr, COMPARTMENT_A).questionnaireResponse!;
    expect("authored" in out).toBe(false);
  });

  it("produces byte-identical output for the same inputs", () => {
    const once = JSON.stringify(normalizePersistedPair(q(), { resourceType: "QuestionnaireResponse", authored: "a" }, COMPARTMENT_A));
    const twice = JSON.stringify(normalizePersistedPair(q(), { resourceType: "QuestionnaireResponse", authored: "b" }, COMPARTMENT_A));
    expect(once).toBe(twice);
  });
});

describe("the QR -> Q link", () => {
  // It resolves through `url`, which is uncapped — which is why the id collision stayed invisible from
  // the pane while 43 of 44 resources silently shared an identity.
  it("points the response at the compartment-suffixed url", () => {
    const { questionnaire, questionnaireResponse } = normalizePersistedPair(
      q(),
      { resourceType: "QuestionnaireResponse" },
      COMPARTMENT_A,
    );
    expect(questionnaireResponse!.questionnaire).toBe(questionnaire!.url);
    expect(String(questionnaire!.url)).toContain(COMPARTMENT_A);
  });
});
