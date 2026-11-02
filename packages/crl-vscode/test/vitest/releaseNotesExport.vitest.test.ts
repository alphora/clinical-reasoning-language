import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync, cpSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
// @ts-expect-error shared publisher script uses the production TypeScript renderer via esbuild
import { renderBundledReadme, validateReleaseNotes, exportReleaseNotes, releaseBody } from '../../scripts/release-notes.mjs'

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'crl-notes-fixture-'))
  const input = { baselineVersion: '1.0.0', deployedBaselineVersion: '1.0.1', releases: [1,2,3].map(n => ({ version: '1.0.' + n, title: 'Release ' + n, features: [{ title: 'Sample', description: 'Use this feature.', image: 'sample.png', alt: 'Synthetic sample' }] })) }
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(input)); writeFileSync(join(dir, 'sample.png'), readFileSync(new URL('./fixtures/release-notes-1px.png', import.meta.url)))
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

it('ships provider content without contributing a separate reader command or setting', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  expect(manifest.contributes.commands.some((entry: { command: string }) => entry.command === 'crl.showReleaseNotes')).toBe(false)
  expect(manifest.contributes.configuration.properties['crl.releaseNotes.autoOpen']).toBeUndefined()
  const ignore = readFileSync(new URL('../../.vscodeignore', import.meta.url), 'utf8')
  expect(ignore).toContain('media/release-notes/**'); expect(ignore.trimEnd().endsWith('!release-notes/**')).toBe(true)
})

it('executes the real body CLI with clean HEAD binding, rejecting a wrong SHA and dirty source', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crl-notes-cli-')), repo = join(dir, 'repo'), pkg = join(repo, 'packages/crl-vscode')
  let media: string | undefined
  const ajvLink = join(pkg, 'node_modules/ajv'), link = join(pkg, 'node_modules/esbuild'), script = join(pkg, 'scripts/release-notes.mjs'), hooks = join(dir, 'empty-hooks')
  const require = createRequire(import.meta.url)
  try {
    media = await fixture()
  mkdirSync(join(pkg, 'scripts'), { recursive: true }); mkdirSync(join(pkg, 'src'), { recursive: true }); mkdirSync(join(pkg, 'node_modules')); mkdirSync(hooks)
    copyFileSync(new URL('../../scripts/release-notes.mjs', import.meta.url), script)
    cpSync(new URL('../../scripts/release-notes-contract', import.meta.url), join(pkg, 'scripts/release-notes-contract'), { recursive: true })
    copyFileSync(new URL('../../src/releaseNotes.ts', import.meta.url), join(pkg, 'src/releaseNotes.ts'))
    cpSync(media, join(pkg, 'media/release-notes'), { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '1.0.3', type: 'module' }))
    writeFileSync(join(repo, '.gitignore'), '**/node_modules/\n')
    symlinkSync(dirname(require.resolve('esbuild/package.json')), link, 'junction')
    const ownedRequire = createRequire(new URL('../../package.json', import.meta.url))
    symlinkSync(dirname(ownedRequire.resolve('ajv/package.json')), ajvLink, 'junction')
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    git('init', '--quiet')
    git('add', '.gitignore', 'packages/crl-vscode/package.json', 'packages/crl-vscode/scripts', 'packages/crl-vscode/src', 'packages/crl-vscode/media')
    git('-c', 'user.name=CRL CLI test', '-c', 'user.email=crl-test@example.invalid', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=' + hooks, 'commit', '--quiet', '-m', 'Synthetic release-body fixture')
    const sha = git('rev-parse', 'HEAD'), body = join(dir, 'body.md')
    const cli = (source: string) => execFileSync(process.execPath, [script, '--body', source, body], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    expect(cli(sha)).toContain('Release body:')
    expect(readFileSync(body, 'utf8')).toMatch(new RegExp('^<!-- crl-release-source: ' + sha + ' -->'))
    expect(readFileSync(body, 'utf8')).toContain('## 1.0.3')
    const fails = (source: string, diagnostic: string) => {
      let error: unknown
      try { cli(source) } catch (caught) { error = caught }
      expect(error).toBeDefined()
      expect(String((error as { stderr?: unknown } | undefined)?.stderr)).toContain(diagnostic)
    }
    fails('f'.repeat(40), 'current immutable Git HEAD')
    fails('not-a-sha', 'Expected immutable source revision')
    writeFileSync(join(repo, '.gitignore'), '**/node_modules/\n# uncommitted comment\n')
    fails(sha, 'Commit the release source')
    writeFileSync(join(repo, '.gitignore'), '**/node_modules/\n')
    writeFileSync(join(pkg, 'untracked.txt'), 'Untracked release scratch')
    fails(sha, 'Commit the release source')
    rmSync(join(pkg, 'untracked.txt'))
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '1.0.2', type: 'module' }))
    const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    expect(run()).toContain('Release Notes verified.') // ordinary development check permits future entries
    expect(() => run('--release')).toThrow() // public preflight rejects a latest-version mismatch
  } finally {
    // Remove the explicitly created junction before recursive cleanup; never traverse its dependency target.
    try { unlinkSync(link) } catch {}
    try { unlinkSync(ajvLink) } catch {}
    expect(resolve(dir).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
    if (media) { expect(resolve(media).startsWith(resolve(tmpdir()) + sep)).toBe(true); rmSync(media, { recursive: true, force: true }) }
  }
}, 30000)
