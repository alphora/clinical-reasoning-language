---
name: crl-north-star
description: Load the CRL north star before any CRL language, emitter, representation, or #189/emit-cluster work — and hand it to reviewers. Invoke at the START of every such round so you (and the panel) measure against how CRL actually works, not CQL idioms or chart-matching assumptions.
---

# CRL North Star — round-start protocol

You are about to do CRL language / emitter / representation / emit-cluster work. Before designing, coding, or
firing a review panel, **ground yourself (and the reviewers) in how CRL actually works.**

## Do this, in order

1. **Read `docs/CRL-NORTH-STAR.md` in full.** It is the authoritative model. Do not proceed on memory of an
   earlier version — the model has been gotten backwards before. The load-bearing points:
   - **The local domain code is the CANONICAL, PRODUCTION representation** CRL logic runs on — NOT a testing
     artifact. `source representation` + `coded from` is the OPTIONAL, ADDITIVE path (external data defaults
     the local concept when available). "Won't match a real SNOMED chart" measures the optional path and is
     usually irrelevant to local production-correctness.
   - **A concept is self-describing:** its declared **value type** decides whether a reduction is owed
     (scalar ⇒ explicit reduction required; record/record-set ⇒ publishes its records); its **cardinality**
     (`RecordSet | Record | Scalar`) is declared, not inferred from use; its CQL is **context-free**.
   - **The emitter manufactures nothing** — every set→scalar reduction is explicit.
   - **Closed-world:** absence = empty/false; explicit absence = an absence code (a record), not "unknown."
   - **Maturity:** PA is the deep, correct use case; QM *artifacts* are a provisional smoke test (don't
     anchor on them), but the *capabilities* they validated (`sem-and`/`sem-not`) are real.

2. **Hand the reviewers the same ground truth.** When you fire the vibe panel on CRL work, pair the CRL-domain
   lens so both arms are grounded by construction:
   - External arm: `ask_gpt56` with `mode: "crl-emit-v0.1.0"`.
   - Claude arm: `subagent_type: "vibe-reviewer-crl-emit"` (auto-generated from
     `.vibe-tools/prompts/reviewer-system-prompt-crl-emit-v0.1.0.md`; if that agent isn't listed yet, the
     workspace needs a restart — run the external arm alone on the lens and say the Claude arm was
     unavailable for that lens, per the orchestrator rules). The lens itself instructs the reviewer to read
     `docs/CRL-NORTH-STAR.md` first, so you do not need to paste the charter into the review message.
   Without a CRL lens, an ungrounded reviewer measures CRL against CQL idioms and produces wrong conclusions
   (this is why the lens exists — see the charter's efficacy note / disc 413 ROUND 2R).

3. **Keep the charter current.** If a round establishes a new load-bearing fact about how CRL works, update
   `docs/CRL-NORTH-STAR.md` (and the relevant memory) so the next round and the reviewers inherit it. The
   charter is the single source; `tmp/DECISIONS-*.md` and discussion files are working logs subordinate to it.
