# Supplied Patient administrative gender

An explicit mapping projects the evaluation Patient's administrative gender into
an Observation-valued concept. The author defines what each source value means
for this concept; this is not an inference of menopause, anatomy, or a diagnosis.

```crl
terminology "Yes Answer": - system is `urn:synthetic:answers`. - code is `true`.
terminology "No Answer": - system is `urn:synthetic:answers`. - code is `false`.

// Inside an explicit Record/Observation/CodeableConcept concept, whose finite
// value domain includes both codes above and whose shape reduction is most recent:
- source representation:
  - type is Patient.
  - value projection is administrative gender female as "Yes Answer" male as "No Answer".
```

Each target is a singleton terminology, including qualified imported terminology.
Output membership uses system and code, never the terminology name or display.
Duplicate source keys, unresolved/multiple output codes, and out-of-domain output
codes are errors. Source keys may be female, male, other or unknown. Map only the
values whose interpretation is authorized. Missing or unmapped gender contributes
no answer; it does not become No or an assumed uncertain answer. Invalid gender
and unsupported modifier extensions remain errors, even beside a newer local answer.

Keep the local `code is` and offered answer vocabulary when correction and missing
answer intake are needed. A newer local four-choice answer remains selected and
continues to participate in the existing available-answer uncertainty check.
Omitting `code is` produces a read-only publication without a question.

The source's validity is the actual `Patient.meta.lastUpdated`. The ordinary
authored most-recent selector applies; the age pattern's daily recalculation does
not apply. General most-recent selection gives dated candidates precedence over
undated candidates. A dated user answer, either uncertain choice, or a valueless
clear therefore overrides an undated Patient. Removing that answer restores the
undated fallback; clearing retains an unanswered selected value. Once Patient
validity is supplied, normal recency can select whichever dated candidate is newer.
Multiple all-undated candidates remain ambiguous. No timestamp is invented.

For this capability, supply Patient JSON in the request Bundle. CEL has no gender
or Patient-lastUpdated authoring field. CEL-only scenarios do not exercise this
source. Test raw supplied Patient data separately, including missing/unmapped,
local correction, uncertain choices, explicit clear, and undated competition.
Native operation checks do not establish rendered UI behavior.

Complete executable synthetic fixture:
`packages/crl/src/emit/tests/fixtures/publication-gender.crl`.
