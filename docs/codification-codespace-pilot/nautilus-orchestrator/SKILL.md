---
name: nautilus-orchestrator
description: Prepare or resume a human-supervised Codify batch from an existing KELP source artifact; the author works later in a separate Nautilus Codespace.
---

# Prepare a Codify batch

This is an integration candidate. Follow the [project flow](../WORKFLOW.md)
and the selected medical-policy KE method/project binding. Do not claim that a
batch is launchable because a branch or handoff file exists; the provider,
image, pipeline and KELP transitions must be qualified. This skill prepares
the batch. It does not encode a policy or start a Codespace.

## Bind the assignment

Identify the explicit content repository, canonical KELP artifact branch,
committed source and authorized refinements, customer/demo profile, lifecycle
binding, Codify scopes, intended determination, authoring mode and selected
pipeline. Verify actual source-file hashes and complete intake. For a new
unbound project, establish bindings from authorized inputs before customer
authoring. Do not infer a customer from a directory or import a previous
artifact's encoding as unstated source.

Freeze a run/assignment revision with the accepted method, pipeline/profile
manifest, source hashes, output-file allowlist, reviewer/runtime/image pins,
canonical preparation commit and exact branch pair. The prepared branch is
derived, never chosen freely: `<canonical artifact branch>-nautilus`. A
changed source, binding, pin or output scope needs an explicit revision and
recheck of affected work. Reconcile any existing prepared branch and run
record before creating another; never reset authored work on a retry.

## Prepare and stage

KELP Add puts a new artifact in **Ready to codify**, the **Codify** preparation
filter. A codifier may also choose direct Codify from that state without
Nautilus; this skill governs only the assisted route. The Nautilus orchestrator may begin only from that state after the
source snapshot is complete. Use KELP's named, configured batch-start
workflow action to enter **Nautilus in progress**. This changes workflow
tracking, not KELP Lock/Save/Release ownership records. A failed or uncertain
transition must be reconciled before further effects.
KELP checks its generic source-loaded/produced fact and the pass, predecessor
state and assignment revision; the orchestrator checks source completeness.

From the published canonical branch, create and push exactly the suffixed
prepared branch. Install the selected `.claude/` pipeline and `.vibe-tools/`
reviewer material there, commit the root `tmp/` scratch skeleton and durable
run record, and bind the selected Nautilus-image devcontainer configuration.
The canonical branch retains source and KELP lifecycle records, with no
pipeline or scratch ancestry. Verify every installed file against the frozen
manifest from the pushed commit. Preparation does not select the eventual
codifier or create a Codespace.

After the branch, package, source and image identities are verified, call the
named batch-complete workflow action to enter **Nautilus staged**, visible in
the **Nautilus** execution filter. A delayed completion for an old assignment
cannot overwrite a newer pass. If preparation fails, retain its durable run
record and **Nautilus in progress** state; the operator resumes or explicitly
reassigns it by artifact ID/run link, not by silently returning it to a
ready-work filter. Report a concrete blocker instead of inventing a readiness
receipt.

## Operator handoff

Report the artifact, canonical and prepared branches, source/assignment
identity, pipeline/profile, both image identities, exact Codify scopes,
preparation state and next action. A separate codifier finds **Nautilus
staged** in KELP, then Locks the Codify scopes **on the canonical artifact**
from its Codify card. That moves the pass to **Codify in progress**; the card
opens Nautilus in the initiating KELP workspace. Nautilus launches or
reconnects a distinct authoring Codespace on the exact prepared branch under
the codifier's GitHub identity, verifies the effective authoring image, and
guides the human-supervised agent. It does not re-Lock in the authoring
checkout or require a separate KELP lock-status read. KELP's initiating card
owns the Lock and invokes Nautilus after it succeeds; local status on the
prepared branch is not canonical lifecycle proof.
After an ordinary Unlock, the same active Codify pass may be re-Locked to
resume, subject to KELP's existing owner/base and competing-lock checks;
it does not return to Nautilus staged or require another preparation run.

Nautilus SaveCodify in the authoring Codespace reviews saved dirty files,
commits/pushes selected prepared-branch work, and transfers only the exact
reviewed Codify output paths into a canonical-only-parent commit. It does
not merge the prepared branch or call KELP Save. Require current canonical
source/assignment checks, conflict detection, conditional push and a
durable delivery/evidence receipt. Resolve intended edits excluded from
delivery and preserve run evidence before deleting the authoring Codespace.
The initiating KELP checkout refreshes to the delivered commit; the codifier
then Unlocks and separately selects **Complete codify** to enter **Codify in
review**. Unlock alone is not completion, and an authorized unchanged-output
attestation need not fabricate a changed commit.

The KE reviewer subsequently Locks, reviews, KELP Saves changed canonical
review work and verifies the remote result (or records an authorized
unchanged-review attestation), Unlocks and selects **Complete KE** to enter
**Ready for MV**. Human Medical
Validation remains separate. The proposed MV/Publish continuation and any
explicit rework route are in the project flow; they do not override current
KELP publication and human-approval gates.
