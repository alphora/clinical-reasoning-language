# Medical Validation and regression

<!-- REFACTOR:grounded: operator-approved two-operation scope. -->

MV uses authored examples for each distinct question path. Regression reuses those examples and adds engineering controls. Both use existing CRL/CEL evaluation and emission. See [CEL suites](cel-suites.md) for authoring and command behavior.

The viewer remains as described in [MV component view](mv-component-view.md). Case selection and source-aware joins are the integration changes; this work adds no UI redesign.

Folder-aware operations are introduced in 5.4.0; 5.3.0 documented the proposed organization only. The command and authoring contract is maintained in CEL suites above.
