import * as path from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { describe, it, expect } from "vitest";

import { emitFhirDefFromPath } from "../index";

/**
 * ⭐⭐ #189 gap 2 — the case-feature SD's `value[x].binding` IS the dropdown.
 *
 * MEASURED on the real `$apply` path (`PlanDefinitionProcessor` + the questionnaire generator), which is the
 * only thing that could establish it — we do not emit the Questionnaire ourselves:
 *
 * | SD `value[x]`                     | generated item                |
 * |-----------------------------------|-------------------------------|
 * | no binding (the emit before this) | NO options                    |
 * | binding, ANY strength             | one `answerOption` per member |
 *
 * ⭐ STRENGTH IS INVISIBLE to the generator — `required` / `extensible` / `preferred` / `example` produced
 * byte-identical items. We emit `extensible` as a SEMANTIC statement: `value from` names what a user is
 * OFFERED, not what the concept may HOLD. A binding governs FHIR conformance and never evaluation, so
 * claiming `required` would assert an admissibility CRL does not enforce — and would make a source-derived
 * candidate carrying an unoffered code violate the very profile it is stamped with.
 */

const CPT = "http://www.ama-assn.org/go/cpt";

type EmitResult = {
  success: boolean;
  errors?: { kind?: string }[];
  resources?: { resource: Record<string, unknown> }[];
};

/**
 * ⚠ A CASE-FEATURE SD IS ONLY EMITTED FOR A CONCEPT A DECISION CAN REACH. A fixture declaring the concept
 * alone emits NO StructureDefinition, and every assertion here would vacuously find nothing — measured while
 * writing this test. It is the same reachability fact that keeps the goal fixture's re-authoring waiting on
 * gap 3: a CodeableConcept-valued concept cannot itself be a decision guard.
 */
function emitRaw(opts: { terminology: string[]; valueFrom: string | null; conceptType?: string }): EmitResult {
  const rt = opts.conceptType ?? "Observation";
  const dir = mkdtempSync(path.join(tmpdir(), "crl-answer-options-"));
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "ao",
        version: "1.0.0",
        private: true,
        crl: { canonicalBase: "http://example.org/ao" },
      }),
    );
    const file = path.join(dir, "p.crl");
    writeFileSync(
      file,
      [
        "# answer options",
        'library "Ao".',
        "",
        'terminology "Opts":',
        ...opts.terminology,
        "",
        'concept "Requested Service":',
        "- shape is Record.",
        `- type is ${rt}.`,
        "- value type is CodeableConcept.",
        ...(opts.valueFrom !== null ? [`- value from ${opts.valueFrom}.`] : []),
        "- code is `requested-service`.",
        "- definition is most recent this.",
        "- source representation:",
        `  - type is ${rt}.`,
        '  - coded from "Opts".',
        "",
        'concept "Service Was Requested":',
        "- shape is Scalar.",
        "- type is Observation.",
        "- value type is boolean.",
        "- code is `service-was-requested`.",
        '- defined as exists ("Requested Service").',
        "",
        'activity "Approve":',
        "- request CPGCommunicationRequest.",
        "- with `APPROVED`.",
        "",
        'decision "D":',
        "first:",
        '- when "Service Was Requested" then recommend activity "Approve".',
      ].join("\n"),
      "utf-8",
    );
    return emitFhirDefFromPath(file, { date: "2026-01-01" } as never) as EmitResult;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function emit(opts: { terminology: string[]; valueFrom: string | null }): Record<string, unknown>[] {
  const r = emitRaw(opts);
  expect(r.success, JSON.stringify(r.errors ?? [])).toBe(true);
  const resources = (r.resources ?? []).map((w) => w.resource);
  expect(
    resources.some((x) => x.resourceType === "StructureDefinition"),
    "no case-feature SD emitted — the fixture is unreachable and the assertions would be vacuous",
  ).toBe(true);
  return resources;
}

const bindingOf = (resources: Record<string, unknown>[]): Record<string, string> | undefined => {
  const sd = resources.find(
    (x) => x.resourceType === "StructureDefinition" && String(x.id ?? "").includes("requested-service"),
  ) as { differential?: { element?: Record<string, unknown>[] } } | undefined;
  const el = (sd?.differential?.element ?? []).find((e) => String(e.id ?? "").endsWith("value[x]"));
  return el?.binding as Record<string, string> | undefined;
};

const answerValueSetUrl = (resources: Record<string, unknown>[]): string | undefined =>
  resources.find((x) => x.resourceType === "ValueSet" && !String(x.id ?? "").endsWith("-local"))?.url as
    | string
    | undefined;

const INSTANTIATED = ["- system is `" + CPT + "`.", "- code is `37718`.", "- code is `37722`."];

describe("#189 gap 2 — value[x].binding", () => {
  it("⭐⭐ an INSTANTIATED answer set binds the url its ValueSet actually EMITS at", () => {
    const res = emit({ terminology: INSTANTIATED, valueFrom: '"Opts"' });
    const binding = bindingOf(res);
    expect(binding, "a `value from` concept must carry a binding").toBeDefined();
    // ⚠⚠ THE POINT OF THIS ASSERTION. A panel round asserted "bind the DECLARED canonical" as settled, and it
    // is wrong for exactly this case: an instantiated terminology HAS no declared canonical and emits at our
    // slug url. A guessed canonical would dangle for every instantiated set — the only kind that yields a real
    // multi-option dropdown, since a reference stub expands to ONE synthetic code.
    expect(binding!.valueSet).toBe(answerValueSetUrl(res));
    expect(binding!.strength).toBe("extensible");
  });

  it("⭐ a REFERENCE answer set binds its DECLARED canonical — the same url its stub emits at", () => {
    const declared = "http://example.org/external/ValueSet/requestable";
    const res = emit({ terminology: ["- valueset is `" + declared + "`."], valueFrom: '"Opts"' });
    expect(bindingOf(res)!.valueSet).toBe(declared);
    expect(answerValueSetUrl(res)).toBe(declared);
  });

  // ⚠⚠ THE TWO FALLBACK BRANCHES, which the first cut of this file did not separate (gpt-5.6 arm, code
  // review r13). The url rule has THREE outcomes, not two, and only a stubbable pure reference takes the
  // declared canonical. A test covering just "reference" and "instantiated" would pass while the URN and
  // mixed cells silently bound the wrong url.
  it.each([
    ["a URN reference has no stubbable tail", ["- valueset is `urn:example:placeholder`."]],
    [
      "a MIXED body is not a pure reference",
      [
        "- valueset is `http://example.org/external/ValueSet/mixed`.",
        "- system is `" + CPT + "`.",
        "- code is `37718`.",
      ],
    ],
  ])("⭐ %s → binds the SLUG canonical, and binds what the ValueSet emits at", (_label, terminology) => {
    const res = emit({ terminology, valueFrom: '"Opts"' });
    const bound = bindingOf(res)!.valueSet;
    expect(bound).toBe(answerValueSetUrl(res));
    expect(bound.startsWith("http://example.org/ao/ValueSet/"), `expected a slug url, got ${bound}`).toBe(true);
  });

  it("⚠ a concept with NO `value from` carries NO binding — unchanged from before this slice", () => {
    expect(bindingOf(emit({ terminology: INSTANTIATED, valueFrom: null }))).toBeUndefined();
  });

  it("⭐ a SELF-qualified ref is LOCAL, not cross-library", () => {
    // ⚠ MEASURED before the fix (Claude arm, code review r13): testing `isQualifiedRef` on the RAW ref refused
    // `value from "Ao"."Opts"` inside library `Ao` — a form that validates clean and that the sibling
    // `coded from` accepts. Every other terminology consumer normalizes against the current library first.
    expect(bindingOf(emit({ terminology: INSTANTIATED, valueFrom: '"Ao"."Opts"' }))).toBeDefined();
  });

  it("⭐⭐ `value from` with NO ANSWER SLOT is DIAGNOSED, never silently dropped", () => {
    // A `Condition` concept carries its identity ON its coding element (`Condition.code`) and has no distinct
    // `value[x]` carrier, so the binding has nothing to land on. Without this diagnostic the authored line
    // would emit NOTHING and the author would never learn why the dropdown is empty.
    //
    // ⚠ The predicate lives in the SD emitter, which is the one place that KNOWS. An earlier cut predicted it
    // upstream with a weaker test (`valueDatum === undefined`) — two predicates for one fact, free to drift —
    // and the import boundary that forbade reaching the registry from there was right to.
    const r = emitRaw({ terminology: INSTANTIATED, valueFrom: '"Opts"', conceptType: "Condition" });
    expect(r.success).toBe(false);
    expect((r.errors ?? []).map((e) => e.kind)).toContain("emit-value-from-no-answer-slot");
  });
});
