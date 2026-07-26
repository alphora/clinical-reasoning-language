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
  already exhaustive). `otherwise` carries **no** condition — it is
  unconditional by construction.
- A `then:` body (the colon form) is always closed by `end.` — a dashless,
  context-free closer; the trailing period keeps every CRL line ending in `.`
  (leaf) or `:` (opener). The inline single-action form
  (`- when "X" then recommend activity "Y".`) has no `then:` and no closer.

## Branch guards — a `when` can test a compound condition

A `when` branch does not have to test a single concept. Its condition is a
**monotone boolean** over concept (and `criterion`, below) references — `and`,
`or`, and parentheses:

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
- **There is no `not`.** Negation has no structural lowering at the decision
  layer (it would collapse a branch to a CQL boolean — see below). Exclude a
  case by ordering an exclusion branch first under `first:`, or by the
  per-action `unless` action guard (a different construct — see "Per-action
  guards").
- **A branch guard lowers to structure, never to CQL.** `and` becomes several
  ANDed applicability conditions on one action. `or` expands to
  disjunctive-normal-form arms whose *placement is context-sensitive*: under an
  enclosing `first:` the arms splice in as contiguous ordered siblings; under
  `all:` / flat / other contexts the arms are wrapped in one synthesized
  `cqf-applicabilityBehavior: "any"` grouping action (so exactly one arm
  applies). Either way the disjunction stays **visible and auditable** in the
  emitted `PlanDefinition.action` and in the cockpit's per-atom guard box — a
  reviewer sees *which* atom failed. This is the load-bearing property that
  separates a branch guard from inference (`defined as` / `sem-*`), which *does*
  collapse to an opaque CQL boolean. Keep decision logic in branch guards and
  branches; keep alternative-representation logic in `defined as`.

### The materialization envelope (a resource bound, not an authoring gate)

Because `or` expands to DNF arms, an `and`-of-`or`s multiplies:
`( "A" or "B" ) and ( "C" or "D" )` materializes 2×2 = 4 arms. The emitter caps
the materialized tree — **256 arms**, and (for `criterion` expansion) **1024
atoms** / **32 levels of nesting**. These are envelopes that keep emit from
exploding on a pathological tree; they are **not** an authoring-complexity gate,
and a faithful clinical model never approaches them.

If you ever do hit the cap, the emitter reports it
(`compound-guard-expansion-overflow` / `criterion-expansion-overflow`) rather
than emitting a truncated resource — and its guidance is deliberate: **a faithful
model that overflows is a capability gap, not an authoring error. Do not
restructure the decision solely to satisfy the bound.** Raise it, and consult the
authoring kit for factoring guidance. The kit — not this page and not the
emitter — owns the "too complex / how to factor" doctrine.

One thing the kit's guidance cannot be is "name the sub-expressions with a
`criterion`": a `criterion` inline-expands, so it does **not** reduce the
materialized count (see below). The only construct that keeps logic *out* of the
DNF is a `use decision` sub-decision — but `use decision` is an **action**, not a
condition, so it is available only when the source genuinely has a shared,
action-bearing sub-determination to delegate to (with its own dispositions). A
*pure guard* blowup (a boolean with no natural sub-decision) has no out-of-DNF
form today — that is exactly the capability-gap case to raise, not to paper over
by inventing a sub-decision that changes which disposition is produced.

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

(Note the criterion body composes two *distinct criteria* structurally, and one
of them — `"Failed Conservative Therapy"` — is itself an inferred fact defined
with `defined as`. That layering is the whole point: structure composes distinct
criteria; inference normalizes one criterion's representations. See "Four ways to
combine conditions".)

Syntax and semantics:

- **Declaration:** `criterion "Name": - when ( <condition> ).` — the outer
  parentheses are **required on the declaration** (the grammar demands them: they
  give the statement a clean edge, since `.` is also the qualified-ref
  separator). A `when` *branch* does not require parentheses for a single ref or
  a homogeneous chain. The body is the same monotone `and`/`or` condition a `when`
  branch takes — including references to *other* criteria.
- **Reference:** use the name in any branch condition — bare
  (`- when "Meets Coverage Preconditions" then …`) or inside a compound
  (`… and "Meets Coverage Preconditions" …`).
- **It inline-expands.** A `criterion` reference is replaced by its body before
  lowering, producing output **byte-identical** to hand-inlining the condition. A
  `criterion` is an authoring convenience — a *name* for otherwise-repeated
  branch-guard text — and nothing more. It changes **no** structural guidance:
  the atoms stay individually visible; a decision reads the same as if you had
  inlined it.
- **It is not an arm reducer.** Because it expands, factoring two 4-way `or`s
  into two criteria still materializes 16 arms. Reach for a `criterion` for
  *readability*, never expecting it to shrink the emitted resource (see the
  don't-case).
- **A criterion holds only branch-guard logic**, never actions. It cannot
  `recommend` or `use`; it is a boolean condition, not a sub-decision.
- **It is library-local.** A criterion is referenced **unqualified**; a
  library-qualified criterion reference (`"OtherLib"."X"`) is rejected as
  `criterion-misuse` ("cannot be library-qualified"). Criteria are not
  cross-library exports — to share guard logic across libraries, share a
  **concept** (which can be qualified) or delegate to a `use decision`.
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
| **Conjuncts, or an `or` nested under an `and`, gating one rule** (shared branch, one disposition) | a **branch guard** — or a named **`criterion`** if it recurs | `PlanDefinition.action` structure (one or more applicability actions per branch) | each atom, in the branch's guard box |
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
sub-representations into one fact (e.g. "failed conservative therapy" = failed
drug OR failed physical therapy); it never joins distinct criteria. The
operational test: *would a policy reviewer expect to see this disjunct as its own
criterion line?* If yes, it is a distinct criterion (structure). If the disjuncts
are two data encodings of a single fact the reviewer audits as one thing, it is
inference (`defined as`).

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
  guard is fine** (DRYer; the cockpit still boxes the atoms). Promote the shared
  `or` to a named `criterion` if it recurs.

```
concept "Failed Conservative Therapy":          // INFERENCE: one criterion, two representations
- defined as ( "Failed Drug Therapy" sem-or "Failed Physical Therapy" ).

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

> ⚠ **Emit status (as of this writing):** action guards are honored in CRE /
> scenario **execution**, but the FHIR emitter does **not yet** lower them — a
> guarded menu member currently emits into `PlanDefinition` **without** its
> condition (emit-lowering is a tracked follow-up). Until that lands, do not rely
> on an `unless` / `only when` guard being enforced by a downstream FHIR engine;
> a contraindication that must hold in the shipped artifact should be modeled as a
> branch instead. (Action guards are legal **only** on members of a multi-action
> `any:` / `all:` block — rejected on an inline `when … then recommend …` action,
> on an `otherwise` action, and on a single menu-less action; see the don't-case.)

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

### ✗ `not` in a branch guard
```
- when ( "Eligible" and not "Excluded" ) then recommend activity "Approve".
```
There is no `not` at the decision layer — negation has no structural lowering.
**Do this instead:** order an exclusion branch first under `first:`
(`- when "Excluded" then recommend activity "Deny".` ahead of the approval
branch), or, for a single menu item, use the per-action `unless "Excluded"`.

### ✗ expect a `criterion` to shrink the emitted arm count
```
criterion "Left":  - when ( "A" or "B" or "C" or "D" ).
criterion "Right": - when ( "E" or "F" or "G" or "H" ).
decision "Coverage":
first:
- when ( "Left" and "Right" ) then recommend activity "Approve".
- otherwise then recommend activity "Deny".
```
A `criterion` inline-expands, so this still materializes 4×4 = 16 arms — naming
the ORs changed nothing structural. **Do this instead:** the criterion is fine as
a *readability* aid — just don't reach for it expecting arm reduction. If you are
genuinely near the 256-arm envelope with a **faithful** model, that is a
capability gap: raise it and consult the authoring kit (which owns factoring
doctrine), rather than restructuring solely to satisfy the bound. Only a
`use decision` keeps logic out of the DNF, and only when the source has a real
action-bearing sub-determination to delegate to.

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
