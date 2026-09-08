# Broader survey dispositions

In progress. Sources inspected on60e0cd0c/dcf63244, 2026-09-08. These are source-review
dispositions, not new execution claims. Paths below are relative to `packages/crl/src`.
The full discovery set and execution reports remain in test-inventory.json.
Every mixed file retains its applicable cases for mapping; a legacy fixture is
not silently excluded together with unrelated current behavior.

## Imports — all20 test files read

| File under imports/tests | Disposition of tests/rows |
|---|---|
| namespace.test.ts | Separate name maps and legacy flat first-wins view are internal. Same concept names in different libraries can be legal, but this flat map does not prove qualified lookup or emission. Criterion skip is a crash regression, not proof that criteria vanish semantically |
| scoping-v21.test.ts | Map qualified local sibling, missing target, required external include, aliases ignored, redundant local include, duplicate names, cycles and self scope to library-scoping guidance. Soft diagnostics are validation mode only. Concept alias fixtures are legacy inputs, not authoring examples |
| registry-and-resolver-v21.test.ts | Map explicit include/package priority, package prohibition on consumer-local fallback, duplicate local library names. Remaining registry/localLibraries bookkeeping is internal |
| index.test.ts | Resolver failure/cycle/duplicate handling supports library scoping. Cross-kind/cross-library examples only prove registry namespace behavior. Anonymous-root skipped marker has no execution evidence. CMS22 layout is a legacy resolver fixture |
| registry.test.ts | Nearest package.json and nested package boundaries support project guidance; duplicates support library-scoping. Broken unrelated local-file warning does not prove a broken dependency is usable. Anonymous skipped marker excluded |
| resolver.test.ts | Missing includes and self/multi-file cycles support diagnostics guidance. Topological ordering/diamond dedup are internal, not authored precedence |
| validate.test.ts | Qualified reference, unresolved attribution, cycles, duplicate-name scope and structural resolver errors support scoping. Final test title falsely claimed global transitive visibility from a directly included local-library fixture: narrow the title. Successful legacy content is not new-model certification |
| overlay.test.ts | All rows test unsaved-buffer transport and attribution; no new language claim. Overlay fixtures use legacy definitions and must not be kit examples |
| emit.test.ts | Current standalone-age row supports source-preservation in split CQL, not native evaluation. Import/collision failures, stable filenames/catalog closure and parameter routing are candidate bounded claims. Legacy aliases, exists reductions, implicit Scalar question lowering, per-CRL split strategies and local-domain seed collisions must not become new authoring recommendations. Internal split planning/idempotence excluded. Tests explicitly admit some negative include assertions are vacuous on failed emission |
| criterionMultifile.test.ts | Map concept/criterion name collision in either order, library-local criterion references and cycle errors. Same criterion name in two libraries is not itself a cycle |
| criterionTripwire.test.ts | All seven public callers assert presence of criterion-only dependencies. The CRE counterfactual uses legacy RecordSet presence semantics; do not teach missing answer as false. Candidate current dependency-closure evidence must use selected-publication owning tests. Provenance reachability is not source-fidelity proof |
| criterionAcceptance.test.ts | Doubling-DAG count/body/size tests establish bounded emitted structure, not native execution. Serialized criterion body-once/reference-after is trace internals; no new author syntax. Legacy RecordSet inputs not delivered examples |
| criterionEmitEndToEnd.test.ts | Named criterion define and dependency-input closure are candidate structural claims. Compound guard/criterion fixtures are legacy RecordSet. `unless` Coalesce tests document the old per-action path, not desired publication pause. Fixed-date repeated emit is determinism evidence only |
| booleanCompositionCrossLib.test.ts | Entire file exercises legacy defined-as Boolean composition and its totality/alias limits. Excluded from positive selected-concept teaching; retained regression coverage does not authorize that form |
| booleanCompositionInferred.test.ts | Entire file exercises legacy defined-as composition and scalar re-exports. Excluded from positive selected-concept teaching |
| definedAsExistsInferred.test.ts | Entire file exercises legacy scalar existence/sem composition and explicit refusal of a subset of both-representation forms. Excluded from positive teaching; it cannot establish current absence-as-false semantics |
| dispositionValidate.integration.test.ts | Map configured option closed set, communication request type and malformed config failures; no config means this validator does not enforce the optional option set. Filtered diagnostics do not prove full correctness; Condition guard fixture is legacy. Detailed disposition-model audit remains pending |
| publicationEmit.test.ts | Current cross-library nullable value/record emission, physical routing, invisible package refusal and unsupported context are applicable. Snapshot/no-I/O mechanics excluded. See inspection notes624; map to publication/scoping claims, no native execution |
| foreignPublicationInterface.test.ts | Foreign-only Boolean publication decision does not require an unused local publication; CQL physical-name collision errors. Old unused-local mutation is regression-only |
| preparePublicationContext.test.ts | Explicit package-first, implicit local-first, package visibility, unsupported alias and consumer-local isolation are applicable. Admission/answer-domain closure and FHIR-only dependency preservation have separate publication evidence. Map/cache/freeze/snapshot details are internal |

## Language services — all14 test files read

These test editor adapters, often using incomplete or retired CRL and fake symbol
indexes. Their suggestions are not an emitter capability list. No positive CRL
example is taken from them. Any feature advertised in the kit needs the real
extension adapter evidence as well as these headless functions.

| File under language-services/tests | Disposition |
|---|---|
| contracts.test.ts | Entire file is coordinate conversion/defensive range internals; exclude from language teaching |
| host.test.ts | Entire file is filesystem/overlay host behavior; exclude from language teaching |
| refRanges.test.ts | Entire file is token-range/qualifier regression coverage; exclude from language teaching |
| completion.test.ts | Slot filtering, grammar-list suggestions, snippets and fake-index precedence are editor behavior; no language admission claim. Grammar suggestion versus supported emission distinction belongs with concept-form |
| hover.test.ts | Markdown/token selection is editor behavior. Patient parameter explanation needs independent emitter evidence before teaching; provided fake pattern is not proof of catalog support |
| navigation.test.ts | Fake-index links/definition/reference/rename bounds are editor behavior. No broad cross-workspace rename claim. Library rename is explicitly unsupported by this function |
| criterionRename.test.ts | Real-index rename updates concept/decision/criterion references including presentation scopes, preserving identical question prose. Useful editor capability; source identity versus wording claim already belongs to presentation. Parsing changed text does not establish emission or provenance integrity |
| diagnostics.test.ts | Mapping, overlay, crash sentinel and multi-file attribution are adapter behavior. Information-level crash is not clean validation; no further language example |
| celCompletion.test.ts | Decision result offers bare pause; Boolean result offers true/false; reference slots are distinguished. Map language semantics from CEL validator/CRE owners, not fake completion indexes. Multi-type Boolean suggestion is not publication admission |
| celCompletion.integration.test.ts | Real index populates covered/sibling symbols and decision activity names. Legacy concept definitions only test editor discovery; no whole-policy semantic claim |
| celDiagnostics.test.ts | CEL overlays, own-file filtering and source severity mapping are adapter behavior. Windows path case branch explicitly returns early elsewhere; passing status alone is not cross-platform evidence |
| celHover.test.ts | Entire file is token-slot hover formatting and context construction; exclude as semantic evidence, link only if advertising editor hover |
| celNavigation.test.ts | Fact/library/decision/arm locations and named-anchor versus fact reference distinction. Navigation internals; temporal language semantics need CEL owning tests |
| celSymbols.test.ts | Covered closure works outside ProjectIndex's project-layout gate; local/package symbol shadowing. Editor symbol availability does not establish CRL package visibility; avoid conflating CEL resolution with CRL import rules |

## FHIR model and migration — all4 test files read

| File | Disposition |
|---|---|
| fhir-model/tests/elementPath.test.ts | Entire file is qualified-to-relative path normalization; internal, no author input recommendation |
| fhir-model/tests/fhirValueModel.test.ts | R4 carrier table and malformed/unmodeled distinctions are model-layer evidence, not current publication type admission. Do not teach all11 modeled Observation value variants as implemented publications. Wiring/import allowlists are internal. Final Boolean-carrier test title incorrectly infers existence semantics from absence of a carrier; narrow to the asserted model lookup |
| migration/tests/retiredFormCorpus.test.ts | Text scans guard tracked corpus against value-element and concept-level age-today forms; they do not establish correct replacement emission. Positive migration guidance belongs to current publication tests. Raw text scan includes comments and excludes ignored scratch by design |
| migration/tests/migrationInventory.test.ts | Entire suite targets the previous migration classifier/inventory. Its Boolean-presence recipes and exemptions are not #320 migration instructions. A clean inventory does not mean Scalar retirement or new-model migration is complete. One test title claims missing type but actually supplies Observation; narrow that title. Reconciliation/closed-set/exclusion mechanics are internal |

## CEL — all22 test files read by native reviewer626

Paths in this table are relative to `cel/`. Limits describe the inspected before-state;
review628 corrects the five teaching defects and the Quantity example. Remaining
legacy fixtures are regression inputs, not positive kit examples.

| File | Disposition and exact evidence boundary |
|---|---|
| `tests/index.test.ts` | **Applicable syntax candidates:** Boolean versus numeric/string/quantity literal parsing; qualified `defined by`; anchors, reference dates and cross-resource relation AST fields. **Exclude semantic claims:** these are parser assertions. The syntax-reference library is deliberately unresolved. CMS result literals are not executed here; preserving a `false` AST does not establish the intended clinical result. |
| `tests/caseId.test.ts` | **Applicable:** explicit ID parsing/hoisting, allowed spelling, reserved generated-ID spelling, duplicate/multiple-ID diagnostics. **Limit:** does not establish that renaming a case preserves its emitted FHIR identities; do not equate authored case IDs with the emitter's naming inputs. |
| `tests/definedByResolve.test.ts` | **Internal resolution coverage:** Concept/Activity target kind, source identity and local/package lookup. The same-name Concept/Activity rows establish first-declaration resolution, not unambiguous authoring. Do not advertise every qualified reference as necessarily identifying a concept. |
| `tests/temporal.test.ts` | **Applicable bounded distinction:** accepted date syntax differs from comparability; table rows cover partial dates, offsets, leap seconds and precision. **Internal-only:** compatibility-comparator results are not the complete selected-publication ordering policy. In particular, do not promote its calendar-versus-timestamp indeterminacy into a universal selection rule. |
| `tests/factDate.test.ts` | **Applicable:** reference date overrides a valid fact-body date; body date is fallback; undated facts remain undated even with `anchor is now`; Patient birth date is not effective date; authored `now` uses the supplied clock. Error rows cover missing/invalid anchors and unsupported arithmetic. **Limit:** helper calls with repeated references do not prove those references can coexist in emitted data. Month-end calendar arithmetic is not established by the away-from-boundary examples. |
| `imports/tests/resolver.test.ts` | **Applicable:** project-root/covered-library resolution requirements. **Internal-only:** overlay and corpus registry assertions. Successful resolution is neither publication admission nor decision execution. |
| `validator/tests/validator.test.ts` | **Applicable diagnostics:** bare resource versus qualified declaration references; result shape; Boolean result-leaf requirement; transitive activity arms, including resolvable cross-library delegation; duplicate names; unresolved references; include/soft-mode behavior. **Legacy fixtures:** self-referential/default-shape concepts, old existence/composition forms and source forms must not become positive examples. Several tests filter one diagnostic kind; “no such diagnostic” is not a clean pipeline. The empty-decision row accepts either parse failure or a branch error, so it does not establish a specific diagnostic. |
| `validator/tests/booleanValueRules.test.ts` | **Legacy diagnostic regression:** bare/numeric value-reading interface assertions, explicit Boolean values, presence-only warning and sem-composite warning. Preserve conditional diagnostic evidence; do not teach implicit presence concepts or sem forms. Missing selected-record values require the replacement model's existing evidence, not this fixture's rejection rule. |
| `validator/tests/numericValueRules.test.ts` | **Applicable claim candidate:** Quantity requires a nonempty unit-bearing literal; dimensionless values and coded values have different literal contracts. **Input migration required:** the fixture includes legacy/default and explicit Scalar declarations. Assertions generally isolate numeric diagnostics rather than establish complete success. |
| `validator/tests/localMembershipWarning.test.ts` | **Applicable:** deliberately wrong local codes remain warnings; correct/default local codes do not warn; source nonmembers have a separate warning. **Legacy outcome exclusion:** the imported fixtures' closed-world approve/deny expectations are not established by these warning assertions and must not be promoted to selected-answer behavior. |
| `validator/tests/bareFactWrongSystem.test.ts` | **Applicable diagnostic candidate:** a bare resource carrying a local code under the wrong system differs from the actual local CodeSystem; unrelated codes are not all near misses. **Legacy input:** Scalar declaration. Neither a warning nor its absence proves a selected answer or clinical determination. |
| `validator/tests/factDate.test.ts` | **Applicable:** invalid authored dates are not repaired by an override; malformed/duplicate dates and anchors are diagnosed; partial Patient birth dates are accepted; undeclared clocks are not consulted. **Limit:** calendar acceptance does not prove selection ordering or native age calculation. |
| `validator/tests/identityDiagnostics.test.ts` | **Applicable directly:** repeated emitting identity despite changed date/intent; Patient exceptions; ambient Encounter collisions; normalization collisions; cross-case reuse; resource-type distinction; separate names for separate resources. Tests assert actual emitted-case/resource results and validator agreement. These are the owning tests for finding3. |
| `emitter/tests/emitter.test.ts` | **Internal corpus regression:** counts, field mapping, typed references, identity length, codes, Quantity carrier and encounter date. Selected individual field assertions do not establish complete profile conformance or the corpus's decision expectations. Keep legacy corpus concepts out of positive publication teaching. |
| `emitter/tests/emit-fhir-golden.test.ts` | **Internal byte regression only:** compares serialized files and paths in normal mode. With `UPDATE_GOLDEN=1`, it regenerates and does not supply the same comparison evidence. Record that execution mode separately. Golden equality does not verify clinical intent or native `$apply`. |
| `emitter/tests/resource-coverage.test.ts` | **Legacy resource-mapping regression:** asserts selected Patient/Observation/Procedure/MedicationRequest fields and profile tags. Its fixture uses old local existence determinations, including non-Observation concepts. Do not present it as an admitted publication example or complete QI-Core validation. The synthetic requester/default fields are not authored clinical facts. |
| `emitter/tests/compartmentPathAuthority.test.ts` | **Internal path-authority coverage:** view-model and emitter agree on the Patient compartment and normalized resource directories. Useful support for “use returned paths”; not a clinical example. Fixture includes Scalar. |
| `emitter/tests/bareTypeUncoded.test.ts` | **Applicable:** a bare coded-retrieve resource needs `code is`; putting a token in `value is` does not supply resource identity; Patient exemption; qualified local identity derivation. **Limit:** warning behavior and emitted data only, using a legacy supporting concept. |
| `emitter/tests/classifyConceptRole.test.ts` | **Internal dispatch regression:** local/source/derived classification for historical concept forms. Classification does not prove assertion eligibility, emission or execution. Exclude the old sem, collection and age forms from positive teaching. |
| `emitter/tests/derive-local.test.ts` | **Applicable:** default local identity derivation; preservation of a well-formed authored nonmember; malformed token rejection. **Legacy/native limit:** the comments' wrong-code-to-false and external `$apply` assertions are broader than this suite's byte assertions. Do not promote them as current selected-publication round-trip evidence. |
| `emitter/tests/derivedRejectEmit.test.ts` | **Applicable bounded rejection:** code-less derived targets cannot be directly asserted; the typed/untyped rows check rejection and lack of emitted clinical resources. **Do not generalize:** coded computed publications intentionally retain local-answer capability. The Activity-name collision row checks dispatch behavior, not the correctness of ambiguous authoring. |
| `emitter/tests/b4-coded-value.test.ts` | **Applicable distinction:** Observation identity coding and its CodeableConcept answer are separate; explicit answer token mapping; malformed/wrong literal diagnostics. **Legacy limits:** the imported both-representation fixture is not current publication teaching; bare-token rejection there does not invalidate current named-answer bare codes; a valueless emitted Observation does not prove a remote default or Q/QR session. |


## Grammar and emit adapters — 632

The following lead notes describe the inspected2e645034 before-state. Review632
migrates the positive ordering example, repairs malformed parser fixtures and
changes the old terminology literal to a canonical URL. Remaining legacy-only
regressions stay separate from current teaching. Current mappings are in coverage.md.

- ast/tests/activity-structure.test.ts: request/with reference versus literal,
  do-not-perform AST flags. Empty literal becoming absent is parser behavior,
  not supported clinical action content. Types need emitter evidence.
- ast/tests/concept-body-order-independence.test.ts: prefix order and singleton
  cardinality; representation fields trail. Shared trailing fields can attach
  to representation despite dedenting. Nonshared concept lines error. Positive
  fixtures use retired value-element/source type annotations; migrate a bounded
  owning example before teaching source-block order from them.
- ast/tests/concept-model-t1.test.ts: historical value-element/exists/age syntax,
  dependency walk and closed-world legacy CRE regressions. Do not promote any
  of those fixtures as current selected publications. Parse-only placement
  evidence supports concept-prefix/source-suffix rule, not arbitrary projection.
- ast/tests/concept-structure.test.ts: entire file skipped pre-v0.7 syntax.
  Excluded as current evidence. Cleanup debt, not a supported inferred-from form.
- ast/tests/representation-structure.test.ts: entirely old representation model,
  inherited type/coded-from and sem union AST shapes; no current publication claim.
- ast/tests/terminology-structure.test.ts: system/code and valueset name parsing;
  valueset string 'bmi valueset' is not canonical validation/membership evidence.
- ast/tests/library-and-include-structure.test.ts: required library, optional
  single leading header, include ordering and no version clause; AST locations
  internal. Arbitrary narrative reserved words parsing is not pattern support.
- ast/tests/meta-carrier.test.ts: library metadata before includes, decision
  metadata before qualifier/branches, concept meta placement. Old tag examples
  are parsing inputs, not instruction to restore workflow flags to CRL metadata.
- ast/tests/decision-structure.test.ts: nested/duplicate AST preservation and
  per-action guard attachment. Some any-over-conditions and unqualified multi-
  branch fixtures violate semantic rules. No native or admissibility evidence.
- ast/tests/criterionClassify.test.ts: plain/self-qualified criterion classification,
  transitive/nested traversal; DNF/index internals. Foreign qualification is not
  classified locally. Retired Condition/implicit concept fixtures not examples.
- lexer/tests/comments.test.ts: // and /* */ skipping; skipped pre-v0.7 tests
  excluded. Lexer fragments lack library and cannot be delivered as standalone CRL.
- lexer/tests/error-listener.test.ts: lexical errors and grouping/locations,
  two skipped old error-count rows. Misleading title 'detect invalid tokens in
  a decision' actually expects zero lexical errors; no parser-validity claim.
- lexer/tests/whitespace.test.ts: whitespace between tokens ignored; fragments
  need syntax/admission separately. Does not prove whitespace INSIDE reserved
  multiword tokens can vary. Skipped old inferred-from form excluded.
- lexer/tests/value-element.test.ts: retired value-element token/mode recovery
  and exists keyword lexing. Entire file excluded as positive current authoring.
- parser/tests/createParser.test.ts: parser creation and error listener only;
  undefined references not resolved; missing final dot errors. No emission claim.
- emit/tests/publicationSource.test.ts: exact finite source system/code matching,
  source witness -> true record, input identity versus generated CF, time and local
  competition. Subject retrieval versus already-retrieved adapter distinguished.
  Source-state errors, malformed dates, collisions, finite-domain refusal and
  multi/package-source emission relevant; partitions/leaf eligibility internals.
  No native run, provider deployment or all ServiceRequest states supported.
- emit/tests/publicationTemporal.test.ts plus publicationTemporalVectors.ts:
  mixed calendar/instant bounds and exact selected-record preservation, invalid
  and unsupported vectors. Publication comparator differs from legacy CEL helper.
  These do not establish producer-specific age ordering. No need to teach each
  extreme date; existing incomparable-validity rule consolidates them.
- emit/tests/presentation.test.ts: relevant text/description inheritance,
  alternative scopes and overlap errors; no foreign override; missing text and
  label/short fail; coded boolean/CC/Quantity accepted, uncoded rejected; missing
  presentation warning; same-named concept/decision kind handling; actual Bleph
 11 presentations. Head lacks full publication contract: catalog acceptance
  is not full emission admission. Invalid examples intentionally reject.
- emit/tests/publicationContext.test.ts: entire suite tests raw scope callbacks,
  identity/namespace/cache/freeze behavior. Explicit mocked alias resolution is
  not authorable include aliases. Scope guidance owned by real import tests;
  do not advertise adapter capability as source syntax.
- cre/tests/publicationSource.test.ts: actual CEL-emitted finite ServiceRequest
  supplies true; absent/nonmatching witness pauses reached decision, newer false
  denies, newer valueless answer pauses, newer source wins. Unsupported state
  errors distinct from unknown; relative subject provider limitation. No native
  execution. Several negative rows deliberately use an Approve oracle and inspect
  no activity/blockedUnknown rather than status pass; do not copy oracle as expected.

- emit/tests/boundaryTransform.test.ts: Legacy constructor capability/field lookup. Does not prove absence of a carrier is a false current answer; no positive example.
- emit/tests/booleanTotality.test.ts: Legacy Scalar/RecordSet totality and internal ledger proofs. Three-state and implicit-age retirement rows stay separate. Not current selected-answer boundary semantics.
- emit/tests/closeIndex.test.ts: Internal ledger identity/routing/proof and legacy CMS closure. Proven metadata is not native clinical evidence; mock aliases are not authored include aliases.
- emit/tests/declaredResultIndex.test.ts: Internal index, scope callbacks, public-twin selection and totality. Mock alias/Scalar rows do not define current authoring guidance.
- emit/tests/resourceEmitRegistry.test.ts: Internal coding/recency/profile field shapes, registry defaults and constructor string identity. Grammar resource capability exceeds current publication admission; old profile/title/native comments are not fresh FHIR conformance or execution proof.
- emit/tests/recordConstructor.test.ts: Internal constructor signature/capability/registry/context/content-key assertions. No Patient constructor here does not mean CEL cannot emit Patient. Old constructor time parameters do not constrain current age recalculation. Legacy shapes are not authoring admission.
- emit/tests/effectiveRepresentation.test.ts: Legacy local/source descriptor fields, refusals and import-boundary scan. Retired age refusal remains meaningful migration evidence. Old exists/most-recent/Scalar/valueless fixtures and stale implicit-type titles are not current publication examples; internal import allowlists are not kit rules.

## Provenance — 33 files, review629

Before-state source dispositions;632 corrects accepted teaching/fixture findings. No new native execution is claimed.

| File | Disposition of inspected cases |
|---|---|
| `canonicalize.test.ts` | **Applicable:** NFC UTF-8 half-open offsets, source/anchor hashes, warnings, unsupported-document failures, output recovery. **Internal:** ZIP/XML/CRC cases and golden bytes. Footnote exclusion requires finding 4; sidecar write failure can leave a new text file with missing/stale metadata. |
| `chainBaseline.test.ts` | **Applicable:** exact standalone path refs across deep delegation. **Internal:** VM/decomposer agreement. **Legacy:** Condition/default-shape and old CEL fact fixtures; no current publication or native proof. |
| `conceptContainment.test.ts` | **Internal:** transitive containment, cycles, diamonds, stable deduplication. Synthetic graph mechanics do not establish concept-composition authoring semantics. |
| `conceptShape.test.ts` | **Internal:** inventory, leaf eligibility, flattening, deduplication and error paths. **Legacy:** sem composition and old source forms; equivalence to the old Case Feature collector is not new-contract admission. |
| `correspondence.test.ts` | **Applicable:** source-byte drift, unresolved references, frozen identity, navigation loci, coverage and mode distinctions. **Internal/legacy:** cockpit model assembly over old concept fixtures; no rendered UI or native proof. |
| `correspondenceCheck.test.ts` | **Applicable:** exact path/row correspondence, bleed, missing ancestors, unchecked identity/render/path failures, union of produced paths. **Internal:** injected impossible trees. **Legacy:** Condition/sem fixtures; filtered correspondence success is not full validation success. |
| `coverage.test.ts` | **Applicable:** source-span coverage, must-link obligations, ownership and legal suppression mechanisms. **Internal/legacy:** synthetic artifacts and old concepts. Zero coverage findings does not establish truthful attribution. |
| `criterionReachability.test.ts` | **Applicable:** criterion dependencies remain reachable for provenance. **Internal/legacy:** inventory assertions using an implicit-shape Observation; no evaluation or publication admission check. |
| `crlConceptLayer.test.ts` | **Applicable:** bounded display/identity interpretation. **Internal:** inventories, wrapper forwarding and unresolved/ambiguous display cases. **Legacy:** inferred/asserted labels, sem/source forms and old answer fixtures must not become runtime contribution or precedence rules. |
| `crlStructure.test.ts` | **Applicable:** standalone decision identity, qualified criterion references and visible dependencies. **Internal/legacy:** row inventory, menu/action guards, locations and ordering; not emitted FHIR semantics. |
| `cross-lib-boundary.test.ts` | **Applicable:** policy/shared ownership boundaries, same-name cross-library decisions, exact grounded paths and honest ambiguity deferral. **Internal:** deterministic generation and synthetic package setup. **Legacy:** old Boolean representations; two current runs are not a historical byte-compatibility comparison. |
| `cross-lib-chain.test.ts` | **Applicable:** cross-library path identity and coverage ownership. **Internal:** registry collision and decomposition controls. **Legacy:** Condition fixtures. Comments about coverage removing over-reach are not established by the deliberately unasserted `overReach` value. |
| `definedAsExpr.test.ts` | **Internal/legacy:** sem expression trees, flattening, cycles, foreign stubs and known existence-expression divergence. Do not teach these fixtures as replacement publication composition. |
| `delegated-reachability.test.ts` | **Applicable:** delegated inventory, cycles, multiple callers and ownership-sensitive coverage. **Internal/legacy:** static reachability only. Historical comments deferring cross-library evaluation are not a current global limitation. |
| `derivedFromContract.test.ts` | **Applicable:** marker/hash consistency, carrier-relative trails, artifact/sidecar disagreement and recorded-anchor lookup. **Internal:** malformed/oversized/directory/symlink controls. Legacy policy syntax is incidental to filesystem integrity. |
| `derivedFromPolicy.test.ts` | **Applicable:** portable relative POSIX paths, legal `../`, prohibited absolute forms and cross-drive limits. **Internal:** lexical/path helpers and platform case behavior. Does not prove file existence or portability to every clone. |
| `derivedFromResolution.test.ts` | **Applicable:** enforced source-oracle checks in both modes, raw-byte hashing and missing/mismatched source handling. **Internal:** chunking and filesystem edge cases. Legacy CRL is incidental. |
| `discoverSource.test.ts` | **Applicable:** bounded hash-based recovery, ambiguity, no guessing and budget exhaustion. **Internal:** scan stages and conditional filesystem tests. A matching hash identifies bytes, not source meaning. |
| `failedCriteria.test.ts` | **Applicable:** distinguish all evaluated false criteria from blockers of the expected disposition; account for preemption, negation and deep delegation. **Internal:** duck-typed traces and empty-result cases. **Legacy:** action guards and absent-Condition-as-false fixtures; empty frontier does not prove no unresolved input. |
| `generate-default-chain.test.ts` | **Applicable:** terminal ownership, ambiguity, run mismatch and honest deferral. **Internal:** deterministic and default-mode controls. **Legacy:** old Boolean fixtures; assertion of an activity does not establish exact output cardinality. |
| `generate-disposition-path.test.ts` | **Applicable:** per-path clusters, provisional status, residual coverage, frozen IDs and deferred cases. **Internal:** corrupted render/path controls and deterministic output. **Legacy:** fixture language; correspondence-only checks are bounded as in finding 1. |
| `generate-loop.test.ts` | **Applicable:** worklist/final distinction, proportional coverage reduction, merge preservation and carrier-path behavior. **Internal:** scaffold accounting. **Incorrect positive fixture:** attribution helper, finding 3. **Legacy:** underlying concepts. |
| `generate.test.ts` | **Applicable:** empty attribution, provisional refs, frozen IDs, diagnostics and unsupported result forms. **Internal:** deterministic cluster shape and static relation hints. **Legacy:** sem/Condition fixtures; default scaffold assertions are not execution proof. |
| `guardOutline.test.ts` | **Applicable:** named criterion visibility and disclosure of elided review content. **Internal:** identity hashes, declaration-order invariance, caps and gate inventories. **Legacy:** sem/implicit-shape leaves. Tail lifting can strip Boolean context, explicitly including `not`; hashes and gated identities do not certify a fully faithful displayed expression. |
| `indexer.test.ts` | **Applicable:** declared shared-library ownership, typed node identity and reachable policy scope. **Internal/legacy:** inventory traversal and old references. Activity-oriented terminology reachability is not a complete emitted dependency census. |
| `loadArtifact.test.ts` | **Applicable:** accepted envelope/marker versions and malformed top-level rejection. **Internal:** identity-preserving loader behavior. Successful loading is not nested validation or semantic acceptance. |
| `merge.test.ts` | **Applicable:** preserve human attribution, expose orphan/dangling links and retain source drift for repair. **Internal/legacy:** generated fixture shapes. Preservation includes wrong relation overrides and stale attribution; merging does not make them correct. |
| `normalizeFiles.test.ts` | **Applicable:** verified per-record normalization, dry run, unchanged worklisted records, marker/oracle constraints and bounded discovery. **Internal:** filesystem failures. Preloading both carriers avoids some partial writes but does not establish a global transaction. |
| `repoEscape.test.ts` | **Applicable:** outside-checkout source advisory and clone availability limitation. **Internal:** `.git`/package-root detection and path calculations. Advisory absence is not deployment portability proof. |
| `revealMaps.test.ts` | **Applicable:** branch-context scoping, ambiguous best effort and source-bearing versus source-less navigation. **Internal:** synthetic maps and export parity. Concept containment/navigation is not clinical inference or current publication semantics. |
| `runPath.test.ts` | **Applicable:** library/decision identity across delegation, multiple produced paths and explicit gaps. **Internal:** hand-built trees, ancestor-chain comparison and one real-VM fixture. **Legacy:** that fixture; no native execution. |
| `validators.test.ts` | **Applicable:** integrity/attribution/manual-review separation, source drift, link obligations, waiver loci and ancestry checks. **Internal:** malformed artifacts and classification accounting. **Legacy:** CRL fixtures. `drives-determination` ancestry and labels do not independently prove causal or clinical correctness; routine classification is finding 2. |
| `writeFileAtomic.test.ts` | **Internal:** atomic replacement of one file and temporary-file cleanup. Applicable only to that filesystem guarantee; not multi-file transactional publication or source fidelity. |

## Remaining grammar — 16 files, review630

Before-state source dispositions;632 corrects accepted teaching/fixture findings. No new native execution is claimed.

| File under `packages/crl/src/` | Mixed disposition and evidence limits |
|---|---|
| `ast/tests/branchCondition.test.ts` | Internal expression traversal, signed references, NNF/DNF normalization, duplicate preservation and malformed-AST tolerance. Useful implementation regression evidence; handwritten AST transformations do not establish source acceptance, unknown evaluation, or the current publication guard lowering. No new kit example needed. |
| `ast/tests/builder.test.ts` | AST construction, branch nesting, action targets, terminology/activity structure, and builder diagnostics have syntax value. Fix positive parsing evidence per finding 3. Preserve separate negative composition cases. Skipped pre-v0.7 cases remain historical. `"BMI > 30"` is asserted as a reference name, not an evaluated comparison; never promote it as threshold syntax. |
| `ast/tests/conceptDependencies.test.ts` | Internal dependency extraction across composition, narrative references, named reductions, `this`, and duplicate operands. BMI validity dependencies are useful graph regression evidence, but the surrounding incomplete declarations are not admitted publication examples. No claim about selection, question reachability, or execution follows. |
| `ast/tests/criterionExpansion.test.ts` | Internal expansion/index construction and failure-envelope tests: missing references, cycles, 1024-atom and 32-depth boundaries, duplicate-name handling. These belong to the tested expansion consumer, not a universal authoring size limit. First-wins table behavior does not authorize duplicate declarations. |
| `ast/tests/criterionIndex.test.ts` | Internal direct/transitive dependency identity, shared-DAG deduplication, recursion bounds and closure tracking. Relevant to preserving dependencies, but not execution proof. `sourceCondition` assertion at line 75 compares the same stored entry with itself; it does not prove identity with the original AST body. “Prompt return IS the linearity proof” at line 126 overstates the bounded non-explosion regression. Narrow those descriptions/assertions. |
| `ast/tests/decisionSpine.test.ts` | Internal static decision-node enumeration compared with rendered scenario node IDs, including branch/action structure, chaining and library-aware identities. The set comparison establishes ID agreement for fixtures, not action outcomes, source fidelity, or native behavior. Hand-built legacy condition fixtures should not become selected-answer examples. |
| `ast/tests/definedAsBooleanComposition-t1.test.ts` | Mixed parser/AST distinction between Boolean and sem composition; parenthesization/mixing failures; aliases; dependency preservation; reference/cycle validation; legacy CQL/CRE acceptance and refusal cases. Retain these distinctions in the ledger. Current kit already treats publication concept composition as unsupported. Revise header per finding 4; do not advertise the legacy forms. Its dynamically loaded CMS fixtures were not individually read in this audit. |
| `ast/tests/guardDefines.test.ts` | Internal predicate deciding which legacy prior guards need generated defines; collection under `first:` versus `all:`; collision diagnostics. Supports those helpers only. No emitted artifact or unknown-state execution is asserted here, so do not derive current whole-expression publication teaching from its historical physical-lowering comments. |
| `ast/tests/inferenceWalk.test.ts` | Internal traversal ordering, duplicate preservation versus walk deduplication, self-qualified references, observed cross-library boundaries, cycles and diamonds. Legacy sem fixtures measure traversal mechanics. They do not establish contribution precedence, Boolean semantics, imported execution, or current concept-composition support. Entire file excluded from positive kit examples. |
| `ast/tests/reductions-shape.test.ts` | Mixed AST shape preservation, duplicate/invalid declarations, structural reduction folding versus narrative fallback, integer-threshold constraints, and reference/cycle validation. Later CQL assertions cover legacy existence/count/most-recent shapes and refusal cases. Retain those separately as legacy emitter regressions. Fix misleading Scalar-default header; the accepted shape-token list is not the publication allowlist. |
| `lexer/tests/basic-tokens.test.ts` | Token spelling, modes, delimiters, operators, strings and resource/value names. Several acceptance-sounding rows intentionally expect `ERROR` tokens, including unsupported activity/resource names; inspect expected token arrays when mapping. Fragments establish tokenization, not complete documents, validation or publication support. |
| `lexer/tests/error-handling.test.ts` | Mixed weak recovery assertions, explicit error tokens/listener diagnostics, and public `tokenizeCRL` failure envelopes. Only assertions that inspect errors support diagnostic claims. Apply finding 5; location claims need actual location assertions. |
| `lexer/tests/fhir-types.test.ts` | Parameterized lexical allowlists and rejection diagnostics for resource, activity and value-type tokens. Useful lexical evidence only; these names exceed the current selected-publication surface. Diagnostic-listener checks are not thrown-exception evidence. |
| `lexer/tests/integration.test.ts` | Token stream sequencing across nested structures, terminology, comments and whitespace. Some inputs are fragments or omit required parser punctuation; some menu shapes are semantically restricted. Skipped old inferred forms remain historical. Do not convert these token fixtures into accepted full-source examples. |
| `lexer/tests/parameter.test.ts` | Lexical parameter modes/types, invalid type and retired spelling rejection, comments/mode transitions, plus AST Parameter construction through `buildCRL`. Separate the latter’s source evidence from token-only rows. No parameter binding, runtime value or publication claim is established; no extra kit teaching is necessary now. |
| `lexer/tests/structures.test.ts` | Token sequences for declarations and nested structures, including deliberately expected errors and skipped old forms. This is mixed lexical acceptance/rejection, not semantic structure admission. Existing decision/body guidance should use its parser/validator owners instead. |

## Final source census — 637

Before-state dispositions at1da9f59c. Review637 corrects accepted findings. Full reads do not recertify historical native results or complete claim mappings.


### Review631

| Test file | Mixed disposition |
|---|---|
| `ageChainAssertionPoints` | Applicable: admitted Patient/local age assertion points. Limited: catalog scan does not prove global absence of another capability. |
| `ageProjectionRetirement` | Applicable: explicit coded/uncoded age, unsupported projection and retired-form refusal. Internal: private marker rejection. Comparator table proves emission acceptance only. |
| `bmiRetirement` | Applicable: explicit validity, finite-source requirements, closure-wide retirement refusal, invalid/missing operands, current kit subsection emission and CRE outcomes. Internal: preparation/lowering entry consistency and dependency deduplication. Historical native stamps are not this run. |
| `caseFeatureGuards` | Internal/legacy: direct versus partitioned legacy composition, reference resolution and reduction coherence. No current publication authoring example. |
| `compositionErrorKinds` | Internal/legacy: Scalar Boolean classification, precedence and coherence errors. Nullable expression checks do not admit publication composition. |
| `constructorCelParity` | Internal/legacy: registry-derived field spellings, subject/default plumbing and recorded divergences. Neither current publication round-trip nor executed CQL parity. |
| `criterionCollision` | Internal: criterion/parameter/terminology name collision handling. Fixture concepts are legacy. |
| `criterionLoweringPin` | Internal: criterion preservation through lowering. |
| `definedAsExistsLowering` | Legacy/internal: exact existence lowering over old resource-list forms; no completeness inference for current determinations. |
| `dme101-030-emit` | Mixed: current age fixture; legacy device merge and existence-based local determinations. CQL/FHIR structure checks do not certify the clinical policy. |
| `emit-golden` | Internal: exact output contents and file set across ten entrypoints. Mixed current age and legacy fixtures. No translation/execution proof. |
| `emitCQL-meta` | Applicable: metadata comments, escaping and deferred-expression reporting. Internal: envelope plumbing. Legacy highest-value definitions are not current producer guidance. |
| `emitCQL-parameters` | Applicable: explicit Period/Patient handling and removal of ValueSet stubs. Internal/negative: manually constructed unsupported context combinations, shadowing and malformed inputs accepted by direct paths. Those cases must not become authoring advice. |
| `emitCriterionDefine` | Applicable: Boolean expression/negation rendering without inserted totalization. Internal: qualifiers and names. Text-only evidence. |
| `emitsScalarValue` | Internal/legacy: classifier and alias recursion. Exclude from current published-shape guidance. |
| `foreignCriterionScope` | Internal: logical foreign ownership through direct/layered/custom partitions and namesakes. Supports existing identity guidance, not new syntax. |
| `functionalVsBinding` | Applicable terminology distinction, bounded by text emission. Internal: declaration selection. Does not prove runtime membership or CQL/FHIR parity. |
| `guardDefineBothLanes` | Internal cross-artifact symbol consistency over legacy fixtures. No runtime unknown-propagation proof. |
| `heterogeneousSourceEmit` | Legacy: resource conversion, dropping valueless candidates and existence interfaces. Internal: parenthesization/profile plumbing; repeat carrier refusal. |
| `layeredEmit` | Internal: partitioning, dependency closure, identities, qualification and guard placement. Legacy: reductions, truth-set composition and natural resource shapes. Applicable current tail: publication envelopes and unsupported publication consumers. |
| `leafEligibleConcepts` | Internal: leaf eligibility and failure propagation. Legacy source shapes do not establish current admission. |
| `ledgerEnrollment2a` | Internal: complete enrollment, datatype annotations and proof-error reporting. Legacy: totality classifiers/obligations. Current criterion cases preserve nullable expression rendering; ledger consistency is not execution correctness. |
| `lowerLocalCodes` | Internal: identity generation, collisions, deduplication and diagnostic propagation. Legacy: Scalar/existence/count/recency/source-union lowering. Applicable negative coverage: invalid value reads and old age rejection; revise forced-existence advice. |
| `meta-emit-registry` | Applicable: recognized metadata/status behavior and suppression boundaries. Internal: exact registry and removed flags. Metadata/deferred text does not implement a producer. |
| `namedAnswerOptionsEmit` | Applicable claim: complete interpreted domain and negative exceptions. Legacy owning authoring fixture should migrate or be labeled. Internal identity/hash disambiguation remains useful. |
| `publicationRecord` | Applicable: explicit Record publication, nullable selected Boolean consumption, coded/uncoded producer behavior, domains and unsupported consumers. Internal: envelope, reserved names, ledger and constructor deduplication. Emission evidence only. |
| `pureQuestionEmit` | Legacy: implicit/Scalar question twins and existence-derived determinations. Internal nullable-text and collision regressions; do not teach its fixture as current syntax. |
| `recencyRecordMerge` | Legacy: opaque-ValueSet source merge, early filtering and old recency pipeline. Internal bytes only. |
| `recencyTieBreak` | Legacy generic local-preference/null behavior. Applicable narrow boundary: age no longer uses that generic helper. Do not derive current selector policy from the legacy helper. |
| `recordUnionTerms` | Internal/legacy: ordered lowered union terms and markers. |
| `reductionExistsEmit` | Internal/legacy: exact `exists` rendering over a RecordSet. Neither universal operand-shape support nor broad negative determination. |
| `renderConstructorCall` | Internal/legacy: argument placement, wrappers and boundary construction. Revise general unknown-dropping/maximum-validity claims. |
| `renderPublicationSelection` | Applicable: explicit resource selection, missing/unknown/false, ordering, temporal ambiguity, identity and error distinctions. Actual native execution exists only in its opt-in branch; ordinary symbol checks do not run those vectors. Shared temporal table fully read. |
| `renderRecordConstructor` | Internal/legacy: generic resource constructor syntax, binding types and registry requirements. Historical engine claims are separate from current text assertions. |
| `semnotLowering` | Legacy positive cases and refusal diagnostics; applicable current replacement is a nullable age criterion. Do not promote anchored sem composition. |
| `terminologyIdentifierCollision` | Applicable: pure references versus instantiated terminology and required metadata. Internal: identifier collision postflight. No native membership proof. |
| `totalScalarBoolean` | Internal/legacy: classifier, resolver scope, cycles and retired markers. Exclude as author-facing Boolean totality doctrine. |
| `truthsetProbe` | Internal historical inventory reporter. Regex extraction, skipped failures and one nonempty-output assertion are not exhaustive semantic or migration verification. |
| `unmatched-narrative` | Applicable negative coverage: unmatched diagnostics, locations and unsuccessful emission; old age refusal. Legacy positive narrative templates do not establish current publication admission or native behavior. |


### Review633

| File — all read fully | Disposition |
|---|---|
| `activity.test.ts` | **Applicable/Internal:** request-kind mapping, `with` handling, configured labels/reasons, escaping and collision diagnostics. Interface-bound terminology refusal is a capability boundary. JSON assertions do not prove instantiated requests or native behavior. |
| `answerOptionsBinding.test.ts` | **Applicable/Internal/Legacy:** exact offered-ValueSet binding identity and unsupported answer-slot diagnostics are useful. The principal source fixture uses old reduction/Scalar plumbing; do not reuse that declaration as current authoring. Binding-strength assertions do not establish native dropdown behavior. |
| `blephPresentation.test.ts` | **Applicable/Internal:** checks all eleven authored text/description pairs at every encountered profile occurrence, with non-vacuity. It proves propagation, not clinical adequacy, rendered descriptions or the fixture header’s historical modeling claims. |
| `caseFeatureCollection.test.ts` | **Internal/Legacy:** recursive old `defined as`/sem collection, ordering, deduplication and cycles. Collector order is not decision precedence or source-fidelity proof. |
| `caseFeatureRecord.test.ts` | **Internal/Legacy**, with applicable rejection boundaries. Natural-resource handling, absent carriers and RecordSet behavior are mixed old paths. Do not promote bare-code/`exists this` repairs or blanket “only Boolean” comments into the selected-publication contract. |
| `ccScreeningRoundTrip.test.ts` | **Internal/Legacy:** structural comparison and canonical resolution. Counts and profile assertions do not establish complete source round-trip, CQL equivalence or clinical fidelity. |
| `checkIds.test.ts` | **Applicable/Internal:** ID limits, Bundle recursion and incomplete scans. Appropriate teaching is `pass && complete`; this is not general FHIR validation. |
| `closureOrchestrator.test.ts` | **Applicable/Internal/Legacy:** applicable catalog/version distinctions, canonical integrity, malformed disposition handling and cross-library binding mechanics. Legacy reduction/alias cases and synthetic invariant objects remain internal. Source comments about earlier split/gating states are not current capability authority. |
| `codeSystem.test.ts` | **Applicable/Internal:** local code identity, authored display, required metadata and duplicate-code diagnostics. No clinical terminology validation. |
| `collectCaseFeatures.test.ts` | **Internal/Legacy:** both the foreign-clobber case and action-guard-only collection use legacy paths. Correct the ineffective order control in finding 4 before claiming that regression is covered. |
| `corpusProbe.test.ts` | **Internal/Legacy:** CMS22/CMS69 structural emission counts and diagnostic mixtures. Stub resolvers and legacy narratives do not support clinical correctness or current concept-authoring examples. |
| `cpgActivityProfiles.test.ts` | **Applicable/Internal:** fixed request/profile/kind mapping. The hardcoded mapping table is not independent validation against an IG or a native engine. |
| `criterionEmit.test.ts` | **Applicable/Internal/Legacy:** criterion identity, undefined/cyclic-reference refusal, transparent named defines and dependency behavior. Separate publication-reachable conditions from legacy DNF/prior-exclusion cases; low-level synthetic resolver acceptance is not public admission. |
| `decision.test.ts` | **Internal/Legacy**, with applicable structural plumbing. Most guard/menu cases use synthetic ASTs and legacy lowering. DNF splitting, per-arm inputs and envelope tests cannot establish whole-expression publication behavior or native pause/order semantics. |
| `emit-fhir-golden.test.ts` | **Internal/Legacy:** exact resource snapshots and file-set comparison for its four corpora. Golden equality records output; it does not establish current authoring intent or independent correctness. |
| `example-fhir-golden.test.ts` | **Internal/Legacy:** four active legacy examples, one explicitly parked both-representation example. It compares existing golden SDs and flattened inputs, not every possible extra emitted SD or full clinical behavior. Do not present its “spec truth” wording as authority. |
| `idFormatter.test.ts` | **Applicable/Internal:** bounded, deterministic IDs and canonical agreement, including real overflow cases. Does not establish universal collision freedom. |
| `library.test.ts` | **Applicable/Internal:** Library metadata, identities, dependency deduplication and attachment strings. Attachment-string checks alone do not prove the file exists or compiles. |
| `membershipPublication.test.ts` | **Applicable/Internal/Legacy:** current selected answers, producer dependencies, qualified owner identity, typed CEL data and whole-expression applicability are strong bounded candidates. Some mixed cases deliberately include legacy leaves. The CEL emission rows all construct an `Approve` expectation but do not execute it; those rows are data-shape evidence only. |
| `metadata.test.ts` | **Applicable/Internal:** required package metadata, policy-name constraints, canonical normalization and malformed inputs. Useful project preconditions, not resource conformance or clinical evidence. |
| `namedAnswerClosure.test.ts` | **Applicable/Internal/Legacy:** the shared current example and `publication=true` row are suitable imported-domain evidence, including exact CRE positive/negative/pause expectations. The `false` row and opaque-binding fixture retain legacy forms; classify them separately. CodeSystem replacement tests prove replacement of that written resource, not pruning the whole output tree. |
| `partial-split-author-vs-golden.test.ts` | **Internal/Legacy:** actual layer dependencies, local/external terminology routing and golden equality. Historical two-layer prose is not the current emitted topology. |
| `partial-split-fhir-golden.test.ts` | **Applicable/Internal/Legacy:** manifest/content referential integrity, malformed manifests, identity collisions and exact snapshots. The empty-manifest helper no-op is distinct from the public entrypoint’s refusal. No native library-loading proof. |
| `patient-age.test.ts` | **Applicable/Internal:** current explicit age fixture; bounded emission and retained-input checks. Retired lowering documentation needs finding 5’s correction. |
| `presentationEmit.test.ts` | **Applicable/Internal:** current presentations, scoped inheritance, imported ownership, overlap refusal and missing-presentation warning behavior. Generated extensions are not renderer/session evidence. |
| `presentationReachability.test.ts` | **Applicable/Internal:** effective wording compatibility across synthetic reachable forms, delegation and fallback. These are graph-analysis tests, not observed native form navigation. |
| `recommendation.test.ts` | **Applicable/Internal:** wrapper profile, ActivityDefinition canonical and library binding. Its nominal long-library example does not itself create the described overflow; real overflow evidence is in `idFormatter.test.ts`. |
| `referenceStub.test.ts` | **Applicable/Internal:** placeholder identity and synthetic membership, including canonical-tail limitations. The synthetic code is explicitly not a real external expansion. Stable `terminology-forms` guidance already preserves that boundary. |
| `reproDate.test.ts` | **Applicable/Internal:** date precedence, invalid environment values, missing publishable date, capability/profile stamping and executable refusal. Profile claims are not external conformance validation. |
| `selectedPublication.test.ts` | **Applicable/Internal:** prepared bindings, explicit answer carriers, whole-condition projection and rejection of action guards/unprepared publication emit. CQL-string/JSON assertions do not execute selection or native applicability. |
| `slug.test.ts` | **Internal:** deterministic normalization, bounds, hash suffixes and acknowledged normalization collisions. Useful identity mechanics, not a concept-model example. |
| `structureDefinition.test.ts` | **Internal/Legacy**, with applicable integrity boundaries. Most source fixtures exercise valueless/existence or old inference collection. Do not apply their carrier/category requirements wholesale to current selected publications. |
| `terminologyCodeDisplay.test.ts` | **Applicable/Internal:** authored display propagation and absence preservation. Old inline-options commentary is not a supported syntax recipe; synthetic labels are not clinically verified. |
| `valueSet.test.ts` | **Applicable/Internal:** pure-reference versus instantiated/mixed identity, membership serialization, reproducible expansion fields and collision handling. Placeholder success does not supply deployable clinical membership. |
| `writer.test.ts` | **Applicable/Internal:** output paths, directory creation, serialization and traversal refusal. It proves neither transactional writing nor obsolete-file pruning; the stable kit already discloses the latter. |


### Review635

| File, all under `packages/crl/src/cre/tests/` | Mixed disposition |
|---|---|
| `branchConditionEval.test.ts` | Applicable compound trace/VM wiring; legacy valueless presence leaves make missing=false, so its truth tables are not selected-answer teaching. |
| `caseFactDates.test.ts` | Applicable effective dates, overrides, anchors, invalid dates and identity collisions; legacy membership/selection fixture portions remain internal regression evidence. |
| `composition.test.ts` | Legacy sem/composition interpreter and cycle diagnostics; no current publication-composition authority. External drop-one fixture uses missing-as-false and unverified clinical intent. |
| `conceptTruth.test.ts` | Applicable projection identity and isolation; legacy off-path presence/cycle values require scope. Error-run empty rows support finding2. |
| `criterionEval.test.ts` | Applicable named criterion traces, memoization, repeated-use rendering, refusal and isolation; positive truth examples use legacy presence leaves. |
| `decisionResolver.test.ts` | Internal resolution/map identity controls, not delegated execution or prepared-publication package parity. |
| `inlineAnswerBareCode.test.ts` | Applicable token parsing and ambiguous/missing-system refusal; semantic commentary needs finding3 correction. |
| `interfaceOwnValue.test.ts` | Legacy direct-value/interface OR, conflict and valueless behavior; internal regression only, not current selected-publication guidance. |
| `localMembership.test.ts` | Applicable canonical-base and intent refusal; positive Condition presence and cross-concept coding cases are legacy, clinically unverified. |
| `membershipRefusal.test.ts` | Legacy membership selection/refusal regression; neither a universal tie policy nor current publication proof. |
| `pauseResult.test.ts` | Applicable explicit pause, unknown traces, all-false/partial-all distinction, input errors and local delegation; legacy sem truth tables and menu guards remain scoped internal cases. |
| `pipelineFamily.test.ts` | Legacy pipeline/existence behavior and refusal. Agreement-without-selection and presence cases must not become current selector rules. |
| `publication.test.ts` | Applicable selected true/false/unknown, ordering, admission, ownership, membership errors, independent-all outcomes and local delegation; legacy activation controls remain negative/internal. |
| `publicationAge.test.ts` | Applicable fixed-clock birthday, older/same-day answers, missing input and partial/future validity; FHIR method assertions are not full Q/QR evidence. |
| `publicationBMI.test.ts` | Applicable synthetic arithmetic, missing operands, clearing and local override; split-library emission assertions do not themselves execute that split through CRE. |
| `publicationImports.test.ts` | Applicable prepared ownership, imported operands, source/local inputs, shadows and refusal; package mutations remain CRE-only where stated. |
| `publicationQuantity.test.ts` | Applicable unit-aware threshold, unknown, local/source and imported publication cases; emitted-data assertions are narrower than native quantity round-trip proof. |
| `run.test.ts` | Applicable trace/arm/delegation mechanics; most behavioral examples use legacy presence/menu paths. Cross-library successes cannot certify publication delegation. Finding4 headers need qualification. |
| `unsatisfiedFrontier.test.ts` | Internal display algebra, identity, grouping and degraded-trace controls; final integration fixture uses legacy absence=false. |
| `viewModel.test.ts` | Applicable tree/provenance/delegation projection mechanics; legacy guard/menu/sem fixtures are not selected-answer or native evidence. |

| File | Mixed disposition |
|---|---|
| `agePredicate.test.ts` | Applicable explicit age admission and retired-form, comparator/unit/carrier rejection; anchored-age and sem cases test only the filtered age validator, not whole-form support. |
| `answerOptions.test.ts` | Applicable option-presence warning, misuse and duplicate declaration checks; positive fixture uses legacy reduction. Historical questionnaire claim is not executed here. |
| `conceptSubstance.test.ts` | Applicable build-versus-validation separation and multiple diagnostics; “accepts substance” checks only absence of the substance rule. |
| `criterionSemantics.test.ts` | Applicable names, cycles, misuse, scoped reference checks and hard severity; many operands are legacy, and filtered acceptance is not full publication admission. |
| `cycleDetector.test.ts` | Internal synthetic AST graph tests, identity and severity; no parser or native execution claim. |
| `decisionShape.test.ts` | Applicable structural legality and guard placement; source refs intentionally unresolved. Menu shape acceptance is separate from publication admission. |
| `definedAsBooleanComposition-t2.test.ts` | Legacy Scalar composition type/coherence and corpus-regression controls; unsupported as positive new authoring. Corpus reads in this audit remain partial. |
| `dispositionValidation.test.ts` | Applicable config-gated vocabulary, request type, nesting and finality; legacy gate fixture. No configured options means no enforcement. |
| `emitCapability.test.ts` | Applicable warning registry checks only; absence of this warning does not establish successful emission or current publication support. |
| `metaTag.test.ts` | Applicable tag parsing, error/warning and removed flag-tag behavior; soft-mode test actually asserts only retained invalid-enum error, not the missing-field demotion named in its title. |
| `namedAnswerOptions.test.ts` | Applicable filtered finite-domain, display, exception and retired-spelling checks; positive fixture omits final selection, so zero answer-option findings is not full admission. |
| `nameUniqueness.test.ts` | Internal synthetic declaration-bucket checks; empty decision AST controls are not parseable authoring examples. |
| `parameter.test.ts` | Applicable name and typed-slot resolution; positive filtered narrative cases do not establish producer execution. |
| `pipelineStage.test.ts` | Applicable malformed/unmatched stage and slot diagnostics; positive legacy pipelines are not current publication producer examples. Selection→filter gap is explicitly untested. |
| `publication.test.ts` | Applicable current admission, severity and unsupported-context controls; misses supported-source prefer-local case in finding5. |
| `publicationMarkers.test.ts` | Applicable finite domain, exception ownership, warning parity, qualified terms and invalid-domain refusal. |
| `recordSetBound.test.ts` | Legacy collection warning/severity/cost controls; not evidence that current publication authoring supports the advertised layered history forms. |
| `reductionShape.test.ts` | Mixed current retirement diagnostics and legacy shape/reduction migration controls; findings6–7 address repair advice and wrong-bucket positives. |
| `representationShape.test.ts` | Applicable structural field/path/cardinality/source attribution checks mixed with legacy representation and exists repair acceptance; filtered success is not full publication admission. |
| `reservedLibraryName.test.ts` | Applicable reserved-name and hard-severity checks; synthetic AST, no emission execution. |
| `useSiteType.test.ts` | Mixed useful operand/guard/type and package-owner diagnostics with extensive legacy aliases/sem/collection acceptance; repair advice needs finding6 correction. Publication subset of the representation fixture is distinct from its legacy mammography section. |


### Review636

| File | Disposition |
|---|---|
| `authoring-kit/tests/authoring-kit.test.ts` | **Applicable behavioral evidence:** selected-answer true/false/missing cases, delegated CRE routing, exact arbitration output arrays, and a project-config membership positive/negative control. **Packaging/internal:** source equality, payload hashes, edge filtering, tier topology, invariant-anchor resolution, prose checks and flag-argument ownership. **Limits:** anchor resolution does not execute the anchored check; hash/prose assertions do not verify semantics. Snippet validation permits unresolved excerpt references. Age strings do not execute temporal behavior. The legacy vacuity example is correctly negative teaching. Findings1,3,5 and6 concern inconsistent or insufficient teaching checks. |
| `authoring-kit/tests/referenceArtifactsEmit.test.ts` | **Applicable emission/admission evidence:** eight CRL reference artifacts, imported answer terminology, hard-error checks, expected resource presence, broken-reference rejection, and selected-publication admission controls. **Internal:** artifact/stamp coverage and resource-shape checks. **Limits:** declaration admission is not whole-context validation; resource presence is not runtime or round-trip proof. Fix the project-context mismatch in finding2. Its header’s unconditional non-Observation/`exists this` advice is another location for the already accepted631 legacy-guidance correction, not a new finding. |
| `cli/tests/run-mcp-server.test.mjs` | **Applicable local integration:**64 `check` calls exercise compiled MCP stdio transport, tool discovery, flag-store operations, payload delivery, selected validation/CRE envelopes, emission paths, ID-check exit codes, provenance generation/validation and normalization. **Internal/legacy:** CMS and DME fixtures exercise retained integration paths; they are not current clinical-authoring oracles. **Limits:** this launches the checkout’s compiled entrypoint, not an installed release artifact. Inline `emit_cql` transport success does not establish domain emission success. No `emit_results`, native `$apply`, Q/QR session or renderer acceptance is executed. Findings4 and7 narrow concrete evidence overclaims. |

### Lead reads

- tests/regression/regression-ast.test.ts: Mixed obsolete skipped IMMZ snapshots and current CMS CLI exit checks; no current authoring example or clinical oracle.
- tests/regression/regression-lexer.test.ts: Lexical snapshot/CLI regressions; lexing a deprecation banner does not establish semantic admission.
- tests/regression/regression-parser.test.ts: Mixed skipped obsolete snapshots and active CLI exit checks. Structural regression only.
- tests/regression/regression-transformer.test.ts: Entire deprecated FSH suite skipped; excluded from current kit behavior.
- tests/emit-layout.test.ts: Applicable output-root/offset and mirror paths, missing path envelope; pure path assertions, environment-dependent no-project row. Explicit lane root still gets full offset.
- tests/emit-writers.test.ts: Applicable preflight-before-wipe, patient tree scope, path refusal, manifest identity/hash and partial-write accounting. Low-level root is already resolved; no transactional-write promise. Junction control conditionally skipped.
- tests/obesityTarget.test.ts: Applicable BMI migration refusal and current operand reachability. Mixed legacy history/profile helpers remain internal. No native or clinical evidence.
- tests/serviceRequestTarget.test.ts: Legacy retrieval-versus-comparison, CRE outcomes and source traces. Native pause rows count recorded debt only. Not a current whole-language example.
- cli/tests/run-emitter.test.ts: Applicable CLI flags, target errors, emit gate before write and output layout. No transactional filesystem guarantee. Legacy corpora are not current authoring examples.
- template-match/agePredicate.test.ts: Internal handbuilt age call classification; bounded comparator/unit rejection. No runtime age execution.
- template-match/tests/pipeline.test.ts: Legacy pipeline parsing, ordering, spans and malformed classification. No current selected-publication positive example.
- template-match/tests/patternCatalog.test.ts: Catalog namespace/function/result metadata and literal-pattern lower-bound scan. No whole publication admission or native execution.
- template-match/tests/recencyValueConcept.test.ts: Legacy recency/member-existence classifier. No installed-MCP or current publication capability claim.
- template-match/tests/resolvePipeline.test.ts: Internal legacy effect/shape/identity matrix and typed refusals. Old generic pipelines are not current authored producers.
- template-match/tests/membershipPattern.test.ts: Mixed matcher qualification/scope diagnostics and CQL guards; legacy Scalar predicate acceptance not current admission. No native execution.
