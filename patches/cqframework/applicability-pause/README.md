# Historical CRL applicability-pause patches

These patch series and [manifest.json](manifest.json) preserve the exact source
and build evidence for earlier CRL-maintained engines. They are not applied to the
current runtime. Do not reapply them to `feature-definition-based-population`.

The active engine uses the upstream implementation with no CRL pause setting or
local pause patch. Its exact source and hash are in [cli-build.json](../cli-build.json).
The branch pauses at reached unknown applicability; three-valued condition and
error behavior must be checked through native execution. CRL does not normalize
Questionnaires or alter upstream outcomes to make qualification pass.

See [release integration](../../../docs/release-integration.md) for the current
qualified runtime and the bounded checks that were executed.
