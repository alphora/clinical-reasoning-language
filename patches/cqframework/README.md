# CQFramework runtime

The current runtime is a maintainer build with dependency security overrides on upstream
`feature-definition-based-population` branch at
`dcac972fc38bc9a29aae2c662dfb5c4917d27234`.
[cli-build.json](cli-build.json) records the exact source, artifact and SHA-256.
It is a branch snapshot with the [security dependency patch](security-20261002/dependencies.patch), not an upstream numbered release. Exact nested JAR hashes are recorded in [the inventory](security-20261002/nested-jars.json).

The override aligns HL7 core 6.9.12 and Jackson through BOM 2.22.3. HL7 updates replace the HTTP/5 stack with OkHttp; the HTTP Core 5.4.4 constraint is a regression guard and is not selected in this build. Java engine source is unchanged, but dependency behavior and the build toolchain changed. The complete resolved graph delta is recorded in [runtime-delta.json](security-20261002/runtime-delta.json). [Build and scan procedure](security-20261002/README.md) records the qualification scope.

This source includes upstream extraction and generated-ID changes, the upstream
unknown-applicability behavior, PR1121's `asked-unknown` condition-result metadata,
and the shared-input question deduplication fix tracked by issue1122.
No CRL pause patch, runtime overlay or Questionnaire postprocessing is applied.
The CRL driver registers the FHIRHelpers namespace and delegates execution to this
engine; the driver remains a separate packaged adapter.

The VSIX and npm package pin the same engine identity. The CLI engine JAR is a
separate runtime dependency: use the shipped acquisition guidance and its distinct
cache path. A previous engine at another cache path is preserved and is not selected
by default. Explicit engine overrides remain possible and are recorded in execution
provenance; they do not establish use of the default engine.

The `main/`, `4.7/` and `applicability-pause/` patch files are historical source
artifacts for earlier builds. Do not apply them to the current upstream revision.
Their manifests identify their original bases; they are not the current runtime
manifest. The historical generated-ID audit is [id-callers.md](id-callers.md).

Upstream source is distributed under Apache License 2.0; see [LICENSE](LICENSE).
Qualification and delivery evidence are recorded in [release integration](../../docs/release-integration.md).
