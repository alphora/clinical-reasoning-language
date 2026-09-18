# Typed intake answers

A free-text question is a normal selected Observation, with a separate presence predicate when a decision needs a Boolean:

```crl
concept "Primary Diagnosis":
- shape is Record.
- type is Observation.
- value type is text.
- code is `primary-diagnosis`.
- shape reduction is most recent.

concept "Has Primary Diagnosis":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Primary Diagnosis" has a value.
- shape reduction is most recent.
```

`text` normalizes to FHIR `string`. The existing `string` spelling remains accepted. Profiles declare `Observation.valueString`; the generated string question accepts `QuestionnaireResponse.answer.valueString`. The uncoded predicate adds no question. Its operand's question remains an input dependency.

`has a value` examines the selected answer, not the patient's clinical state. Boolean false and recognized coded Unknown/N/A are answered. No selected record, absent value and extension-only primitive value are false. Text is preserved without trimming or clinical validation; an empty FHIR string payload is invalid rather than an explicit clear. Type, domain and selection errors remain errors after FHIR parsing. CEL rejects empty strings; native callers must supply valid FHIR. The pinned HAPI parser normalizes invalid empty `valueString` payloads to absence before CQL can inspect them, so `has a value` cannot validate that lost JSON lexeme. The malformed empty-string QR control fails with an error rather than acting as a clear. To clear an answer, retain its response item and remove `answer` instead of sending an empty string. Selected Boolean, string, dateTime and domain-interpreted CodeableConcept operands are supported; complex-value presence, including Quantity, is deferred.

The computed Boolean inherits the selected operand's optional validity and direct record provenance. With no operand it is an undated computed false, with no invented timestamp or evidence reference. It participates in its concept's authored selection like other computed candidates.

The kit's `intake-reference.crl` uses a single compound presence guard and the same review activity in otherwise. This gathers the questions without making their answers mandatory. It recommends review immediately even when incomplete; it does not define a submission milestone. Ordered sibling guards are not a question list: the first true guard can suppress later questions. Model source-required conditional sections separately and verify their actual form behavior.

## Date/time answers

```crl
concept "Treatment Start":
- shape is Record.
- type is Observation.
- value type is dateTime.
- code is `treatment-start`.
- shape reduction is most recent.
```

This uses standard `Observation.valueDateTime`, Questionnaire `dateTime`, and response `valueDateTime`. CEL supplies the answer with `value is "2026-09-17"` or `value is "2026-09-17T14:30:00-04:00"`. A separate `date is` records assertion validity for selection; the date being answered does not decide recency. No custom date-only extension, truncation or synthesized midnight is used by CRL.

Valid FHIR calendar precision (year, month or day) and timestamps with seconds and timezone are accepted. Invalid calendar dates and timed values without a timezone are rejected. Native acceptance verifies ordinary calendar precision and second-precision timestamps; this does not certify lossless sub-millisecond or leap-second engine round-trips. The shipped LHC-Forms43.1.0 renderer shows a calendar plus a time picker. A populated date-only answer displays as local midnight and exports a full UTC timestamp even if untouched. Typing only a date does not commit a new dateTime answer. Selecting a calendar day in a blank field also supplies a time (the current local time in the measured run); the user can adjust that time in the picker. This renderer does not preserve date-only precision; native FHIR support is a separate capability. The MV pane displays the form but has no response write-back workflow.

## Verification

The shared kit fixture is exercised by `src/emit/tests/publicationHasValue.test.ts`. After building the core, run `node packages/crl/scripts/native-acceptance/intake.cjs <pinned-engine.jar> <new-scratch-directory>` for native apply and full generated Q/QR change/clear checks, conditional category switching, coded Unknown/N/A answers, and explicit parser-boundary controls. The harness keeps historical CEL text in the dataset, submits a newer explicitly cleared response item, and checks both the derived presence result and unaffected sibling answer values. It copies the generated extraction bindings into the returned QR using the existing native session helper. It does not certify a rendered client, persistence reconciliation, or preservation of untouched fields' timestamps during full-response resubmission. The engine's existing question-wording limitations are unchanged; verification matches stable FHIR definitions.

A clear and omission are different: an explicit newer valueless answer can displace historical text; omission alone does not remove retained data. Scope evaluation data to the current request. Stable question/concept identity does not provide request isolation.

Presentation choices such as radio/dropdown and RecordSet multiple selection are tracked separately in [#322](https://github.com/alphora/clinical-reasoning-language/issues/322). Native emission replaces custom text/profile/CQL patching for this supported slice; unsupported forms must not be fabricated by editing emitted artifacts.


## Policy identity and generated output

The validated package name is the policy ID. The policy entry-point PlanDefinition uses
`<canonicalBase>/PlanDefinition/<policy-id>` and native `$apply` generates
`<canonicalBase>/Questionnaire/<policy-id>`, independent of the decision label.
Supporting definitions retain distinct IDs. Multiple unreferenced root decisions in one policy
are an emission error; connect supporting decisions or use separate policy packages.
Saved MV review copies retain case-specific IDs and URLs; they are review artifacts, not the
policy entry-point definitions to deploy.

Successful writes replace generated directories after preflight: CRL `src/cql` and `src/fhir`,
standalone CQL `src/cql`, CEL `tests/data/fhir`, and normal native results `tests/results`.
Custom files in those directories are removed too. Keep authored files elsewhere and use Git
for recovery. Explicit failed-case retry retains verified successful results.
