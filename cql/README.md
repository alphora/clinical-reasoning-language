# CRL CQL libraries

CQL libraries the CRL→CQL emitter targets. Each library lives here as
`.cql` source under [`cql/src/`](src/); the build pipeline ships them
alongside generated CRL output so authored CRL has somewhere to compile
to.

## `CRLPatterns.cql`

The emitter's primary target. Implements every inference pattern from the
catalog at [`features/cql-pattern-mining/results/inference-pattern-catalog-draft.md`](../features/cql-pattern-mining/results/inference-pattern-catalog-draft.md)
as a CQL function. The catalog is the source of truth; this library is
the emitter's call target.

### Contents

50 pattern functions plus 1 helper (`ToDays`), grouped to mirror the
catalog's category structure:

| Category | Count | Examples |
|---|---|---|
| Classification | 5 | `Has`, `HasHistoryOf`, `Without`, `CurrentlyTaking`, `HasAdverseReactionTo` |
| Contextualization | 8 | `With`, `AsOf`, `Within`, `ComponentOf`, `NotDoneWithReason`, `BaselineAndFollowUp`, `InpatientStay`, `WasOrdered` |
| Assertion | 4 | `Justified`, `Active`, `IsVerified`, `DocumentedAs` |
| Qualification (temporal) | 12 | `MostRecent`, `LastOf`, `Earliest`, `FirstOf`, `During`, `Overlaps`, `OnDayOfOrAfter`, `OnOrBefore`, `SameDay`, `BetweenAnchors`, `AtLeastApart`, `AtMostApart` |
| Window-from-anchor (sub-grammar) | 5 | `BeforeStartOf`, `AfterStartOf`, `BeforeEndOf`, `AfterEndOf`, `OnDayOf` |
| Calculation | 15 | `AgeAt`, `Calculate`, `Lowest`, `Highest`, `AtLeastN`, `Consecutive`, `High`, `Low`, `Normal`, `Abnormal`, `AtLeast`, `AtMost`, `Between`, `Exceeds`, `Below` |
| State / Process Inference | 1 | `WasPerformed` |

Function names match each catalog row's `CQL function` column except for
`LastOf` and `FirstOf` — those are user-defined wrappers that would
shadow the CQL built-in `Last`/`First` if named the same. The catalog
narrative form (`last <X>` / `first <X>`) is unaffected.

### Catalog ↔ library contract

Each catalog row carries a `CQL function` column pointing at a function
here (e.g. `CRLPatterns.Has`). Every catalog row MUST have a function
defined here; every function here SHOULD trace back to one catalog row.
The catalog parser at [`extension/src/catalog.ts`](../extension/src/catalog.ts)
is the authoritative enumerator and a [coverage test](../extension/src/crl-patterns-coverage.test.mjs)
asserts the mapping is complete (50/50 today). A row added to the catalog
without a function here fails the build.

### Type strategy

CQL is statically typed and lacks generics. Patterns that range over
heterogeneous FHIR resources have multiple overloads — one per resource
type the corpus uses (Condition, Encounter, Observation, Procedure,
ServiceRequest, MedicationRequest, AllergyIntolerance). The CRL→CQL
emitter picks the right overload at emit time using each concept's
declared `type is X.` from its CRL declaration.

The library targets `using FHIR version '4.0.1'` (not QICore). QICore's
type system distinguishes profiles like `"ConditionEncounterDiagnosis"`
and `"ConditionProblemsHealthConcerns"` and has no bare `Condition` — for
a generic patterns library that should accept the broadest input, plain
FHIR is the right level. QICore-profiled lists pass through to plain
FHIR signatures via profile erasure.

### Dependencies

- FHIR R4 (`using FHIR version '4.0.1'`)
- FHIRHelpers 4.0.1 (for choice-type coercion helpers)

[`src/FHIRHelpers.cql`](src/FHIRHelpers.cql) and [`src/QICoreCommon.cql`](src/QICoreCommon.cql)
are vendored from `features/cql-pattern-mining/data/cql/dqm-content-qicore-2025/`
to make the library self-contained for validation. QICoreCommon isn't
included by `CRLPatterns.cql` itself; it's shipped here so that any future
QICore-mode CQL we author in this directory has its dependency at hand.

A broader helper-library inventory (FHIRHelpers, QICoreCommon, CQMCommon,
Status, TJC, MATGlobalCommonFunctions, etc.) is tracked separately in
[`issues/rough-backlog.md`](../issues/rough-backlog.md) under "identify
helper libraries".

### Validation status

✅ **v0.1.2 validates end-to-end** against `cqf-fhir-cr-cli` (4.7.0+).

```bash
java -jar tmp/cqf-fhir-cr-cli-4.7.0.jar cql \
  --source-path=cql/src --data-url=cql --terminology-url=cql \
  --library-name=CRLPatterns --fhir-version=R4 \
  --context=Patient --context-value=crlpatterns \
  -e=ToDays
```

The CLI loads, compiles, and evaluates the library cleanly. Validation
covered representative functions across every category in a single
multi-`-e` run.

Known FIXME placeholders pending source-CQL precedent (left as compiling
stubs):

- `Consecutive(events, n)` — currently `Count(events) >= n`; "consecutive"
  semantics need a per-measure temporal-contiguity definition.
- `Without(kind, X)` — currently `not exists` across all kinds; future
  versions will branch per `kind` enum (`record-of` / `documented` /
  `evidence-of` / `result-for`).
- `With(X, Y)` over closures — `Y` is constrained to a Boolean in v0.1
  since CQL has no first-class function-as-argument.

### Versioning

Library version on the `library CRLPatterns version '0.1.0'` line tracks
the CQL declaration; this README's status header tracks the validation
state across edits. Bump the library version when the public function set
changes; bump the catalog draft version when adding a row to the catalog.

## See also

- [Catalog](../features/cql-pattern-mining/results/inference-pattern-catalog-draft.md) — source of truth for narrative form, canonical signature, and CQL function reference.
- [Catalog parser](../extension/src/catalog.ts) — extracts the 50 patterns at extension build time.
- [Coverage test](../extension/src/crl-patterns-coverage.test.mjs) — guards the catalog↔library contract.
- ["What not How" sweep](../features/cql-pattern-mining/cql-to-crl-type-valuetype-rule.md) — design context for why the catalog stays form-only.
