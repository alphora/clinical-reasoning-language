---
name: crl-north-star
description: "Load the CRL north star before any CRL language, emitter, representation, or #189/emit-cluster work — and hand it to reviewers. Invoke at the START of every such round so you (and the panel) measure against how CRL actually works, not CQL idioms or chart-matching assumptions."
---

# CRL North Star - round-start protocol

1. Read `docs/CRL-NORTH-STAR.md` in full before CRL language, emitter, or representation work.
   Current operator intent governs; the charter and old design decisions are revisable. Distinguish
   behavioral requirements, proposals, measured implementation behavior, and unresolved interpretations.
   Existing CRL/CEL, tests, and goldens are unverified inputs until their intended behavior is established.
2. Give both reviewers the same current intent, actual proposal, before-state, and verification evidence.
   Use the matching CRL-domain lens `crl-emit-v0.1.0` under the active orchestrator's panel protocol.
   Discover callable reviewers and use the current client's runtime instructions; do not infer capability
   or model identity from a historical tool name. Report unavailable coverage accurately.
3. Keep the charter current when a decision changes. Follow stale-requirements to preserve before-state
   and reconcile active copies. Do not duplicate semantic doctrine here or in reviewer prompts: cite the
   current charter and flag conflicts explicitly. Reviewers may challenge it with a behavioral rationale.

The charter expresses the target; only appropriately scoped execution evidence demonstrates conformance.
