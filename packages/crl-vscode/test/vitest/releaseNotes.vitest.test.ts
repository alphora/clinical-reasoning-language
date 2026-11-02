import { describe, expect, it, vi } from 'vitest'
import { parseReleaseCatalog, releaseNotesAutoEligible, ReleaseNotesCoordinator, renderReleaseNotesHtml, renderReleaseNotesMarkdown, selectReleaseEntries, notesBaseVersion, validateReleaseMedia, type ReleaseNotesView } from '../../src/releaseNotes'

const raw = () => ({ baselineVersion: '0.14.10', deployedBaselineVersion: '0.14.11', releases: [11, 12, 13].map(n => ({ version: `0.14.${n}`, title: `Release ${n}`, features: [{ title: 'A feature', description: 'Use the new behavior.' }] })) })
const catalog = () => parseReleaseCatalog(raw())
const tick = () => new Promise(resolve => setImmediate(resolve))
function setup(running = '0.14.13', prior: unknown = undefined) {
  let seen = prior
  const deps = { loadCatalog: vi.fn(async () => catalog()), getSeen: () => seen, setSeen: vi.fn(async (value: string) => { seen = value }), open: vi.fn(async (_view: ReleaseNotesView) => {}), log: vi.fn() }
  return { deps, coordinator: new ReleaseNotesCoordinator(running, deps), seen: () => seen }
}

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
    const view = { runningVersion: '0.14.13', sinceVersion: '0.14.10', entries: parsed.releases, automatic: false }
    const html = renderReleaseNotesHtml(view, { nonce: 'safe', imageSource: 'vscode-webview://local', mediaUri: name => name.endsWith('.webm') ? 'data:video/webm;base64,AAAA' : 'vscode-webview://local/' + name })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('alt="An &quot;example&quot;"')
    expect(html).toContain('video controls preload="none"')
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
    const input = raw(); Object.assign(input.releases[0]!.features[0]!, { video: 'example.webm', poster: 'example.png', caption: 'A silent demonstration' })
    const parsed = parseReleaseCatalog(input)
    const text = renderReleaseNotesMarkdown({ runningVersion: '0.14.13', sinceVersion: '0.14.10', entries: parsed.releases, automatic: false }, { mediaUrl: () => 'https://example.test/notes.html', embedImages: false })
    expect(text).toContain('](https://example.test/notes.html)')
    expect(text).toContain('A silent demonstration')
  })
})

describe('Release Notes automatic eligibility', () => {
  const input = { ready: true, trusted: true, production: true, autoOpen: true, version: '0.14.13' }
  it('requires actual settled CRL readiness', () => { expect(releaseNotesAutoEligible({ ...input, ready: false })).toBe(false) })
  it('requires a stable installed version, production mode, trust, enabled setting and the opt-in default', () => {
    expect(releaseNotesAutoEligible(input)).toBe(true)
    for (const field of ['ready', 'trusted', 'production', 'autoOpen']) expect(releaseNotesAutoEligible({ ...input, [field]: false })).toBe(false)
    expect(releaseNotesAutoEligible({ ...input, version: '0.14.13-dev+abc.dirty' })).toBe(false)
  })
})

describe('Release Notes once-per-profile coordination', () => {
  it('waits for an eligible project, coalesces paints and uses deployed baseline on first use', async () => {
    const { coordinator, deps, seen } = setup()
    coordinator.onProject(false); await tick(); expect(deps.loadCatalog).not.toHaveBeenCalled()
    coordinator.onProject(true); coordinator.onProject(true); await tick()
    expect(deps.open).toHaveBeenCalledTimes(1)
    expect(deps.open.mock.calls[0]![0]).toMatchObject({ sinceVersion: '0.14.11', automatic: true })
    expect(deps.open.mock.calls[0]![0].entries.map(e => e.version)).toEqual(['0.14.13', '0.14.12'])
    expect(seen()).toBe('0.14.13')
    coordinator.onProject(true); await tick(); expect(deps.open).toHaveBeenCalledTimes(1)
  })
  it.each(['0.14.13', '0.14.14'])('does not auto-open or lower seen version %s', async previous => {
    const { coordinator, deps, seen } = setup('0.14.13', previous)
    coordinator.onProject(true); await tick(); expect(deps.open).not.toHaveBeenCalled()
    await coordinator.show(); expect(seen()).toBe(previous)
    expect(deps.setSeen).not.toHaveBeenCalled()
  })
  it('shows manual history on a development install without persisting a release identity', async () => {
    const { coordinator, deps, seen } = setup('0.14.12-dev+abc.dirty')
    coordinator.onProject(true); await tick(); expect(deps.open).not.toHaveBeenCalled()
    await coordinator.show()
    expect(deps.open.mock.calls[0]![0].runningVersion).toBe('0.14.12-dev+abc.dirty')
    expect(deps.open.mock.calls[0]![0].entries.map(e => e.version)).toEqual(['0.14.12', '0.14.11'])
    expect(seen()).toBeUndefined()
  })
  it('does not mark a failed open as seen or retry endlessly on paints; manual retry remains available', async () => {
    const { coordinator, deps, seen } = setup()
    deps.open.mockRejectedValueOnce(new Error('panel failed'))
    coordinator.onProject(true); await tick(); expect(seen()).toBeUndefined()
    expect(deps.log).toHaveBeenCalled()
    coordinator.onProject(true); await tick(); expect(deps.open).toHaveBeenCalledTimes(1)
    await coordinator.show(); expect(seen()).toBe('0.14.13')
    expect(deps.open.mock.calls[1]![0].sinceVersion).toBe('0.14.10')
  })
  it('records history only after the panel has been created and content assigned', async () => {
    const { coordinator, deps, seen } = setup()
    let finish!: () => void
    deps.open.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    coordinator.onProject(true); await tick(); expect(seen()).toBeUndefined()
    finish(); await tick(); expect(seen()).toBe('0.14.13')
  })
  it('runs a queued manual request even when the in-flight automatic open fails', async () => {
    const { coordinator, deps, seen } = setup()
    let fail!: (error: Error) => void
    deps.open.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    coordinator.onProject(true); await tick()
    const manual = coordinator.show()
    fail(new Error('Automatic opening deferred after settings changed'))
    await expect(manual).resolves.toBeUndefined()
    expect(deps.open.mock.calls.map(call => call[0].automatic)).toEqual([true, false])
    expect(seen()).toBe('0.14.13')
  })
  it('logs persistence errors without making a successfully opened manual command fail', async () => {
    const { coordinator, deps } = setup()
    deps.setSeen.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(coordinator.show()).resolves.toBeUndefined()
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('seen version'))
  })
})

describe('CRL version identity and persistence boundaries', () => {
  it.each(['6.4.46', '6.4.46-dev.1', '6.4.46+build.1', '6.4.46-dev.1+build.1'])('bounds full identity %s by its stable base', value => {
    expect(notesBaseVersion(value)).toBe('6.4.46')
  })
  it.each(['6.4', '06.4.46', '6.4.46+', '6.4.46-', '6.4.46 bad'])('rejects malformed identity %s', value => {
    expect(() => notesBaseVersion(value)).toThrow()
  })
  it('does not reject a visible manual view when its post-open history reread fails', async () => {
    let reads = 0
    const deps = { loadCatalog: async () => catalog(), getSeen: () => { if (++reads > 0) throw new Error('storage read failed') }, setSeen: vi.fn(async () => {}), open: vi.fn(async () => {}), log: vi.fn() }
    await expect(new ReleaseNotesCoordinator('0.14.13', deps).show()).resolves.toBeUndefined()
    expect(deps.open).toHaveBeenCalledOnce()
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('seen version'))
  })
  it('does not open or mark an empty automatic catch-up range', async () => {
    const { coordinator, deps, seen } = setup()
    deps.loadCatalog.mockResolvedValue({ ...catalog(), deployedBaselineVersion: '0.14.13' })
    coordinator.onProject(true); await tick()
    expect(deps.open).not.toHaveBeenCalled(); expect(seen()).toBeUndefined()
  })
  it('checks packaged media bytes and cumulative limits with the shared parser', () => {
    const c = parseReleaseCatalog({ ...raw(), releases: [{ version: '0.14.13', title: 'Media', features: [{ title: 'Feature', description: 'Sample', image: 'sample.png', alt: 'Sample' }] }] })
    expect(() => validateReleaseMedia(c, new Map([['sample.png', new Uint8Array([137,80,78,71,13,10,26,10])]]))).not.toThrow()
    expect(() => validateReleaseMedia(c, new Map([['sample.png', new Uint8Array([0])]]))).toThrow('signature')
    const huge = new Uint8Array(5 * 1024 * 1024 + 1); huge.set([137,80,78,71,13,10,26,10])
    expect(() => validateReleaseMedia(c, new Map([['sample.png', huge]]))).toThrow('budget')
  })
})

it('rejects a caption with no image or video, keeping HTML and Markdown equivalent', () => {
  const input = raw(); Object.assign(input.releases[0]!.features[0]!, { caption: 'Orphan' })
  expect(() => parseReleaseCatalog(input)).toThrow('orphaned')
})
