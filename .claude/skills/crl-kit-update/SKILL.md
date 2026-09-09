---
name: crl-kit-update
description: "Maintain the CRL authoring kit from its last audited Git revision, reviewing changed tests and behavior against tagged claims and shared examples. Use for kit updates, stale or conflicting KE guidance, and coverage audits."
---

# CRL kit maintenance

Maintain one discoverable kit from reviewed implementation evidence. Reuse the
owning tests and their actual examples; do not create a second behavior suite.
This skill does not authorize publishing, committing, or contacting a KE.

The goal is a comprehensive, correct computable representation of source material
at L1 (narrative), L2 (semi-structured recommendations), or both. Do not require a
pre-existing L2 intermediate. L2 organizes clinical scenarios, decisions and actions
for communication between domain experts and KEs. See
[Boxwala et al. (2011)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3241169/).
Optimize retrieval and teaching for that goal. The current
JSON delivery and TypeScript content layout are revisable implementation choices,
not authority. A different final or intermediate format is welcome when it improves
KE comprehension or completeness while preserving evidence and one source of truth.

## Establish intent

Apply `crl-north-star` and `stale-requirements`. Operator intent governs. A passing
test measures an implementation; it does not establish the intended language.
Correct or remove wrong tests and fix behavior as needed before promoting it
into teaching. Record unresolved behavior as a limitation with an owner/issue.

## Start from the last completed audit

Read `packages/crl/src/authoring-kit/audit.json` and the authoritative coverage
ledger `packages/crl/src/authoring-kit/tests/coverage.md`. The other inventory,
reverse-map and survey files linked there are supporting evidence, not independent
audit status. Metadata points to the ledger; it does not duplicate claim records.

The stamp contains `auditedRevision`, `auditedSchemaVersion`,
`auditedContentHash`, `scope`, and `evidence`. These are distinct from the CRL
release version and the current kit content identity. `contentMatchesAudit`
means only that kit content matches the audited content. An implementation-only
change can invalidate evidence while leaving kit bytes unchanged.

Resolve the saved SHA and the intended target commit without checking out either:

```text
git rev-parse --verify <baseline>^{commit}
git rev-parse --verify <target>^{commit}
git merge-base --is-ancestor <baseline> <target>
git diff --name-status --find-renames <baseline> <target>
git diff --find-renames <baseline> <target> -- <relevant paths>
git status --short
git diff
git diff --cached
```

Use full resolved SHAs in the ledger. Quote shell arguments appropriately. For
machine parsing use `--name-status -z` rather than splitting paths on whitespace.
Do not silently replace a missing, shallow or non-ancestor baseline with HEAD.
Recover the recorded revision if available, or explicitly perform a new full
survey and explain why the prior baseline could not be used.

Review **all changed paths** first. Then inspect changed tests, parameterized
rows, fixtures, shared inputs, snapshots and helper/configuration dependencies.
Read both old and new paths for renames, and old content for deletions. Also
inspect implementation, compiler, runtime, dependencies and configuration changes
that have no corresponding test change. These can invalidate existing claims.
Uncommitted and untracked relevant work is pending scope, never an audited SHA.

For tag discovery use `git grep -n "@kit" <revision> -- <test paths>` at both
revisions. Inspect the assertion/input diff, not just the tag diff: unchanged tags
can support changed behavior. Join affected tags to their claims in coverage.md
and its reverse map. Report added/removed tags, claims losing an owning assertion,
unknown tags, and new/changed untagged test cases needing a disposition. Do not
repeat the entire old census when a reliable baseline and complete delta exist.

## Disposition every relevant change

Add one maintenance section to coverage.md with baseline, target, changed-file
inventory and evidence. Each affected claim or test case needs one of:

- **Kit updated:** intended behavior changed or teaching was absent/wrong; identify
  the canonical kit entry and exact owning assertions/examples.
- **Existing guidance sufficient:** show which claim still covers the changed
  assertion/input and why no wording/example change is needed.
- **Not author-facing:** give a reason (internal mechanics, redundant test,
  metadata-only stamp); do not exclude a whole file containing relevant cases.
- **Unresolved gap:** identify the missing evidence or behavior, its owner/issue
  and the explicit kit limitation. Never count unreviewed work as excluded.

For each claim retain intended semantics and their basis, exact test file/name,
asserted observation, meaningful parameterized rows, fixture/constant and required
project configuration, example identity, evidence tier and limits. Tags alone,
test names and suite pass counts are not evidence of the claim.

If an unresolved gap prevents the declared scope from being complete, keep the
prior stamp. An explicitly bounded limitation can be audited as a limitation;
it cannot be promoted to a verified behavior. Record the distinction.

## Bootstrap only when needed

Without a trustworthy baseline, inventory every substantive claim in the complete
kit: introduction, models, rules/clauses, limits, examples, reference artifacts,
verification guidance, judge rubric and disposition model. Include active MCP
descriptions/docs that repeat claims. Map to existing tests before adding any.
Survey every CRL test declaration and parameterized row for relevant teaching.
Give each a claim, a reasoned exclusion or explicit unreviewed/gap status. Process
and narrative-fidelity rules may need manual review; label that evidence honestly.

## Tag tests and reuse their inputs

Place a stable tag immediately above each relevant owning test declaration:

```ts
// @kit named-answer-options:qualification
it("<behavioral test>", () => { /* existing assertions */ });
```

Prefer an existing rule ID as prefix; suffix identifies the claim. Multiple tests
may support a claim and one test may support several. A parameterized declaration
tag covers its rows; record boundaries. Update/remove tags when their claims change.

Reuse actual CRL/CEL from the owning test as teaching. Prefer a shared pure
fixture/string consumed by both; never import a test runner into production.
If copying is necessary, generate or compare bytes against the tested input.
Label excerpts and preserve required context. Artifacts declare companion/import
IDs and tested `package.json` CRL configuration in `requires`; the emission gate
must materialize that same context, not an easier private setup.

Emitter assertions do not prove CQL execution. CRE does not prove native `$apply`
pausing or medical correctness. Preserve the existing independent proof tiers.

## Maintain retrieval as part of the content

There is one kit, with no CPG/PA/measure stage or use-case selector. Applicability
states the authoring intent and assumptions (including before required configuration
exists); it never filters content out. `emit_results.useCase` is a separate runtime
setting. Shared language semantics do not vary by application.

Keep canonical guidance in `packages/crl/src/authoring-kit/`. The index derives
from those sections, rules, examples and artifacts. Maintain stable IDs, task/topic
labels, plain-language and syntax aliases, and prerequisite links. New guidance
must be reachable. Retired terms should lead to replacements, with counterexamples
clearly marked. Do not preserve retired positive teaching for compatibility.

Review overview, search, entry and full together: full is the canonical export;
search gives discovery summaries; entry supplies complete guidance/prerequisites
with force definitions, resolvable invariant anchors and proof limits. A short
response must not imply the agent has read the full kit. `fullContentHash` names
the full content in every view; `contentHash` appears only in the full export.

Sweep for contradictions across rules, examples, summaries, boundaries, judge
instructions and MCP descriptions. Check implicit defaults as well as explicit
syntax; omitted fields can preserve retired models. Keep regression counterexamples
separate from recommended authoring. Scope and proof are independent dimensions.

## Verify, review, then advance the stamp

Follow AGENTS.md for plan/code review and readable responses/dispositions. Supply
before-state, intended semantics, changed examples, mappings and gaps. Challenge
tests that encode wrong intent as well as contradictory claims.

Run affected owning tests, kit/reference gates, build and actual MCP retrieval
checks. Verify search examples, prerequisite closure, content identity and
source/packaged delivery. No unrelated runtime rerun is required for a kit-only
change. For new stale-text guards, verify a known-bad sample fails.

For changed kit content advance `schemaVersion` once, describe the change, inspect
the full payload diff and repin its hash. Hash canonical content and navigation,
excluding audit metadata. A build must never advance an audit stamp automatically.

After review/checks complete, commit the reviewed content and ledger within session
authorization. Then stamp its **existing full commit SHA**, schema and content hash
in a separate metadata-only commit. This avoids a self-referential commit hash.
In that same metadata commit, finalize this maintenance section in coverage.md
with the literal target SHA, schema and content hash. A historical section must
not point only to the mutable current audit.json; later audits must not change
the identity of an earlier review interval.
The next delta will include that stamp commit; disposition it as metadata-only
after inspecting it. Do not blanket-ignore files or future changes by commit name.
Verify the stamp names the reviewed content and that `contentMatchesAudit` is true.
Run the explicit delivery gate `node scripts/export-authoring-kit.mjs <output-directory>`
from the built core package. It refuses stale or mismatched content before writing
the generated JSON and Markdown. Inspect the actual files and confirm their identity
matches the full MCP response. Resolve the stamped commit in Git and verify its
recorded content before delivery; the export's content check cannot certify unseen
implementation changes or replace this maintenance review.

A source update does not change an installed kit. Report skill/kit changes,
baseline/target and scope/gaps, validation/review, and source versus released kit
identities separately. Release only within authorization using `crl-release`.
