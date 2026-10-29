# Normalized library compilation cache

The complete engine retains the existing security and presentation-group patches.
Its CQL translator module is a private source build of upstream v5.3.0 at
`88693baefa482ec6f189c90113cfe1f3f4ce9d31`, with `library-manager.patch`.
It is **not** the unmodified upstream Maven artifact. The unchanged coordinate and
translator version are recorded alongside both module hashes in `../cli-build.json`.

The patch performs a second compiled-library lookup after the source provider has
normalized the requested identifier. The source closes on a hit, miss or failure.
Cache modes retain their contracts; successful insertion copies the identifier's
three fields so caller mutation cannot corrupt its map key. There are no namespace
aliases, authored-CQL rewrites or patient-result caches.

## Source build

Use JDK 17 and the projects' Gradle wrappers. Put build caches and temporary files
on the operator's designated scratch drive. Start with dedicated source checkouts;
apply the recorded security and presentation patches to CQFramework commit
`dcac972fc38bc9a29aae2c662dfb5c4917d27234`. Retain the prior build's
`crl/security-20261002` branch and 4.13.0 tag context: a detached checkout without
that context can report a different embedded version despite identical source.
Apply `kotlin-runtime.patch` after those patches to retain the existing Kotlin
2.3.20 runtime. The CQL source checkout must remain at its v5.3.0 tag so its
generated translator version remains 5.3.0.

Apply `library-manager.patch` in the CQL checkout. Place
`NormalizedSourceCacheTests.kt` under
`cql-to-elm/src/jvmTest/kotlin/org/cqframework/cql/cql2elm/`, then run:

```sh
./gradlew :cql-to-elm:jvmTest --tests '*NormalizedSourceCacheTests' \
  --tests '*LibraryManagerTests' :cql-to-elm:jvmJar \
  --no-daemon --max-workers=1 -Pkotlin.compiler.execution.strategy=in-process
```

The executed build passed eight normalization controls and 21 existing manager
tests. Its module SHA-256 is recorded in `../cli-build.json`.

Create a private Maven directory
`org/cqframework/cql-to-elm-jvm/5.3.0/` containing that complete source-built JAR
and the supplied original `cql-to-elm-jvm-5.3.0.pom`. Set
`CRL_PATCHED_CQL_REPOSITORY` to that repository's absolute file URI. Disable CQL
composite linkage in the dedicated CQFramework checkout's local configuration,
so unchanged CQL/Quick modules resolve to their original published bytes. Build:

```sh
./gradlew :cqf-fhir-cr-cli:bootJar --no-daemon --max-workers=1 \
  --init-script <path-to-this-directory>/module-repository.gradle
```

Preserve CQFramework's normal JVM arguments: its Java compiler needs the existing
module exports. The portable repository script implements the same exclusive
module selection used by the executed build. This is a complete source build,
with no class or nested-JAR overlay.

`nested-jars.json` inventories the delivered artifact. Against the previous
engine, only four LibraryManager-family class files differ. The only other
changed nested entry is CQFramework's build timestamp. No dependency versions,
other classes or resource sets change. Build timestamps can change archive
hashes; qualify and publish the same saved bytes rather than rebuilding them
after qualification.

## Qualification boundary

Compiler caching is an optimization, not an alternate clinical contract. Driver
reuse is keyed by current embedded definitions; patient repositories, evaluation
results and terminology expansions remain request-local. Tests must cover
definition edits and reversions at unchanged paths/canonicals, changed patient
data, terminology membership, failures and independent sessions. Source tests
and this inventory do not replace installed-package and frozen native acceptance.
