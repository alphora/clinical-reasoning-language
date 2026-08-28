# Decision shapes — `first` / `any` / `all` / `otherwise`, branch guards, and `criterion`

How to structure a CRL `decision`: when does a branch fire, how do multiple
branches or actions combine, how to write a compound branch condition, how to
name a reusable one, and how to write the catch-all. The grammar and validator
are the source of truth; this page is the authoring guide. For factoring and
complexity doctrine (when a model is "too complex", how to restructure), the
**authoring kit** is the operational authority — this page defers to it and
should be read alongside it.

> **Two things called "guard".** This page uses **branch guard** for a `when`
> branch's compound condition (`when ( "A" and "B" )`) and **action guard** for
> a per-menu-item `unless` / `only when`. They are different constructs with
> different rules. Tool output that says "guarded out" always means an *action*
> guard; the cockpit's "guard box" is the *branch* side. When this page writes a
> bare "guard" inside a branch-condition discussion, it means the branch guard.

## Why these qualifiers (not `if` / `then` / `else`)

CRL decisions use explicit block qualifiers (`first:` / `all:` / `any:`) over
`when` branches rather than `if` / `then` / `else`. The deciding reason is
**structural**: `any:` / `all:` over *actions* are unavoidable — a recommendation
routinely needs "offer any one of {MRI, CT}" or "do all of {communicate denial,
record rationale}" (see the action-block examples below), and `if` / `then` /
`else` has no native multi-action construct, so an `if`-based surface would
*still* need `any:` / `all:` for actions. The real choice was therefore never
"`first`/`all`/`any` vs `if`/`then`/`else`"; it was **one uniform vocabulary**
(`when` + `first`/`all`/`any`, for both branches and actions) versus **two mental
models** (`if`/`else` for branches, `any`/`all` for actions). The uniform surface
wins on coherence.

Secondary: the qualifier makes the **inclusive-vs-exclusive** choice explicit at
the top of each block (`all:` = every match fires; `first:` = first match wins)
instead of leaving it implicit in `if`-vs-`else-if` adjacency; and the dashless
`end.` closer is context-free — nothing to mismatch — which suits agent authoring.

This was reviewed against an `if`/`then`/`else` alternative, including an
empirical agent-generation study. The study was **not** sufficient to justify an
irreversible migration (small sample, single model family, generated-not-executed);
the structural argument above carried the decision. Note also that the corpus's
headline strategy decisions (`cms22-strategy`, `cms69-strategy`) are **guarded
`all:` blocks of independent recommendations**, not `first:`/`otherwise` exclusive
chains — so the most common real shape is the inclusive one, where `if`/`else`'s
exclusive-chain familiarity helps least.

## The three qualifiers and the catch-all

A `decision` body is a list of `when` branches. When more than one branch (or
more than one action) sits in a block, you must say how they combine:

| qualifier | over `when`-branches | over actions |
|---|---|---|
| **`first:`** | ordered — the **first** matching branch wins (if / else-if / else). Requires a trailing `otherwise`. | — not allowed (actions have no condition to order on) |
| **`all:`** | every matching branch fires (independent rules) | do **all** of the actions |
| **`any:`** | — not allowed (a clinical decision must not silently pick one of several matching branches; use `first:`) | offer **alternatives** — one suffices |

One intuition: **`all` = take all; `first`/`any` = converge to one** — `first`
resolves "which one" by order, `any` offers a choice among actions.

Rules:

- A **multi-member** block must declare a qualifier. A **single-member** block
  takes none.
- A block is **homogeneous**: either all `when`/`otherwise` branches, or all
  `recommend`/`use` actions — never a mix.
- **`otherwise`** is the catch-all. It is legal only inside a `first:` block,
  must be the **last** branch, and is **required** at the top level of a
  `first:` decision (so every case reaches a disposition). In a *nested*
  `first:` block `otherwise` is optional (omit it when the inner branches are
  already exhaustive). The **author** writes no condition on `otherwise`.
  ⚠ It is NOT unconditional in the emitted FHIR: since #189 every branch of an
  ordered `first:` — `otherwise` included — carries the **null-propagating
  negation of its PRIOR branches** as `condition[]` (see "Priority exclusions"
  below). Without them `$apply` has no ordering: a guard that evaluates *unknown*
  merely makes its own action not-applicable, and first-match-wins then runs the
  next sibling — so an unconditional `otherwise` fires on an unanswered question
  and the tree reaches a disposition it should have paused before.
- A `then:` body (the colon form) is always closed by `end.` — a dashless,
  context-free closer; the trailing period keeps every CRL line ending in `.`
  (leaf) or `:` (opener). The inline single-action form
  (`- when "X" then recommend activity "Y".`) has no `then:` and no closer.

## Branch guards — a `when` can test a compound condition

A `when` branch does not have to test a single concept. Its condition is a
**boolean** over concept (and `criterion`, below) references — `and`, `or`,
`not`, and parentheses:

```
decision "Coverage":
first:
- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" )
    then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```

Syntax and rules:

- **A single ref needs no parentheses** (`- when "Eligible" then …`). A compound
  condition may be written bare when it is *homogeneous* — a pure `and`-chain
  (`A and B and C`) or a pure `or`-chain (`A or B or C`).
- **A mixed `and`/`or` must be parenthesized** to fix precedence: write
  `( "A" or "B" ) and "C"`, never a bare `A or B and C`. A bare mixed chain
  parses, but the builder then rejects it — *"mixed 'and'/'or' in a `when` guard
  requires parentheses, e.g. `(A or B) and C`"* — there is no implicit precedence
  to guess at.
- **`not` is supported** (CRL #224 iii.3). Negate a single ref bare
  (`not "Excluded"`) or a compound with parentheses (`not ( "A" or "B" )`). It
  lowers *structurally*, not to a CQL boolean: De Morgan pushes every `not` down
  to the ref leaves, and each **negated literal** emits a per-atom
  `not <ref>` applicability condition — so a negated atom stays a visible
  per-criterion `condition[]` like any other.
  ⚠ Semantics in a BRANCH guard are **strong Kleene, not closed-world**
  (#189): `not unknown = unknown`, and an unknown guard makes its arm
  not-applicable so traversal halts and DTR asks the question. A negated branch
  guard is deliberately **NOT** `Coalesce`-wrapped: coalescing it makes `$apply`
  approve a request whose contraindication question was never answered, while
  the CRE pauses on the same case.
  A determination that is **absent but derivable** still reads `false`
  closed-world; only a determination that *nothing can compute* is unknown.
  (`not` is the emit-capable way to author a single-determination `first:`
  exclusion; the per-action `unless` is a different, menu-member-only construct
  that DOES coalesce — see "Per-action guards".)
- **A branch guard's STRUCTURE lowers to action shape, never collapsing to one
  opaque CQL boolean.** `and` becomes several ANDed applicability conditions on
  one action. An INLINE `or` expands to disjunctive-normal-form arms whose
  *placement is context-sensitive*: under an enclosing `first:` the arms splice in
  as contiguous ordered siblings; under `all:` / flat / other contexts the arms
  are wrapped in one synthesized `cqf-applicabilityBehavior: "any"` grouping
  action (so exactly one arm applies). For an inline `or` the disjunction stays
  **visible and auditable** as those arms in the emitted `PlanDefinition.action`;
  a reviewer sees *which* atom failed. (A guard leaf that is a named `criterion`
  is one identifier condition resolving to that criterion's own named define —
  post-#236 its `or` lives inside the define, visible there + in the use-site
  `input[]` + the cockpit view-model node, not as parent action arms; see the
  criterion section.) This visible-atom property is what separates a branch guard
  from inference (`defined as` / `sem-*`), which fuses distinct criteria into an
  opaque CQL boolean asserting a false sameness. Keep decision logic in branch
  guards and branches; keep alternative-representation logic in `defined as`.

### The materialization envelope (a resource bound, not an authoring gate)

Because an INLINE `or` expands to DNF arms, an inline `and`-of-`or`s multiplies:
`( "A" or "B" ) and ( "C" or "D" )` materializes 2×2 = 4 arms. The emitter caps
the materialized tree — **256 arms** (an ARM cap only; a guard's own `and`/`or`
nesting is parser-bounded, not a separate emit cap). This is an envelope that
keeps emit from exploding on a pathological *inline* tree; it is **not** an
authoring-complexity gate, and a faithful clinical model never approaches it.

If you ever do hit the cap, the emitter reports it
(`compound-guard-expansion-overflow`) rather than emitting a truncated resource —
and its guidance is deliberate: **a faithful model that overflows is a capability
gap, not an authoring error. Do not restructure the decision solely to satisfy
the bound.** Raise it, and consult the authoring kit for factoring guidance. The
kit — not this page and not the emitter — owns the "too complex / how to factor"
doctrine.

Two faithful constructs keep logic *out* of the parent DNF. (1) Post-#236, a
**named `criterion`** is a first-class factoring path: a criterion reference is
ONE DNF leaf — its `or` lives inside the criterion's own named boolean define,
emitted once and referenced by identity — so naming a reused or large-`or`
sub-expression collapses it to a single leaf instead of expanding at the parent
(its atoms stay visible in the define body + the use-site `input[]`; see below).
(2) A `use decision` sub-decision — but `use decision` is an **action**, not a
condition, so it is available only when the source genuinely has a shared,
action-bearing sub-determination to delegate to (with its own dispositions), never
a fabricated one.

### Priority exclusions — how an ordered `first:` stays ordered in FHIR (#189)

`$apply` has **no ordering primitive and no halt primitive.** A `PlanDefinition`
action whose condition evaluates *unknown* is simply **not applicable**, and the
engine then evaluates the next sibling. So an ordered `first:` is not ordered by
anything the engine does — precedence has to be written into the conditions.

Every branch of an ordered `first:` therefore carries, in addition to its own
guard, one `condition[]` entry per **prior** branch holding that prior's
**null-propagating negation**:

```
branch 1     G1
branch 2     ¬G1 · G2
branch 3     ¬G1 · ¬G2 · G3
otherwise    ¬G1 · ¬G2 · ¬G3
```

`$apply` ANDs a `condition[]`, so these are separate entries, never one composed
expression — which keeps the #224 invariant (a `text/cql-expression` only ever
wraps `not <single-atom>`) and avoids a cross-product of arms.

The negation is exact by shape: a positive prior `"X"` excludes as `not "X"`; a
negated prior `not "X"` excludes as the positive `"X"`; an `or` prior becomes N
separate negated conditions (De Morgan). None of them coalesce, and that is the
point: an **unknown earlier guard poisons every later arm**, so no arm applies,
traversal halts, and DTR asks the question instead of running on to a
disposition. This is only emitted for `first:` — `all:` and `any:` branches are
unordered and exclude nothing.

⚠ Known gap: a prior whose guard is an `and` is skipped, because `¬(A and B)` is
a disjunction and the #224 invariant requires disjunctions to lower to arms. Such
a branch cannot yet exclude its successors; the fix is a named define per branch
position, referenced as one `text/cql-identifier` condition.

## `criterion` — naming a reusable guard

When the same branch-guard sub-expression recurs across branches or decisions
*within one library*, name it with a `criterion` and reference the name:

```
criterion "Meets Coverage Preconditions":
- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ).

decision "Advanced Imaging Coverage":
first:
- when ( "Meets Coverage Preconditions" and "Imaging Not Recent" )
    then recommend activity "Approve".
- otherwise then recommend activity "Deny".

decision "Specialist Referral Coverage":
first:
- when ( "Meets Coverage Preconditions" and "Referral Requested" )
    then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```

(Note the criterion body composes two *distinct criteria* structurally. One of
them — `"Failed Conservative Therapy"` — is itself a named `criterion` whose body
is an `or` over two DISTINCT criteria (failed drug OR failed physical therapy —
events that can co-occur, so not one fact recorded twice). Criteria compose in
structure at every level; inference (`defined as`) is only for one criterion's
representations. See "Four ways to combine conditions".)

Syntax and semantics:

- **Declaration:** `criterion "Name": - when ( <condition> ).` — the outer
  parentheses are **required on the declaration** (the grammar demands them: they
  give the statement a clean edge, since `.` is also the qualified-ref
  separator). A `when` *branch* does not require parentheses for a single ref or
  a homogeneous chain. The body is the same `and`/`or`/`not` condition a `when`
  branch takes — including references to *other* criteria.
- **Reference:** use the name in any branch condition — bare
  (`- when "Meets Coverage Preconditions" then …`) or inside a compound
  (`… and "Meets Coverage Preconditions" …`).
- **It lowers to a named define, referenced by identity (#236).** A `criterion`
  is emitted ONCE as a named boolean CQL define; a reference lowers to a single
  guard literal — one positive `text/cql-identifier` `condition[]`, or
  `not Coalesce("Lib"."Name", false)` when negated — pointing at that define, NOT
  its inline-expanded body. N references → the body is emitted once (a DAG of
  named defines, linear in distinct criteria). The atoms stay individually
  visible — in the criterion's transparent decomposable define body, in the
  use-site `input[]` (its recursive atom closure), and as an expandable named node
  in the cockpit view-model (the MV cockpit rendering trails, #274) — so naming
  does not hide them; it relocates *where* they surface (from per-atom action
  `condition[]`, as an inline guard would emit, to the define + `input[]`).
- **It reduces the parent arm count when factoring a disjunction.** A criterion
  reference is always one DNF leaf, so its body never multiplies the parent guard's
  arm count: factoring two 4-way `or`s into two criteria yields a parent guard of
  **one** arm with two identifier conditions (each `or` lives in its own define,
  emitted once), not 16 inline arms. Precisely: naming reduces the arm count exactly
  when the inlined-then-NNF body would have >1 DNF arm — a positive effective
  disjunction, or a negated effective conjunction (`not ( A and B )`); a body whose
  inlined NNF is a pure conjunction is arm-neutral. Reach for a `criterion` for
  *readability* (DRY) AND for *emit tractability* (factoring a reused or large-`or`
  sub-term out of the DNF).
- **A criterion holds only branch-guard logic**, never actions. It cannot
  `recommend` or `use`; it is a boolean condition, not a sub-decision.
- **It is library-local.** Reference a criterion **unqualified** (a same-library
  self-qualification, `"CurrentLib"."X"`, also resolves — it is treated as the
  bare ref). What is rejected is a **foreign** library-qualified reference: once
  the other library is `include`d, `"OtherLib"."X"` where `X` is a criterion
  there is `criterion-misuse` ("cannot be library-qualified"); before it is
  included, you get the more basic `external-library-not-included` first.
  Criteria are not cross-library exports — to share guard logic across libraries,
  share a **concept** *only when it names one genuine clinical fact* (a
  library-qualified concept ref, per rung 1 — not a container for distinct-criteria
  guard logic, which would be the retired `defined as` composite), or delegate to a
  `use decision`; otherwise duplicate the guard inline.
- **Errors:** a cycle (`A` references `B` references `A`, or a self-reference) is
  rejected (`criterion-cycle`); using a criterion name where only a concept
  belongs — inside `defined as` / `sem-*`, a narrative, or a per-action
  `unless` / `only when` action guard — is rejected (`criterion-misuse`). A name
  is **either** a concept **or** a criterion, never both — a colliding
  declaration is a name-uniqueness error. These are hard errors even under soft
  validation: they are structural mistakes, not incomplete authoring.

## Four ways to combine conditions — and which to reach for

CRL gives four distinct mechanisms for putting conditions together. Choosing the
right one is the single most consequential authoring decision, because it decides
what a reviewer can *see* — and, for the `all:`/`or` interaction, what actually
fires. The boundary:

| You have… | Use | Lowers to | A reviewer sees… |
|---|---|---|---|
| **Conjuncts, or an `or` nested under an `and`, gating one rule** (shared branch, one disposition) | a **branch guard** — or a named **`criterion`** to factor a reused/large-`or` sub-term | `PlanDefinition.action` structure | each INLINE atom in the branch's guard box; a named `criterion` as one identifier condition (its atoms in the criterion's define + use-site `input[]`, post-#236) |
| **An `or` of distinct criteria sharing one disposition, or criteria routing to *different* dispositions** | separate **`when` branches** | one branch node per criterion, each → one or more applicability actions | each criterion as its **own top-level node** |
| **Alternative *representations* of one fact** (two data forms of a single already-defined clinical fact) | **`defined as` / `sem-*`** | a CQL boolean (inference) | one fact; the representations are internal |
| **Reusable action-bearing logic** — a shared determination that yields recommendations | **`use decision`** | a referenced sub-`PlanDefinition` | a linked sub-decision, kept out of the DNF |

Three rules keep these from blurring:

**1. Distinct criteria compose in *structure*, never in *inference* (#168).**
Combining a policy's distinct criteria into a determination is *decision
composition* — express it with the decision structure (branch guards, sibling
branches, `use decision`), which lowers to `PlanDefinition.action` and stays
auditable. Never fuse distinct criteria with `defined as ( A sem-and B )` /
`( A sem-or B )` — that collapses them into one opaque CQL boolean, so the
decision has **zero** criterion nodes and a reviewer can't see which one failed.
`defined as` / `sem-*` is inference — it normalizes **one** criterion's
sub-representations into one fact (e.g. "viral suppression documented" = a
viral-load lab result OR a clinician chart note of the SAME suppression); it never
joins distinct criteria. The operational test anchors the fact OUTSIDE the label:
*name the one clinical reality the operands each record, without the composite's
own name.* Two SEPARATE events (failed drug therapy AND failed physical therapy —
each occurs independently, so they can hold at once) are DISTINCT criteria →
structure; alternative records of a SINGLE underlying occurrence (their records may
themselves coexist) are one fact → inference.

**2. `and` before disjunct-character — where the `or` sits decides the form.**
When an `or` is a **sub-term of a larger `and`** on one rule
(`( "A" or "B" ) and "C"`), it **must** be a branch guard: sibling branches can't
express it without duplicating the shared conjunct (`( "A" and "C" )` /
`( "B" and "C" )`), which also duplicates C's audit node. This structural rule
**wins** over the disjunct-character choice below. Only when the `or` is the
**whole** condition does the next rule apply.

**3. Guard-`or` vs sibling-`or` (whole-condition `or`): same `first:` lowering,
choose on audit granularity.** Under `first:`,
`- when ( "A" or "B" ) then recommend activity "X".` and the two sibling branches
`- when "A" then recommend activity "X".` / `- when "B" then recommend activity "X".`
emit the **same** disjunctive applicability arms — both stay auditable (this is
not the #168 line; both are structure, not inference). What differs is the
*authored / cockpit* shape: one branch with a guard box vs two top-level nodes.

> ⚠ This equivalence holds **only under `first:`**. Under `all:` (or flat), a
> guard-`or` branch wraps its arms in one `"any"` group and fires its body
> **once**; two same-disposition sibling `when`s under `all:` each fire, so the
> disposition can be produced **twice**. If both may independently fire and you
> intend a single disposition, use the guard; if you intend the branches to each
> act, use siblings under `all:` deliberately.

Given a whole-condition `or` under `first:`, choose:

- **Different dispositions → sibling branches under `first:`.** One guard has one
  body, so different outcomes force siblings; order them, because under `first:`
  precedence is part of the rule (an exclusion-then-approval ordering is a
  decision, not an accident).
- **An `or` of distinct, independently-meaningful criteria that each deserve
  their own top-level node → sibling branches** (the default for a coverage
  policy whose disjuncts a reviewer reads as separate qualifying pathways).
- **An `or` of interchangeable alternatives of one rule, sharing one body → a
  guard is fine** (DRYer; an inline guard boxes each atom in `PlanDefinition.action`).
  Promote the shared `or` to a named `criterion` when it recurs or needs arm-count
  relief — but note the promotion is **not** emit-neutral post-#236: a named
  criterion emits one identifier condition (its atoms in the define + use-site
  `input[]` + cockpit view-model node), whereas an inline guard emits per-atom
  action conditions. Both are faithful — an audit-granularity choice, not a
  fidelity one.

```
criterion "Failed Conservative Therapy":        // DISTINCT criteria (SEPARATE events) = or-guard
- when ( "Failed Drug Therapy" or "Failed Physical Therapy" ).

decision "Coverage Determination":              // DISTINCT criteria = structure (branch guard)
first:
- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" )
    then recommend activity "Medical Policy Determination"."Approve".
- otherwise then recommend activity "Medical Policy Determination"."Deny".
```

## Good examples

### `first:` over branches — ordered precedence (the coverage shape)
Exclusions are tested before the approval branch, so a denial wins by position.
```
decision "Stimulator Coverage":
first:
- when "Skull Or Vertebrae Fracture" then recommend activity "Deny".
- when "Tumor-Related Fracture" then recommend activity "Deny".
- when "Documented Fracture Nonunion" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```

### `all:` over branches — independent advisory rules
Every matching branch fires; no `otherwise` (a catch-all has no meaning when all
matches fire).
```
decision "Documentation Review":
all:
- when "Missing Imaging Report" then recommend activity "Request Imaging".
- when "Missing Therapy History" then recommend activity "Request Therapy History".
```

### Compound branch guard — `and`, and a parenthesized `(or) and`
```
decision "Advanced Imaging Coverage":
first:
- when ( ( "Documented Fracture Nonunion" or "Tumor-Related Fracture" ) and "Imaging Not Recent" )
    then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```
The `or` is a sub-term of the `and`, so it must be a branch guard (sibling
branches would duplicate `"Imaging Not Recent"`). Both disjuncts stay visible in
the emitted structure and the cockpit guard box.

### `criterion` — naming a guard reused across branches
```
criterion "Meets Coverage Preconditions":
- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ).

decision "Coverage":
first:
- when ( "Meets Coverage Preconditions" and "Imaging Not Recent" ) then recommend activity "Approve".
- when ( "Meets Coverage Preconditions" and "Prior Auth On File" ) then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```

### `any:` over actions — offered alternatives
Inside a matched branch; one of the recommendations suffices.
```
decision "Imaging Order":
first:
- when "Needs Advanced Imaging" then:
  any:
  - recommend activity "Order MRI".
  - recommend activity "Order CT".
  end.
- otherwise then recommend activity "No Imaging Indicated".
```

### `all:` over actions — all apply
```
decision "Denial Handling":
first:
- when "Not Covered" then:
  all:
  - recommend activity "Communicate Denial".
  - recommend activity "Record Rationale".
  end.
- otherwise then recommend activity "Approve".
```

### Per-action guards — `unless` / `only when`
Inside a multi-action `any:` / `all:` block, a menu item may carry an **action
guard** so the menu adapts per case — "offer this menu, minus the items this
patient can't have". (This is a *per-action* guard — a different construct from a
*branch* guard: it conditions one menu item, not the branch, and it is where the
decision layer's only negation, `unless`, lives. A `criterion` name is illegal
here — action guards take a plain concept.)

- **`unless "C"`** — drop this item when concept `C` holds.
- **`only when "C"`** — include this item only when concept `C` holds.

```
decision "Therapy Options":
- when "Has Indication" then:
  any:
  - recommend activity "Refer To Specialist".
  - recommend activity "Start Medication" unless "Medication Contraindicated".
  - recommend activity "Order Advanced Imaging" only when "Imaging Eligible".
  end.
```
Here `Refer To Specialist` is always offered; `Start Medication` is offered unless
contraindicated; `Order Advanced Imaging` is offered only when the patient is
eligible. If every item in the menu is guarded out, the branch produces nothing
(a runtime diagnostic) — keep at least one always-offered item when a disposition
is required.

Action guards **lower to FHIR** (`#224` iii.1): a guarded menu member emits its
own `PlanDefinition.action.condition[kind="applicability"]`. `only when "C"` emits
the same positive `text/cql-identifier` a branch atom does; `unless "C"` emits an
inline `text/cql-expression` `not "<Library>"."C"` — a single negated atom, library-
qualified so a downstream FHIR engine (`$apply`) resolves the concept in the plan's
library. The guard concept is also surfaced as a case-feature `input`, exactly like a
branch atom, so DTR asks for it. (Action guards are legal **only** on members of a
multi-action `any:` / `all:` block — rejected on an inline `when … then recommend …`
action, on an `otherwise` action, and on a single menu-less action; see the don't-case.)

### Nested `first:` and an `otherwise` carrying a body
A nested `first:` may omit `otherwise` when its branches are exhaustive.
```
decision "Coverage With Documentation Gate":
first:
- when "Has Exclusion" then recommend activity "Deny".
- when "Meets Criteria" then:
  first:
  - when "Documentation Complete" then recommend activity "Approve".
  - otherwise then recommend activity "Pend For Records".
  end.
- otherwise then:
  all:
  - recommend activity "Deny".
  - recommend activity "Notify Provider".
  end.
```

### "Any one indication qualifies" — sibling `when` branches under `first:`
When several **distinct** criteria each independently establish coverage, and each
is worth surfacing as its own top-level node, give each its own `when` branch
under `first:`, all recommending the same disposition. First match wins (fine for
an exclusive Approve/Deny) and each criterion stays a top-level node. (Contrast a
branch guard `when ( "A" or "B" )`, which packs the same disjunction into *one*
branch — reach for that when the disjuncts are interchangeable alternatives of one
rule, or an `or` sub-term of a larger `and`; see "Four ways to combine
conditions". And do NOT fuse distinct criteria with `defined as ( A sem-or B )` —
that hides which one qualified, #168.)
```
decision "Coverage":
first:
- when "Has Hard Exclusion" then recommend activity "Deny".
- when "Documented Fracture Nonunion" then recommend activity "Approve".
- when "Failed Conservative Therapy" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```

### Nested `all:` over branches — independent sub-checks inside a matched branch
```
decision "Eligibility With Workup":
first:
- when "Not Eligible" then recommend activity "Deny".
- when "Eligible" then:
  all:
  - when "Needs Imaging" then recommend activity "Order Imaging".
  - when "Needs Labs" then recommend activity "Order Labs".
  end.
- otherwise then recommend activity "Deny".
```

## Don't-cases (and what to write instead)

### ✗ combine DISTINCT criteria with `defined as` (#168)
```
concept "Meets Criteria":
- defined as ( "Has Qualifying Diagnosis" sem-and "Failed Conservative Therapy" ).
decision "Coverage":
first:
- when "Meets Criteria" then recommend activity "...Approve".
- otherwise then recommend activity "...Deny".
```
"Has Qualifying Diagnosis" and "Failed Conservative Therapy" are **distinct criteria**
fused by inference — the decision has **zero** criterion nodes, so a reviewer/cockpit
can't see which one failed. **Do this instead:** compose them in *structure* — a
branch guard `when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" )`,
or nested `when` nodes (see "Four ways to combine conditions"). `defined as` is only
for normalizing ONE criterion's representations into one fact.

### ✗ file AND-composed distinct criteria as flat sibling branches
```
decision "Coverage":
first:
- when "Has Qualifying Diagnosis" then recommend activity "Approve".
- when "Failed Conservative Therapy" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```
These are two criteria that must **both** hold (an AND). Written as flat siblings
under `first:` they become an **OR** — either one alone approves. **Do this
instead:** put the conjunction in one branch guard
(`when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" )`) or nest
the second `when` inside the first's `then:` body. Flat siblings are for the
*OR*-of-distinct-criteria case, not the AND.

### ✗ a mixed `and`/`or` guard without parentheses
```
- when "A" or "B" and "C" then recommend activity "Approve".
```
There is no implicit precedence between `and` and `or`; the builder rejects a bare
mixed chain (*"mixed 'and'/'or' in a `when` guard requires parentheses"*). **Do
this instead:** parenthesize to say what you mean —
`when ( ( "A" or "B" ) and "C" )` or `when ( "A" or ( "B" and "C" ) )`.

### ✓ `not` in a branch guard (CRL #224 iii.3)
```
- when ( "Eligible" and not "Excluded" ) then recommend activity "Approve".
- when not "Meets Medical Necessity" then recommend activity "Deny".
```
`not` is supported and lowers structurally: De Morgan pushes it to the ref
leaves, and each negated literal emits a per-atom `not <ref>` applicability
condition (never a compound CQL boolean). A `criterion` ref is itself a leaf, so
`not "C"` is ONE `not "C"` condition — never De-Morganed into the criterion's
body (which stays structural inside its define). That is the #236 negation
advantage: inlining `not ( A and B )` would De Morgan into a 2-arm
`not A or not B`, while a negated criterion ref stays one leaf.
Semantics are strong Kleene, NOT closed-world (#189): `not unknown = unknown`,
so a criterion over an unanswered question halts the arm rather than firing it.
This is the emit-capable way to author a single-determination `first:` exclusion,
which a menu-member-only per-action `unless` cannot express.

### ✓ use a `criterion` to factor a large `or` out of the parent DNF (#236)
```
criterion "Left":  - when ( "A" or "B" or "C" or "D" ).
criterion "Right": - when ( "E" or "F" or "G" or "H" ).
decision "Coverage":
first:
- when ( "Left" and "Right" ) then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```
Post-#236 each `criterion` lowers to its own named boolean define, and the parent
guard `( "Left" and "Right" )` is a pure `and` of two identifier leaves — **one**
arm with two `text/cql-identifier` conditions, NOT the 4×4 = 16 inline arms the
same `or`s would materialize written directly in the guard. Each `or` lives inside
its define (`define "Left": Coalesce("A", false) or …`), emitted once; the atoms
remain visible in the define bodies + the use-site `input[]`. So a `criterion` is
both a *readability* aid and a genuine *arm-count* remedy for a reused or large-`or`
sub-term. (If you are still near the 256-arm envelope with a **faithful** *inline*
model, that is a capability gap: raise it and consult the authoring kit, which owns
factoring doctrine, rather than restructuring solely to satisfy the bound.)

### ✗ `any:` over `when`-branches
```
decision "Coverage":
any:
- when "Documented Fracture Nonunion" then recommend activity "Approve".
- when "Failed Conservative Therapy" then recommend activity "Approve".
```
Nondeterministic — if both match, which branch wins? **Do this instead:** give each
condition its own `when` branch under `first:` (each → the same disposition; first
match wins — see "Any one indication qualifies" above), or pack them into one branch
guard `when ( "Documented Fracture Nonunion" or "Failed Conservative Therapy" )`, or
use `all:` if every matching branch should independently fire. Do NOT fuse the
distinct conditions with `defined as ( A sem-or B )` — that hides which one matched (#168).

### ✗ `first:` over actions
```
- when "Needs Advanced Imaging" then:
  first:
  - recommend activity "Order MRI".
  - recommend activity "Order CT".
  end.
```
Actions carry no condition, so "first match" is meaningless. **Do this instead:**
use `any:` (offer either) or `all:` (do both).

### ✗ Mixed block — branches and bare actions together
```
- when "Eligible" then:
  all:
  - recommend activity "Communicate Approved".
  - when "Requires Prior Authorization" then recommend activity "Request PA".
  end.
```
Ambiguous: does the bare action always fire, or only as a fallback? **Do this
instead:** keep the block homogeneous — put the unconditional actions in their
own `all:` action block, and the conditional logic in a `when … then:` branch.

### ✗ `otherwise` outside a `first:` block
```
decision "Documentation Review":
all:
- when "Missing Imaging Report" then recommend activity "Request Imaging".
- otherwise then recommend activity "Documentation Complete".
```
A catch-all has no meaning under `all:` (everything fires). **Do this instead:**
wrap in a `first:` whose first branch is the composed "any missing" concept and
whose `otherwise` is the complete disposition.

### ✗ `first:` block with no `otherwise` (at the top level)
```
decision "Coverage":
first:
- when "Has Exclusion" then recommend activity "Deny".
- when "Meets Criteria" then recommend activity "Approve".
```
A claim that hits neither branch gets no disposition. **Do this instead:** add a
trailing `- otherwise then recommend activity "Deny".`.

### ✗ `otherwise` that isn't last
```
first:
- when "Has Exclusion" then recommend activity "Deny".
- otherwise then recommend activity "Approve".
- when "Meets Criteria" then recommend activity "Approve".
```
The branch after `otherwise` is unreachable. **Do this instead:** move
`otherwise` to the end.

### ✗ A qualifier on a single-member block
```
first:
- when "Has Exclusion" then recommend activity "Deny".
```
Vacuous — one branch has nothing to combine. **Do this instead:** drop the
qualifier (`decision "X": - when "Has Exclusion" then recommend activity "Deny".`),
or, if you want a disposition for the other case, make it a real `first:` with an
`otherwise`.

### ✗ A decision body of only `otherwise`
```
decision "Always Deny":
- otherwise then recommend activity "Deny".
```
That's an unconditional recommendation, not a decision. **Do this instead:** if
the logic is truly unconditional, model it as the `activity`/`use` directly.
