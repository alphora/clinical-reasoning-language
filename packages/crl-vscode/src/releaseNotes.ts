/** Informational release content and once-per-profile coordination. No engine, workspace or network IO. */
export interface ReleaseFeature {
  title: string
  description: string
  image?: string
  alt?: string
  caption?: string
  video?: string
  poster?: string
}
export interface ReleaseEntry { version: string; title: string; features: ReleaseFeature[] }
export interface ReleaseCatalog { baselineVersion: string; deployedBaselineVersion: string; releases: ReleaseEntry[] }
export interface ReleaseNotesView { runningVersion: string; sinceVersion: string; entries: ReleaseEntry[]; automatic: boolean }

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const isStableVersion = (value: unknown): value is string => typeof value === 'string' && VERSION.test(value)
export function compareVersions(a: string, b: string): number {
  if (!isStableVersion(a) || !isStableVersion(b)) throw new Error('Release Notes require canonical release versions.')
  const left = a.split('.').map(BigInt), right = b.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! < right[i]! ? -1 : 1
  return 0
}
/** Development identity stays intact for display; only the history range uses its base version. */
export function notesBaseVersion(value: string): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value)
  const base = match ? match.slice(1, 4).join('.') : ''
  if (!isStableVersion(base)) throw new Error('Release Notes could not identify this CRL version.')
  return base
}
export function releaseNotesAutoEligible(input: { state: string; enabled: boolean; trusted: boolean; production: boolean; autoOpen: boolean; version: string }): boolean {
  return input.state === 'ready' && input.enabled && input.trusted && input.production && input.autoOpen && isStableVersion(input.version)
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Release Notes contain an unsupported field.')
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 6000) throw new Error('Release Notes contain missing or invalid text.')
  return value
}
function version(value: unknown): string {
  if (!isStableVersion(value)) throw new Error('Release Notes contain an invalid version.')
  return value
}
function media(value: unknown, extension: 'png' | 'webm'): string {
  if (typeof value !== 'string' || !new RegExp('^[A-Za-z0-9][A-Za-z0-9_-]*\\.' + extension + '$').test(value)) throw new Error('Release Notes contain an invalid local media filename.')
  return value
}
export function parseReleaseCatalog(raw: unknown): ReleaseCatalog {
  if (!object(raw)) throw new Error('Release Notes catalog is invalid.')
  fields(raw, ['baselineVersion', 'deployedBaselineVersion', 'releases'])
  const baselineVersion = version(raw.baselineVersion), deployedBaselineVersion = version(raw.deployedBaselineVersion)
  if (!Array.isArray(raw.releases) || !raw.releases.length) throw new Error('Release Notes have no releases.')
  let previous = baselineVersion
  const releases = raw.releases.map((entry): ReleaseEntry => {
    if (!object(entry)) throw new Error('Release Notes contain an invalid release.')
    fields(entry, ['version', 'title', 'features'])
    const current = version(entry.version)
    if (compareVersions(current, previous) <= 0) throw new Error('Release Notes versions must be unique and ordered after their baseline.')
    previous = current
    if (!Array.isArray(entry.features) || !entry.features.length) throw new Error('Release Notes contain an empty release.')
    const features = entry.features.map((feature): ReleaseFeature => {
      if (!object(feature)) throw new Error('Release Notes contain an invalid feature.')
      fields(feature, ['title', 'description', 'image', 'alt', 'caption', 'video', 'poster'])
      if (feature.alt !== undefined && feature.image === undefined || feature.poster !== undefined && feature.video === undefined) throw new Error('Release Notes contain orphaned media descriptions.')
      const result: ReleaseFeature = { title: text(feature.title), description: text(feature.description) }
      if (feature.image !== undefined) { result.image = media(feature.image, 'png'); result.alt = text(feature.alt) }
      if (feature.caption !== undefined) result.caption = text(feature.caption)
      if (feature.video !== undefined) { result.video = media(feature.video, 'webm'); result.poster = media(feature.poster, 'png'); text(feature.caption) }
      return result
    })
    return { version: current, title: text(entry.title), features }
  })
  if (compareVersions(deployedBaselineVersion, baselineVersion) < 0 || compareVersions(deployedBaselineVersion, previous) > 0) throw new Error('Release Notes deployed baseline is outside the available history.')
  return { baselineVersion, deployedBaselineVersion, releases }
}
export function releaseMediaFiles(catalog: Pick<ReleaseCatalog, 'releases'>): string[] {
  return [...new Set(catalog.releases.flatMap(entry => entry.features.flatMap(feature => [feature.image, feature.video, feature.poster].filter((value): value is string => !!value))))].sort()
}
export function selectReleaseEntries(catalog: ReleaseCatalog, runningVersion: string, sinceVersion: string): ReleaseEntry[] {
  const current = notesBaseVersion(runningVersion)
  return catalog.releases.filter(entry => compareVersions(entry.version, sinceVersion) > 0 && compareVersions(entry.version, current) <= 0).slice().reverse()
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const anchor = (entry: ReleaseEntry): string => 'v' + entry.version.replace(/\./g, '-')
export function renderReleaseNotesHtml(view: ReleaseNotesView, options: { nonce: string; imageSource: string; mediaUri: (name: string) => string }): string {
  const esc = escapeHtml
  const content = view.entries.map(entry => '<section class="release" id="' + anchor(entry) + '"><p class="version">CRL ' + esc(entry.version) + '</p><h2>' + esc(entry.title) + '</h2>' + entry.features.map((feature, index) => {
    const titleId = anchor(entry) + '-feature-' + index, captionId = titleId + '-caption'
    let figure = feature.image ? '<img src="' + esc(options.mediaUri(feature.image)) + '" alt="' + esc(feature.alt!) + '" loading="lazy">' : ''
    if (feature.video) figure += '<video controls preload="none" poster="' + esc(options.mediaUri(feature.poster!)) + '" aria-labelledby="' + titleId + '" aria-describedby="' + captionId + '"><source src="' + esc(options.mediaUri(feature.video)) + '" type="video/webm">The demonstration is also described in the text above.</video>'
    return '<article><h3 id="' + titleId + '">' + esc(feature.title) + '</h3><p>' + esc(feature.description) + '</p>' + (figure ? '<figure>' + figure + (feature.caption ? '<figcaption id="' + captionId + '">' + esc(feature.caption) + '</figcaption>' : '') + '</figure>' : '') + '</article>'
  }).join('') + '</section>').join('')
  const csp = "default-src 'none'; img-src " + options.imageSource + "; media-src data:; style-src 'nonce-" + options.nonce + "' " + options.imageSource
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + esc(csp) + '"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CRL Release Notes</title><style nonce="' + esc(options.nonce) + '">\n' +
    ':root{color-scheme:light dark}body{font:14px/1.65 var(--vscode-font-family,system-ui,sans-serif);background:var(--vscode-editor-background,#181818);color:var(--vscode-editor-foreground,#ccc);margin:0;padding:36px 28px 72px}main{max-width:900px;margin:auto}h1{font-size:32px;line-height:1.2;margin:8px 0 16px}h2{font-size:24px;line-height:1.3}h3{font-size:19px;line-height:1.4;margin:28px 0 8px}p{max-width:72ch}a{color:var(--vscode-textLink-foreground,#6cb6ff)}a:focus-visible{outline:2px solid var(--vscode-focusBorder,#3794ff);outline-offset:3px}.eyebrow,.version,figcaption{color:var(--vscode-descriptionForeground,#aaa)}.eyebrow{letter-spacing:.08em;text-transform:uppercase;font-size:12px}.intro{font-size:16px}nav{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0 36px}.release{border-top:1px solid var(--vscode-panel-border,#444);padding:24px 0}.version{font-size:12px;margin:0}figure{margin:20px 0 28px}img,video{display:block;max-width:100%;height:auto;border:1px solid var(--vscode-panel-border,#444);border-radius:5px;margin:12px 0}figcaption{font-size:12px;max-width:65ch}footer{margin-top:24px;font-size:12px;color:var(--vscode-descriptionForeground,#aaa)}@media(forced-colors:active){.release,img,video{border-color:CanvasText}}\n' +
    '</style></head><body><main><header><p class="eyebrow">CRL · Release Notes</p><h1>What’s new in CRL</h1><p class="intro">Updates since CRL ' + esc(view.sinceVersion) + '. CRL version: ' + esc(view.runningVersion) + '.</p><p>Reopen this page anytime with <strong>CRL: Release Notes</strong>.</p></header><nav aria-label="Release versions">' + view.entries.map(entry => '<a href="#' + anchor(entry) + '">' + esc(entry.version) + '</a>').join('') + '</nav>' + (content || '<p>No Release Notes are included for this version.</p>') + '<footer>Images and demonstrations use sample artifacts. Everything on this page is included with CRL and works offline.</footer></main></body></html>'
}
const markdownText = (value: string): string => value.replace(/[\\`*_[\]<>]/g, '\\$&')
export function renderReleaseNotesMarkdown(view: ReleaseNotesView, options: { mediaUrl: (name: string) => string; embedImages: boolean }): string {
  const lines = ['# CRL Release Notes', '', 'Updates since CRL ' + view.sinceVersion + ' through ' + view.runningVersion + '.', '', 'Reopen the installed notes with **CRL: Release Notes**.', '']
  for (const entry of view.entries) {
    lines.push('## ' + entry.version + ' — ' + markdownText(entry.title), '')
    for (const feature of entry.features) {
      lines.push('### ' + markdownText(feature.title), '', markdownText(feature.description), '')
      if (feature.image && options.embedImages) lines.push('![' + markdownText(feature.alt!) + '](' + options.mediaUrl(feature.image) + ')', '')
      else if (!options.embedImages && (feature.image || feature.video)) lines.push('[' + (feature.image ? 'View the illustration' + (feature.video ? ' and video' : '') : 'View the demonstration') + '](' + options.mediaUrl((feature.image ?? feature.video)!) + ')', '')
      if (feature.video && options.embedImages) lines.push('[Play the short demonstration](' + options.mediaUrl(feature.video) + ')', '')
      if (feature.caption) lines.push(markdownText(feature.caption), '')
    }
  }
  lines.push('Images and demonstrations use sample artifacts.', '')
  return lines.join('\n')
}

export interface ReleaseNotesDeps {
  loadCatalog: () => Promise<ReleaseCatalog>
  getSeen: () => unknown
  setSeen: (version: string) => PromiseLike<void>
  open: (view: ReleaseNotesView) => Promise<void>
  log: (message: string) => void
}
/** A new Codespace/profile can have fresh storage; simultaneous hosts may each open their own tab. */
export class ReleaseNotesCoordinator {
  private attemptedAuto = false
  private inFlight: Promise<void> | undefined
  private openingAutomatically = false
  constructor(private readonly runningVersion: string, private readonly deps: ReleaseNotesDeps) {}
  private log(message: string): void { try { this.deps.log(message) } catch { /* informational failures never break the workflow */ } }
  onProject(eligible: boolean): void {
    if (!eligible || this.attemptedAuto || !isStableVersion(this.runningVersion)) return
    this.attemptedAuto = true
    try {
      const seen = this.deps.getSeen()
      if (isStableVersion(seen) && compareVersions(this.runningVersion, seen) <= 0) return
      void this.show(false).catch(error => this.log('Release Notes could not open automatically: ' + String(error)))
    } catch (error) { this.log('Release Notes history could not be read: ' + String(error)) }
  }
  show(manual = true): Promise<void> {
    if (this.inFlight) return manual && this.openingAutomatically ? this.inFlight.then(() => this.show(true), () => this.show(true)) : this.inFlight
    this.openingAutomatically = !manual
    this.inFlight = this.performOpen(manual).finally(() => { this.inFlight = undefined; this.openingAutomatically = false })
    return this.inFlight
  }
  private async performOpen(manual: boolean): Promise<void> {
    const catalog = await this.deps.loadCatalog()
    const seen = manual ? undefined : this.deps.getSeen()
    const sinceVersion = manual ? catalog.baselineVersion : isStableVersion(seen) ? seen : catalog.deployedBaselineVersion
    const entries = selectReleaseEntries(catalog, this.runningVersion, sinceVersion)
    if (!manual && entries.length === 0) return
    await this.deps.open({ runningVersion: this.runningVersion, sinceVersion, entries, automatic: !manual })
    // Only public release identities enter the high-water mark; never replace a newer seen version.
    try {
      const latest = this.deps.getSeen()
      if (isStableVersion(this.runningVersion) && (!isStableVersion(latest) || compareVersions(this.runningVersion, latest) > 0)) await this.deps.setSeen(this.runningVersion)
    } catch (error) { this.log('Release Notes opened, but the seen version could not be saved: ' + String(error)) }
  }
}

/** Shared by the installed reader and publisher. Validate bytes before assigning a webview. */
export function validateReleaseMedia(catalog: ReleaseCatalog, files: ReadonlyMap<string, Uint8Array>): void {
  let total = 0, video = 0
  for (const name of releaseMediaFiles(catalog)) {
    const bytes = files.get(name)
    const signature = name.endsWith('.png') ? [137,80,78,71,13,10,26,10] : [26,69,223,163]
    if (!bytes || !signature.every((byte, i) => bytes[i] === byte)) throw new Error('Release Notes media has an invalid file signature: ' + name)
    total += bytes.length
    if (name.endsWith('.webm')) video += bytes.length
  }
  if (total > 5 * 1024 * 1024 || video > 1024 * 1024) throw new Error('Release Notes media exceeds its 5 MiB total / 1 MiB video budget.')
}
