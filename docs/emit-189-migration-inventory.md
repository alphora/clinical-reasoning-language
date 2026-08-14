# #189 emit-flip — migration inventory (this repo)

Generated flip-safety inventory: every buildable in-repo site the #189 emit flip (design of record `docs/emit-consistency-189-design.md` §9 step 4) turns from a validation WARNING into a hard ERROR. This is the enumeration that keeps the flip from breaking anything silently. The census walks the WHOLE repo, skipping the `node_modules/ dist/ build/ tmp/ .git/ coverage/` directories and any hidden (dot-prefixed) directory; build-failed and excluded files are accounted for in their own sections below. Production content lives in separate repos and is each content KE's responsibility (see the external-content section).

> **This is a generated artifact — do not hand-edit.** Re-run the scanner to refresh it.
>
> - Command: `npx ts-node packages/crl/scripts/run-migration-inventory.ts --write`
> - Commit: `2c83633`
> - Census root: `.`

## Scan integrity

✅ **Clean.** Closed-set equation holds; no dead exclusion rule; reconciliation passed.

- Reconciliation (oracle ↔ authoritative single-file validator, `no-bare-scalar-code`): ✅ agree

## Closed-set accounting

`discovered = included ∪ excluded ∪ build-failed` (pairwise-disjoint; every `.crl` under the census root).

| Category | Files |
| --- | ---: |
| **discovered** | 169 |
| included — canonical-content | 0 |
| included — corpus | 10 |
| included — example-harness | 2 |
| included — golden-source | 5 |
| included — clean-fixture | 84 |
| **included (total)** | 101 |
| excluded (manifest) | 64 |
| build-failed | 4 |

**Build-failed files** (lex/parse/build failure — no current emit for the flip to break, but listed so a reader can confirm each is intentional; fix or manifest-exclude with a reason):

- `packages/crl/src/tests/emitter/fixtures/small.crl` — ParserError: Syntax error: mismatched input 'terminology' expecting 'library'
- `packages/crl/src/tests/regression/testdata/IMMZ_All_Decisions.crl` — ParserError: Syntax error: mismatched input 'decision' expecting 'library'
- `packages/crl/src/tests/regression/testdata/regression-transformer-actual.crl` — LexicalError: Invalid token: The
- `packages/crl/src/tests/regression/testdata/regression-transformer-expected.crl` — LexicalError: Invalid token: CPGMedicationRequest

## Migration targets — bare scalar `code is` (`no-bare-scalar-code`)

66 concept(s). Each publishes its raw local code as a boolean existence today; the flip requires an explicit reduction (design §3). Migration class is the rule's own suggested action, conditioned on value type then representation count. A single-rep `value-read` row may carry a **blocker** when `most recent this` is not mechanically applicable — the effective resource's value element is valueless (e.g. Condition) or does not admit the value type (design §8). A missing `type is` is NOT a blocker (it defaults to Observation).

### Golden source

_CRL whose EMIT is pinned by a golden. A golden pinning OLD bare-code emit is REGENERATED at the flip, not hand-migrated — see each row's migration note._

- **`Implanted Estradiol Pellets`** — `packages/crl/src/fhir-emitter/tests/golden/example-bothrep/src/crl/example-bothrep.crl:7` · lib `Both Representation` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Implanted Estrogen Or Estradiol Pellets` (`packages/crl/src/fhir-emitter/tests/golden/example-bothrep/src/crl/example-bothrep.crl:15`, as "Implanted Estradiol Pellets")
- **`Implanted Estrogen Pellets`** — `packages/crl/src/fhir-emitter/tests/golden/example-bothrep/src/crl/example-bothrep.crl:3` · lib `Both Representation` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Implanted Estrogen Or Estradiol Pellets` (`packages/crl/src/fhir-emitter/tests/golden/example-bothrep/src/crl/example-bothrep.crl:15`, as "Implanted Estrogen Pellets")
- **`Qualifying Diagnosis`** — `packages/crl/src/fhir-emitter/tests/golden/example-direct/src/crl/example-direct.crl:3` · lib `Direct Code Is` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Qualifying Diagnosis Coverage Determination` (`packages/crl/src/fhir-emitter/tests/golden/example-direct/src/crl/example-direct.crl:11`, as "Qualifying Diagnosis")
- **`Implanted Estradiol Pellets`** — `packages/crl/src/fhir-emitter/tests/golden/example-for-emit/src/crl/example-for-emit.crl:7` · lib `Example For Emit` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Implanted Estrogen Or Estradiol Pellets` (`packages/crl/src/fhir-emitter/tests/golden/example-for-emit/src/crl/example-for-emit.crl:13`, as "Implanted Estradiol Pellets")
- **`Implanted Estrogen Pellets`** — `packages/crl/src/fhir-emitter/tests/golden/example-for-emit/src/crl/example-for-emit.crl:3` · lib `Example For Emit` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Implanted Estrogen Or Estradiol Pellets` (`packages/crl/src/fhir-emitter/tests/golden/example-for-emit/src/crl/example-for-emit.crl:13`, as "Implanted Estrogen Pellets")
- **`Diagnosis A`** — `packages/crl/src/fhir-emitter/tests/golden/example-nested/src/crl/example-nested.crl:3` · lib `Nested Defined As` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `A And B` (`packages/crl/src/fhir-emitter/tests/golden/example-nested/src/crl/example-nested.crl:17`, as "Diagnosis A")
- **`Diagnosis B`** — `packages/crl/src/fhir-emitter/tests/golden/example-nested/src/crl/example-nested.crl:7` · lib `Nested Defined As` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `A And B` (`packages/crl/src/fhir-emitter/tests/golden/example-nested/src/crl/example-nested.crl:17`, as "Diagnosis B")
- **`Diagnosis C`** — `packages/crl/src/fhir-emitter/tests/golden/example-nested/src/crl/example-nested.crl:11` · lib `Nested Defined As` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Top` (`packages/crl/src/fhir-emitter/tests/golden/example-nested/src/crl/example-nested.crl:20`, as "Diagnosis C")
- **`Diagnosis A`** — `packages/crl/src/fhir-emitter/tests/golden/example-semand/src/crl/example-semand.crl:3` · lib `Sem And Intersect` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `A And B` (`packages/crl/src/fhir-emitter/tests/golden/example-semand/src/crl/example-semand.crl:13`, as "Diagnosis A")
- **`Diagnosis B`** — `packages/crl/src/fhir-emitter/tests/golden/example-semand/src/crl/example-semand.crl:7` · lib `Sem And Intersect` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `A And B` (`packages/crl/src/fhir-emitter/tests/golden/example-semand/src/crl/example-semand.crl:13`, as "Diagnosis B")

### Clean fixtures

_Valid test fixtures (validator/imports/emitter) that carry migration targets._

- **`Active Crohns Disease`** — `packages/crl/src/cql-emitter/tests/fixtures/code-is-basic/code-is-basic.crl:24` · lib `Code Is Basic` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Adult With Crohns` (`packages/crl/src/cql-emitter/tests/fixtures/code-is-basic/code-is-basic.crl:38`, as "Active Crohns Disease")
- **`Adult Patient`** — `packages/crl/src/cql-emitter/tests/fixtures/code-is-basic/code-is-basic.crl:19` · lib `Code Is Basic` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Adult With Crohns` (`packages/crl/src/cql-emitter/tests/fixtures/code-is-basic/code-is-basic.crl:36`, as "Adult Patient")
- **`Alpha`** — `packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:4` · lib `Semnot 232` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (5):**
    - `composition-operand` ← Concept `Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:18`, as "Alpha")
    - `composition-operand` ← Concept `Beta Or Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:24`, as "Alpha")
    - `composition-operand` ← Concept `Neither Alpha Nor Beta` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:30`, as "Alpha")
    - `composition-operand` ← Concept `Beta And Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:36`, as "Alpha")
    - `composition-operand` ← Concept `Beta And Grouped Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:42`, as "Alpha")
- **`Beta`** — `packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:9` · lib `Semnot 232` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (4):**
    - `composition-operand` ← Concept `Beta Or Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:24`, as "Beta")
    - `composition-operand` ← Concept `Neither Alpha Nor Beta` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:30`, as "Beta")
    - `composition-operand` ← Concept `Beta And Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:36`, as "Beta")
    - `composition-operand` ← Concept `Beta And Grouped Not Alpha` (`packages/crl/src/cql-emitter/tests/fixtures/semnot-232/semnot-232.crl:42`, as "Beta")
- **`At Least Two Radiograph Sets`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:69` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Documented Nonunion` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:99`, as "At Least Two Radiograph Sets")
- **`Concurrent Noninvasive Stimulator`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:47` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage Determination` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:110`, as "Concurrent Noninvasive Stimulator")
- **`Multiple Views Per Radiograph Set`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:84` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Documented Nonunion` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:102`, as "Multiple Views Per Radiograph Set")
- **`No Clinically Significant Interval Healing`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:89` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Documented Nonunion` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:103`, as "No Clinically Significant Interval Healing")
- **`Nonunion Exists`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:64` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Documented Nonunion` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:98`, as "Nonunion Exists")
- **`Radiograph Sets At Least Ninety Days Apart`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:79` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Documented Nonunion` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:101`, as "Radiograph Sets At Least Ninety Days Apart")
- **`Radiographs Obtained Prior To Treatment`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:74` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Documented Nonunion` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:100`, as "Radiographs Obtained Prior To Treatment")
- **`Skull Or Vertebral Fracture`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:52` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage Determination` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:111`, as "Skull Or Vertebral Fracture")
- **`Tumor Related Fracture`** — `packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:57` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage Determination` (`packages/crl/src/cre/tests/fixtures/dme101-030-composition/policy.crl:112`, as "Tumor Related Fracture")
- **`C1`** — `packages/crl/src/fhir-emitter/tests/fixtures/activities-only-sub-only-recommend/main.crl:4` · lib `Main` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Main Decision` (`packages/crl/src/fhir-emitter/tests/fixtures/activities-only-sub-only-recommend/main.crl:11`, as "C1")
- **`C2`** — `packages/crl/src/fhir-emitter/tests/fixtures/activities-only-sub-only-recommend/other.crl:4` · lib `Other` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Other Decision` (`packages/crl/src/fhir-emitter/tests/fixtures/activities-only-sub-only-recommend/other.crl:11`, as "C2")
- **`C1`** — `packages/crl/src/fhir-emitter/tests/fixtures/activities-only-two-decisions/main.crl:4` · lib `Main` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Main Decision` (`packages/crl/src/fhir-emitter/tests/fixtures/activities-only-two-decisions/main.crl:11`, as "C1")
- **`C2`** — `packages/crl/src/fhir-emitter/tests/fixtures/activities-only-two-decisions/other.crl:4` · lib `Other` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Other Decision` (`packages/crl/src/fhir-emitter/tests/fixtures/activities-only-two-decisions/other.crl:11`, as "C2")
- **`Base`** — `packages/crl/src/fhir-emitter/tests/fixtures/casefeature-inferred/casefeature-inferred.crl:12` · lib `Case Feature Inferred` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `defined-as-target` ← Concept `Derived` (`packages/crl/src/fhir-emitter/tests/fixtures/casefeature-inferred/casefeature-inferred.crl:20`, as "Base")
- **`Coded Determination`** — `packages/crl/src/fhir-emitter/tests/fixtures/casefeature-non-boolean/casefeature-non-boolean.crl:11` · lib `Case Feature Non Boolean` · value type `CodeableConcept`
  - **Migration (value-read):** add `- definition is most recent this.` (to publish the most recent record's `CodeableConcept` value)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Coded Decision` (`packages/crl/src/fhir-emitter/tests/fixtures/casefeature-non-boolean/casefeature-non-boolean.crl:20`, as "Coded Determination")
- **`History Of Recurrent Skin Maceration With Bacterial Infection`** — `packages/crl/src/fhir-emitter/tests/fixtures/casefeature-truncation/casefeature-truncation.crl:13` · lib `Case Feature Truncation` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Recurrent Skin Maceration Infection` (`packages/crl/src/fhir-emitter/tests/fixtures/casefeature-truncation/casefeature-truncation.crl:25`, as "History Of Recurrent Skin Maceration With Bacterial Infection")
- **`History Of Recurrent Skin Maceration With Fungal Infection`** — `packages/crl/src/fhir-emitter/tests/fixtures/casefeature-truncation/casefeature-truncation.crl:18` · lib `Case Feature Truncation` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Recurrent Skin Maceration Infection` (`packages/crl/src/fhir-emitter/tests/fixtures/casefeature-truncation/casefeature-truncation.crl:25`, as "History Of Recurrent Skin Maceration With Fungal Infection")
- **`Active Crohns Disease`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision-two/code-is-decision-two.crl:16` · lib `Code Is Decision Two` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision-two/code-is-decision-two.crl:26`, as "Active Crohns Disease")
- **`Adult Patient`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision-two/code-is-decision-two.crl:11` · lib `Code Is Decision Two` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision-two/code-is-decision-two.crl:25`, as "Adult Patient")
- **`Adult Patient`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision-vs/code-is-decision-vs.crl:14` · lib `Code Is Decision VS` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision-vs/code-is-decision-vs.crl:37`, as "Adult Patient")
- **`Active Crohns Disease`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision/code-is-decision.crl:17` · lib `Code Is Decision` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision/code-is-decision.crl:26`, as "Active Crohns Disease")
- **`Adult Patient`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-decision/code-is-decision.crl:12` · lib `Code Is Decision` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Feature Main`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-two-libraries/main.crl:11` · lib `Two Lib Main` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Main Determination` (`packages/crl/src/fhir-emitter/tests/fixtures/code-is-two-libraries/main.crl:18`, as "Feature Main")
- **`Feature Sub`** — `packages/crl/src/fhir-emitter/tests/fixtures/code-is-two-libraries/sub.crl:11` · lib `Two Lib Sub` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Sub Determination` (`packages/crl/src/fhir-emitter/tests/fixtures/code-is-two-libraries/sub.crl:22`, as "Feature Sub")
- **`Active Crohns Disease`** — `packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-activity/root.crl:15` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-activity/root.crl:21`, as "Active Crohns Disease")
- **`Active Severe Crohns`** — `packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-decision-split/shared.crl:11` · lib `Shared` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Sub Triage` (`packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-decision-split/shared.crl:21`, as "Active Severe Crohns")
- **`Active Crohns Disease`** — `packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-decision/root.crl:12` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-decision/root.crl:18`, as "Active Crohns Disease")
- **`Feature A`** — `packages/crl/src/fhir-emitter/tests/fixtures/none-code-is-sibling/main.crl:4` · lib `Main Policy` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Main Determination` (`packages/crl/src/fhir-emitter/tests/fixtures/none-code-is-sibling/main.crl:11`, as "Feature A")
- **`Feature B`** — `packages/crl/src/fhir-emitter/tests/fixtures/none-code-is-sibling/sib.crl:9` · lib `Sib` · value type `CodeableConcept`
  - **Migration (value-read):** add `- definition is most recent this.` (to publish the most recent record's `CodeableConcept` value)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Active Crohns Disease`** — `packages/crl/src/imports/tests/fixtures/code-is-decision/root.crl:16` · lib `Code Is Decision` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Triage Crohns` (`packages/crl/src/imports/tests/fixtures/code-is-decision/root.crl:25`, as "Active Crohns Disease")
- **`Adult Patient`** — `packages/crl/src/imports/tests/fixtures/code-is-decision/root.crl:11` · lib `Code Is Decision` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Age Qualifies`** — `packages/crl/src/imports/tests/fixtures/criterion-isolation/libx.crl:4` · lib `LibX` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `criterion-body` ← Criterion `A` (`packages/crl/src/imports/tests/fixtures/criterion-isolation/libx.crl:10`, as "Age Qualifies")
- **`Age Qualifies`** — `packages/crl/src/imports/tests/fixtures/criterion-isolation/liby.crl:4` · lib `LibY` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `criterion-body` ← Criterion `A` (`packages/crl/src/imports/tests/fixtures/criterion-isolation/liby.crl:10`, as "Age Qualifies")
- **`Age Qualifies`** — `packages/crl/src/imports/tests/fixtures/criterion-xor-reverse/root.crl:7` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `criterion-body` ← Criterion `Eligible` (`packages/crl/src/imports/tests/fixtures/criterion-xor-reverse/root.crl:5`, as "Age Qualifies")
- **`Eligible`** — `packages/crl/src/imports/tests/fixtures/criterion-xor-reverse/root.crl:12` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Age Qualifies`** — `packages/crl/src/imports/tests/fixtures/criterion-xor/root.crl:4` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `criterion-body` ← Criterion `Eligible` (`packages/crl/src/imports/tests/fixtures/criterion-xor/root.crl:15`, as "Age Qualifies")
- **`Eligible`** — `packages/crl/src/imports/tests/fixtures/criterion-xor/root.crl:9` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Adult Patient`** — `packages/crl/src/imports/tests/fixtures/decision-defined-as-exists/root.crl:11` · lib `Pol` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `defined-as-target` ← Concept `Has Adult` (`packages/crl/src/imports/tests/fixtures/decision-defined-as-exists/root.crl:18`, as "Adult Patient")
- **`Adult Patient`** — `packages/crl/src/imports/tests/fixtures/decision-localcode-reduction/root.crl:12` · lib `Pol` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (2):**
    - `structural-reduction-target` ← Concept `Enough Trials` (`packages/crl/src/imports/tests/fixtures/decision-localcode-reduction/root.crl:19`, as "Adult Patient")
    - `when-guard` ← Decision `Triage` (`packages/crl/src/imports/tests/fixtures/decision-localcode-reduction/root.crl:25`, as "Adult Patient")
- **`Root Local`** — `packages/crl/src/imports/tests/fixtures/include-into-split/root.crl:10` · lib `Root` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Adult Patient`** — `packages/crl/src/imports/tests/fixtures/non-decision-localcode-activity/root.crl:11` · lib `Pol` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Foo`** — `packages/crl/src/imports/tests/fixtures/repr-cross-lib/root.crl:9` · lib `Root` · value type `Quantity`
  - **Migration (promote-recordset):** promote a single representation to a named `- shape is RecordSet.` concept and reduce THAT (a `most recent this` here would span 2 representations — reduction-multi-rep)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Has Local Thing`** — `packages/crl/src/imports/tests/fixtures/standalone-age/standalone-age.crl:10` · lib `Standalone Age` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by:** _(unreferenced in-repo)_
- **`Concurrent Noninvasive Stimulator In Use`** — `packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:29` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage` (`packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:45`, as "Concurrent Noninvasive Stimulator In Use")
- **`Documented Fracture Nonunion`** — `packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:34` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage` (`packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:46`, as "Documented Fracture Nonunion")
- **`Fracture Of Skull Or Vertebrae`** — `packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:19` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage` (`packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:43`, as "Fracture Of Skull Or Vertebrae")
- **`Tumor-Related Fracture`** — `packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:24` · lib `Ultrasonic Osteogenesis Stimulator Coverage` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `when-guard` ← Decision `Ultrasonic Osteogenesis Stimulator Coverage` (`packages/crl/src/tests/fixtures/policies/dme101-030/dme101-030.crl:44`, as "Tumor-Related Fracture")
- **`Height`** — `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:106` · lib `Representation Examples` · value type `Quantity`
  - **Migration (promote-recordset):** promote a single representation to a named `- shape is RecordSet.` concept and reduce THAT (a `most recent this` here would span 2 representations — reduction-multi-rep)
  - **Consumed by (1):**
    - `narrative-operand` ← Concept `BMI` (`packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:127`, as "Height")
- **`Weight`** — `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:115` · lib `Representation Examples` · value type `Quantity`
  - **Migration (promote-recordset):** promote a single representation to a named `- shape is RecordSet.` concept and reduce THAT (a `most recent this` here would span 2 representations — reduction-multi-rep)
  - **Consumed by (1):**
    - `narrative-operand` ← Concept `BMI` (`packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:127`, as "Weight")
- **`Local`** — `packages/crl/src/validator/tests/fixtures/ruleb-cross-lib-composition/root.crl:7` · lib `Root` · value type `CodeableConcept`
  - **Migration (value-read):** add `- definition is most recent this.` (to publish the most recent record's `CodeableConcept` value)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Bad` (`packages/crl/src/validator/tests/fixtures/ruleb-cross-lib-composition/root.crl:13`, as "Local")
- **`Flag`** — `packages/crl/src/validator/tests/fixtures/ruleb-cross-lib-composition/vitals.crl:4` · lib `Vitals` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `composition-operand` ← Concept `Bad` (`packages/crl/src/validator/tests/fixtures/ruleb-cross-lib-composition/root.crl:13`, as "Vitals"."Flag")
- **`Flag`** — `packages/crl/src/validator/tests/fixtures/ruleb-cross-lib/vitals.crl:4` · lib `Vitals` · value type `boolean`
  - **Migration (boolean-presence):** add `- definition is exists this.` (a boolean presence determination)
  - **Consumed by (1):**
    - `narrative-operand` ← Concept `Check` (`packages/crl/src/validator/tests/fixtures/ruleb-cross-lib/root.crl:7`, as "Vitals"."Flag")


## Targets inside excluded (intentional-error) fixtures

16 bare-scalar target(s) sit inside excluded fixture families. They are NOT reconciled (their cluster fails validation for its own intentional reason), but the flip adds a `no-bare-scalar-code` error to these fixtures too — so at T5/T6 their **expected validation output changes**. That churn MAY surface as CI test failures, but a fixture test can assert only its own intended error and keep passing — so treat these rows as an explicit T5/T6 worklist (migrate, or record the expected new diagnostic), not a guaranteed-loud signal.

- `Condition A` — `packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-activity-collision/root.crl:12` · boolean-presence · family: fixture: cross-lib activity collision (intentional error)
- `Condition B` — `packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-activity-collision/root.crl:17` · boolean-presence · family: fixture: cross-lib activity collision (intentional error)
- `Active Crohns Disease` — `packages/crl/src/fhir-emitter/tests/fixtures/cross-lib-activity-missing/root.crl:12` · boolean-presence · family: fixture: missing cross-lib activity (intentional error)
- `Requested Service` — `packages/crl/src/fhir-emitter/tests/fixtures/malformed-dispositions/malformed-dispositions.crl:4` · boolean-presence · family: fixture: malformed dispositions (intentional error)
- `Beta` — `packages/crl/src/fhir-emitter/tests/fixtures/urn-collision/local-one-2.crl:4` · boolean-presence · family: fixture: URN collision (intentional error)
- `Alpha` — `packages/crl/src/fhir-emitter/tests/fixtures/urn-collision/local-one.crl:4` · boolean-presence · family: fixture: URN collision (intentional error)
- `Age Qualifies` — `packages/crl/src/imports/tests/fixtures/criterion-cycle-scoped/root.crl:4` · boolean-presence · family: fixture: scoped criterion cycle (intentional error)
- `Age Qualifies` — `packages/crl/src/imports/tests/fixtures/criterion-foreign-qualified/lib.crl:4` · boolean-presence · family: fixture: foreign-qualified criterion (intentional error)
- `Beta` — `packages/crl/src/imports/tests/fixtures/local-codesystem-urn-collision/local-one-2.crl:4` · boolean-presence · family: fixture: local codesystem URN collision (intentional error)
- `Alpha` — `packages/crl/src/imports/tests/fixtures/local-codesystem-urn-collision/local-one.crl:4` · boolean-presence · family: fixture: local codesystem URN collision (intentional error)
- `Adult Patient` — `packages/crl/src/imports/tests/fixtures/partial-concepts-name-collision/root.crl:11` · boolean-presence · family: fixture: partial-concepts name collision (intentional error)
- `Trigger` — `packages/crl/src/imports/tests/fixtures/sibling-slug-collision/root.crl:10` · boolean-presence · family: fixture: sibling slug collision (intentional error)
- `Alpha` — `packages/crl/src/imports/tests/fixtures/sibling-slug-collision/sib-one.crl:4` · value-read · family: fixture: sibling slug collision (intentional error)
- `Beta` — `packages/crl/src/imports/tests/fixtures/sibling-slug-collision/sib-two.crl:4` · value-read · family: fixture: sibling slug collision (intentional error)
- `X` — `packages/crl/src/validator/tests/fixtures/ruleb-origin-collision-inverse/local-foo.crl:5` · value-read · family: fixture: rule-B origin collision inverse (intentional error)
- `X` — `packages/crl/src/validator/tests/fixtures/ruleb-origin-collision/local-foo.crl:5` · boolean-presence · family: fixture: rule-B origin collision (intentional error)

## Audited non-target census (local-coded concepts that are NOT targets)

Every local-coded concept the flip does NOT break, classified — so exemptions are visible, not absent.

| Reason | Count |
| --- | ---: |
| explicit-reduction-or-derivation | 6 |
| value-projection-reduction-exempt | 2 |
| legal-recordset-publication | 0 |
| both-rep-churn | 3 |
| other | 2 |

<details><summary><code>explicit-reduction-or-derivation</code> — 6 (migration: already states its reduction/derivation — no migration owed)</summary>

- `harness/PlanDefinition-apply/src/patient-age-upper/src/crl/patient-age-upper.crl:23` — `At Most Twenty One` (Patient Age Upper)
- `harness/PlanDefinition-apply/src/patient-age-upper/src/crl/patient-age-upper.crl:16` — `Under Twenty One` (Patient Age Upper)
- `packages/crl/src/imports/tests/fixtures/code-is-reduction/root.crl:9` — `Adult Patient` (Pol)
- `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:124` — `BMI` (Representation Examples)
- `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:134` — `High BMI` (Representation Examples)
- `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:100` — `Up To Date On Mammography` (Representation Examples)

</details>

<details><summary><code>value-projection-reduction-exempt</code> — 2 (migration: none — a `value projection` posrep supplies the reduction; adding `exists this` would break recency)</summary>

- `packages/crl/src/cql-emitter/tests/fixtures/semnot-age-232/semnot-age-232.crl:7` — `Age 21 Or Older` (Semnot Age 232)
- `packages/crl/src/fhir-emitter/tests/fixtures/patient-age/src/crl/patient-age.crl:8` — `Age 18 Or Older` (Patient Age)

</details>

<details><summary><code>both-rep-churn</code> — 3 (migration: none for the rule; emit changes at the flip (asTruths/satisfied removal) — golden churn only)</summary>

- `packages/crl/src/fhir-emitter/tests/golden/example-bothrep/src/crl/example-bothrep.crl:11` — `Implanted Estrogen Or Estradiol Pellets` (Both Representation)
- `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:87` — `Had Mammogram` (Representation Examples)
- `packages/crl/src/tests/fixtures/representation/mammogram-and-bmi.crl:79` — `Mammogram` (Representation Examples)

</details>

<details><summary><code>other</code> — 2 (migration: not a recognized migration or exempt shape — inspect)</summary>

- `packages/crl/src/imports/tests/fixtures/mixed-code-defined-as/root.crl:13` — `Mixed Concept` (Mixed)
- `packages/crl/src/tests/fixtures/representation/representation-edge-cases.crl:15` — `Serum Potassium` (Representation Edge Cases)

</details>

## Secondary — other flip-enforced warning→error kinds

Best-effort census of the OTHER validation warnings the flip also hardens (design §2/§7), from an EXPLICIT closed rule set. NOT reconciled (only `no-bare-scalar-code` has an oracle). Deliberately excluded: `shape-marker-not-emit-active` (deleted at the flip), `count-threshold-trivial` (does not flip), `use-site-operand-untyped` (owned by #257, not this flip).

| Rule | Count |
| --- | ---: |
| `reduction-shape/recordset-operand-required` | 5 |
| `use-site-type-mismatch/composition-result-type-mismatch` | 72 |

## Known-not-enumerable (declared) — zero-signal flip blockers

The flip also errors on classes NO shipped diagnostic can enumerate from a warning harvest (design §8 + the validator's own deferral headers). T4 DECLARES them (undeclared would read as presumed-enumerated); structurally enumerating them is an owned T5/T7 obligation:

- **`value-type-must-match-a-real-element`** — a value-reading reduction whose value type has no real FHIR element on its resource. T4 pre-surfaces the mechanically-detectable slice as a per-target **blocker** (via the T3a `fhirValueModel` cross-check); the residue is T7-wired.
- **`most recent this` on a valueless representation** — same T3a cross-check; also surfaced as a blocker.
- **`type is`-vs-operand agreement** — a `most recent "X"` selecting from a `RecordSet<R>` whose `R` disagrees with the concept's `type is` (reductionShapeValidator.ts:318-327 — "left for the flip step").
- **RecordSet + scalar-narrative orphan** — a `RecordSet` reduced by an orphaned scalar narrative selection with no warning carrier today (reductionShapeValidator.ts:59-62).
- **cross-library named reduction operand** — `resolveConcept` is self-scope-only (referenceResolver.ts:520-524), so a foreign-qualified `exists "OtherLib"."X"` over a non-RecordSet operand emits NO warning today — absent from both the target and secondary censuses.
- **residual guard hole** — the non-boolean guard case the validator flags as reachable-but-unhardened (useSiteTypeValidator.ts:639-641).

## Validator-message discrepancy (a flip consideration)

For a bare-scalar concept with **no single value type** (none declared, or more than one), the shipped `no-bare-scalar-code` message currently suggests `add \`definition is exists this\`` (treating an undefined value type as boolean, reductionShapeValidator.ts:388-390). This inventory instead classifies it `value-type-unresolved` and the KE guide says **declare a single value type first** — the charter-correct step (North Star §3: the declared value type decides the owed reduction; a copied `exists this` would manufacture a boolean). **The validator's suggested-action text should be corrected at the flip** so the shipped message and this guidance agree. (In-repo this class is currently empty.)

## External content — delegated to each content repo's KE

Production content lives in SEPARATE repos (e.g. `hcsc-content`, one artifact per branch pre-ship; `main` accretes artifact folders once shipped). **This scanner does NOT scan or migrate external content** — each content repo's KE migrates their own, using:

- The migration guide: `docs/emit-189-migration-guide.md` (the four migration cases + prerequisites).
- A CRL package version at or past the flip release (so the reduction forms emit instead of erroring).

The flip's RELEASE coordination (don't enforce until known content owners have migrated) is a communication/versioning step owned by the operator — NOT an in-repo gate.

## T7 staleness gate (in-repo)

T5/T6 change content + goldens before the flip. At T7, **re-run the scanner and diff against this committed inventory** — a stale artifact is the silent breakage T4 exists to prevent. The scanner type-checks + tests in CI (an internal-API change breaks it loudly), and **T7 must run the scanner in CI** (the runner's exclusion-manifest dead-rule check only fires when the script actually runs).

