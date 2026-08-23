import { buildCRL } from "../../index";
import { emitsScalarValue, sameLayerResolver, uniformResolvers } from "../totalScalarBoolean";
import type { CRL, Concept } from "../../ast/types";

// #189 B3 — unit tests for the `emitsScalarValue` classifier (the lowered-emitted-result discriminant the crl-emit
// panel required, disc 500). A scalar-VALUE operand of `defined as exists ("X")` lowers to `("X" is not null)`; a
// RECORDS operand (a `coded from` Scalar-declared concept — the `Overweight Diagnoses` trap — or a RecordSet) stays
// `exists(<X>)`. INERT: no emittable corpus concept is a scalar-value operand today (all are gated / RecordSet).

function parse(body: string): CRL {
  const r = buildCRL('# fixture\nlibrary "Fixture".\n\n' + body);
  if (!r.success || !r.result) throw new Error("parse failed: " + JSON.stringify(r.errors));
  return r.result;
}
function conceptsOf(crl: CRL): Map<string, Concept> {
  const m = new Map<string, Concept>();
  for (const s of crl.statements) if (s.type === "Concept" && s.name) m.set(s.name, s);
  return m;
}
const resolverFor = (m: Map<string, Concept>) => uniformResolvers(sameLayerResolver((name: string) => m.get(name)));
const sv = (body: string, name: string): boolean => {
  const m = conceptsOf(parse(body));
  return emitsScalarValue(m.get(name), resolverFor(m));
};

describe("emitsScalarValue — #189 B3 lowered-result classifier", () => {
  it("a Scalar<CodeableConcept> `most recent this` value read → scalar-value (the B2 merge / device value concept)", () => {
    expect(
      sv(
        `concept "Device Value":
- type is Observation.
- value type is CodeableConcept.
- code is \`dv\`.
- definition is most recent this.
`,
        "Device Value",
      ),
    ).toBe(true);
  });

  it("a Scalar<Quantity> `most recent this` → scalar-value (any non-boolean scalar value)", () => {
    expect(
      sv(
        `concept "Latest Weight":
- type is Observation.
- value type is Quantity.
- code is \`lw\`.
- definition is most recent this.
`,
        "Latest Weight",
      ),
    ).toBe(true);
  });

  it("a `coded from` Scalar<CodeableConcept> → NOT scalar-value (it EMITS a retrieve — the `Overweight Diagnoses` trap)", () => {
    expect(
      sv(
        `terminology "VS":
- valueset is \`http://example.org/vs\`.

concept "Overweight Diagnoses":
- type is Condition.
- value type is CodeableConcept.
- coded from "VS".
`,
        "Overweight Diagnoses",
      ),
    ).toBe(false);
  });

  it("a Scalar<boolean> `most recent this` → NOT scalar-value (a boolean is a total-scalar-boolean, not a value)", () => {
    expect(
      sv(
        `concept "Bool Latest":
- type is Observation.
- value type is boolean.
- code is \`bl\`.
- definition is most recent this.
`,
        "Bool Latest",
      ),
    ).toBe(false);
  });

  it("a RecordSet concept → NOT scalar-value (publishes records)", () => {
    expect(
      sv(
        `concept "Recs":
- type is Observation.
- shape is RecordSet.
- code is \`recs\`.
`,
        "Recs",
      ),
    ).toBe(false);
  });

  it("an `exists this` boolean → NOT scalar-value", () => {
    expect(
      sv(
        `concept "Has It":
- type is Condition.
- value type is boolean.
- code is \`hi\`.
- definition is exists this.
`,
        "Has It",
      ),
    ).toBe(false);
  });

  it("a same-layer bare-ref alias to a scalar-value concept → scalar-value (recurse)", () => {
    expect(
      sv(
        `concept "Device Value":
- type is Observation.
- value type is CodeableConcept.
- code is \`dv\`.
- definition is most recent this.

concept "Device Alias":
- value type is CodeableConcept.
- defined as "Device Value".
`,
        "Device Alias",
      ),
    ).toBe(true);
  });

  it("undefined operand → false (fail-closed)", () => {
    const m = conceptsOf(parse(`concept "X":\n- type is Condition.\n- value type is boolean.\n- code is \`x\`.\n- definition is exists this.\n`));
    expect(emitsScalarValue(undefined, resolverFor(m))).toBe(false);
  });
});
