import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReleaseCatalog, renderReleaseNotesHtml, renderReleaseNotesMarkdown, selectReleaseEntries, notesBaseVersion, validateReleaseMedia } from '../../src/releaseNotes'

const raw = () => ({ baselineVersion: '0.14.10', deployedBaselineVersion: '0.14.11', releases: [11, 12, 13].map(n => ({ version: `0.14.${n}`, title: `Release ${n}`, features: [{ title: 'A feature', description: 'Use the new behavior.' }] })) })

const catalog = () => parseReleaseCatalog(raw())

describe('Release Notes content and selection', () => {
  it('selects every skipped release, newest first, and clamps to the running version', () => {
    expect(selectReleaseEntries(catalog(), '0.14.13', '0.14.10').map(e => e.version)).toEqual(['0.14.13', '0.14.12', '0.14.11'])
    expect(selectReleaseEntries(catalog(), '0.14.13', '0.14.11').map(e => e.version)).toEqual(['0.14.13', '0.14.12'])
    expect(selectReleaseEntries(catalog(), '0.14.12-dev+abc.dirty', '0.14.10').map(e => e.version)).toEqual(['0.14.12', '0.14.11'])
  })
  it('rejects duplicate/out-of-order versions and unknown fields', () => {
    const duplicate = raw(); duplicate.releases[1]!.version = '0.14.11'
    expect(() => parseReleaseCatalog(duplicate)).toThrow('ordered')
    expect(() => parseReleaseCatalog({ ...raw(), script: 'untrusted' })).toThrow('unsupported field')
  })
  it.each(['../image.png', 'https://example.test/image.png', 'image.svg', 'nested/image.png', 'x".png'])('rejects nonlocal or unsupported media: %s', image => {
    const input = raw(); Object.assign(input.releases[0]!.features[0]!, { image, alt: 'Example' })
    expect(() => parseReleaseCatalog(input)).toThrow('media filename')
  })
  it('requires image descriptions and a video poster/caption', () => {
    const input = raw(); Object.assign(input.releases[0]!.features[0]!, { image: 'example.png' })
    expect(() => parseReleaseCatalog(input)).toThrow('text')
    const clip = raw(); Object.assign(clip.releases[0]!.features[0]!, { video: 'example.webm', caption: 'A silent demonstration' })
    expect(() => parseReleaseCatalog(clip)).toThrow('media filename')
  })
  it('escapes authored content and offers offline controlled media without scripts or autoplay', () => {
    const input = raw(); Object.assign(input.releases[0]!.features[0]!, { title: '<script>alert(1)</script>', image: 'example.png', alt: 'An "example"', video: 'example.webm', poster: 'example.png', caption: 'Sample <artifact>' })
    const parsed = parseReleaseCatalog(input)
    const view = { runningVersion: '0.14.13', sinceVersion: '0.14.10', entries: parsed.releases }
    const html = renderReleaseNotesHtml(view, { nonce: 'safe', imageSource: 'vscode-webview://local', mediaUri: name => name.endsWith('.webm') ? 'data:video/webm;base64,AAAA' : 'vscode-webview://local/' + name })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('alt="An &quot;example&quot;"')
    expect(html).toContain('video controls muted preload="none"')
    expect(html).toContain('media-src data:')
    expect(html).toContain('style-src &#39;nonce-safe&#39;')
    expect(html).not.toMatch(/<script|autoplay|https?:\/\//)
    const local = renderReleaseNotesMarkdown(view, { mediaUrl: name => name, embedImages: true })
    const downloadable = renderReleaseNotesMarkdown(view, { mediaUrl: () => 'https://example.test/notes.html', embedImages: false })
    expect(local).toContain('](example.png)')
    expect(local).toContain('](example.webm)')
    expect(downloadable).not.toContain('![')
    expect(downloadable).toContain('](https://example.test/notes.html)')
  })
  it('links a video-only feature to the illustrated download in public Markdown', () => {
    const input = raw(); Object.assign(input.releases[0]!.features[0]!, { video: 'example.webm', poster: 'example.png', alt: 'Demonstration poster', caption: 'A silent demonstration' })
    const parsed = parseReleaseCatalog(input)
    const text = renderReleaseNotesMarkdown({ runningVersion: '0.14.13', sinceVersion: '0.14.10', entries: parsed.releases }, { mediaUrl: () => 'https://example.test/notes.html', embedImages: false })
    expect(text).toContain('](https://example.test/notes.html)')
    expect(text).toContain('A silent demonstration')
  })
})

describe('CRL version identity', () => {
  it.each(['6.4.46', '6.4.46-dev.1', '6.4.46+build.1', '6.4.46-dev.1+build.1'])('bounds full identity %s by its stable base', value => {
    expect(notesBaseVersion(value)).toBe('6.4.46')
  })
  it.each(['6.4', '06.4.46', '6.4.46+', '6.4.46-', '6.4.46 bad'])('rejects malformed identity %s', value => {
    expect(() => notesBaseVersion(value)).toThrow()
  })
})

  it('checks packaged media bytes and cumulative limits with the shared parser', () => {
    const c = parseReleaseCatalog({ ...raw(), releases: [{ version: '0.14.13', title: 'Media', features: [{ title: 'Feature', description: 'Sample', image: 'sample.png', alt: 'Sample' }] }] })
    expect(() => validateReleaseMedia(c, new Map([['sample.png', readFileSync(new URL('./fixtures/release-notes-1px.png', import.meta.url))]]))).not.toThrow()
    expect(() => validateReleaseMedia(c, new Map([['sample.png', new Uint8Array([0])]]))).toThrow('signature')
    const huge = new Uint8Array(5 * 1024 * 1024 + 1); huge.set([137,80,78,71,13,10,26,10])
    expect(() => validateReleaseMedia(c, new Map([['sample.png', huge]]))).toThrow('budget')
  })

it('rejects a caption with no image or video, keeping HTML and Markdown equivalent', () => {
  const input = raw(); Object.assign(input.releases[0]!.features[0]!, { caption: 'Orphan' })
  expect(() => parseReleaseCatalog(input)).toThrow('orphaned')
})
