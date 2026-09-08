---
name: crl-kit-update
description: "Update or audit the CRL authoring kit using reviewed claims backed by tagged implementation tests and their actual examples. Use for kit changes, stale or conflicting KE guidance, and surveying CRL tests for missing teaching."
---

# CRL kit update

Keep the delivered kit coherent and grounded in executable examples. Existing
implementation tests supply the evidence; do not build a second suite that
reimplements the same behavior for the kit.

## Establish intent before promoting evidence

Apply `crl-north-star` and `stale-requirements` through this project's shared skill
entry points. Current operator intent governs. Existing CRL, tests, golden files
and the kit can all encode an incorrect design. A passing test establishes what
was measured, not what the language ought to mean.

For each proposed claim, compare intended semantics with the exact assertions.
Correct or remove misleading tests and fix implementation as warranted. Do not
preserve a wrong test to keep a kit claim green, promote a known defect into a
recommended pattern, or broaden a claim beyond its evidence. Record unresolved
behavior as a limitation with an owner/issue, not as successful teaching.

## Inventory once, then maintain it

Use `packages/crl/src/authoring-kit/tests/coverage.md` as the working coverage
ledger alongside the existing kit tests. Record the audited revision and scope.
If it does not yet exist, create it. Never treat an empty or partial ledger as a
complete audit.

For the initial survey:

1. Inventory every substantive claim in both assembled `cpg` and `prior-auth`
   payloads: summary, model, rules and clauses, boundaries, examples, reference
   artifacts, verification instructions, judge guidance and disposition model.
   Include MCP descriptions and linked active docs that repeat those claims.
2. Map each claim to existing behavioral tests before adding any test. Where a
   real behavior has no test, add coverage in its owning implementation suite.
   Process/source-fidelity guidance may require human review rather than an
   executable test; label that evidence honestly.
3. Survey every CRL test, including parameterized rows, for applicable teaching.
   Consolidate equivalent cases into one claim; record reasoned exclusions for
   internal mechanics, redundant cases and regression tests for known defects.
   File-level exclusions are sufficient only when the entire file has that
   character. Give unreviewed areas explicit status; do not hide them as excluded.

After the survey, inspect changed/new/deleted tests and their claim consumers on
each update. New cases need a claim or a reasoned exclusion. Changes to semantics,
assertions or input invalidate the affected mapping and example until reviewed.
This maintenance does not require rerunning unrelated behavior tests.

## Tag tests and reuse their inputs

Put a stable claim tag immediately above each relevant test declaration:

```ts
// @kit named-answer-options:qualification
it("<existing behavioral test name>", () => { /* existing test */ });
```

The prefix is an existing kit rule ID where possible; the suffix identifies a
distinct claim. A test may carry several tags, and several tests may support one
claim. A tag on a parameterized test covers its rows; describe meaningful limits
in the ledger. Tags are searchable links, not evidence that an audit ran.

For each claim record:

- Intended behavior and its basis in an operator decision or reviewed design.
- Kit locations and applicability: common core or a scoped use case.
- Exact test file/name(s), actual input fixture/constant and required config.
- Evidence level and its limits; test command, result and audited revision.
- The actual asserted observation supporting the bounded claim, including the
  relevant parameterized rows. A test name or a green suite alone is insufficient.
- Example source and how its identity with tested input is maintained.
- Status: verified, manual review, gap, or excluded with reason.

Reuse the actual CRL/CEL input from the behavioral test as the delivered example.
Prefer a shared fixture/string consumed by both the implementation test and kit
assembly. Keep production packaging independent of test runners: import a pure
fixture module, never a test file. If embedding requires copying, generate or
compare the embedded bytes from that source in a packaging check. Any excerpt
must identify its tested source and context; validate an excerpt claimed to be
standalone. Do not silently simplify away the condition the example demonstrates.

A unit assertion on emitted FHIR does not prove CQL execution. CRE does not prove
native `$apply`, pause behavior, or medical correctness. Preserve these boundaries
in the ledger and the kit's existing verification tiers.

## Teach one coherent language

Keep common language semantics in the shared core. Use small specializations for
application guidance, such as PA workflow; name their assumptions so the KE can
decide applicability. A specialization cannot redefine common semantics. Do not
put customer-specific requirements into the universal payload.

Compare the complete assembled payloads, not just edited rule strings. A rule,
example, summary, boundary, judge instruction or MCP description that contradicts
another is a defect. Correct every active copy, including tests pinning obsolete
teaching. A retired positive example is not preserved for compatibility.

Cover invalid forms and meaningful boundaries alongside successful examples.
Keep the delivered kit readable: one concise claim can summarize many tests;
the detailed mapping and exclusions stay in the repository ledger.

## Verify and deliver

Follow `AGENTS.md` for plan/code reviews and readable review records. Give the
panel the before-state, intended semantics, changed examples, evidence mappings
and unresolved gaps. Ask it to challenge tests that encode wrong intent as well
as conflicting claims. The author owns dispositions and verification.

Run affected implementation tests, existing kit/reference tests and packaging
checks. Metadata/ref/example-identity checks are appropriate; they must not
duplicate behavior implementation. Test a new stale-text guard against a known
bad sample to show it detects its claimed failure.

For a changed payload, advance `schemaVersion` once, update version history, read
both assembled payload diffs and repin both content hashes. Build and query the
actual MCP `authoring_kit` for each use case. A source change does not update an
installed kit. Release only within session authorization, using `crl-release`.

Report separately: skill created/updated; claims corrected and verified; census
coverage and remaining gaps; source kit identity; installed/released identity.
Do not claim a comprehensive kit until every applicable test has a disposition
and every substantive kit claim has reviewed evidence or an explicit limitation.
