# Typed intake answers

<!-- REFACTOR:grounded (#328): owning parser, native, client and package evidence. -->

## Declared Quantity units (#328, unreleased source capability)

Declare the unit on the value type, once:

```crl
concept "Body Mass Index":
- shape is Record.
- type is Observation.
- value type is Quantity 'kg/m2'.
- code is `body-mass-index`.
- shape reduction is most recent.
presentation for "Body Mass Index":
- question text is "Enter BMI".
```

REFACTOR:grounded: the unit belongs to the selected Record/Observation Quantity type. CQL and CRE normalize each local, source or computed contribution to that unit before final selection; original source resources, candidate identity, lineage and optional validity remain unchanged. CEL normalizes locally asserted values before claiming the concept profile. A unit declaration on another type or an unsupported publication form is an error. Presentations only supply wording. Changing a shared declared unit changes the library executable contract. Regenerate and deploy the affected include closure together; mixing new consumer artifacts with stale owner artifacts is unsupported.

The canonical unit applies to populated numeric values. Same-unit values keep the existing numeric admission rules; their unit/code/system are canonicalized rather than guaranteed byte-identical. Conversion currently supports m/cm and kg/g. Declaring a unit subjects cross-unit inputs to conversion bounds even for a concept used only for presence or display. Both the input and converted output must have magnitude at most 10^6 and at most eight decimal places; lossy conversions are errors, never rounded. Threshold and BMI arithmetic retain their own stricter supported domains. BMI consumes normalized operands and then applies its existing centimetre precision rule. An incompatible unit is an error during CEL emission or native evaluation. The authored unit code is an explicit UCUM assertion; lexical checking rejects empty/whitespace codes, but does not certify UCUM dictionary membership. No unit is guessed from prose or a threshold. The existing unit-only wire representation is a semantic unit assertion (as used by CEL); explicit type normalization writes the canonical UCUM identity from the authored declaration even for that representation. The original source is never recoded.

Unknown/valueless Quantities pass through unchanged; comparators and invalid populated values remain errors. A raw unitless number remains an error. A clear creates no numeric measurement. No declaration keeps existing behavior, including comparison-time compatible-unit conversion.

The qualified CRL emit path generates every Quantity question through a direct action.input.profile pointing at its case-feature profile. Unit metadata is placed directly on that profile; inherited-only constraints, externally authored Questionnaire actions and other generation routes are outside this capability gate's qualification.

The concept StructureDefinition's Observation.value[x] carries standard `elementdefinition-allowedUnits` with a UCUM Coding in valueCodeableConcept. This is profile guidance and generation metadata; CQL/CRE enforce the executable type contract. The shared generator maps it to standard `questionnaire-unitOption` on the Quantity question. No CRL presentation extension is needed. `questionnaire-unit` applies to integer/decimal and is not used on Quantity items. No numeric default is invented.

The released 6.4.45 engine lacks this mapping. The matching driver refuses such an engine for profiles with declared units. Source qualification uses an explicit candidate path and digest; installed/released acceptance requires a separately qualified engine release and VSIX pin. The bundled LForms client attaches the single offered UCUM unit when a respondent enters a number. Standard unitOption does not promise first-option defaults across all clients: qualify another renderer separately. Multiple offered units and presentation-specific display-unit conversion are outside this single-unit type contract.

Native CQL normalization carries Quantity primitive IDs/extensions consistently with CRE as opaque annotations. Their contents are not interpreted or converted when the numeric value or unit label changes; this is not a claim that a unit-dependent annotation has been recalculated. The measured SDC population layer rebuilds response Quantities without primitive metadata, and HAPI JSON serialization omits id-only primitive metadata; a generated QR is not a lossless serialization of source-resource annotations. The original measurement value/unit is unchanged.

InteractiveSession submits intentional edits and avoids renewing untouched answers. A stateless full-QR submission retains the existing extraction contract: populated responses can create a local answer with the response authored time. This differs from the edits-only client and must be qualified independently.

The shared example `quantity-question-unit` and owning compiler, CEL/CRE, native session/static-result and shipped-browser checks cover emission and entered/change/clear behavior. Synthetic Above/Below activities are test outcomes, not clinical recommendations. Engine-source overlay evidence is not a production deployment claim.

## Text answers and selected-value presence

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

`has a value` examines the selected answer, not the patient's clinical state. Boolean false and recognized coded Unknown/N/A are answered. No selected record, absent value and extension-only primitive value are false. Text is preserved without trimming or clinical validation; an empty FHIR string payload is invalid rather than an explicit clear. Type, domain and selection errors remain errors after FHIR parsing. CEL rejects empty strings; native callers must supply valid FHIR. The pinned HAPI parser normalizes invalid empty `valueString` payloads to absence before CQL can inspect them, so `has a value` cannot validate that lost JSON lexeme. The malformed empty-string QR control fails with an error rather than acting as a clear. To clear an answer, retain its response item and remove `answer` instead of sending an empty string. Selected Boolean, string, dateTime, domain-interpreted CodeableConcept and Quantity operands are supported. For Quantity, presence means its numeric value is supplied: zero is answered; a unit-only or extension-only Quantity is unanswered. This checks presence, not a numeric threshold or unit conversion. Existing exact-Quantity validation applies: populated values require a nonempty unit/code identity, an optional system must be UCUM, and comparator values are rejected. Valueless quantities retain the existing unanswered contract without validating unit metadata; UCUM lexical validity is not checked.

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

## Numeric counts and rates

Use a selected Record/Observation with value type is Quantity, its local code is, and shape reduction is most recent. Derive an uncoded Boolean with definition is "Completed Sessions" has a value. CEL can supply counts as 0 '1', annotated counts as 3 '{session}', or rates such as 2 'd/wk' and 1.5 'h/d'. Presence does not compare or convert these units.

For optional evidence, use one compound presence guard and the same review activity in otherwise, as in numeric-intake-reference.crl and its paired CEL. For source-required completion, a single unqualified when branch may recommend the result only when all required presence predicates are true. With blank numeric fields it recommends no activity; the predicate is false, which is distinct from a null-condition pause. Do not invent a zero threshold or a clinical eligibility condition to collect counts. Test the question set, outcome, and actual Quantity input/export/clear separately.

Quantity thresholds retain their current bounded comparison units (m, cm, kg, g, kg/m2). Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. Their bounds do not restrict unit identities used only for Quantity presence.
