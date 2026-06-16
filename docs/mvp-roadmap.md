# CRL/CEL Authoring Environment — MVP Roadmap

> Status: roadmap (design-reviewed across multiple rounds; objective locked with the operator). Each ordered item gets its own design session before implementation. Living document.

## Objective
Build a **powerful, accessible, delightful authoring environment** for clinical-reasoning content (Medical Policy first; CPG & QM too). **CRL/CEL are the accessible authoring substrate; FHIR/CQL are emitted, less-accessible outputs.** Everything else (the CRE, the renderer, homeostasis, the Great Reef, mining, the classifier, the data-model declaration) are components/tools in service of the environment.

The **FHIR/CQL Clinical Reasoning Engine** (`$apply`/`$populate`/`$evaluate`, dynamic SDC Questionnaire generation) is **already built and OUT OF SCOPE**. We produce the *definitional* resources it consumes.

## The product IS this loop (agent + human, vibe-enabled)
1. Start from a **narrative** (a medical policy).
2. An **agent** generates CRL/CEL using every tool available — targeting 100% complete + accurate.
3. The **human validates** by running the CEL scenarios through the UI **as a "scenario runner / questionnaire"**.
4. On a gap, the human asks the **agent to fix** it.
5. If the agent can't, the human **directly edits CRL+CEL** in an integrated UI and sees the effect in the **scenario viewer in real time**.
6. When correct, **emit FHIR/CQL**.

**MVP = the smallest version of that whole loop, end-to-end, on one real policy.**

## Two stages (a sequencing strategy, not a wall)
- **Stage 1 — correct, *running* CRL/CEL:** the loop validates entirely in CRL/CEL land. The **CRE runs CEL cases against CRL logic and compares to `result is`** — that comparison is the correctness **oracle**, *not* the FHIR/CQL engine. This keeps the (out-of-scope) engine out of the inner loop and keeps it fast.
- **Stage 2 — correct FHIR/CQL emit:** the definitional resources the engine runs. Stage 1 is designed *with the CQL/FHIR targets in mind* so we don't author gaps we can't emit — enforced by a **CRE↔emit semantic-consistency golden check**.

(mymobiledoc is a *parallel* CRL-first authoring effort pushing **end-to-end** rather than staged. We prioritize **our** environment, not theirs — but we share the CRL language and the **same target policies**, so their reported gaps preview the shared substrate-completeness our policies will demand.)

## Architecture (three layers)
- **(a) Substrate:** CRL/CEL languages + the completeness to express a real policy (designed toward the CQL/FHIR targets).
- **(b) Agent toolbelt (MCP):** parse / validate / **run (CRE)** / **render scenario** / emit, plus (later) Reef-query / classify / mine — so the agent generates *and self-corrects*.
- **(c) Integrated human UI (VS Code):** edit CRL+CEL · run scenarios as a questionnaire · real-time viewer · agent-assist · large-tree navigation.

What already exists: CRL+CEL parsers/validators, all emitters (CQL, FHIR-def, CEL→instances), the MCP tools, a competent CRL editor. **Net-new for the whole loop = three things: the CRE, the scenario/trace view-model, the webview.**

## Development order (CRE is #1)
1. **CRE core (`decision.run`)** — headless interpreter: CRL decisions over CEL facts → result + per-node trace + `result is` pass/fail; MCP-exposed (`run_decision`); includes the **CRE↔emit golden check**. *The oracle; the only net-new semantics; predecessor of steps 3/4/5. → next design session.*
2. **Scenario/trace view-model + `render_scenario` MCP tool** — the stable CRE↔UI contract.
3. **Scenario-runner webview** — live re-run on `.crl`/`.cel` save (real-time viewer).
4. **CEL language services** (completion/hover/nav/diagnostics) — parallelizable from day one.
5. **Agent authoring playbook** — existing MCP tools + a hand-seeded concept set; **no Reef/classifier yet**.
6. **Emit-conformance** (Stage 2; #105/#106/#107; #103 is a tracked stand-in — see below).
7. **Pull-based completeness** — added only as a target policy demands it: grammar gaps (#78/#83/#81/#95/#99/#60), `metric` (#70), data-collection-intent (#80+#81), terminology *authoring*, homeostasis (#76), deploy-unit (#111/#112/#113), lifecycle/provenance (#61).

**Foundational / start now in parallel:**
- **Headless analysis/LSP extraction** — CRE + all language services live in one headless package consumed by the editors, MCP, and the future UI (kills the MCP-drift class of bug). Precede any repo split.
- **Data-model declaration (#1 item)** — `crl.model` (split: `fhirVersion` / `profilePackages` / `cqlModel`), validated against `crl.fhirDependencies`; shapes CEL profiles (Stage 1) + CQL `using` (Stage 2). Verify each IG ships usable CQL ModelInfo (spike).

**The Great Reef / targeted QM-mining** is *not* needed for the first loop demo (runs on existing corpus) but is the key enabler the moment the agent generates a *real* policy from narrative — sequenced right after the spine proves out, fed by **policy↔QM cross-reference** (CQL is a richer, more-correct source than narrative).

## Target fixtures
The acceptance fixtures are the curated HCSC medical policies (`kelp/tmp/hcsc-discover/extracted/*.docx`, ~20). **Pick the simplest real one** as the item-#1 (CRE) target; it bounds the CRE's evaluation scope and tells us which substrate gaps to pull first. Shared with mymobiledoc.

## Open design questions (resolved into specific items)
- **`any:`/`all:` default:** CRL default is `any:` (USER_GUIDE §Notes). Open: keep the default or **require explicit** for >1-action blocks. (Substrate-completeness design.)
- **Derived profiles (homeostasis):** ephemeral, surfaced as a **read-only non-`.crl` artifact** (a `StructureDefinition` view) — never generated `.crl` (it re-enters the resolver scan). No `profile` keyword. CaseFeature is the durable emit (deterministic canonical).
- **Data-collection intent / questionnaire:** a **new decision-node-level construct** (leaf/branch/policy; merges #80+#81), *not* the activity `with` clause. The renderer previews **intent only**, never engine fidelity.
- **Repo structure:** monorepo + headless package first; defer any UI-repo split until there's a forcing reason.

## Issue map
- **NEW — item #1:** "CRE: `decision.run` decision evaluator + `result is` oracle + emit golden-check."
- **#70** → split: keep the `metric` construct; the CRE is carved into the new issue.
- **#71** → phase: CEL language services (item 4) + scenario-runner webview (item 3).
- **#103** → reframed: `crl-logical-switch` is a **deliberate stand-in** (no official CPG selection-behavior extension exists yet); default is `any`; migrate to the CPG extension when it publishes. Downgraded from "critical silent bug."
- **#74** → deprioritized (mymobiledoc-specific MCP provisioning; migration-gated).
- **#80 + #81** → merge into the data-collection-intent construct.
- **Pull-based (item 7):** #60/#78/#83/#95/#99 (grammar), #76, #82, #61, #111/#112/#113, #72.
- **Inputs to the item-#1 design:** #99 (catalog/matcher reachability), #101 (`defined by` inferred concepts), #110 (clock seam), the cms22 corpus (construct coverage), the chosen HCSC policy.
- **KELP #553/#554** — downstream (the consuming runtime); coordinate, not blocking.
