# #189 boolean-totality — classifier + static proof (T5 build spec)

**Status:** design of record for the boolean-totality proof obligation (`emit-consistency-189-design.md` §3
rule 5). Read the charter `docs/CRL-NORTH-STAR.md` (null-safety by construction) and §3 of the main design
first. This doc expands §3 rule 5 into a buildable spec.

**Source-tree paths (verified 2026-08-14):** `emitCQL.ts`, `layeredEmit.ts`, `emitCriterionDefine.ts` live in
`packages/crl/src/cql-emitter/` (NOT `emit/`); `decision.ts` in `packages/crl/src/fhir-emitter/`; the new
`booleanTotality.ts` and the T1/T2 infra in `packages/crl/src/emit/`. Line citations drift as code moves —
trust the function/const name over the number.

**Sequencing decision (disc 426, both crl-emit arms + operator 2026-08-13):** the boolean-totality classifier is
**built at the flip (T5), NOT as an inert phase-0 precursor.** Whether a form is total is a fact about the
**§2/§7 lowering contract** — which catalog overload is selected, whether `Count` is bare or Coalesced, whether
the `is true`/`is FHIR.boolean` spelling is used, whether the builder normalizes `most recent "X"` — not a fact
about the AST alone. An inert AST classifier would encode "total"/"requires-boundary" verdicts unverifiable until
T5 emits the CQL; if the lowering differed, the classifier would be silently wrong and the "proof" would pass
**vacuously** — the exact failure the proof exists to prevent. So the classifier is built WITH its lowering, as a
separate internal module, tested against **emitted CQL** (the classifier↔lowering agreement obligation below).
T3a (the FHIR value-read model) remains the standalone precursor; T3b (this) folds into T5.

---

## 1. The two-phase model (do NOT assert totality from the AST)

The proof must check a **transition**, not read an AST label:

1. **AST phase — the OBLIGATION.** `classifyBooleanTotality(concept)` records what a form *owes*: e.g.
   `{ kind: "requires-boundary", form: "most-recent-boolean-read" }`, `{ kind: "intrinsically-total" }`,
   `{ kind: "composite", operands }`. This is a claim about the lowering CONTRACT (§2/§7), each cell citing the
   §2/§7 row it encodes.
2. **Lowering phase — the DISCHARGE.** T5's emit records, in resolved-concept metadata, how the emitted CQL
   satisfied the obligation: e.g. `{ booleanEffect: "total", dischargedBy: "boundary-coalesce" }` /
   `{ dischargedBy: "intrinsic-exists" }`.
3. **Proof phase — the CHECK.** The static emit/test-time proof verifies every boolean-valued define reaches
   `booleanEffect: "total"` via a *discharge that matches its obligation*. A `requires-boundary` obligation with
   no boundary-coalesce in the emitted expression is a proof FAILURE, not a pass. A future emitter regression
   that drops a Coalesce is caught because the discharge no longer matches.

**Classifier↔lowering agreement obligation (load-bearing):** a test asserts that for every boolean-define form
T5 actually emits, the emitted CQL matches the class the classifier assigns (checked against the emitted string /
resolved effect, not against this doc's prose). Without it, two modules built together still drift.

---

## 2. Classification (corrected per disc 426)

Key on the concept's **declared value type / shape FIRST**, then the definition form (a `DefinedAsComposition`
under a record-valued parent is set algebra §7, NOT boolean — `not-applicable`, closed-world complement):

| Form | Class | Discharge / rule |
|---|---|---|
| `exists this` / `exists "X"` (`X` resolves `RecordSet`) | intrinsically-total | `exists([R:X])`; value-datum variant `exists([R:X] O where O.value is true)` — totality rides on the **`is true`** spelling (null-decided, rule 4), which must be pinned |
| `defined as exists ("X")` | intrinsically-total | existence bridge |
| `count this … at least N` / `count "X" … at least N` | intrinsically-total **(⚠ verify)** | `Count(…) >= N` — **§2's own "verify `Count`→0 on empty at impl" flag is undischarged**; pin the engine behavior for the emitted target type before relying on bare |
| multi-rep `exists this` | intrinsically-total | union of per-rep existence (§6, in scope for v1) — total regardless of the source arm |
| catalog pattern, boolean concept, pattern shape `list`/`instance` | intrinsically-total | `exists <call>` / `exists { <call> }` (`cql-emitter/emitCQL.ts:1948-1961`) |
| `most recent this`, Scalar boolean | requires-boundary | select-newest → read `value` → `Coalesce(<read>, false)` (Coalesce the boolean READ, never the record) |
| age recency (standalone `uncoded` AND local/computed merge) | requires-boundary | via **`resolveAgeConcept`** (the shared validate+emit authority — do NOT shape-match `age today ≥ N`); §7's total-boolean rewrite is the discharge, NOT the current `recencyAgeTruths` truth-set |
| catalog pattern, inherently-boolean (`High`/`Low`/`AtLeast`/`Between`/…), scalar comparison | requires-boundary | nullable CQL comparison (comparator pattern entries `cql-emitter/emitCQL.ts:414-429`; the `return call` fall-through is `cql-emitter/emitCQL.ts:1962-1964`) → `Coalesce(<predicate>, false)` — **NEVER `Coalesce(X, 0) >= N`** (rule 2: Coalesce the predicate, not the operand) |
| `defined as` composition (`sem-or`/`sem-and`/`sem-not`) / bare ref, boolean parent | composite | carry `operands: ReferenceName[]` ONLY (no `negated` flag). `not "A"` is `not <A's own total define>` = total; per-operand-before-`not` (rule 3) is discharged **architecturally** at each operand's own boundary, not at the composition site (use-site repair would violate context-free emission). The proof requires every resolved operand's effect to be `total`. Preserve qualified refs; treat `CompositionGroup` as transparent |
| `most recent this`, Record shape | not-applicable | returns `Record<R>`, no value read (§2) |
| Record / RecordSet / non-boolean scalar | not-applicable — **but carry `nullable` for non-boolean scalars** | a `Scalar<Quantity>` `most recent this` is nullable-non-boolean; a later comparison consuming it must Coalesce the *predicate* (rule 2). Reading not-applicable as "consume anywhere" is the `Coalesce(X,0)` trap |
| malformed scalar (0 or >1 value types; boolean scalar with no legal reduction) | rejected | invalid-in-boolean-position → validation/emit error at the flip |
| a boolean form the emitter emits but the classifier cannot yet certify | **unclassified** (distinct from `rejected`) | the proof ENUMERATES-and-reports these (does not silently exempt); a silent exemption makes the whole-boundary invariant quietly not-whole |

`rejected` (invalid) and `unclassified` (uncertified-but-emitted) are DIFFERENT: the design's rule-5 "rejected"
means invalid-in-boolean-position; a form the CQL lane still emits but T3b can't certify must be surfaced, never
folded into "rejected" and exempted.

## 3. Whole-graph coverage — the invariant is "every boolean define the emitter produces"

`classifyBooleanTotality(concept)` over authored concepts is necessary but NOT sufficient. The proof's coverage
model must state, per surface, how totality is established:

- **Authored concept defines** — via the classifier (this doc).
- **Criterion defines** (#236 — SHIPPED `7f9aaf1`; `cql-emitter/emitCQL.ts:955-976` gathers/renders via
  `cql-emitter/emitCriterionDefine.ts`) — per-operand-totalized **by construction** in their own emitter;
  the proof cites that as an axiom, does not re-derive.
- **Interface façades** (`define "X": Inferred."X"`) — **delegated**: total iff the aliased define is total.
- **Age-recency synthesized defines/helpers** — the §7 rewritten total-boolean boundary is the discharge.
- **Guard-atom `not Coalesce(…, false)` carriers** (`fhir-emitter/decision.ts:659-674`, `guardApplicabilityCondition`) — ruled to STAY (§7), NOT generalized;
  a by-construction total carrier, an axiom for the proof.
- **Cross-library aliases/includes** — mixed emitter versions rejected/detected (§3 rule 6), never
  consumption-site-Coalesced.

## 4. Verification gaps to discharge at build (not asserted in prose)

- **`Count` on empty** — §2:81's own "verify at impl" flag. Pin the CQL engine's `Count(…) >= N` null-behavior
  for the emitted target type with a translator/runtime test before classifying `count` as intrinsically-total.
- **The `is true` / `is FHIR.boolean` spelling** — the value-filtered `exists` variant is total because of the
  null-decided predicate spelling; pin it (a `= true` regression would silently break totality).
- **`most recent "X"` (named)** — the builder deliberately does NOT normalize it into `ReductionDefinition`
  (`builder.ts:206,1252`; `types.ts:844-845`), yet §2:84 defines its lowering. T5 must EITHER extend the builder
  normalization OR classify the narrative match as boundary-totalized — but must NOT swallow this §2-defined cell
  into `rejected`.

## 5. Location & mechanics

- **`src/emit/booleanTotality.ts`** — emit-lane (the proof is emit/test-time; no validator consumes totality; T1
  precedent of `emit/` importing `template-match`). Not lane-neutral (no validate consumer, unlike T3a).
- **Export / lift `PATTERN_RETURN_SHAPE`** (`cql-emitter/emitCQL.ts:390`, currently a non-exported const) rather than
  duplicating the pattern→shape table.
- Route age through `resolveAgeConcept`; never shape-match the projection syntax.
- Reconcile §3 rule 5's three-class prose with this doc's classes when T5 lands, so two readers don't build
  incompatible proofs.
