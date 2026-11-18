# Quantity thresholds code review

parent_discussion_id:1507. Baseline develop7c7a83cc0c79bf32d729d2752b798d048e5a0699. Read docs/CRL-NORTH-STAR.md in full. Target: operator requested same-unit %/ms numeric Quantity thresholds; screenshot55%orless motivates exact inclusive AtMost. No new conversions, engine/driver/catalogue, clinical model, existing selection/validity/unknown contracts. Active#320 taxonomy applies: code is implementation measured against intent, grounded markers are evidence labels not correctness oracles. Before rules are mechanically preserved in scratch; exact baseline changes shown below, no need read giant scratch snapshots.

Plan findings addressed: REQUIRED at-least|at-most discriminator; CQL unit factor/group arms generated from same unit table as TS, factor integers>=1; bare milliseconds/seconds refuse; ratio1/unitless numeric errors retained; both CQL helpers emitted unconditionally in existing threshold/BMI gate (byte changes acknowledged). No customer golden/provenance regeneration.

Validation: owning4files85pass, expanded9files351pass/2kit-metadataguardfail then corrected; finalkit4files240pass. Existing owning core/extension build+typechecks pass; real %upper/mslower sessions + prior BMI control currently RUNNING, not yet proof. Kit schema2.49/hash18f80b97..., audit intentionally not advanced until reviewed content commit. Source update not released support. Canonical ledger has complete bounded baseline audit delta04657bd7?current and test mappings; no need read old historical ledger sections.

Full changed production/test/doc file list:
- docs/CRL-NORTH-STAR.md
- docs/typed-intake-answers.md
- packages/crl-vscode/src/mcp-server.test.mjs
- packages/crl-vscode/src/questionUnit.native.test.mjs
- packages/crl/src/authoring-kit/index.ts
- packages/crl/src/authoring-kit/navigation.ts
- packages/crl/src/authoring-kit/tests/authoring-kit.test.ts
- packages/crl/src/authoring-kit/tests/coverage.md
- packages/crl/src/authoring-kit/tests/query.test.ts
- packages/crl/src/cli/tests/run-mcp-server.test.mjs
- packages/crl/src/cql-emitter/emitCQL.ts
- packages/crl/src/cql-emitter/renderPublicationQuantity.ts
- packages/crl/src/cre/tests/publicationQuantity.test.ts
- packages/crl/src/emit/publicationProducer.ts
- packages/crl/src/emit/publicationProgram.ts
- packages/crl/src/emit/publicationQuantity.ts
- packages/crl/src/emit/tests/publicationQuantity.test.ts
- packages/crl/src/emit/tests/questionUnit.test.ts
- packages/crl/src/authoring-kit/quantityThresholdExample.ts
- packages/crl/src/authoring-kit/tests/maintenance-quantity-thresholds-paths.txt

Unrelated pre-existing untracked paths preserved/excluded: examples/bleph-medical-validation/.vscode/, examples/bleph-medical-validation/src/medical-validation/bleph-medical-validation.json, packages/crl/scripts/upload-fhir.ps1, patches/cqframework/upstream-main-20261107/. Local plan/code discussions and scratch receipts are not product code.

## Exact diff against stated baseline

```diff
diff --git a/docs/CRL-NORTH-STAR.md b/docs/CRL-NORTH-STAR.md
index 8880d7600..f7800225b 100644
--- a/docs/CRL-NORTH-STAR.md
+++ b/docs/CRL-NORTH-STAR.md
@@ -167,15 +167,18 @@ for the request/clear contract and native FHIR parser boundary. Quantity presenc
 Quantity measurements can use explicit Record/Observation publication with `shape reduction is most recent`.
 An Observation source preserves its Quantity and effectiveDateTime while projecting the analytical identity.
 A local code adds an answer representation; an uncoded source calculation does not invent a question.
-The unary `definition is "Measurement" at least N 'unit'` producer publishes a Boolean Observation and
+The unary `definition is "Measurement" at least N 'unit'` or `at most N 'unit'` producer publishes a Boolean Observation and
 inherits the selected operand's actual optional validity. No operand produces no candidate; a selected
 operand with no numeric value produces an unknown-valued candidate. Final selection remains separate.
 Quantity code determines unit identity when present; display unit does not override it. The existing CEL
 unit-only representation is supported. Supplied systems must be UCUM with a code; comparator quantities
-are not exact measurements. This comparison currently supports m/cm, kg/g and kg/m2, magnitude at most
+are not exact measurements. Inclusive comparisons currently support m/cm, kg/g, kg/m2, same-unit % and same-unit ms, magnitude at most
 10^6 and at most eight decimal places, with exact decimal unit-factor comparison. This is a bounded
 implementation domain, not a clinical range. It does not recover unsupported lexical precision already
-lost in a caller's numeric parsing.
+lost in a caller's numeric parsing. Use quoted UCUM codes, for example `55 '%'` and `120 'ms'`.
+There is no ratio `1` to percent scaling or seconds to milliseconds conversion. A selected ratio,
+unitless numeric value, incompatible unit or unsupported spelled-out time unit errors rather than
+silently becoming false or unknown. Integer unit factors preserve the eight-place native decimal domain.
 
 BMI production uses `definition is body mass index of "Weight" and "Height" using validity of "Weight"`.
 Both operands must be selected Quantity publications; the validity operand must name one of them.
diff --git a/docs/typed-intake-answers.md b/docs/typed-intake-answers.md
index 84a168d4e..46d20e5a5 100644
--- a/docs/typed-intake-answers.md
+++ b/docs/typed-intake-answers.md
@@ -108,4 +108,4 @@ Use a selected Record/Observation with value type is Quantity, its local code is
 
 For optional evidence, use one compound presence guard and the same review activity in otherwise, as in numeric-intake-reference.crl and its paired CEL. For source-required completion, a single unqualified when branch may recommend the result only when all required presence predicates are true. With blank numeric fields it recommends no activity; the predicate is false, which is distinct from a null-condition pause. Do not invent a zero threshold or a clinical eligibility condition to collect counts. Test the question set, outcome, and actual Quantity input/export/clear separately.
 
-Quantity thresholds retain their current bounded comparison units (m, cm, kg, g, kg/m2). Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. Their bounds do not restrict unit identities used only for Quantity presence.
+Selected Quantity thresholds use inclusive `at least` (>=) and `at most` (<=), with bounded comparison units m, cm, kg, g, kg/m2, %, and ms. Declare `value type is Quantity '%'.` and derive `definition is "LVEF" at most 55 '%'.` for an inclusive upper bound; use `Quantity 'ms'` and `at least 120 'ms'` for a lower bound in milliseconds. These examples describe numeric syntax, not clinical recommendations. Percent and milliseconds compare only with the same unit; ratio `1` is not percent and `s` is not converted to `ms`. Use the quoted UCUM code `'ms'`, not the bare word `milliseconds`. Unsupported selected units and unitless numeric answers error; missing/valueless answers remain unknown. Comparison magnitude is at most 10^6 with at most eight decimal places. Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. These bounds do not restrict unit identities used only for Quantity presence. Percent/ms thresholds and selected-Quantity `at most` are source capabilities pending release; CRL6.4.54 does not support them.
diff --git a/packages/crl-vscode/src/mcp-server.test.mjs b/packages/crl-vscode/src/mcp-server.test.mjs
index 8a4889ed6..f88e16b6b 100644
--- a/packages/crl-vscode/src/mcp-server.test.mjs
+++ b/packages/crl-vscode/src/mcp-server.test.mjs
@@ -181,8 +181,8 @@ check("authoring_kit full exports all 22 artifacts and determination guidance",
     const kit = JSON.parse(r.content[0].text);
     assert.equal(kit.view, "full");
     assert.equal(kit.complete, true);
-  assert.equal(kit.schemaVersion, "2.48");
-  assert.equal(kit.contentHash, "66dc778106e7986e52b1a6f0a1d89c0993ffd2a51c982311441791695abea8db");
+  assert.equal(kit.schemaVersion, "2.49");
+  assert.equal(kit.contentHash, "18f80b97001714878929cb24b17fff0107a6556c2c1ff177c1815a5296a07ee4");
     assert.equal(kit.fullContentHash, kit.contentHash);
     assert.equal(kit.referenceArtifacts.length, 24);
     assert.equal(kit.dispositionModel.categories.length, 3);
diff --git a/packages/crl-vscode/src/questionUnit.native.test.mjs b/packages/crl-vscode/src/questionUnit.native.test.mjs
index f4bc16c75..34535d3a5 100644
--- a/packages/crl-vscode/src/questionUnit.native.test.mjs
+++ b/packages/crl-vscode/src/questionUnit.native.test.mjs
@@ -7,6 +7,7 @@ import { tmpdir } from 'node:os';
 import { emitCrlBundle, produceResults } from '@smile-digital-health/crl';
 import { applySession } from '@smile-digital-health/crl/session';
 import { questionUnitSource } from '../../crl/src/authoring-kit/questionUnitExample';
+import { quantityThresholdSource } from '../../crl/src/authoring-kit/quantityThresholdExample';
 import { InteractiveSession, nativeInteractiveRunner, readInteractiveResult, interactiveRequest } from './interactiveQuestionnaire';
 
 const enabled = process.env.CRL_QUESTION_UNIT_NATIVE === '1';
@@ -52,6 +53,34 @@ async function answer(session, quantity, minute) {
  return session.evaluate(qr);
 }
 
+// @kit text-answers:question-unit-native-session
+// @kit text-answers:quantity-thresholds-native
+it.skipIf(!enabled).each([['%', 'at most', 55], ['ms', 'at least', 120]])('native threshold %s %s preserves exact boundaries, repeated answers and clear', async (code, comparison, threshold) => {
+ const f = fixture(quantityThresholdSource(code, comparison, threshold));
+ try {
+  const session = interview(f, code === '%' ? 'percent-upper' : 'milliseconds-lower');
+  const start = await session.evaluate(); outcome(start, null);
+  expect(observations(start)).toHaveLength(0);
+  expect(unit(quantities(start)[0])).toEqual([{ system: 'http://unitsofmeasure.org', code, display: code }]);
+  let minute = 1;
+  for (const value of [threshold - 0.00000001, threshold, threshold + 0.00000001, 0]) {
+   const result = await answer(session, { value, code, unit: code, system: 'http://unitsofmeasure.org' }, minute++);
+   outcome(result, (comparison === 'at most' ? value <= threshold : value >= threshold) ? 'Meets' : 'Does Not Meet');
+   expect(observations(result).at(-1).valueQuantity).toMatchObject({ value, code, system: 'http://unitsofmeasure.org' });
+  }
+  const saved = structuredClone(observations(session.result));
+  const repeated = await session.evaluate(structuredClone(session.result.response));
+  expect(observations(repeated)).toEqual(saved);
+  outcome(repeated, comparison === 'at most' ? 'Meets' : 'Does Not Meet');
+  const clear = await answer(session, null, minute++); outcome(clear, null);
+  expect(observations(clear).at(-1)).not.toHaveProperty('valueQuantity');
+  expect(unit(quantities(clear)[0])[0].code).toBe(code);
+  // The wrong dimension is an error, never false or an implicit conversion.
+  await expect(answer(session, { value: 0.55, code: code === '%' ? '1' : 's', system: 'http://unitsofmeasure.org' }, minute++)).rejects.toThrow('native-error');
+  expect(JSON.stringify(session.qualificationReceipts.at(-1).diagnostics)).toContain('publication-quantity-unit-unsupported');
+ } finally { rmSync(f.root, { recursive: true, force: true }); }
+}, 300000);
+
 // @kit text-answers:question-unit-native-session
 it.skipIf(!enabled)('declared BMI default survives native Start, untouched, number entry, change, clear and repeated applies', async () => {
  const f = fixture(); try {
diff --git a/packages/crl/src/authoring-kit/index.ts b/packages/crl/src/authoring-kit/index.ts
index 0fc196175..3d608fdd6 100644
--- a/packages/crl/src/authoring-kit/index.ts
+++ b/packages/crl/src/authoring-kit/index.ts
@@ -5,6 +5,7 @@ import { ANSWER_EXAMPLE_BASE, ANSWER_EXAMPLE_TERMS, ANSWER_EXAMPLE_CEL, answerEx
 import { INTAKE_CRL, INTAKE_CEL, DATETIME_ANSWER } from "./intakeExample";
 import { quantityIntakeSource, QUANTITY_INTAKE_CEL } from "./quantityIntakeExample";
 import { questionUnitSource } from "./questionUnitExample";
+import { quantityThresholdSource } from "./quantityThresholdExample";
 import { SELECTION_REFERENCE_CRL, SELECTION_REFERENCE_CEL } from "./selectionExample";
 import { QUANTITY_EXAMPLE_DECLARATION, QUANTITY_EXAMPLE_FACT } from "./quantityExample";
 import { REUSED_CONDITION_SNIPPET, REUSED_CONDITION_CRL, REUSED_CONDITION_CEL, SHARED_CONTINUATION_CRL, SHARED_CONTINUATION_CEL } from "./decisionExamples";
@@ -402,7 +403,8 @@ export type {
 // REFACTOR:grounded: explicit display metadata is discoverable independently of clinical uncertainty policy.
 // CONTENT schemaVersion → "2.46": uncertainty guard display is an optional Presentation property.
 // CONTENT schemaVersion → "2.48": supported prebatch runtime binding and canonical shared-CQL delivery.
-const SCHEMA_VERSION = "2.48";
+// CONTENT schemaVersion → "2.49": inclusive Quantity thresholds, percentage/millisecond units and shared tested examples.
+const SCHEMA_VERSION = "2.49";
 /** Where KE agents file gap-issues — the repo where the kit + tools are maintained. */
 const FEEDBACK_URL = "https://github.com/alphora/clinical-reasoning-language/issues/new";
 
@@ -486,7 +488,7 @@ const CONCEPT_LAYER_MODEL: ConceptLayerEntry[] = [
   {
     form: "- definition is <predicate>.",
     meaning:
-      "definition is contributes inferred candidates using a supported producer; it does not select the final combined collection. This kit teaches selected-answer in qualifying, named-set membership over a declared value domain, explicit any of and any available value of aggregates, Quantity at least thresholds, and body mass index with an explicit validity operand. Each pattern owns its input, missing-value and validity behavior. shape reduction is most recent selects the final Record. General count/temporal/collection refinements do not have a complete publication replacement. Patient age today is a source value projection; anchored age at start of is a separate measure-context form outside these worked examples.",
+      "definition is contributes inferred candidates using a supported producer; it does not select the final combined collection. This kit teaches selected-answer in qualifying, named-set membership over a declared value domain, explicit any of and any available value of aggregates, inclusive Quantity at least and at most thresholds, and body mass index with an explicit validity operand. Each pattern owns its input, missing-value and validity behavior. shape reduction is most recent selects the final Record. General count/temporal/collection refinements do not have a complete publication replacement. Patient age today is a source value projection; anchored age at start of is a separate measure-context form outside these worked examples.",
     scope: "in",
   },
   {
@@ -522,6 +524,7 @@ const RULES: KitRule[] = [
     id: "text-answers", applicability: "Authoring typed intake questions", category: "concept-model",
     rule: "Use value type is text on an explicit Record/Observation with code is and shape reduction is most recent. text is the author-facing alias for FHIR string; existing string spelling remains accepted. Emission uses Observation.valueString and a string Questionnaire item whose response uses valueString. Preserve the answer text; has-value does not trim it or judge clinical sufficiency. For a Boolean decision guard, derive a separate uncoded Record/Observation/boolean concept with definition is \"Primary Diagnosis\" has a value and its own most-recent reduction. The uncoded guard contributes no question; its answerable operand is included in the form.",
     clauses: [
+      { text: "Quantity thresholds support inclusive at least (>=) and at most (<=) over selected Quantity publications. Units are m/cm, kg/g, kg/m2, same-unit % and same-unit ms, with magnitude at most 10^6 and at most eight decimal places. For an upper-bound percentage use definition is \"Measurement\" at most 55 '%'.; for milliseconds use at least 120 'ms'. Declare the input Quantity unit explicitly for numeric entry. The synthetic quantity-percent-upper-bound and quantity-ms-lower-bound examples share the owning evaluator/native tests; their labels are not clinical recommendations. Use quoted UCUM codes, not spelled-out milliseconds/seconds. Ratios in unit 1 are not percentages; no ratio scaling or seconds conversion is inferred. Selected unsupported units, raw unitless numeric values, comparators and invalid systems error after normal selection; missing/valueless input remains unknown, not false. Percent/ms thresholds and selected-Quantity at most are source capabilities pending release, unavailable in CRL6.4.54. Re-emit the affected include closure together when adopting them.", force: "validator-enforced" },
       // REFACTOR:grounded (#328): author the fresh-entry unit explicitly; never infer it from prose or a threshold.
       { text: "Source capability #328: declare value type is Quantity 'kg/m2'. on a selected Record/Observation concept; presentation supplies only wording. A local code adds a question; uncoded computed Quantities also normalize without an answer slot. CQL/CRE normalize local/source/computed publication values to the declared unit before selection, preserving raw inputs and actual validity. CEL normalizes its locally asserted Quantity before stamping the profile. Same-unit values retain existing admission; conversion supports m/cm and kg/g only, with both input and output limited to magnitude 10^6 and eight decimal places. Conversion bounds apply even when a concept is used only for presence or display. The canonical unit applies to populated numeric values. Unit-only input is an explicit semantic unit assertion; typed output uses the authored canonical UCUM identity, while raw source data stays unchanged. Lossy conversion or incompatible units error. Threshold/BMI operations retain their own supported domains. Unknown/valueless data stays unchanged; comparators and raw unitless numeric Quantities error. CEL facts still state their own unit. Codes are explicit author UCUM assertions; lexical admission is not UCUM dictionary validation. Changing a shared declared unit changes its executable contract: regenerate and deploy the affected include closure together; mixing stale owner artifacts with new consumer artifacts is unsupported. Primitive annotations are carried through opaquely; unit-dependent annotation contents are not recalculated.", force: "validator-enforced" },
       { text: "Declared Quantity units emit standard elementdefinition-allowedUnits on Observation.value[x] in the concept profile and executable CQL type normalization. The shared generator maps profile units to standard questionnaire-unitOption; no custom CRL presentation extension or numeric initial answer is emitted. The matching driver refuses engines lacking the standard profile mapping, including released6.4.45. This source capability needs a separately qualified runtime/VSIX release before production adoption. The shipped LForms client attaches the offered unit to numeric entry. Other clients need separate rendered qualification; unitOption itself specifies choices rather than a universal default. Verify Start, untouched entry, change, clear, exported QR, native extraction and static outputs with the exact candidate digest. No declaration keeps existing behavior.", force: "default" },
@@ -1465,6 +1468,8 @@ const EXAMPLES: KitExample[] = [
   { id: "source-field-order", title: "source-field-order", language: "crl", valid: true, snippet: SOURCE_ORDER_EXAMPLE, note: "Exact declaration shared with concept-body-order-independence.test.ts: all concept fields precede the trailing source block. The owning test checks AST ownership and publication preparation, not native execution." },
   { id: "coded-observation-source", title: "Selected coded Observation source", language: "crl", valid: true, snippet: CODED_SOURCE_POLICY, note: "Complete synthetic source-only policy shared with the coded-source emitter and CRE tests. Declare the tested source and result terminology; do not replace it with clinical codes without source justification. Supply package.json name coded-source and crl.canonicalBase https://example.org/coded-source. No local code means no editable question. Interpretation follows final selection; no extra indeterminate modifier is introduced. These source tests do not certify a customer policy or native execution." },
   { id: "quantity-declaration", title: "quantity-declaration", language: "crl", valid: true, snippet: QUANTITY_EXAMPLE_DECLARATION, note: "Exact current Quantity declaration from the owning CEL numeric-literal test. Supply package.json crl.canonicalBase for emission. This example defines a measurement, not a Boolean decision guard." },
+  { id: "quantity-percent-upper-bound", title: "Inclusive percentage upper bound", language: "crl", valid: true, snippet: quantityThresholdSource("%", "at most", 55), note: "Synthetic numeric example shared with publicationQuantity.test.ts (evaluator, admission and emission), CRE and questionUnit.native.test.mjs. Supply package.json crl.canonicalBase. Real native session checks below/equal/above, zero, edit, unchanged resubmission, clear and incompatible-unit error. Source capability pending release; unavailable in6.4.54. No ratio scaling or clinical recommendation." },
+  { id: "quantity-ms-lower-bound", title: "Inclusive millisecond lower bound", language: "crl", valid: true, snippet: quantityThresholdSource("ms", "at least", 120), note: "Synthetic numeric example shared with the owning evaluator, CRE and native session checks. Supply package.json crl.canonicalBase. Use ms as the unit code, not the bare word milliseconds; seconds are not converted. Source capability pending release; unavailable in6.4.54. No clinical recommendation." },
   { id: "quantity-question-unit", title: "Quantity question with an explicit unit", language: "crl", valid: true, snippet: questionUnitSource(), note: "Synthetic BMI threshold example shared with questionUnit.test.ts and questionUnit.native.test.mjs. Supply package.json crl.canonicalBase. Requires the standard profile-unit mapping engine and matching driver; source-qualified, unavailable in the released 6.4.45 engine. Fresh number entry uses kg/m2; no clinical eligibility recommendation is intended by the Above/Below labels. No post-processing or engine-specific CRL is needed." },
   { id: "quantity-answer", title: "quantity-answer", language: "cel", valid: true, snippet: QUANTITY_EXAMPLE_FACT, note: "Fact excerpt shared verbatim with numericValueRules.test.ts. Use within a CEL library covering L with a Patient subject and case referencing F. The owning test checks numeric-literal diagnostics; this excerpt does not establish BMI, unit conversion or native execution." },
 
diff --git a/packages/crl/src/authoring-kit/navigation.ts b/packages/crl/src/authoring-kit/navigation.ts
index 9fffcedc5..9f88710c6 100644
--- a/packages/crl/src/authoring-kit/navigation.ts
+++ b/packages/crl/src/authoring-kit/navigation.ts
@@ -12,7 +12,7 @@ const ALIASES: Record<string, string[]> = {
   "interactive-questionnaire": ["interactive testing", "request-bundle.json", "Start Continue Reset", "prune answers"],
   "native-apply-session": ["applySession", "crl-apply-session", "buildSessionResponse", "edits-only", "clear answer", "session API", "--serve", "reusable JVM", "warm JVM", "NDJSON", "createNativeWorkerPool", "runJob", "setWorkerLimit", "worker pool", "independent sessions"],
   "fhir-packaging": ["FHIR npm package", "emit_crl_bundle", "emitCrlBundle", "definitions-only Bundle", "CRMI package", "package_fhir", "crl-package-fhir", "ImplementationGuide", "package manifest", "packageId", "fhirDependencies"],
-  "text-answers": ["text", "string", "has a value", "answered", "intake", "free text", "primary diagnosis", "dateTime", "date", "temporal", "Treatment Start", "Quantity", "Number", "count", "sessions", "rate", "d/wk", "h/d", "quantity unit", "value type", "UCUM", "kg/m2", "unitOption"],
+  "text-answers": ["text", "string", "has a value", "answered", "intake", "free text", "primary diagnosis", "dateTime", "date", "temporal", "Treatment Start", "Quantity", "Number", "count", "sessions", "rate", "d/wk", "h/d", "quantity unit", "value type", "UCUM", "kg/m2", "unitOption", "percent", "LVEF", "milliseconds", "ms", "QRS", "PR", "at most", "at least", "numeric threshold"],
   "concept-form": ["concept", "case feature", "Scalar", "remove scalar", "Observation", "code is", "absence", "completeness", "evidence completeness"],
   "value-type": ["value type is", "boolean", "Quantity", "CodeableConcept"],
   "publication-selection": ["shape reduction is", "most recent", "override", "local external inferred", "recency"],
@@ -74,6 +74,8 @@ const RELATED: Record<string, string[]> = {
 /** Direct examples need their semantic guidance as well as runnable files/configuration. */
 const EXAMPLE_RULES: Record<string, string[]> = {
   "datetime-answer": ["text-answers", "value-type", "concept-form"],
+  "quantity-percent-upper-bound": ["text-answers", "publication-selection"],
+  "quantity-ms-lower-bound": ["text-answers", "publication-selection"],
   "quantity-question-unit": ["text-answers", "concept-presentation", "publication-selection"],
   "source-field-order": ["concept-form"],
   "coded-observation-source": ["concept-form", "publication-selection", "named-answer-options"],
diff --git a/packages/crl/src/authoring-kit/tests/authoring-kit.test.ts b/packages/crl/src/authoring-kit/tests/authoring-kit.test.ts
index deb52c0be..3eabf6f02 100644
--- a/packages/crl/src/authoring-kit/tests/authoring-kit.test.ts
+++ b/packages/crl/src/authoring-kit/tests/authoring-kit.test.ts
@@ -324,7 +324,7 @@ describe("authoring-kit — getAuthoringKit", () => {
     expect(kit).not.toHaveProperty("useCase");
     expect(kit).not.toHaveProperty("stage");
     expect(kit).not.toHaveProperty("chain");
-    expect(kit.schemaVersion).toBe("2.48");
+    expect(kit.schemaVersion).toBe("2.49");
     expect(kit.summary).toMatch(/Local decision support/);
   });
 
@@ -679,8 +679,8 @@ describe("authoring-kit — getAuthoringKit", () => {
   // There is no longer a way to re-pin that looks like routine test maintenance.
   it("the full content hash stays pinned for its kit version", () => {
     const kit = getAuthoringKit();
-    expect(kit.schemaVersion).toBe("2.48");
-    expect(kit.contentHash).toBe("66dc778106e7986e52b1a6f0a1d89c0993ffd2a51c982311441791695abea8db");
+    expect(kit.schemaVersion).toBe("2.49");
+    expect(kit.contentHash).toBe("18f80b97001714878929cb24b17fff0107a6556c2c1ff177c1815a5296a07ee4");
   });
 
   // @kit criterion:description-navigation
diff --git a/packages/crl/src/authoring-kit/tests/coverage.md b/packages/crl/src/authoring-kit/tests/coverage.md
index e1b0824a8..74dafb923 100644
--- a/packages/crl/src/authoring-kit/tests/coverage.md
+++ b/packages/crl/src/authoring-kit/tests/coverage.md
@@ -1,3 +1,22 @@
+## Percentage and millisecond Quantity thresholds ? schema2.49 maintenance
+
+REFACTOR:grounded. Baseline completed audit04657bd7222763eff9c466a8853314a79d702f67, schema2.48/content66dc778106e7986e52b1a6f0a1d89c0993ffd2a51c982311441791695abea8db. Feature baseline develop7c7a83cc0c79bf32d729d2752b798d048e5a0699. Target pending reviewed implementation commit; finalize the literal target in the separate metadata stamp. Schema2.49/content18f80b97001714878929cb24b17fff0107a6556c2c1ff177c1815a5296a07ee4. Full changed-path inventory: maintenance-quantity-thresholds-paths.txt. Plan1507, code1508. Operator requests numeric LVEF% and QRS/PRms thresholds; pictured LVEF55% or less requires inclusive AtMost. No clinical threshold recommendation, customer policy migration, runtime upgrade or release is inferred.
+
+| Paths, assertions and meaningful inputs | Disposition / limits |
+| --- | --- |
+| Baseline?develop package.json/package-lock plus both package manifests, release notes README/catalog | Not author-facing for this feature: inspected eight-path interval contains6.4.53?54 version/release text, no dependency/runtime/logic change. Prior audit/ledger stamp pins reviewed04657bd7; metadata only. |
+| emit/publicationQuantity.ts, publicationProgram.ts, publicationProducer.ts; cql-emitter/renderPublicationQuantity.ts and emitCQL.ts | Kit updated: text-answers threshold clause and concept-layer definition teaching admit inclusive AtLeast/AtMost. Required prepared comparison discriminator; shared TS/CQL unit map adds isolated % and ms factor1. Exact arithmetic, timestamp/selection/unknown/error contracts retained. Both helper functions emitted in existing threshold/BMI gate, so generated CQL bytes change even for existing BMI/AtLeast consumers; no catalogue, driver, engine or customer goldens rewritten. |
+| emit/tests/publicationQuantity.test.ts ? inclusive lower/upper boundaries, admission/emission, unsupported spelling, wrong result/operand and nested age tests | Kit updated. text-answers:quantity-thresholds covers %/ms/m/kg/m2 exact55?1e-8/equal/zero, both comparators, code over display, missing/valueless, invalid units/system/comparator, ratio1/s/prototype name/cross-dimension, >8places and >1e6. Ordinary preparation/emission covers both operators/%/ms/kg/m2 direct+partitioned; milliseconds/seconds/1/s/mm[Hg] rejected with supported-unit diagnostic. Wrong value type/nonQuantity operand/nested retired age refusal is negative boundary coverage, not positive author guidance. |
+| emit/tests/questionUnit.test.ts ? ordinary validation accepts both inclusive operators and rejects spelled-out unit | Kit updated, text-answers:quantity-thresholds-validation. Actual imports validation for %/ms ? both operators; existing profile-unit/normalization/type/packaging guards unchanged. |
+| cre/tests/publicationQuantity.test.ts ? both inclusive operators with unit identities and imported owners | Kit updated, text-answers:quantity-thresholds-cre. Shared quantityThresholdSource; %/ms ? both operators ? local/imported owner, four exact numeric rows + missing pause (40CRE cases). CEL FHIR retains unit code, actual CRE passes expected activities, imported CQL emission succeeds. CRE is prediction, not native proof. |
+| authoring-kit/quantityThresholdExample.ts and index/navigation.ts; docs/CRL-NORTH-STAR.md and typed-intake-answers.md | Kit updated. Two complete synthetic examples quantity-percent-upper-bound and quantity-ms-lower-bound are the same pure source generator used by owning tests, configured with package.json crl.canonicalBase. Numeric entry/unit identity remain explicit; no ratio scaling/time conversion. New forms explicitly unavailable in released6.4.54. Discovery aliases LVEF/milliseconds/ms/QRS/PR/at-most reach text-answers and example semantic prerequisites. Existing BMI input domain remains positive mass/length only; no stale old unit allowlist retained. |
+| authoring-kit/tests/query.test.ts, authoring-kit.test.ts, cli/tests/run-mcp-server.test.mjs, crl-vscode/src/mcp-server.test.mjs | Kit updated: real schema/content identity repinned from built full payload. Overview measured39485bytes after2new indexed examples/aliases; bounded guard grows39000?40000, still complete and well below full payload. Three new search rows verify LVEF/milliseconds/at-most discovery. Existing full/entry/export/artifact-emission gates retained. No new abstract behavior suite. |
+| crl-vscode/src/questionUnit.native.test.mjs | Kit updated, text-answers:quantity-thresholds-native. Shared % at most55 and ms at least120; actual applySession with verified pinned engine2ee7aa8e checks Start/no measurements, standard unitOption, exact boundary updates, zero, unchanged resubmission, explicit clear and incompatible1/s error. Existing declared BMI native session is the shared-helper regression control. Native execution pending at initial review; update measured outcome below. This Windows synthetic proof is not Linux/installed/UI/customer-policy qualification. |
+
+Tag delta: adds text-answers:quantity-thresholds, quantity-thresholds-validation, quantity-thresholds-cre, quantity-thresholds-native; existing query discovery tag gains3rows. No tags/owning assertions removed. Untagged negative admission cases explicitly dispositioned above. Existing guidance sufficient for unchanged mass/length conversions, BMI arithmetic, source metadata/actual validity, missing/valueless unknown, selected-value errors and immutable raw input; this feature does not change those contracts.
+
+Validation: initial owning4files85/85passed. Expanded9files351passed/2failed on missing schema changelog and measured overview bound; both corrected. Four kit files240/240pass after corrections, including actual reference-artifact emission and retrieval/export assertions. Core+extension compile/typecheck passed. Native, delivered MCP and final review results pending below; do not advance audit until complete.
+
 ## Named native retention conditions - 6.4.54 bounded implementation maintenance
 
 Baseline completed audit cd7dbbcc40d59af4139710acd26e01ba6271a769, schema2.48/content66dc778106e7986e52b1a6f0a1d89c0993ffd2a51c982311441791695abea8db. Reviewed implementation target 04657bd7222763eff9c466a8853314a79d702f67, schema2.48/content66dc778106e7986e52b1a6f0a1d89c0993ffd2a51c982311441791695abea8db. Full baseline-through53 interval is inspected in maintenance-retention-identifiers-paths.txt. Its release/audit/notes/provider/tool-inventory/qualification changes are delivery maintenance already dispositioned in the deployment-integrity section. New implementation corrects generated condition transport, with no authored spelling, clinical aggregate, engine, driver, native/session API or kit-content change.
diff --git a/packages/crl/src/authoring-kit/tests/query.test.ts b/packages/crl/src/authoring-kit/tests/query.test.ts
index 26d53dfe5..708539f1c 100644
--- a/packages/crl/src/authoring-kit/tests/query.test.ts
+++ b/packages/crl/src/authoring-kit/tests/query.test.ts
@@ -53,8 +53,8 @@ describe("one authoring kit: discovery and complete guidance", () => {
     expect(overview).not.toHaveProperty("rules");
     expect(overview.index).toEqual(kit.navigation);
     expect(JSON.stringify(overview.introduction).length).toBeLessThan(7000);
-    // Keep the complete index bounded; uncertainty guard display adds one entry. Quantity intake adds two paired artifacts and discovery terms.
-    expect(JSON.stringify(overview).length).toBeLessThan(39000);
+    // Two shared numeric-threshold examples and their unit aliases extend the complete index by <1KB.
+    expect(JSON.stringify(overview).length).toBeLessThan(40000);
     const fullSize = JSON.stringify(query({ view: "full" })).length;
     for (const id of ["rule:criterion", "rule:decision-composition"]) {
       expect(JSON.stringify(query({ view: "entry", id })).length, id).toBeLessThan(fullSize / 2);
@@ -83,6 +83,9 @@ describe("one authoring kit: discovery and complete guidance", () => {
 
   // @kit verify-loop:kit-discovery
   it.each([
+    ["LVEF", "rule:text-answers"],
+    ["milliseconds", "rule:text-answers"],
+    ["at most", "rule:text-answers"],
     ["--serve", "rule:native-apply-session"],
     ["reusable JVM", "rule:native-apply-session"],
     ["createNativeWorkerPool", "rule:native-apply-session"],
diff --git a/packages/crl/src/cli/tests/run-mcp-server.test.mjs b/packages/crl/src/cli/tests/run-mcp-server.test.mjs
index b589ab9b1..ebec1e360 100644
--- a/packages/crl/src/cli/tests/run-mcp-server.test.mjs
+++ b/packages/crl/src/cli/tests/run-mcp-server.test.mjs
@@ -417,8 +417,8 @@ try {
     const kit = JSON.parse(r.content[0].text);
     assert.equal(kit.view, "full");
     assert.equal(kit.complete, true);
-    assert.equal(kit.schemaVersion, "2.48");
-    assert.equal(kit.contentHash, "66dc778106e7986e52b1a6f0a1d89c0993ffd2a51c982311441791695abea8db");
+    assert.equal(kit.schemaVersion, "2.49");
+    assert.equal(kit.contentHash, "18f80b97001714878929cb24b17fff0107a6556c2c1ff177c1815a5296a07ee4");
     assert.equal(kit.fullContentHash, kit.contentHash);
     assert.equal(kit.referenceArtifacts.length, 24);
     assert.equal(kit.dispositionModel.categories.length, 3);
diff --git a/packages/crl/src/cql-emitter/emitCQL.ts b/packages/crl/src/cql-emitter/emitCQL.ts
index 1ccff563d..a0b5c5019 100644
--- a/packages/crl/src/cql-emitter/emitCQL.ts
+++ b/packages/crl/src/cql-emitter/emitCQL.ts
@@ -2520,7 +2520,7 @@ class Emitter {
         : producer.kind === "hasValue"
         ? `${cqlIdent(PUBLICATION_PRODUCER_FUNCTIONS.hasValue)}(${operand}, ${cqlStringLiteral(producer.producerId)}, ${code}, ${profile}, ${cqlStringLiteral(producer.operandValueType)}, 'Patient/' + Patient.id.value)`
         : producer.kind === "quantityThreshold"
-        ? `${cqlIdent(QUANTITY_CQL.candidate)}(${operand}, ${cqlStringLiteral(producer.producerId)}, ${code}, ${profile}, ${producer.threshold.value.toFixed(8)}, ${cqlStringLiteral(producer.threshold.unit)}, ${cqlStringLiteral(descriptor.conceptId)}, 'Patient/' + Patient.id.value)`
+        ? `${cqlIdent(producer.comparison === "at-most" ? QUANTITY_CQL.candidateAtMost : QUANTITY_CQL.candidate)}(${operand}, ${cqlStringLiteral(producer.producerId)}, ${code}, ${profile}, ${producer.threshold.value.toFixed(8)}, ${cqlStringLiteral(producer.threshold.unit)}, ${cqlStringLiteral(descriptor.conceptId)}, 'Patient/' + Patient.id.value)`
         : `${cqlIdent(PUBLICATION_PRODUCER_FUNCTIONS.candidate)}(${operand}, ${cqlStringLiteral(producer.producerId)}, ${code}, ${profile}, ${renderPublicationCodeTable(producer.domain)}, ${renderPublicationCodeTable(producer.qualifying)}, ${cqlStringLiteral(descriptor.conceptId)}, 'Patient/' + Patient.id.value)`;
       // Flatten preserves duplicate inputs for the selector's diagnostic; union could silently erase them.
       candidates = `Flatten({ ${candidates}, (({ ${produced} }) C where C is not null) })`;
diff --git a/packages/crl/src/cql-emitter/renderPublicationQuantity.ts b/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
index 4cbaa655e..336372eb6 100644
--- a/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
+++ b/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
@@ -1,26 +1,32 @@
 import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";
 import { PUBLICATION_PRODUCER_FUNCTIONS } from "./renderPublicationProducer";
+import { PUBLICATION_QUANTITY_UNITS } from "../emit/publicationQuantity";
 
 export const QUANTITY_CQL = {
   unit: "__CRL_PublicationProducer_v1_QuantityUnit", factor: "__CRL_PublicationProducer_v1_QuantityFactor",
   group: "__CRL_PublicationProducer_v1_QuantityGroup", compare: "__CRL_PublicationProducer_v1_QuantityAtLeast",
   candidate: "__CRL_PublicationProducer_v1_QuantityThresholdCandidate",
+  compareAtMost: "__CRL_PublicationProducer_v1_QuantityAtMost",
+  candidateAtMost: "__CRL_PublicationProducer_v1_QuantityAtMostCandidate",
 };
 export function renderPublicationThresholdHelpers(): string {
   const n = QUANTITY_CQL;
+  // REFACTOR:grounded: one unit table governs CRE and native comparisons; no fractional factors.
+  const entries = Object.entries(PUBLICATION_QUANTITY_UNITS);
+  const comparisons = [[n.compare, n.candidate, ">="], [n.compareAtMost, n.candidateAtMost, "<="]];
   return `define function "${n.unit}"(Q FHIR.Quantity): Coalesce(Q.code.value, Q.unit.value)
 define function "${n.factor}"(unit System.String):
-  case unit when 'kg' then 1000.0 when 'm' then 100.0 when 'g' then 1.0 when 'cm' then 1.0 when 'kg/m2' then 1.0 else null as System.Decimal end
+  case unit ${entries.map(([unit, spec]) => `when '${unit}' then ${spec.factor}.0`).join(" ")} else null as System.Decimal end
 define function "${n.group}"(unit System.String):
-  case when unit in { 'kg', 'g' } then 'mass' when unit in { 'm', 'cm' } then 'length' when unit = 'kg/m2' then 'bmi' else null as System.String end
-define function "${n.compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
+  case unit ${entries.map(([unit, spec]) => `when '${unit}' then '${spec.group}'`).join(" ")} else null as System.String end
+${comparisons.map(([compare, candidate, operator]) => `define function "${compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
   if Q.value.value is null then null as System.Boolean
   else if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8) then
     Message(null as System.Boolean, true, 'publication-quantity-precision-unsupported', 'Error', 'Quantity comparison supports magnitude at most 10^6 and at most eight decimal places')
   else if "${n.group}"("${n.unit}"(Q)) is null or "${n.group}"("${n.unit}"(Q)) != "${n.group}"(unit) then
     Message(null as System.Boolean, true, 'publication-quantity-unit-unsupported', 'Error', 'Quantity comparison requires compatible supported units')
-  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) >= threshold * "${n.factor}"(unit)
-define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
+  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) ${operator} threshold * "${n.factor}"(unit)
+define function "${candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
   profile System.String, threshold System.Decimal, unit System.String, conceptId System.String, subjectReference System.String):
   if operand.state = 'failed' then
     Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, operand.failureCode, 'Error', operand.failureMessage)
@@ -28,7 +34,7 @@ define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE
   else Tuple {
     key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
     contributorId: producerId, arm: 'inferred', retrievedInputIdentity: null as System.String,
-    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${n.compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
+    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
     validity: operand.selected.validity
-  }`;
+  }`).join("\n")}`;
 }
diff --git a/packages/crl/src/cre/tests/publicationQuantity.test.ts b/packages/crl/src/cre/tests/publicationQuantity.test.ts
index 11307ee0e..3b68819dd 100644
--- a/packages/crl/src/cre/tests/publicationQuantity.test.ts
+++ b/packages/crl/src/cre/tests/publicationQuantity.test.ts
@@ -7,9 +7,36 @@ import { emitCelToFhir } from "../../cel/emitter/emitFhir";
 import { runCel } from "../run";
 import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
 import { emitCQLImports } from "../../imports/emit";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
 
 // REFACTOR:grounded (#320, plan587): actual CEL quantities drive the selected-value comparison.
 describe("Quantity publication CEL/CRE", () => {
+  // @kit text-answers:quantity-thresholds-cre
+  it.each(["%", "ms"])("runs both inclusive operators with native unit identities and imported owners for %s", unit => {
+    const dir = mkdtempSync(path.join(os.tmpdir(), "crl-threshold-"));
+    try {
+      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "quantity-threshold", version: "0.0.0", crl: { canonicalBase: "https://example.org/quantity-threshold", date: "2026-11-18" } }));
+      const crl = path.join(dir, "policy.crl"), cel = path.join(dir, "cases.cel");
+      for (const comparison of ["at least", "at most"] as const) for (const imported of [false, true]) {
+        const source = quantityThresholdSource(unit, comparison, 55);
+        const start = source.indexOf('concept "Threshold Met":');
+        writeFileSync(crl, imported ? 'library "Quantity Threshold Intake".\n' + source.slice(start).replace('"Measurement"', '"Measurements"."Measurement"') : source);
+        const owner = imported ? "Measurements" : "Quantity Threshold Intake";
+        if (imported) writeFileSync(path.join(dir, "measurements.crl"), source.slice(0, start).replace('library "Quantity Threshold Intake".', 'library "Measurements".'));
+        const rows = [["Below", 54.99999999], ["Equal", 55], ["Above", 55.00000001], ["Zero", 0]] as const;
+        writeFileSync(cel, `library "Cases". covers "Quantity Threshold Intake".\nfact "P": - defined by "Patient".\n` + rows.map(([name, value]) => `fact "${name}": - defined by "${owner}"."Measurement". - value is ${value} '${unit}'.\ncase "${name}": - subject is "P". - fact is "${name}". - result is "Assessment" is "${(comparison === "at most" ? value <= 55 : value >= 55) ? "Meets" : "Does Not Meet"}".\n`).join("") + 'case "Missing": - subject is "P". - result is "Assessment" is pause.\n');
+        const context = resolveCelImports(cel), data = emitCelToFhir(context), run = runCel(context);
+        expect(data.diagnostics.filter(d => d.severity === "error")).toEqual([]);
+        expect(JSON.stringify(data)).toContain(`"code":"${unit}"`);
+        expect(run.errors).toEqual([]);
+        expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(Array.from({ length: 5 }, () => ({ status: "pass", diagnostics: [] })));
+        const cql = emitCQLImports(crl); expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
+        if (!imported) continue;
+        // Remove the imported library before the next local iteration; no duplicate owner.
+        rmSync(path.join(dir, "measurements.crl"));
+      }
+    } finally { rmSync(dir, { recursive: true, force: true }); }
+  });
   // @kit source-representation:quantity-cel-outcomes
   it("preserves unit-only CEL quantities, computes determinate outcomes and pauses on absence", () => {
     const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent,"crl-quantity-"));
diff --git a/packages/crl/src/emit/publicationProducer.ts b/packages/crl/src/emit/publicationProducer.ts
index 57c9635c7..1713bcf3e 100644
--- a/packages/crl/src/emit/publicationProducer.ts
+++ b/packages/crl/src/emit/publicationProducer.ts
@@ -1,7 +1,7 @@
 import type { PublicationDescriptor } from "./publicationProgram";
 import type { PublicationCandidate } from "./publicationSelection";
 import { classifyPublicationMembership, type PublicationValueError } from "./publicationDomain";
-import { publicationQuantityAtLeast } from "./publicationQuantity";
+import { publicationQuantityAtLeast, publicationQuantityAtMost } from "./publicationQuantity";
 
 // REFACTOR:grounded (#320, review 562): unary production adds an inferred candidate. It never
 // reselects input, inherits its id, assigns Now(), or treats a missing value as false.
@@ -34,7 +34,7 @@ export function produceMembershipCandidate(
       message: "This publication has no membership producer.",
     };
   if (operand === undefined) return { kind: "none" };
-  const value = producer.kind === "quantityThreshold" ? publicationQuantityAtLeast(operand.resource.valueQuantity, producer.threshold)
+  const value = producer.kind === "quantityThreshold" ? (producer.comparison === "at-most" ? publicationQuantityAtMost : publicationQuantityAtLeast)(operand.resource.valueQuantity, producer.threshold)
     : classifyPublicationMembership(producer, operand.resource);
   if (value.kind === "error") return value;
   if (subjectReference.trim() === "")
diff --git a/packages/crl/src/emit/publicationProgram.ts b/packages/crl/src/emit/publicationProgram.ts
index fd1719cd7..46f8a4b28 100644
--- a/packages/crl/src/emit/publicationProgram.ts
+++ b/packages/crl/src/emit/publicationProgram.ts
@@ -78,6 +78,7 @@ export interface PublicationThresholdProducer {
   readonly producerId: string;
   readonly operand: QualifiedConceptIdentity;
   readonly threshold: { readonly value: number; readonly unit: string };
+  readonly comparison: "at-least" | "at-most";
 }
 
 // REFACTOR:grounded (#320, plan589): ordered dependencies and validity are distinct.
@@ -103,14 +104,14 @@ export function publicationProducerOperands(p: PublicationProducer | undefined):
 }
 
 // REFACTOR:grounded (#320, plan587): unary comparison contributes its own Boolean record.
-export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; location: Location } | undefined {
+export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; comparison: "at-least" | "at-most"; location: Location } | undefined {
   if (concept.definition?.type !== "DefinitionIsDefinition") return undefined;
   const call = matchNarrative(concept.definition.body);
-  if (!call.known || call.pattern !== "AtLeast" || call.args.length !== 2) return undefined;
+  if (!call.known || !["AtLeast", "AtMost"].includes(call.pattern) || call.args.length !== 2) return undefined;
   const [operand, threshold] = call.args;
   if (operand.type !== "ConceptRefArg" || threshold.type !== "QuantityArg") return undefined;
   return { operand: operand.library === undefined ? operand.value : { type: "QualifiedReference", libraryName: operand.library, name: operand.value, location: operand.location },
-    threshold: { value: threshold.value, unit: threshold.unit }, location: call.location };
+    threshold: { value: threshold.value, unit: threshold.unit }, comparison: call.pattern === "AtMost" ? "at-most" : "at-least", location: call.location };
 }
 
 // REFACTOR:grounded (#322): only the exact unary selected-value presence form is admitted.
@@ -470,7 +471,7 @@ export function preparePublicationProgram(declarations: PublicationContext): Pub
           return fail(thresholdError, comparison.location, "publication-quantity-unit-unsupported");
         checkQuestionUnit(hit.library, hit.node, comparison.threshold.unit, `quantity threshold in "${library.libraryName}"."${concept.name}"`, comparison.location);
         producer = Object.freeze({ kind: "quantityThreshold", producerId: `crl:producer:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["quantityThreshold", 0]]))}`,
-          operand: operand.identity, threshold: Object.freeze(comparison.threshold) });
+          operand: operand.identity, threshold: Object.freeze(comparison.threshold), comparison: comparison.comparison });
       }
       // REFACTOR:grounded (#320, plan589): prepare both selected inputs and resolve anchor identity.
       const bmi = readPublicationBMI(concept);
diff --git a/packages/crl/src/emit/publicationQuantity.ts b/packages/crl/src/emit/publicationQuantity.ts
index 3760e3ced..8c8656072 100644
--- a/packages/crl/src/emit/publicationQuantity.ts
+++ b/packages/crl/src/emit/publicationQuantity.ts
@@ -21,11 +21,15 @@ export function readPublicationQuantity(value: unknown): PublicationQuantityValu
   return { kind: "known", value: q.value, unit };
 }
 
-const units: Record<string, { group: string; factor: bigint }> = {
+// Integer factors preserve the eight-place decimal domain in emitted CQL as well as TS.
+export const PUBLICATION_QUANTITY_UNITS: Readonly<Record<string, { readonly group: string; readonly factor: bigint }>> = Object.freeze({
   m: { group: "length", factor: 100n }, cm: { group: "length", factor: 1n },
   kg: { group: "mass", factor: 1000n }, g: { group: "mass", factor: 1n },
   "kg/m2": { group: "bmi", factor: 1n },
-};
+  "%": { group: "percentage", factor: 1n },
+  ms: { group: "milliseconds", factor: 1n },
+});
+const units = PUBLICATION_QUANTITY_UNITS;
 /** REFACTOR:grounded (#328): reuse the actual comparison domain; metadata adds no conversions. */
 export function publicationQuantityUnitsCompatible(a: string, b: string): boolean {
   return a === b || Object.prototype.hasOwnProperty.call(units, a) && Object.prototype.hasOwnProperty.call(units, b) && units[a].group === units[b].group;
@@ -44,20 +48,33 @@ export function isPublicationComparisonDecimal(value: number): boolean {
 /** The same authored threshold admission is used by validation and executable preparation. */
 export function publicationQuantityThresholdError(threshold: { value: number; unit: string }): string | undefined {
   return !isPublicationComparisonDecimal(threshold.value) || !Object.prototype.hasOwnProperty.call(units, threshold.unit)
-    ? "Quantity threshold requires a finite value and a supported unit: m, cm, kg, g, kg/m2."
+    ? "Quantity threshold requires a finite value and a supported unit: m, cm, kg, g, kg/m2, %, ms."
     : undefined;
 }
 export function publicationQuantityAtLeast(value: unknown, threshold: { value: number; unit: string }):
+  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
+  return comparePublicationQuantity(value, threshold, "at-least");
+}
+
+// REFACTOR:grounded (quantity thresholds): inclusive operators share exact unit-aware arithmetic.
+export function publicationQuantityAtMost(value: unknown, threshold: { value: number; unit: string }):
+  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
+  return comparePublicationQuantity(value, threshold, "at-most");
+}
+
+function comparePublicationQuantity(value: unknown, threshold: { value: number; unit: string }, comparison: "at-least" | "at-most"):
   { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
   const q = readPublicationQuantity(value);
   if (q.kind !== "known") return q;
   if (!isPublicationComparisonDecimal(q.value) || !isPublicationComparisonDecimal(threshold.value))
     return { kind: "error", code: "publication-quantity-precision-unsupported", message: "Quantity comparison supports magnitude at most 10^6 and at most eight decimal places." };
-  const a = units[q.unit], b = units[threshold.unit];
+  const a = Object.prototype.hasOwnProperty.call(units, q.unit) ? units[q.unit] : undefined;
+  const b = Object.prototype.hasOwnProperty.call(units, threshold.unit) ? units[threshold.unit] : undefined;
   if (a === undefined || b === undefined || a.group !== b.group)
     return { kind: "error", code: "publication-quantity-unit-unsupported", message: "Quantity comparison requires compatible supported units." };
   const left = publicationDecimal(q.value), right = publicationDecimal(threshold.value);
-  return { kind: "known", value: left.coefficient * a.factor * right.scale >= right.coefficient * b.factor * left.scale };
+  const lhs = left.coefficient * a.factor * right.scale, rhs = right.coefficient * b.factor * left.scale;
+  return { kind: "known", value: comparison === "at-most" ? lhs <= rhs : lhs >= rhs };
 }
 
 /** REFACTOR:grounded (#328): explicit type normalization never changes caller-owned raw data.
diff --git a/packages/crl/src/emit/tests/publicationQuantity.test.ts b/packages/crl/src/emit/tests/publicationQuantity.test.ts
index 40130b599..fefe7b97d 100644
--- a/packages/crl/src/emit/tests/publicationQuantity.test.ts
+++ b/packages/crl/src/emit/tests/publicationQuantity.test.ts
@@ -2,7 +2,8 @@ import { describe, expect, it } from "vitest";
 import { buildCRL } from "../../index";
 import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
 import { adaptObservationPublicationCandidate, type PublicationObservationSource } from "../publicationSource";
-import { readPublicationQuantity, publicationQuantityAtLeast } from "../publicationQuantity";
+import { readPublicationQuantity, publicationQuantityAtLeast, publicationQuantityAtMost } from "../publicationQuantity";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
 import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
 import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
 import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
@@ -36,6 +37,50 @@ const measurement = (value: unknown = { value: 200, unit: "cm" }) => ({
   effectiveDateTime: "2026-09-01", ...(value === null ? {} : { valueQuantity: value }),
 });
 describe("Quantity publication", () => {
+  // @kit text-answers:quantity-thresholds
+  it.each(["%", "ms", "m", "kg/m2"])("preserves inclusive lower/upper boundaries and errors for %s", unit => {
+    const threshold = { value: 55, unit };
+    for (const [value, lower, upper] of [[54.99999999, false, true], [55, true, true], [55.00000001, true, false], [0, false, true]] as const) {
+      const q = { value, system: "http://unitsofmeasure.org", code: unit, unit: "display is not the code" };
+      expect(publicationQuantityAtLeast(q, threshold)).toEqual({ kind: "known", value: lower });
+      expect(publicationQuantityAtMost(q, threshold)).toEqual({ kind: "known", value: upper });
+    }
+    for (const compare of [publicationQuantityAtLeast, publicationQuantityAtMost]) {
+      expect(compare(null, threshold)).toEqual({ kind: "unknown" });
+      expect(compare({ unit }, threshold)).toEqual({ kind: "unknown" });
+      for (const bad of [{ value: 55 }, { value: 55, unit, system: "other" }, { value: 55, unit, comparator: "<" }, { value: 0.55, unit: "1" }, { value: 1, unit: "s" }, { value: 55, unit: "toString" }, { value: 55, unit: unit === "%" ? "ms" : "%" }, { value: 55.000000001, unit }, { value: 1000001, unit }])
+        expect(compare(bad, threshold).kind, JSON.stringify(bad)).toBe("error");
+    }
+  });
+  // @kit text-answers:quantity-thresholds
+  it.each(["%", "ms", "kg/m2"])("admits and emits exact selected-Quantity comparisons for %s", unit => {
+    for (const comparison of ["at least", "at most"] as const) {
+      const { ast } = prepare(quantityThresholdSource(unit, comparison, 55));
+      const program = prepareSingleLibraryPublication(ast, options);
+      expect(program.descriptors.find(d => d.producer?.kind === "quantityThreshold")?.producer).toMatchObject({ kind: "quantityThreshold", comparison: comparison.replace(" ", "-"), threshold: { value: 55, unit } });
+      const direct = emitCQLFromAST(ast, options);
+      expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
+      expect(direct.result).toContain(`when '${unit}' then 1.0`);
+      expect(direct.result).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+      const partitioned = emitPartitioned(lowerLocalCodes(ast, options).ast, "Quantity Threshold Intake", options.policyId, FULL_PARTITION, options);
+      expect(partitioned.success, JSON.stringify(partitioned.errors)).toBe(true);
+      expect(partitioned.entries.map(e => e.result.result).join("\n")).toContain('QuantityAtMost');
+    }
+  });
+  // @kit text-answers:quantity-thresholds
+  it.each(["milliseconds", "seconds", "'1'", "'s'", "'mm[Hg]'"])("refuses unsupported threshold spelling %s with supported unit guidance", spelling => {
+    const parsed = buildCRL(quantityThresholdSource("ms", "at most", 120).replace("at most 120 'ms'", `at most 120 ${spelling}`));
+    expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+    const result = prepareSingleLibraryPublication(parsed.result!, options);
+    expect(result.diagnostics.some(d => d.kind === "publication-quantity-unit-unsupported" && d.message.includes("ms"))).toBe(true);
+  });
+  it("keeps wrong result/operand types and nested age producers outside threshold admission", () => {
+    const source = quantityThresholdSource("%", "at most", 55);
+    for (const invalid of [source.replace("value type is boolean", "value type is Quantity"), source.replace("value type is Quantity '%'", "value type is boolean"), source.replace('"Measurement" at most 55 \'%\'', 'age today at most 18 years')]) {
+      const parsed = buildCRL(invalid); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+      expect(prepareSingleLibraryPublication(parsed.result!, options).diagnostics.length).toBeGreaterThan(0);
+    }
+  });
   // REFACTOR:grounded: the source binding repair applies to non-age publications too.
   it("qualifies an uncoded Quantity source across layers", () => {
     const { ast } = prepare(source.replace(/^- code is `height`\.\r?\n/m, ""));
diff --git a/packages/crl/src/emit/tests/questionUnit.test.ts b/packages/crl/src/emit/tests/questionUnit.test.ts
index 4adc32d24..8bd4eeebc 100644
--- a/packages/crl/src/emit/tests/questionUnit.test.ts
+++ b/packages/crl/src/emit/tests/questionUnit.test.ts
@@ -4,6 +4,8 @@ import { join } from "node:path";
 import { tmpdir } from "node:os";
 import { buildCRL } from "../../index";
 import { questionUnitSource } from "../../authoring-kit/questionUnitExample";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
+import { validateCRLImports } from "../../imports/validate";
 import { prepareSingleLibraryPublication } from "../publicationProgram";
 import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
 import { emitCQLImports } from "../../imports/emit";
@@ -39,6 +41,16 @@ function objects(value: unknown): Record<string, any>[] {
   return [value as Record<string, any>, ...Object.values(value).flatMap(v => Array.isArray(v) ? v.flatMap(objects) : objects(v))];
 }
 
+// @kit text-answers:quantity-thresholds-validation
+test.each(["%", "ms"])("ordinary validation accepts both inclusive Quantity operators for %s and rejects a spelled-out unit", unit => {
+  for (const comparison of ["at least", "at most"] as const) {
+    const source = quantityThresholdSource(unit, comparison, 55);
+    expect(validateCRLImports(fixture(source)).validationErrors).toEqual([]);
+    const bad = validateCRLImports(fixture(source.replace(`${comparison} 55 '${unit}'`, `${comparison} 55 milliseconds`)));
+    expect(bad.validationErrors.some(e => e.kind === "use-site-type-mismatch" && e.message.includes("ms"))).toBe(true);
+  }
+});
+
 // @kit text-answers:question-unit
 // REFACTOR:grounded (#328): typed units survive wording edits, not presentation inheritance.
 test("parses a Quantity unit and retains it through a presentation edit", () => {

```

## New file: packages/crl/src/authoring-kit/quantityThresholdExample.ts

```text
// REFACTOR:grounded: synthetic numeric thresholds shared by teaching, CRE, and native sessions.
export function quantityThresholdSource(unit: string, comparison: "at least" | "at most", threshold: number): string {
  return `library "Quantity Threshold Intake".
concept "Measurement":
- shape is Record.
- type is Observation.
- value type is Quantity '${unit}'.
- code is \`measurement\`.
- shape reduction is most recent.
presentation for "Measurement":
- question text is "Enter measurement (${unit})".

concept "Threshold Met":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Measurement" ${comparison} ${threshold} '${unit}'.
- shape reduction is most recent.
activity "Meets": - request CPGTaskRequest. - with \`MEETS\`.
activity "Does Not Meet": - request CPGTaskRequest. - with \`DOES-NOT-MEET\`.
decision "Assessment":
first:
- when "Threshold Met" then recommend activity "Meets".
- otherwise then recommend activity "Does Not Meet".
`;
}

```

## New file: packages/crl/src/authoring-kit/tests/maintenance-quantity-thresholds-paths.txt

```text
docs/CRL-NORTH-STAR.md
docs/typed-intake-answers.md
package-lock.json
package.json
packages/crl-vscode/media/release-notes/README.md
packages/crl-vscode/media/release-notes/catalog.json
packages/crl-vscode/package.json
packages/crl-vscode/src/mcp-server.test.mjs
packages/crl-vscode/src/questionUnit.native.test.mjs
packages/crl/package.json
packages/crl/src/authoring-kit/audit.json
packages/crl/src/authoring-kit/index.ts
packages/crl/src/authoring-kit/navigation.ts
packages/crl/src/authoring-kit/quantityThresholdExample.ts
packages/crl/src/authoring-kit/tests/authoring-kit.test.ts
packages/crl/src/authoring-kit/tests/coverage.md
packages/crl/src/authoring-kit/tests/maintenance-quantity-thresholds-paths.txt
packages/crl/src/authoring-kit/tests/query.test.ts
packages/crl/src/cli/tests/run-mcp-server.test.mjs
packages/crl/src/cql-emitter/emitCQL.ts
packages/crl/src/cql-emitter/renderPublicationQuantity.ts
packages/crl/src/cre/tests/publicationQuantity.test.ts
packages/crl/src/emit/publicationProducer.ts
packages/crl/src/emit/publicationProgram.ts
packages/crl/src/emit/publicationQuantity.ts
packages/crl/src/emit/tests/publicationQuantity.test.ts
packages/crl/src/emit/tests/questionUnit.test.ts

```

## Code review round1
Arms: native vibe-reviewer-crl-emit gpt-6-astra/high and ask_claude anthropic/claude-opus-5/medium. Medium effort retained after initial external plan timeout; exact same request on both arms. Native0C/1I/0N; external0C/6I/6N. Lead dispositions: Accept8/Refine4/Reject1 total13.
Native full response: **0 critical, 1 important, 0 nit.** Correct the kit's error-order claim: index.ts says invalid units/comparators/systems error after normal selection. Candidate validation rejects malformed Quantities before selection (publicationProgram.ts:604, cre/run.ts:959); declared-unit normalization also precedes selection (cre/run.ts:1012). An older malformed or incompatible candidate can fail despite a newer valid answer. Remove the phrase or distinguish candidate validation from comparison of selected value. No implementation defect found in discriminator routing, inclusive arithmetic or shared unit table. Native qualification remains pending; review does not establish success.
External full response:
## Verification notes

I read the diff plus `publicationQuantity.ts`, `renderPublicationQuantity.ts`, `publicationProgram.ts`, `publicationProducer.ts`, `useSiteTypeValidator.ts`, `renderPublicationSelection.ts`, `renderQuantityType.ts`, `renderPublicationBMI.ts`, `patternCatalog.ts`, `matcher.ts` hits. The core mechanism checks out: `comparison` is a required field (no default at the descriptor), `readPublicationThreshold` gates on `AtLeast|AtMost` only, both TS and the emitted CQL now route off the same discriminator, and the CQL factor/group arms are generated from `PUBLICATION_QUANTITY_UNITS` so the two lanes can no longer drift on unit membership. Unknown/error ordering matches between lanes (`value is null` → unknown first, then precision, then group), and comparator/system/blank-unit errors are raised earlier in both lanes (`readPublicationQuantity` / `PUBLICATION_LOCAL_QUANTITY_CANDIDATE`), so the new `%`/`ms` arms don't open a new three-state hole. Findings below are what I'd change.

---

**1. [important] `at most` makes zero and negative measurements affirmative, and nothing guards them.** `comparePublicationQuantity` has no positivity check, unlike `renderPublicationBMI.ts:validate` which errors `publication-bmi-nonpositive` on `<= 0`. For `at least` a junk `0` produced `false` (the conservative side); for `at most 55 '%'` a `0` — or a negative — produces `true` → "Meets". The new native test pins exactly this (`for (const value of [..., 0])` with `value <= threshold`), i.e. the behavior is being frozen by a test rather than decided. Decide explicitly: is a nonpositive measurement a legal datum for a threshold comparison, or an error (as it is for BMI)? If it is legal, say so in the charter clause, because "inclusive upper bound satisfied by an impossible value" is a determination a KE will not predict from the authored text. Note the north-star BMI paragraph already states "Current arithmetic admits positive kg/g and m/cm measurements" — threshold comparisons now visibly disagree with that neighbour.

**2. [important] The kit clause's "error after normal selection" is wrong in both lanes, and the difference is behavioral.** New clause in `index.ts`: *"Selected unsupported units, raw unitless numeric values, comparators and invalid systems error after normal selection"*. With a declared `value type is Quantity '%'`, an incompatible unit errors in `__CRL_PublicationQuantityType_v1_Value` (`renderQuantityType.ts:21`) — i.e. during normalization, *before* selection — and a comparator errors in `PUBLICATION_LOCAL_QUANTITY_CANDIDATE` (`renderPublicationSelection.ts:53`), also before selection. That is not a wording nit: error-before-selection means one bad historical record fails the whole concept, where "after selection" would imply a newer valid candidate could out-select it. Authors need the true rule.

**3. [important] The native incompatible-unit case does not exercise the threshold comparison's unit guard at all.** `questionUnit.native.test.mjs` sends `code: '1'`/`'s'` against a concept declaring `Quantity '%'`/`'ms'`, so `__CRL_PublicationQuantityType_v1_Value` raises `publication-quantity-unit-unsupported` first; the assertion `diagnostics).toContain('publication-quantity-unit-unsupported')` passes via normalization, never reaching `__CRL_PublicationProducer_v1_QuantityAtMost`'s group check. The comment "never false or an implicit conversion" is true, but the new CQL group arms for `%`/`ms` are only reached on the matching-unit path. If you want native evidence that the comparison's own unit guard holds, you need an operand without a declared unit (the shared example always declares one). At minimum, don't let `coverage.md` imply the comparison guard was natively proven.

**4. [important] The partitioned-emit assertion is vacuous, and `coverage.md` claims coverage it doesn't have.** `publicationQuantity.test.ts:67` asserts `partitioned...toContain('QuantityAtMost')` inside the loop over *both* comparisons — but both helpers are now emitted unconditionally, so the string is present for `at least` too. Nothing verifies that the partitioned/layered path emits the `QuantityAtMostCandidate` *call*. Meanwhile the row says "Ordinary preparation/emission covers both operators/%/ms/kg/m2 direct+partitioned". Fix the assertion to the candidate call site (as `direct.result` does), or drop the "+partitioned" claim. The CRE imported-owner case has the same gap: it asserts `cql.success` only, never that the imported closure emitted the at-most call.

**5. [important] "one unit table governs CRE and native comparisons" is only half true — `renderQuantityType.ts` still carries a second, hand-written table.** The new comment in `renderPublicationQuantity.ts:15` states the invariant, but `renderQuantityType.ts:6-23` hardcodes `m/cm/kg/g` factors and its own compatibility pairs (`in { 'm','cm' }` / `in { 'kg','g' }`), while the TS side of *the same operation* (`normalizePublicationQuantity`) reads the shared `units` table via `publicationQuantityUnitsCompatible`. Today nothing diverges, because `%` and `ms` are singleton groups handled by the same-unit branch. But the next unit added to `PUBLICATION_QUANTITY_UNITS` with a non-unit factor (say `mg` in the mass group) would immediately be convertible in TS/CRE and rejected in emitted CQL. If you are going to assert the single-table invariant in a code comment, generate the normalization factor/compat arms from it too, or weaken the comment to "the comparison helpers".

**6. [important] Exclusive bounds are the obvious next author request and the refusal diagnostic doesn't name the gap.** `under`/`younger than` → `Below`, `Exceeds` — none are admitted by `readPublicationThreshold`, so `definition is "LVEF" under 55 '%'` falls through to `publicationAdmissionReason`'s generic *"Supported production is selected-value presence, selected-value membership, quantity threshold, or body mass index…"*. That message lists "quantity threshold" as supported while silently rejecting the author's threshold, with no pointer to `at least`/`at most`. Given that half of real numeric criteria are strict (`< 55%`, `> 120 ms`), either state the deferral in the charter clause and make the diagnostic name the two admitted spellings, or admit `Below`/`Exceeds` in the same pass — the lowering is one more row in the `comparisons` array.

**7. [nit] `readPublicationThreshold` maps non-exhaustively.** `!["AtLeast","AtMost"].includes(call.pattern)` followed by `call.pattern === "AtMost" ? "at-most" : "at-least"` means a third comparator added to the `includes` list silently becomes `at-least`. A `Record<string, Comparison>` lookup with `undefined` → reject is the fail-closed form this codebase otherwise insists on (`requireReturnShape`, `PatternStage` default).

**8. [nit] The two "rejects the spelled-out unit" assertions are near-tautological.** `questionUnit.test.ts:50` (`e.message.includes("ms")`) and `publicationQuantity.test.ts:75` (`d.message.includes("ms")`) match because `publicationQuantityThresholdError`'s message itself ends `"…kg/m2, %, ms."` — any threshold rejection passes, including one for the wrong reason. Assert on the diagnostic `kind` plus the offending spelling, not on a substring of the supported-unit list.

**9. [nit] The emitted function names are now asymmetric and misleading.** `…_QuantityAtLeast` / `…_QuantityThresholdCandidate` versus `…_QuantityAtMost` / `…_QuantityAtMostCandidate`. A reader of the generated CQL will take `QuantityThresholdCandidate` for the generic entry point. Since you've already accepted byte changes for every existing threshold/BMI consumer (both helper families emitted unconditionally), the compatibility argument for keeping the old name is thin; `…_QuantityAtLeastCandidate` would make the pair legible.

**10. [nit] `producerId` carries neither the comparison nor the threshold.** `["quantityThreshold", 0]` in the portable tuple means flipping `at least` → `at most` on the same concept yields an identical `producerId`/`contributorId` on the inferred candidate. That matches the existing treatment of the threshold value, and within one concept there is one producer so no key collision — but confirm nothing compares or persists these identities across policy versions, because two opposite determinations would be indistinguishable by contributor identity.

**11. [nit] `typed-intake-answers.md` teaches a snippet that isn't the tested example.** The doc writes `definition is "LVEF" at most 55 '%'.`, while the shared generator names the operand `"Measurement"`; `LVEF`/`QRS`/`PR` appear only as navigation aliases. A KE copying the doc line gets an unresolvable operand. Either point the prose at the `quantity-percent-upper-bound` example id or rename the operand in the fragment.

**12. [nit] The charter sentence mixes authoring-time and runtime failures.** *"A selected ratio, unitless numeric value, incompatible unit or unsupported spelled-out time unit errors…"* — a spelled-out time unit is rejected by validation/preparation (`publicationQuantityThresholdError`), never at selection; the other three are runtime datum errors. Separating the two sentences keeps the "what fails when" story readable.

**Verification status.** Native `%`-upper / `ms`-lower sessions and the BMI control are still running; nothing in the native lane is evidence yet. Two of the running test's assertions are the ones most likely to move: `rejects.toThrow('native-error')` for the cross-dimension answer (depends on the engine surfacing `Message(..., true, ...)` as a request error rather than a null) and the unchanged-resubmission equality on extracted observations. Also note the `'%'` unitOption assertion (`display: code`) is an engine/driver-rendering claim, not a CRL claim — a pass there certifies the standard profile-unit mapping only, not any client.

**Counts: 0 critical, 6 important, 6 nit.**

[reviewer cost: 13 turns · $2.28 estimated · 1,459,180↓ + 22,222↑ · effort=medium · anthropic/claude-opus-5]

### Dispositions and implemented response
NativeI1 Accept + externalI2 Accept: remove incorrect selection-order teaching. Canonical kit/charter state candidate validation and declared-unit normalization precede selection; older invalid candidates may fail despite a newer valid answer. Repin actual hash.
ExternalI1 Refine: numeric thresholds intentionally use mathematical order, accepting zero/negative numbers within bounds. No clinical range is inferred; BMI's positivity belongs to BMI calculation, not generic Quantity comparison. Charter/kit/docs explicitly say this; negative case added. Clinical input validation is not invented by this feature.
I3 Accept: typed negative tests prove declared-unit normalization refusal. Add two genuine native calls with NO declared Quantity unit, raw ratio1/s valid Quantities and typed threshold%/ms, to exercise comparison group guard itself. Both carry same-call raw evidence. Existing successful16calls preserved, not replayed.
I4 Accept: remove helper-definition-only assertions. Direct/partitioned/imported closure tests check actual candidate calls excluding define-function lines; partitioned also excludes the opposite candidate call.
I5 Refine: narrow comment to comparison helpers and explicitly retain separately bounded m/cm/kg/g normalization. No present divergence; do not broaden conversion scope for hypothetical future units.
I6 Refine: strict selected-Quantity comparators are outside current inclusive scope. Generic admission diagnostic now names at least or at most, strict under/exceeds negative tests added and docs explicitly refuse replacing strict bounds with inclusive. No unsupported strict comparison is silently approximated.
N7 Accept: explicit AtLeast?at-least, AtMost?at-most, other?undefined mapping, reject undefined. No independent allowlist can silently default a third comparator.
N8 Accept: diagnostic names offending unit and supported quoted UCUM spellings. Negative tests assert exact offending milliseconds/seconds/1/s/mm[Hg] identity plus diagnostic kind, not allowlist substring.
N9 Reject: existing generated helper name is retained deliberately; no actual behavior defect, stable internal callers useful. AtMost helper is explicit. Renaming existing AtLeast candidate offers no operator behavior improvement.
N10 Refine: producer identity identifies the authored contribution slot, not expression content/runtime fingerprint. portableTuple includes canonical base, policy identity, library, package name/version and concept; current-program candidate key adds operand identity. This matches other producer families. No cross-version result equivalence is inferred from contributorId; native evidence/runtime bindings are separate. No key collision or requested persistence redesign established.
N11 Accept: use Measurement fragment matching shared source and refer to complete tested kit example IDs; no orphan LVEF reference is taught.
N12 Accept: distinguish authoring-time unit spelling rejection from runtime datum validation and candidate ordering.

### Additional proof / correction
Both new native sessions PASSED: %atMost55 and msatLeast120, each8calls (7successful +1expected native-error), with actual unitOptions/activities/observations/repeat/clear assertions. Existing BMI control initially failed driver-unavailable/class-missing because lead overlapped a dist rebuild; preserved originals, reran ONLY control after serial build with separate receipt root. Retry PASSED; 6targetedtests passed (BMI+5MCP),42unselectedskips. Original37extensionMCP tests passed; core real stdio smoke passed. Core9files356passed after error-order/hash and direct-call assertion correction. New strict-spelling/candidate-call tests and2untyped native guards require final checks below. No Linux/client/customer qualification claimed.

## Round2 follow-up scope
Review current relevant source plus the following exact baseline diff; other round1 paths unchanged except generated kit pins/coverage progress. Canonical kit schema2.49 final current hash6d744cb6392133798d5af7ada073af979fc032f562373d7e91d73fdbcaae3544. Audit remains pending until reviewed content commit. New native guard executions and final test results will be appended; do not claim their success until measured.


```diff
diff --git a/docs/CRL-NORTH-STAR.md b/docs/CRL-NORTH-STAR.md
index 8880d7600..1862392a3 100644
--- a/docs/CRL-NORTH-STAR.md
+++ b/docs/CRL-NORTH-STAR.md
@@ -167,15 +167,22 @@ for the request/clear contract and native FHIR parser boundary. Quantity presenc
 Quantity measurements can use explicit Record/Observation publication with `shape reduction is most recent`.
 An Observation source preserves its Quantity and effectiveDateTime while projecting the analytical identity.
 A local code adds an answer representation; an uncoded source calculation does not invent a question.
-The unary `definition is "Measurement" at least N 'unit'` producer publishes a Boolean Observation and
+The unary `definition is "Measurement" at least N 'unit'` or `at most N 'unit'` producer publishes a Boolean Observation and
 inherits the selected operand's actual optional validity. No operand produces no candidate; a selected
 operand with no numeric value produces an unknown-valued candidate. Final selection remains separate.
 Quantity code determines unit identity when present; display unit does not override it. The existing CEL
 unit-only representation is supported. Supplied systems must be UCUM with a code; comparator quantities
-are not exact measurements. This comparison currently supports m/cm, kg/g and kg/m2, magnitude at most
+are not exact measurements. Inclusive comparisons currently support m/cm, kg/g, kg/m2, same-unit % and same-unit ms, magnitude at most
 10^6 and at most eight decimal places, with exact decimal unit-factor comparison. This is a bounded
 implementation domain, not a clinical range. It does not recover unsupported lexical precision already
-lost in a caller's numeric parsing.
+lost in a caller's numeric parsing. Use quoted UCUM codes, for example `55 '%'` and `120 'ms'`.
+There is no ratio `1` to percent scaling or seconds to milliseconds conversion. Unsupported units,
+unitless numeric values, comparators and invalid systems error rather than silently becoming false or
+unknown. Candidate validation and declared-unit normalization precede selection. Integer unit factors
+preserve the eight-place native decimal domain. Threshold comparisons accept zero and negative
+values as numbers; they add no clinical plausibility range. Selected-Quantity strict less-than/greater-than
+producers remain unsupported; do not substitute an inclusive bound for a strict policy cutoff.
+Unsupported authored unit spellings fail validation/preparation; invalid datum errors occur at runtime.
 
 BMI production uses `definition is body mass index of "Weight" and "Height" using validity of "Weight"`.
 Both operands must be selected Quantity publications; the validity operand must name one of them.
diff --git a/docs/typed-intake-answers.md b/docs/typed-intake-answers.md
index 84a168d4e..6692ea729 100644
--- a/docs/typed-intake-answers.md
+++ b/docs/typed-intake-answers.md
@@ -108,4 +108,4 @@ Use a selected Record/Observation with value type is Quantity, its local code is
 
 For optional evidence, use one compound presence guard and the same review activity in otherwise, as in numeric-intake-reference.crl and its paired CEL. For source-required completion, a single unqualified when branch may recommend the result only when all required presence predicates are true. With blank numeric fields it recommends no activity; the predicate is false, which is distinct from a null-condition pause. Do not invent a zero threshold or a clinical eligibility condition to collect counts. Test the question set, outcome, and actual Quantity input/export/clear separately.
 
-Quantity thresholds retain their current bounded comparison units (m, cm, kg, g, kg/m2). Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. Their bounds do not restrict unit identities used only for Quantity presence.
+Selected Quantity thresholds use inclusive `at least` (>=) and `at most` (<=), with bounded comparison units m, cm, kg, g, kg/m2, %, and ms. Declare `value type is Quantity '%'.` and derive `definition is "Measurement" at most 55 '%'.` for an inclusive upper bound; use `Quantity 'ms'` and `at least 120 'ms'` for a lower bound in milliseconds. See the complete shared quantity-percent-upper-bound and quantity-ms-lower-bound examples in the authoring kit. These fragments describe numeric syntax, not clinical recommendations. Numeric comparisons accept zero and negative values; they add no clinical plausibility range. Strict selected-Quantity less-than/greater-than producers remain unsupported; do not substitute an inclusive cutoff. Percent and milliseconds compare only with the same unit; ratio `1` is not percent and `s` is not converted to `ms`. Use the quoted UCUM code `'ms'`, not the bare word `milliseconds`. Unsupported selected units and unitless numeric answers error; missing/valueless answers remain unknown. Comparison magnitude is at most 10^6 with at most eight decimal places. Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. These bounds do not restrict unit identities used only for Quantity presence. Percent/ms thresholds and selected-Quantity `at most` are source capabilities pending release; CRL6.4.54 does not support them.
diff --git a/packages/crl-vscode/src/questionUnit.native.test.mjs b/packages/crl-vscode/src/questionUnit.native.test.mjs
index f4bc16c75..c137d0056 100644
--- a/packages/crl-vscode/src/questionUnit.native.test.mjs
+++ b/packages/crl-vscode/src/questionUnit.native.test.mjs
@@ -7,6 +7,7 @@ import { tmpdir } from 'node:os';
 import { emitCrlBundle, produceResults } from '@smile-digital-health/crl';
 import { applySession } from '@smile-digital-health/crl/session';
 import { questionUnitSource } from '../../crl/src/authoring-kit/questionUnitExample';
+import { quantityThresholdSource } from '../../crl/src/authoring-kit/quantityThresholdExample';
 import { InteractiveSession, nativeInteractiveRunner, readInteractiveResult, interactiveRequest } from './interactiveQuestionnaire';
 
 const enabled = process.env.CRL_QUESTION_UNIT_NATIVE === '1';
@@ -52,6 +53,45 @@ async function answer(session, quantity, minute) {
  return session.evaluate(qr);
 }
 
+// @kit text-answers:quantity-thresholds-native
+it.skipIf(!enabled).each([['%', 'at most', 55], ['ms', 'at least', 120]])('native threshold %s %s preserves exact boundaries, repeated answers and clear', async (code, comparison, threshold) => {
+ const f = fixture(quantityThresholdSource(code, comparison, threshold));
+ try {
+  const session = interview(f, code === '%' ? 'percent-upper' : 'milliseconds-lower');
+  const start = await session.evaluate(); outcome(start, null);
+  expect(observations(start)).toHaveLength(0);
+  expect(unit(quantities(start)[0])).toEqual([{ system: 'http://unitsofmeasure.org', code, display: code }]);
+  let minute = 1;
+  for (const value of [threshold - 0.00000001, threshold, threshold + 0.00000001, 0]) {
+   const result = await answer(session, { value, code, unit: code, system: 'http://unitsofmeasure.org' }, minute++);
+   outcome(result, (comparison === 'at most' ? value <= threshold : value >= threshold) ? 'Meets' : 'Does Not Meet');
+   expect(observations(result).at(-1).valueQuantity).toMatchObject({ value, code, system: 'http://unitsofmeasure.org' });
+  }
+  const saved = structuredClone(observations(session.result));
+  const repeated = await session.evaluate(structuredClone(session.result.response));
+  expect(observations(repeated)).toEqual(saved);
+  outcome(repeated, comparison === 'at most' ? 'Meets' : 'Does Not Meet');
+  const clear = await answer(session, null, minute++); outcome(clear, null);
+  expect(observations(clear).at(-1)).not.toHaveProperty('valueQuantity');
+  expect(unit(quantities(clear)[0])[0].code).toBe(code);
+  // The wrong dimension is an error, never false or an implicit conversion.
+  await expect(answer(session, { value: 0.55, code: code === '%' ? '1' : 's', system: 'http://unitsofmeasure.org' }, minute++)).rejects.toThrow('native-error');
+  expect(JSON.stringify(session.qualificationReceipts.at(-1).diagnostics)).toContain('publication-quantity-unit-unsupported');
+ } finally { rmSync(f.root, { recursive: true, force: true }); }
+}, 300000);
+
+// @kit text-answers:quantity-thresholds-native-unit-guard
+it.skipIf(!enabled).each([['%', 'at most', 55, '1'], ['ms', 'at least', 120, 's']])('native threshold %s %s rejects incompatible units without declared-type normalization', async (code, comparison, threshold, wrongUnit) => {
+ const f = fixture(quantityThresholdSource(code, comparison, threshold).replace(`Quantity '${code}'`, 'Quantity'));
+ try {
+  const system = f.bundle.entry.map(e => e.resource).find(r => r.resourceType === 'CodeSystem' && r.concept?.some(c => c.code === 'measurement')).url;
+  const raw = { resourceType: 'Observation', id: 'wrong-unit', status: 'final', subject: { reference: 'Patient/p' }, code: { coding: [{ system, code: 'measurement' }] }, valueQuantity: { value: 0.55, system: 'http://unitsofmeasure.org', code: wrongUnit, unit: wrongUnit } };
+  const session = interview(f, code === '%' ? 'percent-untyped-unit-error' : 'milliseconds-untyped-unit-error', [raw]);
+  await expect(session.evaluate()).rejects.toThrow('native-error');
+  expect(JSON.stringify(session.qualificationReceipts.at(-1).diagnostics)).toContain('publication-quantity-unit-unsupported');
+ } finally { rmSync(f.root, { recursive: true, force: true }); }
+}, 120000);
+
 // @kit text-answers:question-unit-native-session
 it.skipIf(!enabled)('declared BMI default survives native Start, untouched, number entry, change, clear and repeated applies', async () => {
  const f = fixture(); try {
diff --git a/packages/crl/src/cql-emitter/renderPublicationQuantity.ts b/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
index 4cbaa655e..2a58a261e 100644
--- a/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
+++ b/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
@@ -1,26 +1,33 @@
 import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";
 import { PUBLICATION_PRODUCER_FUNCTIONS } from "./renderPublicationProducer";
+import { PUBLICATION_QUANTITY_UNITS } from "../emit/publicationQuantity";
 
 export const QUANTITY_CQL = {
   unit: "__CRL_PublicationProducer_v1_QuantityUnit", factor: "__CRL_PublicationProducer_v1_QuantityFactor",
   group: "__CRL_PublicationProducer_v1_QuantityGroup", compare: "__CRL_PublicationProducer_v1_QuantityAtLeast",
   candidate: "__CRL_PublicationProducer_v1_QuantityThresholdCandidate",
+  compareAtMost: "__CRL_PublicationProducer_v1_QuantityAtMost",
+  candidateAtMost: "__CRL_PublicationProducer_v1_QuantityAtMostCandidate",
 };
 export function renderPublicationThresholdHelpers(): string {
   const n = QUANTITY_CQL;
+  // REFACTOR:grounded: one unit table governs the CRE/native comparison helpers; no fractional factors.
+  // Declared-type cross-unit normalization remains separately bounded to m/cm and kg/g.
+  const entries = Object.entries(PUBLICATION_QUANTITY_UNITS);
+  const comparisons = [[n.compare, n.candidate, ">="], [n.compareAtMost, n.candidateAtMost, "<="]];
   return `define function "${n.unit}"(Q FHIR.Quantity): Coalesce(Q.code.value, Q.unit.value)
 define function "${n.factor}"(unit System.String):
-  case unit when 'kg' then 1000.0 when 'm' then 100.0 when 'g' then 1.0 when 'cm' then 1.0 when 'kg/m2' then 1.0 else null as System.Decimal end
+  case unit ${entries.map(([unit, spec]) => `when '${unit}' then ${spec.factor}.0`).join(" ")} else null as System.Decimal end
 define function "${n.group}"(unit System.String):
-  case when unit in { 'kg', 'g' } then 'mass' when unit in { 'm', 'cm' } then 'length' when unit = 'kg/m2' then 'bmi' else null as System.String end
-define function "${n.compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
+  case unit ${entries.map(([unit, spec]) => `when '${unit}' then '${spec.group}'`).join(" ")} else null as System.String end
+${comparisons.map(([compare, candidate, operator]) => `define function "${compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
   if Q.value.value is null then null as System.Boolean
   else if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8) then
     Message(null as System.Boolean, true, 'publication-quantity-precision-unsupported', 'Error', 'Quantity comparison supports magnitude at most 10^6 and at most eight decimal places')
   else if "${n.group}"("${n.unit}"(Q)) is null or "${n.group}"("${n.unit}"(Q)) != "${n.group}"(unit) then
     Message(null as System.Boolean, true, 'publication-quantity-unit-unsupported', 'Error', 'Quantity comparison requires compatible supported units')
-  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) >= threshold * "${n.factor}"(unit)
-define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
+  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) ${operator} threshold * "${n.factor}"(unit)
+define function "${candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
   profile System.String, threshold System.Decimal, unit System.String, conceptId System.String, subjectReference System.String):
   if operand.state = 'failed' then
     Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, operand.failureCode, 'Error', operand.failureMessage)
@@ -28,7 +35,7 @@ define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE
   else Tuple {
     key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
     contributorId: producerId, arm: 'inferred', retrievedInputIdentity: null as System.String,
-    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${n.compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
+    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
     validity: operand.selected.validity
-  }`;
+  }`).join("\n")}`;
 }
diff --git a/packages/crl/src/cre/tests/publicationQuantity.test.ts b/packages/crl/src/cre/tests/publicationQuantity.test.ts
index 11307ee0e..8d3b319d3 100644
--- a/packages/crl/src/cre/tests/publicationQuantity.test.ts
+++ b/packages/crl/src/cre/tests/publicationQuantity.test.ts
@@ -7,9 +7,38 @@ import { emitCelToFhir } from "../../cel/emitter/emitFhir";
 import { runCel } from "../run";
 import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
 import { emitCQLImports } from "../../imports/emit";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
 
 // REFACTOR:grounded (#320, plan587): actual CEL quantities drive the selected-value comparison.
 describe("Quantity publication CEL/CRE", () => {
+  // @kit text-answers:quantity-thresholds-cre
+  it.each(["%", "ms"])("runs both inclusive operators with native unit identities and imported owners for %s", unit => {
+    const dir = mkdtempSync(path.join(os.tmpdir(), "crl-threshold-"));
+    try {
+      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "quantity-threshold", version: "0.0.0", crl: { canonicalBase: "https://example.org/quantity-threshold", date: "2026-11-18" } }));
+      const crl = path.join(dir, "policy.crl"), cel = path.join(dir, "cases.cel");
+      for (const comparison of ["at least", "at most"] as const) for (const imported of [false, true]) {
+        const source = quantityThresholdSource(unit, comparison, 55);
+        const start = source.indexOf('concept "Threshold Met":');
+        writeFileSync(crl, imported ? 'library "Quantity Threshold Intake".\n' + source.slice(start).replace('"Measurement"', '"Measurements"."Measurement"') : source);
+        const owner = imported ? "Measurements" : "Quantity Threshold Intake";
+        if (imported) writeFileSync(path.join(dir, "measurements.crl"), source.slice(0, start).replace('library "Quantity Threshold Intake".', 'library "Measurements".'));
+        const rows = [["Below", 54.99999999], ["Equal", 55], ["Above", 55.00000001], ["Zero", 0]] as const;
+        writeFileSync(cel, `library "Cases". covers "Quantity Threshold Intake".\nfact "P": - defined by "Patient".\n` + rows.map(([name, value]) => `fact "${name}": - defined by "${owner}"."Measurement". - value is ${value} '${unit}'.\ncase "${name}": - subject is "P". - fact is "${name}". - result is "Assessment" is "${(comparison === "at most" ? value <= 55 : value >= 55) ? "Meets" : "Does Not Meet"}".\n`).join("") + 'case "Missing": - subject is "P". - result is "Assessment" is pause.\n');
+        const context = resolveCelImports(cel), data = emitCelToFhir(context), run = runCel(context);
+        expect(data.diagnostics.filter(d => d.severity === "error")).toEqual([]);
+        expect(JSON.stringify(data)).toContain(`"code":"${unit}"`);
+        expect(run.errors).toEqual([]);
+        expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(Array.from({ length: 5 }, () => ({ status: "pass", diagnostics: [] })));
+        const cql = emitCQLImports(crl); expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
+        const calls = cql.cqlByLibrary.map(l => l.cql).join("\n").split("\n").filter(line => !line.startsWith("define function ")).join("\n");
+        expect(calls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+        if (!imported) continue;
+        // Remove the imported library before the next local iteration; no duplicate owner.
+        rmSync(path.join(dir, "measurements.crl"));
+      }
+    } finally { rmSync(dir, { recursive: true, force: true }); }
+  });
   // @kit source-representation:quantity-cel-outcomes
   it("preserves unit-only CEL quantities, computes determinate outcomes and pauses on absence", () => {
     const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent,"crl-quantity-"));
diff --git a/packages/crl/src/emit/publicationProgram.ts b/packages/crl/src/emit/publicationProgram.ts
index fd1719cd7..bc529adef 100644
--- a/packages/crl/src/emit/publicationProgram.ts
+++ b/packages/crl/src/emit/publicationProgram.ts
@@ -78,6 +78,7 @@ export interface PublicationThresholdProducer {
   readonly producerId: string;
   readonly operand: QualifiedConceptIdentity;
   readonly threshold: { readonly value: number; readonly unit: string };
+  readonly comparison: "at-least" | "at-most";
 }
 
 // REFACTOR:grounded (#320, plan589): ordered dependencies and validity are distinct.
@@ -103,14 +104,16 @@ export function publicationProducerOperands(p: PublicationProducer | undefined):
 }
 
 // REFACTOR:grounded (#320, plan587): unary comparison contributes its own Boolean record.
-export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; location: Location } | undefined {
+export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; comparison: "at-least" | "at-most"; location: Location } | undefined {
   if (concept.definition?.type !== "DefinitionIsDefinition") return undefined;
   const call = matchNarrative(concept.definition.body);
-  if (!call.known || call.pattern !== "AtLeast" || call.args.length !== 2) return undefined;
+  if (!call.known || call.args.length !== 2) return undefined;
+  const comparison = call.pattern === "AtLeast" ? "at-least" : call.pattern === "AtMost" ? "at-most" : undefined;
+  if (comparison === undefined) return undefined;
   const [operand, threshold] = call.args;
   if (operand.type !== "ConceptRefArg" || threshold.type !== "QuantityArg") return undefined;
   return { operand: operand.library === undefined ? operand.value : { type: "QualifiedReference", libraryName: operand.library, name: operand.value, location: operand.location },
-    threshold: { value: threshold.value, unit: threshold.unit }, location: call.location };
+    threshold: { value: threshold.value, unit: threshold.unit }, comparison, location: call.location };
 }
 
 // REFACTOR:grounded (#322): only the exact unary selected-value presence form is admitted.
@@ -214,7 +217,7 @@ export function publicationAdmissionReason(concept: Readonly<Concept>): string |
   // REFACTOR:grounded (#320, plan585): an age calculation needs no invented answer identity.
   if (concept.code === undefined && hasValue === undefined && membership === undefined && threshold === undefined && bmi === undefined && anyMembership === undefined && concept.representations.length === 0) return "A publication requires a local code or an admitted producer/source.";
   if (concept.definition !== undefined && hasValue === undefined && membership === undefined && threshold === undefined && bmi === undefined && anyMembership === undefined)
-    return "Supported production is selected-value presence, selected-value membership, quantity threshold, or body mass index with an explicit validity operand; other definitions cannot be ignored.";
+    return "Supported production is selected-value presence, selected-value membership, Quantity at least or at most thresholds, or body mass index with an explicit validity operand; other definitions cannot be ignored.";
   const sourceReason = publicationSourceAdmissionReason(concept);
   if (sourceReason !== undefined) return sourceReason;
   if (hasValue !== undefined && concept.valueTypes[0] !== "boolean") return "Has-value produces an Observation with a boolean value.";
@@ -470,7 +473,7 @@ export function preparePublicationProgram(declarations: PublicationContext): Pub
           return fail(thresholdError, comparison.location, "publication-quantity-unit-unsupported");
         checkQuestionUnit(hit.library, hit.node, comparison.threshold.unit, `quantity threshold in "${library.libraryName}"."${concept.name}"`, comparison.location);
         producer = Object.freeze({ kind: "quantityThreshold", producerId: `crl:producer:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["quantityThreshold", 0]]))}`,
-          operand: operand.identity, threshold: Object.freeze(comparison.threshold) });
+          operand: operand.identity, threshold: Object.freeze(comparison.threshold), comparison: comparison.comparison });
       }
       // REFACTOR:grounded (#320, plan589): prepare both selected inputs and resolve anchor identity.
       const bmi = readPublicationBMI(concept);
diff --git a/packages/crl/src/emit/publicationQuantity.ts b/packages/crl/src/emit/publicationQuantity.ts
index 3760e3ced..882154504 100644
--- a/packages/crl/src/emit/publicationQuantity.ts
+++ b/packages/crl/src/emit/publicationQuantity.ts
@@ -21,11 +21,15 @@ export function readPublicationQuantity(value: unknown): PublicationQuantityValu
   return { kind: "known", value: q.value, unit };
 }
 
-const units: Record<string, { group: string; factor: bigint }> = {
+// Integer factors preserve the eight-place decimal domain in emitted CQL as well as TS.
+export const PUBLICATION_QUANTITY_UNITS: Readonly<Record<string, { readonly group: string; readonly factor: bigint }>> = Object.freeze({
   m: { group: "length", factor: 100n }, cm: { group: "length", factor: 1n },
   kg: { group: "mass", factor: 1000n }, g: { group: "mass", factor: 1n },
   "kg/m2": { group: "bmi", factor: 1n },
-};
+  "%": { group: "percentage", factor: 1n },
+  ms: { group: "milliseconds", factor: 1n },
+});
+const units = PUBLICATION_QUANTITY_UNITS;
 /** REFACTOR:grounded (#328): reuse the actual comparison domain; metadata adds no conversions. */
 export function publicationQuantityUnitsCompatible(a: string, b: string): boolean {
   return a === b || Object.prototype.hasOwnProperty.call(units, a) && Object.prototype.hasOwnProperty.call(units, b) && units[a].group === units[b].group;
@@ -43,21 +47,34 @@ export function isPublicationComparisonDecimal(value: number): boolean {
 }
 /** The same authored threshold admission is used by validation and executable preparation. */
 export function publicationQuantityThresholdError(threshold: { value: number; unit: string }): string | undefined {
-  return !isPublicationComparisonDecimal(threshold.value) || !Object.prototype.hasOwnProperty.call(units, threshold.unit)
-    ? "Quantity threshold requires a finite value and a supported unit: m, cm, kg, g, kg/m2."
-    : undefined;
+  if (!isPublicationComparisonDecimal(threshold.value)) return "Quantity threshold requires a finite value with magnitude at most 10^6 and at most eight decimal places.";
+  return Object.prototype.hasOwnProperty.call(units, threshold.unit) ? undefined
+    : `Quantity threshold unit '${threshold.unit}' is unsupported. Use a supported quoted UCUM code: ${Object.keys(units).map(unit => `'${unit}'`).join(", ")}.`;
 }
 export function publicationQuantityAtLeast(value: unknown, threshold: { value: number; unit: string }):
+  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
+  return comparePublicationQuantity(value, threshold, "at-least");
+}
+
+// REFACTOR:grounded (quantity thresholds): inclusive operators share exact unit-aware arithmetic.
+export function publicationQuantityAtMost(value: unknown, threshold: { value: number; unit: string }):
+  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
+  return comparePublicationQuantity(value, threshold, "at-most");
+}
+
+function comparePublicationQuantity(value: unknown, threshold: { value: number; unit: string }, comparison: "at-least" | "at-most"):
   { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
   const q = readPublicationQuantity(value);
   if (q.kind !== "known") return q;
   if (!isPublicationComparisonDecimal(q.value) || !isPublicationComparisonDecimal(threshold.value))
     return { kind: "error", code: "publication-quantity-precision-unsupported", message: "Quantity comparison supports magnitude at most 10^6 and at most eight decimal places." };
-  const a = units[q.unit], b = units[threshold.unit];
+  const a = Object.prototype.hasOwnProperty.call(units, q.unit) ? units[q.unit] : undefined;
+  const b = Object.prototype.hasOwnProperty.call(units, threshold.unit) ? units[threshold.unit] : undefined;
   if (a === undefined || b === undefined || a.group !== b.group)
     return { kind: "error", code: "publication-quantity-unit-unsupported", message: "Quantity comparison requires compatible supported units." };
   const left = publicationDecimal(q.value), right = publicationDecimal(threshold.value);
-  return { kind: "known", value: left.coefficient * a.factor * right.scale >= right.coefficient * b.factor * left.scale };
+  const lhs = left.coefficient * a.factor * right.scale, rhs = right.coefficient * b.factor * left.scale;
+  return { kind: "known", value: comparison === "at-most" ? lhs <= rhs : lhs >= rhs };
 }
 
 /** REFACTOR:grounded (#328): explicit type normalization never changes caller-owned raw data.
diff --git a/packages/crl/src/emit/tests/publicationQuantity.test.ts b/packages/crl/src/emit/tests/publicationQuantity.test.ts
index 40130b599..4b7762e63 100644
--- a/packages/crl/src/emit/tests/publicationQuantity.test.ts
+++ b/packages/crl/src/emit/tests/publicationQuantity.test.ts
@@ -2,7 +2,8 @@ import { describe, expect, it } from "vitest";
 import { buildCRL } from "../../index";
 import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
 import { adaptObservationPublicationCandidate, type PublicationObservationSource } from "../publicationSource";
-import { readPublicationQuantity, publicationQuantityAtLeast } from "../publicationQuantity";
+import { readPublicationQuantity, publicationQuantityAtLeast, publicationQuantityAtMost } from "../publicationQuantity";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
 import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
 import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
 import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
@@ -36,6 +37,58 @@ const measurement = (value: unknown = { value: 200, unit: "cm" }) => ({
   effectiveDateTime: "2026-09-01", ...(value === null ? {} : { valueQuantity: value }),
 });
 describe("Quantity publication", () => {
+  // @kit text-answers:quantity-thresholds
+  it.each(["%", "ms", "m", "kg/m2"])("preserves inclusive lower/upper boundaries and errors for %s", unit => {
+    const threshold = { value: 55, unit };
+    for (const [value, lower, upper] of [[54.99999999, false, true], [55, true, true], [55.00000001, true, false], [0, false, true], [-1, false, true]] as const) {
+      const q = { value, system: "http://unitsofmeasure.org", code: unit, unit: "display is not the code" };
+      expect(publicationQuantityAtLeast(q, threshold)).toEqual({ kind: "known", value: lower });
+      expect(publicationQuantityAtMost(q, threshold)).toEqual({ kind: "known", value: upper });
+    }
+    for (const compare of [publicationQuantityAtLeast, publicationQuantityAtMost]) {
+      expect(compare(null, threshold)).toEqual({ kind: "unknown" });
+      expect(compare({ unit }, threshold)).toEqual({ kind: "unknown" });
+      for (const bad of [{ value: 55 }, { value: 55, unit, system: "other" }, { value: 55, unit, comparator: "<" }, { value: 0.55, unit: "1" }, { value: 1, unit: "s" }, { value: 55, unit: "toString" }, { value: 55, unit: unit === "%" ? "ms" : "%" }, { value: 55.000000001, unit }, { value: 1000001, unit }])
+        expect(compare(bad, threshold).kind, JSON.stringify(bad)).toBe("error");
+    }
+  });
+  // @kit text-answers:quantity-thresholds
+  it.each(["%", "ms", "kg/m2"])("admits and emits exact selected-Quantity comparisons for %s", unit => {
+    for (const comparison of ["at least", "at most"] as const) {
+      const { ast } = prepare(quantityThresholdSource(unit, comparison, 55));
+      const program = prepareSingleLibraryPublication(ast, options);
+      expect(program.descriptors.find(d => d.producer?.kind === "quantityThreshold")?.producer).toMatchObject({ kind: "quantityThreshold", comparison: comparison.replace(" ", "-"), threshold: { value: 55, unit } });
+      const direct = emitCQLFromAST(ast, options);
+      expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
+      expect(direct.result).toContain(`when '${unit}' then 1.0`);
+      const calls = direct.result!.split("\n").filter(line => !line.startsWith("define function ")).join("\n");
+      expect(calls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+      const partitioned = emitPartitioned(lowerLocalCodes(ast, options).ast, "Quantity Threshold Intake", options.policyId, FULL_PARTITION, options);
+      expect(partitioned.success, JSON.stringify(partitioned.errors)).toBe(true);
+      const partitionedCalls = partitioned.entries.map(e => e.result.result).join("\n").split("\n").filter(line => !line.startsWith("define function ")).join("\n");
+      expect(partitionedCalls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+      expect(partitionedCalls).not.toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(');
+    }
+  });
+  // @kit text-answers:quantity-thresholds
+  it.each(["milliseconds", "seconds", "'1'", "'s'", "'mm[Hg]'"])("refuses unsupported threshold spelling %s with supported unit guidance", spelling => {
+    const parsed = buildCRL(quantityThresholdSource("ms", "at most", 120).replace("at most 120 'ms'", `at most 120 ${spelling}`));
+    expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+    const result = prepareSingleLibraryPublication(parsed.result!, options);
+    expect(result.diagnostics.some(d => d.kind === "publication-quantity-unit-unsupported" && d.message.includes(`unit '${spelling.replaceAll("'", "")}' is unsupported`))).toBe(true);
+  });
+  it("keeps wrong result/operand types and nested age producers outside threshold admission", () => {
+    const source = quantityThresholdSource("%", "at most", 55);
+    for (const invalid of [source.replace("value type is boolean", "value type is Quantity"), source.replace("value type is Quantity '%'", "value type is boolean"), source.replace('"Measurement" at most 55 \'%\'', 'age today at most 18 years')]) {
+      const parsed = buildCRL(invalid); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+      expect(prepareSingleLibraryPublication(parsed.result!, options).diagnostics.length).toBeGreaterThan(0);
+    }
+  });
+  it.each(["under", "exceeds"])("names supported inclusive spellings when rejecting strict threshold %s", comparison => {
+    const parsed = buildCRL(quantityThresholdSource("%", "at most", 55).replace("at most", comparison));
+    expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+    expect(prepareSingleLibraryPublication(parsed.result!, options).diagnostics.some(d => d.message.includes("at least or at most"))).toBe(true);
+  });
   // REFACTOR:grounded: the source binding repair applies to non-age publications too.
   it("qualifies an uncoded Quantity source across layers", () => {
     const { ast } = prepare(source.replace(/^- code is `height`\.\r?\n/m, ""));
diff --git a/packages/crl/src/emit/tests/questionUnit.test.ts b/packages/crl/src/emit/tests/questionUnit.test.ts
index 4adc32d24..741b4b0b1 100644
--- a/packages/crl/src/emit/tests/questionUnit.test.ts
+++ b/packages/crl/src/emit/tests/questionUnit.test.ts
@@ -4,6 +4,8 @@ import { join } from "node:path";
 import { tmpdir } from "node:os";
 import { buildCRL } from "../../index";
 import { questionUnitSource } from "../../authoring-kit/questionUnitExample";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
+import { validateCRLImports } from "../../imports/validate";
 import { prepareSingleLibraryPublication } from "../publicationProgram";
 import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
 import { emitCQLImports } from "../../imports/emit";
@@ -39,6 +41,16 @@ function objects(value: unknown): Record<string, any>[] {
   return [value as Record<string, any>, ...Object.values(value).flatMap(v => Array.isArray(v) ? v.flatMap(objects) : objects(v))];
 }
 
+// @kit text-answers:quantity-thresholds-validation
+test.each(["%", "ms"])("ordinary validation accepts both inclusive Quantity operators for %s and rejects a spelled-out unit", unit => {
+  for (const comparison of ["at least", "at most"] as const) {
+    const source = quantityThresholdSource(unit, comparison, 55);
+    expect(validateCRLImports(fixture(source)).validationErrors).toEqual([]);
+    const bad = validateCRLImports(fixture(source.replace(`${comparison} 55 '${unit}'`, `${comparison} 55 milliseconds`)));
+    expect(bad.validationErrors.some(e => e.kind === "use-site-type-mismatch" && e.message.includes("unit 'milliseconds' is unsupported"))).toBe(true);
+  }
+});
+
 // @kit text-answers:question-unit
 // REFACTOR:grounded (#328): typed units survive wording edits, not presentation inheritance.
 test("parses a Quantity unit and retains it through a presentation edit", () => {

```

## Round2 FINAL packet (read this current diff, not earlier proposal)

All13findings dispositioned above. Current implementation keeps generic numeric zero/negative ordering, no clinical domain guesses. New guarded error message names exact unsupported spelling. Strict inclusive-only diagnostic is checked before generic missing-code refusal; no admission semantics broadened. Updated quantityIntake negative assertion pins offending unit+kind instead of old message wording. New untyped native guard tests currently executing after serial clean build; original16new calls and successful BMI retry preserved. Latest schema2.49 hash6d744cb6392133798d5af7ada073af979fc032f562373d7e91d73fdbcaae3544.

Complete tracked changed-file list:
docs/CRL-NORTH-STAR.md
docs/typed-intake-answers.md
packages/crl-vscode/src/mcp-server.test.mjs
packages/crl-vscode/src/questionUnit.native.test.mjs
packages/crl/src/authoring-kit/index.ts
packages/crl/src/authoring-kit/navigation.ts
packages/crl/src/authoring-kit/tests/authoring-kit.test.ts
packages/crl/src/authoring-kit/tests/coverage.md
packages/crl/src/authoring-kit/tests/query.test.ts
packages/crl/src/cli/tests/run-mcp-server.test.mjs
packages/crl/src/cql-emitter/emitCQL.ts
packages/crl/src/cql-emitter/renderPublicationQuantity.ts
packages/crl/src/cre/tests/publicationQuantity.test.ts
packages/crl/src/emit/publicationProducer.ts
packages/crl/src/emit/publicationProgram.ts
packages/crl/src/emit/publicationQuantity.ts
packages/crl/src/emit/tests/publicationQuantity.test.ts
packages/crl/src/emit/tests/quantityIntake.test.ts
packages/crl/src/emit/tests/questionUnit.test.ts

Relevant new untracked source: authoring-kit/quantityThresholdExample.ts and tests/maintenance-quantity-thresholds-paths.txt (contents in round1). Preexisting untracked exclusions unchanged. No additional production changes beyond original round1 and current diff. Canonical kit threshold clause now explicitly says zero/negative numbers are allowed, clinical range is not inferred, strict bounds unsupported, candidate validation/type normalization precede selection. Docs mirror this. Hash repins only change identity.

```diff
diff --git a/docs/CRL-NORTH-STAR.md b/docs/CRL-NORTH-STAR.md
index 8880d7600..1862392a3 100644
--- a/docs/CRL-NORTH-STAR.md
+++ b/docs/CRL-NORTH-STAR.md
@@ -167,15 +167,22 @@ for the request/clear contract and native FHIR parser boundary. Quantity presenc
 Quantity measurements can use explicit Record/Observation publication with `shape reduction is most recent`.
 An Observation source preserves its Quantity and effectiveDateTime while projecting the analytical identity.
 A local code adds an answer representation; an uncoded source calculation does not invent a question.
-The unary `definition is "Measurement" at least N 'unit'` producer publishes a Boolean Observation and
+The unary `definition is "Measurement" at least N 'unit'` or `at most N 'unit'` producer publishes a Boolean Observation and
 inherits the selected operand's actual optional validity. No operand produces no candidate; a selected
 operand with no numeric value produces an unknown-valued candidate. Final selection remains separate.
 Quantity code determines unit identity when present; display unit does not override it. The existing CEL
 unit-only representation is supported. Supplied systems must be UCUM with a code; comparator quantities
-are not exact measurements. This comparison currently supports m/cm, kg/g and kg/m2, magnitude at most
+are not exact measurements. Inclusive comparisons currently support m/cm, kg/g, kg/m2, same-unit % and same-unit ms, magnitude at most
 10^6 and at most eight decimal places, with exact decimal unit-factor comparison. This is a bounded
 implementation domain, not a clinical range. It does not recover unsupported lexical precision already
-lost in a caller's numeric parsing.
+lost in a caller's numeric parsing. Use quoted UCUM codes, for example `55 '%'` and `120 'ms'`.
+There is no ratio `1` to percent scaling or seconds to milliseconds conversion. Unsupported units,
+unitless numeric values, comparators and invalid systems error rather than silently becoming false or
+unknown. Candidate validation and declared-unit normalization precede selection. Integer unit factors
+preserve the eight-place native decimal domain. Threshold comparisons accept zero and negative
+values as numbers; they add no clinical plausibility range. Selected-Quantity strict less-than/greater-than
+producers remain unsupported; do not substitute an inclusive bound for a strict policy cutoff.
+Unsupported authored unit spellings fail validation/preparation; invalid datum errors occur at runtime.
 
 BMI production uses `definition is body mass index of "Weight" and "Height" using validity of "Weight"`.
 Both operands must be selected Quantity publications; the validity operand must name one of them.
diff --git a/docs/typed-intake-answers.md b/docs/typed-intake-answers.md
index 84a168d4e..6692ea729 100644
--- a/docs/typed-intake-answers.md
+++ b/docs/typed-intake-answers.md
@@ -108,4 +108,4 @@ Use a selected Record/Observation with value type is Quantity, its local code is
 
 For optional evidence, use one compound presence guard and the same review activity in otherwise, as in numeric-intake-reference.crl and its paired CEL. For source-required completion, a single unqualified when branch may recommend the result only when all required presence predicates are true. With blank numeric fields it recommends no activity; the predicate is false, which is distinct from a null-condition pause. Do not invent a zero threshold or a clinical eligibility condition to collect counts. Test the question set, outcome, and actual Quantity input/export/clear separately.
 
-Quantity thresholds retain their current bounded comparison units (m, cm, kg, g, kg/m2). Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. Their bounds do not restrict unit identities used only for Quantity presence.
+Selected Quantity thresholds use inclusive `at least` (>=) and `at most` (<=), with bounded comparison units m, cm, kg, g, kg/m2, %, and ms. Declare `value type is Quantity '%'.` and derive `definition is "Measurement" at most 55 '%'.` for an inclusive upper bound; use `Quantity 'ms'` and `at least 120 'ms'` for a lower bound in milliseconds. See the complete shared quantity-percent-upper-bound and quantity-ms-lower-bound examples in the authoring kit. These fragments describe numeric syntax, not clinical recommendations. Numeric comparisons accept zero and negative values; they add no clinical plausibility range. Strict selected-Quantity less-than/greater-than producers remain unsupported; do not substitute an inclusive cutoff. Percent and milliseconds compare only with the same unit; ratio `1` is not percent and `s` is not converted to `ms`. Use the quoted UCUM code `'ms'`, not the bare word `milliseconds`. Unsupported selected units and unitless numeric answers error; missing/valueless answers remain unknown. Comparison magnitude is at most 10^6 with at most eight decimal places. Ordinary CRL validation rejects unsupported authored thresholds as executable preparation does. These bounds do not restrict unit identities used only for Quantity presence. Percent/ms thresholds and selected-Quantity `at most` are source capabilities pending release; CRL6.4.54 does not support them.
diff --git a/packages/crl-vscode/src/questionUnit.native.test.mjs b/packages/crl-vscode/src/questionUnit.native.test.mjs
index f4bc16c75..c137d0056 100644
--- a/packages/crl-vscode/src/questionUnit.native.test.mjs
+++ b/packages/crl-vscode/src/questionUnit.native.test.mjs
@@ -7,6 +7,7 @@ import { tmpdir } from 'node:os';
 import { emitCrlBundle, produceResults } from '@smile-digital-health/crl';
 import { applySession } from '@smile-digital-health/crl/session';
 import { questionUnitSource } from '../../crl/src/authoring-kit/questionUnitExample';
+import { quantityThresholdSource } from '../../crl/src/authoring-kit/quantityThresholdExample';
 import { InteractiveSession, nativeInteractiveRunner, readInteractiveResult, interactiveRequest } from './interactiveQuestionnaire';
 
 const enabled = process.env.CRL_QUESTION_UNIT_NATIVE === '1';
@@ -52,6 +53,45 @@ async function answer(session, quantity, minute) {
  return session.evaluate(qr);
 }
 
+// @kit text-answers:quantity-thresholds-native
+it.skipIf(!enabled).each([['%', 'at most', 55], ['ms', 'at least', 120]])('native threshold %s %s preserves exact boundaries, repeated answers and clear', async (code, comparison, threshold) => {
+ const f = fixture(quantityThresholdSource(code, comparison, threshold));
+ try {
+  const session = interview(f, code === '%' ? 'percent-upper' : 'milliseconds-lower');
+  const start = await session.evaluate(); outcome(start, null);
+  expect(observations(start)).toHaveLength(0);
+  expect(unit(quantities(start)[0])).toEqual([{ system: 'http://unitsofmeasure.org', code, display: code }]);
+  let minute = 1;
+  for (const value of [threshold - 0.00000001, threshold, threshold + 0.00000001, 0]) {
+   const result = await answer(session, { value, code, unit: code, system: 'http://unitsofmeasure.org' }, minute++);
+   outcome(result, (comparison === 'at most' ? value <= threshold : value >= threshold) ? 'Meets' : 'Does Not Meet');
+   expect(observations(result).at(-1).valueQuantity).toMatchObject({ value, code, system: 'http://unitsofmeasure.org' });
+  }
+  const saved = structuredClone(observations(session.result));
+  const repeated = await session.evaluate(structuredClone(session.result.response));
+  expect(observations(repeated)).toEqual(saved);
+  outcome(repeated, comparison === 'at most' ? 'Meets' : 'Does Not Meet');
+  const clear = await answer(session, null, minute++); outcome(clear, null);
+  expect(observations(clear).at(-1)).not.toHaveProperty('valueQuantity');
+  expect(unit(quantities(clear)[0])[0].code).toBe(code);
+  // The wrong dimension is an error, never false or an implicit conversion.
+  await expect(answer(session, { value: 0.55, code: code === '%' ? '1' : 's', system: 'http://unitsofmeasure.org' }, minute++)).rejects.toThrow('native-error');
+  expect(JSON.stringify(session.qualificationReceipts.at(-1).diagnostics)).toContain('publication-quantity-unit-unsupported');
+ } finally { rmSync(f.root, { recursive: true, force: true }); }
+}, 300000);
+
+// @kit text-answers:quantity-thresholds-native-unit-guard
+it.skipIf(!enabled).each([['%', 'at most', 55, '1'], ['ms', 'at least', 120, 's']])('native threshold %s %s rejects incompatible units without declared-type normalization', async (code, comparison, threshold, wrongUnit) => {
+ const f = fixture(quantityThresholdSource(code, comparison, threshold).replace(`Quantity '${code}'`, 'Quantity'));
+ try {
+  const system = f.bundle.entry.map(e => e.resource).find(r => r.resourceType === 'CodeSystem' && r.concept?.some(c => c.code === 'measurement')).url;
+  const raw = { resourceType: 'Observation', id: 'wrong-unit', status: 'final', subject: { reference: 'Patient/p' }, code: { coding: [{ system, code: 'measurement' }] }, valueQuantity: { value: 0.55, system: 'http://unitsofmeasure.org', code: wrongUnit, unit: wrongUnit } };
+  const session = interview(f, code === '%' ? 'percent-untyped-unit-error' : 'milliseconds-untyped-unit-error', [raw]);
+  await expect(session.evaluate()).rejects.toThrow('native-error');
+  expect(JSON.stringify(session.qualificationReceipts.at(-1).diagnostics)).toContain('publication-quantity-unit-unsupported');
+ } finally { rmSync(f.root, { recursive: true, force: true }); }
+}, 120000);
+
 // @kit text-answers:question-unit-native-session
 it.skipIf(!enabled)('declared BMI default survives native Start, untouched, number entry, change, clear and repeated applies', async () => {
  const f = fixture(); try {
diff --git a/packages/crl/src/cql-emitter/renderPublicationQuantity.ts b/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
index 4cbaa655e..2a58a261e 100644
--- a/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
+++ b/packages/crl/src/cql-emitter/renderPublicationQuantity.ts
@@ -1,26 +1,33 @@
 import { PUBLICATION_CANDIDATE_CQL_TYPE, PUBLICATION_SELECTION_RESULT_CQL_TYPE } from "./renderPublicationSelection";
 import { PUBLICATION_PRODUCER_FUNCTIONS } from "./renderPublicationProducer";
+import { PUBLICATION_QUANTITY_UNITS } from "../emit/publicationQuantity";
 
 export const QUANTITY_CQL = {
   unit: "__CRL_PublicationProducer_v1_QuantityUnit", factor: "__CRL_PublicationProducer_v1_QuantityFactor",
   group: "__CRL_PublicationProducer_v1_QuantityGroup", compare: "__CRL_PublicationProducer_v1_QuantityAtLeast",
   candidate: "__CRL_PublicationProducer_v1_QuantityThresholdCandidate",
+  compareAtMost: "__CRL_PublicationProducer_v1_QuantityAtMost",
+  candidateAtMost: "__CRL_PublicationProducer_v1_QuantityAtMostCandidate",
 };
 export function renderPublicationThresholdHelpers(): string {
   const n = QUANTITY_CQL;
+  // REFACTOR:grounded: one unit table governs the CRE/native comparison helpers; no fractional factors.
+  // Declared-type cross-unit normalization remains separately bounded to m/cm and kg/g.
+  const entries = Object.entries(PUBLICATION_QUANTITY_UNITS);
+  const comparisons = [[n.compare, n.candidate, ">="], [n.compareAtMost, n.candidateAtMost, "<="]];
   return `define function "${n.unit}"(Q FHIR.Quantity): Coalesce(Q.code.value, Q.unit.value)
 define function "${n.factor}"(unit System.String):
-  case unit when 'kg' then 1000.0 when 'm' then 100.0 when 'g' then 1.0 when 'cm' then 1.0 when 'kg/m2' then 1.0 else null as System.Decimal end
+  case unit ${entries.map(([unit, spec]) => `when '${unit}' then ${spec.factor}.0`).join(" ")} else null as System.Decimal end
 define function "${n.group}"(unit System.String):
-  case when unit in { 'kg', 'g' } then 'mass' when unit in { 'm', 'cm' } then 'length' when unit = 'kg/m2' then 'bmi' else null as System.String end
-define function "${n.compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
+  case unit ${entries.map(([unit, spec]) => `when '${unit}' then '${spec.group}'`).join(" ")} else null as System.String end
+${comparisons.map(([compare, candidate, operator]) => `define function "${compare}"(Q FHIR.Quantity, threshold System.Decimal, unit System.String):
   if Q.value.value is null then null as System.Boolean
   else if Abs(Q.value.value) > 1000000.0 or Q.value.value != Round(Q.value.value, 8) then
     Message(null as System.Boolean, true, 'publication-quantity-precision-unsupported', 'Error', 'Quantity comparison supports magnitude at most 10^6 and at most eight decimal places')
   else if "${n.group}"("${n.unit}"(Q)) is null or "${n.group}"("${n.unit}"(Q)) != "${n.group}"(unit) then
     Message(null as System.Boolean, true, 'publication-quantity-unit-unsupported', 'Error', 'Quantity comparison requires compatible supported units')
-  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) >= threshold * "${n.factor}"(unit)
-define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
+  else Q.value.value * "${n.factor}"("${n.unit}"(Q)) ${operator} threshold * "${n.factor}"(unit)
+define function "${candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE}, producerId System.String, code FHIR.CodeableConcept,
   profile System.String, threshold System.Decimal, unit System.String, conceptId System.String, subjectReference System.String):
   if operand.state = 'failed' then
     Message(null as ${PUBLICATION_CANDIDATE_CQL_TYPE}, true, operand.failureCode, 'Error', operand.failureMessage)
@@ -28,7 +35,7 @@ define function "${n.candidate}"(operand ${PUBLICATION_SELECTION_RESULT_CQL_TYPE
   else Tuple {
     key: ToString(Length(producerId)) + ':' + producerId + ToString(Length(operand.selected.key)) + ':' + operand.selected.key,
     contributorId: producerId, arm: 'inferred', retrievedInputIdentity: null as System.String,
-    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${n.compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
+    resource: "${PUBLICATION_PRODUCER_FUNCTIONS.construct}"(code, "${compare}"(operand.selected.resource.value as FHIR.Quantity, threshold, unit), profile, operand.selected.resource, subjectReference),
     validity: operand.selected.validity
-  }`;
+  }`).join("\n")}`;
 }
diff --git a/packages/crl/src/cre/tests/publicationQuantity.test.ts b/packages/crl/src/cre/tests/publicationQuantity.test.ts
index 11307ee0e..8d3b319d3 100644
--- a/packages/crl/src/cre/tests/publicationQuantity.test.ts
+++ b/packages/crl/src/cre/tests/publicationQuantity.test.ts
@@ -7,9 +7,38 @@ import { emitCelToFhir } from "../../cel/emitter/emitFhir";
 import { runCel } from "../run";
 import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
 import { emitCQLImports } from "../../imports/emit";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
 
 // REFACTOR:grounded (#320, plan587): actual CEL quantities drive the selected-value comparison.
 describe("Quantity publication CEL/CRE", () => {
+  // @kit text-answers:quantity-thresholds-cre
+  it.each(["%", "ms"])("runs both inclusive operators with native unit identities and imported owners for %s", unit => {
+    const dir = mkdtempSync(path.join(os.tmpdir(), "crl-threshold-"));
+    try {
+      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "quantity-threshold", version: "0.0.0", crl: { canonicalBase: "https://example.org/quantity-threshold", date: "2026-11-18" } }));
+      const crl = path.join(dir, "policy.crl"), cel = path.join(dir, "cases.cel");
+      for (const comparison of ["at least", "at most"] as const) for (const imported of [false, true]) {
+        const source = quantityThresholdSource(unit, comparison, 55);
+        const start = source.indexOf('concept "Threshold Met":');
+        writeFileSync(crl, imported ? 'library "Quantity Threshold Intake".\n' + source.slice(start).replace('"Measurement"', '"Measurements"."Measurement"') : source);
+        const owner = imported ? "Measurements" : "Quantity Threshold Intake";
+        if (imported) writeFileSync(path.join(dir, "measurements.crl"), source.slice(0, start).replace('library "Quantity Threshold Intake".', 'library "Measurements".'));
+        const rows = [["Below", 54.99999999], ["Equal", 55], ["Above", 55.00000001], ["Zero", 0]] as const;
+        writeFileSync(cel, `library "Cases". covers "Quantity Threshold Intake".\nfact "P": - defined by "Patient".\n` + rows.map(([name, value]) => `fact "${name}": - defined by "${owner}"."Measurement". - value is ${value} '${unit}'.\ncase "${name}": - subject is "P". - fact is "${name}". - result is "Assessment" is "${(comparison === "at most" ? value <= 55 : value >= 55) ? "Meets" : "Does Not Meet"}".\n`).join("") + 'case "Missing": - subject is "P". - result is "Assessment" is pause.\n');
+        const context = resolveCelImports(cel), data = emitCelToFhir(context), run = runCel(context);
+        expect(data.diagnostics.filter(d => d.severity === "error")).toEqual([]);
+        expect(JSON.stringify(data)).toContain(`"code":"${unit}"`);
+        expect(run.errors).toEqual([]);
+        expect(run.runs.map(r => ({ status: r.status, diagnostics: r.diagnostics }))).toEqual(Array.from({ length: 5 }, () => ({ status: "pass", diagnostics: [] })));
+        const cql = emitCQLImports(crl); expect(cql.success, JSON.stringify(cql.errors)).toBe(true);
+        const calls = cql.cqlByLibrary.map(l => l.cql).join("\n").split("\n").filter(line => !line.startsWith("define function ")).join("\n");
+        expect(calls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+        if (!imported) continue;
+        // Remove the imported library before the next local iteration; no duplicate owner.
+        rmSync(path.join(dir, "measurements.crl"));
+      }
+    } finally { rmSync(dir, { recursive: true, force: true }); }
+  });
   // @kit source-representation:quantity-cel-outcomes
   it("preserves unit-only CEL quantities, computes determinate outcomes and pauses on absence", () => {
     const parent = path.resolve(os.tmpdir()), dir = mkdtempSync(path.join(parent,"crl-quantity-"));
diff --git a/packages/crl/src/emit/publicationProgram.ts b/packages/crl/src/emit/publicationProgram.ts
index fd1719cd7..7c46bae9f 100644
--- a/packages/crl/src/emit/publicationProgram.ts
+++ b/packages/crl/src/emit/publicationProgram.ts
@@ -78,6 +78,7 @@ export interface PublicationThresholdProducer {
   readonly producerId: string;
   readonly operand: QualifiedConceptIdentity;
   readonly threshold: { readonly value: number; readonly unit: string };
+  readonly comparison: "at-least" | "at-most";
 }
 
 // REFACTOR:grounded (#320, plan589): ordered dependencies and validity are distinct.
@@ -103,14 +104,16 @@ export function publicationProducerOperands(p: PublicationProducer | undefined):
 }
 
 // REFACTOR:grounded (#320, plan587): unary comparison contributes its own Boolean record.
-export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; location: Location } | undefined {
+export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; comparison: "at-least" | "at-most"; location: Location } | undefined {
   if (concept.definition?.type !== "DefinitionIsDefinition") return undefined;
   const call = matchNarrative(concept.definition.body);
-  if (!call.known || call.pattern !== "AtLeast" || call.args.length !== 2) return undefined;
+  if (!call.known || call.args.length !== 2) return undefined;
+  const comparison = call.pattern === "AtLeast" ? "at-least" : call.pattern === "AtMost" ? "at-most" : undefined;
+  if (comparison === undefined) return undefined;
   const [operand, threshold] = call.args;
   if (operand.type !== "ConceptRefArg" || threshold.type !== "QuantityArg") return undefined;
   return { operand: operand.library === undefined ? operand.value : { type: "QualifiedReference", libraryName: operand.library, name: operand.value, location: operand.location },
-    threshold: { value: threshold.value, unit: threshold.unit }, location: call.location };
+    threshold: { value: threshold.value, unit: threshold.unit }, comparison, location: call.location };
 }
 
 // REFACTOR:grounded (#322): only the exact unary selected-value presence form is admitted.
@@ -211,10 +214,10 @@ export function publicationAdmissionReason(concept: Readonly<Concept>): string |
   const bmi = readPublicationBMI(concept);
   const anyMembership = readPublicationAnyMembership(concept);
   if (concept.code !== undefined && concept.code.trim().length === 0) return "A local `code is` must be nonempty.";
+  if (concept.definition !== undefined && hasValue === undefined && membership === undefined && threshold === undefined && bmi === undefined && anyMembership === undefined)
+    return "Supported production is selected-value presence, selected-value membership, Quantity at least or at most thresholds, or body mass index with an explicit validity operand; other definitions cannot be ignored.";
   // REFACTOR:grounded (#320, plan585): an age calculation needs no invented answer identity.
   if (concept.code === undefined && hasValue === undefined && membership === undefined && threshold === undefined && bmi === undefined && anyMembership === undefined && concept.representations.length === 0) return "A publication requires a local code or an admitted producer/source.";
-  if (concept.definition !== undefined && hasValue === undefined && membership === undefined && threshold === undefined && bmi === undefined && anyMembership === undefined)
-    return "Supported production is selected-value presence, selected-value membership, quantity threshold, or body mass index with an explicit validity operand; other definitions cannot be ignored.";
   const sourceReason = publicationSourceAdmissionReason(concept);
   if (sourceReason !== undefined) return sourceReason;
   if (hasValue !== undefined && concept.valueTypes[0] !== "boolean") return "Has-value produces an Observation with a boolean value.";
@@ -470,7 +473,7 @@ export function preparePublicationProgram(declarations: PublicationContext): Pub
           return fail(thresholdError, comparison.location, "publication-quantity-unit-unsupported");
         checkQuestionUnit(hit.library, hit.node, comparison.threshold.unit, `quantity threshold in "${library.libraryName}"."${concept.name}"`, comparison.location);
         producer = Object.freeze({ kind: "quantityThreshold", producerId: `crl:producer:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["quantityThreshold", 0]]))}`,
-          operand: operand.identity, threshold: Object.freeze(comparison.threshold) });
+          operand: operand.identity, threshold: Object.freeze(comparison.threshold), comparison: comparison.comparison });
       }
       // REFACTOR:grounded (#320, plan589): prepare both selected inputs and resolve anchor identity.
       const bmi = readPublicationBMI(concept);
diff --git a/packages/crl/src/emit/publicationQuantity.ts b/packages/crl/src/emit/publicationQuantity.ts
index 3760e3ced..882154504 100644
--- a/packages/crl/src/emit/publicationQuantity.ts
+++ b/packages/crl/src/emit/publicationQuantity.ts
@@ -21,11 +21,15 @@ export function readPublicationQuantity(value: unknown): PublicationQuantityValu
   return { kind: "known", value: q.value, unit };
 }
 
-const units: Record<string, { group: string; factor: bigint }> = {
+// Integer factors preserve the eight-place decimal domain in emitted CQL as well as TS.
+export const PUBLICATION_QUANTITY_UNITS: Readonly<Record<string, { readonly group: string; readonly factor: bigint }>> = Object.freeze({
   m: { group: "length", factor: 100n }, cm: { group: "length", factor: 1n },
   kg: { group: "mass", factor: 1000n }, g: { group: "mass", factor: 1n },
   "kg/m2": { group: "bmi", factor: 1n },
-};
+  "%": { group: "percentage", factor: 1n },
+  ms: { group: "milliseconds", factor: 1n },
+});
+const units = PUBLICATION_QUANTITY_UNITS;
 /** REFACTOR:grounded (#328): reuse the actual comparison domain; metadata adds no conversions. */
 export function publicationQuantityUnitsCompatible(a: string, b: string): boolean {
   return a === b || Object.prototype.hasOwnProperty.call(units, a) && Object.prototype.hasOwnProperty.call(units, b) && units[a].group === units[b].group;
@@ -43,21 +47,34 @@ export function isPublicationComparisonDecimal(value: number): boolean {
 }
 /** The same authored threshold admission is used by validation and executable preparation. */
 export function publicationQuantityThresholdError(threshold: { value: number; unit: string }): string | undefined {
-  return !isPublicationComparisonDecimal(threshold.value) || !Object.prototype.hasOwnProperty.call(units, threshold.unit)
-    ? "Quantity threshold requires a finite value and a supported unit: m, cm, kg, g, kg/m2."
-    : undefined;
+  if (!isPublicationComparisonDecimal(threshold.value)) return "Quantity threshold requires a finite value with magnitude at most 10^6 and at most eight decimal places.";
+  return Object.prototype.hasOwnProperty.call(units, threshold.unit) ? undefined
+    : `Quantity threshold unit '${threshold.unit}' is unsupported. Use a supported quoted UCUM code: ${Object.keys(units).map(unit => `'${unit}'`).join(", ")}.`;
 }
 export function publicationQuantityAtLeast(value: unknown, threshold: { value: number; unit: string }):
+  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
+  return comparePublicationQuantity(value, threshold, "at-least");
+}
+
+// REFACTOR:grounded (quantity thresholds): inclusive operators share exact unit-aware arithmetic.
+export function publicationQuantityAtMost(value: unknown, threshold: { value: number; unit: string }):
+  { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
+  return comparePublicationQuantity(value, threshold, "at-most");
+}
+
+function comparePublicationQuantity(value: unknown, threshold: { value: number; unit: string }, comparison: "at-least" | "at-most"):
   { kind: "unknown" } | { kind: "known"; value: boolean } | PublicationValueError {
   const q = readPublicationQuantity(value);
   if (q.kind !== "known") return q;
   if (!isPublicationComparisonDecimal(q.value) || !isPublicationComparisonDecimal(threshold.value))
     return { kind: "error", code: "publication-quantity-precision-unsupported", message: "Quantity comparison supports magnitude at most 10^6 and at most eight decimal places." };
-  const a = units[q.unit], b = units[threshold.unit];
+  const a = Object.prototype.hasOwnProperty.call(units, q.unit) ? units[q.unit] : undefined;
+  const b = Object.prototype.hasOwnProperty.call(units, threshold.unit) ? units[threshold.unit] : undefined;
   if (a === undefined || b === undefined || a.group !== b.group)
     return { kind: "error", code: "publication-quantity-unit-unsupported", message: "Quantity comparison requires compatible supported units." };
   const left = publicationDecimal(q.value), right = publicationDecimal(threshold.value);
-  return { kind: "known", value: left.coefficient * a.factor * right.scale >= right.coefficient * b.factor * left.scale };
+  const lhs = left.coefficient * a.factor * right.scale, rhs = right.coefficient * b.factor * left.scale;
+  return { kind: "known", value: comparison === "at-most" ? lhs <= rhs : lhs >= rhs };
 }
 
 /** REFACTOR:grounded (#328): explicit type normalization never changes caller-owned raw data.
diff --git a/packages/crl/src/emit/tests/publicationQuantity.test.ts b/packages/crl/src/emit/tests/publicationQuantity.test.ts
index 40130b599..4b7762e63 100644
--- a/packages/crl/src/emit/tests/publicationQuantity.test.ts
+++ b/packages/crl/src/emit/tests/publicationQuantity.test.ts
@@ -2,7 +2,8 @@ import { describe, expect, it } from "vitest";
 import { buildCRL } from "../../index";
 import { prepareSingleLibraryPublication, adaptPublicationCandidate } from "../publicationProgram";
 import { adaptObservationPublicationCandidate, type PublicationObservationSource } from "../publicationSource";
-import { readPublicationQuantity, publicationQuantityAtLeast } from "../publicationQuantity";
+import { readPublicationQuantity, publicationQuantityAtLeast, publicationQuantityAtMost } from "../publicationQuantity";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
 import { emitCQLFromAST } from "../../cql-emitter/emitCQL";
 import { emitPartitioned, FULL_PARTITION } from "../../cql-emitter/layeredEmit";
 import { lowerLocalCodes } from "../../cql-emitter/lowerLocalCodes";
@@ -36,6 +37,58 @@ const measurement = (value: unknown = { value: 200, unit: "cm" }) => ({
   effectiveDateTime: "2026-09-01", ...(value === null ? {} : { valueQuantity: value }),
 });
 describe("Quantity publication", () => {
+  // @kit text-answers:quantity-thresholds
+  it.each(["%", "ms", "m", "kg/m2"])("preserves inclusive lower/upper boundaries and errors for %s", unit => {
+    const threshold = { value: 55, unit };
+    for (const [value, lower, upper] of [[54.99999999, false, true], [55, true, true], [55.00000001, true, false], [0, false, true], [-1, false, true]] as const) {
+      const q = { value, system: "http://unitsofmeasure.org", code: unit, unit: "display is not the code" };
+      expect(publicationQuantityAtLeast(q, threshold)).toEqual({ kind: "known", value: lower });
+      expect(publicationQuantityAtMost(q, threshold)).toEqual({ kind: "known", value: upper });
+    }
+    for (const compare of [publicationQuantityAtLeast, publicationQuantityAtMost]) {
+      expect(compare(null, threshold)).toEqual({ kind: "unknown" });
+      expect(compare({ unit }, threshold)).toEqual({ kind: "unknown" });
+      for (const bad of [{ value: 55 }, { value: 55, unit, system: "other" }, { value: 55, unit, comparator: "<" }, { value: 0.55, unit: "1" }, { value: 1, unit: "s" }, { value: 55, unit: "toString" }, { value: 55, unit: unit === "%" ? "ms" : "%" }, { value: 55.000000001, unit }, { value: 1000001, unit }])
+        expect(compare(bad, threshold).kind, JSON.stringify(bad)).toBe("error");
+    }
+  });
+  // @kit text-answers:quantity-thresholds
+  it.each(["%", "ms", "kg/m2"])("admits and emits exact selected-Quantity comparisons for %s", unit => {
+    for (const comparison of ["at least", "at most"] as const) {
+      const { ast } = prepare(quantityThresholdSource(unit, comparison, 55));
+      const program = prepareSingleLibraryPublication(ast, options);
+      expect(program.descriptors.find(d => d.producer?.kind === "quantityThreshold")?.producer).toMatchObject({ kind: "quantityThreshold", comparison: comparison.replace(" ", "-"), threshold: { value: 55, unit } });
+      const direct = emitCQLFromAST(ast, options);
+      expect(direct.success, JSON.stringify(direct.errors)).toBe(true);
+      expect(direct.result).toContain(`when '${unit}' then 1.0`);
+      const calls = direct.result!.split("\n").filter(line => !line.startsWith("define function ")).join("\n");
+      expect(calls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+      const partitioned = emitPartitioned(lowerLocalCodes(ast, options).ast, "Quantity Threshold Intake", options.policyId, FULL_PARTITION, options);
+      expect(partitioned.success, JSON.stringify(partitioned.errors)).toBe(true);
+      const partitionedCalls = partitioned.entries.map(e => e.result.result).join("\n").split("\n").filter(line => !line.startsWith("define function ")).join("\n");
+      expect(partitionedCalls).toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(');
+      expect(partitionedCalls).not.toContain(comparison === "at most" ? '"__CRL_PublicationProducer_v1_QuantityThresholdCandidate"(' : '"__CRL_PublicationProducer_v1_QuantityAtMostCandidate"(');
+    }
+  });
+  // @kit text-answers:quantity-thresholds
+  it.each(["milliseconds", "seconds", "'1'", "'s'", "'mm[Hg]'"])("refuses unsupported threshold spelling %s with supported unit guidance", spelling => {
+    const parsed = buildCRL(quantityThresholdSource("ms", "at most", 120).replace("at most 120 'ms'", `at most 120 ${spelling}`));
+    expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+    const result = prepareSingleLibraryPublication(parsed.result!, options);
+    expect(result.diagnostics.some(d => d.kind === "publication-quantity-unit-unsupported" && d.message.includes(`unit '${spelling.replaceAll("'", "")}' is unsupported`))).toBe(true);
+  });
+  it("keeps wrong result/operand types and nested age producers outside threshold admission", () => {
+    const source = quantityThresholdSource("%", "at most", 55);
+    for (const invalid of [source.replace("value type is boolean", "value type is Quantity"), source.replace("value type is Quantity '%'", "value type is boolean"), source.replace('"Measurement" at most 55 \'%\'', 'age today at most 18 years')]) {
+      const parsed = buildCRL(invalid); expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+      expect(prepareSingleLibraryPublication(parsed.result!, options).diagnostics.length).toBeGreaterThan(0);
+    }
+  });
+  it.each(["under", "exceeds"])("names supported inclusive spellings when rejecting strict threshold %s", comparison => {
+    const parsed = buildCRL(quantityThresholdSource("%", "at most", 55).replace("at most", comparison));
+    expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
+    expect(prepareSingleLibraryPublication(parsed.result!, options).diagnostics.some(d => d.message.includes("at least or at most"))).toBe(true);
+  });
   // REFACTOR:grounded: the source binding repair applies to non-age publications too.
   it("qualifies an uncoded Quantity source across layers", () => {
     const { ast } = prepare(source.replace(/^- code is `height`\.\r?\n/m, ""));
diff --git a/packages/crl/src/emit/tests/quantityIntake.test.ts b/packages/crl/src/emit/tests/quantityIntake.test.ts
index a4b58a818..9f0835b61 100644
--- a/packages/crl/src/emit/tests/quantityIntake.test.ts
+++ b/packages/crl/src/emit/tests/quantityIntake.test.ts
@@ -106,7 +106,7 @@ describe("Quantity intake presence", () => {
     const f = fixture(source);
     const validation = validateCRLImports(f.path);
     expect(validation.success).toBe(false);
-    expect(validation.validationErrors.some(e => e.message.includes("Quantity threshold requires"))).toBe(true);
+    expect(validation.validationErrors.some(e => e.kind === "use-site-type-mismatch" && e.message.includes(`unit '${unit}' is unsupported`))).toBe(true);
     expect(emitCQLImports(f.path).success).toBe(false);
     expect(runCel(resolveCelImports(f.cases)).runs.every(r => r.status !== "pass")).toBe(true);
   });
diff --git a/packages/crl/src/emit/tests/questionUnit.test.ts b/packages/crl/src/emit/tests/questionUnit.test.ts
index 4adc32d24..741b4b0b1 100644
--- a/packages/crl/src/emit/tests/questionUnit.test.ts
+++ b/packages/crl/src/emit/tests/questionUnit.test.ts
@@ -4,6 +4,8 @@ import { join } from "node:path";
 import { tmpdir } from "node:os";
 import { buildCRL } from "../../index";
 import { questionUnitSource } from "../../authoring-kit/questionUnitExample";
+import { quantityThresholdSource } from "../../authoring-kit/quantityThresholdExample";
+import { validateCRLImports } from "../../imports/validate";
 import { prepareSingleLibraryPublication } from "../publicationProgram";
 import { emitFhirDefFromPath } from "../../fhir-emitter/closureOrchestrator";
 import { emitCQLImports } from "../../imports/emit";
@@ -39,6 +41,16 @@ function objects(value: unknown): Record<string, any>[] {
   return [value as Record<string, any>, ...Object.values(value).flatMap(v => Array.isArray(v) ? v.flatMap(objects) : objects(v))];
 }
 
+// @kit text-answers:quantity-thresholds-validation
+test.each(["%", "ms"])("ordinary validation accepts both inclusive Quantity operators for %s and rejects a spelled-out unit", unit => {
+  for (const comparison of ["at least", "at most"] as const) {
+    const source = quantityThresholdSource(unit, comparison, 55);
+    expect(validateCRLImports(fixture(source)).validationErrors).toEqual([]);
+    const bad = validateCRLImports(fixture(source.replace(`${comparison} 55 '${unit}'`, `${comparison} 55 milliseconds`)));
+    expect(bad.validationErrors.some(e => e.kind === "use-site-type-mismatch" && e.message.includes("unit 'milliseconds' is unsupported"))).toBe(true);
+  }
+});
+
 // @kit text-answers:question-unit
 // REFACTOR:grounded (#328): typed units survive wording edits, not presentation inheritance.
 test("parses a Quantity unit and retains it through a presentation edit", () => {

```

## Native reviewer verbatim records

Round1:
**0 critical, 1 important, 0 nit.**

1. **[important] Correct the kit’s error-order claim.** `packages/crl/src/authoring-kit/index.ts:527` says invalid units, comparators and systems “error after normal selection.” Candidate validation actually rejects malformed Quantities before selection (`publicationProgram.ts:604`, `cre/run.ts:959`), and declared-unit normalization also precedes selection (`cre/run.ts:1012`). An older malformed or incompatible candidate can therefore fail evaluation despite a newer valid answer. Remove “after normal selection” or distinguish candidate validation from comparison of the selected value.

No implementation defect found in discriminator routing, inclusive arithmetic, or the shared unit table. Native qualification remains pending as explicitly reported; this review does not establish its success.

Round2:
**0 critical, 0 important, 0 nit. Converged.**

The final changes resolve my failure-order finding and adequately address the other dispositions. Assertions now distinguish candidate calls from helper definitions; comparator mapping rejects unsupported patterns; diagnostics and teaching clarify inclusive-only bounds and numeric range semantics. Retaining helper names and producer-slot identity is reasonable.

The two untyped native cases target the comparison guard without declared-unit normalization. Their execution remains pending; convergence does not claim they passed.

Measured subsequent proof: nine core/kit files358pass, two new untyped native guard tests + five authoring-kit MCP checks7pass/43unselectedskips. Both native guards returned the expected native-error with publication-quantity-unit-unsupported; raw same-call receipts retained. This execution arrived after the native verdict and is independent of reviewer reasoning.

## External round2 full response
## Round 2 assessment — 0 critical, 1 important, 4 nits

I read the Round2 FINAL diff, the Round1 dispositions, the charter, and verified against the working tree: `publicationProgram.ts:104-117, 214-220, 473-477`, `publicationQuantity.ts:24-78`, `renderPublicationQuantity.ts`, `renderQuantityType.ts:6-23`, `renderPublicationSelection.ts:53-60`, `emitCQL.ts:2520-2530`, `index.ts:527`, `questionUnit.native.test.mjs`, `matcher.ts:401-470`.

Verified clean, no further comment: fail-closed `AtLeast→at-least / AtMost→at-most / else undefined` mapping (N7 implemented as proposed); real candidate-call assertions with define-line filtering and the opposite-call negative in the partitioned path (the helper bodies reference `QuantityAtMost`, never `QuantityAtMostCandidate(`, so the negative isn't vacuous); actionable `unit '<spelling>' is unsupported` message with `kind`-plus-offender assertions in all three negative suites including the repinned `quantityIntake.test.ts`; zero/negative accepted as numbers and stated in charter + doc + kit; strict-bound refusal documented in all three places; helper naming and `producer-slot` `producerId` left alone as decided. Kit pins are consistent — `authoring-kit.test.ts:683`, `run-mcp-server.test.mjs:421`, `mcp-server.test.mjs:185` all read `6d744cb…`, and `index.ts:527` carries the revised clause even though those files aren't in the FINAL diff.

---

**1. [important] The new failure-order teaching is true only when a unit is declared — and your own new untyped test is the counterexample.** Charter: *"Candidate validation and declared-unit normalization precede selection"*; kit clause: *"…so an older malformed or incompatible candidate can fail despite a newer valid answer."* That holds on the declared path (`emitCQL.ts:2529` wraps every candidate in `__CRL_PublicationQuantityType_v1_Value`, which errors `publication-quantity-unit-unsupported` before `Select`). On the **undeclared** path — exactly what the new guard test builds with `.replace("Quantity '%'", 'Quantity')` — there is no normalization, and `PUBLICATION_LOCAL_QUANTITY_CANDIDATE` (`renderPublicationSelection.ts:53-60`) only checks comparator/system/blank-unit, not table membership. So an `'s'`- or `'1'`-coded candidate passes validation, enters selection, and errors **only if it is the selected value**. Concrete divergence: operand with an older `0.55 '1'` record plus a newer `120 'ms'` answer — with `value type is Quantity 'ms'` the whole concept fails; with bare `value type is Quantity` the newer answer is selected and the decision reaches `Meets`. Same authored threshold, same data, two outcomes, and the only discriminator is a line the kit calls presentation-ish guidance (*"Declare the input Quantity unit explicitly for numeric entry"*). Add one sentence distinguishing the two: declared unit ⇒ incompatible candidates fail during normalization regardless of recency; no declared unit ⇒ unsupported units error only when selected. Without it the kit sentence is wrong for the configuration you are about to ship native evidence for.

**2. [nit] The two untyped native guard rows exercise the `group(...) is null` branch, not the new group arms' mismatch branch.** `wrongUnit` is `'1'` for `%` and `'s'` for `ms`; both yield `"…QuantityGroup"(unit) is null`, which is the pre-existing arm. The generated `'%' → 'percentage'` / `'ms' → 'milliseconds'` rows are exercised only on the equal-unit path. One extra row with a *supported but incompatible* unit (`'cm'` datum against the `%` threshold) would hit `group(Q) != group(threshold)` with both sides non-null — the arm the generated table actually added. Risk is low, but don't let `coverage.md` read as if the cross-group guard was natively proven. (TS covers it: `{ value: 55, unit: unit === "%" ? "ms" : "%" }`.)

**3. [nit] `"under"` is a decoy row in the strict-spelling test.** `matcher.ts:455/464` define `<X> below <Q>` → `Below` and `<X> exceeds <Q>` → `Exceeds`; `under` exists only in the age matchers (`:972`, `:1046`). So `"Measurement" under 55 '%'` is an *unmatched narrative*, and that row proves nothing about strict-comparator refusal. `"exceeds"` does exercise the real fail-closed path (known pattern, 2 args, `QuantityArg`, `comparison === undefined`). Use `below` — the actually-matched strict lower spelling — so both strict directions are pinned at the discriminator rather than one at the parser.

**4. [nit] Declared-unit/threshold-unit mismatch for the new units is untested at authoring time.** `checkQuestionUnit` (`publicationProgram.ts:475`) runs after `publicationQuantityThresholdError`, so `value type is Quantity 'ms'` with `at most 55 '%'` must raise `publication-quantity-unit-incompatible` via the singleton groups in `publicationQuantityUnitsCompatible`. The new suites only cover datum-level mismatch. One row in `questionUnit.test.ts` pins that the new singleton groups make this an authoring error instead of a silently-accepted pair.

**5. [nit] The `publicationAdmissionReason` reorder changes a message, and nothing pins the old one.** Moving the definition branch above the code branch means an uncoded concept with an unadmitted definition and no representations now reports the production list instead of *"A publication requires a local code or an admitted producer/source."* I searched the repo: neither string appears outside `publicationProgram.ts`, and the new `under/exceeds` test depends on the new order. Admission (defined/undefined) is unchanged. Fine — just record in `coverage.md` that the reorder is a diagnostic-text change with no admission effect, since the row currently doesn't mention it.

**Verification caveat on the pending run.** The untyped guard asserts `session.evaluate()` *rejects* with `native-error` on a **Start** evaluation (no QR submitted). The already-passing `'1'`/`'s'` case errors at answer time with a request body; whether `Message(…, true, …)` raised while populating the initial questionnaire surfaces as a request error rather than an unpopulated item / null-condition pause is the untested variable. If it pauses instead of erroring, the charter sentence *"Unsupported units … error rather than silently becoming false or unknown"* needs qualifying for the Start path — don't commit that wording ahead of the measurement.

[reviewer cost: 11 turns · $1.96 estimated · 1,253,828↓ + 13,173↑ · effort=medium · anthropic/claude-opus-5]

Lead dispositions: Accept5/Refine0/Reject0. I1: distinguish declared-unit preselection normalization from undeclared-unit selected comparison, explicitly in kit/charter/typed-intake docs. N2: add one supported mismatch native row %threshold versus ms input, preserve original unknown-unit receipts; run only this new row. N3: replace unmatched under with real Below spelling below and assert known Below/Exceeds matcher identities before refusal. N4: add2preparation tests for declared%/thresholdms and reversed pairing, expect publication-quantity-unit-incompatible. N5: ledger explicitly records production-list diagnostic precedes missing-code diagnostic; admission remains unchanged. No production comparison change in this round. Native round2 already0C0I0N. Raw Start error measurement now complete:2untyped native guards passed, not pauses. Final review focuses on clarified paragraph and these test-only deltas.

## Final follow-up review request (byte-equivalent on both arms)
Final focused review of code discussion1508, external round2's one important and4nit findings; no production comparison code changed since round2. Read docs/CRL-NORTH-STAR.md in full. Exact revised canonical kit wording: "Malformed Quantities fail candidate validation before selection. A declared unit also normalizes every candidate before selection, so an older incompatible numeric candidate can fail despite a newer valid answer. Without a declared unit, an otherwise valid Quantity with an unsupported comparison unit fails only if selected." Declared unit is now explicitly called an executable normalization contract, not only numeric-entry guidance. Charter and typed-intake docs mirror this; kit2.49 hash16588b532d057adceedf239b2484098594c31ee31ca6b8257b7b5d1d1f2ca71d is repinned.
Test-only deltas: publicationQuantity.test.ts strict rows now below/exceeds and assert matchNarrative returns known Below/Exceeds before unsupported producer diagnostic. questionUnit.test.ts adds2preparation rows for declared% against thresholdms and inverse, expecting publication-quantity-unit-incompatible. questionUnit.native.test.mjs adds only ['%','at most',55,'ms'] to the existing untyped group-guard parameterization, hitting two supported unequal groups. Ledger records admission reorder as diagnostic text only. Current relevant files and exact prior full diffs are in1508 if needed; avoid old inventories.
Measured before these last test-only deltas: core358pass+publicationProgram30pass; native2complete numeric sessions16calls passed, BMI6call retry passed,2untyped Start guards correctly errored (not paused) with raw evidence, MCP37pass plus targeted final-kit checks. Final core/mismatch-native checks are running; do not infer their result. Assess whether the clarified teaching and narrow test changes close all remaining findings; return critical/important/nit counts and concise convergence or concrete remaining issue. No edits, tests/native execution, mail, delegation, or unrelated scope expansion.

Final precommit core verification:9files360pass, plus separately30publicationProgram tests. Remaining native group mismatch and final review are pending; original successful native receipts retained.

## Code round3 records and lead closure plan
Native gpt-6-astra/high verbatim:
0 critical, 0 important, 0 nit. Converged.

The clarified teaching accurately distinguishes candidate validation, declared-unit normalization, and selected-value comparison. The narrow tests address real strict patterns, both declared-unit mismatches, and supported unequal comparison groups. The ledger correctly limits the admission reorder to diagnostic priority.

This closes the scoped review findings; it does not certify the pending native mismatch execution.

External anthropic/claude-opus-5/medium verbatim:
Read: `.vibe-tools/protocols/review-process.md`, `docs/CRL-NORTH-STAR.md` (full), `packages/crl/src/emit/publicationProgram.ts`, `publicationQuantity.ts`, `publicationHasValue.ts`, `cql-emitter/renderQuantityType.ts`, `renderPublicationQuantity.ts`, `emitCQL.ts` (envelope assembly), `cre/run.ts`, and the three test files cited.

**Verified against code (no finding, reported so you don't re-check):** the first two sentences of the revised kit wording are structurally correct in both lanes. `emitCQL.ts:2529` wraps the *whole* flattened candidate list (local ∪ source arms ∪ producer candidate) in `__CRL_PublicationQuantityType_v1_Normalize` **before** the age-eligibility filter and before `…_Select`, and `cre/run.ts:1013-1018` runs the same loop over every candidate before `selectPublicationCandidate`. The untyped path compares only `operand.selected.resource.value` (`renderPublicationQuantity.ts`, candidate helper) and CRE's producer path only sees `selectedOperands`, so "fails only if selected" matches the lowering. Also: the `below`/`exceeds` escape hatch I expected (drop `shape reduction` to get legacy strict `CRLCommon.Below`) is already closed — `emitCQL.ts emitConceptBody` raises `publication-unsupported-context` when a legacy definition references a publication operand.

---

**[important] The new "normalizes every candidate before selection" claim is not separable from comparison failure in any existing evidence.** `renderQuantityType.ts` normalization emits `publication-quantity-unit-unsupported` / `publication-quantity-precision-unsupported`, and `renderPublicationQuantity.ts`'s compare helper emits *the same two codes*. Every assertion in `questionUnit.native.test.mjs` ('rejects lossy/out-of-range conversions…', the unit-guard rows) and in `questionUnit.test.ts` matches on the **code** only (`toContain(error)`, `d.kind === …`). So for the typed rows (`['cm',1,'kg']` with threshold `1 'm'`) both stages would fail with the identical code and the test cannot tell which one fired — i.e. no measurement distinguishes "normalized at admission" from "failed at comparison after selection", which is exactly the distinction the revised wording now makes load-bearing. The messages *are* distinct ('Quantity is incompatible with its declared type unit' vs 'Quantity comparison requires compatible supported units'); asserting the message substring on the typed rows closes this with no new native run.

**[important] The distinguishing half of the sentence — "an older incompatible numeric candidate can fail despite a newer valid answer" — has no multi-candidate test in either lane.** Every typed error case I can find is single-candidate, and in each the bad candidate is also the one selection would pick, so the ordering claim is satisfied vacuously. The CRE half is code-evident (`run.ts:1013`, loop returns `fail` on the first error before `select`) but untested; the native half additionally depends on two unmeasured engine properties: that `((candidates) C return all Normalize(C,'unit'))` evaluates the return clause for *non-winning* elements, and that `Message(..., true, ..., 'Error', ...)` aborts rather than yielding null per element. If the engine were lazy or Message-tolerant, native would select the newer valid answer while CRE fails the case — a CRE/`$apply` disagreement of exactly the kind §4.0 forbids. One CEL case (declared `'cm'`, older local answer `1 'kg'` + newer `180 'cm'`) closes the CRE half cheaply; the native half should either be run or the wording should say the ordering is derived from the lowering rather than measured.

**[nit] "fails only if selected" will be read as "if selected, it fails", which is false for non-comparison consumers.** `publicationHasValue.ts:33` tests only `valueQuantity.value != null` and ignores units, so an untyped selected `{value:120, unit:'mm[Hg]'}` consumed by `"X" has a value` yields `true` with no diagnostic; an untyped Quantity consumed by nothing but the answer slot likewise flows through unchanged. "fails only when a comparison consumes it" is both true and the thing a KE needs.

**[nit] "normalizes every candidate" is false for valueless candidates, and the boundary matters.** `normalizePublicationQuantity` returns the raw value unchanged when `q.value == null` (and CQL's `_Value` returns `Q` unchanged on the same condition), so a `{unit:'kg'}` candidate on a `Quantity 'cm'` concept survives admission with a foreign unit and can win recency as a newer unknown. Behaviour is CRE/CQL-consistent and the downstream compare returns unknown before the group check, so nothing is wrong — but "normalizes every candidate" overstates it; "every candidate carrying a numeric value" is accurate.

**[nit] The charter clause "Unsupported authored unit spellings fail validation/preparation" is stronger than the code, and the kit inherits the ambiguity.** `publicationProgram.ts` only checks the `[\x21-\x7e]+` charset and the Record/Observation/Quantity shape; `checkQuestionUnit` fires only when a threshold or BMI consumer exists. So `value type is Quantity 'mm[Hg]'` on a concept with no comparison consumer prepares fine and emits normalization CQL that stamps `system = UCUM, code = 'mm[Hg]'` onto same-unit candidates. If that is intended (declared unit = identity contract, conversion restricted to m/cm and kg/g), say so: today a reader of the supported-unit list — `m, cm, kg, g, kg/m2, %, ms` — will conclude `'mm[Hg]'` is rejected at authoring time, and will also assume `%`/`ms`/`kg/m2` declarations "convert" when for those the declared unit can only stamp or reject, never convert.

**Counts: 0 critical, 2 important, 3 nits.** Convergence otherwise: the test deltas as described are the right shape — the two `questionUnit.test.ts` preparation rows do cover both directions of declared-vs-threshold incompatibility, and the new `['%','at most',55,'ms']` native row is the first case exercising the `group(a) != group(b)` arm rather than the `group is null` arm (previous rows used `'1'`/`'s'`, which are absent from `PUBLICATION_QUANTITY_UNITS`). The only residue on that row is the same code-vs-message granularity as the first important point: the assertion would also pass if the error came from somewhere other than the group guard.

[reviewer cost: 17 turns · $3.16 estimated · 1,807,873↓ + 16,829↑ · effort=medium · anthropic/claude-opus-5]

Lead dispositions: Accept4/Refine1/Reject0. I1 Refine: original same-call raw native receipts ALREADY distinguish stages through distinct full messages; inspected typed percent/ms errors contain 'Quantity is incompatible with its declared type unit', while untyped1/s and supported%/ms mismatch contain 'Quantity comparison requires compatible supported units'. Add those exact-message assertions to owning tests and verify saved originals without replay. I2 Accept: add CRE/CEL pair + two real native Start calls with older1ms and newer55%, once declared% (must error at normalization) and once undeclared (must select newer55% and recommendMeets). These are NEW semantic controls, not evidence-only replays. N1 Accept: unit support refusal applies when a threshold comparison consumes the selected otherwise-valid Quantity, not presence/display. N2 Accept: normalization applies to candidates carrying a numeric value; valueless input remains unchanged. N3 Accept: unsupported authored THRESHOLD-unit spellings, not arbitrary same-unit Quantity declarations. All wording corrected in place in kit/charter/typed-intake; identity repinned. No product comparison/selection code changed since reviewed round2.

The new paired native controls and final tests below determine factual closure. No further review is needed for mechanically implementing these accepted test/doc corrections once actual results match; this is lead assessment, not a fabricated external0-finding verdict. Final external response remains0C2I3N and native0C0I0N. Review reasoning and measured execution remain separate evidence.

## Final lead closure and measured results

Core9files362/362passed; publicationProgram30/30passed,392distinct focused checks. Native two numeric sessions16calls, separate BMI6calls, three unit-guard calls and declared/undeclared older-bad/newer-valid pair2calls all passed,27same-call receipts across8native tests. Initial BMI interrupted5call history is preserved separately and excluded from passing evidence. Final native pair+5MCPchecks7pass/46unselectedskips. Core real stdio smoke and extension37testMCP suite passed; latest5kitchecks passed against final schema2.49/hash10496ccfe465096fe31a3ec14dba93eac27828b9ae900958ee2460bbb676fed8. Five stronger stage-message assertions passed by reading original receipts without replay. Exact old/new candidate native diagnostics/outcomes distinguish normalization-before-selection from selected-value comparison. CRE typed case is status error (not harness success:false); initial test expectation corrected to explicit error status and exact diagnostic, preserving the valid undeclared control.

All round3 findings closed as recorded. Lead ends review because no substantive issue remains after the requested measured controls/doc corrections; no fabricated external convergence. Product implementation unchanged after round2. No runtime/image/policy/published-pin change, no customer evaluation replay. Content commit follows; separate audit stamp binds its existing SHA, then develop fast-forward. Installed/Linux/client/customer-policy qualification and release remain outside this source feature.
