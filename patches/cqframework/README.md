# CQFramework extraction and generated-ID patches

These source patches address two engine defects encountered when exercising CRL-generated artifacts with CQFramework's R4 `$apply` implementation (including its R5-operation backport). They are local patch sets, not an upstream release or an installed customer engine.

Upstream review: [Coding extraction PR #1101](https://github.com/cqframework/clinical-reasoning/pull/1101) targets main; [generated IDs PR #1102](https://github.com/cqframework/clinical-reasoning/pull/1102) is stacked on the Coding branch. Merge #1101 first, then retarget #1102 to main. The tested [4.7 backport branch](https://github.com/cqframework/clinical-reasoning/tree/codex/qr-extraction-backport) is also pushed; no 4.7 maintenance branch currently exists for a backport PR. These submissions do not constitute a release or installation.

Upstream: https://github.com/cqframework/clinical-reasoning

| Series | Exact base commit | Apply order |
|---|---|---|
| `main/` | `5be61c98779e7fc06a9d1c4cfafbad81e21a120c` | Coding conversion, then generated IDs |
| `4.7/` | `1335b9443777725220c3520342e1664dda409584` (`v4.7.0`) | Coding conversion, then generated IDs |

Use the series matching the checkout's base. Each directory contains two `git format-patch` files; apply them in numbered order with `git am`. Do not mix current-main classes into a 4.7 runtime. `manifest.json` records bases, resulting commits, and patch hashes.

The main baseline composed a qualified Questionnaire ID, so its patch also fixes a patient suffix incorrectly becoming part of the version component. The 4.7 baseline already composed the logical ID; its corresponding change adds normalization. Both end at the same generated-ID contract.

## Changes

1. **Preserve a Coding answer when a resource profile requires CodeableConcept.** Keep the full Coding, including system, version, code, display, userSelected and extensions. Preserve repeated-property cardinality. Require matching assignment-parent/profile FHIR types and an unsliced, single-type element, so an Extension or sibling type slice cannot borrow the root Observation's value constraint. Existing unsupported nested and multi-type conversions are unchanged.
2. **Normalize complete generated IDs.** Retain legal `[A-Za-z0-9.-]{1,64}` IDs; otherwise sanitize and truncate a readable stem and append 12 hexadecimal SHA-256 characters derived from the complete original composite. Apply at final QuestionnaireResponse, extracted resource, extraction Bundle and contained OperationOutcome creation. Generated responses use the Questionnaire's logical ID, not its qualified/versioned ID string. References use resulting resource identities; supplied IDs, subject references and linkIds are preserved. The short digest is deterministic, not a guarantee of collision freedom.

The generated-ID consumer audit is in [id-callers.md](id-callers.md). External consumers must use returned identities rather than reconstructing generated IDs from raw prefixes.

## Verification

Both final branches were built with Java 17 and passed the complete `:cqf-fhir-cr:test` and `:cqf-fhir-utility:test` tasks:

| Base | Passed | Skipped | Failures/errors |
|---|---:|---:|---:|
| Current main | 3,626 | 24 | 0 |
| 4.7.0 | 3,491 | 19 | 0 |

New focused coverage includes 21 conversion tests, 11 generated-ID/reference tests and one helper boundary test, across DSTU3/R4/R5 where applicable. The conversion tests include 27 extraction entry-point cases with real canonical profile lookup. The original Coding defect was reproduced on each unmodified baseline. Additional Extension and sibling-type-slice regressions reproduced wrong nested datatypes in all three versions before the guards corrected them. Expected resource content is independently authored, not aliased from mutated input.

Formatting, main-source Checkstyle and the helper's API compatibility check passed. Upstream skips test-source Checkstyle; it is not claimed as a passed check. Run builds with isolated Gradle cache, Java temporary directory and Java `user.home` locations: upstream FHIR package tests can initialize or clear the home-directory package cache.

A separate isolated Bleph fixture exercised 12 actual `$apply` calls, four each with original 4.7, Coding-only correction, and combined correction. No current-main classes entered 4.7. Both corrected configurations produced: initial pause, approval after the missing answer, denial after a listed-negative choice, and pause after clearing the required answer. The original engine continued to lose the Coding answer. Complete returned Questionnaire/QuestionnaireResponse structure, populated values, extracted resources and empty OperationOutcome issue sets were checked. The two corrected variants differed only in the explicitly excluded generated IDs and render-clock/canonical-version metadata.

The runtime overlays used for these measurements were rebuilt byte-for-byte from hash-verified source snapshots. They are test instruments, not a shipped replacement jar. Local detailed evidence is under `tmp/320-engine-evidence/` (`bleph-04`, `r4-suites`, r4 variant manifests and class-origin reports). A final test-only assertion explicitly proves slice lookup precedence; the 21 conversion tests passed again on both branches afterward. Production source did not change after the full suites and runtime measurements. Plan review is discussion 567; code review and dispositions are discussion 568. These local evidence directories are ignored; the source patches, tests and this summary are tracked here.

## Remaining scope

- Extracted transaction Bundles still need the separate `request.url`/resource-addressing correction before transaction persistence is claimed. Tracked upstream as [issue #1103](https://github.com/cqframework/clinical-reasoning/issues/1103); this follow-up is separate from CRL language work.
- Unsupported nested or multi-type answer conversions and their silent exception handling require separate diagnostic and partial-extraction semantics. This patch does not claim to fix them.
- Existing id-less target Outcome composites retain their null suffix behavior; contained IDs are scoped to their containing resource.
- The scoped Bleph measurements do not certify every customer policy, every CRL arm, global Scalar/`this` retirement, or completed customer deployment.

The upstream source and these modifications are distributed under Apache License 2.0; see [LICENSE](LICENSE).
