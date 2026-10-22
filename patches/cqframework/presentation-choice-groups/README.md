# Presentation choice groups: protocol 1 native candidate

Base: upstream `dcac972fc38bc9a29aae2c662dfb5c4917d27234`. Apply the existing
`../security-20261002/dependencies.patch`, then `groups.patch`. The latter contains
all Java source and native tests for this feature. It does not replace dependency
security overrides or apply the historical pause patches.

The compiler descriptor canonical is
`http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-choice-group`.
An encountered annotated input gathers the complete declared group before native
population. Each original profile item keeps its definition, linkId, extraction,
population and enablement. The answerless, nonrepeating list wrapper carries the
descriptor. Missing members, conflicting metadata/ownership and unsafe existing
parent ancestry fail. The shared Questionnaire is the deduplication registry.
The generator allocates numeric root prefixes against the entire existing tree,
including descendants, so later ordinary questions cannot reuse a nested member ID.

Build with Java 17 and the checked-in wrapper, no linked builds/local.properties:

```
./gradlew :cqf-fhir-cr:test --tests org.opencds.cqf.fhir.cr.plandefinition.apply.PresentationChoiceGroupTests --no-daemon --max-workers=2
./gradlew :cqf-fhir-cr-cli:bootJar --no-daemon --max-workers=2
```

Use a bounded Gradle heap and CPU count on resource-constrained hosts. Native tests
need only a 512 MB heap and one test fork. The source checkout's advertised
`spotlessJavaApply` task is absent; that command did not run a formatter.

`candidate.json` records the protocol 1 bytes and source patch identity selected
for CRL 6.4.42. The default runtime pin and complete build provenance are in
`../cli-build.json`. The engine release is a GitHub prerelease runtime asset,
independent of the CRL npm publication. Compiler, client and engine are delivered
together. The driver refuses grouped inputs under an older runtime; ordinary
policies remain compatible. Native, renderer and installed release checks are
separate evidence; customer clinical acceptance remains independent.

Local qualification includes seven native unit tests, eight ordinary/grouped
apply controls, independent extraction/clear, three malformed-input failures,
delegated reuse, and an actual old-runtime refusal. The extension's opt-in
`src/presentationChoiceGroups.native.test.mjs` additionally executes real retained
interactive sessions and KE static-form regeneration. Set `CRL_CHOICE_GROUP_NATIVE=1`
and provide `CRL_CHOICE_GROUP_ENGINE_PATH` and `CRL_CHOICE_GROUP_ENGINE_SHA256`.
Its two tests passed in separate runs after correcting the static test's temporary
storage location. The initial combined run's setup failure is not a passing gate.

The maintained renderer harness is
`packages/crl-vscode/test/presentationChoiceGroups.browser.cjs`; run from repository
root with a directory containing the generated `native-questionnaire.json` and
`native-response.json`. It uses the shipped LForms bytes and local Windows Edge.
Prefilled QR rendering, mouse/Space/Clear, focus, inert/readOnly, ownership handoff,
disposal/reinstallation and responsive layout are distinct from native population
and extraction evidence. Installed release qualification is recorded with each CRL release; these source probes alone do not establish installed acceptance or customer deployment.

`dependency-delta.json` compares nested JAR hashes with the security build: only
the engine implementation module changed. This is a dependency-byte comparison,
not a current vulnerability scan.
