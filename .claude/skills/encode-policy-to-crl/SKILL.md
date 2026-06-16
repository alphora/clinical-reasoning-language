---
name: encode-policy-to-crl
description: Encode a narrative clinical policy (medical-policy coverage / prior-auth document, CPG, or quality measure) into CRL + CEL. Use this whenever turning prose clinical logic into a `.crl` decision/concept model (and `.cel` cases), e.g. the HCSC medical policies. NOT for CQL→CRL (use cql-to-crl-transformer) — this is narrative→CRL.
---

# Encode a narrative policy → CRL / CEL

Turns a prose clinical policy into a runnable CRL decision model plus CEL test
cases. This is the repeatable form of the manual encoding work — follow it and
you should produce correct CRL **without** the back-and-forth that the protocol
below exists to prevent.

## CRITICAL — read before any encoding (these are the things that cost rework)

1. **PHASE 1 ONLY. Do NOT reason about FHIR/CQL emit.** You are producing the
   *authoring substrate* (CRL/CEL). Whether or how a construct lowers to FHIR/CQL
   is **phase 2 and out of scope here.** Never justify or reject a CRL modeling
   choice on emit grounds ("but the emitter does X"). If you catch yourself
   thinking about PlanDefinition / Library / selectionBehavior / `$apply`, stop —
   that is the wrong layer. (See memory `feedback_grammar-is-source-of-truth`.)
2. **The grammar + validator are the ONLY source of truth.** Docs, examples,
   USER_GUIDE, and comments can be stale. When unsure whether something is legal,
   check `src/grammar/CRLParser.g4` / `CRLLexer.g4` or run the validator — do not
   trust prose. Verify any file/keyword a memory cites still exists.
3. **Decisions branch on CLINICAL concepts, never on content-free wrappers.** A
   doctor doesn't ask "are all the criteria met?" — they reason over clinical
   states ("documented fracture nonunion", "tumor-related fracture"). Do NOT
   invent concepts like "Criteria Met" / "Eligible" that just wrap the answer.
4. **Validate as you go** with the `validate_crl` MCP tool, `soft: true` while
   concepts are still stubs — a clean parse with only `unresolved-reference`
   warnings is the expected step-1 state.
   **FIRST, sanity-check the validator is current:** run `validate_crl` on
   `src/tests/fixtures/policies/dme101-030/dme101-030.crl` (`soft: true`). If THAT
   fails to parse (e.g. `mismatched input 'first'`), the MCP server is a **stale
   build** — the decision grammar (`first:`/`any:`/`all:`/`otherwise`/`end`) isn't
   loaded. Then: trust the committed grammar + the DME fixture, tell the operator
   the MCP server needs rebuilding/restarting (memory
   `feedback_verify-mcp-vsix-before-release`), and **do NOT mutate correct CRL to
   appease the stale parser** — deleting `first:`/`otherwise` to make it parse
   produces wrong, catch-all-less logic. Stale tooling is an env defect, not an
   authoring error.

## Required reading (once per session)

- **[docs/decision-shapes.md](../../../docs/decision-shapes.md)** — the authoritative
  `first` / `any` / `all` / `otherwise` / `end` rules, the legality matrix, every
  combination, and the don't-cases. This is the settled decision-shape design; do
  not re-derive it. Mirror these shapes exactly.
- The decision/concept grammar in `src/grammar/CRLParser.g4` (decisionStatement,
  branchItem, blockBody, conceptStatement) and `CRLLexer.g4` (keywords).
- For implementing concepts (step 2), the **cql-to-crl-transformer** skill +
  `features/cql-pattern-mining/defined-as-is-semantic-composition.md` — `defined as`
  is SEMANTIC composition (author declares the result; `sem-and/or/not` do not
  type-check operands).

## Decision-shape cheat-sheet (grammar few-shot — but docs/decision-shapes.md wins)

```
decision "X":
first:                                  # ordered, first match wins (precedence)
- when "Concept A" then recommend activity "Y".
- when "Concept B" then recommend activity "Z".
- otherwise then recommend activity "Default".   # catch-all; REQUIRED at top level of a first: block; must be last
```
- **`first:`** over branches = ordered precedence (exclusions first → deny wins by position).
- **`all:`** over branches = every matching branch fires (independent advisory rules; no `otherwise`).
- **`any:`** over branches = ILLEGAL (nondeterministic). "any one indication qualifies" → compose
  with `sem-or` into one concept, then branch on that (see the "Any one indication qualifies"
  section of docs/decision-shapes.md). Name that composed concept for the clinical disposition it
  represents — `"<Device> Medical-Necessity Indication"` or similar — NOT "Criteria Met"/"Eligible".
  This is the one sanctioned near-wrapper: it exists because `any:`-over-branches is illegal, and it
  still names a clinical claim ("a qualifying indication is present"), so it does not violate rule 3.
- Over ACTIONS inside a `then:` body: **`any:`** = offer one, **`all:`** = do all. **`first:`** illegal.
- A `then:` body is closed by a dashless **`end`** (no period — structural delimiter like `any:`/`decision "X":`).
- Multi-member block ⇒ a qualifier is required; single-member ⇒ none. Blocks are homogeneous
  (branches XOR actions). `otherwise` only in a `first:` block.

## The encoding algorithm

Encode in this order. Do not jump ahead (e.g. don't decide asserted-vs-inferred while
sketching decisions — that's step 2).

Every `.crl` file starts with a `#` markdown header line and a `library "Name".` declaration
(required by the grammar `crl : HEADER libraryStatement …`), then the statements.

### Step 1 — Sketch the DECISION POINTS ONLY
Read the narrative and write the decision tree, referencing clinical concepts by name as
**stubs** (no concept declarations yet). For a coverage / prior-auth policy the leaves are the
determinations — model them as `activity` "communicate"-style nodes ("Communicate Approved" /
"Communicate Not Approved" — i.e. *medically necessary* / *not medically necessary*).

Shape it as precedence: **test exclusions first (they deny), then the qualifying indication(s)
(approve), then `otherwise` (deny).** Use `first:` + `otherwise`. Leave the leaf activities as
two communicate nodes.

Validate (`soft: true`): expect a clean parse with `unresolved-reference` warnings for each stub
concept — that warning list IS your step-2 to-do list.

### Step 2 — Implement the concepts
For each stub, declare a concept. Pick the body kind from the narrative shape:
- **asserted** (`coded from "<Terminology>"`) — a single finding/condition/diagnosis the policy
  names directly (e.g. "a diagnosis of gestational diabetes"). `coded from` takes a **terminology
  reference, not an inline value set** — so for each asserted concept also declare a terminology:
  ```
  terminology "Gestational Diabetes VS":
  - valueset is `http://example.org/...`.   # real value-set id, or a stable placeholder if unknown
  concept "Gestational Diabetes As Only Diagnosis":
  - type is Condition.
  - coded from "Gestational Diabetes VS".
  ```
- **composition** (`defined as ( … sem-and/sem-or/sem-not … )`) — the narrative joins other
  concepts with AND / OR / NOT ("X **and** Y", "either X **or** Y", "X but **not** Y").
  `defined as` is SEMANTIC composition: the author declares the result `(type, valuetype)`;
  `sem-*` do NOT type-check operands (read `defined-as-is-semantic-composition.md`).
  **Compositions nest** via parentheses — an AND-group inside an OR is common:
  ```
  concept "Continuous Glucose Monitor Medical-Necessity Indication":
  - type is Observation.
  - value type is boolean.
  - defined as (
      ( "Diabetes Mellitus" sem-and "On Intensive Insulin Therapy" sem-and "Frequent SMBG Documented" )
      sem-or
      "Documented Problematic Hypoglycemia"
    ).
  ```
- **predicate** (`definition is <narrative>`) — a narrative predicate over a finding: `has`,
  `without documented`, `most recent`, `high`/`normal`, `active`, temporal windows
  ("within N weeks", "separated by N days"). Use when the policy qualifies a finding by
  recency/status/threshold/quantity rather than just its presence. **In a `definition is` body,
  every clinical term / acronym / mixed-case phrase must be a quoted concept reference**
  (`"HbA1c"`, `"SMBG"`); only lowercase grammar words (`has`, `most recent`, `at`, `of`, time
  units, numbers) may be bare — unquoted `HbA1c`/`CGM` will not parse.

Apply the cql-to-crl-transformer `(type, valuetype)` rules (invoke that skill for the hard cases).
Re-validate (no `soft`) — should be clean.

### Step 3 — Granularize where valuable
Break compound concepts into composed pieces when the narrative has structure worth naming
(e.g. "fracture nonunion documented by ≥2 radiograph sets ≥90 days apart" → a temporal predicate
composed with the base nonunion finding). Keep specializations only when commonly used AND
distinct in narrative; otherwise prefer the primitive (see memory `feedback_specialization-meta-pattern`).

### Step 4 — Write CEL cases (the oracle)
Author `.cel` facts + cases so each case asserts `result is "<decision>" is "<branch>"`.

- **`<branch>` is the NAME OF THE ACTIVITY the matched branch recommends** (e.g.
  `"Communicate Approved"`) — it must be an activity the decision can actually produce. cel-spec
  does NOT cross-check this label against the decision's branches, so a wrong string passes parsing
  silently — get it exactly right (copy the activity name from the `.crl`).
- **Define facts by LEAF/primitive concepts, not the composed indication.** Asserting a fact
  `defined by` the top-level `sem-or` indication makes the approve case tautological and skips the
  composition. For each approve path, assert the minimal primitive facts that satisfy it; for the
  no-indication deny, omit the qualifying facts; for an exclusion deny, assert the exclusion finding
  PLUS otherwise-qualifying facts (to prove precedence — the exclusion must win).
- Cover the approve path + each deny path (one per exclusion + the no-indication path).
- **Validate** with the `validate_cel` MCP tool (takes a `path`). (If a doc says there is no
  `validate_cel` tool, the doc is stale — the tool exists; grammar + tools are the source of truth.)

### Step 5 — Review & learn (the vibe loop)
A policy encoding is non-trivial + durable, so it runs the standard vibe cadence — the
medical-policy agents are first-class participants, not a side path (see vibe-tools
`protocols/contributing.md` §3):
- **Review.** Run the consultant loop per the per-todo cadence: the external reviewers
  (design/impl as applicable) **plus the `policy-encoding-reviewer` subagent** (clinical
  + decision-shape + CRL/CEL-idiom critique). Process every point accept/refine/reject;
  iterate to convergence.
- **Discussion.** Log the round(s) in `.vibe-tools/discussions/<NNN>-<topic>.md` like any
  other review.
- **Retro / tuning.** At convergence, capture a retro. Route proposed patches per the
  contribute-back protocol: patches to THIS skill or the `policy-encoding-reviewer`
  (domain) land in the CRL repo (`.claude/skills/` / `.claude/agents/`, tracked); generic
  patches (cadence, reviewer-format) go to vibe-tools. This is how the encoder + reviewer
  get tuned over time.

## Worked few-shot — HCSC DME101.030 (Ultrasonic Osteogenesis Stimulator)

Narrative (paraphrased): medically necessary when a fracture nonunion is documented AND the
fracture is not of the skull/vertebrae AND not tumor-related; not medically necessary if used with
another noninvasive stimulator.

**Step-1 output** (decision points only; concepts are stubs; exclusions tested first):
```
decision "Ultrasonic Osteogenesis Stimulator Coverage":
first:
- when "Fracture Of Skull Or Vertebrae" then recommend activity "Communicate Not Approved".
- when "Tumor-Related Fracture" then recommend activity "Communicate Not Approved".
- when "Concurrent Noninvasive Stimulator In Use" then recommend activity "Communicate Not Approved".
- when "Documented Fracture Nonunion" then recommend activity "Communicate Approved".
- otherwise then recommend activity "Communicate Not Approved".

activity "Communicate Approved":
- request CPGCommunicationRequest.
- with `Ultrasonic osteogenesis stimulator may be considered medically necessary.`.

activity "Communicate Not Approved":
- request CPGCommunicationRequest.
- with `Ultrasonic osteogenesis stimulator is not medically necessary.`.
```
This validates `soft` with four `unresolved-reference` warnings (the four stub concepts) → exactly
the step-2 work list. The fixture at `src/tests/fixtures/policies/dme101-030/` is intentionally
**at step 1** (concepts deliberately unimplemented) — so it shows the *shape* of a step-1 output,
NOT a finished file. Do not infer from it that a final model omits concepts; for concept bodies use
the Step 2 few-shot above, and treat the grammar + docs/decision-shapes.md as the authority for the
final file's structure.

## Escalation criteria — stop and ask the operator when

- The narrative is ambiguous about precedence vs. independent rules (e.g. could be `first:` or
  `all:`) and the clinical reading doesn't settle it. (Surface the choice; don't silently pick.)
- A construct the policy needs isn't expressible in the current grammar (a real substrate gap) —
  do not invent syntax; report the gap.
- A concept's `(type, valuetype)` is LOW-confidence per the cql-to-crl rules.
- You feel the pull to model something for emit reasons — that's the signal you've left phase 1.
