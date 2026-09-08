# Named answer ValueSets and question presentation

A concept names a clinical fact. Its question wording is authored separately. Neither question text nor description changes a concept's code, canonical identity, or computation.

## Answer options

Use a named terminology as the answer ValueSet. The terminology owns codes, code-system URLs, and displays. A concept lists only exceptions to qualification:

```crl
library "Policy".

terminology "Policy Documented Complaint Answer Options":
- system is `https://example.org/complaint-codes`.
- code is `impaired-vision` display is `Impaired vision`.
- code is `none` display is `None of the listed complaints`.

concept "Documented Complaint":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is `documented-complaint`.
- value domain is answer options.
- shape reduction is most recent.
- value from is "Policy Documented Complaint Answer Options":
  - not qualifying is `none`.

concept "Complaint Qualifies":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Documented Complaint" in qualifying.
- shape reduction is most recent.

presentation for "Documented Complaint":
- question text is "Which complaint supports this request?".
- question description is "Select the complaint documented for the requested procedure.".
```

Every recognized offered member qualifies except those named by `not qualifying is`. Omitting exceptions is legal and warns, even without a qualifying predicate. Every member may be nonqualifying. Unknown exceptions, ambiguous bare-code exceptions, duplicate system/code members, and missing member displays are errors. Exception tokens must uniquely identify a code within the answer ValueSet; system-qualified exception syntax is not part of this release.

The selected answer remains unknown when absent. An answer with no recognized domain coding, or one mixing recognized qualifying and nonqualifying codings, raises an evaluation error; it must not silently become a clinical determination. Additional out-of-domain codings do not change the classification supplied by recognized domain codings. An unrelated `in "Other Terminology"` predicate tests that separate set and does not use the question's exceptions. It can return false for an interpreted value that is outside that set but inside the concept's explicitly declared `value domain`. A selected value whose codings are all outside the interpreted domain is still an error. Use `in qualifying` for question-option qualification; use named-set membership for a separate predicate over a declared broader domain. Neither spelling turns unrecognized data into false.

Publication `in qualifying` requires the offered and interpreted finite domains to match. An opaque external ValueSet may supply an answer binding, but finite interpretation requires known complete membership. Neither unresolved references nor partially enumerated system segments establish a complete domain.

Use logical library name plus concept name plus `Answer Options` for a concept-specific ValueSet, and `Answer Codes` for its locally owned CodeSystem. FHIR IDs use the shared capped/hash formatter. Do not derive terminology identity from the physical split CQL Library resource or questionnaire wording. Library names used for new concept-specific terminology must be unique within the publishing namespace; reuse an authored canonical deliberately when sharing a vocabulary across policies. The naming convention is for new declarations; authored system URLs remain stable identities when a concept is renamed. Systems under the project's canonical base followed by `/CodeSystem/` are owned by this artifact: their enumerated members are emitted once, including the union from multiple emitted ValueSets, and conflicting displays are errors. Shared CodeSystem metadata comes from the authored system identity, not a consuming concept or traversal order. If a terminology deliberately references an already generated local system, its current members join that system; the existing system metadata and code order are preserved. This combines current emission contributions only, never prior output files. Other explicit `system is` URLs identify external authorities and are not re-published as local CodeSystems. A locally owned system ID must be FHIR-valid and at most 64 characters. Use the shared formatter when creating long IDs; ownership does not depend on reproducing its hash. An external answer ValueSet can instead use an explicit `valueset is` canonical for a stable published binding. Inline `value from:` answer lists and the old `value from "Name"` spelling are removed. Use `value from is "Name".` when there are no exception lines.

## Presentation

A presentation is optional for a question-enabled concept. Missing presentation warns. With no presentation, no question-text extension is invented; the tested CQFramework4.7 generator uses the concept/profile metadata as its fallback label and still creates an answerable item. A concept with `code is` declares its local Case Feature answer identity; presentations cannot target uncoded computational concepts. Resource/type validity and supported answer emission are checked separately. Eligibility is not limited to boolean: coded options and quantities can also be answers.

Each declaration requires nonempty `question text is`; `question description is` is optional. Both accept double-quoted text or backtick-delimited free text. Use backticks for text containing double quotes or multiple lines; these fields are text, never declaration references. Duplicate fields are errors. There is no separate short or label field: the concept name remains the short metadata.

Question text emits `http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text` with `valueString`. Description emits `http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description` with `valueMarkdown` only when authored. These belong to PlanDefinition action inputs. CQFramework4.7 consumes the text extension but currently leaves description consumption unimplemented in ProcessAction. Authored descriptions are preserved in emitted PlanDefinition inputs; this release does not claim they appear in the returned Questionnaire. No new question items or extraction behaviors are introduced for descriptions.

A base declaration supplies default wording. Optional repeated `in decision "Name"` and `in criterion "Name"` entries select alternative contexts. A scoped declaration supplies its own required question text and inherits an omitted description from the base. There is no syntax to clear an inherited description in this release. Overlapping scopes are errors even when wording agrees; source order does not choose a winner. A single native question profile cannot silently take the first of conflicting applicable wordings. Inputs on visited sibling guards may coexist even when only one branch wins. Different wording for the same concept is therefore allowed only when the emitted graph proves the input occurrences cannot share a form, such as descendants of mutually exclusive first-match branches; criterion-scoped wording on the sibling guards themselves can conflict. A missing presentation remains warning-only; genuinely different effective wording for co-occurring uses still conflicts, including authored wording versus the concept-name fallback. This check follows structural reachability, not CQL theorem proving.

Imported inputs inherit their owning library's default presentation. Importing-library overrides remain backlog issue #321. Do not author them until supported. Future locality precedence is about import hierarchy, not declaration order.

## Verification

Migrate clinical names and terminology identities consistently across CRL, CEL, and expected artifact references. Preserve the policy's clinical expected outcomes. Verify emitted CQL/FHIR, CEL data, native `$apply` recommendations and question states independently. Bleph acceptance includes the QR-only answer/change/clear sequence: 3 → 11 → 11 → 3 question groups and pause → Met → Unmet → pause. A passing CRE prediction is not native acceptance evidence.
