# example-semand — V2: `defined as` with `sem-and` → `intersect`

Variation of the `example-for-emit` base golden. Demonstrates an inferred
concept composed with `sem-and`, contrasting the base's `sem-or`.

What this variation demonstrates (vs the base):

- **Inferred define uses `intersect`** (the base uses `union`):
  `define "A And B": "example-semand-LocalSource"."Diagnosis A" intersect "example-semand-LocalSource"."Diagnosis B"`.
- The **Interface re-exports the Inferred** define (the condition concept has
  `defined as`).
- **Two PlanDef inputs** — one per `code is` leaf (`Diagnosis A`, `Diagnosis B`).
  The inferred concept `A And B` itself has no `code is`, so it gets no input.
- **Two case-feature StructureDefinitions**, one per leaf, each
  `cpg-featureExpression.reference` → the LocalSource Library.

The FHIR **Library** wrappers, the **CodeSystem**, the **ActivityDefinitions**,
and the recommendation **PlanDefinitions** mirror the base golden and are omitted
here — only the demonstrative core is materialized.
