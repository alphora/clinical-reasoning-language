import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReleaseCatalog, validateReleaseMedia, renderReleaseNotesMarkdown, renderReleaseNotesHtml } from '../../src/releaseNotes'
// @ts-expect-error build-only validator executes immutable owner schemas
import { validateInstalledNotesMetadata } from '../../scripts/release-notes-contract/validate.mjs'

const raw = () => ({ baselineVersion: '1.0.0', deployedBaselineVersion: '1.0.0', releases: [{ version: '1.0.1', title: 'Release', features: [{ title: 'Feature', description: 'Sample' } as Record<string, string>] }] })
const descriptor = { schemaVersion: 1, displayName: 'CRL', version: '1.0.1-dev.1+build' }
const png = readFileSync(new URL('./fixtures/release-notes-1px.png', import.meta.url))

describe('Spaces pinned installed-package contract', () => {
  it.each([
    ['provider', 'ead05f45f65e4932807e21c75e6450e7673dc01ec317af5642419783b1f4227c'],
    ['catalog', '475cbe863dc86ebbee16e27dec085499f50ceab1d3a400bd77753c99c3429f48'],
  ])('keeps the supplied %s schema byte-for-byte', (name, hash) => {
    const bytes = readFileSync(new URL('../../scripts/release-notes-contract/' + name + '.schema.json', import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash)
  })
  it('accepts the three-key descriptor, empty catalogs and optional factual metadata', () => {
    expect(() => validateInstalledNotesMetadata(descriptor, raw())).not.toThrow()
    expect(() => validateInstalledNotesMetadata(descriptor, { baselineVersion: '1.0.0', releases: [] })).not.toThrow()
    expect(() => validateInstalledNotesMetadata(descriptor, { ...raw(), deployedBaselineVersion: '9.0.0' })).not.toThrow()
    for (const extra of [{ componentId: 'crl' }, { catalog: 'catalog.json' }]) expect(() => validateInstalledNotesMetadata({ ...descriptor, ...extra }, raw())).toThrow('schema')
  })
  it.each(['1.0.1-01', '01.0.1', '1.0.1-' + 'x'.repeat(64)])('rejects a nonconforming component identity %s', version => {
    expect(() => validateInstalledNotesMetadata({ ...descriptor, version }, raw())).toThrow('schema')
  })
  it.each(['x'.repeat(41), 'Two\nlines'])('enforces the descriptor display-name limit: %j', displayName => {
    expect(() => validateInstalledNotesMetadata({ ...descriptor, displayName }, raw())).toThrow('schema')
  })
})

describe('CRL content obeys the installed text/count contract', () => {
  it('counts Unicode code points rather than UTF-16 units', () => {
    const value = raw(); value.releases[0]!.title = '😀'.repeat(120)
    value.releases[0]!.features[0]!.description = '😀'.repeat(2000)
    expect(() => parseReleaseCatalog(value)).not.toThrow()
    expect(() => validateInstalledNotesMetadata(descriptor, value)).not.toThrow()
    value.releases[0]!.title += '😀'
    expect(() => parseReleaseCatalog(value)).toThrow('text')
    expect(() => validateInstalledNotesMetadata(descriptor, value)).toThrow('schema')
  })
  it.each(['\r', '\t', '\u0000', '\u007f', '\u2028', '\u2029'])('rejects prohibited controls in descriptions: %j', control => {
    const value = raw(); value.releases[0]!.features[0]!.description = 'Before' + control + 'after'
    expect(() => parseReleaseCatalog(value)).toThrow('text')
    expect(() => validateInstalledNotesMetadata(descriptor, value)).toThrow('schema')
  })
  it('permits LF in descriptions but not single-line fields', () => {
    const value = raw(); value.releases[0]!.features[0]!.description = 'First\nSecond\n\nParagraph'
    expect(() => parseReleaseCatalog(value)).not.toThrow()
    value.releases[0]!.title = 'First\nSecond'
    expect(() => parseReleaseCatalog(value)).toThrow('text')
  })
  it('keeps multiline descriptions plain in Markdown and describes a video-only poster', () => {
    const value = raw(); Object.assign(value.releases[0]!.features[0]!, { description: '# Heading\n1. item\n- item\n\n> Quote\n| table', video: 'sample.webm', poster: 'sample.png', alt: 'Poster description', caption: 'Clip caption' })
    const catalog = parseReleaseCatalog(value), view = { runningVersion: '1.0.1', sinceVersion: '1.0.0', entries: catalog.releases }
    const markdown = renderReleaseNotesMarkdown(view, { mediaUrl: name => name, embedImages: true })
    expect(markdown).toContain('\\# Heading  \n1\\. item  \n\\- item\n\n\\> Quote  \n\\| table')
    value.releases[0]!.features[0]!.description = 'Literal &copy;\n==='
    const literal = renderReleaseNotesMarkdown({ ...view, entries: parseReleaseCatalog(value).releases }, { mediaUrl: name => name, embedImages: true })
    expect(literal).toContain('Literal \\&copy;  \n\\=\\=\\=')
    const html = renderReleaseNotesHtml(view, { nonce: 'test', imageSource: 'data:', mediaUri: name => name })
    expect(html).toContain('aria-label="Poster description"')
    expect(html).toContain('controls muted')
  })
  it('enforces release and feature counts at their boundaries', () => {
    const value = raw(), release = value.releases[0]!
    release.features = Array.from({ length: 20 }, () => ({ title: 'Feature', description: 'Sample' }))
    value.releases = Array.from({ length: 100 }, (_, i) => ({ ...release, version: '1.0.' + (i + 1) }))
    expect(() => parseReleaseCatalog(value)).not.toThrow()
    value.releases.push({ ...release, version: '1.0.101' })
    expect(() => parseReleaseCatalog(value)).toThrow('100')
    value.releases.pop(); release.features.push({ title: 'Feature', description: 'Sample' })
    expect(() => parseReleaseCatalog(value)).toThrow('20')
  })
  it('requires video-only poster alt and caption and counts repeated media once', () => {
    const value = raw(); Object.assign(value.releases[0]!.features[0]!, { video: 'sample.webm', poster: 'sample.png', alt: 'Poster', caption: 'Demonstration' })
    const feature = value.releases[0]!.features[0]!
    expect(() => parseReleaseCatalog(value)).not.toThrow()
    delete feature.alt; expect(() => parseReleaseCatalog(value)).toThrow('text'); feature.alt = 'Poster'
    value.releases[0]!.features = Array.from({ length: 20 }, () => ({ ...feature }))
    const video = new Uint8Array(1024 * 1024); video.set([26, 69, 223, 163])
    expect(() => validateReleaseMedia(parseReleaseCatalog(value), new Map<string, Uint8Array>([['sample.png', png], ['sample.webm', video]]))).not.toThrow()
  })
  it.each(['Example.png', 'a..b.png', 'a'.repeat(65) + '.png'])('rejects a nonconforming media filename %s', image => {
    const value = raw(); Object.assign(value.releases[0]!.features[0]!, { image, alt: 'Image' })
    expect(() => parseReleaseCatalog(value)).toThrow('media filename')
  })
  it('permits bounded lowercase dotted filenames', () => {
    const value = raw(); Object.assign(value.releases[0]!.features[0]!, { image: 'hover.v2.png', alt: 'Image' })
    expect(() => parseReleaseCatalog(value)).not.toThrow()
    expect(() => validateInstalledNotesMetadata(descriptor, value)).not.toThrow()
  })
  it.each([[0, 1], [1, 0], [4097, 1], [1, 4097]])('rejects PNG dimensions %ix%i', (width, height) => {
    const value = raw(); Object.assign(value.releases[0]!.features[0]!, { image: 'sample.png', alt: 'Image' })
    const bytes = Buffer.from(png); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20)
    expect(() => validateReleaseMedia(parseReleaseCatalog(value), new Map([['sample.png', bytes]]))).toThrow('dimensions')
  })
})
