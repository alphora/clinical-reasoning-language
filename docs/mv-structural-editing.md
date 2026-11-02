# Editing the decision tree in Medical Review

Pin a branch that contains the item and its destination. Focus the decision test
or question, then click its **up** or **down** arrow. The pinned branch determines
which Yes/No path to follow when moving down.

Each click saves the CRL and redraws the tree. The branch stays pinned and the
moved item keeps focus, so you can move it again. No separate editor or Save step
is needed. Shared question definitions and existing case facts are retained.

Within a compound condition, arrows reorder its authored operands. A question
displayed in place of a transparent single-input predicate moves with that
predicate. Arbitrary computed inputs cannot be moved independently. Arrows are
offered only where an adjacent move can be made on the selected branch.

Moving adjacent ordered tests retains both continuations, including outcomes
off the pinned path. This can duplicate tests on other paths. Completed Boolean
outcomes are preserved; the order of questions, pauses and input errors can
change. Question wording and answer CRUD still use their existing MV flags.

Saved structural changes reset prior Pass approvals to Pending, preserving notes,
failed judgments and flags. Generated questionnaires/results stay stale across
reopening the app. A source fingerprint also detects later editor undo/save.

Use **Run Updates** after saving a batch of edits. It regenerates CQL, FHIR,
static questionnaires and native case results. It preserves authored case
expectations. Failed processing retains the saved CRL and the prior generated
artifacts. Successful processing does not restore previous approvals.

CRL writes the files; KELP handles scope locks, commit, push and unlock.
