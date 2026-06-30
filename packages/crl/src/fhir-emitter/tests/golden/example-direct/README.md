# example-direct — V1: direct `code is` condition (degenerate, no `defined as`)

Variation of the `example-for-emit` base golden. Demonstrates a decision whose
condition concept has `code is` and **no** `defined as`.

What this variation demonstrates (vs the base):

- **No Inferred library.** Nothing is `defined as`, so there is no
  `example-direct-Inferred.cql`.
- **The Interface re-exports the LocalSource define** (not an Inferred one):
  `define "Qualifying Diagnosis": "example-direct-LocalSource"."Qualifying Diagnosis"`.
- **One PlanDef input** — the condition concept itself, since it is a `code is`
  concept.
- **One case-feature StructureDefinition.** Its `cpg-featureExpression.reference`
  points at the **LocalSource** Library (where the `code is` define lives), not
  the Interface.

The FHIR **Library** wrappers, the **CodeSystem**, the **ActivityDefinitions**,
and the recommendation **PlanDefinitions** mirror the base golden and are omitted
here — only the demonstrative core is materialized (CRL, the four CQL libraries,
the decision PlanDefinition, and the case-feature StructureDefinition).
