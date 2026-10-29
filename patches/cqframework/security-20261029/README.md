# Dependency-only normalized-cache security rebuild

Start with the normalized-library-cache source recipe and its unchanged patches.
Apply this directory's dependencies.patch last, then use JDK17 and the same Gradle
bootJar command/private source-built CQL module repository. The override selects
Guava33.7.2-jre on packaged/test runtime classpaths. Keep the original compile API:
the newer nullability annotations otherwise require unrelated Kotlin source edits.
No engine or normalized-cache implementation is changed.

runtime-delta.json enumerates the complete dependency change, including Guava's
annotation/failureaccess dependency graph. All CQF application classes and the
normalized-cache CQL module match the prior engine byte for byte. Only nested
dependencies and Boot dependency indexes differ. The exact delivered JAR and
scanner/database identities are bound by the prerelease SHA256SUMS and scan receipt.

Security gate: checksum-verified Trivy0.75.0, freshly downloaded vulnerability and
Java databases, rootfs scanning only the exact JAR, --scanners vuln --severity
HIGH,CRITICAL --ignore-unfixed --exit-code1. No ignore file or severity waiver.
Baseline scan returned one fixable HIGH (Guava CVE-2026-102554); rebuilt scan
returned zero fixable HIGH/CRITICAL on2026-10-29. This is a dated dependency scan,
not a scan of the containing image. Installed native compatibility is qualified
separately; existing historical policy qualification is not relabeled as a run
against this dependency rebuild. All artifacts are Apache-2.0 upstream source
with individual dependency license/notice files retained.
