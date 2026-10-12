# Codify and Nautilus project flow

Status: target workflow, 2026-10-11. The first four transitions below are the
operator's explicit decision. Later rows are the agreed Codify/KE handoff and
the proposed MV/Publish continuation. KELP and Nautilus have not implemented
or qualified this complete sequence. The table is this pilot's mapping:
successful Lock from a configured card moves to that card's configured
in-progress status, and explicit Complete moves to its configured next-ready
status. KELP must read those mappings from configuration, not derive them from
card labels, display order, or shared entity scopes.

| Action | From | To | Ready-work filter |
| --- | --- | --- | --- |
| KELP Add | new source artifact | **Ready to codify** | **Codify** |
| Nautilus orchestrator starts batch preparation | Ready to codify | **Nautilus in progress** | none |
| Nautilus orchestrator completes and publishes the batch | Nautilus in progress | **Nautilus staged** | **Nautilus** |
| Codifier Locks the canonical artifact's Codify scopes from the Codify card, choosing direct Codify | Ready to codify | **Codify in progress** | none |
| Codifier Locks the canonical artifact's Codify scopes from the Codify card, choosing the prepared Nautilus run | Nautilus staged | **Codify in progress** | none |
| Codifier authors and saves by the selected route, then Unlocks | Codify in progress | Codify in progress | none |
| Codifier selects **Complete codify** after verified delivery or authorized unchanged-output attestation and Unlock | Codify in progress | **Codify in review** | KE review |
| KE reviewer Locks review scopes | Codify in review | **KE review in progress** | none |
| KE reviewer KELP Saves any changed canonical review work (or records an authorized unchanged-review attestation), verifies it remotely, Unlocks, and selects **Complete KE** | KE review in progress | **Ready for MV** | MV |
| MV reviewer Locks | Ready for MV | **MV in progress** | none |
| Human MV saves/attests the validation, Unlocks, and selects **Complete validation** | MV in progress | **Ready to publish** | Publish |
| Qualified KELP Publish | Ready to publish | **Published** | published/archive |

**Ready to codify is the preparation queue.** Add enters it immediately, even
if companion source files still need intake. Nautilus batch start must verify
the complete authorized source snapshot and explicit assignment before doing
pipeline work. Nautilus owns the batch predecessor, source-content and
assignment-revision checks. A successful KELP Codify-card Lock sets that
card's configured Project target status on the canonical artifact item;
KELP does not inspect the predecessor Project status or Nautilus batch to
decide Lock admission. Its ordinary entity lock and permission checks still
apply.
In the normal flow, direct Codify begins from Ready to codify, while a
prepared Nautilus run is discovered in Nautilus staged. Nautilus launch
requires a prepared assignment; direct Codify does not. Nautilus in progress
records batch preparation; cancelling or returning that preparation is
explicit. Re-Lock to resume the same active work
after an ordinary Unlock remains allowed from Codify in progress, subject to
the existing owner/base and competing-lock checks. A second batch start or stale batch
completion must not overwrite a newer pass or an active codification.

**Nautilus staged is the execution queue.** The orchestrator publishes the
prepared `<artifact branch>-nautilus` branch and its run record before marking
the batch complete. Nautilus writes the two preparation statuses, **Nautilus in
progress** and **Nautilus staged**, directly to the canonical artifact's GitHub
Project item and supplies the Nautilus filter. KELP does not need a batch API or
knowledge of the prepared branch. KELP writes statuses for its own Add,
card-context Lock and Complete actions, and built-in Package/Publish actions.
The two owners use the same canonical artifact Project item and Status field.
Nautilus retains its own run/assignment revision; KELP uses card context for
its actions. A shared cross-system pass ID is not needed for this pilot. An
ordinary KELP refresh must preserve a Nautilus-written status; a later KELP
action may replace it only for the corresponding lifecycle transition.

**Active work stays out of ready-work filters.** Nautilus in progress, Codify
in progress, KE review in progress, and MV in progress remain findable by
artifact-ID search and a durable active-run/card link after reload. An
interruption keeps the active pass in its state. Resumption or reassignment is
explicit; Unlock by itself neither completes nor requeues work. A cancelled or
returned pass has an explicit destination, while the parent artifact retains
its furthest attained stage for history. Ready-work filters and allowed actions
derive from the current active pass, never from that historical stage.

**Codify completion is a separate human action.** On the Nautilus route,
SaveCodify reviews
saved dirty files, pushes the prepared branch, and transfers only reviewed
Codify output paths to a canonical-only-parent commit. It checks the current
canonical source and assignment, detects output conflicts, conditionally
pushes, and records a durable delivery/evidence receipt. It never merges the
prepared branch wholesale or calls KELP Save. Before deleting the authoring
Codespace, the codifier resolves any intended local edits excluded from
delivery and verifies the run evidence is durable. The initiating KELP checkout
refreshes to the delivered canonical commit, then the codifier Unlocks.
**Complete codify** checks KELP's own lifecycle facts and no remaining relevant
locks; the human confirms the selected route's handback. KELP identifies the
card that initiated Lock or Complete and records the selected route/pass without
adding a separate entity-lock system. KELP does not certify the provider's
clinical work or require a changed output commit when an authorized
unchanged-output attestation applies.

On a direct Codify route without Nautilus, the codifier uses the applicable
KELP Save and remote verification for changed canonical entity work, then
Unlocks and selects Complete codify. No prepared branch, Nautilus Codespace
or SaveCodify receipt is required for that route. The selected route is
workflow-pass metadata, not a second KELP entity lock/session; the human
checks the corresponding handback at completion.

The KE review card owns its subsequent review pass. Findings requiring new
codification return through an explicit new/revised pass according to its
selected route: direct Codify returns to Ready to codify without Nautilus;
assisted Codify returns to Nautilus staged only if the prepared assignment
remains valid, otherwise to Ready to codify for new preparation. Record the
route on the returned pass. Previous completion and review evidence stays
historical; the returned pass must not masquerade as completed. The same
principle applies to MV findings that need KE or codifier rework. The exact
return controls are part of KELP's later workflow design.

The first workflow implementation target runs through **Ready for MV**. The
MV/Publish rows are the proposed continuation, not a claim of released status
controls. Human MV must persist its findings and validation record before
Complete validation. Existing KELP package, freeze, publication-safety and
human authorization gates remain in force; a project status never substitutes
for them. In particular, Publish must exclude the Nautilus pipeline and run
history from `main` before this pilot uses it.
