# Nautilus log

**Nautilus log** is the first item in Medical Validation's Actions. It stays visible and glows gold when a log is present. Its tooltip also describes availability. Clicking it opens a locked, read-only Markdown preview. If no log exists, it explains that no Nautilus log has been delivered for the policy yet. Reading a log does not mark a flag Fixed or Approved, paint a verdict, change source, or qualify an evaluation.

## File location and ownership

For a managed artifact, use the unique `project.structure.entities` row whose `key` is `medical-validation` in `kelp.project.json`:

```text
<artifact>/<configured medical-validation folder>/nautilus-log.md
```

For `key: "medical-validation", folder: "src/medical-validation"`, the file is `src/medical-validation/nautilus-log.md` relative to the artifact. The reader follows that configured folder for this log only; it does not change other MV stores or project configuration. Missing or ambiguous mappings explain the limitation. No QA-folder fallback is used.

Standalone local examples without a KELP project use `<policy src>/medical-validation/nautilus-log.md`. The Bleph F5 example includes a clearly marked synthetic log for testing the reader. Its entries are demonstration content, not evidence of executed authoring or evaluation.

Pipeline owns the producer. Every Nautilus run contributes an entry at the existing delivery boundary, preserving history and human MV records. Entries identify the policy, run, baseline and candidate; describe the requested work, actual changes or reason for nonimplementation, and checks actually run. They never invent execution evidence or human approval. Older policies need not be rerun merely to create a log. KELP's Re-process Notes remain separate operator instructions in the artifact issue journal. The log shares the medical-validation entity scope, so an explicit MV Save can include it. The producer must finish its writes and release any acquired MV lock before operator review; it must preserve human MV records. The reader never creates, migrates or edits a log, or acquires a KELP lock.

## Availability and read-only behavior

Policy-owned filesystem watchers refresh log availability after creation, deletion, project-mapping changes or artifact-package repair, without rebuilding the tree. A standalone example converted into a managed project after it was opened must be reopened to attach watchers to the new project mapping; clicking always resolves the current file location. Same-policy toolbar refreshes keep the log button's token valid; policy changes invalidate it. Stale-context and busy clicks explain their state instead of silently disappearing. The current mapping, policy identity and file are checked again when opening.

The reader refuses linked files/folders, nonregular entries and paths escaping the selected policy or managed artifact. An invalid project or incomplete managed artifact reports a warning. Histories larger than 2 MiB still light the button, but clicking explains the preview limit and leaves the history unchanged.

The exact file uses VS Code's editor read-only setting, including its source editor. This may add an exact-file entry to workspace `files.readonlyInclude`; it does not change filesystem permissions or stop the producer appending entries. Dirty editors or a matching `files.readonlyExclude` prevent the read-only open. Rendering uses the built-in Markdown preview with its normal trust/link/image behavior, locked to this document.

Preview capability discovery has a ten-second limit outside the source-document open queue. After discovery, the actual preview uses the existing serialized read-only open queue and has no separate command timeout. A stalled viewer command can delay later opens; repeated log clicks say the log is still opening. This limit is not a claim that an unrelated viewer stall has been repaired.
