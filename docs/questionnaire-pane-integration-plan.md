# MV `$apply`-Questionnaire pane — cockpit integration plan

**Status:** **BUILT.** Design converged round 1 (both arms); A-prime implemented and rendering end-to-end in
the VS Code web workbench against real `hcsc-content` and `iehp-content`.
**Branch:** `feat/mv-plandefinition-questionnaire` (15 commits, rebased on develop).
**Decision:** **A-prime** — data-only render message, shell owns the DOM. The iframe option is rejected on
evidence; see §4.

### What shipped, against what this plan proposed

| plan said | as built |
|---|---|
| pane id, TBD | `fhirQuestionnaire`, titled "Medical Validation - FHIR Questionnaire" |
| CSP relaxed for one pane | `cockpitPaneCsp(pane, …)`; only this pane gets `style-src 'unsafe-inline' <cspSource>` |
| vendor scripts in the pane shell | in the shell **`<body>`**, not `<head>` — LForms bootstraps against `document.body` |
| data-only render message | `{ type:"fhirQuestionnaire", key, label, q, qr, lookedFor }`, no `html` |
| mount gated on render identity | `key` = `library::caseId`; the shell skips remount when unchanged |
| Q/QR from the producer | reads the **real qa path** already; the producer just starts writing there |

Three things the plan did not anticipate, all found by running it:

1. `renderPane` had to be called on **case selection** — `rebuild()` alone runs before any case is focused.
2. `ensurePane` set **no `localResourceRoots`**, so the vendored bundles 404'd silently.
3. Diagnosing that needed **three** failure channels instrumented (404 / throw / CSP), not one — each is
   invisible to the others and all three present as "LForms is undefined".

## 1. The problem

The spike's renderer emits `<script>` tags. The cockpit delivers pane content via
`root.innerHTML = m.html` (`correspondenceCockpit.ts:5205`), and `<script>` inserted through `innerHTML` is
**never executed** — so the fragment works in the harness (`panel.webview.html`, a real document load) and would
silently render blank in the cockpit.

## 2. Verified facts this rests on

All checked against the source, not inferred:

- Each pane is its **own** `WebviewPanel` with its own `shellHtml()` document and CSP (`:2486-2495`).
  `shellHtml()` currently takes no arguments.
- CSP change needed is `style-src` only → `'unsafe-inline' <cspSource>`, replacing the nonce (a nonce present
  makes browsers ignore `'unsafe-inline'`). `script-src` stays nonce-only; `default-src` stays `'none'`.
  Measured clean on Desktop **and** the web workbench.
- The shell holds `acquireVsCodeApi()` in a closure local (`:5165`), unpublished.
- Bulk re-render paths: `renderPane` (`:1990`), `renderEmpty` (`:2181`), `rebuild` (`:2522`),
  `applyShowKeys` (`:4452`).
- `shouldRerenderQuestionnaire` (`questionnairePaneHtml.ts:354`) returns true only when
  `mode === "medical-validation" && paneOpen && nextCaseId !== prevCaseId`. It gates the **selection** path on
  case identity and therefore does **not** cover `rebuild`/`applyShowKeys`.
- **Snapshot is a non-issue.** The host posts `requestSnapshot` only to the tree pane (`:4512`) and accepts
  `snapshotDom` only when `pane === "tree"` (`:2273`). An earlier claim that the questionnaire fragment could
  leak into a customer artifact was **wrong** and is retracted.
- The shell's base style is `body{…;white-space:pre-wrap;…}` (`:4987`) — this **will** inherit into the LForms
  form and mangle its whitespace unless reset at the mount container.

## 3. The decision: A-prime

The vendored bundles live in the **pane's own shell document**, which is a real load, so they execute. The
crucial refinement over the naive version: **this pane does not receive `html` at all.**

- `shellHtml()` becomes `shellHtml(pane)`. For this pane only it emits the three vendored `<script>` tags
  (nonced; Zone.js first, then `lhc-forms.js`, then `lformsFHIR.min.js`), the stylesheet `<link>`, a mount
  container, and a first-party bootstrap. Every other pane's shell stays byte-identical.
- The render message for this pane carries **data only** — `{ q, qr, caseLabel, gen }`, no `html`.
- The shell branch renders its own trivial chrome and calls mount.

That deletes the whole problem class: there is no `innerHTML` swap for the mount to survive, no
mount-across-replacement lifecycle to get right, and no dead-script trap to reintroduce.

Mount lifecycle: mount/remount only when a **render identity** changes — `{caseKey, Q/QR revision}`. The
host-side `shouldRerenderQuestionnaire` gate is necessary but not sufficient (it is blind to `rebuild` and
`applyShowKeys`), so the shell keeps its own identity check as the backstop.

Styling, both concrete and cheap:

- Reset `white-space` on the mount container — the shell's `pre-wrap` would otherwise mangle the form.
- Demote LForms' 484 KB `styles.css` with a cascade layer (`@import url("styles.css") layer(lforms);` from a
  small wrapper) so unlayered cockpit rules always win. Shadow DOM is a **non-starter**: Angular Elements
  appends its runtime `<style>`s to `document.head`, which do not pierce a shadow root — wrapping the mount
  would break LForms rather than scope it.

Loading: vendor scripts may be injected lazily on first non-null Q/QR (created `<script>` elements with the
nonce attribute set do execute under nonce-only `script-src`). Optional — `retainContextWhenHidden` means the
one-off cost lands where nobody is waiting.

## 4. Why not the iframe

Rejected, and the reasoning is worth keeping because the idea will recur:

- Its headline benefit is **isolation the architecture already provides.** Every pane is its own document, so
  LForms CSS cannot reach the tree/CEL/source/worklist panes regardless. Inside the questionnaire document the
  only siblings are `#fcChrome` and `#flagDrawer`, both unused there. The collision surface is our own pane
  chrome — a one-line reset, not an architecture.
- Its mechanism is **unmeasured on the platform that decides.** On web the webview is itself an iframe on
  `vscode-cdn.net` with resource loads brokered by a service worker; whether a *nested* iframe's document and
  subresources ride that correctly is exactly what Desktop success would not predict. This codebase has already
  been burned twice by inferring instead of measuring (the two false-negative CSP readings).
- Its communication regime is **weaker, not merely longer.** The nested iframe gets no `acquireVsCodeApi` at
  all — no `getState`/`setState` for webview restore, DOM unreachable from the shell, so any future cross-pane
  reveal becomes a forwarded-message protocol instead of the house `scrollIntoView` pattern (`:5221`).
- It concentrates focus/keyboard/accessibility unknowns on a **browser-only clinical audience**.

If isolation ever tempts again, the cheap deciding move is to add an iframe rung to the existing CSP harness and
re-run the `serve-web` recipe. Do not adopt it on argument alone.

## 5. Still open — genuinely unresolved

1. **The data-loading path.** ~~A webview cannot call an MCP tool by name.~~ True but irrelevant — **nothing
   needs to speak MCP.** The extension host already imports core functionality directly
   (`mcp-server.ts` → `import { main, selfTest } from "@smile-digital-health/crl/mcp"`; other modules import
   `renderScenario`/`resolveCelImports` from `@smile-digital-health/crl`; the core package exports `.`,
   `./language-services`, `./mcp`, `./provenance`). The MCP server is one front-end over core code.

   **Asked of the emit side** (`tmp/HANDOFF-questionnaire-pane-to-emit-side.md`): implement the two tools'
   logic as core functions exported from `@smile-digital-health/crl`, with the MCP tools as thin wrappers. The
   pane's host then calls the core function — no protocol, no subprocess, one implementation.

   **Now BUILT, not open.** The host loads Q/QR straight off the qa path (§5a) with
   `loadFhirQuestionnaireCase`, so no tool is needed to render at all — the producer simply starts writing to
   the path already being read. Selection maps to `{library, caseId}` via the focused scenario, the case-slug
   glob tolerates the `-met`/`-unmet` suffix the directory carries and the case id does not, and the async post
   is **gen-guarded** so a slow load for case A cannot paint over a newly-selected case B. Load/unavailable
   states render a message naming the exact glob searched.

   Still wanted from the emit side (#277), but neither blocks: core-function exports with thin MCP wrappers, and
   a **render-identity key** (revision or content hash) to replace `library::caseId`, so remount tracks content
   rather than selection.
2. ~~**Questionnaire item types are unpinned.**~~ **SETTLED + BUILT.** The operator pinned the producer contract
   to **all R4 item types** (2026-08-17), so the CSP is now contract-bound rather than fixture-bound:
   `img-src <cspSource>` is in the policy for this pane, and an all-item-types measurement fixture exists
   (`--fixture all-types`) so the ladder is re-walked against the whole contract instead of `group`/`boolean`.

   The width is final: the vendored image set is closed (two local PNGs, no `@font-face`, no `data:` URIs, no
   remote host), so no `data:`/`blob:`/wildcard is warranted. `connect-src` stays shut — this pane does no
   computation, so it does no fetching.

   What that forced OUT of the producer contract, because each fails silently rather than loudly (all verified
   against the vendored bundle, see `unrenderableQuestionnaireFeatures`):

   | Must not emit | Why it cannot work here |
   |---|---|
   | `answerValueSet` (external **or** contained) | `loadAnswerValueSets` rejects with no network attempt when no terminology server and no FHIR context are configured — neither is, deliberately. `_expandContainedValueSet` still POSTs to a server rather than reading `expansion.contains` locally, so shipping the expansion inline is **not** an escape. |
   | `preferredTerminologyServer` | The one input that makes LForms actually fetch — which `connect-src` then blocks. |
   | `answerExpression`, `x-fhir-query` | SDC population extensions; both need a FHIR context this pane does not provide. |
   | `rendering-xhtml` / `rendering-markdown` carrying an image | The only `data:` image route in the bundle, and `img-src` excludes `data:`. |
   | item type `reference` | `_getDataType`'s switch has no case for it, so it returns the initializer `"string"` — not an LForms dataType (`ST` is). **Measured:** renders an empty text input that can never hold the `valueReference` answer. |
   | item type `url` | `_lformsTypesToFHIRFields` maps `URL → "Url"`, so LForms reads `valueUrl`; R4 `QuestionnaireResponse.item.answer` has no `valueUrl` (R4 uses `valueUri`). **Measured:** the control renders, the answer never populates. |

   Answer lists must arrive fully expanded as inline `answerOption`. Recorded on #277.

   Because every one of those degrades quietly, the constraint is **detected as well as documented**:
   `unrenderableQuestionnaireFeatures()` walks the parsed Questionnaire host-side and the pane shows a banner
   naming each breach above the form. The form still renders; the operator just sees which items will not.

   **The ladder was re-walked 2026-08-17** against the all-item-types fixture in the web workbench. Everything
   rendered and populated, the coded items pulled their autocompleter PNGs with **no CSP violation**, and
   nothing reached LForms' 6-second JSONP icon loader. Both degradations found were ones the static reading got
   WRONG, and both matter for the same reason — the control looks answerable while being permanently blank,
   which a reviewer reads as an unanswered question rather than an unsupported one:

   | Type | Predicted | Measured |
   |---|---|---|
   | `reference` | no widget at all | an empty **text input** that never populates |
   | `url` | renders normally | renders, but the answer **never** populates |

   That is the argument for the fixture pinning an expected OUTCOME per type rather than mere presence: a
   presence-only check would have called this run a clean pass.
3. ~~**Pane identity.**~~ **SETTLED + BUILT.** `fhirQuestionnaire`, titled "Medical Validation - FHIR
   Questionnaire", alongside the CRL Questionnaire pane rather than replacing it. Both panes are named by their
   SOURCE — what the CRL says vs what the emitted artifact produced — which is the point of showing both.

## 5b. SETTLED: the paneOrder setting is the source of truth

A change this plan did not foresee, forced by having two questionnaire panes (2026-08-16).

Panes used to be force-appended when a user's `paneOrder` omitted them, so **no pane could be turned off** —
asking for `[source, fhirQuestionnaire, tree]` silently returned the CRL questionnaire as well. New contract in
`normalizePaneOrder`:

- any **array** the user writes is honored **exactly**; nothing is appended;
- an **empty array** means an empty panel, not a repopulated default;
- `canonical` is only the **fallback** for a setting that is unset or not an array;
- MV therefore **defaults to all seven panes** — with nothing added back, a pane missing from the default would
  be undiscoverable.

Applied to the cockpit spec too, not special-cased to MV: two modes disagreeing about whether settings are
authoritative would be worse than either rule alone. Consequence accepted by the operator: an existing user
whose explicit order omitted a pane and relied on the append loses it.

## 5a. SETTLED: where the built Questionnaires live

**Operator decision (2026-08-16): they go in `qa`**, in the existing per-case directory:

```
tests/data/fhir/patient/<compartmentId>/questionnaire/<id>.json
tests/data/fhir/patient/<compartmentId>/questionnaireresponse/<id>.json
```

`<compartmentId>` is `celCaseCompartmentId(celLibraryName, caseName, subjectFactName)` — a 56-char-capped
slug of all THREE names plus a 12-hex hash. ⚠ DO NOT compose it from a library/case pair: that was the
layout before `0e7641da` merged the two segments, and every reader that kept composing it by hand
silently matched nothing. Read `ScenarioViewModel.compartmentDir` or `EmittedCase.compartmentDir`.

Why there rather than a new home:

- That directory is already keyed by exactly the `{libraryId, caseSlug}` identity the tools use, so
  `getQuestionnaireCase` becomes a read at a path it can derive.
- `qa` is already a KELP entity (folder `tests/data/fhir/patient`), so no new entity is needed — which HCSC KE
  flagged would otherwise be required to get them tracked.
- The layout already splits by `<ResourceType>/`, so `Questionnaire/` and `QuestionnaireResponse/` fit the
  existing convention rather than inventing one.
- MV already consumes patient data from this root, so the pane reads from where it already looks.

Accepted cost: generated artifacts sit beside hand-authored test data in the same tree.

**NOT** `src/fhir/` — that holds definitional resources only, and per #277 Questionnaires are generated by
`$apply` and never emitted from CRL, so putting them there would invent a convention rather than adopt one.

## 6. Not in scope

Read-only rendering (operator decision: interactive is acceptable). The producer, the two MCP tools, and the
`$apply` step — owned by the emit side. Progressive question reveal (later variant).
