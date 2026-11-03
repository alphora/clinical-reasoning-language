# Bleph Medical Validation

A light example based on Noridian's [L34194 — Blepharoplasty, Eyelid Surgery, and Brow Lift](https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=34194&ver=27), revision R7, effective October 16, 2025.

The example assesses ordinary functional upper blepharoplasty and blepharoptosis repair, one procedure and eye per case. It checks cosmetic purpose and functional necessity once, then selects the procedure-specific findings and photographs. Clinical findings and photographic evidence are entered as reviewer assessments. The complaint and skin-finding questions demonstrate named answer choices.

**Tree-display teaching additions:** the complaint and skin questions also offer **Uncertain — assume Yes (demo)** and **Uncertain — assume No (demo)**. Only the upper-blepharoplasty branch has an explicit uncertainty guard. These synthetic choices and this asymmetric guard demonstrate the viewer; they are not requirements from L34194 or a model to deploy clinically. The original ordinary answers and 46 case expectations are preserved. The source and refinement remain unchanged; provenance records the additions as authored.

For a session containing multiple procedures, review each procedure separately and assess its necessity in the context of the planned session. Each case represents one assessment; the example does not reconcile answers between separate cases.

## Open and review

Open `medical-validation.code-workspace`, then run **CRL: Show Medical Validation** and select Bleph. Opening this folder directly also works, using your configured panes. The workspace file opens the source, CRL Questionnaire, FHIR Questionnaire, and tree panes. The repository's **Run Bleph Medical Validation (isolated)** debugger configuration opens this workspace.

Select a case and pin its result to inspect the questions on that route. Use **Next** to traverse results and the questionnaire icon to open the Result Questionnaire. Expand descriptions and answer choices to inspect the source-specific wording. Review the corresponding source text, clinical answers, and result before setting a verdict.

The open KE flag under `src/medical-validation/flags/` is a labeled UI demonstration. It lets you test inspecting and resolving an authoring flag in MV. Saved example verdicts in `review-samples/` are separate from active review state.

## Try the new tree displays

Use a source build containing the branch-specific answer groups and uncertainty presentation support (kit 2.46). Released CRL 6.4.48 does not yet support the new presentation line.

1. Select **Upper blepharoplasty — pseudo-MRD 2.0 mm or less**. The ordinary upper route reaches **Met**, with a small **U** beside its terminal. The uncertainty check is hidden, not removed. Click **U** to show the original check and both alternatives; click it again to hide them.
2. Expand the questions and their **Answers** under **Functional Necessity Documented**, **Upper Blepharoplasty Evidence**, and the revealed **Upper Branch Has Uncertainty**. Each check groups its full answer choices by the branch they contribute toward. The earlier checks treat **Uncertain — assume Yes (demo)** as qualifying; the final **ANY OF** instead groups both uncertain choices together, separately for each of its two questions. One question can therefore have different groups under different checks.
3. On the revealed uncertainty check, the green/up group leads to **Unmet**, and the red/down group leads to **Met**. Colors describe the connector path, not whether a result is favorable. Group headings and arrows use the connector glow; answer text retains its ordinary color.
4. Select **DEMO — upper branch rejects an uncertain qualifying complaint**. Its expected result is **Unmet**. The reached uncertainty check stays visible so hiding cannot conceal that result.
5. Compare **DEMO — ptosis branch has no uncertainty guard**. It contains the same uncertain qualifying complaint but reaches **Met** through the deliberately unguarded ptosis branch. There is no uncertainty check on that branch. This contrast is for teaching, not a clinical recommendation.

The guard is a Criterion combining two membership checks with `or`, displayed as **ANY OF**. Both answers are required by earlier criteria on this route. Missing evidence still pauses there; it is not interpreted as an ordinary or negative answer. **Uncertain — assume No (demo)** fails the earlier qualifying test and never reaches the terminal guard.

## Interactive questionnaire

In the Medical Validation tree toolbar, choose **Interactive FHIR Questionnaire**, then **Start**. The included synthetic Patient and request have no clinical answers: the first unanswered question is Cosmetic Surgical Purpose. Answer the form and use **Continue / Re-evaluate** to see the next questions or determination. **Reset** starts again without your answers.

The request supplies demo context only. Its CPT code does not answer Procedure Under Review; choose that procedure in the questionnaire when asked. Either procedure branch can be exercised from this starter.

`tests/interactive-questionnaire/requests.cel` authors the initial Patient and ServiceRequest. The pane reads the matching `request-1/request-bundle.json`, not CEL directly. This starter is deliberately separate from the 18 MV cases and 34 regression controls; open the existing MV entry, not the starter CEL, in Medical Validation. Normal suite-based CEL emission does not select this seed.

With the repository dependencies installed and core built, run from the repository root:

```sh
node examples/bleph-medical-validation/tests/interactive-questionnaire/generate-request.cjs --check
node examples/bleph-medical-validation/tests/interactive-questionnaire/generate-request.cjs --write
```

The first command checks CEL/bundle agreement; the second regenerates only the initial request bundle. Neither replaces MV patient data, native results, or saved review state.

## Included artifacts

- `src/source/`: versioned L34194 HTML, readable policy text, and retrieval metadata.
- `src/refined-source/`: structured L34194 source in Markdown and Word.
- `src/anchor-source/`: canonical text rendered from the Word source, with hash metadata.
- `src/provenance/`: source attribution for the CRL and clinical cases.
- `src/crl/`: policy and communicated determination activities.
- `src/cel/mv/medical-validation.cel`: 16 original clinical examples plus two labeled tree-display demonstrations.
- `src/cel/regression/medical-validation.cel`: 30 original controls plus four demo controls; full regression evaluates all 52 cases.
- `src/cql/` and `src/fhir/`: matching generated CQL and FHIR definitions.
- `tests/data/fhir/`: emitted MV patient data and its manifest.
- `tests/interactive-questionnaire/`: answer-free interactive starter CEL, its generator, and request bundle.
- `tests/results/`: 18 native Questionnaire/QuestionnaireResponse pairs and their manifest, generated from this source build with the pinned Quantity-capable normalized-cache engine. The manifest records actual tool/engine/input hashes. This is source-fixture evidence, not released or installed-artifact qualification.

The full source remains available for reading; provenance identifies the portions represented by the executable example. The frozen suite at `packages/crl/test/acceptance/bleph` separately exercises engine behavior, including ServiceRequest sourcing and local/source selection.

## Maintain

Author expected results in CEL before running checks. Use full regression for both clinical and engineering cases. Re-emit the CRL definitions, MV patient data, and native results together after changes, and compare the engine's routes and answers with the case expectations. Missing evidence should remain unanswered; explicit negative findings should produce the appropriate unmet result.

The assessment follows the authored sequence: cosmetic purpose, functional necessity, procedure, then its evidence. An unanswered earlier step pauses assessment before later steps. Within each criterion, a known negative requirement establishes that criterion is unmet even if a sibling answer is missing.

Keep generated resources in the paths above so the viewers find matching definitions, data, and results. Human Medical Validation verdicts are recorded through the viewer.

Run `node examples/bleph-medical-validation/tests/check-tree-demo.cjs` from the repository root after building core. It checks all 52 CRE expectations, the single upper-branch presentation marker, both complete uncertainty answer partitions, and their contrast with ordinary qualification. Native execution and rendered-viewer checks remain separate evidence.
