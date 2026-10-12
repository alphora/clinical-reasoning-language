# Nautilus batch-skill read-only rehearsal — 2026-10-11

Historical snapshot of the source-only auto-bleph pilot before KELP Add and before the revised [project flow](WORKFLOW.md). It rehearsed the then-current [orchestrator skill](nautilus-orchestrator/SKILL.md) up to its first mutation. No artifact branch, KELP state, assignment, Codespace or lifecycle status was changed during that rehearsal. The observations below are not current project state.

| Skill prerequisite | Observed state |
| --- | --- |
| Content repository | smile-digital-health/smile-demo-codification is reachable; main and staging exist. |
| Source-only artifact branch | artifact/auto-bleph is not among remote branches at this check. The repository root currently contains only README.md, kelp.project.json and Git controls. |
| Exact source | L34194 HTML/text/metadata identities are known from the committed smile-demo source snapshot and local readback, but have not been confirmed in the new artifact's KELP-managed src/source. |
| Selected pipeline | Candidate payload and 55-file manifest exist locally. They are not installed on an artifact branch. |
| Customer binding | Smile canonical, outcome, answer-domain and determination-resource authority is still pending; the candidate deliberately refuses scaffold while unapproved. |
| KELP readiness / Nautilus launch | The then-current skill expected a post-batch Ready-for-codify handoff. The operator has since replaced that sequence: Add enters Ready to codify, and completed preparation enters Nautilus staged. No callable live preparation was exercised in this rehearsal. |

**Dry-run verdict:** stop before mutation. The skill's stated fail-closed path is appropriate for these missing prerequisites; calling this batch ready would be false. Once source intake, binding and interfaces exist, perform a real disposable pilot rehearsal of prepare, interrupt/resume and human launch with receipts. Until then the operator can use the pipeline owner's package checks and have Nautilus prepare nothing. This is an assessment of the skill's instructions, not proof that the installed Nautilus skill works.

The Nautilus checkout's own `.agents/skills/nautilus-orchestrator/SKILL.md` was also inspected read-only. It explicitly calls itself an integration candidate and requires proof of real preparation, interrupted resume and human launch. Its local branch and working tree are separate from this package; this document does not install, replace or certify that skill. The local Nautilus requirements also list the two-image layout, authoring admission interface and launched Codespace evidence as unqualified. The package owner's draft skill here is a proposed integration input, not the authoritative Nautilus implementation.

Two concrete reconciliation items remain before a live attempt: Nautilus's routing contract needs a frozen candidate descriptor that selects this exact package and approved Smile profile, and its current skill's Git preparation step names root `.claude/` but does not yet name the package's required root `.vibe-tools/` reviewer files. The first must be supplied after customer authority is resolved; the second must be included in the published-file manifest and branch verification.
