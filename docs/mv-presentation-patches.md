# Question wording in Medical Review

The question-card pencil opens **Edit Question** for text and description. **Save** applies changed fields to their owning CRL presentations and locally compiles affected CQL and FHIR definitions, including PlanDefinition input presentation. This requires no KE-agent run. An inherited description changes its shared default owner and therefore every inheriting use.

Local Save works with or without KELP. When available, KELP scope acquisition, Save and release are best effort; failures are recorded without blocking local CRL/FHIR publication. Only scopes acquired by this edit are candidates for release; existing user and foreign locks are preserved. A lock can pull newer files, so actual source inputs are checked again before publication. Package-owned wording requires its owning workspace.

The current path supports one independent policy under its artifact's src/crl and pinned publication metadata. Invalid source, changed editor buffers, ambiguous ownership, missing generated files and unowned generated extras refuse Save with affected paths. Same-path generated content drift can be regenerated during Save. The complete candidate validates and emits before source or definitions are replaced.

Publication records an immutable receipt under src/medical-validation/direct-edits. Previously passing case and criterion reviews become pending; failures, notes and history are retained. Local publication and KELP commit/push are distinct outcomes. A failed KELP Save retains the completed local edit. Interrupted local publication recovers using its file journal even without KELP. KELP handles lock concurrency, commit/push and Save recovery; MV does not add Git routing or push reconciliation.

Open cards refresh from published definitions. Stored native questionnaires retain historical output with stale status when their definition closure differs. An open interactive questionnaire keeps its previous form and answers frozen until **Restart with updated definitions** creates a fresh session. After a direct edit, renewed passing reviews require current generated definitions. Existing projects keep their review workflow when direct editing is unavailable. Compilation, native execution and renewed medical review remain separate evidence.

Existing src/medical-validation/crl-patches records are retained as history. Pending or unreadable records require explicit disposition before completion; direct Save does not silently apply or discard a competing legacy proposal. Direct-edit receipts record new question saves.
