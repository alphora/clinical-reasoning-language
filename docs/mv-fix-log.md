# MV fix log

Medical Validation's Actions includes **MV fix log**. It opens the selected artifact's running agent report in a locked Markdown preview. The file also uses the existing exact-file editor read-only setting, so switching from preview to its source keeps that editor read-only. This may add the file to the workspace's `files.readonlyInclude` configuration; it does not change filesystem permissions or prevent an authoring process from appending the log. Unsaved editor changes or a matching `files.readonlyExclude` prevent opening it this way.

The report is an agent assessment. Reading it does not mark a flag Fixed or Approved, paint a human verdict, change the source, or qualify an evaluation. KELP's Re-process Notes remain separate operator instructions in the artifact issue journal.

## File contract

Find the policy's `kelp.project.json` and require a managed artifact under that project's `artifacts/` directory, then the unique `project.structure.entities` row whose `key` is `qa`. The report is at:

```text
<artifact>/<configured qa folder>/reprocess-log.md
```

For a configuration with `key: "qa", folder: "tests"`, this is `tests/reprocess-log.md` relative to the artifact. The reader does not guess a `src/qa` folder or substitute a differently named entity. It inspects only this location mapping; it does not validate the full KELP graph or require mutation permissions, locks or an unpublished artifact.

The reader requires the `qa` row. A project whose `tests` folder belongs to a differently named entity remains valid but cannot use this reader yet; ask Pipeline to arrange the supported mapping with the project owner. The action explains this as information and does not change the configuration.

The log is artifact-wide. Entries identify their policy, run, baseline and current candidate so multiple policies or re-authoring runs remain distinguishable. Pipeline owns the content: save the same final MV-fix report section, append new entries while preserving history, and avoid duplicating an entry for a repeated no-change Finalize. Include the log in the normal QA delivery inventory and preserve it across output generation. Record actual Before/After, the source-based ruling, the selected flag or explicit clarification supporting the change, retained/retired review context and checks not run. An unimplemented request carries its actual reason. Do not invent execution evidence or human approval.

The action looks up the current mapping and file when clicked, including after the first report arrives. A missing file or unsupported mapping explains the limitation without blocking MV. An unmanaged/debug workspace, including a debug policy outside an ancestor project's `artifacts/` directory or at that directory's root, reports that no managed-artifact mapping is available. An incomplete managed artifact package or invalid project configuration reports a warning with the specific delivery/configuration problem. A policy switch or a location change during opening cancels that open. The reader refuses linked report files/folders and paths escaping the artifact. Histories larger than 2 MiB explain the preview limit and remain unchanged. It never creates, modifies or regenerates the report.

Rendering uses VS Code's existing Markdown preview and its normal trust, link and image behavior. It is locked to this document rather than following other focused Markdown files. Each click resolves the current report location and issues the locked-preview command; native preview owns its reuse and refresh behavior. Preview availability is checked before adding a read-only setting. Later opening failures also report a warning.

Preview capability discovery has a ten-second limit and does not hold up source-document opens. A timed-out activation cannot later open a preview or write settings through this action.

After discovery, the actual preview command follows the existing serialized document-open behavior and has no separate timeout. A stalled VS Code open command can delay later source-document opens until it settles. The discovery limit is not a deadline for rendering the report.
