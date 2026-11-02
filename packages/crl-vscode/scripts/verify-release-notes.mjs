// Inspect the actual VSIX. Staging/source checks alone do not verify a published payload.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yauzl from 'yauzl'
import { releaseNotesProviderFiles, validateReleaseNotes } from './release-notes.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function verifyReleaseNotesVsix(vsixPath, { packageRoot = ROOT, notesDir } = {}) {
  const { version, files } = await releaseNotesProviderFiles({ packageRoot, ...(notesDir ? { notesDir } : {}) })
  await validateReleaseNotes(version, notesDir ? { notesDir } : {})
  if (!files.size) throw new Error('A public VSIX requires a Release Notes provider.')
  const archive = vsixPath ?? join(packageRoot, 'crl-language-support-' + version + '.vsix')
  const prefix = 'extension/release-notes/'
  const read = new Map(), names = new Set()
  await new Promise((resolve, reject) => yauzl.open(archive, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
    if (error) { reject(error); return }
    let failed = false, activeStream
    const fail = error => { if (!failed) { failed = true; activeStream?.destroy(); zip.close(); reject(error) } }
    zip.on('error', fail)
    zip.on('entry', entry => {
      const name = entry.fileName
      if (names.has(name)) { fail(new Error('Duplicate VSIX entry: ' + name)); return }
      names.add(name)
      if (name.startsWith('extension/node_modules/')) { fail(new Error('VSIX contains unexpected unbundled dependencies.')); return }
      if (name.startsWith('extension/media/release-notes/')) { fail(new Error('VSIX contains the retired source Release Notes payload.')); return }
      const relative = name.startsWith(prefix) ? name.slice(prefix.length) : undefined
      if (relative !== undefined && relative !== '' && !files.has(relative)) { fail(new Error('Unexpected provider entry: ' + name)); return }
      const limit = relative ? files.get(relative).length : name === 'extension/package.json' ? 512 * 1024 : name === 'extension/dist/extension.js' ? 32 * 1024 * 1024 : undefined
      if (limit === undefined) { zip.readEntry(); return }
      if (entry.uncompressedSize > limit) { fail(new Error('VSIX entry exceeds its expected bound: ' + name)); return }
      zip.openReadStream(entry, (error, stream) => {
        if (error) { fail(error); return }
        if (failed) { stream.destroy(); return }
        activeStream = stream
        const chunks = []; let bytes = 0
        stream.on('error', fail)
        stream.on('data', chunk => { bytes += chunk.length; if (bytes > limit) { stream.destroy(); fail(new Error('VSIX entry exceeds its read bound: ' + name)) } else chunks.push(chunk) })
        stream.on('end', () => { activeStream = undefined; if (!failed) { read.set(name, Buffer.concat(chunks)); zip.readEntry() } })
      })
    })
    zip.on('end', () => { if (!failed) resolve() })
    zip.readEntry()
  }))
  for (const [name, expected] of files) if (!read.get(prefix + name)?.equals(expected)) throw new Error('Missing or stale VSIX provider bytes: ' + name)
  const manifest = JSON.parse(read.get('extension/package.json')?.toString('utf8') ?? 'null')
  if (!manifest) throw new Error('VSIX has no extension manifest.')
  if (manifest?.version !== version) throw new Error('VSIX package version does not match its provider.')
  if (manifest.main !== './dist/extension.js') throw new Error('VSIX entrypoint moved; the retired-reader scan no longer covers it.')
  const retiredWiring = /crl\.showReleaseNotes|crl\.releaseNotes\.(?:seenVersion|autoOpen)/
  // Inspect every decoded manifest field, including activation events, menus and keybindings.
  if (retiredWiring.test(JSON.stringify(manifest))) throw new Error('VSIX still contributes the retired CRL reader.')
  const runtime = read.get('extension/dist/extension.js')?.toString('utf8')
  if (!runtime || retiredWiring.test(runtime)) throw new Error('VSIX still contains retired reader/history wiring or is missing its runtime.')
  return { passed: true, version, vsixSha256: hash(readFileSync(archive)), retiredReaderAbsent: true, providerFiles: [...files].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: hash(bytes) })) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 3) throw new Error('Usage: verify-release-notes.mjs [path-to-produced.vsix]')
  verifyReleaseNotesVsix(process.argv[2]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error('Release Notes VSIX verification:', error.message); process.exitCode = 1 })
}
