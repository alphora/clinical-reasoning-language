# Pause on unknown applicability

Reviewed source patch: [CQFramework PR #1104](https://github.com/cqframework/clinical-reasoning/pull/1104), stacked on the extraction/ID fixes in #1102. The 4.7 backport is pushed as `codex/apply-pause-on-unknown-r4`. The complete CRL-maintained CLI build now includes these patches; see [build provenance](../cli-build.json).

`CrSettings.pauseOnUnknownApplicability` defaults to **true**. Ordinary actions and ordered `any` groups share nullable condition evaluation:

| Condition | Behavior |
| --- | --- |
| True | Apply the action; stop later alternatives in an `any` group. |
| False | Exclude descendants; permit the next alternative. |
| Unknown | Keep the reached action's question; exclude descendants and stop later ordered alternatives. |
| Evaluation error | Report an OperationOutcome error and block that ordered branch. |

Independent `all` actions remain independently evaluated. A reached false node's question remains available for correction. Multiple applicability conditions use three-state conjunction: false dominates genuine unknown; evaluation errors remain errors regardless of condition order. Non-Boolean and multiple results, including collections containing null, are rejected in pause mode.

The default-on runtime policy extends first-true selection with pausing for missing data. [FHIR-50150](https://jira.hl7.org/browse/FHIR-50150) defines ordered first-true selection but does not itself specify null pausing. Hosts can explicitly disable the additional policy:

```java
var settings = CrSettings.getDefault().withPauseOnUnknownApplicability(false);
var processor = new PlanDefinitionProcessor(repository, settings);
```

Disabling treats unknown as non-applicable; it does not make the condition true. The setting propagates to nested PlanDefinition requests.

## Applying

Use the single patch from `main/` after upstream commit `234b879120d97e871bb518b5b7e2ccd9e9bdd884`, or from `4.7/` after backport commit `bd2b1c19cb5b9d93db3c8f58bb827a85d752ac73`. Those bases already include the two extraction/ID patches in the parent directory. Apply with `git am`; do not mix engine generations. Exact bases, result commits/trees and SHA-256 hashes are in [manifest.json](manifest.json). Reapplication to each exact base was verified to reproduce its committed tree.

## Verification and limits

- All 70 PlanDefinition tests pass on each branch, including 11 new focused methods. Java formatting and main checkstyle pass; the existing build skips test checkstyle.
- Twelve native R4 `applyR5` controls pass: default settings, explicit enabled/disabled settings, true/false/null, and invalid CQL collections including `{true, null}`.
- The unchanged migrated Bleph initial-pause fixture returns three reached question groups instead of nine, with no recommendation or OperationOutcome error. No emitter nesting rewrite is used for that result.
- Native controls used the final compiled 4.7 patch classes with the previously pinned corrected runtime; class hashes match the final build. The complete replacement CLI jar was subsequently built and verified with the QR-only Bleph session and 116-case native acceptance; installed-artifact results are recorded by the release gate.

The engine retains items from a caller-supplied Questionnaire. The supported Bleph client
copies extraction bindings onto matching QR items and submits only QR; fresh Q generation
then returns 3 -> 11 -> 11 -> 3 groups with pause -> Met -> Unmet -> pause. This needs no
question-pruning patch. `manifest.json`'s `deployed:false` records the original upstream
patch handoff state; it does not deny inclusion in the separately identified CRL CLI build.
This patch does not establish completed customer adoption or human Medical Validation.

Local review records: `.vibe-tools/discussions/600-*` (plan) and `601-*` (code). Native review converged; the external reviewer was unavailable. Local execution evidence: `tmp/601-validation.json`, `tmp/601-native`, `tmp/601-native-cardinality`, and `tmp/601-bleph-native`.
