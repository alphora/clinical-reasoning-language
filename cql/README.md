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

### Why FHIR R4 (and not QICore)

The library declares `using FHIR version '4.0.1'`, not `using QICore
version '6.0.0'`. This was a deliberate choice for v0.1, settled during
end-to-end validation against `cqf-fhir-cr-cli`. Three reasons:

1. **No bare `Condition` under QICore.** QICore's ModelInfo splits FHIR's
   `Condition` resource into two profiles, `"ConditionEncounterDiagnosis"`
   and `"ConditionProblemsHealthConcerns"`. There is no bare `Condition`
   type in QICore scope — every type reference must use a quoted profile
   name (`List<"ConditionEncounterDiagnosis">`) or a `Choice` of both.
   Same story for Observation (`"SimpleObservation"`,
   `"USCoreObservationProfile"`, …). A generic patterns library written
   under QICore would have to enumerate the relevant profiles in every
   parameter type — much wider signatures, far more overloads.
2. **Profile erasure goes the right direction.** Every QICore profile
   IS-A FHIR resource. A measure CQL library that loads QICore-profiled
   data can pass it to a function that declares the base FHIR type; the
   types unify by profile erasure. So a single `Has(X List<Condition>)`
   accepts QICore-profiled Condition lists too. The opposite direction
   doesn't work — a QICore-profile parameter rejects plain FHIR inputs.
3. **Source corpus precedent.** The dqm-content-qicore-2025 IG (which
   the CMS69 / CMS22 measures we mined for the catalog are part of)
   actually COMMENTS OUT its QICore dependency in the IG XML manifest:
   "the version of the QICore ModelInfo that is included in the
   translator" is used instead. Even the QICore-styled corpus is run
   with model resolution that doesn't strictly require the QICore IG
   to be loaded as a hard dependency.

If we later need QICore-profile-specific functionality, the migration
path is to keep this FHIR-based library and add a sibling library (e.g.
`CRLPatternsQICore.cql`) that imports it and adds the profile-aware
overloads.

### Dependencies

- FHIR R4 (`using FHIR version '4.0.1'`)
- FHIRHelpers 4.0.1 (for choice-type coercion helpers)

Two helper libraries are vendored alongside `CRLPatterns.cql` in
[`src/`](src/) so the library is self-contained for `cqf-fhir-cr-cli`
validation without needing the corpus repo on the path:

- [`src/FHIRHelpers.cql`](src/FHIRHelpers.cql) — actively used by
  `CRLPatterns.cql` (it's the `include` line in the library header).
  Vendored from `features/cql-pattern-mining/data/cql/dqm-content-qicore-2025/FHIRHelpers.cql`.
- [`src/QICoreCommon.cql`](src/QICoreCommon.cql) — NOT included by
  `CRLPatterns.cql`. v0.1.0 used `QICoreCommon.prevalenceInterval()` and
  `QICoreCommon.toInterval()` on FHIR choice types; v0.1.2 inlined those
  to direct casts like `(C.onset as Period)` and `(O.effective as Period)`
  when we switched to plain FHIR (QICoreCommon's helpers are written
  against QICore-profile inputs, not bare FHIR resources). The file is
  kept here as a reference for any future QICore-mode CQL we author
  in this directory and to document what those helper signatures look
  like (it's worth a read before reimplementing them inline).

A broader helper-library inventory (FHIRHelpers, QICoreCommon, CQMCommon,
Status, TJC, MATGlobalCommonFunctions, etc.) is tracked separately in
[`issues/rough-backlog.md`](../issues/rough-backlog.md) under "identify
helper libraries" — the CRL→CQL emitter will eventually need to know
which helpers it's allowed to draw on and which version of each.

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
