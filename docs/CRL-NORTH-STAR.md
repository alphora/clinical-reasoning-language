# CRL North Star — how CRL actually works

**Status:** authoritative primer. This is the "north star" for anyone (human or agent) doing CRL language,
emitter, or representation work, and it is meant to be **handed to reviewers** so they evaluate CRL against
how CRL actually works — not against CQL idioms or chart-matching assumptions.

**How to use it:** read it at the **start of every** #189 / emit-cluster / representation round, and paste or
reference it into any design/code review of CRL logic. Where this doc and an older spec disagree, this doc is
current; see "Reconciliation" at the end.

---

## 0a. ⭐⭐ THE STAKE IN THE GROUND: `fixtures/obesity` is the goal

**`packages/crl/src/tests/fixtures/obesity/` — both authoring options — IS the goal** (operator,
2026-08-29). It is the canonical target for the Obese/BMI chain, it is committed, and
`packages/crl/src/tests/obesityTarget.test.ts` drives it across every lane.

⭐⭐ **THE AUTHORITY ORDER IS: GOAL > CHARTER > CODE** (operator, 2026-08-29: *"the charter clause is not the
authority. the authority is the goal."*).

`large-refactor` establishes that the charter outranks mid-refactor CODE. This says what outranks the
CHARTER: the goal does. This document is a derived articulation of what we are building; the target IS what
we are building. So when a charter clause contradicts the goal, **the clause is corrected — you do not ask
whether the clause permits the goal.** A clause is evidence about our past understanding, not a constraint
on the thing it was written to serve.

⚠ This does not make the charter optional, and it does not license "the goal is inconvenienced" as a reason
to delete a rule. It settles which one MOVES when they genuinely conflict, and it removes the loop where a
clause written to describe the target is then quoted back to block it.

⭐ **So a rule contradicting the target is STALE** — not "in tension with", stale, and to be corrected on
sight. That covers rules declaring its SHAPES rejected or out-of-scope (a local `code is` alongside a
derivation and/or `source representation` posreps, in `shape is Record` and `shape is RecordSet`), AND rules
whose SEMANTICS contradict the acceptance criterion.

⚠ Still not a trump card over the OPERATOR. A rule the operator stated is retired only by the operator
(`stale-requirements` §2). What this settles is charter-vs-goal, not operator-vs-goal.

⚠ **And the reason it was wrong is worth keeping**, because it is a mechanism and not a one-off mistake.
Those rules were **deferral decisions dressed as rejections**. A slice could not yet lower a shape, so the
shape was recorded as `rejected` — a status that fires an author-facing migration prompt. That silently
converts *"we have not built this"* into *"you may not write this"*, and then the next round reads it as a
language decision and re-derives the deferral. That is the spinning this stake was planted to stop.

**So: build debt is recorded as build debt.** A form the emitter cannot yet certify classifies
`unclassified` — enumerated, reported, incomplete, loud. `rejected` is reserved for a form that is genuinely
invalid, and it is a claim about the LANGUAGE, never about the schedule.

---

## 0. ⭐ The design priority: ease of use → CLARITY of use

**This is a reading rule for the whole document — and for every rule anywhere in this project.**

CRL began by optimizing for a **human** author: fewer keystrokes, less to state, the toolchain filling in the
rest. **That is no longer the priority.** The authors are overwhelmingly **AI agents**, and the asymmetry that
governs them runs the other way:

- **Writing explicit, verbose CRL is nearly free** for an AI author.
- **An invisible gap between what the CRL says and what it does is expensive** — it costs a fumble, a drop
  into CQL / FHIR / trace / `$apply` to diagnose it, and then a workaround permanently encoded *around* the
  tool.

So the property CRL optimizes for is **written == executed**: a determination behaves the way its CRL reads,
with nothing inserted in between. **Verbosity is a price worth paying for that; convenience is not a reason to
break it.** §4.0 is this principle applied to the emitter.

⚠ **Anything you find in OPPOSITION to this should be QUESTIONED — including a rule in ALL CAPS, including an
operator escalation, including a sentence in this document.** Emphasis is not evidence. A great deal of the
existing doctrine was written under the OLD priority, so it optimizes for the author saying *less* — which is
exactly what now needs re-examining, and it will not announce itself.

That is **question**, not overrule. A QUOTED operator requirement is retired only by the operator
(`.claude/skills/stale-requirements`). It means: **raise it, say which priority it was written under, and get
a ruling** — instead of deferring to the loudest formatting on the page.

### The rule most often misread this way: "What not How"

It **stands**. Authors declare WHAT a concept means; the emitter decides HOW. But **"How" is the TARGET-language
realization** — which CQL expression, which FHIR element, which retrieve — **never a CRL operation.**

⚠ Where older docs say the implementation "figures out HOW to compute the declared result," that has been read
as licence to *insert CRL semantics* the author didn't write (the implicit `exists` bridge is the live
example). **If the "how" the emitter picked is something the author could have written in CRL, the principle
was misapplied** — that is §4.0's test, and it is the narrowing, not a new rule.

---

## 1. What CRL is

CRL (Clinical Reasoning Language) is a **declarative** language for clinical logic. Authors declare **what**
a determination means, not **how** to compute it. It covers the full breadth of clinical quality and
decision support — **cognitive support, CDS, Prior Authorization, risk adjustment, AND quality measures** —
not just measures.

CRL compiles to two coordinated outputs:

- **CQL** — the logic (retrieves, derivations, composition, guards).
- **FHIR** — the knowledge artifacts (PlanDefinition/Library/etc.) and, via CEL case files, the test/data
  instances the logic runs against.

The two outputs must **agree**: the FHIR a case emits must satisfy the CQL the same CRL emits. Keeping those
two lanes consistent is the through-line of the emit work (issue #189).

---

## 2. ⭐ The local domain is the CANONICAL, PRODUCTION representation

**This is the single most important thing to understand, and the one most often gotten backwards.**

A concept's **local code** (`- code is \`x\`.`) is the project's **own canonical code** for that concept, in
the project-owned local CodeSystem (`<canonicalBase>/CodeSystem/<domain>-local`). **CRL logic is defined over
the local domain.** The local code is production, first-class, and the thing the logic actually runs on. It
is **not** a testing convenience.

**Source representations are the OPTIONAL, ADDITIVE path.** A `- source representation:` with
`- coded from "SomeValueSet".` binds an **external** terminology (clinical/SNOMED/ICD, administrative/claims).
When that external data is available, it **defaults** the local concept — it seeds the concept's value from
real-world data. The source codes are the *optional* ones. The local code stays canonical, and it:

1. **fills gaps** where external data is absent, and
2. **remains the representation the logic uses**, even after a source rep is added.

### ⭐⭐ WHY: this is ANALYTICS, not a medical record — a human answer OVERRIDES the chart

**QUOTED, operator 2026-09-04.** This is the reasoning behind the word *defaults* above, and it is the
clause reviewers most reliably get backwards:

> This is analytics, not a chart. The reviewer is making a determination, not recording a clinical fact.
> A ServiceRequest may be erroneous, superseded, or for something else — the reviewer's judgement is the
> output, and the chart is evidence feeding it. Software that discards the reviewer's answer isn't
> neutral; it's asserting the chart outranks them.

So *defaults* is load-bearing and literal. External data **seeds** a determination; it does not establish
one. Where a user has answered, **the answer wins** — not because local data is more trustworthy as
clinical fact, but because the answer IS the product. We are computing a determination, not maintaining a
chart, and the person making that determination is the authority over it.

⚠ **A fold that lets source evidence outrank a user's answer is a DEFECT, not a conservative default.**
`exists(local records) or exists(source records)` OR'd with the user's own answer is exactly that shape: a
user's `false` cannot refute a present record, so the answer is discarded silently. Contrast
`recencyLocalWins`, which resolves the same tension correctly one layer down — source wins only when
positively newer, local wins on every indeterminacy.

⚠ **This is not "the chart might be wrong".** It stays true even when the chart is perfectly accurate: an
accurate ServiceRequest can still be irrelevant to the determination being made. Reasoning that reaches
for data quality has already missed the point — the question is never *is the record correct*, it is
*whose output is this*.

### Why local codes are essential in production — the argument

Prior Authorization is the first deep use case, and today it runs **exclusively off local domain codes** — it
has no access to clinical or claims data. (The one exception is **Patient**: PA receives the Patient resource,
so Patient uses a source representation. See the Patient-age recency merge.)

Consider a PA workflow that must answer a clinical question but has **no clinical data** to answer it. The
options are:

- **Fail?** That violates the CMS interoperability/PA mandate — our customers get fined. Not an option.
- **Write a real clinical medical fact** (e.g. a SNOMED-coded cancer Condition in the EHR's terminology)?
  No. It usually isn't the treating physician submitting the PA, so writing a real diagnosis would change and
  break the clinical workflow, and it would place medical facts outside the EHR's system of record.
- **What we actually do:** assert a code **in our own domain** meaning *"inference of the member having
  cancer, for the purpose of analysis"* (CDS and Measures are part of that analysis). This is an
  **analytical determination in the project's canonical vocabulary** — deliberately **not** a clinical fact
  in external terminology.

This is the **system of insight ≠ system of record** distinction (ADR 0001): an *assertion* is a reasoning
input, not a fact of record. The local domain is exactly where those analytical determinations live, which
is why it is the canonical, production representation.

### Consequence for emit

`exists([<Resource>: <local code>])` matching a CEL-emitted local-domain resource **is the production
round-trip** for the local-domain path — which, for PA, is essentially everything. A review comment like
"this won't match a real SNOMED chart Condition" is measuring the **optional source-representation path** and
is irrelevant to whether the local-domain path is production-correct. It is. Do **not** conclude that
concepts should be "moved to source representations to match charts": every concept is canonically local, and
*some additionally* gain a source rep for defaulting.

---

## 3. The concept model

### One identity, declared value type

A **concept** is one determination with **one identity** and a **declared value type**. Provenance rides on
values, not on separate identities (ADR 0001 rejected sourced/asserted twin identities).

### Representations produce records

- **`- code is \`x\`.`** — the concept's **local** code (canonical, project-owned domain). Where local and
  user assertions land. Present ⟹ locally assertable.
- **`- source representation: - type is …. - value element is …. - value type is …. - coded from "VS".`** —
  an **external**, optional source shape. A source representation is **fully explicit** — it carries its own
  `type is` + `value element is` + `value type is` (`coded from` optional, e.g. Patient/birthDate has none)
  and **does NOT inherit** the concept's fields (validator A.1,
  `representationShapeValidator.ts:260-275`). Identity = `{type, value type, terminology}`.
- **`- coded from "VS".`** — a named external binding (read-only base).

Only representations emit FHIR **instances**. A concept unions the records from all its representations.

### `defined as` — value-preserving set algebra

`- defined as ( A sem-or B ).` composes **distinct named concepts** with value-preserving set operations:

- `sem-or` = union · `sem-and` = intersection/refinement · `sem-not` = complement (closed-world).

`sem-and` and `sem-not` are **load-bearing** — validated by real quality-measure logic (value-preserving
refinement of a record set). Composition operands' **result types must agree**, and the shipped validator
enforces this **directionally** (not a blanket "mixed = error"): a leaf declaring `value type is boolean`
inside a composition whose parent declares a non-boolean value type is a hard **error**
(`boolean-in-refinement-composition`); any other result-type disagreement the implicit-existence bridge
currently permits is a **warning** (`composition-result-type-mismatch`) today that becomes an **error at the
#189 flip**. See `docs/emit-consistency-189-design.md` §7.

### `definition is` — named derivations

`- definition is <derivation>.` names a derivation over a concept's records:

- selection (`most recent this`), threshold (`count "X" ... at least N`), aggregation, temporal
  (`within last …`), formula, and **`exists`** (concept → boolean).
- ⭐ **A definition is a PIPELINE.** Its stages are separated by `, then`, and **ONE STAGE'S OUTPUT IS THE
  NEXT STAGE'S INPUT** — the stages do not share one set. Stage kinds differ in what they hand on: a
  **producer** (a formula) passes its input through PLUS its computed candidate; a **filter** hands on a
  subset; a **selection** hands on exactly one. So ORDER is load-bearing: `most recent this, then highest
  this` is meaningless (stage 2 is handed a single record), while `within last 6 months this, then highest
  this` is "the greatest of the recent ones".
- ⭐ **`this` in a DEFINITION is the space as of the PREVIOUS stage.** At stage 0 that is the concept's own
  source records — its local `code is` records ∪ **each `source representation`'s CANDIDATES**.

  ⭐⭐ **THREE LEGS FILL THAT COLLECTION, and they differ only in how a record GETS there.**

  1. **The local `code is` leg (ASSERTED)** — contributes NATIVELY. Its records are already case-feature
     shaped, because the concept's own code is what makes them.
  2. **The record leg (`source representation`)** — contributes THROUGH A PROJECTION. ⭐ **That is a
     projection's SOLE PURPOSE: to bring records that are NOT the concept's shape INTO it, creating a new
     case-feature record where one is needed, so that evaluation is HOMOGENEOUS.** `value projection is
     exists this` is one spelling of it (a Condition's existence becoming a boolean Observation).
  3. **The derived leg (a `definition is` PRODUCER)** — contributes a CONSTRUCTED candidate, and is under
     the SAME rule: it is built to the concept's shape, for the same reason.

  ⭐⭐ **THE HOMOGENEITY INVARIANT — AT EVERY STAGE, NOT JUST STAGE 0.** At each stage of the pattern
  operations the set in hand must be records that are **either at least the same shape, or case-features**
  (which of those, see the open determination below). That is what makes the three legs contribute to ONE
  homogeneous collection that the CONCEPT-LEVEL operations can work on — and it is preserved by every stage
  kind, not just established at the start.

  ⭐ **A PRODUCER ADDS; IT DOES NOT RUN AGAINST THE COLLECTION.** It reads its own NAMED OPERANDS, computes,
  and contributes ONE conformant candidate to the set — the set flows past it untouched. That is why a
  producer can be a mid-pipeline stage at all. **Collection-wide operations are the other kinds**: a
  **selection** runs across the whole set and hands on one member; a **filter** runs across it and hands on a
  subset. A stage that widened the set to mixed shapes would leave those operations comparing unlike things,
  which is the failure the whole arrangement exists to prevent.

  ⚠ The producer's "reads its operands, never the flow" half is ENFORCED, not merely intended:
  `emit/producerCandidate.ts` refuses a producer whose stage `reads` anything but `operands`, because a
  flow-reading producer would consume the space it was handed and its result could not simply rejoin that
  space.

  VOCABULARY says the same from the other end: *"the source resource is never 'the concept's record': the
  projection's OUTPUT is the candidate."*

  ⭐⭐ **RULED (operator, 2026-09-01): A CONSUMER HAS TO SEE A CASE FEATURE.** What a concept publishes at
  its boundary is a case-feature record — the concept's own `type is`, carrying the concept's LOCAL code.
  That is the rule, and it does not depend on which consumer is asking.

  ⭐⭐ **SCOPE, RULED (operator, 2026-09-01): "It only applies to concepts that have a `code is`."** A case
  feature IS a local identity, so a concept with no local `code is` has none to publish and is not a
  case-feature boundary at all. Such a concept is EPHEMERAL by §4 — it gets no StructureDefinition, it is
  not answerable (local `code is` is the only way to create an answer), and it exists only as
  target-language computation. It publishes a SHAPE-conformant record, and that is the whole contract.

  ⚠ A real shape, not a loophole: the goal's own Layered option declares `Most Recent Height` and `Most
  Recent Weight` as `shape is Record` with NO code, deliberately, while its sibling `Greatest Weight`
  carries one. Whether a reduction is answerable is the AUTHOR'S call.

  ⚠⚠ AND THIS IS WHERE THE THREE LEGS STOP BEING SYMMETRIC — worth seeing plainly rather than
  rediscovering it later as a bug. A PRODUCER stamps the CF as a side effect of CONSTRUCTING: it writes the
  concept's local code and case-feature profile into the candidate it builds. A PROJECTION stamps because
  constructing that candidate is its entire purpose. A **SELECTION CONSTRUCTS NOTHING** — it picks a record
  that already exists — so it stamps nothing, and a selection over a space holding an unprojected source
  record republishes that record RAW. That asymmetry is the whole reason a boundary transform exists. For
  an UNCODED concept it cannot apply, because there is no identity to stamp with.

  ⚠ **The questionnaire path happens to survive a raw record, and that is a SPECIFIC CASE WE CANNOT RELY
  ON.** Measured: with a raw externally-coded source record winning the selection, `$populate` pre-filled the
  question and `$extract` still produced a LOCAL-coded Observation — because `$extract` RE-DERIVES identity
  from `patternCodeableConcept` and the QuestionnaireResponse carries only the value. A consumer that
  re-stamps identity cannot tell you whether identity mattered. Do not generalise from it.

  ⭐ **WHERE THE TRANSFORM HAPPENS: AT THE BOUNDARY, NOT AT THE UNION.** The collection may hold whatever
  satisfies the shape — comparison, recency ordering and value reads need nothing more — and the local-code
  projection is applied where the concept PUBLISHES. For a `shape is Record` concept that is exactly ONE
  record, so the transform is bounded by construction. (A direct questionnaire use case requires a Record
  rather than a RecordSet anyway, so it is always a single transform there.)

  ⭐⭐ **THE COST IS IN GETTING THERE — WHICH IS WHY AN AUTHOR SHOULD REDUCE TO A RECORD AS EARLY AS
  POSSIBLE.** The boundary transform is one record; what can hurt is carrying a large history a long way
  through the pipeline before reducing it. `within last 6 months this, then most recent this` narrows before
  the work; an unfiltered history carried to the end does not. Cost here is AUTHORED, not imposed — the
  language gives the author both the opportunity and the responsibility to manage the size of the set they
  hand on.

  ⭐ **THE CONVENTION THAT FOLLOWS: reduce to a `shape is Record` as early as the model allows, and use
  `shape is RecordSet` ONLY WHERE IT IS REQUIRED** — i.e. where the SET itself is what the concept publishes
  or what a later stage genuinely reduces over. The layered style is the natural home for this: name the
  history once, reduce it once, and let everything above consume the Record.

  ⚠ **THIS IS A PRACTICE, NOT A LEGALITY RULE, and the distinction is load-bearing.** All three authoring
  options remain canonical — a coded `shape is RecordSet` history IS answerable and IS a valid model, and a
  lane that works for one option and not the others is not done. This says which shape to REACH FOR when the
  model leaves you a choice; it never says a RecordSet is wrong where the set is the point.

  At every later stage `this` is EXACTLY the immediately preceding stage's output: never an earlier pre-filter space, and never the
  stage's own output (which is what keeps `<derivation>, then most recent this` a pipeline and not a fixed
  point). A reduction over a NAMED set reduces `this` ∪ that set, so a coded concept's own assertions compete
  with the records it reduces.
### ⭐ VOCABULARY — established / unestablished, and the three ways to establish

One word, used consistently, because the alternative has already caused a misread: an acceptance rule written
as *"the only route to a Deny is a STATED false"* was read as *asserted-by-a-human* and used to argue that a
COMPUTED false must not Deny. It must.

> **ESTABLISHED** — a value was produced. **The three ways are ASSERTION, RECORD, and COMPUTATION.**
> **UNESTABLISHED** — none of them produced one. That, and only that, reads **unknown**.

⚠ **The three ways are NOT three peer "data-collection arms", and calling them that is what mis-models the
whole shape.** The operator's statement (2026-08-30):

> **TWO ARMS ADD TO A COLLECTION AND A THIRD ARM WORKS ON THAT COLLECTION STEPWISE (POTENTIALLY ADDING TO IT).**

- **`code is`** ADDS its records to the concept's collection.
- **Each `source representation`'s projection** runs PER RETRIEVED RECORD and ADDS a candidate for each.
- ⭐ **`definition is` / `defined as` is NOT a third contributor — it WORKS ON that collection, STEPWISE.**
  Each `, then` stage is handed what the stage before it produced; a PRODUCER stage adds its computed
  candidate to what it was given; the last stage's reduction selects from the whole collection.

⚠ So **"the merge" is not a mechanism to build** — it is the last stage operating on a collection the other
two already filled. And **the source resource is never "the concept's record"**: the projection's OUTPUT is
the candidate.

So the acceptance rule, stated in these terms and true of every policy:

> ⭐ **A Deny requires an ESTABLISHED false. Absence is never established.**

A computed false is established: `"BMI" at least 30 'kg/m2'` over a BMI of 25 is a real `false` and denies,
with nobody having stated anything. A non-member code is established: the datum exists and the test answered.
An absent datum is not established, and pauses.

**Which state an operand reads is decided by WHAT IT READS, never by what kind of construct it is:**

| the construct reads… | absence means | so absence is |
|---|---|---|
| **RECORDS** — a DERIVATION like `defined as exists ("V")`, `count this` | *no records exist*, which ANSWERS the question asked | **false** |
| **A DATUM** — `at least 30`, `within last 6 months` | *nothing to test*, so the question has no subject | **unknown** |

#### ⭐⭐ ABSENCE CONSTRUCTS NOTHING — and the two-valued read is still `false`

**Operator, 2026-09-04.** These look contradictory and are not, so the bridge is stated here rather than
re-derived:

> A determinate `false` **by absence** has NO WITNESS RECORD, because there is nothing to date. So it
> constructs no candidate — and the concept's BOOLEAN READ totalizes the resulting null to `false`.

The constructor already enforces the first half and needs no exception: its guard is
`if <value is null> or recorded is null then` — zero components yield `null as System.DateTime`
(`derivedStampCql([])`), so no candidate is built. That is the `Now()` ban working, not a gap in it.

The second half is the ordinary closed-world totalization the emitter already applies to a boolean
`most recent this` — `Coalesce(FHIRHelpers.ToBoolean(<newest value read>), false)`. The RECORD may be absent
while the DETERMINATION is `false`.

⚠ **So an empty union is not a counter-example to "absence is false".** The record layer and the read layer
answer different questions: *is there a witness* (no) and *what does the concept determine* (false).

⚠⚠ **DO NOT MANUFACTURE A DATE TO GET THE RECORD BACK.** Stamping a false-by-absence arm `Now()` makes it
the newest thing in the union, so it outranks every stored answer — deleting the user override §2 requires.
The record is absent BECAUSE there is nothing to date it, and that is the honest state: a form shows the
question blank (answerable, nothing to pre-fill) while the decision denies closed-world.

⚠⚠ **A REP-LOCAL `value projection` is NEITHER ROW, and putting it in the first one kills the pause row.** A
projection is invoked ONCE PER RETRIEVED RECORD, so **zero records ⇒ zero invocations ⇒ the arm contributes
NOTHING** — not `false`. That is what leaves the concept unestablished, and it is the only reason an
unanswered determination can pause at all.

| projection | per retrieved record it can answer | zero records |
|---|---|---|
| `exists this` | ⭐ **`true` only** — there is no record to invoke it on that would answer `false`, so an existence arm can never record a negative | *nothing* |
| membership (`"X" in "VS"`, concept-level) | `true` · **`false`** (a present non-member is a determinate no) · `null` (no datum to test) | — |

⚠ `defined as exists ("V")` and `value projection is exists this` are different constructs in different
slots and do NOT share absence behaviour. The first is closed-world `false`; the second contributes nothing.

⚠ That is the whole distinction, and it is why `exists` never pauses while a predicate does. `exists` asks
about the records themselves, and their absence is a complete answer. A predicate asks about a value, and no
value leaves it unanswered.

### Closed-world

Implicit absence = the empty set. A scalar over the empty set has no value; a **boolean DERIVED over evidence
records** (`defined as exists ( … )`, a composition) over the empty set is **false**.

**⚠ But a boolean determination that NOTHING CAN COMPUTE is `unknown`, not false.** A boolean concept with a
local `code is` and **no** derivation and **no** source representation is a **QUESTION** — only a human can
answer it — so until a local record is asserted its value is **unknown**, and a decision guarding on it
**pauses and asks** rather than denying. A question, and therefore an answer, is **always a local code**.

Its answer is an Observation carrying that local code with a `valueBoolean`: **`false` is `valueBoolean: false`**.
There is **no "absence code"** — that idea was wrong and is removed. (Design of record
`tmp/DESIGN-apply-null-pause.md`; executed evidence `tmp/NOTES-apply-null-behavior.md`, incl. the two reference
PA IGs.)

Note the type split this rests on: a `type is Condition` concept is an **evidence record** — there is nowhere on
a Condition to STORE a boolean, so it can never carry an answer. The **question** over it is a separate
`type is Observation` + `value type is boolean` + `code is` concept, whose `Observation.value[x]` IS the answer
slot. **A guard consumes the determination, never the record.**

⚠ That is a statement about ANSWERABILITY, not about legal concept shapes.
**`type is Condition` + `value type is boolean` + `definition is exists this` is CANONICAL and must not be
"fixed".** The two types name different things (charter §3): `type is` is the RECORD retrieved, `value type is`
is the RESULT the derivation publishes — here, the boolean that `exists` computes. It is the shape of the
worked FAP example above, and `docs/cql-to-crl-type-valuetype-rule.md:30` FORBIDS rewriting it to
`Observation` + `boolean`. What such a concept cannot be is a **question**: it is a derivation, so it reads
closed-world (absent record = `false`) and never pauses. Only a concept with a stored-boolean answer slot can.

---

## 4. Emit principles

### ⭐ 4.0 THE TEST for emitter magic — *"does it invent CRL expression?"*

**QUOTED (operator, 2026-08-28) — this is the test; use it and no other:**

> *"The emitter should translate natural CRL into CQL/FHIR, where one CRL can be many of one or even both.
> That's the true intent of emit. **What it shouldn't do is invent CRL expression.**"*

**Does the emitter write something the author could and should have written IN CRL?** Yes ⇒ magic, remove it.
No ⇒ it is translation, which is the job.

**QUOTED (the KE consumers of CRL, 2026-08-28) — why the category is a net negative:**

> - Emitter magic that inserts/bridges semantics I didn't write is a net negative **as a category** — not for
>   keystrokes (free for an AI author) but because it breaks **written == executed**, the property I lean on
>   hardest.
> - The fumble has a **fixed shape** — write intent → runs green → behaviour diverges from how it reads → I
>   catch it only by dropping to a lower layer (CQL/FHIR/trace/`$apply`) → then encode around the tool. Magic
>   only ever feeds that loop.
> - I want full, uniform, **nestable** expressivity everywhere — the parts of CRL I can already nest
>   (`defined as`, compound `when`) are the parts I **never** fumble; every fumble is where the expressive form
>   is absent and I route around it (extra declarations, asserting paths through the trace).
> - The asymmetry that should drive the call: generating explicit/verbose is nearly free for me; an invisible
>   intent↔execution gap is expensive. So: **make me write it** — provided the expressive form exists, or the
>   "workaround" is just tedious magic of another kind.

⭐ **That last clause is a PRECONDITION, not a caveat.** "Make me write it" is only honest where the CRL form
EXISTS. Deleting a bridge before the author can express the same thing strands them — so the expressive form
lands **first**, and the bridge becomes an author-time error **after**. (The live instance: reduction nesting
must precede removing the `exists` shape bridges.)

#### ⚠ TWO WRONG TESTS — do not re-derive them

1. **"Does the emitter choose among defensible semantics?"** — fires on every **target-language** decision:
   the FHIR envelope, record selection, and null handling **that does not change a determination's value**.
   None of those are CRL meaning. **Measured: five false positives out of eight rows** in the 2026-08-28
   audit, including the alarming-and-wrong conclusion that #189's own fix was built out of the same magic.
   ⚠ **The qualifier is load-bearing, and it was missing for one round.** Null handling that SUPPLIES a
   determination value — `Coalesce(<unanswered question>, false)` publishes `false` where no representation
   stated it — is banned by the determination-value bullet below, whatever it is called. Both review arms
   caught the unqualified version shielding exactly that defect class.
2. **Treating "hiding unrelated target considerations" as magic** — that is what emit is FOR. Plumbing the
   author *cannot* write in CRL can never be an invented CRL expression.

#### The two carve-outs this test settles

- **The FHIR structural floor is NOT magic.** `Observation.status`, `Condition.clinicalStatus`, `category` are
  **not expressible in CRL at all**, so there is no CRL syntax the emitter is standing in for. Supplying a
  valid FHIR envelope is emit doing its job. ⚠ The "never manufactures a value" bullet below means the
  **concept's DETERMINATION value** — *not* any FHIR element value. Reading it as the latter conflates CRL
  semantics with target plumbing; it is a category error and it has been made.
- **PAUSE is NOT magic.** There is no CRL syntax for "pause" and there should not be. What the author declares
  is *a boolean determination with a local `code is` and no derivation*. From that, **"nothing can compute
  this" follows necessarily** — it is not a choice among semantics — and "a decision cannot proceed past
  something with no value" follows from that. written==executed holds: what is **written** (nothing can
  compute this) is what **executes** (unknown → halt).

  ⚠ **DERIVED — two invariants. If either breaks, pause BECOMES magic:**
  1. The classification stays **derivable from the declaration** (mechanical — `isPureQuestionConcept`),
     never a judgment the emitter makes.
  2. The **CRE pauses identically**, so the author learns the behaviour from the lane they already run,
     without having to express it.

---

- **Representations emit FHIR instances; `defined as` / `definition is` emit CQL (logic), not instances.**
- **CQL is context-free.** A concept's CQL is a pure function of its own definition — never of how it is
  consumed (guard vs measure population vs operand). There is no "QM vs decision" CQL fork.
- **No magic** (§4.0 is the test). The emitter never manufactures a concept's **determination value** — the
  value CRL declares. (It DOES supply target-language plumbing CRL cannot express; that is not this rule.)
  Every set→scalar reduction is explicit in the CRL (per the value-type rule above) — where "explicit" means **it has a declared source**,
  either a written reduction (`exists this` / `most recent this` / a `defined as`) or a REPRESENTATION whose
  semantics supply it. The two representation-supplied reductions are the `value projection` posrep
  (patient age) and the **pure question**'s newest-answer read (§3). Both are declared on the page; neither is
  invented by the emitter. What this bans is a reduction with no declared source at all.
- **⭐ A VALUE-READING boolean determination requires an explicit `value is` — a bare direct assertion is an
  AUTHOR-TIME ERROR, never a manufactured default.** A **value-reading** boolean concept is one whose emitted
  CQL own-arm READS `.value as FHIR.boolean` rather than presence — today the **member-existence interface**
  (`code is` + `defined as exists("V")` over a recency-value referent; extends to the deferred B2a boolean
  `most recent this` when it emits). Its determination IS its value, so it must be stated. The honest fix is
  **explicitness, not a default**: *defaulting a bare fact to `valueBoolean=true` would manufacture a value the
  author never stated* — exactly the magic the bullet above bans, and the need to defend it against
  re-litigation is the tell. The gate is **author-time**: the CEL **validator** rejects a bare / non-boolean
  direct assertion (with a matching **emitter** diagnostic, so a caller that skips validation still sees it) and
  tells the author to write `value is true` / `value is false`.
  ⚠ At runtime a valueless value-reading record reads **null** in *both* lanes — NOT `false`, and NOT a
  closed-world Deny — and both **PAUSE**. The lanes agree; they agree on *unknown*. That is exactly why the
  author-time gate matters: a bare assertion silently produces NO disposition at all, which is harder to
  diagnose than a wrong one, and authoring time is the only place it is cheap to catch.
  The CRE refuses loud ONLY where it genuinely cannot replicate `$apply` — conflicting `true`+`false`
  own assertions, whose newest-wins pick needs the emitted `(effective, id)` sort. A **presence-based
  (value-blind)** boolean concept (`definition is exists this`, a `defined as` over records) is untouched —
  bare = present = **true**, and an authored `value is` there is **ignored** (a warning: `value is false` on it
  computes *true*). (disc 512/513; classification is
  the shared `isValueReadingBooleanConcept`.)
- **⭐ No magic in the EVAL/TEST path either — matching is EXPLICIT MEMBERSHIP, both lanes, local AND remote.**
  This is the single biggest spin-cause in #189: "clever" shortcuts that *technically work* but are impossible to
  hold in your head, so they re-confuse every reader and every compaction. **Banned in both the `$apply`/emit lane
  and the CRE/tree lane, for local and remote alike:** *presence* standing in for membership (asking only *whether*
  a fact exists, not *which* code it carries); *auto-supplied* codes the emitter picks that the author never stated;
  *implicit arm-selection* (a fact silently becoming local vs source by channel/role/hash); and *"trusted" skips*
  (local matching that never checks the code). The model is one operation, visible on the page: **a CEL fact carries
  a code** (a bare fact defaults to the concept's *declared* local code — a **stated rule**, not inference); **that
  code is checked, explicitly, against each representation's set** — the local set (`{concept code}`) and any
  reference/instantiated set (`coded from`) — **in both lanes**; the code populates whichever rep(s) it is a member
  of, and the concept computes over what is populated. There is no *selector* — the **code**, and which sets it is a
  member of, is the whole story. Local is not exempt: its check is trivially satisfied for the right code but
  **catches a wrong one** (an author error, or a hand-edited emitted file). See §3 "Matching is MEMBERSHIP".
- **Null-safety WHERE A VALUE CAN BE COMPUTED — and a THIRD VALUE where it cannot.**
  ⚠ Totality is **NOT** per-operand, and **NOT** applied before a `not`. Blanket per-operand totalization makes
  an *unanswered question* indistinguishable from an answered *"no"*, so the tree runs on to a disposition where
  it must stop and ask. The model:
  - A **derivation** stays closed-world and total: `exists(…)` is total by construction; a nullable boolean
    derivation OVER EVIDENCE is totalized (`Coalesce(<predicate>, false)`) at its own boundary. Absent
    *evidence* is `false`, because a retrieval always computes — `definition is exists this` never pauses.
    ⚠ A derivation over a QUESTION is NOT closed-world: it inherits the question's unknown. `"BMI" at least
    30 'kg/m2'` over an unestablished BMI is UNKNOWN, not false — totalizing it manufactures a stated answer
    from an absence and denies where the goal requires a pause. What determines the arm is what it reads,
    never that it is a derivation.
  - A **pure question** (a bare local `code is` + `value type is boolean`, with nothing that could compute it)
    reads **three-state** and is deliberately NOT totalized: `answeredValue()` returns `true` / `false` /
    **null**. `false` is a **stated value** (`valueBoolean: false`), never implied by omission.
  - **Composition is strong Kleene**, and totality belongs at the **arm, never per operand**. A negated
    *branch* guard is null-propagating (`not <ref>`); Coalescing it reads an unanswered question as "no".
  - The one deliberate exception is the per-action `unless` / `only when` carrier, which stays **two-valued**
    (`not Coalesce(<ref>, false)`) to match the CRE's two-valued action-guard evaluation. An action guard must
    never pause.
  - Never Coalesce a nullable **non-boolean** operand — that manufactures a value.
  The backstop is an emit/test-time assertion, not a blanket terminal Coalesce.
- **`canonicalBase` is required** — absent/empty is an error, no `urn:` fallback. The local CodeSystem is
  always `<canonicalBase>/CodeSystem/<domain>-local`.

### ⭐ Case-features are ANY resource — "Observation.boolean-only" is a HACK we are deleting

**Read this before touching the case-feature / decision-input / DTR emit. It is the single most-repeated wrong
turn.** A decision's **case-feature StructureDefinition is typed by the concept's own natural resource** — the
concept's `type is` (Condition, Procedure, ServiceRequest, MedicationRequest, Observation, …), derived from its
effective-representation descriptor. It is **never forced to Observation**.

The old emitter restricted *every* `code is` concept's case-feature to an **`Observation` with a boolean
`value[x]`** (the "LocalSource-always-boolean rule" in `structureDefinition.ts` / `closureOrchestrator.ts`).
**That is a HACK** — a stopgap that squeezed all determinations into `Observation.valueBoolean` to stand up early
Prior Auth. #189 (the emit-consistency flip) and its FHIR half (2d) **remove it**. The doctrine comments in that
code describe the hack; they are **not** the model. When you see a `type is Condition` boolean concept emit an
`Observation` case-feature SD, that is **the bug we are fixing**, not a constraint to respect.

**Not every concept is a case feature — only NON-EPHEMERAL facts get an SD.** A case feature is a concept that
denotes a **persistable / gatherable record** — an actual FHIR resource instance (Condition, Procedure, …) with a
`code is` / representation. Those, and only those, get a case-feature StructureDefinition and a DTR questionnaire
input. A **purely derived** concept — a reduction (`count`, `most recent`, `exists`), a `defined as` composition,
any computed boolean — is **ephemeral**: it exists only as a value computed during CQL evaluation, has no resource
of its own, and gets **CQL, not an SD**. Its case-features are the non-ephemeral **records it derives from**
(collect *through* a reduction/composition to the code/representation-bearing operands). A concept that is *both*
a record and a reduction (e.g. `code is` + `exists this`) is a case feature **via its record** — the SD describes
the Condition, and its `featureExpression` targets the records define; the boolean is the ephemeral CQL reading.
(A concept whose dependency closure reaches no `code is` / representation at all is authored null-forever — a
validator concern, issue #291, not an emit one.)

How the boolean is represented depends on the concept's natural resource — the descriptor's `valueless` flag is
the discriminator:

- **Valueless resource** (Condition, Procedure, ServiceRequest, MedicationRequest — the record has no value
  element): the determination's truth is **`exists`, computed in CQL** over the record — closed-world (present =
  true, absent = false). There is **no boolean value on the resource**; do NOT fabricate one (a Condition has no
  boolean slot). DTR gathers the record **by its code** (verified: SDC `$extract` creates a Condition whose coding
  element is the answer slot); existence of the coded record = the determination.
- **Value-bearing Observation** (`type is Observation`, `value type is boolean` — the record genuinely carries a
  value): the boolean **legitimately lives in `Observation.value`** and is **read** in CQL. This is a real
  representation, **NOT** the hack.

**The hack is not "storing a boolean" — it is FORCING every concept into `Observation.valueBoolean` regardless of
its declared `type is`.** A genuine boolean Observation is fine; coercing a `type is Condition` (valueless) concept
into one is the bug. The two distinct types (charter §3) remain: the **representation datum** (the record — for a
valueless resource, coding with no value element) and the **published result** (`Scalar<Boolean>`, from `exists`
for a valueless record or from *reading* the value for a boolean Observation).

**Therefore, when reasoning about case-features / DTR / `$apply`, do NOT:**

- fabricate a boolean value on a **valueless** resource (Condition/Procedure/…) — its determination is `exists`
  (a genuine boolean Observation carrying `value` is a different, legitimate case);
- treat "fall back to Observation-only" as an acceptable outcome (**that IS the hack** — the fix is per-resource
  case-features; a resource that cannot yet be proven fails **loud** (`unsupported-casefeature-resource`), it is
  never quietly re-hacked to Observation);
- read the `structureDefinition.ts` / `closureOrchestrator.ts` "always-boolean" doctrine as authoritative — it is
  the code we are removing.

**Patient is the one both-representation exception** (charter §2). PA today runs on local `code is` alone —
it has **no** remote clinical/claims data, so its concepts define no `source representation` (there'd be no
data to populate one). **Patient is the exception:** PA *does* receive the Patient resource, so a Patient
concept legitimately carries **both** a local `code is` **and** a `source representation` off the supplied
Patient, recency-merged — the patient-age both-rep. This does **not** make Patient/age read-only: its local
side is fully **assertable/gatherable** (the human-asserted age Observation is a real case-feature with its own
SD). Age is simply the one determination that *also* has real remote data (birthDate) to read and merge, which
no other PA concept does. A **purely** Patient-sourced read (a `source representation` with no local `code is`
— e.g. birthDate read directly) is the only "supplied, not gathered" case: read from the Patient, no SD.

### ⭐ Case-feature COMPLETENESS — gather every FHIR-required element (a VALID resource, or it's worthless)

A case-feature must emit a **complete, valid** resource, not just its coding. A resource with required
elements beyond coding (MedicationRequest → `status`+`intent`; ServiceRequest → `status`+`intent`; Procedure
/ Observation → `status`) must **gather them all**, so DTR `$extract` yields a resource that validates. The
determination stays the boolean (`action.condition = exists([<R>: code])`); the **record the user asserts**
(`action.input`) carries every required element as an answerable question.

Those required non-coding elements (`status`/`intent`/…) are **answered** — gathered from the user with a
sensible default they can override — **never hardcoded** (that fabricates facts the author never stated) and
**never dropped / failed-closed** (that ships an invalid resource, or refuses one CRL can fully describe).
This is the whole point of CRL: the author writes the declarative minimum and the toolchain expands it into
**complete and correct** FHIR. The division of labor:

- **Human** authors the declarative minimum (`type is`, `code is`, `value type is`, `definition is`).
- **Emitter** (deterministic) applies a per-resource **floor default** for every required element → always a
  valid resource; and reads any values the CRL carries.
- **AI enrichment** writes the *semantically-correct* values **into the CRL** (a concept slot) — never into
  the emit output. The emitter can't derive semantics; the AI's judgment must persist in the **source** (which
  is reviewable/diffable/versioned), and the deterministic emitter reads it. AI-on-source is auditable;
  AI-on-output is not.

**STATUS (#189 null/pause, 2026-08-27) — the SD half has LANDED, with one measured constraint on the
"overridable" wording above.** The case-feature differential now reflects `REQUIRED_STRUCTURAL_ELEMENTS` (the
same table the CEL writer's `applyStructuralDefaults` reads, so the two lanes cannot state different floors),
each `default` element carrying its `pattern[x]`. That is what makes `$extract` supply it: **`$extract`
materialises a profile's `pattern[x]` into the record it writes back** — which is also how the local `code`
reaches the extracted resource, though the QuestionnaireResponse never mentions it. Before this, an answer
extracted from the generated questionnaire had **no `status`** and was invalid against base R4 Observation.

⚠ **A `pattern[x]` FIXES the value; it is not the "sensible default they can override" this section describes.**
That is a mechanism limit, not a choice: the alternative — supplying the value via
`sdc-questionnaire-definitionExtractValue` with a FHIRPath literal, exactly as `subject`/`effective` are
supplied — was tried and **crashes** the cqf extract processor for a `code`-typed element
(`DynamicModelResolver.setValue` NPEs; run recorded in `tmp/NOTES-apply-null-behavior.md` §9). So today these
elements are **invariants of an answer record**, not answerable questions with defaults. Making them genuinely
answerable-with-a-default is the T5/T6 completeness build (**#290**). Do not read the paragraph above as a
description of what ships today.

⚠ A **repeating** element (`category` 1..*) gets a **slice**, never a bare `pattern[x]`: in R4 a pattern on a
repeating element constrains EVERY repetition, which would forbid a legitimate second category. `$extract`
fills a sliced pattern too (verified). `min: 1` with no pattern is the one shape to avoid — it declares a floor
nothing can fill, and every extracted answer then fails its own profile.

The rest of the completeness build (the three layers, the AI-edits-source rule, and the OPEN grammar question
for the concept "slot") is captured in `docs/emit-189-casefeature-completeness.md` and tracked at **#290**. Do
not re-derive it from memory — read that doc.

---

## 5. Scope & maturity — read the examples correctly

- **Prior Authorization is the deep, first use case.** The correct model is being worked out through PA.
- **Quality measures in CRL are a smoke test.** Two measures were authored to prove CRL could express
  clinical logic at all — valuable, but built following the **current** way of modeling measures, which is
  **almost certainly wrong**. "Measures the CRL way" is a **later phase** (local domain codes very likely
  apply there too — TBD).
- **So: distinguish the QM *approach* from the QM *capability lessons*.** Do **not** treat measure artifacts
  (e.g. cms69) as canonical, and do **not** anchor design decisions on current measure patterns. **But** the
  capabilities the QM work legitimately validated — notably `sem-and` and `sem-not` as load-bearing — are
  real and stay. The one inference to reject is "QMs use local codes less, therefore local codes aren't
  production." Keep the baby; discard the bathwater.

---

## 6. For reviewers

When you review CRL logic, emit, or representation design, measure it against **this model**, specifically:

- The **local domain is canonical/production**; source reps are optional/additive. Do not treat local codes
  as a test shim or push concepts toward chart-matching source reps to "fix" round-trip.
- A concept is **self-describing**: its **value type** decides whether a reduction is owed; its **cardinality**
  is declared; its CQL is **context-free**.
- **Apply §4.0's test to any "magic" finding before you file it:** does the emitter write something the author
  could and should have written **in CRL**? If yes, flag it. If the emitter is supplying **target-language
  plumbing CRL cannot express** (a FHIR required element, a null-handling choice, a record selection), that is
  translation — emit's job — and a finding against it is a false positive. The rule is that the emitter
  manufactures no **determination value**, not that it emits no value.
- **§4.0 is the test for MAGIC — it is not the only test.** Two independent rules catch what it does not, and
  a finding under either stands on its own:
  - **No manufactured determination value.** Flag any place the emitted logic supplies a determination value
    no representation stated — including via null handling.
  - **written == executed (§0).** Flag any place **two CRL forms that read the same execute differently**, or
    where behaviour is only discoverable by dropping to the emitted CQL/FHIR.
- **Case-features are any resource** (§4): flag any reasoning that forces a case-feature to Observation, invents a
  boolean value to store on a resource, or treats "Observation-only fallback" as acceptable — that is the hack
  being removed, not the model.
- **Value/interface both-rep convention** (§3): a locally-assertable + remotely-sourced determination whose remote
  datum is a value splits into a both-rep VALUE concept + a BOOLEAN INTERFACE concept. Do **not** recommend
  conflating them (a coded `source representation` on a `boolean` concept is a validator error), and do **not**
  recommend reshaping the model to whatever emits today (source-only, dropped local override, downgraded boolean) —
  the fixture is correct and the emit catches up. Membership is a THREE-STATE predicate over the value concept's
  datum (§3): a present non-member is `false`, and only a missing datum is `unknown` — so `coded from` + `exists`
  alone is NOT the shape, because one VS-scoped retrieve returns ∅ for both and loses the determinate `false`.
- QM artifacts are **provisional**; the capabilities they exercised (`sem-and`/`sem-not`) are not.

---

## Reconciliation

This doc is authoritative on the points above. Two older specs need updating to match and should be read
**subordinate** to this doc until reconciled:

- `docs/defined-as-is-semantic-composition.md` and `docs/cql-to-crl-type-valuetype-rule.md §7` — both stated
  that mixed-value-type ("mixed-shape") composition is legal via an implicit `exists` bridge. That is
  **superseded** (decision B), and both docs were **updated in the #189 grammar+validation slice** (IMPL 4)
  with a superseding banner reflecting the shipped **directional** rule: a boolean leaf inside a non-boolean
  composition is a hard **error**; other result-type disagreements the bridge permits are a **warning** today
  that becomes an **error at the #189 flip**. The explicit `defined as exists ( … )` lift is the fix for the
  boolean-parent-over-record-leaf warning cell (not for the error cell — there the leaf's value type is realigned).

Related: `docs/decisions/0001-asserted-vs-sourced-data-model.md` (the asserted-vs-sourced foundation, still
current).
