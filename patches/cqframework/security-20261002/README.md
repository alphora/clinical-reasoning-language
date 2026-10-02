# Security dependency build

Base: upstream `dcac972fc38bc9a29aae2c662dfb5c4917d27234`. Apply
`dependencies.patch` to a clean checkout. No Java engine implementation is changed.
Use Java 17, the checked-in Gradle wrapper, and no `local.properties` or linked
builds. Build with `./gradlew :cqf-fhir-cr-cli:bootJar --no-daemon --max-workers=3`.
The branch name used was `crl/security-20261002`; Gradle derives the embedded
snapshot version from that branch and commit. Build outputs and dependency caches
belong outside the source files. This recipe does not claim byte-reproducible ZIP
timestamps; `cli-build.json` identifies the exact delivered bytes.

The convention overrides every requested `ca.uhn.hapi.fhir:org.hl7.fhir.*`
module to 6.9.12 and applies enforced Jackson BOM 2.22.3. HTTP Core 5 is constrained
to 5.4.4 if requested, but is absent from the resolved runtime after the HL7 update.
Resolved dependencies and nested JAR hashes are recorded beside this file.
The existing CRL ApplyDriver remains unchanged and requires separate installed
native execution to establish compatibility with this engine.

The security gate uses checksum-verified Trivy 0.75.0:

```sh
trivy rootfs --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed \
  --exit-code 1 --format json --output scan.json engine-directory
```

Both vulnerability and Java databases must be current. The directory contains
only the exact engine JAR. The original pinned JAR returned 32 findings and exit 1;
the replacement returned zero fixable HIGH/CRITICAL findings and exit 0 on 2026-10-02. Scan reports, database
metadata and scanner checksum accompany the release evidence. These are dated
Java dependency results, not certification of the containing container image or
a claim of perpetual absence of vulnerabilities. No ignore file or severity
override is used.

The four affected upstream unit suites ran 3,817 tests (27 skipped, zero failures).
All four requested upstream integrationTest tasks returned NO-SOURCE; zero upstream
integration tests executed. CRL native/session/UI qualification is separate
integration evidence. Actual results and limits belong in the release receipt.
Existing historical Bleph acceptance records are not refreshed by this update.

Upstream source license: [Apache-2.0](../LICENSE). Bundled dependencies carry their
own licenses. The engine release includes an extracted collection of available
dependency license/notice files and metadata; it is not a complete legal clearance.
The JRE is distributed separately under its distribution's license.

## Resolved dependency and toolchain changes

[runtime-delta.json](runtime-delta.json) enumerates every added, removed and version-changed nested dependency. The HL7 update replaces Apache HttpClient5/Core5 with OkHttp/Okio; the two HTTP Core findings disappear because those libraries are absent. The Core5 constraint is a regression guard, not a selected fix. Saxon moves from 11.6 to 13.0, xmlresolver from 5.2.1 to 6.0.23, sqlite-jdbc from 3.50.3.0 to 3.53.2.0, and OpenTelemetry components also update. Consult the full delta for exact module versions, including rebuilt engine module snapshot identities.

Native CRL session controls exercise local JSON/FHIR questionnaire evaluation. They do not exercise remote terminology/FHIR-NPM package fetches through the changed HTTP stack or Saxon XSLT transformations. Those paths remain unqualified by this release's CRL controls. Jackson BOM 2.22.3 selects annotations 2.22 by design; the cached published BOM records that version.

The build launcher changed from JDK 23 to JDK 17, retaining Java 17 target compatibility. The snapshot version changed because the build has branch/tag history available; see cli-build.json. Neither unchanged Java source nor passing local questionnaire controls implies all transitive behavior is unchanged.
