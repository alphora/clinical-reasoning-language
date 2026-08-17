# Vendored LForms runtime

Third-party, checked in deliberately. **Not an npm dependency** — see "Why vendored".

| field | value |
|---|---|
| package | [`lforms`](https://www.npmjs.com/package/lforms) (LHC-Forms, NIH/NLM Lister Hill Center) |
| version | **43.1.0** |
| npm tarball integrity | `sha512-Kt9KcVi2dZYWhUWoZk/DAOXX4/y/9jG0V51cbEMuxRYx6VrzlWlCOqzg3WkWW91rnwnF58pbmJcKkPLbfaMKxw==` |
| license | see `LICENSE.md` in this directory |
| total | 3.61 MB |

### Integrity — SHA-256 of every vendored byte

Nobody can review 3.6 MB of minified JS; the only reviewable property is **provenance**. Without these, a quiet
local edit to `lhc-forms.js` would be undetectable in review forever. Verify with
`Get-FileHash <file> -Algorithm SHA256` (or `sha256sum`), and update this table on every version bump.

| file | source path within the package | sha256 |
|---|---|---|
| `lhc-forms.js` | `dist/lforms/webcomponent/lhc-forms.js` | `2ef5a9e7219dd2f4f1145a2d5966e3c10d3b25ab59fe15f34c452b90cc3841b1` |
| `lformsFHIR.min.js` | `dist/lforms/fhir/R4/lformsFHIR.min.js` | `ce15679fbef5e130ec08ca08593757df29c3a08652700d23dd9bbe8e8e71bc9a` |
| `zone.min.js` | `dist/lforms/webcomponent/assets/lib/zone.min.js` ⚠ **not** beside the others | `71d535d91e868fff82124d19ac13ff2a5e98a2e38ef42f40f1c33e601158a034` |
| `styles.css` | `dist/lforms/webcomponent/styles.css` | `c276811f9dcee0a3b0e47d315aba202413eb7f02247027129749d59ddafd04c8` |
| `magnifying_glass.png` | `dist/lforms/webcomponent/magnifying_glass.png` | `1e9d2b5a2746facdd2836d8d0cb82aea5a1f023862d475023c3b4141033707f4` |
| `down_arrow_gray_10_10.png` | `dist/lforms/webcomponent/down_arrow_gray_10_10.png` | `632fa54a55ec849bc6b618ec2ac97c8ea448d64174abcb094f568569da179919` |

## Files and why each is here

| file | size | role |
|---|---:|---|
| `zone.min.js` | 36 KB | **Zone.js. Load it FIRST, before `lhc-forms.js`.** Lives at `webcomponent/assets/lib/` in the package. The concatenation deliberately excludes it — see the caution below. |
| `lhc-forms.js` | 1.85 MB | The renderer: `runtime + polyfills + main` concatenated, an IIFE (not an ES module), so one plain `<script nonce>` tag loads it. Do **not** also load `runtime.js`/`polyfills.js`/`main.js` — those are the un-concatenated alternative. |
| `lformsFHIR.min.js` | 1.30 MB | FHIR support, **R4 only**. R4 because that is our data model — the `$apply` harness runs `FhirContext.forR4Cached()` and invokes `applyR5`, which is the R5 apply semantics backported onto R4. The package also ships R4B/R5/STU3; we ship none of them. |
| `styles.css` | 484 KB | Global stylesheet. |
| `magnifying_glass.png`, `down_arrow_gray_10_10.png` | ~1 KB | Referenced from `styles.css`, so `img-src` must permit them. |

Source maps are **not** vendored — they are 10 MB each and dominate the package's 62 MB unpacked size.

## Why vendored rather than an npm dependency

Installing `lforms` pulls **62 packages** (the Angular tree) into `node_modules` and adds ~900 lockfile lines,
in exchange for four prebuilt files we copy verbatim. Vendoring drops the whole dependency graph and its
supply-chain surface, and makes what ships identical to what is reviewed.

The cost is that npm no longer tracks the version — hence this file. **Keep the version in the table above
accurate.**

## Updating

```
npm install --no-save lforms@<version>
# copy each file from the per-file source path in the integrity table above.
# ⚠ zone.min.js is NOT beside the others — it lives under webcomponent/assets/lib/.
# then: update the version, the npm tarball integrity, and ALL SIX hashes in this file.
```

Re-check three things on any update, because all are load-bearing and none is guaranteed by semver:

1. **That `zone.min.js` is still required and still excluded from the concatenation** — check the package
   README's "Using the LHC-Forms Web Component" list.
2. **That the bundles remain free of `eval(` and `new Function(`.** At 43.1.0 both `lhc-forms.js` and the R4
   bundle contain zero of each, which is why the webview does not need `unsafe-eval`. A future version that
   reintroduces either would force a CSP relaxation. Reproduce with:
   ```
   rg -c 'new Function\s*\(|[^.\w]eval\s*\(' lhc-forms.js lformsFHIR.min.js   # expect: no matches
   ```
3. **Re-walk the CSP ladder on BOTH platforms** using the harness and the `serve-web` recipe below. The
   Desktop/web parity observed at 43.1.0 is a measurement, not a guarantee.

## ⚠ `lhc-forms.js` is NOT self-contained — the trap this hit

The concatenated bundle opens with byte-identical content to `runtime.js`, and its size is almost exactly
`runtime + polyfills + main`. That makes it *look* self-contained. It is not: the vendor's build concatenates
everything **except `zone.min.js` and the FHIR support files**.

The failure is silent and misleading. Without Zone.js, `LForms.Util` still loads and works, so
`convertFHIRQuestionnaireToLForms`, `mergeFHIRDataIntoLForms` and `addFormToPage` all succeed and the container
gets a `<wc-lhc-form>` child — but Angular never bootstraps, the custom element never upgrades, and it paints
nothing. Measured symptom: `children=1, height=0px, visibleText=0 chars, firstChild=<wc-lhc-form>`, with **zero
CSP violations and no console error**. Every programmatic check passes while the pane is blank.

The package README's file list is the authority here, not inference from file sizes.

## CSP — MEASURED on BOTH platforms (LForms 43.1.0)

Walked with the dev harness (`CRL Dev: $apply Questionnaire CSP harness`) on Windows Desktop **and** in the
VS Code **web workbench** (via `code serve-web`, extension installed from a packaged VSIX — browser UI with a
server-side Node extension host, i.e. the codespace topology MV actually runs in).

| rung | policy | outcome (identical on both) |
|---|---|---|
| `cockpit-strict` | `default-src 'none'; style-src 'nonce-…'; script-src 'nonce-…';` | **14 violations.** 7 × `style-src-elem ← inline`, 7 × the paired element error. Form renders but visibly degraded — radios stacked vertically, labels wrapping mid-phrase. |
| `inline-style-only` | `default-src 'none'; style-src 'unsafe-inline' <cspSource>; script-src 'nonce-…';` | ✅ **clean.** Correct layout. `height=209px, visibleText=199, customElementDefined=true`. |

The two platforms agreed exactly, down to the rendered height. `cspSource` is
`'self' https://*.vscode-cdn.net` in both.

### Reproducing the web-workbench run

```
npm run package -w crl-language-support          # media/** ships; src/** does NOT (see .vscodeignore)
code serve-web --without-connection-token --accept-server-license-terms --port 8000
# browser → http://127.0.0.1:8000 → Extensions → "Install from VSIX…" → the .vsix → reload
```

⚠ Because `src/**` is excluded from the VSIX, anything the harness needs must be **bundled**, not read from
disk — the fixture is imported so esbuild inlines it. A disk read works dev-loaded and fails in the VSIX,
which is the only route into the web workbench.

**`style-src` is the only CSP change needed. It is NOT the only cockpit change needed — see the next section.**
`script-src` stays nonce-only (the vendored bundles carry zero `eval`/`new Function`), and `default-src` stays
`'none'`.

### ⚠ The CSP answer does NOT mean "the pane will work in the cockpit"

The harness loads the pane via `panel.webview.html = <full document>` — a real document load, where scripts
execute. **The cockpit does not use that path for pane content.** It sets each pane's shell once and then
delivers every render as a message handled by `root.innerHTML = m.html`
(`correspondenceCockpit.ts:5205`). Per the HTML spec, `<script>` elements inserted via `innerHTML` are **never
executed** — nonce or not, CSP or not.

So a fragment shaped like `renderApplyQuestionnairePane`'s current output would, in the cockpit, load its
`<link>` (link elements *do* work through `innerHTML`) and silently run none of Zone.js, LForms, or the
bootstrap. That is precisely the silent-blank-pane failure this spike exists to eliminate, reintroduced by the
delivery mechanism.

**The fragment shape is harness-only.** Cockpit integration needs script delivery redesigned, not just a CSP
line. The shape that works, given the structure below:

- Put the vendor `<script>` tags in the pane's **shell document** (`shellHtml()`), which IS a real document
  load, so they execute once.
- Have the shell **publish its `acquireVsCodeApi()` handle** — it currently keeps it in a closure local
  (`correspondenceCockpit.ts:5165`), and a second call throws.
- Carry the Questionnaire/QuestionnaireResponse as **message data**, not a `<script>` island, and trigger
  mounting explicitly after each `innerHTML` swap.

### Per-pane scoping: the relaxation need not touch other panes

Each cockpit pane is its **own** `WebviewPanel` with its own document and its own policy — `ensurePane()` calls
`createWebviewPanel("crlCockpit."+pane, …)` then `panel.webview.html = shellHtml()`
(`correspondenceCockpit.ts:2486-2495`). `shellHtml()` currently takes no arguments, so every pane gets the same
string; parameterizing it puts `style-src 'unsafe-inline'` in the LForms pane **only**, leaving
tree/CEL/source/worklist nonce-only.

So the blast radius is one read-only pane, not the cockpit. Residual risk there is modest: with `script-src`
nonce-only and `default-src 'none'` blocking img/font/connect, inline styles cannot exfiltrate — what is lost is
defense-in-depth against HTML injection, which the renderer's escaping covers.

Alternative worth evaluating at wiring time, because it solves the script-delivery problem *and* the scoping
problem together: an `<iframe>` inside the pane whose `src` is served from `cspSource` (needs `frame-src`). It
gets a real document load, so scripts execute, and it carries its own meta CSP while the parent stays
nonce-only. Note `srcdoc:`/`blob:` iframes **inherit** the parent policy, so it must be a served file.

`img-src ${cspSource}` **is** needed, and is now in the policy. It was absent for the original measurement and
that reading was correct but *not general*: the fixture contained only `group` and `boolean` items, which never
request an image, so no `img-src` violation could be reported at any rung on either platform.

The operator has since pinned the producer contract to **all R4 item types**, so the surface changed.
`magnifying_glass.png` and `down_arrow_gray_10_10.png` are referenced from `styles.css` and belong to the
autocompleter — `choice` / `open-choice` items pull them. Re-measure with the all-item-types fixture
(`npm run seed:questionnaire -- --root <repo> --all --fixture all-types`), not the basic one.

**Measured 2026-08-17, web workbench, all 16 non-abstract R4 item types: CLEAN.** Every type rendered, the
coded items pulled both PNGs, **no `img-src` violation and no violation of any other directive**, and nothing
reached the JSONP icon loader (no 6-second stall). Two types degrade for reasons unrelated to CSP —
`reference` renders an input that can never hold its answer, and `url` never populates because LForms reads
`valueUrl` while R4 answers carry `valueUri` — both detected and reported by
`unrenderableQuestionnaireFeatures()`. This is the first ladder reading taken against the full contract rather
than a `group`/`boolean` subset, and unlike the two false negatives below, LForms was definitely running: the
form painted with populated answers.

**The image set is CLOSED, so this needs no further widening.** Verified against the vendored files, not assumed:
`styles.css` contains exactly two `url()` references (both above, both local); there is no `@font-face` and no
font file anywhere in the bundle; there are no `data:` URIs; there is no remote asset host. Specifically **do not
add `data:`** — the only `data:` image route is markdown-it's link validator (`/^data:image\/(gif|png|jpeg|webp);/`
in `lhc-forms.js`), reachable solely through `rendering-markdown` / `rendering-xhtml` item text, which the
producer contract forbids and `unrenderableQuestionnaireFeatures()` detects and reports.

⚠ **`connect-src` stays shut, and that is load-bearing.** The bundles carry live network call sites (6 `.ajax(`,
5 `XMLHttpRequest`, 3 `fetch(` in `lhc-forms.js`; 8 `fetch(` in `lformsFHIR.min.js`) for ValueSet expansion and
external autocomplete. `$apply` runs upstream at build time and this pane loads two JSON files, so an outbound
request from a clinician's webview is out of scope by design.

⚠ **Two script-injection paths exist and are blocked by `script-src 'nonce-…'` — deliberately.** A dynamically
created `<script>` carries no nonce, so LForms' lazy FHIR-library loader (`loadFHIRLibs`) and its JSONP icon
loader cannot run. We pre-load `lformsFHIR.min.js` eagerly, so the first should never be reached. The JSONP icon
loader has a **6-second timeout**, so if some item type does reach it the symptom is a stall, not an error —
which is what the all-item-types measurement is for. Do **not** widen `script-src` to fix either; nonce-only
script is the strongest guarantee this pane has.

Why `'unsafe-inline'` rather than a nonce: LForms is an Angular Elements build and injects ~7 component
`<style>` elements at runtime, unnonced. A nonce cannot be attached to them from outside, and keeping the
nonce alongside `'unsafe-inline'` is useless — browsers ignore `'unsafe-inline'` for a directive that carries
a nonce, so the nonce must be dropped for the relaxation to take effect.

Possible future tightening, unverified: Angular's `CSP_NONCE` / `ngCspNonce` mechanism could in principle keep
styles nonce-only, but it must be supplied at bootstrap and we consume a prebuilt bundle, so it may not be
reachable. Worth revisiting before treating `'unsafe-inline'` as permanent.

### ⚠ Two earlier "clean at cockpit-strict" readings were FALSE NEGATIVES

Before `zone.min.js` was vendored, Angular never bootstrapped, so it never injected any styles — and the
harness correctly reported nothing blocked. A passing CSP result is only meaningful when the thing under test
is actually running. Check `customElementDefined=true` and a non-zero `height` before believing a clean run.

### Web workbench: CONFIRMED, no divergence

The usual warning — that the web workbench is stricter than Desktop and a Desktop pass proves nothing — was
worth heeding but did not bite here. Both platforms were measured and agreed. Re-measure on any LForms upgrade
using the recipe above; do not assume the parity holds.
