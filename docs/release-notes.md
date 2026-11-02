# CRL Release Notes

CRL owns the illustrated editor tab, catalog and release downloads independently of KELP. In the Command Palette choose **CRL: Release Notes** (`crl.showReleaseNotes`). Disable automatic opening with `crl.releaseNotes.autoOpen`; manual reopening always remains available. The reader uses only bundled resources and does not run validation, authoring, $apply, provisioning or lifecycle actions.

## Opening and history

The VSIX is the automatic-presentation owner. The actual running extension version is displayed. Stable means canonical `x.y.z`; prerelease/build identities retain their full display string and use the stable base to bound manual history. Development/Test hosts never open automatically or write history, even with a stable manifest version.

Automatic opening waits for the existing CRL/CEL content discovery signal, workspace trust, Production host mode and the enabled preference. The extension itself being activated is the enabled condition; no separate crl.enabled preference is introduced. Trust grants and preference changes reconsider settled readiness. A removed workspace invalidates discovery and in-flight automatic opening. A plain workspace does not consume history; opening a CRL workspace later can show retained catch-up notes. Existing manual provenance opening also establishes CRL content readiness; notes preserve keyboard focus. Failed discovery stays ineligible.

| Invocation | Included versions, newest first |
| --- | --- |
| First automatic view in a profile | After the verified deployed baseline through the running version |
| Later automatic view | After the saved seen version through the running version |
| Manual view | All retained history through the running base version |

The profile-local key is `crl.releaseNotes.seenVersion`, is not synced, and does not read or migrate KELP keys. Empty automatic selection creates no view and writes nothing. Successful content assignment/reveal advances the marker; a failed open does not. Storage failures are diagnostic and do not invalidate an already visible view. Downgrades never lower the marker. Fresh Codespaces/profiles can have fresh history; concurrent windows can each open once. One automatic attempt per activation is coalesced, and an initially ineligible notification does not consume it. Once an eligible automatic attempt starts, loading failure or cancellation consumes that attempt until the next activation; automatic reconsideration applies to signals that have not yet started an eligible attempt. Manual requests remain available immediately after failure/cancellation.

## Authoring and exports

Edit `packages/crl-vscode/media/release-notes/catalog.json`. Keep ascending unique stable versions after `baselineVersion`, the retained history floor. Obtain `deployedBaselineVersion` from Spaces' actual target receipts each release; a GitHub tag is not deployment evidence. Record receipt/source/as-of in the release evidence. Reconcile differing targets explicitly, normally retaining catch-up since the oldest verified target. Never invent a receipt or silently raise the history floor above a supported deployment.

Each feature has a title and concise description. Optional screenshots must be PNG with descriptive `alt`. A video requires a PNG poster and visible caption plus descriptive text; use short silent VP8 WebM only where motion helps. Verify it has no audio track. Text, screenshot/poster and caption must explain the change without playback. No customer policy data, credentials or personal information. Capture the actual CRL renderer using synthetic content.

The directory contains exactly catalog.json, generated README.md, and referenced media. Text fields are nonempty and at most6000 characters; filenames are safe local names. Shared validation checks schema, file signatures and cumulative media budgets:5MiB total,1MiB video. Runtime checks diagnose corruption/package drift; CSP, disabled page scripts/command URIs and local resource roots are the resource boundary. Videos are cached per activation within the cumulative budget. Review actual base64-expanded HTML size and offline decoding.

Run `npm run notes:write -w crl-language-support`, review the generated README, then `npm run notes:check -w crl-language-support`. Ordinary/development packaging validates schema/media/README but does not require the current manifest's entry. Source catalog and bundled README deliberately retain future authored drafts; the installed reader never displays entries after the running base. Public preflight requires the latest entry to equal the release version. A rehearsal (`--mode dry-run`) requires its anchor entry but permits later drafts and excludes them from the export.

`node packages/crl-vscode/scripts/release-notes.mjs --export <output> [--mode publish|dry-run]` generates `crl-release-notes-<version>.html` and `.md`. The HTML embeds images/video and works offline after download; Markdown/GitHub copy links to that illustrated download, without private raw-media URLs. Both use the verified deployed-baseline catch-up range. Bundled README uses full authored history with relative media. The extension and publisher use the same CRL-owned parser, selection and renderers; esbuild is declared in the owning extension package.

Generate the actual GitHub body with `node packages/crl-vscode/scripts/release-notes.mjs --body <source-SHA> <body-path>`; this uses the same publish-mode content and puts its trusted source marker first. `npm run notes:export -w crl-language-support -- <output>` is the equivalent export command with an explicit destination. Run `npm run notes:release -w crl-language-support` for the strict current-release preflight.

Add both notes downloads to the existing explicit release asset set and SHA256SUMS. Existing asset names remain unchanged. The publisher-owned first GitHub-body line is `<!-- crl-release-source: <40-character source SHA> -->`, before any authored notes. Test with a raw hostile later marker, independent of Markdown escaping. Keep temporary body/export intermediates outside the upload allowlist. Before pruning history, reconcile oldest deployed targets and obtain product agreement; optional old media can be removed while retaining useful text.

## Qualification

Run the release skill's complete gates. Inspect the actual VSIX ZIP and compare catalog/media/README bytes against source. Exercise installed command/automatic opening, opt-out, trust/readiness, load cancellation, failures, history across skipped versions and development isolation. Use sequential normal isolated Code launches with the same profile: observe first opening, confirm persisted write, close, relaunch and verify no repeat. Never seed/edit the marker or rely on extensionTestsPath storage behavior. Verify manual reopening and version-fragment navigation in the actual script-disabled webview. Decode the portable HTML offline; play any authored video. Separately qualify the installed VSIX in the deployment-equivalent Codespaces editor with Spaces; local Code and a remote Linux suite are separate evidence.

The Spaces handoff names immutable source/tag, VSIX and engine URLs/SHA256, bundled server/driver hashes, notes downloads, one-line user summary and exact reopen label **CRL: Release Notes**. Track acknowledgment. A published software release, built image and deployed image are distinct states. Spaces owns deployment timing; customer notices require operator approval.

Reference adapted from KELP v0.14.13 source31af8916dd6a4b3c69ee4a92db8efef4f80e958c. No KELP runtime/package dependency.
