# Wording changes proposed during Medical Validation

MV question cards display the current CRL presentation and the selected CEL execution's values. **Propose wording** edits the question text and description. **Save MV patch** writes a proposal under `src/medical-validation/crl-patches/<id>.crl.patch.json`. It does not change CRL, CEL, CQL, FHIR, or the evaluation.

This directory belongs to the existing Medical Validation entity. Pull or merge that entity through the normal scope workflow. The KE holding the CRL scope applies the proposal; the MV editor does not acquire that scope or bypass its ownership.

Each patch records the owning file, library, concept, the presentation supplying each changed field, before/proposed text, the exact source baseline and its SHA-256, and a parse-checked candidate source. A description inherited from a default presentation targets that default: changing it affects every use that inherits it. Cards for criteria and uncoded computed conditions are read-only. Editing an imported owner's CRL requires that owner's workspace.

The candidate passes CRL parsing and the owning library's presentation checks. This is not a full emit or Medical Validation approval. The UI keeps the current wording and marks the proposal pending; it does not portray it as deployed. Separate saves create separate records so concurrent reviewers cannot overwrite each other. Resolve competing proposals explicitly, never by file order or last-writer wins.

## Owning KE procedure

1. Pull the MV scope and inspect `src/medical-validation/crl-patches`. Read all proposals for the affected concept before choosing one.
2. Verify the target library/file and original fields. Compare the current source with the recorded baseline. If it differs, reconcile the proposed fields against current CRL; do not replace the file with an old candidate. The viewer requires saved CRL before proposing wording, so the baseline matches the execution being inspected. Save or revert unsaved CRL and re-pin before editing.
3. Apply the changed fields to their recorded presentations in the CRL scope. Preserve other changes and comments. `proposedSource` is a reviewable candidate, not permission to overwrite newer source wholesale. Blank description means removal from the recorded owner, not an empty description declaration.
4. Validate and emit the updated CRL, then regenerate the CQL/FHIR resources and `$apply` results. Rebuild source correspondence where the changed source locations require it.
5. Return the new resources for MV review of the actual wording. A saved proposal alone neither proves application nor renews prior medical approval. Record the chosen patch ID and any modifications in the CRL change description; retain rejected or superseded proposals as review evidence.

The current implementation provides a file-based handoff, not an automatic patch-consumption MCP or an automatic apply status. The KE must report application and validation explicitly. Changing a presentation that was already approved requires renewed review of its wording.

Pending or unreadable patch records block MV completion. After application and re-emission, the owning KE records `status: "applied"` and the validating revision/evidence in the patch; rejected, withdrawn, and superseded proposals retain their explicit disposition. These are workflow records, not automatic proof that emission or renewed MV review happened.
