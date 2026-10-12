# Codify and Nautilus project flow

Status: target workflow, 2026-10-11. The first four transitions below are the
operator's explicit decision. Later rows are the agreed Codify/KE handoff and
the proposed MV/Publish continuation. KELP and Nautilus have not implemented
or qualified this complete sequence. The table shows the normal pilot path.
KELP reads card order and status targets from configuration, not card labels,
display order, or shared entity scopes. `Lock from=card` takes the ordinary
entity locks. If the card is earlier than the parent's retained KELP stage, KELP
creates or reuses its open rework subtask and leaves the parent unchanged;
otherwise it moves the parent to the card's configured in-progress status.
`Unlock from=card` releases the locks and completes that rework subtask once
the card's locks are released. A separate human **Complete** action hands off
to the card's configured `Ready for <next>` status.

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
| Earlier Codify card is Locked for rework after the parent reached Ready for MV | Ready for MV | **Ready for MV**; open Codify rework subtask | MV parent; rework discoverable |
| Rework Codify card is Unlocked after its locks are released | Ready for MV | **Ready for MV**; matching subtask complete | MV parent |
| Human selects **Complete codify** after rework handback | Ready for MV | **Codify in review** | KE review |
| Nautilus prepares assisted Codify rework after Ready for MV, then Codify card Locks | Ready for MV → Nautilus staged | **Nautilus staged** parent display; open Codify rework subtask | rework discoverable |
| MV reviewer Locks | Ready for MV | **MV in progress** | none |
| Human MV saves/attests the validation, Unlocks, and selects **Complete validation** | MV in progress | **Ready to publish** | Publish |
| Qualified KELP Publish | Ready to publish | **Published** | published/archive |

**Ready to codify is the preparation queue.** Add enters it immediately, even
if companion source files still need intake. Nautilus batch start must verify
the complete authorized source snapshot and explicit assignment before doing
pipeline work. Nautilus owns the batch predecessor, source-content and
assignment-revision checks. KELP uses configured card order to distinguish
ordinary progression from earlier-card rework. It does not inspect Nautilus
batch content; its ordinary entity lock and permission checks still apply.
In the normal flow, direct Codify begins from Ready to codify, while a
prepared Nautilus run is discovered in Nautilus staged. Nautilus launch
requires a prepared assignment; direct Codify does not. Nautilus in progress
records batch preparation; cancelling or returning that preparation is
explicit. Re-Lock to resume the same active work
after an ordinary Unlock remains allowed from Codify in progress, subject to
the existing owner/base and competing-lock checks. A second batch start or stale
batch completion must not overwrite a newer Nautilus run or active codification.
Nautilus's preparation statuses may replace the displayed Project Status, but
must not replace the parent's retained KELP stage used to compare card order.

**Nautilus staged is the execution queue.** The orchestrator publishes the
prepared `<artifact branch>-nautilus` branch and its run record before marking
the batch complete. Nautilus writes the two preparation statuses, **Nautilus in
progress** and **Nautilus staged**, directly to the canonical artifact's GitHub
Project item and supplies the Nautilus filter. KELP does not need a batch API or
knowledge of the prepared branch. KELP writes statuses for its own Add,
card-context Lock and Complete actions, and built-in Package/Publish actions.
The two owners use the same canonical artifact Project item and Status field.
Nautilus retains its own run/assignment revision; KELP uses card context for
its actions and retains its last lifecycle stage independently of the displayed
Status, so an assisted rework run remains recognizable after Nautilus stages
it. Nautilus does not edit that KELP stage. A shared cross-system pass ID is
not needed for this pilot. An
ordinary KELP refresh must preserve a Nautilus-written status; a later KELP
action may replace it only for the corresponding lifecycle transition.

**Active work remains findable.** Nautilus in progress, Codify in progress,
KE review in progress, and MV in progress remain findable by artifact-ID
search and a durable active-run/card link after reload. Earlier-card rework is
findable through its open subtask while the parent's retained KELP stage stays
unchanged, even if Nautilus displays a preparation status.
An interruption leaves the parent and subtask as they are until another
explicit action. Unlock closes the matching rework subtask after its card's
locks are released, but does not perform the configured next-stage handoff;
that requires Complete.

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
locks; the human confirms the handback. KELP uses the invoked card's configured
Complete target and does not need to know whether Nautilus supplied the work.
KELP does not certify the provider's clinical work or require a changed output
commit when an authorized unchanged-output attestation applies.

On a direct Codify route without Nautilus, the codifier uses the applicable
KELP Save and remote verification for changed canonical entity work, then
Unlocks and selects Complete codify. No prepared branch, Nautilus Codespace
or SaveCodify receipt is required for that route. The human checks the
corresponding handback at completion.

The KE review card owns its subsequent work. Findings that need earlier-card
work use the card's rework subtask while leaving the parent unchanged at Lock.
Nautilus preparation is used only if the operator chooses another assisted
run. Unlock closes the matching subtask when its card locks are released;
Complete then performs the configured handoff. The same rule applies to MV
findings needing KE or codifier rework.

The first workflow implementation target runs through **Ready for MV**. The
MV/Publish rows are the proposed continuation, not a claim of released status
controls. Human MV must persist its findings and validation record before
Complete validation. Existing KELP package, freeze, publication-safety and
human authorization gates remain in force; a project status never substitutes
for them. In particular, Publish must exclude the Nautilus pipeline and run
history from `main` before this pilot uses it.
