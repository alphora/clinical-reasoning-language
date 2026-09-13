# CEL for Medical Validation and regression

<!-- REFACTOR:grounded: two case sets, using existing evaluation and emission. -->

Each policy needs its own `package.json` beside `src`, including its `crl.canonicalBase` and other emission configuration. An outer repository package alone is insufficient for suite operations. Use two folders under each policy's `src/cel/`:

- `mv/`: authored examples covering distinct question paths for human Medical Validation. Include the positive and negative answers needed to reach each path. Missing evidence is not No.
- `regression/`: additional engineering controls, such as overlap, precedence, conflicting evidence and pause/clear cases. Regression runs these together with the MV cases; do not copy the MV cases.

Normal `emit_cel` and `emit_results` select the complete MV set, even when given one MV file. The MV viewer uses that same set. Files resolve independently against the same policy CRL. Give CEL libraries and frozen case IDs distinct identities; case display names may repeat across files. Generated manifests retain the source file and case ID so those cases remain distinguishable.

`crl-run-regression --project <policy>` evaluates the MV cases plus the additional regression controls. `--native` also runs the existing native results producer, with output in a new temporary directory. Its path is reported in the command result. The normal result contains errors and per-case states. Native form production alone does not verify the expected activity/disposition or an interactive answer sequence; use the existing native acceptance checks for those assertions.

When migrating, first create the policy's own `package.json` and preserve its emission configuration; then put existing mixed CEL cases into the appropriate folders. Validate the selected set before emitting. Use Git to record source and review-history changes. Keep frozen IDs for unchanged examples and check existing review associations after moving cases. Unclassified CEL is diagnosed rather than silently included in MV.

Explicit MV emission and validation may warn about supplied local Boolean facts used only by definitively skipped later conditions. The advice is conservative: uncertain dependencies suppress it. Warnings do not change authored facts or prove complete path coverage.

The Result Questionnaire shows questions on the pinned route. The CRL Questionnaire shows the reached case; the FHIR Questionnaire shows native output. These views serve different purposes and may differ. Source correspondence supports source-text highlighting; it does not control tree execution.

MV validation checks MV files; validating a regression file checks the union. A broken engineering file does not prevent normal MV validation or emission. Normal publication refuses the whole selected suite if a declared case cannot emit.

Changed case data or meaning requires renewed review: use a new frozen ID or reset its prior verdict explicitly. Before removing regression-only stale rows from the current MV review file, retain that file in Git. Moving files alone must not carry approval onto changed examples. Superseded generated per-library result manifests are reported as orphaned files for removal from delivery output.
