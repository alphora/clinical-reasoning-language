# CRL CQL libraries

CQL libraries the CRL→CQL emitter targets. Each library lives here as
`.cql` source; the build pipeline ships them alongside generated CRL
output so authored CRL has somewhere to compile to.

## `CRLPatterns.cql`

The emitter's primary target. Implements every inference pattern from the
catalog at [`features/cql-pattern-mining/results/inference-pattern-catalog-draft.md`](../features/cql-pattern-mining/results/inference-pattern-catalog-draft.md)
as a CQL function.

**Catalog ↔ library contract.** Each catalog row carries a `CQL function`
column pointing at a function here (e.g. `CRLPatterns.Has`). Every catalog
row MUST have a function defined here; every function here SHOULD trace
back to one catalog row. The catalog parser (extension `src/catalog.ts`)
is the authoritative enumerator — if a row exists there, the function
must exist here.

**Coverage today.** v0.1.0: all 45 main-table patterns + all 5 window-from-anchor
sub-grammar patterns = 50 functions. Several have FIXME comments
where the implementation is a placeholder pending better source-CQL
precedent (most notably `Consecutive`, `Without` per-kind branches, and
`With` over closures).

**Type strategy.** CQL is statically typed and lacks generics. Patterns
that range over heterogeneous FHIR resources have multiple overloads — one
per resource type the corpus uses (Condition, Encounter, Observation,
Procedure, ServiceRequest, MedicationRequest, AllergyIntolerance). The
CRL→CQL emitter picks the right overload at emit time using each
concept's declared `type is X.` from its CRL declaration.

**Dependencies.**
- QICore 6.0.0 (matches the cms69 / cms22 source corpus)
- FHIRHelpers 4.4.000
- QICoreCommon 4.0.000

The helper-library inventory is tracked separately in
[`issues/rough-backlog.md`](../issues/rough-backlog.md) under "identify
helper libraries".

**Validation status.** v0.1.0 has NOT been validated against `cql-to-elm`.
The next step in the CRL→CQL emitter work is to drive a real document
through the emitter and validate the output. Until then, treat
`CRLPatterns.cql` as a draft skeleton — the structure is committed, the
exact CQL idioms will iterate.
