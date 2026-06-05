# cc-screening Cognitive Support — CRL → CPG-IG Round-Trip Fixture

A locally-checked-in subset of the [demo-content-r4 colorectal-cancer-screening example](https://github.com/cqframework/demo-content-r4) used to validate the CRL → FHIR Definition emit pipeline (Todo 1+2+3 of issue #73).

## Purpose

Round-trip validation: a CRL author's representation of this clinical
example **should** emit a FHIR resource set whose **shape** matches
the IG reference resources in `expected-fhir/`. Differences are
inspected and either:
- accepted as deliberate deviations (e.g. operator's no-`version`
  rule, the Strategy-target-profile spec deviation tracked in memory),
- or surfaced as emit bugs requiring a plan/impl fix.

This is the **first CPG-side round-trip fixture** in this project.
Sibling pattern to `features/cql-pattern-mining/results/models/cms*-split/`
which serves the quality-measures use case (no expected FHIR
checked in there yet).

## File inventory

```
features/cpg-roundtrip/cc-screening-cognitive-support/
├── README.md             ← this file
├── package.json          ← CRL package metadata; sets crl.canonicalBase
│                            to "http://example.org/sdh/demo" to match
│                            the example's URL space
├── cc-screening.crl      ← the CRL author's representation
└── expected-fhir/        ← copied verbatim from demo-content-r4, the
    ├── activitydefinition/ (4)         IG reference resources to
    │  ├── cc-cds-colonoscopy.json      compare against the emit
    │  ├── cc-cds-ct-colonography.json
    │  ├── cc-cds-fecal-immunochemical-test-dna.json
    │  └── cc-cds-flexible-fiberoptic-sigmoidoscopy.json
    ├── library/ (3)
    │  ├── ColorectalCancerCaseFeatures.json
    │  ├── ColorectalCancerConcepts.json
    │  └── ColorectalCancerRecommendation.json
    └── plandefinition/ (7)
       ├── cc-screening-strategy-definition.json       ← Strategy (root)
       ├── cc-screening-decisiontree-definition.json   ← Sub-decision
       ├── cc-screening-no-recommendation-definition.json
       ├── cc-screening-recommendation-definition-colonoscopy.json
       ├── cc-screening-recommendation-definition-ct-colonography.json
       ├── cc-screening-recommendation-definition-fitdna.json
       └── cc-screening-recommendation-definition-sigmoidoscopy.json
```

## Scope of the cognitive-support subset

**In scope:**
- Strategy → Sub-decision → Recommendation → Activity chain (the
  4-tier definitional pattern operator confirmed for CRL emit).

**Intentionally excluded:**
- **Pathway Definition** (`cc-screening-pathway-definition.json`):
  operator scope — CRL starts at Strategy; Pathway is a future lane.
- **Prior Authorization flow** (`cc-pa-*` files): a separate
  use case modeled in a future round-trip fixture.
- **Binary / Device / DocumentReference / Measure / Questionnaire /
  SearchParameter / StructureDefinition**: per operator hint,
  deferred — these tie to evidence attachment, tooling-attribution,
  metrics, dynamic questionnaire generation, and the Homeostasis
  CaseFeature lane respectively.
- **ValueSets**: deferred. The example has many by OID; only the ones
  actually referenced by the cognitive-support cc-screening resources
  would be in scope, and that determination is a future task.

## Deliberate deviations from the example

Captured in memory (`C:\Users\Owner\.claude\projects\d--src-clinical-reasoning-language\memory\`):

- **`feedback_no-version-on-emitted-artifacts`** — CRL emit strips
  `version` from every resource; npm package owns the version. Expect
  to see `version: "0.0.3"` etc. in the expected-fhir/ files (these
  are the example's hand-authored values); CRL emit will produce
  resources without that field. This is a deliberate deviation that
  round-trip validation accepts.

- **`project_strategy-target-profile-spec-deviation`** —
  `cpg-strategydefinition.action.definition[x]` is constrained to
  `canonical(cpg-recommendationdefinition)` per the published spec.
  Both the example AND CRL emit deliberately violate this constraint
  by referencing publishable-only sub-decisions. Operator is working
  to amend the spec.

## Resource correspondence table

| Expected-FHIR resource | CRL representation | Emitted by |
|---|---|---|
| `plandefinition/cc-screening-strategy-definition.json` | `decision "Colorectal Cancer Screening Strategy":` (root) | Todo 3 — Strategy PlanDef |
| `plandefinition/cc-screening-decisiontree-definition.json` | `decision "Colorectal Cancer Screening Decision":` (sub) | Todo 3 — Sub-decision PlanDef |
| `plandefinition/cc-screening-no-recommendation-definition.json` | *(NO CRL representation in v0 — empty body unparseable per `decisionBody : whenBlock+`)* | — |
| `plandefinition/cc-screening-recommendation-definition-<name>.json` (×4) | one per `activity "X":` declaration | Todo 3 — Recommendation PlanDef wrapping each Activity |
| `activitydefinition/cc-cds-<name>.json` (×4) | one per `activity "X":` declaration | Todo 2b — already shipped |
| `library/ColorectalCancerRecommendation.json` | the library's emitted CQL library + ValueSet declarations | Todo 2a — Library shipped + Todo 1 ValueSet shipped |
| `library/ColorectalCancerCaseFeatures.json` | concepts → CaseFeature emit (Homeostasis lane, not Todo 3) | future |
| `library/ColorectalCancerConcepts.json` | concept-level CodeSystem/ValueSet emit (Homeostasis lane) | future |

## How to use

The round-trip test infrastructure lands with Todo 3 impl. The shape:

```ts
// future: src/tests/cpg-roundtrip/cc-screening.test.ts
describe("cc-screening cognitive-support round-trip", () => {
  it("emits the expected FHIR resource set matching the IG example", () => {
    // 1. Load the CRL
    // 2. Load the package.json metadata
    // 3. Emit FHIR via the full pipeline
    // 4. For each expected-fhir/<type>/<file>.json, find the
    //    correspondingly-named emitted resource and compare shape:
    //    - meta.profile claims
    //    - type.coding (PlanDefinition.type)
    //    - action[] structure (count + nesting + definitionCanonical
    //      cross-references)
    //    Surface differences; accept the documented deviations;
    //    fail on unexpected differences.
  });
});
```

## Extending the fixture

To add a new round-trip example (e.g. a new CPG-IG example resource set):

1. Create a sibling directory `features/cpg-roundtrip/<example-name>/`.
2. Copy the IG reference resources verbatim into `expected-fhir/<type>/`.
3. Author the CRL representation in `<example-name>.crl`.
4. Add a `package.json` with the appropriate `crl.canonicalBase`.
5. Write a round-trip test stub mirroring the cc-screening pattern.
