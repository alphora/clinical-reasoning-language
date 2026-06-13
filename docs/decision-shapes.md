# Decision shapes — `first` / `any` / `all` / `otherwise`

How to structure a CRL `decision`: when does a branch fire, how do multiple
branches or actions combine, and how to write the catch-all. The grammar and
validator are the source of truth; this page is the authoring guide.

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
- A `then:` body (the colon form) is always closed by `- end`. The inline
  single-action form (`- when "X" then recommend activity "Y".`) has no `then:`
  and no closer.

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
  - end
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
  - end
- otherwise then recommend activity "Approve".
```

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
  - end
- otherwise then:
  all:
  - recommend activity "Deny".
  - recommend activity "Notify Provider".
  - end
```

### "Any one indication qualifies" — compose with `sem-or`, not `any:`-over-branches
When several independent findings each establish coverage, pre-compose them into
one concept and branch on that. (`any:` over branches is not allowed.)
```
concept "Any Qualifying Indication":
- type is Condition.
- defined as ( "Documented Fracture Nonunion" sem-or "Failed Conservative Therapy" ).

decision "Coverage":
first:
- when "Has Hard Exclusion" then recommend activity "Deny".
- when "Any Qualifying Indication" then recommend activity "Approve".
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
  - end
- otherwise then recommend activity "Deny".
```

## Don't-cases (and what to write instead)

### ✗ `any:` over `when`-branches
```
decision "Coverage":
any:
- when "Documented Fracture Nonunion" then recommend activity "Approve".
- when "Failed Conservative Therapy" then recommend activity "Approve".
```
Nondeterministic — if both match, which branch wins? **Do this instead:** compose
the conditions with `sem-or` into one concept and use a single `first:` branch
(see "Any one indication qualifies" above), or use `all:` if every matching
branch should fire.

### ✗ `first:` over actions
```
- when "Needs Advanced Imaging" then:
  first:
  - recommend activity "Order MRI".
  - recommend activity "Order CT".
  - end
```
Actions carry no condition, so "first match" is meaningless. **Do this instead:**
use `any:` (offer either) or `all:` (do both).

### ✗ Mixed block — branches and bare actions together
```
- when "Eligible" then:
  all:
  - recommend activity "Communicate Approved".
  - when "Requires Prior Authorization" then recommend activity "Request PA".
  - end
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
