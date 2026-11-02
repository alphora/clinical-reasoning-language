// Content-only provider staging and portable exports from one maintained catalog.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, lstatSync, realpathSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { validateInstalledNotesMetadata } from './release-notes-contract/validate.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const NOTES_DIR = join(ROOT, 'media/release-notes')
let rendererPromise
export function releaseNotesRenderers() {
  return rendererPromise ??= build({ entryPoints: [join(ROOT, 'src/releaseNotes.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
    .then(result => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')))
    .catch(error => { rendererPromise = undefined; throw error })
}
export function notesAssetNames(version) { return [`crl-release-notes-${version}.html`, `crl-release-notes-${version}.md`] }
export function normalizeMarkdownEol(text) { return text.replace(/\r\n/g, '\n') }
function readRegularFile(path) {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Release Notes source must be a regular file, not a link: ' + path)
  return readFileSync(path)
}
export async function readNotes(notesDir = NOTES_DIR) {
  const api = await releaseNotesRenderers()
  const catalog = api.parseReleaseCatalog(JSON.parse(readRegularFile(join(notesDir, 'catalog.json')).toString('utf8')))
  const media = api.releaseMediaFiles(catalog)
  const expected = ['README.md', 'catalog.json', ...media].sort()
  const actual = readdirSync(notesDir).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Release Notes directory must contain exactly its catalog, README and referenced media. Unexpected: ' + actual.filter(name => !expected.includes(name)).join(', ') + '; missing: ' + expected.filter(name => !actual.includes(name)).join(', '))
  const bytesByName = new Map()
  for (const name of media) {
    const bytes = readRegularFile(join(notesDir, name)); bytesByName.set(name, bytes)
  }
  api.validateReleaseMedia(catalog, bytesByName)
  return { api, catalog, media, mediaBytes: bytesByName }
}
export async function renderBundledReadme(notesDir = NOTES_DIR) {
  const api = await releaseNotesRenderers()
  const catalog = api.parseReleaseCatalog(JSON.parse(readRegularFile(join(notesDir, 'catalog.json')).toString('utf8')))
  const current = catalog.releases.at(-1).version
  return api.renderReleaseNotesMarkdown({ runningVersion: current, sinceVersion: catalog.baselineVersion, entries: api.selectReleaseEntries(catalog, current, catalog.baselineVersion) }, { mediaUrl: name => name, embedImages: true })
}
export async function validateReleaseNotes(releaseVersion, { allowFuture = false, notesDir = NOTES_DIR } = {}) {
  const notes = await readNotes(notesDir)
  if (normalizeMarkdownEol(readRegularFile(join(notesDir, 'README.md')).toString('utf8')) !== normalizeMarkdownEol(await renderBundledReadme(notesDir))) throw new Error('Bundled Release Notes README is stale. Run npm run notes:write and review it.')
  if (releaseVersion && !notes.catalog.releases.some(entry => entry.version === releaseVersion)) throw new Error(`Release Notes need an entry for ${releaseVersion}.`)
  if (releaseVersion && !allowFuture && notes.catalog.releases.at(-1).version !== releaseVersion) throw new Error(`Release Notes need a latest entry for ${releaseVersion}.`)
  return notes
}

/** Spaces reads these data files through the installed extension URI; CRL runs no notes UI. */
export async function releaseNotesProviderFiles({ packageRoot = ROOT, notesDir = NOTES_DIR } = {}) {
  const owner = realpathSync(packageRoot)
  const version = JSON.parse(readFileSync(join(owner, 'package.json'), 'utf8')).version
  if (typeof version !== 'string') throw new Error('Release Notes provider requires the package version string.')
  const { api, catalog, mediaBytes } = await validateReleaseNotes(undefined, { notesDir })
  const base = api.notesBaseVersion(version)
  const releases = catalog.releases.filter(entry => api.compareVersions(entry.version, base) <= 0)
  const files = new Map()
  if (releases.length) {
    const provider = { schemaVersion: 1, displayName: 'CRL', version }
    // Producer baseline fields remain factual metadata. Spaces owns the displayed range.
    const delivered = { ...catalog, releases }
    validateInstalledNotesMetadata(provider, delivered)
    const manifestBytes = Buffer.from(JSON.stringify(provider, null, 2) + '\n')
    const catalogBytes = Buffer.from(JSON.stringify(delivered, null, 2) + '\n')
    if (manifestBytes.length > 4 * 1024) throw new Error('Release Notes provider exceeds its 4 KiB budget.')
    if (catalogBytes.length > 256 * 1024) throw new Error('Release Notes provider catalog exceeds its 256 KiB budget.')
    files.set('provider.json', manifestBytes); files.set('catalog.json', catalogBytes)
    for (const name of api.releaseMediaFiles(delivered)) files.set(name, mediaBytes.get(name))
  }
  return { owner, version, files }
}

export async function stageReleaseNotesProvider(options = {}) {
  const { owner, version, files } = await releaseNotesProviderFiles(options)
  const output = join(owner, 'release-notes')
  // This is one fixed, flat generated directory. Never recurse or follow a link during cleanup.
  if (existsSync(output)) {
    if (lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory() || realpathSync(output) !== output) throw new Error('Release Notes provider output must be its owned directory, not a link.')
    const previous = readdirSync(output)
    for (const name of previous) {
      const file = lstatSync(join(output, name))
      if (!file.isFile() || file.isSymbolicLink() || name.includes('..') || !/^(?:provider\.json|catalog\.json|[a-z0-9][a-z0-9._-]{0,63}\.(?:png|webm))$/.test(name)) throw new Error('Unexpected entry in generated Release Notes provider: ' + name)
    }
    for (const name of previous) unlinkSync(join(output, name))
  } else if (files.size) mkdirSync(output)
  for (const [name, bytes] of files) writeFileSync(join(output, name), bytes)
  return { staged: files.size > 0, output, version, files: [...files.keys()].sort() }
}
export async function renderReleaseExport(version, { mode = 'publish', repository = process.env.GITHUB_REPOSITORY ?? 'alphora/clinical-reasoning-language', notesDir = NOTES_DIR } = {}) {
  if (mode !== 'publish' && mode !== 'dry-run') throw new Error('Release Notes export mode must be publish or dry-run.')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Release Notes repository is invalid.')
  const { api, catalog, mediaBytes } = await validateReleaseNotes(version, { allowFuture: mode === 'dry-run', notesDir })
  const view = { runningVersion: version, sinceVersion: catalog.deployedBaselineVersion, entries: api.selectReleaseEntries(catalog, version, catalog.deployedBaselineVersion) }
  const [htmlName, mdName] = notesAssetNames(version)
  const html = api.renderReleaseNotesHtml(view, { nonce: 'crl-release-notes', imageSource: 'data:', mediaUri: name => 'data:' + (name.endsWith('.png') ? 'image/png' : 'video/webm') + ';base64,' + mediaBytes.get(name).toString('base64') })
  // Private GitHub raw-media URLs cannot be relied on even for signed-in readers. Link the portable HTML.
  const illustratedUrl = `https://github.com/${repository}/releases/download/v${version}/${htmlName}`
  const markdown = api.renderReleaseNotesMarkdown(view, { mediaUrl: () => illustratedUrl, embedImages: false })
  return { htmlName, mdName, html, markdown }
}
export async function exportReleaseNotes(outDir, version, options = {}) {
  const result = await renderReleaseExport(version, options)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, result.htmlName), result.html)
  writeFileSync(join(outDir, result.mdName), result.markdown)
  return result
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--write') {
    writeFileSync(join(NOTES_DIR, 'README.md'), await renderBundledReadme())
    console.log('Updated bundled Release Notes README. Review and commit the generated text.')
    return
  }
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  if (args[0] === '--body' && args.length === 3) {
    assertSourceRevision(args[1])
    // This maintainer-only command binds the source checkout enclosing the extension package.
    let head, dirty
    try {
      head = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: ROOT, encoding: 'utf8' }).trim()
      dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: ROOT, encoding: 'utf8' }).trim()
    } catch { throw new Error('--body requires a Git checkout of the release source with an existing HEAD.') }
    if (args[1] !== head) throw new Error('Release body source must equal the current immutable Git HEAD.')
    if (dirty) throw new Error('Commit the release source before generating its publication body.')
    const result = await renderReleaseExport(version)
    const body = releaseBody(args[1], result.markdown)
    const target = resolve(args[2]); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body)
    console.log('Release body: ' + target)
  }
  else if (args[0] === '--export' && (args.length === 2 || args.length === 4 && args[2] === '--mode')) {
    const result = await exportReleaseNotes(resolve(args[1]), version, { mode: args[3] ?? 'publish' })
    console.log('Release downloads: ' + join(resolve(args[1]), result.htmlName) + ', ' + join(resolve(args[1]), result.mdName))
  }
  else if (args.length === 1 && args[0] === '--stage') {
    const result = await stageReleaseNotesProvider()
    console.log(result.staged ? 'Release Notes provider: ' + result.output : 'Release Notes provider omitted: no eligible release history for ' + result.version)
    return
  }
  else if (args.length === 0 || args.length === 1 && args[0] === '--release') {
    const { catalog } = await validateReleaseNotes(args[0] === '--release' ? version : undefined)
    const { files } = await releaseNotesProviderFiles()
    console.log('Release Notes catalog: ' + Buffer.byteLength(JSON.stringify(catalog, null, 2) + '\n') + ' source bytes; ' + (files.get('catalog.json')?.length ?? 0) + '/262144 delivered bytes.')
  }
  else throw new Error('Usage: release-notes.mjs [--write | --stage | --release | --export <directory> [--mode publish|dry-run] | --body <source-SHA> <body-file>]')
  console.log('Release Notes verified.')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error('release-notes:', error.message); process.exitCode = 1 })

/** The first marker is publisher-owned even if authored text contains another marker. */
function assertSourceRevision(sourceRevision) {
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('Expected immutable source revision.')
}
export function releaseBody(sourceRevision, markdown) {
  assertSourceRevision(sourceRevision)
  return `<!-- crl-release-source: ${sourceRevision} -->\n\n${markdown}`
}
