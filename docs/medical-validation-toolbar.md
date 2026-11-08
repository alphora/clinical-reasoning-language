# Medical Validation toolbar

The tree header has two columns: **Status** above **Legend** on the left, with
**Actions** on the right. Actions has room for the Highlight buttons together
and the three questionnaire buttons together. Narrow panes scroll the header horizontally.
Group headings use the gold text glow. The legend retains the tree's existing
colors and meanings.

ANY OF has one green glowing line sample and ALL OF one red glowing line sample,
using the same styles as the Condition key. The **KE** badge identifies flags raised
by the knowledge engineer; Open and Resolved describe flag status.

Actions are ordered: review verdicts, snapshot export, highlighting, outcome
explanation, **Show Panel: Highlighted Source**, **Show Questionnaire:** with
the three questionnaire controls, then source files under the
**Source documents** subgroup heading. A group with
several documents has one named button per file. An empty group is disabled;
incomplete discovery is disclosed rather than reported as empty.

Highlighting compares the selected test with its expected result:

- **Expected-result blockers** identifies conditions or earlier matches that
  prevented that expected result. A blocker can be true if it diverted the path.
- **All unmet conditions** identifies all evaluated false conditions.
- **Explain outcome** adds the existing produced-path explanation overlay.

A correctly expected Unmet result is still a passing test. These controls do
not change clinical evaluation, conditions, or answers.

## Editor panel defaults

The tree and Decision Table use the remaining editor width. Result Questionnaire,
FHIR Questionnaire, CRL Questionnaire, Interactive FHIR Questionnaire, and
Highlighted Source each default to about 380 pixels when open in separate columns.
Smaller windows reduce the support columns equally. Highlighted Source opens the
existing highlighted source viewer immediately left of the tree. Result and FHIR
Questionnaires remain to its right. Source documents opens reference files.

Opening, closing, or rearranging panels and changing Decision Table depth restore
these defaults. Ordinary row selection and focusing another panel preserve manual
resizing. Width updates preserve unrelated editor columns and nested grid structure;
panels placed in separate rows or sharing a column are left in their user layout.

Edit history appears when wording-edit receipts or legacy proposals exist.
Recovery appears when inspection finds recovery work, retained scope locks,
or unreadable recovery evidence. The existing recovery operations remain in
charge of repairs; this toolbar does not perform recovery automatically.

## Reference documents and read-only opening

Documents open with their original file URI in the default VS Code editor,
beside the current pane, without preview replacement. Before opening, CRL adds
an exact literal file pattern to `files.readonlyInclude` in the workspace-folder
settings (workspace settings when the source resolves outside its folder).
This is persistent: it may create or update `.vscode/settings.json` and can
make that settings file appear in version control. Existing scoped entries
are preserved; reopening a configured file does not rewrite the setting.

Unsaved source edits, conflicting read-only exclusions, configuration failures,
or a changed policy/document identity prevent the open and produce an explanation.
File paths are resolved and checked again after asynchronous configuration.
Toolbar messages contain host-owned indices and tokens rather than file paths.

Read-only here is a VS Code editor default, not an operating-system permission
or security boundary. It does not prevent another program, an explicit editor
override, or an extension performing direct filesystem writes. Installed custom
PDF/DOCX viewers require their own interaction verification; passing a text-editor
check does not establish those viewers' enforcement. CRL does not change source
contents, filesystem permissions, viewer associations, or the clinical runtime.
