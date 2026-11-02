import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
// @ts-expect-error owning build script loads the same TypeScript content validator through esbuild
import { stageReleaseNotesProvider, renderBundledReadme, validateReleaseNotes } from '../../scripts/release-notes.mjs'
// @ts-expect-error Node-only archive verifier is the production post-package gate
import { verifyReleaseNotesVsix } from '../../scripts/verify-release-notes.mjs'

const png = readFileSync(new URL('./fixtures/release-notes-1px.png', import.meta.url))
async function fixture(version = '1.0.2-dev.1+local') {
  const root = mkdtempSync(join(tmpdir(), 'crl-provider-')), notes = join(root, 'source')
  mkdirSync(notes)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
  const catalog = { baselineVersion: '1.0.0', deployedBaselineVersion: '1.0.1', releases: [1, 2, 3].map(n => ({ version: '1.0.' + n, title: 'Release ' + n, features: [{ title: 'Feature', description: 'Sample', image: 'sample' + n + '.png', alt: 'Sample ' + n }] })) }
  for (const n of [1, 2, 3]) writeFileSync(join(notes, 'sample' + n + '.png'), png)
  const save = async () => { writeFileSync(join(notes, 'catalog.json'), JSON.stringify(catalog)); writeFileSync(join(notes, 'README.md'), await renderBundledReadme(notes)) }
  await save()
  return { root, notes, catalog, save, output: join(root, 'release-notes'), stage: () => stageReleaseNotesProvider({ packageRoot: root, notesDir: notes }) }
}
function clean(root: string) {
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing cleanup outside the owned temporary directory')
  rmSync(root, { recursive: true, force: true })
}

describe('installed Release Notes provider contract', () => {
  it('binds the exact component identity and delivers only retained nonfuture catalog/media bytes', async () => {
    const f = await fixture()
    try {
      const staged = await f.stage(); expect(staged.staged).toBe(true)
      expect(JSON.parse(readFileSync(join(f.output, 'provider.json'), 'utf8'))).toEqual({ schemaVersion: 1, displayName: 'CRL', version: '1.0.2-dev.1+local' })
      expect(JSON.parse(readFileSync(join(f.output, 'catalog.json'), 'utf8'))).toEqual({ ...f.catalog, releases: f.catalog.releases.slice(0, 2) })
      expect(readdirSync(f.output).sort()).toEqual(['catalog.json', 'provider.json', 'sample1.png', 'sample2.png'])
      expect(readFileSync(join(f.output, 'sample2.png'))).toEqual(png)
      expect(readFileSync(join(f.notes, 'catalog.json'), 'utf8')).toContain('1.0.3')
      // Rebuild after changing an artifact's version; stale delivered media must disappear.
      writeFileSync(join(f.root, 'package.json'), JSON.stringify({ version: '1.0.1' }))
      await f.stage(); expect(readdirSync(f.output).sort()).toEqual(['catalog.json', 'provider.json', 'sample1.png'])
    } finally { clean(f.root) }
  })
  it('omits empty development providers, clears stale output, and keeps public release checking strict', async () => {
    const f = await fixture('1.0.3')
    try {
      await f.stage()
      writeFileSync(join(f.root, 'package.json'), JSON.stringify({ version: '1.0.0-dev.1' }))
      expect(await f.stage()).toMatchObject({ staged: false })
      expect(existsSync(join(f.output, 'provider.json'))).toBe(false)
      expect(readdirSync(f.output)).toEqual([])
      await expect(validateReleaseNotes('1.0.0', { notesDir: f.notes })).rejects.toThrow('need an entry')
    } finally { clean(f.root) }
  })
  it('retains factual producer baseline metadata even if it is newer than a development anchor', async () => {
    const f = await fixture('1.0.2')
    try {
      f.catalog.deployedBaselineVersion = '1.0.3'; await f.save(); await f.stage()
      const delivered = JSON.parse(readFileSync(join(f.output, 'catalog.json'), 'utf8'))
      expect(delivered.deployedBaselineVersion).toBe('1.0.3')
      expect(delivered.releases.map((r: { version: string }) => r.version)).toEqual(['1.0.1', '1.0.2'])
    } finally { clean(f.root) }
  })
  it('restages dotted media filenames and rejects source directories or junctions before replacing output', async () => {
    const f = await fixture()
    try {
      f.catalog.releases[0]!.features[0]!.image = 'hover.v2.png'
      unlinkSync(join(f.notes, 'sample1.png')); writeFileSync(join(f.notes, 'hover.v2.png'), png)
      await f.save(); await f.stage(); await f.stage()
      const before = readFileSync(join(f.output, 'provider.json'))
      unlinkSync(join(f.notes, 'hover.v2.png')); mkdirSync(join(f.notes, 'hover.v2.png'))
      await expect(f.stage()).rejects.toThrow('regular file')
      expect(readFileSync(join(f.output, 'provider.json'))).toEqual(before)
      rmdirSync(join(f.notes, 'hover.v2.png'))
      symlinkSync(f.output, join(f.notes, 'hover.v2.png'), 'junction')
      await expect(f.stage()).rejects.toThrow('regular file')
      unlinkSync(join(f.notes, 'hover.v2.png'))
    } finally { clean(f.root) }
  })
  it('rejects unsafe output entries without deleting earlier generated files or following directory links', async () => {
    const f = await fixture()
    const outside = mkdtempSync(join(tmpdir(), 'crl-provider-outside-'))
    try {
      await f.stage(); writeFileSync(join(f.output, 'user.txt'), 'keep')
      await expect(f.stage()).rejects.toThrow('Unexpected entry')
      expect(existsSync(join(f.output, 'provider.json'))).toBe(true)
      unlinkSync(join(f.output, 'user.txt'))
      // Explicitly remove the verified generated test folder before creating the output junction.
      if (resolve(f.output) !== join(resolve(f.root), 'release-notes')) throw new Error('Unexpected test output')
      rmSync(f.output, { recursive: true })
      writeFileSync(join(outside, 'keep.txt'), 'keep')
      symlinkSync(outside, f.output, 'junction')
      await expect(f.stage()).rejects.toThrow('not a link')
      expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('keep')
      unlinkSync(f.output)
    } finally { if (existsSync(f.output)) { /* unlink a remaining junction before recursive cleanup */
      try { unlinkSync(f.output) } catch {}
    } clean(f.root); clean(outside) }
  })
  it('enforces provider metadata and per-PNG consumer limits before replacing valid output', async () => {
    const f = await fixture('1.0.3')
    try {
      await f.stage()
      const previous = readFileSync(join(f.output, 'provider.json'))
      for (const release of f.catalog.releases) release.features = Array.from({ length: 20 }, () => ({ title: 'Feature', description: '\u{1F600}'.repeat(2000), image: 'sample' + release.version.split('.').at(-1) + '.png', alt: 'Sample' }))
      await f.save(); await expect(f.stage()).rejects.toThrow('256 KiB')
      expect(readFileSync(join(f.output, 'provider.json'))).toEqual(previous)
      for (const [index, release] of f.catalog.releases.entries()) release.features = [{ title: 'Feature', description: 'Sample', image: 'sample' + (index + 1) + '.png', alt: 'Sample' }]; await f.save()
      const huge = Buffer.alloc(2 * 1024 * 1024 + 1); png.copy(huge); writeFileSync(join(f.notes, 'sample1.png'), huge)
      await expect(f.stage()).rejects.toThrow('2 MiB')
      writeFileSync(join(f.notes, 'sample1.png'), png)
      writeFileSync(join(f.root, 'package.json'), JSON.stringify({ version: '9'.repeat(4200) + '.0.0' }))
      await expect(f.stage()).rejects.toThrow('identify this CRL version')
    } finally { clean(f.root) }
  })
})

describe('actual compressed VSIX publication gate', () => {
  // Independent Python zipfile output, not the producer helper or verifier's ZIP library.
  const archives = JSON.parse(readFileSync(new URL('./fixtures/releaseNotesVsix.json', import.meta.url), 'utf8'))
  it('accepts an actual archive with the canonical manifest/catalog/media and no reader', async () => {
    const f = await fixture('1.0.3')
    try {
      const archive = join(f.root, 'candidate.vsix'); writeFileSync(archive, Buffer.from(archives.valid, 'base64'))
      await expect(verifyReleaseNotesVsix(archive, { packageRoot: f.root, notesDir: f.notes })).resolves.toMatchObject({ passed: true, version: '1.0.3', retiredReaderAbsent: true })
    } finally { clean(f.root) }
  })
  it.each([
    ['missingDescriptor', 'Missing or stale'], ['staleIdentity', 'Missing or stale'],
    ['unexpectedMedia', 'Unexpected provider'], ['duplicateDescriptor', 'Duplicate'],
    ['retiredSource', 'retired source'], ['retiredRuntime', 'retired reader/history'],
    ['staleMedia', 'expected bound'],
    ['retiredCommand', 'retired CRL reader'], ['retiredConfigurationArray', 'retired CRL reader'],
    ['retiredActivation', 'retired CRL reader'], ['retiredMenu', 'retired CRL reader'],
    ['retiredKeybinding', 'retired CRL reader'], ['retiredHistorySetting', 'retired CRL reader'],
    ['staleVersion', 'package version'],
    ['movedEntrypoint', 'entrypoint moved'], ['missingManifest', 'no extension manifest'],
    ['missingRuntime', 'missing its runtime'],
    ['vendoredAjv', 'unbundled dependencies'],
  ])('rejects %s archive drift', async (kind, diagnostic) => {
    const f = await fixture('1.0.3')
    try {
      const archive = join(f.root, 'candidate.vsix'); writeFileSync(archive, Buffer.from(archives[kind!], 'base64'))
      await expect(verifyReleaseNotesVsix(archive, { packageRoot: f.root, notesDir: f.notes })).rejects.toThrow(diagnostic)
    } finally { clean(f.root) }
  })
})
