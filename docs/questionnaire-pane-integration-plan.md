# MV `$apply`-Questionnaire pane — cockpit integration plan

**Status:** design converged (round 1, both arms). Follows the spike (`8786bc6`) and impl review (disc 439).
**Branch:** `feat/mv-plandefinition-questionnaire`.
**Decision:** **A-prime** — data-only render message, shell owns the DOM. The iframe option is rejected on
evidence; see §4.

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

1. **The data-loading path is unspecified, and it is the real gap.** Nothing in the cockpit loads Q/QR today,
   and a webview cannot call an MCP tool by name. Needs: which extension-host function loads them; how a cockpit
   selection maps to `{libraryId, caseSlug}`; whether the host reads artifacts directly or shares the tool's
   implementation; loading/unavailable/malformed/warning states; and **stale-result handling** when case A
   resolves after the user has selected case B (generation or case-identity check).
2. **Questionnaire item types are unpinned, so `img-src` is fixture-bound, not contract-bound.** The measured
   fixture is `group`/`boolean` only; `choice`/`open-choice` pull the vendored PNGs via `styles.css`. Either pin
   the accepted item types in the producer contract or schedule a re-walk of the ladder.
3. **Pane identity.** Operator has stated this is a configuration choice (which panes MV displays), not a
   deletion of the existing questionnaire pane — record the resulting `Pane` id, title and default MV pane set
   when the config is settled.

## 6. Not in scope

Read-only rendering (operator decision: interactive is acceptable). The producer, the two MCP tools, and the
`$apply` step — owned by the emit side. Progressive question reveal (later variant).
