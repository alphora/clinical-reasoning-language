# Maintenance - coded Observation source local 6.4.2

Baseline audit: `5020abfe4c509c20ecf65e11dcaba401193b5d29`. Implementation base: `5574fc1d349e06f52b593ddb14e2cbc4e36878f3`. Target: pending reviewed content commit. Kit schema2.13; reviewed content; audit stamp and installed qualification follow.

Operator scope is coded Observation source admission using existing syntax. Includes the previously reviewed FHIR NPM packager from 1fefb03f2ee418edb4021aec5ff2fa2beac95875. No new indeterminate/null syntax, source clinical interpretation, upstream engine adoption or session API. Baseline-to-base changes were inspected: package/lock versions, prior audit metadata and ledger finalization only.

| Disposition | Owning assertions and shared input | Meaning and limits |
|---|---|---|
| Kit updated | `emit/tests/publicationCodedSource.test.ts`, preserve full value/lineage with local answer false/true; direct and partitioned references; shared `codedSourceExample.ts` | `source-representation:coded-value-preservation`: preserve all codings, text, version, display, source identity and actual validity without mutating the source. Optional local code controls profile/answerability. Emission assertions are not native execution. Existing source model and concept-form teaching now admit CodeableConcept. |
| Kit updated | `cre/tests/publicationCodedSource.test.ts`, negative/positive/absent, missing source, newer missing; older/newer invalid, agreeing/conflicting codings and foreign extras | `source-representation:coded-source-outcomes` and `:coded-source-selection-before-interpretation`: existing final selection and membership behavior applies to external coded inputs. Shared synthetic policy is served verbatim as example:coded-observation-source. Raw FHIR resources are injected at the CEL emission boundary to exercise CRE, not asserted as new CEL syntax. |
| Existing guidance sufficient | Same CRE test, wrong present type and unrelated subject/source code; ordinary additional recognized nonmember | Wrong types/interpretation errors remain errors; unrecognized data cannot be called negative. No special meaning for equivocal is invented. Existing three-valued guards remain unchanged. |
| Existing guidance sufficient | Existing emitter/CRE publicationQuantity tests | Shared adapter helper extraction must preserve Quantity behavior and helper identity. Both Quantity suites passed with the new source suites (38 tests total). |
| Not author-facing | Source discriminant/valueType, extracted CQL adapter factory and forwarding call sites | Implementation plumbing; no grammar, engine/driver, selection algorithm or global domain semantics change. |
| Not author-facing | Synchronized6.4.2 versions/lock, kit schema/hash pins and prior audit metadata | Local delivery identity; no public release. Audit stamp advances only after review and validation. |

Added source-representation:coded-source-local-arbitration: three CRE cases use the answer-enabled shared fixture, checking newer local positive, newer source negative, and newer local clear. Native counterpart verifies offered answer binding/population and actual full-QR change/clear extraction against retained external data. No tagged claim removed. The two new source suites' untagged cases are individually covered above. New tags use the existing source-representation family. Combined97 kit/CRE tests pass after correcting the full-library example wrapper and changelog. Native8 source-only controls and5 local/source competition and full-response extraction controls pass with unchanged engine9870fc867547f65518c5cd6e698ace77b60a9e98797ed38330c25d06cbf5cb2e. The test-only session helper required the same namespace registration already present in production ApplyDriver; no engine behavior changed. Full core5142/32skip, real MCP smoke and extension1295/3expected-fail passed before packaging integration. Reuse those results; run packaging/kit/MCP integration delta and installed qualification.

Packaging integration: `fhir-packaging` rule/navigation teaches the existing CLI/MCP contract. Added tags `fhir-packaging:archive-identity` (determinism, resource identity, attachment embedding, IG/index) and `fhir-packaging:metadata-refusals` (all parameterized metadata rows). The remaining existing package tests cover dependency declarations/versioned inclusion, optional metadata, source/output boundaries, patient-resource refusal, symlinks and cleanup failures; all support that same rule. CLI and both MCP tests execute real archives. No packaging implementation semantics were changed from the converged review815 commit; only owning tags were added. Package metadata is configuration, not a CRL example requiring a second semantic fixture. Dependency tar7.5.22 and CLI registration are runtime delivery changes; lock and build files have no independent language semantics. Packaging is not full FHIR/profile/executable validation.

# Maintenance — local native evaluation fixes 6.4.1

Baseline audit: `50b7965614480b18d1cccf8de00b36badde8771a`. Implementation base: `bc847098d58b0af1e7642718fc2e9562a353bc20`. Target: `5020abfe4c509c20ecf65e11dcaba401193b5d29`. Reviewed source audit completed; metadata is stamped separately. Kit2.12/hash `3a42be05e23f55976acefbaca4e08d5bd70a9f6e9f40ec418795ff4b4d41b597`. Complete changed-path inventory: maintenance-6.4.1-paths.txt.

The full baseline-to-base delta was inspected: package/lock versions, audit metadata, coverage finalization and reverse-map wording only. Current scope adds source binding, Condition status coding, native error classification, qualified FHIRHelpers and named PlanDefinition conditions. Session API, upstream engine adoption and Linux qualification are excluded. No authored syntax, clinical interpretation or customer content migration changes.

| Disposition | Owning evidence | Meaning and limits |
|---|---|---|
| Existing guidance sufficient | `emit/tests/publicationAge.test.ts`, source-only binding rows (coded/uncoded, full/custom names) and full two-lane mixed source/answer fixture through Criterion and delegated Decision; `publicationQuantity.test.ts` uncoded source control | patient-age-projection:source-only-layer-binding and quantity's source binding assertion. Source-only computation must resolve independently of local answerability; the nested fixture creates only the actual Answer profile. These assertions establish emission, not native execution. |
| Existing guidance sufficient | `resourceEmitRegistry.test.ts` exact default verification coding; CEL and FHIR profile golden changes | produce-results:condition-verification-identity. Correct shared default system is condition-ver-status; accepted status vocabulary and customer facts are unchanged. Synthetic native active-confirmed yields one communication, refuted/inactive yield none. |
| Existing guidance sufficient | `runProducer.test.ts`, error/fatal through Parameters.part, Bundle response, contained resources, after 100 warnings, with/without Q; warning/info and clean empty controls; diagnostics fallback/bounds | produce-results:engine-errors-block-publication and case-states. Exit zero cannot erase a native error. Diagnostic storage is bounded, severity inspection is not cut off. No manifest schema or raw-patient archive added. Actual future-birth-date runOneCase returns failed and no Q/QR artifacts. |
| Kit updated | `membershipPublication.test.ts`, whole-guard rows with direct/named/foreign publications; `selectedPublication.test.ts`; `criterionEmitEndToEnd.test.ts`, self-qualified guard; `planConditionCarriers.test.ts` | branch-guards and criterion now describe named CQL definitions referenced by text/cql-identifier. Existing complete-expression error/null boundaries and legacy action-unless behavior are preserved. Tests follow the actual bound CQL owner rather than merely matching a name. The action-unless test is a compatibility control, not a general language requirement. |
| Existing guidance sufficient | `guardDefines.test.ts`, `guardDefineBothLanes.test.ts`, foreign criterion/layer tests; `planExpressionInvariant.test.ts` same-name/wrong-owner, explicit reference, inline-language refusals and StructureDefinition control | Compiler-generated names/collision checks and owner-bound identifier backstop; not full FHIR validation or proof that CQL translates/evaluates. CQL/PlanDefinition goldens change only helper includes and generated condition definitions/references. |
| Not author-facing | `emitCQL.ts` and both shared catalogs use standard qualified FHIRHelpers; ApplyDriver registers the standard namespace and Java17 class is rebuilt against the unchanged engine | Local native setup is automatic. No policy-local FHIRHelpers resource, new engine, session argument or session output behavior. Unit include/version assertions and source/class hash gate support delivery. Separate engine consumers own their engine configuration. |
| Kit updated | docs/decision-shapes.md, canonical kit rule/summary/clause and live coverage row | Removed stale inline-expression description; preserved strong-Kleene branch semantics, dependency inputs, authored decision structure and existing legacy action compatibility. All three delivery hash/schema pins updated. Reference CRL/CEL examples remain unchanged. |
| Existing guidance sufficient | `crl-vscode/src/mvWorkspaceFixture.test.mjs` branch-guards:l34194-shared-checks and mv-case-authoring:l34194-example; regenerated example CQL/FHIR and native outputs | Authored CRL/CEL/source/provenance/config remain unchanged. Guard assertions now follow the bound named CQL body; the source/result fingerprint was advanced after all16 native MV dispositions passed. Existing46 CRE controls and14 pauses retain their assertions. No new clinical interpretation. |
| Not author-facing | Version/lock consistency, new test helper, remaining fixture/golden changes, audit inventory/stamp | Local packaging/test mechanics. No timing improvement, general clinical conformance, upstream pause semantics or Linux qualification claim. |

Added owning tags: patient-age-projection:source-only-layer-binding and produce-results:condition-verification-identity; existing produce-results:engine-errors-block-publication expanded. The new untagged uncoded Quantity control supports the existing source-representation:quantity-value-validity claim. No owning tagged claim removed. Changed untagged guard carrier, name collision, wrong-owner and include assertions are dispositioned above. Historical evidence remains historical; source native verification is separate from installed-artifact verification.

Verification: source combined native six-case peer fixture plus missing/future birth-date and three Condition controls passed with engine SHA9870fc867547f65518c5cd6e698ace77b60a9e98797ed38330c25d06cbf5cb2e; future error also passed actual runOneCase. Core5123 passed/32 skipped and actual run-mcp-server.test passed. Full extension1293 passed/2 failed/3 expected failures; both failures were stale Bleph generated artifacts and inline-expression assumptions. After normal regeneration and all16 native MV dispositions passed, the owning8 tests passed. Builds/types and native branch/action compatibility controls passed. Code817 native converged0critical/0important/0nit; generated-example follow-up also converged0/0/0. All32 regenerated Q/QR files preserve question content, structure and answers; only their identity bindings changed. Installed VSIX/npm gates remain pending. Reviews816 plan: native three-fix0critical/1important/1nit, both accepted; emitter inclusion0critical/0important/1nit accepted. External unavailable; no external convergence claim. No public release.

# Maintenance — shared question wording edits

Baseline audit: `1e16e14f14aef1c95b3fb70ba62070e15b56ff61`. Target: `50b7965614480b18d1cccf8de00b36badde8771a`. Reviewed implementation commits bec2b895, dd99d72a and1296b3d0 are included. Audit metadata is stamped separately. Kit2.11/hash `db69bde7a50a776fa7fce6d9b2946dffea2ad0722521e5c6c8ead31fff55c657`. No release or installed acceptance claim. Complete inventory: maintenance-shared-wording-paths.txt.

| Disposition | Owning observations | Guidance and limits |
|---|---|---|
| Kit updated | editing/presentationEdit.test.ts: targeted literal edits preserve comments, BOM, CRLF, Unicode, unmodified AST; exact inverse for additions/removals; scoped field-owner impact; exposed inherited-description refusal; invalid literals/encoding, no-op and stale baseline refusal. Full parameterized LF/CRLF rows retained. | shared-wording-editing; existing Boolean Complaint/default/scoped fixture, no second invented teaching fixture. Source evidence only. |
| Kit updated | editing/presentationFile.test.ts: explicit owner/package/realpath refusal, candidate validation and discovery/config/content staleness, bounded writes/cleanup, lossless UTF-8, exact receipt reversal; mcp/presentationEditing.test.ts: real transport schema, preview/apply/revert and unsupported intent refusal. | Saved-file boundary and optimistic one-file protection, not a cross-process transaction or authorization credential. No locks/journals/migration. |
| Kit updated | presentationEditor.test.mjs and presentationEditorHost.test.mjs: per-field dirty intent and owner conflict, stale response/ack handling, early initialization guards, immutable successive diffs, nested project exclusion, local dependency inclusion, editor-apply refusal. | Human editor and normal undo contract; these are model/script/host-adapter tests. Actual VSCode1.138.0 development host also verified preview/diff, unsaved apply, normal undo, stale refusal/draft retention and untouched-field refresh; packaged-host acceptance remains separate. |
| Existing guidance sufficient | MV presentationProposal.ts now delegates to core; routeCards.test.mjs19 existing assertions preserve proposal-only sidecar behavior, owners, source immutability and completion gates. | mv-wording-patches still controls owner application and explicit disposition. No automatic proposal acceptance or review status update. |
| Kit updated | native-acceptance/intake.cjs --presentation-only: planner-edited three-input fixture through emitted CQL/FHIR and five native stages; exact group profile, contained answer definition, QR linkId/definition; empty/populated/presence/change/clear outcomes, sibling preservation and historical answers retained. Emitted description checked as valueMarkdown. | concept-presentation group/answer association. Source native verification only; no arbitrary hierarchy, native description rendering, customer policy or client persistence claim. |
| Kit updated | presentation-check.test.cjs: positive exact association; missing/wrong/swapped group negatives; duplicate answer labels cannot hide altered sibling. Same assertion rejects corrupt copies of real native output. | Association and preservation checks use identity, not wording. These controls validate the oracle; native run supplies execution evidence separately. |
| Existing guidance sufficient | fhir-emitter/tests/presentationEmit.test.ts adds source-valid shared presentation edit whose co-occurrence fails emission. | concept-presentation compatible shared-profile wording requirement; preview does not claim full emit acceptance. |
| Not author-facing | language-services exports, MCP registration/tool-count pins, command contribution/activation, immutable URI bookkeeping, nonce CSP/text insertion and strict messages. | Adapter delivery/security mechanics support the mapped workflow, not additional language features. No grammar/dependency/native engine change. |
| Not author-facing | Prior c3ff590b audit metadata/ledger update and current hash/schema pins. | Inspected metadata-only prior stamp. Source target and separate audit metadata are recorded above; installed delivery remains independent. |

Tag delta: added shared-wording-editing:preservation/:mcp/:editor and concept-presentation:native-association/:sibling-answer-preservation. Existing tagged behavior remains; other new tests are mapped individually by behavior above. No owning claim removed. The process-test timing allowance and synchronized6.4.0 package metadata are not author-facing; production cleanup behavior is unchanged. Reference CRL/CEL artifacts and their required configuration remain unchanged. New search term preview_presentation_edit resolves the complete shared-wording-editing entry and its prerequisites.

Evidence so far:17 planner +17 filesystem +1 MCP tests;19 MV tests;8 editor tests after fresh core/extension build/typecheck;2 native oracle controls; five final native stages with Unicode wording and emitted-description checks passed. Kit153 and core MCP smoke passed. Full core5102 passed/32 skipped initially with three failures; corrected changelog153 recheck and owned-process10 recheck pass. Full extension1295 passed/3 expected fail after fresh build. Native code804 converged0/0/0; plan803 accepted1 important sibling identity correction; human plan/code801/802 converged. Test-only Windows timeout allowance5000->15000/outer25000->35000 preserves every owned-process cleanup assertion; review805 converged0/0/0. Source native and actual development-host evidence are distinct from final installed acceptance. External reviewer unavailable; no external convergence claimed. Primary scratch keeps execution receipts. This completes the bounded source audit at the literal target above. Subsequent local6.4.0 qualification:5105core/32skip,1295extension/3expectedfail and actual MCP smoke passed. Both installed MCPs match the audited JSON/Markdown export; six actual installed-editor checks and installed/staged archive equality pass. Later audit-scope wording and package versions are metadata-only, inspected separately. Native five-stage evidence remains source execution, not an installed native rerun. No public release or customer migration.

## Maintenance - local build 6.3.2

Baseline audit: `3bf25ef2420f7d52d39161292973333860827f26`. Target: `1e16e14f14aef1c95b3fb70ba62070e15b56ff61`. Audit metadata is committed separately. Kit schema 2.10, content hash `5fb897620d481340a5466cf182d6b7b9c6b5fa8eb1da99f784d27a49f424a940`. Complete changed-path inventory: [maintenance-6.3.2-paths.txt](maintenance-6.3.2-paths.txt). This local delivery has a completed, bounded content audit; public publication is independent of audit consistency. No customer content or historical flag migration.

Intent: the operator requires coherent versions/audit metadata in local builds and a new patch version for installation. The title implementation follows the accepted short Title / separate Description contract. The audit does not certify medical fidelity or new native language behavior. The intervening 6.3.0 audit/ledger finalization and package/lock version changes were read and are metadata-only; no dependencies, native engine/driver, compiler, grammar, fixtures or reference artifact source changed in this interval.

| Disposition | Changed paths and owning assertions | Teaching and evidence limits |
|---|---|---|
| Kit updated | `flags/flagVocab.ts`, `flags/mvFlag.ts`, `flags/tests/buildFlagDraft.test.ts`: `title and legacy gist produce identical persisted records and retry identities` compares preferred, legacy and whitespace-normalized dual aliases against the same fixed ID/time. It asserts schema1 gist/description, extraction/open and absence of persisted title. `invalid title aliases fail without throwing` covers title42, gistnull, numeric second alias, conflicting aliases, blank title, neither alias, nested fields.title. | `review-flags:title-description`; preferred title is input vocabulary only. Existing storage and description retry exclusion remain. Direct SDK validation returns structured invalid-value; MCP schema separately rejects nonstring title/gist in both entry-point tests; neither alias gives a normal domain refusal envelope with success:false/reason:invalid-value, not protocol isError. |
| Kit updated | `mcp/server.ts` schema, description, handler forwarding; core `cli/tests/run-mcp-server.test.mjs` and bundled `crl-vscode/src/mcp-server.test.mjs`, both `title creation survives persisted reload, legacy retry, and conflict rejection`. Synthetic concept C/Observation/code c, explicit CRL path under src/crl, sibling src/cel; rentalTitle/rentalDescription fixtures. Actual MCP creates disk record; legacy retry with changed detail returns same record and bytes; alias conflict refuses and preserves bytes. | Three owning executions share `review-flags:title-description`. Titles and descriptions are synthetic explanatory samples, not clinical source assertions. Core/bundled protocol observations are separate from installed-artifact delivery. |
| Kit updated | `correspondenceCockpit.ts`, `flagDrawerHtml.ts`, `flagDrawerHtml.test.mjs`: `flag form names the two inputs Title and Description` asserts label and aria-label; bundled MCP test executes the source-extracted host view-model function in a VM with synthetic helper stubs and the action renderer on persisted record, asserting header and separate Description. | User-facing Title labels, required/single-line/forbidden-character messages, explanatory placeholder; existing internal summary/stub message fields retained. Renderer tests alone do not prove installed UI. Dedicated installed-window check is required in delivery evidence. |
| Kit updated | `authoring-kit/index.ts`: rule summary/write clause and three existing store examples prefer title, retain gist compatibility, describe matching aliases and unchanged persisted schema. `authoring-kit.test.ts` version/hash pins and supported example argument keys; both MCP version/hash pins. | Schema2.10 already identifies this content; no additional content bump for audit-only correction. Full payload delta must contain only schema, review-flags text/derived index and three examples; all19 reference artifacts remain unchanged. Existing kit search/prerequisite/example gates still apply. |
| Existing guidance sufficient | Existing `review-flags:description` tests retain top-level plain text, outer trim/blank omission, arbitrary internal text, nested/nontext refusal, and byte-preserving retry assertions. `review-flags` Accept/Reject guidance and corresponding host/workflow tests are unchanged. | This audit changes no Description behavior, flag ID, anchor, ownership/status transition, native runtime or root canonical behavior. Prior 6.3.0 proof remains bounded to its exact recorded scenarios. |
| Not author-facing | Package/lock files move root/core/extension together to6.3.2; audit.json and ledger/inventory supply explicit provenance. Test tags are aligned immediately above owning declarations. | No dependency or export-name addition. Public CreateFlagInput now has optional title/gist properties; downstream code that reads gist as always-present must narrow it. Existing gist-only callers remain valid. The VM test uses already-present TypeScript/esbuild development dependencies. Content identity and package version are distinct; metadata does not hash itself. |
| Outside content commit, inspected | Existing edits in `.claude/skills/crl-release/SKILL.md`, `AGENTS.md`, `mail-context.md`: normal installed-Code test-host rule, mail listener instructions and removal of an old mail hold. | Preserved byte-for-byte. These do not alter shipped code or kit claims; the installed-host procedure follows the current operator rule. |

Production caller audit: MCP `runCreateFlag` and cockpit create dry/final calls mutate or validate intended writes; cockpit edit calls `validateFlagFields` and retains the existing gist adapter. Both cockpit summary paths already type-check and trim string payloads, so the reviewer claim of a newly prevented host `.trim()` throw was not supported. `validateAndBuildMvFlagDraft` delegates to `validateFlagFields`; direct SDK exports remain public. Optional title/gist properties support legacy and preferred callers, while shared runtime validation requires at least one nonblank title and allows agreeing dual aliases. MCP advertises both aliases as optional individually and states their joint runtime requirement in descriptions; no static JSON-schema one-of guarantee is claimed. The pure `flagVocab.test.ts` suite was not extended; new SDK cases execute its validator via buildFlagDraft.

The new fields.title rejection is deliberate at all four write/draft validation callers; no read-time store revalidation is introduced, and unknown historical fields remain preserved by edit merging. CRL Assist editorAgentPrompt summary and cockpitAgentBridge concern describe their distinct existing internal agent/issue adapter, not create_flag MCP input; existing guidance is sufficient for those unchanged tool contracts.6.3.1 was an uncommitted local worktree build, not a Git release revision. Its historical receipt remains preserved with a superseded marker;6.3.2 provides the first committed reviewed identity for this title implementation.

Tag delta: one new claim ID `review-flags:title-description`, applied to SDK equality/invalid rows, core MCP, bundled MCP and drawer label assertion; no removed claim IDs. Changed version/hash/example-key tests are delivery consistency assertions covered above. No changed test declaration or parameterized row is left unclassified. Supporting baseline/current tag inventories and full payload diff are in local verification evidence. No unresolved gap in this bounded audit; broader language/native proof limits remain unchanged.

Verification: current6.3.2 full core5067 passed/32 skipped, extension1287 passed/3 expected failures; actual run-mcp-server.test passed and both typechecks/builds passed. Full kit payload diff is exactly schema, review-flags rule/write clause and three examples; all19 reference artifacts unchanged. Kit source is byte-equal to the reviewed6.3.1 snapshot. Stale export was observed refusing before any output. Reviews796/797 contain both arms and every disposition; native final follow-up converged0/0/0, external findings assessed without claiming a second external convergence. Initial environment/encoding setup failures were corrected before the complete passing run. The source audit is complete; after stamping, installed delivery remains a separate required gate, recorded with archive hashes and MCP/UI identities in `tmp/local-audit-6.3.2/delivery-receipt.json`. No public publication or broad clinical/native certification is asserted.

## Maintenance - release 6.3.0

Baseline: `510c931f2323c89f9822592e01668112dd6ff795`. Target: `3bf25ef2420f7d52d39161292973333860827f26`. Audit metadata is committed separately. Kit schema2.9, content hash `46d007bb22697b3ae67ebff58ed74157b9e48b785a95c7ab17c7151c314af826`. Complete changed-path inventory: [maintenance-6.3.0-paths.txt](maintenance-6.3.0-paths.txt). The earlier pending2.6–2.8 records below retain intermediate evidence; this section consolidates the release interval.

All paths in the inventory were reviewed against the saved audit, including old/new root goldens, untracked shared fixtures/helpers, CLI/MCP guidance, tests and UI. The intervening6.0 release bump/lock and prior audit metadata add no language behavior. No dependency addition or native engine/driver change. Goldens are expectations, not semantic authority. Operator requirements and CRL north star govern.

| Disposition | Changed behavior and owning evidence | Teaching / limits |
|---|---|---|
| Kit updated | `emit/tests/publicationHasValue.test.ts`, `publicationProgram.test.ts`, `validator/tests/publication.test.ts`, shared `intakeExample.ts`: selected local text/string/dateTime answers, missing/false presence, typed CEL/FHIR/CRE/CQL, invalid-type and temporal controls, dependencies and profiles. `publicationHasValue` helper has production callers in publication preparation, CQL and CRE. | `text-answers`, type/reference rules, `intake-reference` CRL/CEL and temporal variants. Source typechecks/emit/CRE evidence separate from native sessions. Presentation choice and RecordSet expansion remain outside scope. |
| Kit updated | `fhir-emitter/tests/decision.test.ts` (`emit-output-root:policy-canonical`), `closureOrchestrator.test.ts`, all renamed root-golden fixtures: root name cannot change policy id/url/path, support resources stay distinct, multiple unreferenced roots error. | `emit-output-root`, `chaining-necessity`, reference artifacts: independently invoked roots need separate policy packages. Native generated Questionnaire has policy identity; saved MV per-case review copies remain distinct. Golden replacements do not certify clinical meaning. |
| Kit updated | `tests/emit-writers.test.ts`, `cli/tests/run-emitter.test.ts`, `results/tests/{orphans,produceCleanup,suiteProduction}.test.ts`: complete generated-tree replacement after preflight, arbitrary output siblings removed, source siblings retained, malformed/collision inputs preserve prior output, empty output replacement, filesystem failures reported. Existing retry assertions retain verified successful cases. | `emitted-trees-are-ours`, `emit-output-root`, produce-results/verifyLoop, MCP and user/tool guides. No custom-file preservation, transaction/rollback promise or pruning opt-out. Git handles history. Platform-conditional link checks retain their limits. |
| Kit updated | `flagWorkflowHost.test.mjs`, `flagActionDrawerHtml.test.mjs`, `cockpitWebviewScript.test.mjs`: KE Accept transfers current stored record to open validation category; Reject resolves extraction without MV copy; Reopen retained, fields/content preserved, stale intent and write failures refused, delegated buttons route correctly. | `review-flags`: Accept/Reject workflow, current category determines KE/MV display even when authoring tag remains. Tests exercise host/storage and drawer wiring; actual installed rendering is a separate release gate. No human review completion implied. |
| Existing guidance sufficient | `policyLaunchTarget.test.mjs` and host launch call: mixed MV/regression/unclassified policy resolves only src/cel/mv, including active-editor bypass. | Existing `mv-vs-regression`/MV suite guidance already assigns human review to MV paths. UI picker text and editor selection are launch behavior, not CRL semantics. Resolver tests do not prove rendered-client behavior. |
| Kit updated | `flags/tests/buildFlagDraft.test.ts` and real core/bundled `run-mcp-server.test.mjs`/`mcp-server.test.mjs` (`review-flags:description`): trim/blank omission, internal text preserved, SDK nontext and MCP schema rejection, fields.description refusal, actual top-level disk persistence, retry returns original detail/id, legacy and explicit keys unchanged. Both UI dry/final builds pass Description. | `review-flags`, flag example and retrieval aliases: short gist/title, top-level detail, optional issue link. Description is excluded from creation-time retry identity; retries do not update existing records. No MCP edit API or migration. Existing free-text/store inputs remain uncapped. |
| Not author-facing | Grammar-generated type aliases, internal publication helpers, manifest cleanup traversal, version/lock updates, test source-shape pins, package hash/schema delivery pins and current inventory/ledger metadata. | Supporting implementation of mapped claims, not independent authoring concepts. No new native runtime dependencies. |

Release-review follow-ups: generated-output boundaries permit linked ancestors but reject a linked deletion boundary (`emit-writers.test.ts`, `emitted-trees-are-ours:linked-root`, red then green). `run-emitter.test.ts` (`emit-output-root:ambiguous-preflight`) proves ambiguous roots preserve both prior lanes. Two legacy guard test fixtures now select the exact policy ID and provide one synthetic common root; all prior exclusion/define assertions remain. Existing guidance sufficient: these preserve documented root/guard semantics rather than adding language. Native harness adds an unrecognized CodeableConcept control to verify Interpret-to-HasValue error propagation with zero activities; do not infer native success until its run completes.

Final fixture integration: completion oracle adds `text` for value/parameter types; maintained Bleph definitions were regenerated with the exact policy entry-point ID. Its other25definitions and all8CQL libraries are unchanged. Historical source-bound5.4.2 MV Q/QR remain labeled with their actual producing version; this is not a new clinical or native evidence claim.

Public writer caller audit: `writeFhirResources` is used by its writer tests and namedAnswerClosure with successful envelopes; direct SDK callers must pass an admitted successful result and handle preflight throws. `writeEmitResult` is called by `publishCelSuite` after error-diagnostic refusal; warning-only CEL remains writable. `planFhirWrites` is used by the direct FHIR writer and `writeTwoLane`; the latter independently rejects both-lane hard errors/collisions then explicitly admits warning deliverables. The actual CLI warning fixture verifies write-then-exit2. Per-library `emitDecisionPlanDefinitionsForLibrary` requires a library-local single root; closure members and foreign references should use `emitFhirDefFromPath` for package-wide entry-point resolution. No external caller inventory or automatic migration is asserted.

Tag delta: new `text-answers:selected-presence`, `text-answers:datetime`, `emit-output-root:policy-canonical`, `emitted-trees-are-ours:crl-replacement`, `review-flags:description`; changed results cleanup assertions remain under their existing results tags. No known owning assertion lost. New untagged temporal/negative/collision/root/flag/UI cases are mapped by behavior in the rows above; metadata/source-only pins are not separate claims. Baseline/current tag listings and full patch retained in release evidence.

Review: native CRL audit found4important issues (stale replacement docs, independent-root teaching, reversed sibling evidence, missing consolidated ledger); all accepted. Description plan native0/0/0 and external0critical/9important/3nit:9accepted3refined, preserving retry identity and centralized validation. Prior semantic reviews782–788 and UI789–790 retain their original scope. Final release code review and execution status are recorded by release verification; this ledger does not infer installed-artifact success from working-tree tests.

Native evidence inherited for semantics:15-stage text/coded presence session and6-stage dateTime/canonical session, using emitted definitions and complete returned QRs for answer/change/clear. Prior extracted6.2.1 initial2-case emission is only population evidence. Pending6.3 installed-artifact checks must independently bind tested bytes and current kit. No clinical-policy certification, rendered-client date precision guarantee or full policy coverage claim.

## Pending maintenance - policy entry-point identity and complete output replacement

Baseline audited revision: 510c931f2323c89f9822592e01668112dd6ff795; current HEAD9a2dcd6b1664a23fa161b6561d9efdb56b5449a3 plus reviewed pending text/dateTime work. Target is uncommitted, kit2.8; prior audit stamp remains unchanged. This is a bounded follow-on to the pending2.6/2.7 maintenance below, not a new completed audit.

Operator-confirmed changes: exact policy-ID entry-point PlanDefinition/native Questionnaire URLs; supporting definitions remain distinct; multiple roots error. All normal emits replace their full generated directories after preflight, with no custom-file/type preservation. Explicit failed-case retry retains verified successful cases. Saved MV review copies are separate case-specific artifacts, not deployment entry points.

Kit updated: emit-output-root and emitted-trees-are-ours; produce-results/verifyLoop wording reconciled. Owning tests: fhir-emitter/tests/decision.test.ts tag emit-output-root:policy-canonical (three root names, fixed URL/id/path); closureOrchestrator existing cross-library/supporting-reference tests; emit-writers.test.ts tag emitted-trees-are-ours:crl-replacement and CEL collision/preflight cases; results/tests/produceCleanup.test.ts existing results-prune/results-retain/results-removal-failure tags now assert full replacement, refusal of obsolete opt-out, and visible failure. results/suiteProduction and retry tests cover normal replacement, uncertainty and retained success. Identity-only golden updates change root filenames/id/url; supporting resources and clinical action content unchanged. Complete scoped file list and diff: tmp/787-canonical-changed.json and tmp/787-canonical-diff.patch. New helper and CLI/MCP guidance are direct dependencies of those claims. No clinical policy changes.

Native evidence: six intake $apply/QR edit stages in tmp/787-canonical-native/verification.json assert exact policy entry-point URLs and matching native QR references, alongside prior dateTime behavior. Normal saved MV copies retain their separate per-case URLs. Review787 plan accepted/refined replacement sequencing; review788 code found caller gate mismatch and CEL collision preflight, both corrected with regression cases. Final validation recorded in discussion788 when complete. These pending changes do not update any installed kit.

## Maintenance - standard dateTime intake (#322)

Baseline audit510c931f2323c89f9822592e01668112dd6ff795; pending worktree delta from source9a2dcd6b1664a23fa161b6561d9efdb56b5449a3 and preserved text-intake snapshot. Audit stamp remains unchanged. Changed-file delta: authoring kit index/intakeExample/navigation, publicationProgram/publicationHasValue, useSiteTypeValidator, CQL emit/selection/producer, CEL validator/emitter, publicationHasValue tests, native intake harness and typed-intake/north-star docs. Standard dateTime expands the selected-value and presence contract; engine, grammar and profile emission use their existing dateTime handling. Custom date-only profile/engine edits were removed before delivery.

Kit updated: text-answers rule, dateTime example, type allowlist note and navigation. Owning tag `text-answers:datetime` asserts CRL validation, profile value type, CEL validation/emission, CRE and CQL for year/month/day and zoned timestamp values. Invalid date/time rows assert rejection before emission. Primitive absence and metadata are tested separately. Native intake dateTime rows exercise actual generated Q/QR and full response edits with retained historical answers, including an earlier answer value with newer assertion validity and a clear. No native sub-millisecond/leap-second precision claim.

Renderer boundary: actual emitted Q was mounted with the shipped LForms43.1.0 renderer. Its dateTime control normalizes populated date-only answers to local midnight and exports a UTC timestamp. This is an explicit client limitation, not precision preservation. There is no added renderer write-back workflow or date conversion workaround. Plan785/code786 carry review and exact local evidence. No removed owning tags; existing text/presence, conditional visibility and coded-domain guidance remains applicable. Internal helper names and temporal-only harness mode are not author-facing language changes. Version/package hash updates are metadata only. Completed evidence: affected language78 and final kit151 checks passed; native6/6 temporal cases; actual extracted local6.2.0 VSIX MCP kit/validation and native2/2 cases passed. Runtime bytes verified against the archive, kit2.7/hash819c89994d6433b29fc849c05e288fcc6e3760ed98b87d26cce8133f49ab42d2. No full-suite, installed-host or public-release claim.

## Maintenance - typed intake answers (#322)

Baseline audit510c931f2323c89f9822592e01668112dd6ff795; source baseline9a2dcd6b1664a23fa161b6561d9efdb56b5449a3. The intervening tracked delta is version/lock/release metadata plus the prior audit/ledger: no additional language behavior to teach. Current content advances to2.6; the audit stamp remains at the last reviewed commit until content review and commit are complete.

Changed behavior: author `text` alias normalizes to FHIR string; selected local string answers validate/emit; explicit has-value production over selected Boolean/string/domain-coded records is total for missing values, preserves false as answered, propagates errors and gathers only real question dependencies. Kit rule text-answers, value-type guidance, paired shared intake fixtures, prerequisites and search aliases teach that bounded contract. Presentation controls and RecordSet additions remain issue322.

| Owning tag | Test/source | Verified assertion | Claim |
|---|---|---|---|
| `text-answers:selected-presence` | `emit/tests/publicationHasValue.test.ts`; shared `authoring-kit/intakeExample.ts` | Actual CRL/CQL/FHIR/CEL plus CRE, three question profiles and dependencies, exactly one review for empty and answered inputs. Other tests cover invalid values, false, coded Unknown/N/A, imports and newer valueless input. | rule:text-answers; intake-reference CRL/CEL |

Native evidence: `scripts/native-acceptance/intake.cjs`,15 stages passed in tmp/322-native-intake-verified. Empty/populated/presence/change/clear, category switch and return (historical answers retained), conditional Boolean false, recognized coded Unknown/N/A, raw empty/extension-only/wrong-type and malformed QR empty controls. Full returned QR plus generated extraction bindings, fixed initial data retaining old text, newer explicit response time. No positive emitted resources are patched; malformed raw-FHIR controls are explicitly negative. The pinned parser normalizes raw empty strings before CQL; malformed empty QR fails. Native inputs must be valid FHIR. No rendered-client, request-isolation, persistence or untouched timestamp-preservation claim; engine wording limitations unchanged.

Reviews782?784: plan accepted2 important findings (type boundary, exact clear contract); code accepted3/refined1 (pipeline refusal, measured parser boundary, native conditional/coded coverage, consumer identity), follow-up0/0/0. Native CRL lens only; external unavailable. Complete core sweep5022 passed/32 skipped/9 failures; all9 corrected and covered by successful final affected reruns169+33+24. Rebuilt extension consumer/catalog/completion36 passed; actual core MCP passed, builds/typechecks passed. Full sweep is not represented as a single green invocation. New artifact count19, overview34k bound. Final kit2.6 hash7ea14c91065981ce7ec539bd0e3a3975c43358dd55117741c3905d91c08cb265. Generated grammar/type tables derive from grammar. Unrelated operator changes remain outside this audit.


# Kit evidence ledger

## Maintenance - release test integration

Baseline: `6e861e1a77cfa6c4cf8f0a6495ccfd1171bf0722`; reviewed target: `510c931f2323c89f9822592e01668112dd6ff795` (finalized by the separate metadata stamp).
Kit schema2.5 and hash90ea3fe4dc8f1a0e0234f42a4150be82f9b47e7a202a01bdf9f9715395388b96 are unchanged.
Complete delta inspected: prior audit metadata, `crl-vscode/src/cockpitWebviewScript.test.mjs`, `flagPlacement.ts` (comments only), `mvWorkspaceFixture.test.mjs`, this ledger and maintenance inventory.
**Existing guidance sufficient:** removed one redundant source-regex rollup check and one obsolete stored-name regex. `flagPlacement.test.mjs` already asserts resolved rename/replacement identities and folded/expanded rollups; actual host coverage remains. Corrected matching comments reflect that same behavior. No runtime code changes.
**Existing guidance sufficient:** example test now checks active human review state is untracked, allowing local reviewer use without packaging their verdicts. The tracked historical sample/demo flag assertions remain. This is repository-content evidence, not human approval or new clinical evidence.
**Not author-facing:** prior audit and inventory edits are metadata. No owning tags or kit content changed. Review779 converged0/0/0 native-only. Core5009 passed32 skipped plus realMCP; corrected complete extension1279 passed3 expected-fail. Earlier environmental and obsolete-assertion failures are retained in release logs, not counted as passing runs.

## Maintenance - public MCP guidance and delivery pins

Baseline: `d9a4115593064d2cd5e406a8f6199c3ebca93398` (reviewed kit2.5 content). Reviewed target: `6e861e1a77cfa6c4cf8f0a6495ccfd1171bf0722`; finalized in the separate metadata stamp.
Kit remains schema2.5/hash90ea3fe4dc8f1a0e0234f42a4150be82f9b47e7a202a01bdf9f9715395388b96.
All subsequent paths inspected: the prior audit/ledger stamp is metadata-only; the maintenance inventory rename reflects the selected6.0.0 release number.
`mcp/server.ts` generate_provenance description now matches verify-loop's actual reached-pause evidence rule. Existing guidance is sufficient; this corrects a stale delivery copy, not runtime semantics. The core tools/list contract rejects both stale blanket no-action exclusions and requires actual evaluated-unknown evidence. Its new assertion failed against the old bundle and the complete MCP integration test now passes against the corrected one.
Core and extension MCP content-hash pins now name the already reviewed2.5 content; these are delivery assertions, not new teaching or semantic claims. No owning tags changed. Review778 accepted all three release/guidance findings and converged0/0/0 (native-only; external unavailable). Final installed-artifact acceptance is recorded by the release process, not asserted by this metadata audit.

## Maintenance - native reliability, pause correspondence and stable concept flags

Baseline: `85e11736c904729710a0839befdda0f0fdf12b3c`.
Reviewed target: `d9a4115593064d2cd5e406a8f6199c3ebca93398`; finalized in this separate metadata stamp.
Kit schema: `2.5`; content hash: `90ea3fe4dc8f1a0e0234f42a4150be82f9b47e7a202a01bdf9f9715395388b96`.
Complete changed-path inventory: [maintenance-6.0.0-paths.txt](maintenance-6.0.0-paths.txt).
The intervening 82443d8b audit/ledger delta was inspected and is metadata-only.
Five owning tags were added; none removed. Unchanged tags retain their owning assertions.
The changed kit identity pin, version assertion and retrieval aliases are delivery evidence, not new language semantics.
All changed runtime tests, helper/packaging dependencies, metadata documentation, host placement tests and CLI/MCP surfaces are dispositioned below. No grammar, reference-example inputs or dependency versions changed in this audit interval. The earlier L34194 example audit remains separately bounded below.

### Pause correspondence and stable concept flags

| Changed implementation / owning assertion | Disposition and bounds |
| --- | --- |
| `provenance/runPath.ts`, `generate.ts`, `correspondenceCheck.ts`; `tests/pause-correspondence.test.ts`, `@kit provenance-pause-paths` | **Kit updated**, verify-loop. Actual authored Record Boolean cases exercise root/shared-decision pause, wrong expectation, independent action+pause and multiple frontiers; generated clusters round trip through actual FINAL correspondence without waived errors. Corrupted lighting still yields bleed/miss; missing rows, unfrozen/colliding cases, discarded unknowns, invalidation and unresolved entered decisions refuse. Settled compound guards do not create pauses. This proves CRE-to-cockpit correspondence, not full source attribution, native equivalence or clinical review. Selected-publication cross-library delegation remains an explicit runtime error; its negative control must not be promoted to pause support. |
| `tests/cross-lib-chain.test.ts` unresolved-target expectation | **Existing guidance sufficient**: still unchecked and blocked; reason is now precise `unresolved-decision` instead of generic `no-produced-action`. Existing completed-path IDs and delegation behavior retained by broader provenance tests. |
| `meta/conceptIdentity.ts`, `flags/buildFlagDraft.ts`, `mvFlagAnchor.ts`, `mvFlag.ts`; flag tests, `@kit durable-concept-flags`; `provenance/crlConceptLayer.ts` and its tests | **Kit updated**, review-flags and metadata-model/registry. Creation captures authored ID, rejects empty/repeated/same-source duplicate IDs; inventory carries ID/invalid metadata through the complete concept layer, including unrendered concepts. Unique ID resolves current concept after rename/move without rewriting anchor/history. Missing/ambiguous ID does not bind old-name replacement. Legacy ID-less matching still uses unique library/name and does not depend on unrelated malformed IDs. Generated dedup stable through rename, different for replacement ID; explicit keys unchanged. General split/merge migration and automatic identity backfill are not implemented. |
| `crl-vscode/{flagPlacement,correspondenceCockpit}.ts`; `flagPlacement.test.mjs`, `flagWorkflowHost.test.mjs` | **Kit updated**, review-flags placement claim. Actual host ID projection/resolve callback drives badges and drawer gids. Direct multi-occurrence and folded Criterion rollups use resolved current identity; flag status/category/history preserved. Full-index duplicate ID is rejected even if duplicate is unrendered. |
| `authoring-kit/navigation.ts`, content hash pin | **Kit updated** retrieval for renamed concept / stable ID / flag placement / orphaned flag. No syntax or emitted clinical semantics changed. |

Two owning tags added; no tags removed. Plan review776 accepted two important findings, no critical/nit. Code review777 accepted two important findings: host error visibility/recovery and exact-tag identity parsing. Both have owning regression assertions. Actual pinned native engine produced named unanswered A/B with no actions at the two pauses and exact MET with true A+B at completion. Actual renderer/browser confirmed renamed-ID KE/MV placement and independent yellow/green status colors. Native complete-QR submission/clear also passed (A true/B unknown -> B true/MET -> B cleared/no action), using a timeline strictly after the day-precision source fact. Core and bundled extension MCP entry points return the exact updated kit hash and capture/deduplicate stable IDs across rename while preserving the original stored anchor, including an unrelated @id-source tag. This does not claim native support for the cross-library negative control or source attribution completion. Prior runtime work and unrelated files are preserved.

### Native runtime reliability and retry

| Change | Disposition and evidence |
| --- | --- |
| `results/driver/ApplyDriver.java`, class/build metadata; `scripts/native-acceptance/unicode.cjs` | **Kit updated**, `produce-results`: explicit UTF-8 output. Actual pinned engine/Java 23 baseline corrupts non-ASCII question and coded answer under Windows-1252; fixed raw/saved Q/QR preserves them. Two reflective batch captures remain isolated;4096-byte output cap fails rather than leaks/truncates success. Java 17 class/API floor verified; Java 17 runtime not executed. No new clinical semantic claim. |
| `ownedProcess.ts`, Windows helper, `spawn.ts`, `runProducer.ts`, producer lifecycle; ownedProcess/Posix/suiteProduction/nativeSignals tests; `lifecycle.cjs` | **Kit updated**, one active producer, bounded timeouts and uncertain-cleanup restart. Ten actual Windows tests cover launcher/descendant lifetime, timeout/cancel/startup/owner-loss, sentinel isolation, quoting, overflow and missing executable. Mocked POSIX grace and double-signal tests cover sequencing; actual Ubuntu four CLI signal combinations terminate owned descendants. Actual MCP EOF terminates active ApplyDriver. SIGKILL owner-loss remains a stated POSIX limitation. Request-local cancellation does not cancel an unrelated accepted invocation. |
| `retry.ts`, runtimeFingerprint, producer/manifest; `retry.test.ts`, `runtimeFingerprint.test.ts`, `retry.cjs` | **Kit updated**, `produce-results:compatible-retry` and `produce-results:runtime-compatibility`. Four failure states retry, same-named distinct files remain distinct; unchanged outputs preserve bytes/mtime/producedAt; damaged artifacts/changed data rerun, removed cases prune. Old/duplicate/global model/runtime mismatches refuse. Linked output paths refuse before case invocation; arbitrary manifest paths are not followed. Effective Java timezone affects fingerprint even with identical caller environment/version. Real native generated/timeout/generated becomes all generated with one case invocation; repeat invokes zero cases. Historical retention is explicitly not fresh evaluation or clinical correctness. |
| Regression `retryFrom`, CLI `--retry-from`; retry tests | **Kit updated**, `mv-case-authoring:regression-retry-isolation`: reuse previous regression scratch, refuse copied regression manifest in policy MV destination and destinations with an MV manifest. Default remains a fresh temporary run. No ownership registry or transaction/recovery framework. |
| CLI/MCP `caseTimeoutMs`/`retryFailed`; README; kit index/navigation | **Kit updated**, `produce-results` and aliases. Default 600000 ms; positive integer bound; operational timeout can increase onretry. Separate inputClock, invocation generatedAt, per-case producedAt/reused. Public produceRegressionResults becomes awaitable. Source documentation mirrors the options; bundled/installed delivery is a separate release gate. |
| package allowlist/copy-catalog/esbuild/stableServer | **Not author-facing language semantics**: ship Windows helper beside driver in core and extension staging. Existing stable-server tests (4) passed. No new dependency. |
| produceCleanup and existing suite/prune assertions | **Existing guidance sufficient**, `emitted-trees-are-ours`; existing output ownership and complete accounting remain. Linked write destinations now refuse rather than write through; stale unowned links are reported, never followed. |
| JFR measurement | **Not author-facing semantics**. One tiny named-answer fixture:19.66 s,98/253 execution samples contain compiler/parser frames. Not exact phase timing or per-library compile counts; no cache implemented or promised. |
| Unrelated local release skill, AGENTS, mail-context, Bleph review record | **Outside this task; preserved**. Not included in runtime/kit audit certification or release claims. |

Alias-root correction: fresh regression and retry work through a linked temporary-directory parent; links beneath the chosen root still refuse.
Core/extension clean builds, 271 focused runtime/kit tests before that correction, 38 affected tests afterward, core MCP smoke and 36 bundled MCP/staging tests pass.

Three owning tags added; no tags removed. No grammar/CRL/CEL authoring syntax, emitted clinical meaning, reference fixtures, dependency versions or MV clinical verdicts changed.
Reviews 770-774 cover plan/UTF8/lifecycle; retry code 775 converged (one important root-alias finding accepted and verified). Native-only after external review request was blocked before execution by automatic approval review; no external convergence claimed.



## Maintenance — L34194 example and criterion border

Baseline: `9208fe17c46ad0c9480c7a9d6df8e0e24ac72255` (last completed audit).
Reviewed target: `85e11736c904729710a0839befdda0f0fdf12b3c`.
Finalized in a separate metadata stamp after the example and UI commits.
Kit schema remains `2.4`; content hash remains
`4275ddb15f678fdf9a912e9812f1345ca195749a802dd327f2b99f4f1652c0ff`.
The complete changed-path inventory is [maintenance-l34194-paths.txt](maintenance-l34194-paths.txt).
This is a bounded maintenance delta, not a new full test census or a clinical certification.

| Changed assertion, input, or implementation | Disposition and evidence limits |
| --- | --- |
| `examples/bleph-medical-validation/src/{source,refined-source,anchor-source,provenance}/**`; README | **Existing guidance sufficient**, source fidelity and verification. Versioned L34194 v27/R7 source, structured refinement, canonical DOCX-derived anchor and source attribution accompany a light ordinary upper-blepharoplasty/ptosis example. Scope is one procedure/eye per assessment. Strict final provenance passes with explicit scope waivers. This is source attribution and bounded review, not complete LCD implementation or human MV sign-off. |
| Example CRL, CEL and configured package; `mvWorkspaceFixture.test.mjs`, “L34194 cases select the correct procedure evidence and preserve unanswered states” (`@kit mv-case-authoring:l34194-example`) | **Existing guidance sufficient**, `mv-case-authoring`, `cel-cases`, `named-answer-options`, `criterion`, `guard-or-vs-sibling-or`. Actual example uses eight answerable inputs, three criteria, shared cosmetic/functional checks and procedure-specific findings/photos. The owning test runs 16 MV plus30 regression controls, asserts46 passes/14 expected pauses, both positive evidence routes and a closed two-code procedure domain. Earlier unknown gates pause before later negative evidence; a false conjunction operand can determine its own criterion despite an unknown sibling. These are authored sequencing choices, not a language change or a guarantee of native question suppression. |
| Same owner, “the policy shares common checks before selecting procedure-specific evidence” (`@kit branch-guards:l34194-shared-checks`) | **Existing guidance sufficient**, `branch-guards`, `guard-or-vs-sibling-or`. Exact emitted PlanDefinition requires one occurrence of each guard, procedure evidence under the common gate, both applicability conditions and correct negations on the common/otherwise branches, and no Coalesce. Assertions also pin the shared rejection's source union and four MV references. CRE rows cover cosmetic exclusion with otherwise qualifying evidence, rejection before procedure selection, false/unknown common operands, and earlier unanswered gates. Structural assertions do not alone prove execution. |
| Same owner, “procedure selection uses recency and rejects ambiguous or unrecognized answers” | **Existing guidance sufficient**, selected-publication identity/selection. Actual graph mutations test a newer ptosis answer, tied different answers and a foreign code. CRE accepts the newer value and refuses ambiguous/invalid selection without an activity. Native coverage comes from the authored CEL controls, not these in-memory mutations. |
| Example `src/{cql,fhir}/**`, `tests/{data,results}/**`; same owner, “the Bleph MV example is discoverable and its native forms match its MV cases”, “the L34194 native delivery stays bound to its source snapshot and emitted patient data”, “the Bleph example includes the complete matching FHIR definition set” | **Existing guidance sufficient**, `verify-loop` and `mv-case-authoring`. Eight CQL files and26 FHIR definitions match actual two-lane emission. Sixteen native Q/QR pairs have correct suite membership, output hashes, installed CRL5.4.2 provenance and pinned engine identity; normalized source/config and emitted patient resources are bound by assertions. Fresh native execution separately passed all46 cases, including14 pauses, with exact disposition/route and typed answer comparisons. Evidence consists of45 cases plus one added cosmetic-precedence probe with byte-identical emitted FHIR/CQL. This is concrete example evidence, not universal emitter conformance. |
| Same owner, debugger/workspace test and demonstration flag/review test; example review samples and MV flags | **Not author-facing language semantics.** Workspace entry remains runnable; a labeled KE flag exercises inspection/resolution, while saved verdict samples remain outside active MV state. No human approval was synthesized. Frozen acceptance fixture and unrelated working-tree files are outside this change. |
| `crl-vscode/src/flowPaneHtml.ts` | **Not author-facing language semantics.** Remove the expanded criterion header's transparent stroke override so its neutral border remains. Existing selected-path treatment is unchanged. All92 existing tree-rendering tests and extension build/typecheck pass. This is the operator's visual tweak; it needs no new behavior suite. |
| Prior audit/coverage finalization and root/core/extension versions plus lockfile | **Not author-facing semantics.** Baseline-to-HEAD delta inspected: prior metadata stamp and5.4.2 version changes only; no dependency or kit content change. |

Two new owning tags are listed above; no existing tags removed or changed.
All eight fixture tests are dispositioned, including unchanged workspace coverage.
No grammar, compiler, runtime, MCP contract, kit teaching or reference artifact changed.
Existing kit proof tiers remain intact. The delivered kit does not embed this example's source.

Review: substantive source plan/code covered in rounds763–768; final767/768
native reviews0critical/0important/0nit. External767 incomplete; external768
completed1critical/5important/3nits plus scope note. Lead dispositions Accept4,
Refine5, Reject1 after verifying findings; ordered partial-data behavior retained,
precedence/guard/provenance assertions added, scope rationale clarified. No unrun
re-review claimed. Mechanical border and evidence-record edits need no new panel.
Validation: all46 CRE/native cases,16 native form pairs,8 focused fixture tests,
strict provenance,92 tree tests, core/extension builds and typechecks pass.
Installed5.4.2 MV verified both procedure routes and their six questions, separate
Result Questionnaire and populated saved FHIR form. Kit retrieval/export identity
matches schema2.4/hash4275ddb15f678fdf9a912e9812f1345ca195749a802dd327f2b99f4f1652c0ff
in the actual MCP full response; all188 kit/reference/retrieval/export tests pass.
The connected installed MCP carries its earlier audit metadata; it is not upgraded
by this source commit. Export identity is checked again after the metadata stamp.
Staged authored/generated text passes whitespace checks with CRLF accepted;
downloaded CMS source whitespace is retained verbatim and excluded from that check.

## Maintenance — MV result order and runnable Bleph workspace (5.4.2)

Baseline: `badef3ce5f10c1a5d09e657371ced6c7576392e4` (last completed kit audit).
Reviewed implementation target: `9208fe17c46ad0c9480c7a9d6df8e0e24ac72255`. This maintenance preserves kit schema
`2.4` and content hash `4275ddb15f678fdf9a912e9812f1345ca195749a802dd327f2b99f4f1652c0ff`.
Finalized by the separate metadata stamp; kit teaching and content identity are unchanged.

| Changed assertions, inputs, and implementation | Disposition and evidence limits |
| --- | --- |
| `crl-vscode/src/branchNavigation.ts` and its test | **Not author-facing language semantics.** Next/Previous and one-based count use visual disposition order, preserving the first authored route for each covered result. New rows cover scrambled case order, alternate routes, uncovered/duplicate visual keys, empty terminal keys, non-disposition fallback and unchanged empty-order behavior. Existing endpoints do not wrap. The original implementation fails the new order assertion; restored implementation passes all five tests. |
| `crl-vscode/src/correspondenceCockpit.ts`, `treeInteractionHost.test.mjs`, `flowPaneHtml.test.mjs` | **Not author-facing language semantics.** Both navigation dispatch and counter use the same helper. VM coverage asserts the structural keys passed by that actual helper. SVG tests compare rendered result y positions against structural order for first/otherwise, nested first, and multiple decisions. Live Bleph traversed 1 of 6 through 6 of 6 and back, matching visual result identities. No authored CEL cases or route evaluation were changed. |
| `crl-vscode/src/mvWorkspaceFixture.test.mjs`; `examples/bleph-medical-validation/**` (467 files) | **Existing guidance sufficient**, `mv-case-authoring` and `cel-cases`. The example retains the already tested 5.4.0 delivery: 37 MV cases and 69 full regression cases. All 465 prior delivery files compare byte-for-byte; README and a workspace entry make it runnable. Tests resolve actual suites, require the MV/regression split, and check the native manifest's case membership, Q/QR presence, paths and hashes. Snapshot assertions also bind the normalized source/configuration and original manifest provenance; patient data hashes and exact workspace layout are checked. These are fixture-integrity checks, not fresh native execution or clinical certification; existing source correspondence findings remain KE work. |
| `.vscode/launch.json`, `.vscode/tasks.json`, `.gitignore`, acceptance Bleph README | **Not author-facing semantics.** Debugger opens the maintained policy-shaped workspace and compiles the development extension. The frozen 116-case native fixture is unchanged except a README pointer. Tests resolve the workspace, build task and development extension path. |
| `crl-vscode/package.json` setting descriptions and cockpit discovery message | **Existing guidance sufficient**, `mv-case-authoring`. Text identifies src/cel/mv and distinguishes optional Worklist panes from result review in the tree. No discovery rule or setting default changed. Other package edits are versions or equivalent JSON Unicode serialization. |
| `.claude/skills/crl-release/SKILL.md` | **Not author-facing language semantics.** Maintainer Windows test copies require separate application identity and a dedicated profile. This prevents test executables from replacing regular recent-project launch entries. It is not a CRL renderer fix or a new KE setup requirement. The separate-process startup stall cleared after the operator restarted the laptop; fresh installed-artifact verification remains a separate release gate. |
| Previous audit/coverage finalization; root/core/extension package versions and lockfile | **Not author-facing semantics.** Complete saved-audit-to-release delta inspected. No dependency, grammar, compiler, CEL assertion, FHIR emission, runtime asset or kit-content change. |

No owning @kit tags were added, removed or changed. New untagged UI and fixture
assertions are dispositioned above; existing teaching remains sufficient.
The complete source path inventory is in
[maintenance-5.4.2-paths.txt](maintenance-5.4.2-paths.txt), including generated example files.
It includes the prior audit.json stamp finalization already changed since the baseline.
The new audit.json stamp remains untouched until the reviewed source commit exists.

Validation: full core 4,945 passed/32 skipped, real MCP passed, extension 1,271
passed/3 expected failures; both typechecks passed. Final 104 focused checks passed after the narrow review corrections, with fresh core/extension builds. Review 759 covers the order
plan and 760 the code. Installed-archive acceptance is recorded separately in the
release receipt; this source audit alone does not certify it or native outcomes.


## Maintenance — reusable conditions and shared continuations (754/755)

Baseline: `74d4f1e6322cd81c8fa3ccf5fd1583cb1c456f5f` (last completed audit).
Implementation target before kit edits: `fe4e8ba5b7c2e779b28d287297377edfc5f722d9`.
Final reviewed content target: `badef3ce5f10c1a5d09e657371ced6c7576392e4`. Kit schema `2.4`;
content hash `4275ddb15f678fdf9a912e9812f1345ca195749a802dd327f2b99f4f1652c0ff`. Finalized by the separate metadata stamp. The source audit includes the complete saved-audit delta, not just
kit bytes. No release or installed-user upgrade is implied.

Intent: teach source applicability and independent Boolean conditions, actual
Criterion reuse, and valid same-library action-bearing continuations. Reuse-only
is authoring purpose/default guidance, not a grammar count gate. Keeping one-use
expressions inline avoids redundant wrappers in the MV view; faithful overrides
remain allowed. Legacy DNF factoring capability is preserved as a compiler
mechanism rather than the default reason to introduce a Criterion.

The role lesson and fictional transfer evidence arrived through authorized mail.
The lead independently recomputed the supplied 12 source rows and found no
outcome/question-set mismatch. The peer's 24 native invocations and source judge
remain peer-reported evidence, not locally rerun or clinical certification. This
supports concise teaching; it does not certify a customer policy or universal
prevention of modeling errors. New exact reference bytes have CRE/emission tiers
only. Their native/interactive verification remains an explicit per-policy task.

| Changed assertion, input, or implementation | Disposition and evidence limits |
| --- | --- |
| `cre/tests/sharedDecisionScaling.test.ts`: 25-definition emission, one graph visit per definition, 3 actual cases retaining 25 static definitions and fewer than 260 case nodes; original two-path source generator | **Kit updated**, `chaining-necessity:shared-definition-emission`, `mv-case-authoring:shared-case-projection`. Full normal two-lane emission and actual model/validation/advice APIs run on selected Boolean C/D/E Observations with canonicalBase. Limits are these bounded graphs, not universal linear runtime. The pure source builder moves into `decisionExamples.ts` and serves the small reference too. |
| Same owner: delivered nine-case shared continuation | **Kit updated**, `chaining-necessity:ordered-shared-continuation`. Exact CRL/CEL and served `requires.crl` are executed; exact activity arrays, condition sequence and both Met terminal occurrence IDs are asserted. Source requires C0, applicable D0, then E; C0-unknown/E-false and D0-unknown/E-false pause. C0=false bypasses D0, D0=false stops before E, E true/false/missing establishes Met/Unmet/pause when reached. An inline-duplicated comparator checks the same nine CRE activity arrays and entered condition sequences, without claiming native structural equality. Nine cases are bounded engineering coverage, not exhaustive 27-state coverage. No native tier is inherited from earlier, different CEL bytes. |
| Same owner: reused-condition reference and `criterion-reuse` snippet | **Kit updated**, `criterion:reused-applicable-condition`. One pure snippet is embedded in the complete library and the short example. Explicit single/combined universe, request type first, A OR B reused at two guards; documentation only combined. Eleven exact-output CRE rows include unknown intake, independent OR, each known drop-one conjunct, both findings true, and false conjunct dominating another unknown. Emission succeeds with the actual served project config; no native/client visibility proof. Both new CEL files explicitly belong in engineering regression, one pair per scratch project with an empty mv directory. Owning tests exercise validateCelCommand, runRegression and exact empty diagnostic sets. All answerable concepts have presentations; copied CRL includes its source assumptions. |
| `cre/tests/pauseResult.test.ts`: eight multiple-result parameter rows; pause multiplicity assertion; `cre/run.ts` | **Kit updated**, `cel-cases:multiple-expectations-refused`. Wrong-first/correct-last, reverse, duplicate, Boolean-only/mixed, two roots and same-root all cases: ordinary CEL validation succeeds and data emits, but CRE returns error/null expected/no trace/no production and exactly one cre-multiple-result-assertions. Pause multiplicity uses existing conflicting-pause-results only. Existing zero/single Boolean unsupported message is not assigned an invented diagnostic code. Full regression/FINAL execution obligations remain binding. |
| Same pause file deferred attribution rows and `provenance/tests/failedCriteria.test.ts`; `provenance/failedCriteria.ts` | **Existing guidance sufficient**, source fidelity and failed-criterion attribution. False/unknown/preempting ancestor and excluded action are preserved; no target is fabricated through an ancestor cycle. Legacy action-guard fixture distinguishes entered, excluded, unresolved and cyclic trace fields; it is not positive selected-publication action-menu teaching. Static reachable activity summaries do not establish executed child failures. |
| `ast/decisionArms.ts`, `ast/decisionSpine.ts`, `ast/tests/decisionSpine.test.ts`, `cre/viewModel.ts`, `cre/tests/viewModel.test.ts`, `cre/tests/branchConditionEval.test.ts`, `provenance/tests/crlStructure.test.ts` | **Kit updated**, compact case projection and factoring migration. Entered occurrence IDs remain source-identical; source definitions remain complete; unentered target descendants are absent from the case tree, with source access. Positive root/action and entered foreign legacy occurrence assertions prevent vacuous subset checks. The corrected local fact code activates the intended legacy fixture path; it does not certify foreign publication delegation. Remaining changes are schema7 mechanics. |
| `cel/offPathWarnings.ts`, `cel/tests/offPathWarnings.test.ts` | **Existing guidance sufficient**, `mv-case-authoring:off-path-advisory`, with clearer whole-file refusal note. Positive B warning persists without renderer; possible unentered use suppresses it; unused source definition alone does not. One errored sibling suppresses all file advice. Regression remains excluded and CRE refusal cannot break data-only emission. Cross-library advisory test substitutes an actual local trace whose changed delegation never entered; this isolates advisory identity and does not establish foreign runtime support. |
| `fhir-emitter/presentationReachability.ts`, its tests | **Existing guidance sufficient**, `concept-presentation`, with new `concept-presentation:shared-coexistence` tag. 256 independent Boolean execution structures; 40-definition read count; exclusive vs simultaneous/versioned delegation; earlier guard inputs; cycles and permutations; unreachable first siblings; independent missing targets and conflicts; W1/W2 exclusive plus W3 simultaneous; distinct composition-site errors. These verify structural overlap checks and bounded scaling, not native question population or logical correlation across independent calls. Existing conservative cross-invocation correlation limitation remains; report a faithful-model conflict rather than changing meaning to silence it. |
| `docs/cel-spec.md`, `docs/provenance-spec.md`, core MCP descriptions | **Kit updated**, explicit unsupported assertion contract, no tree on refusal, schema7 and authored-versus-executed correspondence. Added run_decision description makes refusal searchable. No new validator warning or runtime capability was added in kit5. |
| `crl-vscode/src/executionRoutes.ts` and test, `renderScenarioHtml.ts` and test, `flowPaneHtml.ts` and test, `correspondenceCockpit.ts`, `flowSnapshotHtml.ts` and test | **Not language semantics** beyond source access explained above. Target-root/blocked-guard identity, trusted opaque source reveal, rendered-target-only links, theme glyph, pinned hiding/restoration, and nested-SVG-safe snapshot CSS. Actual devhost evidence for fixes1–4 is retained separately; this kit todo does not claim another live UI run. |
| Prior audit.json/coverage stamp and package/lock version changes | **Not author-facing semantics**: inspected previous stamp and 5.4.0 version-only changes. No dependency/compiler/driver update. New audit must span them, not pretend the 2.3 stamp covered fixes1–4. |
| Kit index/navigation/requirements and owner tags; query and kit/reference tests | **Kit updated**: seven existing rules, two paired references, criterion-reuse, related judge wording, aliases and prerequisites. Rule-to-example references are discovery pointers, not transitive prerequisites; artifact-to-rule requirements remain. Focused Criterion and decision-composition payloads stay below half of full (observed fail before correction/pass after). Generic CRE gate now materializes only served dependencies/config rather than all references under a private config. This deliberately removes incidental co-resolution of unrelated reference roots; completeness of each declared closure is checked by validation and execution. Search covers internal helper/shared continuation/multiple results/vertical AND. Full/entry/overview/Markdown checks remain; four additional reference entries justify a bounded 32KB overview ceiling. Packaging assertions prove retrieval and synchronization, not clinical truth. |
| `docs/decision-shapes.md` | **Kit updated**: role/order lesson and shared-helper/migration guidance; legacy DNF example is explicitly mechanism evidence. Corrected the misleading blanket OR→ordered-branches table row. No grammar or lowering changes. |

Six new owning tags; existing tags retained, none unknown or orphaned. Updated
query parameter rows retain their existing discovery tag. Untagged parameter
boundaries are dispositioned above; there is no whole-file unreviewed exclusion.
Complete path inventory follows. The content commit is immediately followed by a separate metadata stamp commit; the intermediate contentMatchesAudit=false state is deliberate and is not releasable.

Retained 5.4 delivery copies inspected: Bleph 37 MV cases and RX 10 MV cases each
have zero multiple-result cases. This is a bounded local-copy inventory, not a
new customer-content review or proof for arbitrary policy suites. Existing
clinical/source-correspondence findings remain unresolved KE work.

Validation: build and249 final affected tests pass; actual MCP full JSON/API and Markdown equality, complete overview, four searches and paired prerequisite retrieval pass. Full5.4.1 suite on preceding kit content passed core4945/32skipped, real MCP and extension1266/3expected failures. Subsequent changes are kit/docs/reference/test refinements only; final affected tests passed again. Native/runtime outcomes remain bounded by their separate prior receipts. Export and installed identity are checked after the separate stamp.

Review754: native0critical/1important/1nit,Accept2, follow-up converged0/0/0. External4critical/7important/4nit,Accept8/Refine7/Reject0. Review755 round1: native0critical/2important/1nit,Accept3; external1critical/9important/5nit,Accept7/Refine6/Reject2. Round2: native0/0/0; external0critical/3important/2nit,Accept5; corrected prerequisite backedges, helper root exposure, Criterion-only single-use bound remedy, overview rationale and question wording. Round3 native0/0/0; external0critical/2important/4nit,Accept4/Refine1/Reject1. Final bounded corrections verify artifact discovery IDs, restore the Boolean-rule prerequisite, require explicit question text and clarify independent helper application. A deliberate missing artifact ID failed the new assertion before original bytes were restored. Final249 affected tests and actual MCP retrieval pass hash4275ddb15f678fdf9a912e9812f1345ca195749a802dd327f2b99f4f1652c0ff. No further broad external round or unrun external convergence claimed; native narrow closeout converged0/0/0. Full inputs, responses and individual dispositions in discussions754/755. No unrun convergence asserted.


Complete changed-path inventory (baseline through this content):

- `docs/cel-spec.md`
- `docs/decision-shapes.md`
- `docs/provenance-spec.md`
- `package-lock.json`
- `package.json`
- `packages/crl-vscode/package.json`
- `packages/crl-vscode/src/mcp-server.test.mjs`
- `packages/crl-vscode/src/correspondenceCockpit.ts`
- `packages/crl-vscode/src/executionRoutes.test.mjs`
- `packages/crl-vscode/src/executionRoutes.ts`
- `packages/crl-vscode/src/flowPaneHtml.test.mjs`
- `packages/crl-vscode/src/flowPaneHtml.ts`
- `packages/crl-vscode/src/flowSnapshotHtml.test.mjs`
- `packages/crl-vscode/src/flowSnapshotHtml.ts`
- `packages/crl-vscode/src/renderScenarioHtml.test.mjs`
- `packages/crl-vscode/src/renderScenarioHtml.ts`
- `packages/crl/package.json`
- `packages/crl/src/ast/decisionArms.ts`
- `packages/crl/src/ast/decisionSpine.ts`
- `packages/crl/src/ast/tests/decisionSpine.test.ts`
- `packages/crl/src/authoring-kit/audit.json`
- `packages/crl/src/authoring-kit/decisionExamples.ts`
- `packages/crl/src/authoring-kit/index.ts`
- `packages/crl/src/authoring-kit/navigation.ts`
- `packages/crl/src/authoring-kit/requirements.ts`
- `packages/crl/src/authoring-kit/tests/authoring-kit.test.ts`
- `packages/crl/src/authoring-kit/tests/coverage.md`
- `packages/crl/src/authoring-kit/tests/query.test.ts`
- `packages/crl/src/cel/offPathWarnings.ts`
- `packages/crl/src/cel/tests/offPathWarnings.test.ts`
- `packages/crl/src/cli/tests/run-mcp-server.test.mjs`
- `packages/crl/src/cre/run.ts`
- `packages/crl/src/cre/tests/branchConditionEval.test.ts`
- `packages/crl/src/cre/tests/pauseResult.test.ts`
- `packages/crl/src/cre/tests/sharedDecisionScaling.test.ts`
- `packages/crl/src/cre/tests/viewModel.test.ts`
- `packages/crl/src/cre/viewModel.ts`
- `packages/crl/src/fhir-emitter/presentationReachability.ts`
- `packages/crl/src/fhir-emitter/tests/presentationReachability.test.ts`
- `packages/crl/src/mcp/server.ts`
- `packages/crl/src/provenance/failedCriteria.ts`
- `packages/crl/src/provenance/tests/crlStructure.test.ts`
- `packages/crl/src/provenance/tests/failedCriteria.test.ts`

## Maintenance — MV and regression case sets (744–746)

Baseline: `cc1b675ed9431d047bd5fb34305abef1b9af18a8`.
Target: `74d4f1e6322cd81c8fa3ccf5fd1583cb1c456f5f`. Kit schema `2.3`; content hash
`75720d63e074fc63f88f9e8d3f6f98d3097be313c5b8f4dd91a3fa1d11aea7b8`.
This is a complete source/test delta from the saved audit, including its following
metadata commit and the small post-audit 5.3 keyboard-focus correction. Historical
5.3 limitations below describe that release; this section supersedes them for 5.4.

Operator intent: MV contains clinical question-path examples; regression evaluates
those same examples plus engineering controls. Runtime data is never rewritten to
make a demonstration cleaner. Git owns source and review history. The abandoned
prototype's freshness protocol, output transactions, scratch ownership, failed-run
receipts and history migration API are excluded, not teaching to preserve.

| Changed assertion/input or implementation | Disposition, observation and limits |
| --- | --- |
| `cel/tests/suite.test.ts`: selects every MV file from file or policy; same-name cases retain IDs; independent Boolean facts emit true/false unchanged; regression union has three cases versus two MV; missing/empty folders, duplicate library/ID, foreign policy and unclassified inputs | **Kit updated**, `mv-case-authoring:suite-selection`. Fixture is the test's Policy/Answer Observation, two Clinical files and Engineering control, with a policy package.json and canonicalBase. Verifies discovery, CRE identity and FHIR data emission, not native outcome or clinical completeness. Invalid engineering syntax does not disable normal MV. |
| Same suite tests (including explicit MV validation with invalid regression): invalid sibling returns no publishable partial suite, explicit empty MV clears data inventory, authored now values share one clock | **Existing guidance sufficient**, `emitted-trees-are-ours` and explicit CEL clock guidance. Aggregate before the existing writer; no transaction/recovery promise. Preserved prior files on validation refusal do not establish rollback after a write failure. |
| `cel/tests/regression.test.ts`: actual API and built CLI with pass, incorrect expected disposition, and missing result assertion | **Kit updated**, `mv-case-authoring:regression-assertions`. Policy A with Approve/Deny verifies case status, checks.success and exit 0/2. Running CRE successfully is insufficient unless each assertion passes. No native oracle claim. |
| `results/tests/suiteProduction.test.ts`: same-name MV cases, source/frozen IDs, union once each in automatic temporary output, normal unsuccessful states, no-questionnaire with/without closure inputs, superseded manifest reporting, explicit empty MV, manifest identity and outside-root redirect | **Kit updated**, `mv-case-authoring:regression-isolation`; existing emitted ownership guidance covers pruning and foreign-resource preservation. Real suite/data/filesystem, substituted compiler/JVM. Temporary union contains three cases; normal MV remains separate. Failed/timeout/not-run/populate-degraded stay ordinary case states. No proof of native activities, pause or interactive sequences. |
| `results/tests/produceCleanup.test.ts`: empty suite with prune on/off and injected deletion failure; `runProducer.test.ts`: ordinary ERROR text classification | **Existing guidance sufficient**, three `emitted-trees-are-ours` tags retained. Removed mock graph/compiler prerequisites in favor of real empty-folder selection. Failed deletion remains reported while other owned Q/QR files are pruned; foreign resources remain outside ownership. Error-marker correction prevents classifying an engine failure as success, including a separate genuine error beside the known repeats diagnostic. Aggregate unsuccessful counts include degradation/not-run without erasing their distinct case states. Removed the unverified closure-wide no-questionnaire promotion; case-specific native expectations remain the oracle. |
| `cel/tests/offPathWarnings.test.ts`: supplied preempted B, earlier false A, missing A, criterion-computed B, possible source overlap, regression purpose and CRE refusal | **Kit updated**, `mv-case-authoring:off-path-advisory`. Uses actual two-condition first-match CRL/CEL. Asserts B warning and byte-unchanged CEL; uncertain/shared dependencies and failed evaluation suppress advice. Conservative local Boolean advice only; absence of warning does not prove minimality or coverage. Cross-library frame lookup is implementation-reviewed, not independently native-tested. |
| `provenance/tests/correspondenceCheck.test.ts`: MV/regression same-basename files, project-relative links, FINAL only MV, conflicting frozen IDs excluded; correspondence unresolved wording | **Kit updated**, `mv-case-authoring` source identity and FINAL scope. Reuses existing L/D approve-inner-deny-outer-deny fixture with independent CEL library/IDs. Valid engineering references resolve without entering MV completion; conflicts cannot attach engineering evidence to MV IDs. Source correspondence remains independent of execution. |
| `provenance/generateFiles.ts`: scaffold each selected graph and merge corresponding clusters | **Existing guidance sufficient**, source-fidelity/correspondence rules remain binding; generation remains scaffolding, not proof of final narrative coverage. The added `generate-disposition-path.test.ts` case calls the generator on two same-basename independent suites: four source/ID references occur exactly once, two cases share one cluster without duplicate CRL refs, two other clusters survive, and FINAL correspondence reports no mismatch or unchecked case. The test runs both MV+MV and MV+regression variants and passes the suite model through checkCockpitCorrespondence; all 18 generator tests pass. caseViewKey consistently supplies standalone or source-aware identity. |
| `cel/validateCommand.ts`, CLI/MCP emission/validation, producer wrappers, source-aware view model and cockpit, caseInput/manifest/writer | **Kit updated**, complete MV selection and ordinary result reporting. Existing low-level CEL/FHIR semantics are reused. The schema remains 1 with optional sourceFile/caseId, not a freshness protocol. Native regression invokes existing form production; independent native-outcome verification remains required. |
| `cli/tests/run-mcp-server.test.mjs`: CMS22 fixture copied to package/src/crl and src/cel/mv, tool output and write checks retained; kit full JSON/Markdown pins | **Existing guidance sufficient**, entry-point verification and kit identity rules. Actual transport is exercised. Fixture facts are unchanged; folder placement now supplies required project scope. Kit hash/retrieval checks do not prove native execution. |
| Extension launch tests, CEL selection routing, watcher/result lookup, same-name key and script literal | **Not language semantics** beyond the suite selection taught above. Tests replace obsolete per-file ambiguity with whole-policy selection, retain policy boundaries, reject explicit regression and loose CEL. Viewer geometry/design is unchanged. |
| Prior audit/ledger stamp, 5.3 flow focus selector, package versions/lock/bin, docs | **Not author-facing semantics** for stamp/version/focus. New CLI bin and docs expose the reviewed operations. No dependency version, grammar, CQL/FHIR compiler or driver change. Package changes remain separately reviewed release metadata. |

Four new owning tags: `mv-case-authoring:suite-selection`,
`:regression-assertions`, `:regression-isolation`, `:off-path-advisory`.
No existing owning tag or language-kit assertion was removed. Untagged boundary
rows are dispositioned above rather than excluded as whole files. The rules `cel-cases`, `mv-case-authoring`, `cel-identity`, `verify-loop` and `produce-results` now consistently teach the selected-set contract, complete-publication refusal, validation scope, result states and review reset obligations. Reference artifacts, examples, grammar and native verification obligations remain unchanged. No second teaching fixture
or native assertion oracle was introduced.

Final bounded corrections: explicit validation checks every selected graph with
source-path diagnostics; FINAL with no MV graphs reports render-failed; same-file
duplicate names retain collision diagnostics without contaminating another file;
cross-file repeated display names show source suffixes in the UI. The shared
classifier follows platform path casing. These extend the selected-set, identity
and FINAL obligations above without changing syntax or native semantics.

Final source checks: core4901 pass/32 skipped, actual MCP passed; extension1262
pass/3 expected failures;32 focused core checks cover the final bounded fixes;
builds/typechecks and diff checks pass. Review746 round2 external2critical,
7important,1nit received3Accept/3Refine/4Reject; final native code0critical,
1important,0nit accepted and corrected a test-fixture identity. All dispositions
and full responses are recorded; no unrun external convergence is claimed.
Installed release verification remains separate from this source/kit audit.

Bleph delivery FINAL is not clean:36 source-correspondence errors and24 manual
findings, versus66 errors/24manual in the original copy; exact comparison shows
no new findings and no retired-case-ID references. These existing content issues
remain KE/source-review work. Clinical copies are local test inputs, not certified
release content. Neither their CRE outcomes nor native form production proves
clinical validity or resolves those source-correspondence findings.

Additional review746: native initially0/0/0; external3critical/8important/6nit.10Accept/6Refine/1Reject dispositions recorded in746-followup.md.342 affected core tests pass after corrections; core/extension and actual MCP gates rerun before stamping. Real Bleph37 and RX10 MV sets produce zero conservative advisories; that is not a minimality proof.29 edited Bleph examples receive new IDs, with no MV review sidecars in the delivery copy. Final source review/check status is recorded above; installed release gates are separate. Discussion744
accepted all three native findings (regression assertion status, conflicting
provenance identities, stale failure-receipt promise); follow-up converged with
zero critical/important/nit findings. External743 returned no substantive findings
before exhausting its budget; no external code convergence is claimed.

Complete changed-path inventory (including new candidate files):

- `packages/crl/src/provenance/tests/generate-disposition-path.test.ts`
- `packages/crl-vscode/src/mcp-server.test.mjs`
- `packages/crl-vscode/src/celPaneHtml.test.mjs`
- `packages/crl/src/provenance/correspondenceCheck.ts`

- `docs/cel-suites.md`
- `docs/medical-validation-plan.md`
- `package-lock.json`
- `package.json`
- `packages/crl-vscode/package.json`
- `packages/crl-vscode/src/celPaneHtml.ts`
- `packages/crl-vscode/src/cockpitWebviewScript.test.mjs`
- `packages/crl-vscode/src/correspondenceCockpit.ts`
- `packages/crl-vscode/src/flowPaneHtml.ts`
- `packages/crl-vscode/src/policyLaunchTarget.test.mjs`
- `packages/crl-vscode/src/policyLaunchTarget.ts`
- `packages/crl/package.json`
- `packages/crl/src/authoring-kit/audit.json`
- `packages/crl/src/authoring-kit/index.ts`
- `packages/crl/src/authoring-kit/tests/authoring-kit.test.ts`
- `packages/crl/src/authoring-kit/tests/coverage.md`
- `packages/crl/src/cel/emitter/types.ts`
- `packages/crl/src/cel/emitter/writer.ts`
- `packages/crl/src/cel/offPathWarnings.ts`
- `packages/crl/src/cel/publishSuite.ts`
- `packages/crl/src/cel/regression.ts`
- `packages/crl/src/cel/suite.ts`
- `packages/crl/src/cel/suiteEmit.ts`
- `packages/crl/src/cel/tests/offPathWarnings.test.ts`
- `packages/crl/src/cel/tests/regression.test.ts`
- `packages/crl/src/cel/tests/suite.test.ts`
- `packages/crl/src/cel/validateCommand.ts`
- `packages/crl/src/cli/run-emit-results.ts`
- `packages/crl/src/cli/run-emitter.ts`
- `packages/crl/src/cli/run-regression.ts`
- `packages/crl/src/cli/run-validator.ts`
- `packages/crl/src/cli/tests/run-mcp-server.test.mjs`
- `packages/crl/src/cre/viewModel.ts`
- `packages/crl/src/index.ts`
- `packages/crl/src/mcp/server.ts`
- `packages/crl/src/provenance/cockpitModel.ts`
- `packages/crl/src/provenance/correspondence.ts`
- `packages/crl/src/provenance/generateFiles.ts`
- `packages/crl/src/provenance/tests/correspondence.test.ts`
- `packages/crl/src/provenance/tests/correspondenceCheck.test.ts`
- `packages/crl/src/provenance/validateFiles.ts`
- `packages/crl/src/results/caseInput.ts`
- `packages/crl/src/results/manifest.ts`
- `packages/crl/src/results/produce.ts`
- `packages/crl/src/results/readSuiteResult.ts`
- `packages/crl/src/results/runProducer.ts`
- `packages/crl/src/results/tests/produceCleanup.test.ts`
- `packages/crl/src/results/tests/runProducer.test.ts`
- `packages/crl/src/results/tests/suiteProduction.test.ts`

## Maintenance — MV route inspection and wording handoff (737/738)

Baseline: `34d591eeab7fae22485546add54efe41106d756d`.
Target: `cc1b675ed9431d047bd5fb34305abef1b9af18a8` (reviewed content commit). Kit schema `2.2`; content hash `f31aadf37e8e371f55d83f9632933baa383259bfa8023b5d31bba29d08392e36`. This following metadata-only commit stamps that existing revision.
Scope: complete delta from the saved audit, including the preceding metadata stamp,
5.2 documentation/version updates, and the 5.3 candidate core/MV implementation.
No grammar, CQL emitter, CEL emitter, FHIR-emitter directory or driver source changes are included. Shared `emit/presentation.ts` adds field ownership; its wording/diagnostic behavior and scoped CQL/FHIR outputs match 5.2.0 in the bounded parity probe.
The separate dirty ordered-input FHIR experiment and corrupted service-request fixture
are excluded from this candidate and preserved in the source workspace.

| Changed evidence and exact observations | Disposition and limit |
| --- | --- |
| `executionRoutes.test.mjs`: “first route retains earlier No prerequisites but omits skipped later data” asserts A=no and B=yes, excluding supplied but unevaluated Extra; “parallel terminal occurrences inspect separately without changing the original case” asserts separate A/B routes and original JSON unchanged. Same-label occurrences, delegated callers, invalid/unknown prefixes and missing mappings retain distinct identity/error states. | Kit updated: `mv-case-authoring:prerequisites` and `:parallel-routes`. These synthetic executed-tree rows prove display projection, not CEL/native evaluation. Minimal-data case authoring is an operator-directed default, not a validator rule. |
| `routeCards.test.mjs`: “real Bleph execution exposes selected coded publication values” runs `completed.cel` through actual CRE; coded-choice tests distinguish system/code, ambiguity, imported wording, unknown determination and Quantity display. `crlConceptLayer.test.ts` now includes coding systems in expected choice members. | Kit updated: `mv-case-authoring:selected-values`; existing `named-answer-options` remains sufficient for terminology semantics. Added optional CRE `conceptValues` reads the already-selected resource cache; no selection or emitter semantics changed. Proof is CRE/display only. The actual Bleph fixture and its package dispositions are reused, not copied into new teaching. |
| `routeCards.test.mjs`: “wording proposal preserves baseline, validates new CRL, and writes only into MV” asserts parsed candidate, unchanged source and exclusive MV patch creation; “scoped text and inherited description retain different owners in the patch” asserts separate scoped/default owners. Missing-description and imported-owner rows retain owner/editability limits. | Kit updated: `mv-wording-patches:scope` and `:field-owners`. The existing `L`/`Complaint` Boolean CRL and scoped/default presentation fixture prove patch construction. No automatic KE consumption, full emit or clinical approval is claimed. Baseline reconciliation and ownership are manual workflow obligations. |
| `routeCards.test.mjs`: “pending and malformed MV patches prevent completion, explicit dispositions clear the gate” asserts proposed and unreadable counts; rejected clears only its own pending count. | Kit updated: `mv-wording-patches:completion`. Implementation enumerates applied/rejected/withdrawn/superseded statuses; status is not proof of re-emission. |
| `query.test.ts` adds MV CEL, off path data, edit question and KE handoff searches; existing full/overview/entry prerequisite checks cover both new rules. `authoring-kit.test.ts` advances content/version pins. | Kit updated: `verify-loop:kit-discovery`. Retrieval and identity proof only. New rules carry explicit default/invariant clauses and existing native verification anchors. |
| Execution-model extraction, policy discovery without correspondence, structural child qualifiers, optional reveal maps, and all questionnaire route tests | Existing source-fidelity/provenance guidance remains binding; new MV guidance distinguishes execution from source highlighting. No removal of FINAL correspondence or native verification obligations. |
| Remaining extension tests and browser fixtures listed below: pane lifecycle, focus, layout, leaf navigation, pin visibility, result/criterion verdicts, independent KE/MV flag controls, question badges and disclosures | Not CRL authoring semantics. Assertions cover UI identity, message routing, rendering and interaction. Existing `review-flags` phase vocabulary remains sufficient; this release does not add creator-based semantics or change the core flag API. KE flag content is read-only in MV but resolution is available. |
| `mvFlagStore.test.ts` tracked-store tag now covers provenance+cel and crl+cel; incomplete crl-only and cel-only layouts return undefined. | Kit corrected: `review-flags:tracked-store-location`. Discovery is shared by flags and MV sidecars; source correspondence remains a separate dependency. |
| Prior audit.json/coverage/test-inventory changes | Inspected metadata-only previous stamp finalization; no changed consumer content or owning assertions. |
| README/TOOLING/package manifests and lockfile | Release/documentation metadata; exact dependency versions and complete generated inventories remain governed by existing guidance. No dependency range or compiler/runtime dependency change. |

Eight new owning @kit tags were added in routeCards/executionRoutes. Existing tags
are retained; the query discovery tag gains four parameter rows. New invalid-presentation and package-owner rows verify visible wording diagnostics, rejection of read-only patches, and package-origin enforcement even below the policy root. Fixture paths are module-relative so the Bleph rows run from the package working directory.
No owning assertion
was removed from the language kit. The historical full inventory remains historical;
this maintenance is a complete delta, not a new full census.

Explicit remaining gap: suite-aware MV/regression discovery and emission, suite-wide
ownership/migration and off-path-data warnings are unimplemented in 5.3.0. The revised
`docs/medical-validation-plan.md` owns that future work. Folder naming does not isolate
emission. The kit teaches this limitation rather than claiming an implemented feature.
No new CRL/CEL example syntax is introduced. Existing load-bearing/overlap controls
and independent native-outcome verification remain required at their stated scope.

Validation before audit advancement: core build/typecheck and4,864 tests passed
(32 skipped); the actual `run-mcp-server.test passed` marker was observed. The
extension build/typecheck and1,261 tests passed (three expected-failure tests).
The combined command initially stopped at a stale extension cache type; after
replacing it with the helper's ReturnType, the complete extension command passed.
No core runtime changed during that correction. Scoped presentation emit payloads
and19 Bleph CRE cases were compared with installed5.2.0; only the documented optional
conceptValues field differed. Kit delta verification found only the two added rules
and review-flags prerequisite correction; all reference artifacts are unchanged.
Panel737:13 Accept,4 Refine,3 Reject. Panel738:9 Accept,1 Refine,2 Reject.
Final739 native review:0 critical/important/nit, converged. External739 exhausted
its turn budget without returning findings; final two-arm convergence is not claimed.
Prior external findings are fully dispositioned. Installed artifact/native/UI gates
remain release verification, not a prerequisite claimed complete by this stamp.

Post-audit release review: UI-only commit a17e386c exempts text-only ALL OF/ANY OF
controls from blanket focus-outline suppression. Discussion740 accepted one native
finding; code review converged.90 focused tests, browser checks and trusted Tab on
the final installed VSIX passed; pointer outlines remain absent. No kit content,
language behavior, API or owning kit assertion changed, so the audited content
revision/hash remains the target above. Final installed core/MCP/driver fingerprints
match the artifacts that passed116 native Bleph cases and19 installed Q/QR cases
through each MCP entry point. These are release-specific native checks, not an
extension of the kit's general clinical proof claims.

Complete changed-path inventory (includes untracked candidate files):

- `docs/medical-validation-plan.md`
- `docs/mv-component-view.md`
- `docs/mv-presentation-patches.md`
- `package-lock.json`
- `package.json`
- `packages/crl-vscode/README.md`
- `packages/crl-vscode/package.json`
- `packages/crl-vscode/src/branchNavigation.test.mjs`
- `packages/crl-vscode/src/branchNavigation.ts`
- `packages/crl-vscode/src/branchQuestionnairePanel.test.mjs`
- `packages/crl-vscode/src/branchQuestionnairePanel.ts`
- `packages/crl-vscode/src/branchVerdict.test.mjs`
- `packages/crl-vscode/src/branchVerdict.ts`
- `packages/crl-vscode/src/branchVerdictHost.test.mjs`
- `packages/crl-vscode/src/cockpitPaneSerializers.test.mjs`
- `packages/crl-vscode/src/cockpitPaneSerializers.ts`
- `packages/crl-vscode/src/cockpitWebviewScript.test.mjs`
- `packages/crl-vscode/src/correspondenceCockpit.ts`
- `packages/crl-vscode/src/correspondenceEngine.ts`
- `packages/crl-vscode/src/executionRoutes.test.mjs`
- `packages/crl-vscode/src/executionRoutes.ts`
- `packages/crl-vscode/src/flagActionDrawerHtml.test.mjs`
- `packages/crl-vscode/src/flagActionDrawerHtml.ts`
- `packages/crl-vscode/src/flagBadgesWebview.ts`
- `packages/crl-vscode/src/flagPlacement.test.mjs`
- `packages/crl-vscode/src/flagPlacement.ts`
- `packages/crl-vscode/src/flagWorkflow.test.mjs`
- `packages/crl-vscode/src/flagWorkflow.ts`
- `packages/crl-vscode/src/flagWorkflowHost.test.mjs`
- `packages/crl-vscode/src/flowComponentContainers.ts`
- `packages/crl-vscode/src/flowConnectorBorders.ts`
- `packages/crl-vscode/src/flowDisclosureFocus.ts`
- `packages/crl-vscode/src/flowKeyboardActions.ts`
- `packages/crl-vscode/src/flowLogicHighlight.ts`
- `packages/crl-vscode/src/flowPaneHtml.test.mjs`
- `packages/crl-vscode/src/flowPaneHtml.ts`
- `packages/crl-vscode/src/flowPinVisibility.ts`
- `packages/crl-vscode/src/flowProjection.test.mjs`
- `packages/crl-vscode/src/flowProjection.ts`
- `packages/crl-vscode/src/flowSnapshotHtml.test.mjs`
- `packages/crl-vscode/src/flowSnapshotHtml.ts`
- `packages/crl-vscode/src/mcp-server.test.mjs`
- `packages/crl-vscode/src/medicalValidationStore.ts`
- `packages/crl-vscode/src/nodeFlagAction.test.mjs`
- `packages/crl-vscode/src/package.test.mjs`
- `packages/crl-vscode/src/paneOrder.test.mjs`
- `packages/crl-vscode/src/paneOrder.ts`
- `packages/crl-vscode/src/presentationProposal.ts`
- `packages/crl-vscode/src/provenanceFindings.ts`
- `packages/crl-vscode/src/questionnaireModel.test.mjs`
- `packages/crl-vscode/src/questionnaireModel.ts`
- `packages/crl-vscode/src/questionnairePaneHtml.test.mjs`
- `packages/crl-vscode/src/questionnairePaneHtml.ts`
- `packages/crl-vscode/src/reviewGridHtml.test.mjs`
- `packages/crl-vscode/src/reviewGridHtml.ts`
- `packages/crl-vscode/src/routeCards.test.mjs`
- `packages/crl-vscode/src/routeCards.ts`
- `packages/crl-vscode/src/routeCardsWebview.ts`
- `packages/crl-vscode/src/treeInteractionHost.test.mjs`
- `packages/crl-vscode/src/webviewHit.ts`
- `packages/crl-vscode/test/flagBadges.browser.cjs`
- `packages/crl-vscode/test/flowComponentContainers.browser.cjs`
- `packages/crl-vscode/test/flowConnectorBorders.browser.cjs`
- `packages/crl-vscode/test/flowDisclosureFocus.browser.cjs`
- `packages/crl-vscode/test/flowKeyboardActions.browser.cjs`
- `packages/crl-vscode/test/flowLogicHighlight.browser.cjs`
- `packages/crl-vscode/test/flowPinVisibility.browser.cjs`
- `packages/crl-vscode/test/routeCards.browser.cjs`
- `packages/crl/README.md`
- `packages/crl/TOOLING.md`
- `packages/crl/package.json`
- `packages/crl/src/authoring-kit/audit.json`
- `packages/crl/src/authoring-kit/index.ts`
- `packages/crl/src/authoring-kit/navigation.ts`
- `packages/crl/src/authoring-kit/tests/authoring-kit.test.ts`
- `packages/crl/src/authoring-kit/tests/coverage.md`
- `packages/crl/src/authoring-kit/tests/query.test.ts`
- `packages/crl/src/authoring-kit/tests/reverse-claim-map.md`
- `packages/crl/src/authoring-kit/tests/test-inventory.json`
- `packages/crl/src/cli/tests/run-mcp-server.test.mjs`
- `packages/crl/src/cre/run.ts`
- `packages/crl/src/cre/viewModel.ts`
- `packages/crl/src/emit/presentation.ts`
- `packages/crl/src/flags/tests/mvFlagStore.test.ts`
- `packages/crl/src/index.ts`
- `packages/crl/src/provenance/cockpitModel.ts`
- `packages/crl/src/provenance/crlConceptLayer.ts`
- `packages/crl/src/provenance/crlStructure.ts`
- `packages/crl/src/provenance/index.ts`
- `packages/crl/src/provenance/policyLayout.ts`
- `packages/crl/src/provenance/revealMaps.ts`
- `packages/crl/src/provenance/tests/crlConceptLayer.test.ts`


## Maintenance - Elements library names (668)

Baseline: `5e105580a3390bedcbf7874ddb37e9f5f7d6279d`.
Implementation base: `d79f4c676b2c9ec0f70012ed8017a5982b20eb92`.
Target: `34d591eeab7fae22485546add54efe41106d756d` (reviewed content commit). Kit schema `2.1` and consumer content hash `28bf5d87e4802bd3da9a6e4b5798414a805ccecd740ecede8c6b977553809336` are unchanged.
The intervening commit changes only the prior audit stamp and ledger target.

The operator directs the Elements naming throughout this project, including
project-authored split libraries, fixtures, goldens and harness examples. No new
concept category is introduced. Ordinary primitive datatype terminology remains.

| Changed evidence | Disposition |
| --- | --- |
| Layer routing, internal source tags, generated identity references in emitter/import/closure tests | Not CRL authoring syntax. Assertions retain their query/value contracts and use the new layer names. Existing `artifact-integrity` guidance covers complete, resolvable artifacts. |
| CMS22/CMS69 authored fixture declarations, filenames, qualified CRL/CEL refs and emitted goldens | Existing `library-scoping` guidance sufficient: declaration/reference identity is consistent. These legacy fixtures remain bounded compiler regressions, not new recommended authoring examples. |
| CQL/FHIR goldens and checked-in native harness packages | Artifact identity changed, including encoded CQL where present. This does not certify legacy clinical intent; current Bleph and bounded BMI native checks provide separately scoped runtime evidence. |
| `elementLayers.test.ts`: short/long/shared-prefix identities, CQL includes and FHIR reference closure | Not new CRL syntax. Existing `artifact-integrity` obligation remains sufficient; these assertions add compiler packaging evidence, not a clinical claim. |
| Existing kit source comment and inventory test titles | Naming reconciliation only; no full JSON/Markdown teaching or navigation content change. |
| USER_GUIDE emitted-library section | Corrected current compilation responsibilities and complete-set replacement procedure. Existing `emit-output-root` and `artifact-integrity` claims remain sufficient; emission does not automatically prune all old CRL files. |

All changed owning test files are listed below. Each assertion/input change in this
slice is a layer-name substitution; added coverage is the identity test above.
Existing `@kit` tags and their clinical/value semantics are unchanged. No new
claims, examples or aliases are needed merely to name the compilation layers.
Inventory maintenance668 refreshes the29 affected records with current titles, line numbers and source hashes. Unaffected records retain their prior historical provenance; this is not a new full census.

- `packages/crl/src/ast/tests/definedAsBooleanComposition-t1.test.ts`
- `packages/crl/src/cql-emitter/tests/caseFeatureGuards.test.ts`
- `packages/crl/src/cql-emitter/tests/dme101-030-emit.test.ts`
- `packages/crl/src/cql-emitter/tests/heterogeneousSourceEmit.test.ts`
- `packages/crl/src/cql-emitter/tests/layeredEmit.test.ts`
- `packages/crl/src/cql-emitter/tests/ledgerEnrollment2a.test.ts`
- `packages/crl/src/cql-emitter/tests/lowerLocalCodes.test.ts`
- `packages/crl/src/cql-emitter/tests/pureQuestionEmit.test.ts`
- `packages/crl/src/cql-emitter/tests/recencyRecordMerge.test.ts`
- `packages/crl/src/cql-emitter/tests/recordUnionTerms.test.ts`
- `packages/crl/src/cql-emitter/tests/semnotLowering.test.ts`
- `packages/crl/src/cql-emitter/tests/totalScalarBoolean.test.ts`
- `packages/crl/src/emit/tests/closeIndex.test.ts`
- `packages/crl/src/emit/tests/declaredResultIndex.test.ts`
- `packages/crl/src/emit/tests/producerCandidate.test.ts`
- `packages/crl/src/emit/tests/publicationAge.test.ts`
- `packages/crl/src/emit/tests/publicationSource.test.ts`
- `packages/crl/src/fhir-emitter/tests/caseFeatureRecord.test.ts`
- `packages/crl/src/fhir-emitter/tests/closureOrchestrator.test.ts`
- `packages/crl/src/fhir-emitter/tests/decision.test.ts`
- `packages/crl/src/fhir-emitter/tests/example-fhir-golden.test.ts`
- `packages/crl/src/fhir-emitter/tests/partial-split-author-vs-golden.test.ts`
- `packages/crl/src/fhir-emitter/tests/partial-split-fhir-golden.test.ts`
- `packages/crl/src/fhir-emitter/tests/structureDefinition.test.ts`
- `packages/crl/src/imports/tests/criterionEmitEndToEnd.test.ts`
- `packages/crl/src/imports/tests/definedAsExistsInferred.test.ts`
- `packages/crl/src/imports/tests/emit.test.ts`
- `packages/crl/src/imports/tests/publicationEmit.test.ts`

Verification: core4855 passed/32 existing skips; core MCP smoke and extension MCP32 passed; builds/typechecks passed. The4 new identity checks cover actual CQL/FHIR references, including long shared-prefix policies. Before/after complete Bleph9CQL/35FHIR and BMI9CQL/20FHIR outputs equal modulo the identity map. Native Bleph116/116 plus returned-QR4/4 pass on the unchanged shipped corrected engine; bounded BMI11/11 passes its documented original4.7 control engine. These do not resolve broader BMI full-response or opaque ValueSet source limitations. Consumer schema2.1/hash28bf5d87e4802bd3da9a6e4b5798414a805ccecd740ecede8c6b977553809336 remain unchanged. Review668 native0/0/2: packet completeness accepted, evidence provenance refined; external failed twice with internal error, so external coverage is incomplete. No new clinical or installed-release certification.

## Maintenance — explicit rule force (665/666)

Baseline: `18799337ec6b91e91a4b1577c0e31a7f1b575714`.
Implementation base: `6d3e06831ee3e75a666a08651cc9832e22f080da`.
Target: `5e105580a3390bedcbf7874ddb37e9f5f7d6279d` (reviewed content commit). Schema `2.1`; content hash
`28bf5d87e4802bd3da9a6e4b5798414a805ccecd740ecede8c6b977553809336`. This is a bounded correction
of the 16 rules with no clauses, not a new full semantic audit of existing clauses.
The baseline is an ancestor of the implementation base. All intervening changes
were inspected: root/core/extension package versions and lockfile versions only,
plus the prior audit stamp and ledger target. No dependency, implementation or
test behavior changed in that interval; existing tag sets are unchanged.

Intent: consumers must not invent force for missing metadata. Every rule now has
nonempty explicit clauses using the existing three forces. Grammar/validator
rejections, authoring defaults and manual fidelity/verification obligations remain
distinct. The new `native-outcome-verification` and `artifact-integrity` anchors
are manual obligations, not claims that resolving an anchor executes a test.
Drop-one remains a default method; equivalent evidence is allowed. The qualifier
summary now includes the already-supported nested-first otherwise exception.

| Corrected rule | Owning evidence inspected; bounded observation | Force disposition |
| --- | --- | --- |
| interface-concept-naming | `emit/tests/presentation.test.ts`: required/nonempty text, rejected label/short, missing-presentation warning, preserved identity and Bleph migration. `fhir-emitter/tests/presentationEmit.test.ts`: input text/description and identity. Existing presentation examples reused. | Naming default; authored syntax rejection; manual native question/population check. |
| decision-qualifiers | `validator/tests/decisionShape.test.ts`: qualifier-required, singleton, first/all/any, top-level otherwise-required and nested omission controls. `fhir-emitter/tests/membershipPublication.test.ts`: whole prior expression/null-preserving exclusion. | Syntax rejection; manual runtime precedence obligation. Structural emission alone does not prove pause. |
| guards | `validator/tests/decisionShape.test.ts`: unconditional single-action guard rejection. `cre/tests/publication.test.ts`: publication-boundary and unsupported contexts. `fhir-emitter/tests/selectedPublication.test.ts`: selected-publication action-guard emitter refusal. | Rejected action-guard context; manual faithful replacement/capability-gap decision. |
| guard-or-vs-sibling-or | Same CRE suite: unknown A/true B combined OR versus ordered siblings; failed-operand controls. Existing cases retained. | Source-fidelity and manual unknown/fan-out verification, not universal automatic enforcement. |
| configure-dispositions | `dispositions/tests/config.test.ts`: replacement and empty vocabulary. `validator/tests/dispositionValidation.test.ts`: configured membership/type, missing/empty config controls. | Configuration default; explicit config-gated diagnostics; manual membership/request-type obligations remain. |
| disposition-mode | Same validator suite: standalone pended refusal versus identical embedded acceptance. | Existing finality and closure-wide exclusivity invariants; validator is not claimed to prove every runtime path. |
| minimalism | Charter and `judgeLens.composition:hollowed-criteria`; existing transparent criterion/expression emission mapping. | Derivable-detail default; source-criterion fidelity remains manual. No automatic clinical-sameness classifier. |
| library-scoping | `ast/tests/library-and-include-structure.test.ts`: declaration syntax. `imports/tests/{registry,preparePublicationContext,criterionMultifile}.test.ts`: discovery, package visibility, local/package priority, aliases and criterion locality. | Syntax/visibility rejection; workflow defaults; manual emitted ownership check. No new package-native certification. |
| cel-identity | `cel/validator/tests/identityDiagnostics.test.ts`: repeated reference, Patient exemption, ambient Encounter, normalized collision, distinct resources and cross-case reuse. | Explicit collision error; manual full resource/diagnostic check. Warning does not imply whole-case rejection. |
| cel-quantity | `cel/validator/tests/numericValueRules.test.ts`: shared Quantity literal, missing/blank unit and CodeableConcept number diagnostics. Legacy integer controls are not current authoring examples. | Bounded literal rejection; manual producer/unit/native verification. |
| emit-output-root | `tests/emit-layout.test.ts`: default and alternate root layout. `tests/emit-writers.test.ts`: written manifest and stale CEL removal. | Default tool/root choice; manual complete artifact/path verification. |
| written-equals-executed | Charter and source judge, existing kit reference-emission and CRE cases. | Fidelity plus independent native verification obligation. These tests do not certify clinical meaning or all native behavior. |
| terminology-forms | `fhir-emitter/tests/valueSet.test.ts`: pure, instantiated, mixed identity/membership. `terminologyCodeDisplay.test.ts`: authored display presence. `validator/tests/namedAnswerOptions.test.ts`: finite-domain display rejection. | Role choice default; finite-answer display rejection; manual identity/membership verification including recorded canonical limitation. |
| verify-loop | Existing kit reference cases/emission and trace mappings; native acceptance remains independently version-bound. | Verification and path obligations; conditionTrace/drop-one as recommended methods with equivalent proof permitted. |
| emitted-trees-are-ours | `tests/emit-writers.test.ts`: preflight, stale removal, disk hashes. `results/tests/produceCleanup.test.ts`: prune, retain and removal failure. | Manual full-set/integrity obligation; no claim hashes certify completeness. |
| produce-results | `results/tests/runProducer.test.ts`: generated is not an outcome oracle, case states. `persistedPair.test.ts`: MV identity/authored normalization. Existing extension opt-in mapping retained. | Setup default; manual actual outcome/error check. No new installed-engine or rendered-client claim. |

Changed files: `index.ts` adds the16 clause sets and two concrete methodology
anchors, corrects implicit-force/otherwise/drop-one/configuration wording, and
bumps the kit content version. `types.ts` makes clauses a nonempty tuple.
`authoring-kit.test.ts` replaces skip-on-absence with completeness/anchor checks;
the `verify-loop:kit-force-coverage` tests mutate every rule to absent/empty clauses
and reject invalid force, text and anchors. These are metadata integrity tests,
not a duplicate language suite. `query.test.ts` checks the exact clauses and
resolved obligations in every focused entry. Existing full export tests compare
every JSON/Markdown leaf, including all new clauses. No CRL/CEL example changed.
This ledger and reverse-map wording carry the bounded audit scope.

The delivered extension README now names schema 2.1. The initial test survey and
test-inventory.json retain their historical revision, source hashes and run counts;
the survey now explicitly points to this ledger for later changes. They are not a
current-checkout census. The audit metadata commit must use the literal phrase
`schema 2.1` in its scope as well as the matching schema, hash and content revision.

Reviews 665/666: plan findings were dispositioned before implementation. Native
code review found 0 critical/important/nit. External code review found 2 critical,
6 important and 4 nit; 7 accepted, 2 refined, 3 rejected with reasons recorded in
666-dispositions.md. Concrete corrections cover guard rejection, presentation
scope, mandatory tool context, output placement and emitted-path identity. Shared
manual anchors remain methods, not assertions of automatic semantic coverage.
Native follow-up on the applied corrections converged with 0/0/0. No unrun
external follow-up convergence is claimed. Full final diff: review 666.

Both real MCP smoke suites (`src/cli/tests/run-mcp-server.test.mjs` and
`packages/crl-vscode/src/mcp-server.test.mjs`) pin the updated schema and hash.
Verification: 172 kit tests pass; 365 owning tests pass with one existing skip;
32 extension MCP tests pass; core MCP smoke passes. The extension build generated
fresh core output and passed core/extension typechecks. The final core MCP run was
sequential after that build: an earlier parallel attempt collided with the build
clearing dist and failed before exercising the server. No new native clinical
acceptance or installed-release verification is claimed by this metadata change.

Relevant test changes are these metadata/delivery assertions only. Existing
owning cases and shared examples remain unchanged; no semantic tags lost their
assertions. Added tags: `verify-loop:kit-force-coverage`; no removed tags. Source
fidelity and method obligations remain manual even after the metadata tests pass.

## Maintenance — Markdown MCP delivery (655/656)

Baseline: `451be38f1fc33723cfe44eec12c1add689c5c52b`.
This is the maintenance baseline (last audited revision). The implementation
review diff starts at released `6ef4357a80f99a0e91a4ddb1639faad791889bef`;
the intervening maintenance delta consists of the release/docs/stamp rows below.
Target: `18799337ec6b91e91a4b1577c0e31a7f1b575714` (reviewed implementation). The next metadata-only commit stamps this existing revision. Kit schema `2.0` and canonical
content hash `e9870c0042e7cb2e76a66d10b0edc72056786e0a53ccb73dc417544c8753c8b2`
remain unchanged: this adds transport access to the existing Markdown export.
All changed paths since the baseline were reviewed, including the intervening
5.1.0 release corrections. No compiler, emitter, CRE, driver or clinical example
changed in that interval.

| Changed paths / owning assertions | Disposition |
| --- | --- |
| Root/core/extension package.json and package-lock.json | Not author-facing semantics: lockstep release versions only; dependency graph unchanged. |
| audit.json and this ledger | Metadata-only prior stamp reviewed; new audit will bind the tested transport change to an existing commit. |
| Core/extension README and TOOLING.md since baseline | Existing guidance sufficient: installation, versioned links, tool counts and retirement/migration wording corrected. New Markdown call documented with raw-text format, full-only scope, no file-write promise and audit requirement. |
| docs/authoring-kit.md | Delivery guidance updated; JSON response identity distinguished from canonical Markdown metadata. The full document is available without checking out or building CRL. |
| query.ts, types.ts and export.ts | Kit updated at delivery layer: optional explicit JSON preserves existing views; Markdown requires full and reuses the canonical renderer. The file-export audit gate stays intact; development reads expose honest stale metadata. Overview provides executable export arguments. No new language claim or canonical content change. |
| query.test.ts | `@kit verify-loop:kit-markdown`: actual overview arguments retrieve text byte-equal to the existing Markdown renderer. Four JSON rows preserve overview/full/search/entry responses. Six invalid format/view rows fail. Stale-audit control preserves visible mismatch in both Markdown and JSON; the existing file-export tests still reject stale stamps. These are transport/evidence safeguards, not a second semantic suite. |
| mcp/server.ts, core CLI and extension MCP tests | `@kit verify-loop:kit-markdown`: real stdio calls follow overview arguments and assert raw text equals the canonical exporter; malformed format/full combinations return tool errors. Both entry points exercise the same production handler. Description/schema advertise format. |

Tag delta: three owning `verify-loop:kit-markdown` tags added; no tags removed.
The public query result adds a Markdown variant; explicit JSON deliberately does
not echo format so its existing response remains unchanged. The renderer has two
production callers: gated file export and ungated read-only query. It is not a
top-level npm export. The owning export test asserts renderer/export byte equality;
the query stale-flag control also asserts the file-delivery gate rejects it.
The claim belongs to the existing verify-loop delivery guidance and this explicit
transport documentation; all existing examples and semantic assertions remain
unchanged. Existing native-execution and clinical-fidelity limits are retained.
Plan655 and code656 ran native Astra/high and external Opus5 (high plan, low code).
Native code review:0 critical/0 important/0 nit. External code review:1 critical/
4 important/5 nit; lead accepted2, refined4, rejected4 with checked reasons.
The exact invalid-format MCP call passed; the reviewer had conflated candidate
and root files for version claims. The concrete export-equality and stale-gate
assertions were added and rerun. No unrun external convergence is claimed.
Verification:135 kit checks across4 files, core4814 passed/32 existing skips,
extension1184 passed/3 expected failures, both typechecks and full real core MCP
smoke passed. The extension suite includes the bundled raw-Markdown MCP check.
Measured before the metadata stamp:JSON190461 bytes, Markdown179106 bytes.
Final stamped file/MCP byte equality is a release gate; full is deliberately the
complete document, while search/entry remain the focused retrieval choices.

## Maintenance — unified retrieval and audited baseline (642/643)

Baseline: `345af5782c61188b11de87b788aecf0276421f1a` (CRL 5.0.0,
kit 1.38). Reviewed content target: `451be38f1fc33723cfe44eec12c1add689c5c52b` (C1).
Schema: `2.0`; content hash: `e9870c0042e7cb2e76a66d10b0edc72056786e0a53ccb73dc417544c8753c8b2`.
The subsequent metadata-only commit (C2, identified by Git history) stamps that existing target.
Observed Git checks: target resolves as a commit; baseline is its ancestor; the clean C1 checkout built this exact pinned hash.
C2 changes only audit.json and this ledger. Final file/compiled-MCP equality receipts accompany the generated kit; no installed upgrade is implied.

Baseline provenance: `git diff 1231273e 345af578 -- packages/crl/src/authoring-kit`
is empty. Thus the 639-audited kit content is byte-identical at the released
baseline. The historical unreleased sentence below describes the state when
639 was written; release640/641 subsequently shipped those exact two payloads.
The new unified payload is reviewed as a transformation of their complete union,
not asserted to be the same bytes. Its source schema is 2.0.

Current operator intent: one kit, no CPG/PA/use-case selector; navigable reference
material supporting a comprehensive and correct computable representation of
L1 narrative and/or L2 semi-structured source. Format is revisable. Named rules,
examples and artifacts remain canonical; all former PA guidance stays available
with intent-based applicability, even before configuration exists.

| Changed scope | Disposition and evidence |
|---|---|
| authoring-kit/index.ts, types.ts, navigation.ts, query.ts | Kit updated: one full payload; generated complete index; stable IDs and authored aliases; overview/search/entry/full. Query tests observe plain-language and retired-spelling discovery, counterexample labeling, exact prerequisite closure, invariant anchor resolution, no-match/error behavior and complete-vs-focused identity. No claim that search replaces reading the referenced entries. |
| requirements.ts; referenceArtifactsEmit.test.ts | Kit updated: companion/import IDs and project configuration travel with each artifact. Existing validation/FHIR emission gate now uses precisely that served context, including named terminology and disposition vocabulary. The determination examples now use standalone mode with their authored Approve/Deny final leaves, aligning the configuration with the teaching instead of embedded mode. Thirteen artifacts remain; CRE and FHIR proof limits remain separate. |
| authoring-kit.test.ts | Existing guidance sufficient for unchanged semantic behavior: preserved actual-input equality, CRE cases, source-shape admission, force/verification/coverage and retired-form checks. Removed only selector/filter/old per-use-case hash assertions; replaced by unified identity/discovery tests. Historical pin history remains in Git. No owning behavioral claim was removed. |
| query.test.ts | New author-facing discovery assertions: `@kit verify-loop:kit-discovery` maps plain-language and retired spellings to current guidance. Other declarations check internal delivery integrity, malformed requests, complete index and audit boundaries; these need no separate CRL language claim. |
| src/index.ts, mcp/server.ts, core CLI and extension MCP tests | Kit updated: public retrieval API; old selectors produce migration errors; real core/bundled MCP tests exercise overview/search/entry/full, 13 artifacts and actual validation. emit_results.useCase is unchanged runtime behavior. |
| audit.json | New metadata-only audit identity, excluded from content hash. Content equality does not prove repository audit currency; future implementation-only changes still require review. |
| export.ts, export.test.ts, scripts/export-authoring-kit.mjs | Delivery integrity: explicit JSON/Markdown export refuses stale schema/hash stamps and modified content. Both files derive from the same canonical object; actual tested sources and proof limits are retained. These assertions add no CRL semantic claims. |
| concept-form evidence/quantification explanation | Kit updated: makes the existing charter §2/§3 completeness boundary explicit; its unimplemented spelling stays a #320 limitation. Existing cre/tests/publication.test.ts selected-datum membership tests observe known member/nonmember, missing/unknown operands, and unsupported non-Boolean guards. These tests do not establish broad collection completeness or clinical fidelity. |
| publication.test.ts (unchanged owning assertions; two added tags) | Kit updated: `concept-form:selected-datum-membership` tags known yes/no parameter rows; `concept-form:missing-evidence` tags absent/present-unknown rows. Rerun these existing assertions; no new parallel semantic suite. Completeness design limitation is a manually reviewed operator/charter requirement, not a claimed implementation feature. |
| packages/crl/package.json and package-lock.json | Test tooling only: declare already-resolved markdown-it14.2.0 directly for rendered export regression; no runtime dependency or compiler behavior changes. |
| dispositions request-kind wording; cpgActivityProfiles.test.ts | Kit updated: replace misleading inference wording with mapping from the authored request profile to FHIR kind. Existing table test covers CPGServiceRequest/ServiceRequest and CPGCommunicationRequest/CommunicationRequest (plus other existing rows); added `dispositions:authored-request-kind` tag without changing assertions. |
| crl-release skill | Release verification updated: successful audited file export plus canonical equality/audit-match through both installed MCP entry points. Development retrieval remains available with explicit stale audit metadata; no release performed here. |
| canonical kit skill and Codex entry point | Kit maintenance updated: baseline/target Git delta, old/new tags and assertions, renamed/deleted/shared inputs, untagged cases and implementation/config changes without test deltas. The coverage ledger remains authoritative. No duplicate behavior suite or automatic audit advancement. |
| docs/authoring-kit.md and TOOLING.md | Kit updated: delivery/migration contract and L1/L2 purpose. Manual review against operator intent and Boxwala terminology; not an executable clinical-fidelity claim. |

No compiler, CQL/FHIR emitter, CRE or engine implementation changed. No new
clinical or native-execution claims. Existing scoped gaps remain explicit in the
kit. Review642 accepted/refined retrieval and audit safeguards. Code reviews643,
646 and647 have complete prompts, responses and dispositions in the workspace's
discussion records. Native647:0 critical/0 important/0 nit. External647:0 critical,
4 important,4 nit, explicitly no blocking fault; lead accepted3/refined4/rejected1,
verified the concrete corrections and recorded the review iteration bound.
No unrun final panel convergence is claimed.

Final source verification: **234 passed across6 files** (kit, existing publication
and request-kind owners), **31 bundled MCP checks passed**, complete core MCP smoke
passed, full core/extension builds and both typechecks passed. Skill frontmatter
validation passed. Three new owning @kit tags label existing assertions without
changing their behavior. The stale-audit export was observed to fail before any
output was created; rendered placeholder loss has a known-bad control and passing
correction. Metadata stamping and final export/MCP equality are the next step;
new source is not released or installed merely by updating this ledger.

## Initial broader audit — 624–639

Source review and the grouped reverse mapping are complete, with explicit evidence limits. All300 originally discovered test files were read, including parameterized rows/helpers;639 adds a producer cleanup suite (301 total). See [reverse-claim-map.md](reverse-claim-map.md) for every substantive payload claim group and [survey-dispositions.md](survey-dispositions.md) for applicable, internal and legacy cases. The machine inventory records source hashes and execution separately.

Source kit1.38 remains unreleased; installed4.123.0/kit1.37 is unchanged. This audit does not recertify native engines, installed clients, rendered questionnaires or clinical fidelity. Those limits are mapped explicitly rather than counted as passing source tests.

The inventory links118 primary test declarations to stable `@kit` claims, plus
four extension-owned assertions. Final639 added40 reviewed declaration tags
across21 files; a byte comparison verified those edits only insert comments.
Parameterized declarations retain their existing rows and evidence limits.
Examples reuse the owning inputs described below; tags do not create a second
behavior suite or turn internal/legacy cases into recommended authoring.

### Final corrections — 639

- Empty disposition options produce a warning and disable disposition checks; corrected rule, all invariant clauses, methodology and model. Owning config/validator tests retain actual input `{ options: {} }` and are tagged.
- Producer cleanup tests cover complete generated-directory replacement, rejection of `prune:false`, and visible removal failure. Custom files inside generated output are replaced; authored siblings remain outside the output boundary.
- Linked TOOLING/USER_GUIDE now describe reproducible dates, shared catalog versions and supported prepared imports accurately. MCP date/capability inputs remain supported; explicit date has precedence.
- Extension-owned opt-in and MV flag gate assertions are linked/tagged separately from the CRL census; source assertion inspection does not claim an installed-client run.

Review638:0 critical,1 important,0 nit; accepted. Review639 first round:0 critical,2 important,0 nit; both accepted and corrected. Final verification and follow-up review recorded below. Native GPT-6 Astra/high, crl-emit-v0.1.0; external unavailable after two624 failures.

Final639 verification: **244 passed,0 failed,0 skipped across10 files**; TypeScript and complete MCP smoke passed in isolation. Native follow-up review found0 critical/important/nit and closed both findings. CPG contentHash remains `ed833359fba7a0efb09af8ddd291c404b5401424bba03873913c8ceb3141e5c9`; PA contentHash is `cb36c1692d48a3300e1aa778c10e1f10892a88ea22ac16da074a647e73e78f6d`. These are payload content hashes, not serialized-file SHA256.

### CQL, FHIR, CRE and reference corrections — 637

Reviews631/633/635/636 accepted25 findings (0 critical,19 important,6 nit).
Code review637 found0 critical,0 important,1 nit; both path-description corrections
were applied. Native GPT-6 Astra/high used crl-emit-v0.1.0; external arm unavailable.

| Claim / consumer | Owning evidence and actual observation | Limit |
|---|---|---|
| MCP emission success / parameters | terminologyIdentifierCollision and emitCQL-parameters CQL suites: non-narrative failure and authored parameter declarations | success is required; returned text is inspectable, not certified |
| MCP FHIR dates / identities / imports | reproDate, closureOrchestrator, membershipPublication, namedAnswerClosure FHIR suites | missing publishable date errors; catalog versions differ; prepared imported bindings resolve. JSON/CQL text, not native |
| dispositions rationale | activity.test.ts and reviewed activity emitter: own because description or name | no automatic concept-meta rationale propagation |
| publication-selection:local-source-tie-preference | validator/publication.test.ts explicit Height local+finite Observation source | new control failed before warning-predicate fix; now no errors/warnings. Selector behavior remains owned by publicationSelection tests |
| value-type repair guidance | lowerLocalCodes, reductionShape and useSiteType owning suites | retain typed refusal without prescribing existence/Scalar migration. Legacy positive shapes remain internal |
| CRE projection / foreign delegation | cre/publication.test.ts off-path failed publication omitted; foreign delegation refused | no authoritative conceptTruth row does not establish pause. Existing supported local delegation/imported operands remain distinct |
| decision-composition:arbitration | shared reference CRL/CEL, eight exact CRE output arrays | new X=false,Y=true,severe=false case denies; deleting severe conjunct fails owning test (637-arbitration-mutation). No native run |
| reference project context | referenceArtifactsEmit: real project validation for every artifact, appropriate PA config including EIU, actual dependency closure | declaration admission/emission distinct from native and clinical fidelity |
| emitted tree failure / output layout | MCP smoke checks no output root on parse failure; CLI paths include src | path equivalence, not byte identity or transactional writes |
| legacy collector order | collectCaseFeatures local/foreign same-name branches in both orders | legacy collector regression, not current imported publication semantics |
| review flags / disposition mode / chaining | existing flag/config/disposition checks and reviewed source | category is not authorization; standalone finality not bypassed by config; shared determination reuse valid, foreign publication delegation limited |

Final latest-per-file validation: **603 passed,0 failed,0 skipped in31 files**.
TypeScript and complete MCP smoke passed. Per-file reports/tested-source hashes
are preserved in637-execution.json and the inventory. Source kit1.38 is unreleased.
Both assembled payloads were reviewed. The subsequent638 reverse map and639 corrections complete the initial grouped survey; release/native gates remain separate.

### Grammar and provenance corrections — 632

Current intent: teach admitted syntax and preserve faithful narrative attribution.
Parser recovery and zero coverage/error counts cannot supply that evidence alone.

| Tag / consumer | Owning evidence | Observation and limit |
|---|---|---|
| `source-representation:field-order` | `ast/tests/concept-body-order-independence.test.ts`; shared `sourceOrderExample.ts` | Complete selected Patient-age declaration prepares without diagnostics; reordered source fields preserve the AST; dedented projection remains in the source; concept-only trailing lines fail. Kit embeds the exact declaration. No native execution claim |
| `library-scoping:declaration-syntax` | `ast/tests/library-and-include-structure.test.ts` | Required library, rejected library/include version clauses; include negative has a valid required library so the rejection is specific. Existing ordering cases own header/include structure |
| Positive syntax evidence | `ast/tests/parseInput.ts` and builder positive-fixture tests | Rejects lexer/parser diagnostics before building. Two malformed inputs prove the helper catches recovery.27 previously recovered fixtures repaired; this does not validate their legacy semantics |
| `provenance-source:excluded-text` | `provenance/tests/canonicalize.test.ts`, footnote criterion input | Successful canonicalization excludes footnote text and reports excluded-part-text. Source completeness requires reviewing that warning; source-fidelity adjudication remains manual |
| `provenance-source:coverage-is-not-fidelity` | `provenance/tests/generate-loop.test.ts`, intentionally incorrect20-byte source span plus ignored denial | Coverage clears but item-text-drift error and waiver-ignored-span review remain, including after merge. This is an explicit counterexample, not a positive attribution recipe |
| Correspondence eligibility / verification note and MCP | `provenance/tests/correspondenceCheck.test.ts`, `generate-disposition-path.test.ts`; reviewed production branches | Frozen identity and grounded produced paths required. Pauses/no-produced-action and unfrozen cases remain unchecked; full gate can fail. Existing legacy fixtures establish provenance mechanics, not clinical or native correctness |
| Waiver priority / worklist severity / judge and MCP | `provenance/tests/validators.test.ts`; reviewed authoredKind classifier and MN-keyword severity branches | Routine labels are hints; manual-review/warning do not fail the error count but retain review obligations. Truth of the waiver label is manual evidence |
| Derived-from enforcement / verification note | `provenance/tests/derivedFromResolution.test.ts`, `derivedFromPolicy.ts` | Enforced state is true; transition-window teaching removed. Source integrity is distinct from source fidelity |

Read-only reviews629/630 accepted all12 findings. Corrected44-distinct-file run had
916pass/3fail/9skip; stale ValueSet expectation and two payload-pin failures were
fixed, then112pass/0fail/5skip in affected builder/library/kit follow-up. TypeScript
build and complete MCP smoke passed. Final latest-per-file results: 44 files, 921 passed, 0 failed, 9 skipped;
source hashes and individual reports are recorded in632-execution.json; no installed or native-engine result is claimed. Broader
mapping and remaining test survey are still prerequisites to release.

### CEL and library scope corrections — 628

Intent: current selected answers retain unknown; resource identity is distinct
from answer value. Logical declaration scope must be explicit to an AI author.
Plan review627 and CEL audit626 accepted these corrections; code review628 tracks
final verification. Source kit1.38 remains unreleased.

| Tag / consumer | Exact owning evidence and input | Observation and limits |
|---|---|---|
| `cel-cases:nonmember-warning` | CEL `localMembershipWarning.test.ts`, warning-not-error case, membership CEL fixture | Well-formed wrong local codes warn and remain authorable; diagnostic explicitly avoids false-answer teaching. The legacy fixture's outcome expectations are not asserted here |
| `cel-cases:authored-nonmember-preserved`, `:malformed-code-rejected` | CEL `derive-local.test.ts`, authored-code mutation and empty-code mutation of DME input | Authored valid coding appears in emitted data; malformed token produces error and no matching resource. These are coding/diagnostic assertions, not native outcomes |
| `cel-identity:repeated-reference`, `:patient-exception`, `:ambient-encounter`, `:normalized-collision`, `:cross-case-reuse`, `:distinct-instances` | CEL `identityDiagnostics.test.ts`; `graphFrom`/`fact` and exact named cases | Changed date/intent does not create new identity; repeated Patient refs emit one Patient; Encounter/normalized collisions diagnosed; reused fact in two cases has different ids; two separately named instances produce two ServiceRequests. Other identity diagnostic helpers do not prove whole clinical validity |
| `cel-quantity:unit-required`, `:unit-bearing-literal`, `:nonempty-unit` | CEL `numericValueRules.test.ts`; shared `quantityExample.ts` declaration/fact plus owning context | Missing/blank unit errors;90 'kg' avoids numeric-shape errors. Kit embeds exact declaration and fact excerpt; policy adds library L. Existing kit gate validates the declaration. Integer/coded legacy companion declarations are not delivered examples. This is not UCUM validation, dimensional compatibility, full CEL validation or native BMI evidence |
| `library-scoping:package-discovery`, `:project-boundary` | `imports/tests/registry.test.ts`; four new manifest/location rows and existing nested-package row | Top-level plain/scoped `crl.libraries` packages discovered; missing manifest and nested node_modules not discovered; nested package excluded from parent project. Registry evidence, not execution |
| `library-scoping:explicit-package-priority`, `:implicit-local-priority`, `:package-visibility`, `:aliases-unsupported`, `:package-owner-isolation` | `imports/tests/preparePublicationContext.test.ts`; matching named cases and generated package/local fixtures | Asserts actual owner/origin or unresolved/visibility diagnostics. Same-name package/local shadows are boundaries to avoid, not recommended architecture. No native execution |
| `library-scoping:criterion-local` | `imports/tests/criterionMultifile.test.ts`, qualified criterion misuse fixture | Known foreign local criterion yields criterion-misuse; does not require an external-package include. Concept/criterion name collisions have both ordering rows in the same file |
| `cel-cases` omission boundary / MCP `run_decision` | Existing `cre/tests/publication.test.ts`, determinate disjunction versus ordered unknown branch | OR true/unknown can approve; earlier unknown ordered branch pauses. Already mapped under guard-or-vs-sibling-or. No duplicate kit truth-table suite added |

Library-scope example reuses the existing exact `answerExample.ts` library/terms
closure with the imported-answer owning test; it does not purport to demonstrate
package installation. Package boundaries are diagnostics guidance backed by the
owning generated fixtures. Native outcomes, human policy fidelity and deployed
client behavior are outside this batch's evidence.

MCP partial-emission description is supported by inspection of `emitFhir.ts`:
failed derive returns no resource while the caller continues collecting other
resources. The identity suite tests skipped-reference diagnostic handling, not
every possible partial-emission cause. This is source-reviewed behavior with a
remaining exact owning-assertion gap; do not label it native or fully verified.

Baseline 60e0cd0c; source kit 1.38 remains unreleased. The initial discovery now
includes **300 tracked test files**, including CLI and native checker tests.
[test-survey.md](test-survey.md) and [test-inventory.json](test-inventory.json)
record discovered declarations, source hashes, runner membership and unreviewed
areas. This is discovery, not a completed semantic census. Parameter tables,
helper assertions and documented native entry points still need explicit review.
Inspection and execution are separate: a native test skipped for a missing jar
does not gain runtime evidence from its passing registration sibling.

### First corrected claims

Current intent: independent final selection after producer-owned operations,
preserve selected false/unknown, explicit equal-time policy, and classify a
selected coded answer. Basis: north star assembly model, operator's pattern-owned
behavior clarification, and the #320 selection/membership contracts tested below.

| Tag / kit consumer | Actual input and owning assertion | Evidence and limits |
|---|---|---|
| `concept-form:publication-admission` / typeAllowlist | `emit/tests/publicationProgram.test.ts`: “refuses unsupported %s”; Scalar, Condition, string, empty producer and legacy selector mutations of explicit Answer | No descriptor, one error, lookup fails. Grammar vocabulary is not an execution allowlist. This kit's selected concepts recommend Observation; Patient/ServiceRequest are source types. Other supported Quantity/coded/age forms retain their separate evidence |
| `publication-selection:syntax` | `ast/tests/shape-reduction.test.ts`: plain selector and authored prefer-local tests; exact `line`/body strings | AST has equalTime `error` or authored `preferLocal`; syntax only |
| `publication-selection:newest-value` | `cre/tests/publication.test.ts`: “newer false wins independent of order”; both reference orders | Selects New and produces Deny. `selectionExample.ts` holds the actual policy, decision, fact and CEL builders. The delivered CRL/CEL pair is exactly the non-reversed test input; the generic kit gate also executes it. CRE, not native `$apply` |
| `publication-selection:newest-unknown` | Same file: “newer unknown displaces old true”; dated Old/New facts | No activity, blockedUnknown true, selected fact New, emitted newer Observation lacks valueBoolean. The test deliberately supplies Deny as an unmet oracle; that oracle is not taught as the expected outcome |
| `publication-selection:single-undated` | `emit/tests/publicationSelection.test.ts`: “selects one undated %s record”; false and unknown resources | Exact resource retained for both rows; pure selector evidence |
| `publication-selection:equal-time-error` | Same file: “does not merge equal-time records…”; agreeing/disagreeing values and every order | `publication-ambiguous-selection`, not a value merge |
| `publication-selection:local-tie-only` | Same file: authored local preference, older-local/newer-source, and multiple maximal locals tests | Unique local wins at equal latest time; newer source wins over older local; two latest locals still fail. Each helper checks permutations |
| `publication-selection:incomparable-validity` | Same file: “does not treat %s versus %s as an equal-time tie”; calendar overlap plus unsupported comparison rows | Fails as incomparable, not a tie. These unit rows do not establish arbitrary precision support |
| `publication-selection:undated-competition` | Same file: three undated competition/repair tests | Additional dated answer cannot repair undated competition; correcting actual validity can |
| `publication-selection:invalid-input` | Same file: malformed validity table and repeated contributor/input identity table | Invalid input fails even when another row is newer; duplicate identity is scoped to a contributor. Same input in different contributors remains distinct (separate existing tests), not blanket deduplication |
| `named-answer-options:domain-coding` | `emit/tests/publicationMembership.test.ts`: “ignores foreign/display/version codings…”; both coding orders | Recognized yes plus foreign no remains true; adding recognized no errors; no domain coding errors. Display/version do not decide membership |
| `named-answer-options:selected-record-only` | Same file: “does not interpret an older losing value”; older unrecognized and newer yes | Selects newer yes, then produces true. Does not excuse malformed carrier/identity/validity |
| `produce-results:generated-is-not-an-outcome-oracle`, `:case-states` | `results/tests/runProducer.test.ts`: synthetic clean Questionnaire and each non-generated state | `generated` classifies returned form presence; no activity assertion. Non-generated cases carry reasons. Synthetic classification does not prove native behavior |
| `produce-results:mv-pair-normalization` | `results/tests/persistedPair.test.ts`: “drops QuestionnaireResponse.authored…” | Written MV pair lacks run-authored time; do not treat it as a complete interactive request. No client interaction is executed by this unit test |
| `review-flags:phase-vocabulary`, `:required-direction`, `:optional-issue-reference` | `flags/tests/flagVocab.test.ts`: complete tag/category table, missing direction failure, all eight optional-ref rows | Four extraction tags and four validation types; fidelity-defect requires direction, issue ref is optional. Phase is distinct from actor identity per flagVocab's workflow contract. Preservation and authority to judge customer intent are manual workflow requirements, not conclusions from these tests |
| `review-flags:gap-pointer-required-reference` | `validator/tests/metaTag.test.ts`: missing `@gap-filed` ref errors | Filtered metadata diagnostic only; legacy fixture is not a positive selected-concept example. The delivered Renal Function gap-pointer snippet is validated by the existing kit example gate |

Removed four duplicated flag/metadata behavior checks from the kit suite. Negative
direction and gap-reference assertions already belong to the flag and metadata
validator suites. The optional-ref check moved to the flag suite and now validates
all eight types both with and without ref rather than merely inspecting five registry entries. Positive
gap-pointer authoring remains covered by the delivered-example validation gate.

Validation of this slice: isolated released emitter plus audit changes; TypeScript
build and 495 tests across 24 files passed, plus the complete MCP smoke. Review625
found and closed two gaps: share the concrete selection case as well as its builders,
and test optional references both present and absent. The affected209 tests across4
files passed afterward; delivered kit hashes were unchanged by those fixes. Exact
per-case outputs: tmp/625-vitest.json and tmp/625-followup-vitest.json; MCP log:
tmp/625-mcp.log. Native review converged; external review was unavailable after
two internal errors. No fresh native execution is claimed. The
optional native selector test requires CRL_PUBLICATION_CQL_ENGINE_JAR and its
matching driver configuration; it was not included in this command. The results
orphan symlink test can return early when the OS refuses symlink creation, so its
passing status alone is not proof that symlink rejection executed.

Further inspected areas have candidate mappings, not completed coverage:
ServiceRequest and Quantity source bounds; import visibility; all results tests;
flag workflow vocabulary; native checker false-positive defenses. The remaining
survey must cover both complete payloads and all applicable tests before release.

## Earlier correction evidence

Initial adoption of `crl-kit-update`, 2026-09-08. Diff baseline: CRL v4.123.0,
`8f62a14a99aa3823fc3c54fb47a2d5fa4009604c`. Current audit covers the kit correction
and shared answer example in this change. **The complete CRL test census is not
finished.** Inventory command `rg --files packages/crl -g '*test.ts' -g '*spec.ts'
-g '!node_modules' -g '!dist'` found 294 TypeScript test files. CLI .mjs tests and native acceptance harnesses
are additional inventory work; this is a file count, not a count
of reviewed cases or assertions. Untagged tests remain unreviewed, not excluded.

Intent basis: operator instructions for named ValueSet answer bindings, optional
negative exceptions with warning, presentation separate from concept identity,
null-preserving decisions and native `$apply` as execution authority;
`docs/named-answer-valuesets-and-presentation.md`, `docs/CRL-NORTH-STAR.md`.
Existing tests are measured evidence and are subject to correction.

Paths below are relative to `packages/crl/src`. Each `@kit` tag points to the
owning behavioral test, not a duplicate kit implementation.

| Claim | Owning test and actual input | Asserted observation / limit | Kit consumers | Status |
|---|---|---|---|---|
| `named-answer-options:finite-domain` | `validator/tests/namedAnswerOptions.test.ts`, “accepts a finite named answer domain without per-code positive markers”; `question()` | No answer-options diagnostics for the finite list and negative exception. This test filters to that diagnostic family; it does not establish complete validation or execution. | named-answer-options; pa-answers-not-records | Verified bounded assertion |
| `named-answer-options:all-qualifying-warning` | Same file, “warns without failing when no negatives are declared, even without a consumer”; `question("")` | No answer-options error; `answer-options-all-qualifying` warning. | named-answer-options | Verified bounded assertion |
| `named-answer-options:retired-syntax` | Same file, “removes inline answer lists and the former named spelling”; mutations of `question()` | Both removed spellings fail building. Invalid inputs are rejection examples, never positive teaching. | named-answer-options; pa-answers-not-records | Verified bounded assertion |
| `named-answer-options:imported-classification` | `fhir-emitter/tests/namedAnswerClosure.test.ts`, “uses an imported answer vocabulary in CQL, FHIR, CEL and CRE (publication=%s)”; `authoring-kit/answerExample.ts`, `source(true)` and legacy mutation | CQL emits with classification refusal, FHIR has the offered systems and owned code, CEL resolves positive/negative codings, CRE produces Met/Unmet/pause. Only the `true` row supplies current teaching; the legacy row is not a recommended publication form. No native `$apply` execution in this test. | named-answer-options; named-answer-reference CRL/CEL and terminology dependency | Verified bounded assertion |
| `concept-presentation:emitted-text` | Same owning test/input; presentation in `answerExampleSource()` | Decision input contains authored text and description extensions. Does not prove native display of description. | concept-presentation; named-answer reference | Verified bounded assertion |
| `concept-presentation:overlap` | `emit/tests/presentation.test.ts`, “rejects overlapping decision and criterion contexts even inside one declaration”; `head + base + scoped declaration` | `presentation-overlap` diagnostic, including one declaration whose selectors overlap. This row does not certify co-occurring fallback-wording comparison; that claim also relies on the linked presentation design and emitter source inspection. | concept-presentation | Verified bounded assertion |
| `branch-guards:whole-publication-expression` | `fhir-emitter/tests/membershipPublication.test.ts`, “preserves a whole publication condition and its inputs: %s”; three guard rows and their fixture/config | One `text/cql-identifier` condition bound to a named CQL definition with no Coalesce, two dependency inputs; tests direct publication and traversal through a criterion. FHIR structure only; does not prove native pause. | branch-guards; criterion; decision-composition; docs/decision-shapes.md | Verified bounded assertion |
| `branch-guards:priority-exclusion` | Same file, “preserves the same compound failure boundary in first priority exclusions”; selected Photo/Answer fixture | Successor exclusion is `not (<whole prior expression>)`. FHIR structure, not native execution. | branch-guards; docs/decision-shapes.md | Verified bounded assertion |
| `guard-or-vs-sibling-or:unknown-order` | `cre/tests/publication.test.ts`, “distinguishes a determinate disjunction from an earlier unknown ordered branch”; Answer missing, Other true | Combined OR produces Approve; ordered sibling guards produce no activity and mark the first branch blockedUnknown. CRE evidence, not a native run. | guard-or-vs-sibling-or; docs/decision-shapes.md | Verified bounded assertion |
| `guards:publication-boundary` | `cre/tests/publication.test.ts`, “makes the same-library publication activation boundary explicit (publication=%s)”; legacy + optional unused publication | Missing legacy action guard yields error/no activities with a publication, but legacy no-publication case yields Deny. This is a limitation, not desired semantics or a pattern to copy. | guards; docs/decision-shapes.md | Verified bounded assertion |
| `cel-cases:missing-local-membership` | `cre/tests/localMembership.test.ts`, “an AUTHORED-code local fact with no derivable base fails the run LOUD…” and “a BARE local fact in a real project with no base ALSO fails loud…”; existing fixtures/helpers | Both fail loudly; no name-based fallback for these local-code inputs. Does not claim every non-local form checks membership. | cel-cases; verifyLoop; MCP descriptions; north star | Verified bounded assertion |
| `branch-guards:publication-error-boundary` | `cre/tests/publication.test.ts`, “keeps a true OR sibling from masking an evaluated operand failure” and “does not cross a failed first: prerequisite to a later true activity or otherwise”; existing ambiguous-selection inputs | An evaluated error is not hidden by a true alternative or later branch; distinct from an unknown pause. CRE evidence only. | branch-guards | Verified bounded assertion |

## Example synchronization

`answerExample.ts` contains pure CRL/CEL fixture data and the source builder;
the owning behavior test and kit assembly import it directly. The delivered
example is exactly the publication=true input, its imported terminology and
its CEL including a missing-answer pause. `ANSWER_EXAMPLE_BASE` is required project context. Editing the shared
input changes what the behavior test executes; no second copy is maintained.
The kit/reference packaging suite separately verifies the delivered closure.

The mixed mammography/representation preview is withdrawn from the kit. Its old
fixture remains a legacy validator regression, not a recommended example. The
supported BMI/threshold and uncoded-age declarations now live in the shared
`PUBLICATION_REFERENCE_CRL` constant, with synthetic decisions keeping those
dependencies in the emitted closure. The kit's emission gate executes that exact
source; it does not claim whole-artifact native execution. Missing presentations
remain legal warning/fallback examples, not proof of authored question wording.

## Scalar teaching correction (review 622)

Scope: both payloads, all positive CRL examples/reference artifacts, affected
normative/judge text, and active charter wording. Compiler Scalar/default paths
remain #320 retirement debt. RecordSet history, arbitrary composition/collection
operations and publication action-menu guards are not replaced by this kit edit.

| Tag | Shared input / owning assertion | Bounded claim |
| --- | --- | --- |
| `concept-form:local-answer-pause` | `PA_DETERMINATION_REFERENCE_CRL/CEL`; kit CRE test asserts all three cases pass | Explicit true approves, false denies, missing predicts pause |
| `chaining-necessity:local-delegation-pause` | `SOURCE_DELEGATED_DECISION_REFERENCE_CRL/CEL`; five CRE cases plus delegated-Deny trace assertions | Bare same-library delegation preserves its path and unknown-input pause prediction; no foreign-delegation claim |
| `decision-composition:arbitration` | `DISPOSITION_ARBITRATION_REFERENCE_CRL/CEL`; eight cases with exact outputs for every case | Explicit negatives in both overlap cases, false-dominant conjunction with other inputs absent, and wholly missing input; CRE only |
| `bmi-publication:kit-finite-source-and-missing` | `cql-emitter/tests/bmiRetirement.test.ts`; extracts actual terms/BMI concepts from `PUBLICATION_REFERENCE_CRL` | CQL/FHIR emission and three CRE outcomes: high BMI approves, a newer lower weight denies, missing height pauses. Existing subsection hash is unchanged; historical native evidence is not a fresh run. |

All source constants are consumed directly by the delivered kit and the owning
tests. The admission gate is a packaging check using `publicationAdmissionReason`;
it rejects omitted shape, explicit Scalar and a Record marker without reduction.
It does not substitute for running the examples. Every remaining CRL reference
must validate and emit without an exemption. Withdrawn delivery tests and reasons
are recorded in discussion 622; compiler regression tests were not deleted.

The revised inputs pass all 81 kit checks and the complete MCP smoke in the isolated checkout. The three migrated companions pass 15 cases, and every remaining CRL artifact emits. After the exact-output assertion fix, all 55 checks in the affected kit suite pass; the 22 BMI retirement checks also pass with the renamed shared reference and unchanged native-evidence hash. Discussion 623 records commands and source hashes. Prior 621 counts below describe the earlier revision only.

## Manual evidence and remaining work

- Genuine shared determination versus independent lookalikes: manual source and
  ownership adjudication. `chaining-necessity` and its judge must agree; no test
  can establish that two customers mean the same clinical rule.
- Initial channel survey found and corrected stale selected-shape/source scope,
  PA inline answers, action-guard assumptions, compound-emission generalizations,
  CRE fallback wording and completion-versus-pause language. Both assembled use
  cases and the MCP description copies are in scope.
- Historical621 census work is completed by the301-file inventory and reverse map above. Manual clinical/source fidelity and explicitly listed native/installed gaps remain obligations; this is not comprehensive runtime certification.
- A wording/hash/synchronization test is packaging evidence, not behavioral
  evidence. Historical engine stamps are not fresh native execution.

Verification: isolated checkout of the diff baseline plus this kit patch, with
`fhir-emitter/decision.ts` unchanged (Git blob
`60eef8f6801ad438a407dbbed63a7c45cdb410f5`). Core build passed; 360 tests in
10 targeted files passed; the complete `run-mcp-server.test.mjs` smoke passed.
The targeted files are the kit suites and the owning suites listed above, plus
`fhir-emitter/tests/decision.test.ts` and `selectedPublication.test.ts`.
Initial main-checkout results included unrelated paused599 emitter work and are
not used for these verified labels. No fresh native engine run is claimed.
After the final verification-legend correction, the 109 affected kit/example
checks and MCP smoke passed again. Commands and logs are recorded in discussion 621. Refresh this ledger's evidence when a mapped assertion, input,
configuration or intended behavior changes; do not retain a verified label on
an invalidated mapping. Source kit 1.38 is unreleased until the release gates run.
