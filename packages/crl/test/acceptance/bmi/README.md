# BMI cumulative session developer probe

This explicitly invoked probe tests one client-owned submission strategy on original
CQFramework4.7.0. It is not the full-QuestionnaireResponse acceptance gate, a rendered
client, persistence reconciliation, or a replacement for Bleph acceptance.

From the repository root, with the pinned engine downloaded and Java17+ available:

```sh
node packages/crl/scripts/native-acceptance/bmi-session.cjs --engine-jar /path/to/cqf-fhir-cr-cli-4.7.0.jar --out /path/to/new-output --java /path/to/java
node --test packages/crl/scripts/native-acceptance/bmi-session.test.cjs
```

The output directory must be new, outside the workspace or under its `tmp/` directory.
Its parent must exist. The probe builds the core before loading emitters and emits
`src/emit/tests/fixtures/publication-bmi.crl` into a fresh output project. It checks
the pinned engine hash, session helper bytes, actual class origins, and unchanged
compiler/harness/fixture/engine hashes over execution. No overlay is admitted.
Requests, results, extraction, state before/after, build log, source identity and
verdicts are retained under the output directory. Failure returns a nonzero exit.

The starting dataset is synthetic Patient/p plus an external Weight36.3kg dated
2026-09-01. Later answer resources come from native extraction of actual returned
QuestionnaireResponse edits; the probe does not manufacture them. Expected BMI
values and activities follow the synthetic threshold of30kg/m2. This is not a
customer policy or medical recommendation.

| Step | Expected selected BMI | Expected outcome |
|---|---:|---|
| No Height | unknown | Pause before activity |
| Answer Height1.1m | 30 | Approve |
| Answer Weight40kg | 33.05785123 | Approve |
| Change Height2m | 10 | Deny |
| Attempt Height0m | validation error | Reject attempted edit; retain prior session state |
| Read retained session | 10 | Deny |
| Override BMI35 | 35 | Approve |
| Change Height1.1m | 35 | Approve; BMI override still newer than Weight |
| Change Weight20kg | 16.52892561 | Deny; new Weight validity makes calculation newer |
| Clear BMI | unknown | Pause before activity |
| Read retained session | unknown | Pause remains |

Each edit sends the full returned Questionnaire and a response containing only the
edited item and its ancestors. A clear retains the item without its answer. Prior
successful extracted answers are supplied once in the next request data Bundle,
unchanged. The edited singleton's old session entry is omitted from that request
before native extraction supplies its replacement. Only successful evaluation commits
the replacement to the client-owned map. Failed edits retain both the prior data and
prior successful form. Historical responses are not re-extracted.

This map is restricted to one subject and the three exact singleton definitions in
this fixture. It is not a generic subject/code deduplicator or a rule for repeated
answers. The baseline repository stays immutable; no server persistence is performed.
Clearing BMI creates an explicit newer unknown, not an instruction to remove the
override and fall back to calculation. A separate reset-to-calculation operation is
not defined by this probe.

Checks cover exact returned Quantity values, activities, both null condition witnesses
at pauses, extraction code/profile/subject/value/time, retained-resource equality,
duplicate IDs, and unchanged repository resources. The invalid-input stage admits
only the specific pinned-engine diagnostic and log messages. `expected-invalid.json`
is the measured negative-stage diagnostic fixture; checker tests ensure that unrelated
errors cannot hide behind the expected failure.

Eleven state-dependent native calls run sequentially in isolated JVMs, with a120-second
bound per call. This developer probe is not added to the default acceptance command.
Before promoting it there, batching must preserve the session dependencies and checks.

The full-response coded BMI defect remains open: untouched defaults/blanks can be
extracted as newly authored local BMI candidates and conflict with the calculation.
Success here demonstrates an alternate API submission strategy, not its adoption by
an actual client or resolution of that separate requirement.
