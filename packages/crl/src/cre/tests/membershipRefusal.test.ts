import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../run";

/**
 * ⭐⭐ #189 gap 3 T5b — THE CRE EVALUATES MEMBERSHIP, and refuses exactly one cell.
 *
 * ⚠ THIS FILE USED TO PIN A BLANKET REFUSAL (T5a). It was INVERTED rather than deleted when the evaluation
 * landed, because a fixture that only ever says "not yet" stops being evidence the moment it goes stale —
 * and its one case (a covered request) was precisely a cell T5b now decides. A panel round predicted this
 * exact migration; without it the slice would have landed with a red pinned test and an ad-hoc edit.
 *
 * ⭐ NEWEST WINS, BY DATE (operator, 2026-09-02). Before this the CRE read a fact date NOWHERE — `date is`
 * reached only the FHIR writer — so disagreement could only be REFUSED, which is why the goal's
 * "request covered but newer answer says no" row was pinned permanently owed. A strictly-ordered date
 * comparison is as MECHANICAL as the membership check itself: no runtime, no resolution.
 *
 * ⚠ The emitted `id` tie-break is deliberately NOT replicated, so an exact-date disagreement still refuses.
 * That is the last cell, and it is pinned below — picking by insertion order there would be a fabricated
 * verdict in the lane whose whole job is checking the other one.
 */
const CASES = path.resolve(__dirname, "fixtures/membership-refusal/cases.cel");

type Run = { case?: string; status?: string; produced?: { recommendation?: string }[]; diagnostics?: (string | { message?: string })[] };

const runs = (): Run[] => (runCel(resolveCelImports(CASES) as never) as unknown as { runs?: Run[] }).runs ?? [];
const byCase = (name: string): Run => {
  const r = runs().find((x) => x.case === name);
  expect(r, `case "${name}" did not run`).toBeDefined();
  return r!;
};

describe("#189 gap 3 T5b — the CRE evaluates membership", () => {
  it("⭐ a covered request APPROVES — mechanical membership against the emitted set", () => {
    const r = byCase("covered service -> approve");
    expect(r.status).toBe("pass");
    expect((r.produced ?? []).map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  it("⭐⭐ a NEWER answer overrides an OLDER covered request — the row that was pinned permanently owed", () => {
    // This is the goal's "request covered but newer answer says no -> deny" shape. It was `error` because
    // "picking the newest needs the emitted date+id sort the CRE deliberately does not replicate" — a rule
    // written for the boolean-conflict case and inherited as "the CRE can never pick newest". The `id` is
    // only needed for TIES; CEL facts carry `date is` on the page.
    const r = byCase("newer answer overrides an older covered request -> deny");
    expect(r.status).toBe("pass");
    expect((r.produced ?? []).map((p) => p.recommendation)).toEqual(["Deny"]);
  });

  it("⭐⭐ SAME-DATE disagreement still REFUSES — it must never guess", () => {
    // The one cell left. `produced: []` is the load-bearing assertion: it separates "refused" from "guessed".
    // Picking by insertion order here would be a wrong answer wearing the CRE's authority.
    const r = byCase("same-date disagreement -> refused");
    expect(r.status).toBe("error");
    expect(r.produced ?? [], "the CRE must not produce a branch it did not compute").toEqual([]);
    const msg = (r.diagnostics ?? []).map((d) => (typeof d === "string" ? d : (d.message ?? ""))).join(" | ");
    expect(msg, "the refusal must say the tie-break is the emitted record id").toContain("emitted record id");
  });
});
