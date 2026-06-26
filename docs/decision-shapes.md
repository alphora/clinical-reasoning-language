# Decision shapes — `first` / `any` / `all` / `otherwise`

How to structure a CRL `decision`: when does a branch fire, how do multiple
branches or actions combine, and how to write the catch-all. The grammar and
validator are the source of truth; this page is the authoring guide.

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
  already exhaustive).
- A `then:` body (the colon form) is always closed by `end.` — a dashless,
  context-free closer; the trailing period keeps every CRL line ending in `.`
  (leaf) or `:` (opener). The inline single-action form
  (`- when "X" then recommend activity "Y".`) has no `then:` and no closer.

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
Inside a multi-action `any:` / `all:` block, a menu item may carry a guard so the
menu adapts per case — "offer this menu, minus the items this patient can't have":

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

Guards are legal **only** on members of a multi-action `any:` / `all:` block. They
are rejected on an inline `when … then recommend …` action, on an `otherwise`
action, and on a single (menu-less) action — see the don't-case below. The guard
concept resolves like any other reference (an unknown concept is an unresolved
reference).

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
When several **distinct** criteria each independently establish coverage, give each its
own `when` branch under `first:`, all recommending the same disposition. First match
wins (fine for an exclusive Approve/Deny) and each criterion stays an auditable node.
(`any:` over branches is not allowed; and do NOT fuse distinct criteria with
`defined as ( A sem-or B )` — that hides which one qualified, #168. `defined as`/`sem-or`
is only for alternative REPRESENTATIONS of ONE criterion — see "Decision composition is
the decision TREE" below.)
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

### Decision composition is the decision TREE, not `defined as` (#168)
Combining a policy's **distinct criteria** into a determination is **decision
composition** — express it with the decision STRUCTURE, never with `defined as`:
nested `when`s = AND; sibling `when` branches under `first:` (each → the same
disposition) = OR; `otherwise` = NOT; `first:` = precedence; a reused sub-tree = a
referenced sub-`decision` (`use decision`). (`any:` is over ACTIONS only, never an OR
over `when` branches — see decision-qualifiers.) Each criterion is its own `when` node,
so a reviewer/cockpit can see **which** criterion failed. `defined as` / `sem-*` is **inference** — it normalizes ONE criterion's
sub-representations into one fact (e.g. "failed conservative therapy" = failed drug OR
physical therapy); it never joins distinct criteria. (See the
`criteria-decision-reference` exemplar; the WHO immunization fixtures are
criteria-as-nested-`when`s with zero composites.)
```
concept "Failed Conservative Therapy":          // INFERENCE: one criterion, two representations
- defined as ( "Failed Drug Therapy" sem-or "Failed Physical Therapy" ).

decision "Coverage Determination":              // DISTINCT criteria = nested `when` NODES (AND)
first:
- when "Has Qualifying Diagnosis" then:
    first:
    - when "Failed Conservative Therapy" then recommend activity "Medical Policy Determination"."Approve".
    - otherwise then recommend activity "Medical Policy Determination"."Deny".
    end.
- otherwise then recommend activity "Medical Policy Determination"."Deny".
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
can't see which one failed. **Do this instead:** author each criterion as its own
(nested) `when` node so the tree shows the decision logic (see "Decision composition is
the decision TREE" above). `defined as` is only for normalizing ONE criterion's
representations into one fact.

### ✗ `any:` over `when`-branches
```
decision "Coverage":
any:
- when "Documented Fracture Nonunion" then recommend activity "Approve".
- when "Failed Conservative Therapy" then recommend activity "Approve".
```
Nondeterministic — if both match, which branch wins? **Do this instead:** give each
condition its own `when` branch under `first:` (each → the same disposition; first
match wins — see "Any one indication qualifies" above), or use `all:` if every matching
branch should independently fire. Do NOT fuse the distinct conditions with
`defined as ( A sem-or B )` — that hides which one matched (#168).

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
