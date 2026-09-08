import { describe, expect, it } from "vitest";

import { compareFhirTemporal } from "../../cel/temporal";
import { selectPublicationCandidate, type PublicationCandidate } from "../publicationSelection";
import { comparePublicationValidity } from "../publicationTemporal";

import { publicationTemporalVectors } from "./publicationTemporalVectors";

describe("publication-only temporal bounds", () => {
  // @kit publication-selection:temporal-bounds
  it.each(publicationTemporalVectors)("%s", (_name, calendar, instant, expected) => {
    expect(comparePublicationValidity(calendar, instant)).toBe(expected);
    expect(comparePublicationValidity(instant, calendar)).toBe(
      expected === "before" ? "after" : expected === "after" ? "before" : expected,
    );
    expect(compareFhirTemporal(calendar, instant)).toBe("indeterminate");
  });

  it.each(["2026-02-30", "2026-04-31", "0000", "2026-01-01T00:00:00", "2026\n"])(
    "keeps invalid values invalid: %j",
    (invalid) => expect(comparePublicationValidity(invalid, "2026-09-06T11:00:00Z")).toBe("invalid"),
  );

  it("selects the actual newer Bleph answer without changing resource or validity, in both orders", () => {
    const rows: PublicationCandidate<Record<string, unknown>>[] = [
      { key: "old", contributorId: "local", arm: "local", retrievedInputIdentity: "old", validity: "2026-01-01", resource: { id: "old", valueBoolean: true } },
      { key: "answer", contributorId: "local", arm: "local", retrievedInputIdentity: "answer", validity: "2026-09-06T10:58:56-04:00", resource: { id: "answer", valueBoolean: false, effectiveDateTime: "2026-09-06T10:58:56-04:00" } },
    ];
    const before = JSON.stringify(rows);
    for (const input of [rows, [...rows].reverse()]) {
      const selected = selectPublicationCandidate(input, { conceptId: "bleph-answer", equalTime: "error" });
      expect(selected.state).toBe("selected");
      if (selected.state === "selected") expect(selected.candidate).toBe(rows[1]);
    }
    expect(JSON.stringify(rows)).toBe(before);
  });
});
