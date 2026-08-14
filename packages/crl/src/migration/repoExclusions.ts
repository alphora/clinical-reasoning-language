// #189 emit-flip · T4 — THIS repo's exclusion manifest for the migration-inventory census. Lives in
// src/ (not the runner) so it type-checks AND a test can assert it has no dead rules against the tree
// (panel R1 Claude #9). Each rule names an intentional-error / non-content `.crl` family + WHY. A rule
// matching 0 discovered files FAILS the scan (drift guard). Targets INSIDE these families are still
// enumerated (as excluded-targets) — exclusion suppresses reconciliation, not visibility.

import type { ExclusionRule } from "./migrationInventory";

export const THIS_REPO_EXCLUSIONS: ExclusionRule[] = [
  // -- Scratch / non-library ---------------------------------------------------------------------
  { contains: "/docs/temp.crl", reason: "scratch doc snippet, not a content library" },
  // -- Import/registry resolution error fixtures --------------------------------------------------
  { contains: "/imports/tests/fixtures/registry-duplicate/", reason: "fixture: duplicate library-name registration (intentional error)" },
  { contains: "/imports/tests/fixtures/name-conflict/", reason: "fixture: cross-file name conflict (intentional error)" },
  { contains: "/imports/tests/fixtures/root-name-collision/", reason: "fixture: root vs local name collision (intentional error)" },
  { contains: "/imports/tests/fixtures/cross-kind-same-name/", reason: "fixture: same name across kinds (intentional error)" },
  { contains: "/imports/tests/fixtures/cycle/", reason: "fixture: include cycle (intentional error)" },
  { contains: "/imports/tests/fixtures/cross-file-ref-cycle/", reason: "fixture: cross-file reference cycle (intentional error)" },
  { contains: "/imports/tests/fixtures/cross-lib-cycle-qualified/", reason: "fixture: qualified cross-lib cycle (intentional error)" },
  { contains: "/imports/tests/fixtures/self-include/", reason: "fixture: self-include (intentional error)" },
  { contains: "/imports/tests/fixtures/unresolved/", reason: "fixture: unresolved include (intentional error)" },
  { contains: "/imports/tests/fixtures/cross-file-unresolved-ref/", reason: "fixture: unresolved cross-file ref (intentional error)" },
  { contains: "/imports/tests/fixtures/qualified-ref-unresolved/", reason: "fixture: unresolved qualified ref (intentional error)" },
  { contains: "/imports/tests/fixtures/qualified-ref-no-include/", reason: "fixture: qualified ref without include (intentional error)" },
  { contains: "/imports/tests/fixtures/multi-slot-refs-unresolved/", reason: "fixture: unresolved multi-slot refs (intentional error)" },
  { contains: "/imports/tests/fixtures/source-path-parse-failure/", reason: "fixture: source path parse failure (intentional error, includes broken.crl)" },
  { contains: "/imports/tests/fixtures/layered-name-collision/", reason: "fixture: layered name collision (intentional error)" },
  { contains: "/imports/tests/fixtures/local-codesystem-urn-collision/", reason: "fixture: local codesystem URN collision (intentional error)" },
  { contains: "/imports/tests/fixtures/sibling-slug-collision/", reason: "fixture: sibling slug collision (intentional error)" },
  { contains: "/imports/tests/fixtures/none-s-collision/", reason: "fixture: none-slug collision (intentional error)" },
  { contains: "/imports/tests/fixtures/partial-concepts-name-collision/", reason: "fixture: partial-concepts name collision (intentional error)" },
  { contains: "/imports/tests/fixtures/criterion-cycle-scoped/", reason: "fixture: scoped criterion cycle (intentional error)" },
  { contains: "/imports/tests/fixtures/criterion-foreign-qualified/", reason: "fixture: foreign-qualified criterion (intentional error)" },
  { contains: "/imports/tests/fixtures/alias-not-yet-supported/", reason: "fixture: unsupported alias (intentional error)" },
  { contains: "/imports/tests/fixtures/package-include-local-no-fallback/", reason: "fixture: package include no-fallback (intentional error)" },
  { contains: "/imports/tests/fixtures/redundant-local-include/", reason: "fixture: redundant local include (intentional diagnostic)" },
  // -- Emitter error fixtures ---------------------------------------------------------------------
  { contains: "/fhir-emitter/tests/fixtures/codesystem-url-conflict/", reason: "fixture: codesystem URL conflict (intentional error)" },
  { contains: "/fhir-emitter/tests/fixtures/cross-lib-activity-collision/", reason: "fixture: cross-lib activity collision (intentional error)" },
  { contains: "/fhir-emitter/tests/fixtures/cross-lib-activity-missing/", reason: "fixture: missing cross-lib activity (intentional error)" },
  { contains: "/fhir-emitter/tests/fixtures/urn-collision/", reason: "fixture: URN collision (intentional error)" },
  { contains: "/fhir-emitter/tests/fixtures/malformed-dispositions/", reason: "fixture: malformed dispositions (intentional error)" },
  // -- Validator error fixtures -------------------------------------------------------------------
  { contains: "/validator/tests/fixtures/ruleb-origin-collision/", reason: "fixture: rule-B origin collision (intentional error)" },
  { contains: "/validator/tests/fixtures/ruleb-origin-collision-inverse/", reason: "fixture: rule-B origin collision inverse (intentional error)" },
];
