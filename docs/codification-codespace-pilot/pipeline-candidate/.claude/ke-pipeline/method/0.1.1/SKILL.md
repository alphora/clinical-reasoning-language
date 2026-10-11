---
name: medical-policy-ke-method
description: "Load and apply the shared method for medical-policy knowledge engineering and independent review, including CRL modeling, source fidelity, and questionnaire behavior. Use for a new policy, migration, model repair, or resumed KE task in any project."
---

# Shared medical-policy KE method

This customer-neutral entrypoint applies to actual medical-policy KE work and its review. It supplies no customer rules or authorization and imposes no KE workflow on unrelated work.

## Select and load the accepted release

For an existing project or task, first read its declared `ke-method.binding.json` and active task record. Resolve the accepted core ID, version, manifest digest, actual profiles and explicit workspace mapping before considering an installed default. Do not infer a customer from a startup directory, remembered context or a nearby repository.

Verify the accepted release's manifest and listed files, then read its entrypoint and **both** references in full:

- [Shared method](references/method.md): the modeling and review procedure.
- [CRL contract map](references/crl-contract-map.md): version-bound kit clauses, their force and the distinction between CRL obligations and KE-method practices.

When the accepted release differs from the default, use the available accepted release; assess an upgrade explicitly. Surface a missing/corrupted accepted release or a conflict with active instructions before dependent authoring/review. Do not silently substitute another version or restore legacy rules from memory. Respect current operator direction when resolving conflicts.

For a new unbound KE project, load the explicitly selected neutral default, including both references, and establish actual project/customer/source/lifecycle bindings before customer-specific authoring. Neutral planning and explicitly synthetic work can proceed within their stated scope. Never invent a customer profile or import another customer's rules.

At new-session, resume, context-reset or compaction continuation, reload the binding, accepted method and contract map, applicable profiles and active task record. A transcript summary is a navigation aid, not the method or authorization. A recorded digest does not establish that the current agent read the files.

## Apply with matched contracts

At the KE reference/workflow stage, match the kit to the accepted actual authoring tools and execution runtime; the newest kit available elsewhere is not automatically applicable. Verify current tool capabilities and assess the mapped clauses when their kit hash or accepted version changes, as the contract map explains. The read-only SessionStart loader verifies every manifest-listed installed-default file and injects the available-default SKILL bootstrap and paths. It does not resolve the project binding, read customer profiles, or inject the full references. The agent subsequently resolves the actual binding and active task, loads the accepted release and applicable profiles, and reads the full method and contract map. The loader performs no network retrieval, semantic reassessment or acceptance-state mutation.

Source fidelity is the highest priority. The method distinguishes meaningful condition grouping, genuine reuse, decision width/depth and inline Boolean relationships. Its coherent single-use Criterion practice is a faithful override of the mapped kit's one-use-inline **default**, not a claim that the shipped default changed.

Preserve source eligibility and source-defined precedence; establish partial-answer expectations under matched, accepted CRL/client contracts and verify changes caused by factoring. Keep local outcome vocabulary and deployment requirements in their actual profiles. Use source read-back, maintenance checks, independent expectations, actual rendering and native/client evidence. Returned form items may remain for correction after assessment completion; their presence alone does not establish required interview progression.

Authors and independently launched reviewers record the accepted method version/digest, actual profiles, matched kit/tool/runtime identities and references read in the existing task/review record. Identify conflicts and evidence gaps. Installation, hashes and read receipts do not certify comprehension, fidelity, execution or human acceptance.
