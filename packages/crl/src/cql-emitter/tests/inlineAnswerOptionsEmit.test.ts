import { describe, it, expect } from "vitest";

import { buildCRL } from "../../index";
import { emitCQL } from "../emitCQL";
import { buildInlineAnswerSetMap } from "../../fhir-emitter/inlineAnswerSet";
import { emitPartitioned, FULL_PARTITION } from "../layeredEmit";
import { lowerLocalCodes } from "../lowerLocalCodes";

/**
 * ⭐⭐ #189 — `"X" in qualifying` LOWERING, pinned across the LAYER SPLIT.
 *
 * ⚠⚠ THE LAYER SPLIT IS THE WHOLE POINT OF THIS FILE, and a single-library test would have passed while
 * the emitted package was broken. MEASURED: the concept that DECLARES inline options is a local primitive,
 * while the `in qualifying` predicate over it is an INFERENCE — different emitted libraries. The `valueset`
 * declaration was first written inside `if (terminologies.length > 0)`, and the Inferences layer declares no
 * terminologies of its own, so the block never ran: the layer emitted `… in "…-qualifying"` with NO
 * declaration for it. Emit reported SUCCESS and the library would have failed to TRANSLATE
 * ("Could not resolve identifier"). The enclosing condition was ANTI-CORRELATED with the need.
 *
 * ⚠ The descriptor is built from the RAW ast, BEFORE `lowerLocalCodes`, exactly as production does
 * (`imports/emit.ts`). That is not test scaffolding: the lowering CLEARS `Concept.code`, which these ids key
 * on, so a map built afterwards is EMPTY and every predicate fails to resolve. Building it here the wrong
 * way round would make this test pass against a broken pipeline.
 */
const CB = "http://example.org/crl/test";

const SRC = `library "T".

concept "Patient Complaint":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`patient-complaint\`.
- definition is most recent this.
- value from:
  - \`chronic-blepharitis\` display is \`Chronic blepharitis\`, qualifying.
  - \`none-of-listed\` display is \`None of the listed complaints\`, not qualifying.

concept "Qualifying Patient Complaint Documented":
- shape is Scalar.
- value type is boolean.
- definition is "Patient Complaint" in qualifying.
`;

const emit = () => {
  const built = buildCRL(SRC);
  expect(built.success, "fixture must build").toBe(true);
  // RAW ast → descriptor. See the header: after lowering, `code` is gone.
  const sets = buildInlineAnswerSetMap(built.result!, "t", CB);
  const lowered = lowerLocalCodes(built.result!, { canonicalBase: CB });
  expect(lowered.errors).toEqual([]);
  const res = emitPartitioned(lowered.ast, "T", "t", FULL_PARTITION, {
    canonicalBase: CB,
    localDomainId: "t",
    policyId: "t",
    inlineAnswerSetsByName: sets,
  });
  return { res, sets };
};

describe("#189 inline answer options — CQL lowering across the layer split", () => {
  it("⭐⭐ the layer that EMITS the predicate also DECLARES the value set", () => {
    const { res, sets } = emit();
    expect(res.success).toBe(true);
    const set = sets.get("Patient Complaint")!;
    expect(set, "the descriptor must survive the raw-ast build").toBeDefined();

    // Find whichever layer emitted the predicate, rather than assuming which one that is.
    const user = res.entries.find((e) => String(e.result.result ?? "").includes("in \"" + set.qualifying.id + "\""));
    expect(user, "some layer must emit the predicate").toBeDefined();
    const cql = String(user!.result.result ?? "");

    // THE REGRESSION: the reference without the declaration is what shipped broken.
    expect(cql, "the using layer must declare the value set it binds").toContain(
      `valueset "${set.qualifying.id}":`,
    );
  });

  it("⭐ the CQL url is BYTE-IDENTICAL to the descriptor's ValueSet url", () => {
    // Both lanes read one descriptor; this pins that they cannot drift apart.
    const { res, sets } = emit();
    const set = sets.get("Patient Complaint")!;
    const all = res.entries.map((e) => String(e.result.result ?? "")).join("\n");
    expect(all).toContain(`valueset "${set.qualifying.id}": '${set.qualifying.url}'`);
  });

  it("⚠ the three-state null guard survives the subset comparand", () => {
    // A membership predicate must return null for an unanswered question, never false — the whole #189
    // point. The guard is shared with terminology membership; this pins that the subset path did not
    // reimplement it and drop the null arm.
    const { res } = emit();
    const all = res.entries.map((e) => String(e.result.result ?? "")).join("\n");
    expect(all).toMatch(/is null or not exists \(.*\.coding\) then null/);
  });

  it("⚠⚠ a generated `valueset` name that collides with an AUTHORED declaration is an ERROR", () => {
    // MEASURED before this check: two `valueset` decls with the SAME CQL identifier and DIFFERENT urls, under
    // `success: true`. The library then fails to translate, or binds whichever the engine picks.
    //
    // ⚠ The FHIR side is covered elsewhere and was verified separately: an id clash between a generated
    // ValueSet and an authored one is already a hard `closure-resource-url-collision` from the closure
    // invariants. THIS is the half those invariants cannot see — a CQL identifier is not a resource url.
    const src = `library "Cp2".

terminology "cp2-q-answer-options-qualifying":
- system is \`http://example.org/x\`.
- code is \`z\`.

concept "Q":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`q\`.
- definition is most recent this.
- value from:
  - \`a\` display is \`A\`, qualifying.
  - \`b\` display is \`B\`, not qualifying.

concept "D":
- shape is Scalar.
- value type is boolean.
- definition is "Q" in qualifying.
`;
    const r = emitCQL(src, {
      canonicalBase: "http://example.org/cp2",
      localDomainId: "cp2",
      policyId: "cp2",
    }) as unknown as { success: boolean; errors?: { kind?: string }[] };
    expect(r.success, "a colliding identifier must not emit clean").toBe(false);
    expect((r.errors ?? []).map((e) => e.kind)).toContain("emit-inline-answer-valueset-name-collision");
  });

  it("⚠ the comparand is the QUALIFYING set, not the all-options set", () => {
    // Binding all-options here would make every offered answer — including "none of the listed" — a member,
    // so the predicate could never be false.
    const { res, sets } = emit();
    const set = sets.get("Patient Complaint")!;
    const all = res.entries.map((e) => String(e.result.result ?? "")).join("\n");
    expect(all).toContain(`in "${set.qualifying.id}"`);
    expect(all, "the all-options set is the questionnaire binding, not the predicate").not.toContain(
      `in "${set.allOptions.id}"`,
    );
  });
});
