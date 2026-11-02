# Release Notes provider contract v1

Spaces owns the combined **KALM AI: What's New** experience (`kalm.showReleaseNotes`) and the installed-package contract. CRL and KELP supply content only. The authoritative candidate is [Spaces 51222a74752d6700da271fea3055c7ddfa901f90](https://github.com/alphora/mv-spaces-medical-policy/tree/51222a74752d6700da271fea3055c7ddfa901f90/launcher). Its two schemas are vendored unchanged under `packages/crl-vscode/scripts/release-notes-contract/`, with recorded hashes. Spaces supplied `launcher/validate.cjs` SHA256 c3bd30fb0a49b36c03b4fc8b6c7a2825bb93d1bf0d5778016387213f981e9bc4 from the same commit. It passes the actual migrated private VSIX in public-validation mode, making v1 binding for CRL. This is not publication or combined-editor acceptance.

## Installed layout

The VSIX carries `extension/release-notes/provider.json`, `catalog.json` and referenced flat PNG/WebM media. Installed paths omit `extension/`. There is no provider ZIP, runtime registration/import, README or script in the delivered directory. Unreferenced files are ignored by the consumer; CRL deliberately produces and verifies only exact referenced files.

```json
{ "schemaVersion": 1, "displayName": "CRL", "version": "1.2.3" }
```

These are the descriptor's only keys. `displayName` is a single-line component name of at most 40 Unicode code points. `version` is a valid component SemVer string of at most 64 characters, exactly equal to the installed extension's package.json, including prerelease/build suffixes. The catalog path is fixed. Spaces identifies the provider by configured extension ID `smiledigitalhealth.crl-language-support`, rather than a descriptor componentId.

Both files are strict UTF-8 JSON without BOM. Descriptor limit is 4096 installed bytes; catalog limit is 262144 bytes. CRL stages deterministic JSON and validates it with the byte-identical owner schemas using build-only AJV2020. Actual archive bytes must equal that canonical output. The consumer reads through `extensionUri`/`workspace.fs` and resolves media with `asWebviewUri`; real Codespaces host placement/access remains Spaces' acceptance.

## Catalog, history and source policy

Installed catalog keys are `baselineVersion`, optional `deployedBaselineVersion` and `releases`. Unknown keys are invalid at every level. All catalog versions are canonical MAJOR.MINOR.PATCH, at most 32 characters. Releases are strictly ascending, unique, greater than the exclusive `baselineVersion`, and no greater than the provider's stable base. Suffixes stay in descriptor identity; a development `1.2.3-dev+abc` may carry its own `1.2.3` draft, never `1.2.4`.

`baselineVersion` is the retained-history floor. A consumer sinceVersion equal to it is covered; an older value indicates missing history. Releases with no user-visible notes need no entry. The installed contract permits an empty release list and does not require a current-version entry. Optional `deployedBaselineVersion` is ignored by the consumer, including when newer than a filtered development anchor; CRL never clamps its factual receipt.

CRL deliberately keeps stricter maintained-source/publication rules: nonempty source history, required receipt-backed deployedBaselineVersion within source history, and a current/latest entry for a public release. Portable exports use that verified receipt. These are source authoring rules, not additional requirements on other providers. Development builds filter source drafts through the actual base; no eligible history clears stale output and omits the descriptor. Spaces treats absence as no notes, without error or history update.

## Text, media and limits

At most 100 releases, each with 1–20 features. Release and feature titles are single-line plain text of at most 120 Unicode code points. Descriptions allow LF line breaks and paragraphs, at most 2000 code points. Image/poster alt and figure captions are single-line, at most 300 code points. CRL also requires nonblank source text. No CR, other C0 controls, DEL, U+2028 or U+2029; LF is allowed only in descriptions. Text is escaped in HTML/Markdown, never treated as authored markup.

Features may contain an image, video or both. Images require alt. Every video requires a PNG poster, alt and visible caption. With video only, alt describes the poster; with both, it describes the image and the caption describes the video. Captions without media and posters without video are invalid. Videos are controlled, muted and never autoplaying/looping.

Media names match `^[a-z0-9][a-z0-9._-]{0,63}\.(png|webm)$` and must not contain `..`. No directories, URLs or traversal. Referenced inputs must be regular files, not links. PNG signature and first IHDR dimensions are checked: positive width/height, each at most 4096; each PNG at most 2 MiB. WebM signature is EBML. Total distinct referenced media is at most 5 MiB and distinct video at most 1 MiB, each file counted once. Producer signature validation does not certify video codec: before adding a video, retain VP8/VP9 codec evidence and actual offline/host playback evidence. No video is currently shipped.

## Ownership and qualification

Producers do not launch notes, contribute a separate reader command/auto-open setting, or mutate old producer history. Old user-authored settings/keybindings can remain unresolved; CRL does not edit user configuration. Existing globalState stays inert. Spaces confirmed old separate-reader versions are not target customer inputs; historical release assets remain immutable.

Spaces configures `kalm.releaseNotes.providers: [{ extensionId, baseline }]`, owns `kalm.releaseNotes.autoOpen`, startup/preserveFocus, manual reopening and per-codespace/per-provider history. It chooses the consumer baseline from its actual deployment/configuration facts; producer deployedBaselineVersion is supplied as a portable-export receipt, not imposed as consumer configuration. It records only successfully rendered entries, never moves history backwards, and records nothing for missing/incompatible/over-limit providers. New/rebuilt codespaces can show notes again.

Provide Spaces the immutable CRL source/release, exact extension ID, VSIX/engine URLs and hashes, contained server/driver hashes, portable notes URLs, source receipt and retained floor, plus a short user summary. Obtain the owner validator receipt when available, then qualify the combined actual Codespaces launcher, both providers, media, auto/manual opening, opt-out, history and navigation before deployment. Software publication, an image build and a customer deployment are separate facts.
