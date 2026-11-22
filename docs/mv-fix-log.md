# Nautilus log

**Nautilus log** is the first item in Medical Validation's Actions. It stays visible and glows gold when a log is present. Its tooltip also describes availability. Clicking it opens a locked, read-only Markdown preview. If no log exists, it explains that no Nautilus log has been delivered for the policy yet. Reading a log does not mark a flag Fixed or Approved, paint a verdict, change source, or qualify an evaluation.

## File location and ownership

The log is Nautilus/Codify output. Medical Validation only reads it. Codify is a workflow card grouping configured entities, not a literal directory.

For a managed artifact, use the unique `project.structure.entities` row whose `key` is `qa` in `kelp.project.json`:

```text
<artifact>/<configured qa folder>/nautilus-log.md
```

For `key: "qa", folder: "tests"`, the file is `tests/nautilus-log.md` relative to the artifact. This is the primary configured Codify output. Missing or ambiguous mappings explain the limitation. The reader does not search medical-validation, provenance or other folders, migrate an older log, or change project configuration.

Standalone examples without a KELP project use `<example package>/tests/nautilus-log.md`. The package must be the immediate parent of a selected `src` folder or the selected folder itself; arbitrary ancestors are not searched. The Bleph F5 example includes a clearly marked synthetic log there. Its entries are demonstration content, not evidence of executed authoring or evaluation.

Pipeline owns the producer. Every Nautilus run contributes an entry at its Codify delivery boundary, preserving history. Entries identify the policy, run, baseline and candidate; describe the requested work, actual changes or reason for nonimplementation, and checks actually run. They never invent execution evidence or human approval. Older policies need not be rerun merely to create a log. KELP's Re-process Notes remain separate operator instructions in the artifact issue journal.

The producer finishes the log before the normal Codify inspection and delivery snapshot. Existing Codify admission and delivery rules apply; this reader adds no lock, permission, Save or lifecycle mechanism. Human MV records are not log delivery targets. The reader never creates, migrates or edits a log, changes produced/status records, or acquires a KELP lock.

## Availability and read-only behavior

Policy-owned filesystem watchers refresh log availability after creation, deletion, project-mapping changes or artifact-package repair, without rebuilding the tree. A standalone example converted into a managed project after it was opened must be reopened to attach watchers to the new project mapping; clicking always resolves the current file location. Same-policy toolbar refreshes keep the log button's token valid; policy changes invalidate it. Stale-context and busy clicks explain their state instead of silently disappearing. The current mapping, policy identity and file are checked again when opening.

The reader refuses linked files/folders, nonregular entries and paths escaping the selected policy or managed artifact. An invalid project or incomplete managed artifact reports a warning. Histories larger than 2 MiB still light the button, but clicking explains the preview limit and leaves the history unchanged.

The exact file uses VS Code's editor read-only setting, including its source editor. This may add an exact-file entry to workspace `files.readonlyInclude`; it does not change filesystem permissions or stop the producer appending entries. Dirty editors or a matching `files.readonlyExclude` prevent the read-only open. Rendering uses the built-in Markdown preview with its normal trust/link/image behavior, locked to this document.

Preview capability discovery has a ten-second limit outside the source-document open queue. After discovery, the actual preview uses the existing serialized read-only open queue and has no separate command timeout. A stalled viewer command can delay later opens; repeated log clicks say the log is still opening. This limit is not a claim that an unrelated viewer stall has been repaired.
