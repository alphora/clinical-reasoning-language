# Bleph Medical Validation

Open `medical-validation.code-workspace`, then run **CRL: Show Medical Validation** and select Bleph. Opening this folder directly also works, using your configured panes (the default omits the CRL Questionnaire); the workspace file supplies the four-pane example layout. The repository's **Run Bleph Medical Validation (isolated)** debugger configuration opens this workspace.

- `src/cel/mv/medical-validation.cel`: 37 clinical route examples shown in MV.
- `src/cel/regression/medical-validation.cel`: 32 additional engineering controls. Full regression runs these plus the MV cases, for 69 cases total.
- `src/crl/`: the policy and its shared determination library.
- `tests/data/fhir/`: emitted MV patient data and its manifest.
- `tests/results/`: 37 generated native Questionnaire/QuestionnaireResponse pairs and their manifest.

The frozen 116-case native acceptance fixture at `packages/crl/test/acceptance/bleph` is a separate engineering suite. Open this example for interactive MV; the native acceptance folder is not an MV workspace.

## Verification and maintenance

The source and generated artifacts here are the Bleph delivery used during CRL 5.4.0 release testing. The generated-results manifest retains its original producer version and timestamp. Relocating these files does not constitute a new native execution or human Medical Validation approval. The current workspace launch is checked with CRL 5.4.2.

Preserve the split when editing cases: MV examples demonstrate clinical question paths; full regression also exercises missing, conflicting and irrelevant data. Preserve stable case IDs. Re-emit the policy definitions, MV data and native results together when source changes, and compare native outcomes and question answers with the authored expectations. Keep generated files in the paths above so the viewers find the matching resources.

Source anchors are the retained narrative text under `src/anchor-source`. The anchor metadata identifies snapshot verification, not re-verification against an upstream DOCX. `src/provenance` maps current declarations and cases to that text. Human MV must still assess narrative correspondence and review findings.
