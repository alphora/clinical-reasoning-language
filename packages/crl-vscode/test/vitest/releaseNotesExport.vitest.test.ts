import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
// @ts-expect-error shared publisher script uses the production TypeScript renderer via esbuild
import { renderBundledReadme, validateReleaseNotes, exportReleaseNotes, releaseBody } from '../../scripts/release-notes.mjs'

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'crl-notes-fixture-'))
  const input = { baselineVersion: '1.0.0', deployedBaselineVersion: '1.0.1', releases: [1,2,3].map(n => ({ version: '1.0.' + n, title: 'Release ' + n, features: [{ title: 'Sample', description: 'Use this feature.', image: 'sample.png', alt: 'Synthetic sample' }] })) }
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(input)); writeFileSync(join(dir, 'sample.png'), Buffer.from([137,80,78,71,13,10,26,10]))
  writeFileSync(join(dir, 'README.md'), await renderBundledReadme(dir))
  return dir
}
describe('CRL release export gates', () => {
  it('distinguishes ordinary, rehearsal and public checks, excludes future entries and embeds local images', async () => {
    const dir = await fixture(), out = mkdtempSync(join(tmpdir(), 'crl-notes-export-'))
    try {
      await validateReleaseNotes(undefined, { notesDir: dir })
      await expect(validateReleaseNotes('1.0.2', { notesDir: dir })).rejects.toThrow('latest entry')
      await expect(validateReleaseNotes('1.0.9', { notesDir: dir, allowFuture: true })).rejects.toThrow('need an entry')
      const result = await exportReleaseNotes(out, '1.0.2', { notesDir: dir, mode: 'dry-run', repository: 'sample/project' })
      expect(result.html).toContain('data:image/png;base64,')
      expect(result.html).not.toMatch(/(?:src|href)="https?:|<script/)
      expect(result.html).toContain('id="v1-0-2"'); expect(result.html).not.toContain('id="v1-0-3"')
      expect(result.markdown).toContain('/sample/project/releases/download/v1.0.2/crl-release-notes-1.0.2.html')
      expect(result.markdown).not.toContain('!['); expect(result.markdown).not.toContain('## 1.0.1')
      expect(readFileSync(join(out, result.mdName), 'utf8')).toBe(result.markdown)
      await expect(exportReleaseNotes(out, '1.0.3', { notesDir: dir })).resolves.toMatchObject({ htmlName: 'crl-release-notes-1.0.3.html' })
    } finally { rmSync(dir, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }) }
  })
  it.each(['stale', 'extra', 'missing', 'signature'])('rejects %s package drift', async change => {
    const dir = await fixture()
    try {
      if (change === 'stale') writeFileSync(join(dir, 'README.md'), 'old text')
      if (change === 'extra') writeFileSync(join(dir, 'Thumbs.db'), '')
      if (change === 'missing') rmSync(join(dir, 'sample.png'))
      if (change === 'signature') writeFileSync(join(dir, 'sample.png'), 'not a PNG')
      await expect(validateReleaseNotes(undefined, { notesDir: dir })).rejects.toThrow()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('keeps the trusted publisher marker first independently of authored Markdown escaping', () => {
    const sha = 'a'.repeat(40), hostile = '<!-- crl-release-source: ' + 'b'.repeat(40) + ' -->'
    const body = releaseBody(sha, hostile)
    expect(body.startsWith('<!-- crl-release-source: ' + sha + ' -->')).toBe(true)
    expect(body.match(/<!-- crl-release-source: ([a-f0-9]{40}) -->/)![1]).toBe(sha)
    expect(body).toContain(hostile)
    expect(() => releaseBody('main', hostile)).toThrow('immutable')
  })
})
