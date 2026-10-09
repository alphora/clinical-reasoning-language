# Question and answer changes in Medical Review

<!-- REFACTOR:grounded (MV/KE): MV records requested state; KE owns applying content. -->
The pencil on a pinned question opens **Edit Question** for text and description. Answer controls in the expanded pinned editor request wording changes, additions and deletion. Only one editor opens at a time. Save writes a **Question Edit** or **Answer CRUD** flag in `src/medical-validation/flags`; it changes no CRL, FHIR, CQL, CEL, results or provenance files. Imported or externally owned content stays read-only with an explanation.

There is one current-state flag per actual question presentation target and one per terminology/system/code answer, shared across its consumers. It retains the original authored baseline and current requested state. Editing then deleting an answer leaves deletion only; creating then deleting an unapplied answer removes the request. Revert withdraws the request and never undoes authored content. A flag can remain Pending after KE has applied it, because KE does not change MV status. Question field ownership still matters: changing an inherited description requests a change to its shared default.

Pending requests display the requested state and a flag icon. Their Q/A review controls also show current authored content, so a preview cannot conceal an unapplied change. Fixed requests keep this comparison. Approved cards show actual authored content. These special flags can be amended, reverted or reviewed only through the Q/A UI; generic flag controls and MCP cannot alter them.

The separate [Knowledge Engineer app](ke-updates-command.md) previews and applies selected requests to their owning CRL presentations or terminology, generates CQL/FHIR definitions and static questionnaires/responses, and clears saved selections of deleted answers. ValueSets and locally owned CodeSystems reflect answer changes. No authoring-agent rerun is needed. CRL saves to disk without observing locks; KELP handles lock, commit, push and unlock. The app does not write MV flags or provenance.

Every MV flag follows manual **Pending fix → Fixed → Approved**. Pending and Fixed both block completion. KE reports completion out of band; an MV member marks Fixed and approves after checking the actual changes. No automatic Fixed, receipt or machine attestation is required. Meaningful amendments return a flag to Pending; unchanged saves preserve its review state. Legacy resolved MV flags remain Approved.

Current source and generated outputs make repeat application a no-op. Native static generation does not compare expected clinical outcomes: cleared cases are listed for review, and their authored expectations remain unchanged. An open interactive questionnaire keeps its existing definitions and answers until **Restart with updated definitions**. Compilation, native execution and medical approval remain separate evidence.

Existing legacy `crl-patches` and `direct-edits` history remains intact. Pending or unreadable legacy proposals retain their existing explicit disposition requirements; new Q/A saves do not create those records.
