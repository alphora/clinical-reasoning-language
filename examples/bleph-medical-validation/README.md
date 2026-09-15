# Bleph Medical Validation

A light example based on Noridian's [L34194 — Blepharoplasty, Eyelid Surgery, and Brow Lift](https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=34194&ver=27), revision R7, effective October 16, 2025.

The example assesses ordinary functional upper blepharoplasty and blepharoptosis repair, one procedure and eye per case. It checks cosmetic purpose and functional necessity once, then selects the procedure-specific findings and photographs. Clinical findings and photographic evidence are entered as reviewer assessments. The complaint and skin-finding questions demonstrate named answer choices.

For a session containing multiple procedures, review each procedure separately and assess its necessity in the context of the planned session. Each case represents one assessment; the example does not reconcile answers between separate cases.

## Open and review

Open `medical-validation.code-workspace`, then run **CRL: Show Medical Validation** and select Bleph. Opening this folder directly also works, using your configured panes. The workspace file opens the source, CRL Questionnaire, FHIR Questionnaire, and tree panes. The repository's **Run Bleph Medical Validation (isolated)** debugger configuration opens this workspace.

Select a case and pin its result to inspect the questions on that route. Use **Next** to traverse results and the questionnaire icon to open the Result Questionnaire. Expand descriptions and answer choices to inspect the source-specific wording. Review the corresponding source text, clinical answers, and result before setting a verdict.

The open KE flag under `src/medical-validation/flags/` is a labeled UI demonstration. It lets you test inspecting and resolving an authoring flag in MV. Saved example verdicts in `review-samples/` are separate from active review state.

## Included artifacts

- `src/source/`: versioned L34194 HTML, readable policy text, and retrieval metadata.
- `src/refined-source/`: structured L34194 source in Markdown and Word.
- `src/anchor-source/`: canonical text rendered from the Word source, with hash metadata.
- `src/provenance/`: source attribution for the CRL and clinical cases.
- `src/crl/`: policy and communicated determination activities.
- `src/cel/mv/medical-validation.cel`: 16 clinical examples for MV.
- `src/cel/regression/medical-validation.cel`: 30 additional controls; full regression evaluates all 46 cases.
- `src/cql/` and `src/fhir/`: eight CQL files and 26 FHIR definitions, including seven Library resources.
- `tests/data/fhir/`: emitted MV patient data and its manifest.
- `tests/results/`: 16 native Questionnaire/QuestionnaireResponse pairs and their manifest, generated with CRL 5.4.2.

The full source remains available for reading; provenance identifies the portions represented by the executable example. The frozen suite at `packages/crl/test/acceptance/bleph` separately exercises engine behavior, including ServiceRequest sourcing and local/source selection.

## Maintain

Author expected results in CEL before running checks. Use full regression for both clinical and engineering cases. Re-emit the CRL definitions, MV patient data, and native results together after changes, and compare the engine's routes and answers with the case expectations. Missing evidence should remain unanswered; explicit negative findings should produce the appropriate unmet result.

The assessment follows the authored sequence: cosmetic purpose, functional necessity, procedure, then its evidence. An unanswered earlier step pauses assessment before later steps. Within each criterion, a known negative requirement establishes that criterion is unmet even if a sibling answer is missing.

Keep generated resources in the paths above so the viewers find matching definitions, data, and results. Human Medical Validation verdicts are recorded through the viewer.
