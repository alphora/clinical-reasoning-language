// #(tree-snapshot) Todo 2 — the pure, vscode-free pieces of the tree-snapshot capture: a one-shot request/reply COORDINATOR
// (the host doesn't hold the tree DOM — it asks the webview for it) plus the small string helpers. Kept here (no `vscode`
// import) so the failure-prone settlement logic is unit-tested directly; the cockpit owns only the postMessage / fs glue.
// Reviewed shape (disc 323 + 324): single-flight, settle-exactly-once, token-matched, stale-late-reply harmless, host-side
// screen of the captured payload (a webview→host string written into a CSP-`unsafe-inline` file — reject anything our
// renderer never emits). The ephemeral-overlay strip (dropping the reviewer's selection / agent focus rings so a CUSTOMER
// artifact doesn't carry them) runs WEBVIEW-side on a clone via `classList` — exact, no risk of rewriting label text.

/** A one-shot capture: `begin` opens it (rejecting reentry while pending), then EXACTLY ONE of resolve/timeout/abort settles
 *  it. A reply for a non-current token (a late reply after timeout/abort, or a second webview) is ignored — never double-settles.
 *  Pure: the cockpit supplies the token, the timer, and the postMessage; this owns only the state machine. */
export class SnapshotCapture {
  private token: string | undefined;
  private resolver: ((html: string | undefined) => void) | undefined;

  get pending(): boolean {
    return this.token !== undefined;
  }

  /** Open the capture for `token`. Throws if one is already pending (single-flight — the caller shows "already in progress").
   *  Returns a promise that settles with the captured html (resolve) or `undefined` (timeout/abort). */
  begin(token: string): Promise<string | undefined> {
    if (this.token !== undefined) throw new Error("a snapshot capture is already in progress");
    this.token = token;
    return new Promise<string | undefined>((resolve) => {
      this.resolver = resolve;
    });
  }

  /** A `snapshotDom` reply arrived. Settles the capture with `html` IFF the token is the current one — a stale/late reply is
   *  ignored (returns false). Returns true when it settled the pending capture. */
  resolve(token: string, html: string | undefined): boolean {
    if (this.token === undefined || token !== this.token) return false;
    const r = this.resolver;
    this.clear();
    r?.(html);
    return true;
  }

  /** Settle the pending capture with `undefined` (timeout, or a hard abort — panel/extension disposal). No-op when idle. */
  settleEmpty(): void {
    if (this.token === undefined) return;
    const r = this.resolver;
    this.clear();
    r?.(undefined);
  }

  private clear(): void {
    this.token = undefined;
    this.resolver = undefined;
  }
}

/** The maximum captured-DOM size we accept (a sanity bound on a webview→host payload; a real tree is well under this). */
export const SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024;

/** Screen a captured-DOM string before it is wrapped into a self-contained file. The capture is our OWN `renderFlowPane`
 *  output re-serialized from the host-owned `#root` — but it crosses the (untrusted) webview→host channel into a file whose
 *  CSP allows inline script, so we reject a non-string, an oversized blob (UTF-8 bytes, not code units), or any element/
 *  attribute the renderer NEVER emits. Text nodes escape `<`→`&lt;`, so every `<tag` check is immune to false-positives on
 *  clinical label text; the event-handler check requires a QUOTED value (serialized attributes are always quoted) so text
 *  like "… ongoing = yes" won't trip it. Defense-in-depth behind the compromised-webview precondition. `{ok:false,reason}` on
 *  rejection. (Encoded-URL / `srcdoc` vectors are moot: they only matter on `<a>/<iframe>/<foreignObject>`, all rejected here.) */
export function screenCapturedDom(html: unknown): { ok: true; html: string } | { ok: false; reason: string } {
  if (typeof html !== "string") return { ok: false, reason: "the capture was not text" };
  if (Buffer.byteLength(html, "utf8") > SNAPSHOT_MAX_BYTES) return { ok: false, reason: "the captured tree is unexpectedly large" };
  if (
    /<script/i.test(html) || // any <script (incl. `<script/x>` — a `/` is a valid attr separator)
    /<(iframe|object|embed|foreignobject|base|meta|style|link|a|form|input)[\s/>]/i.test(html) || // active-content elements the flow renderer never emits
    /[\s/"']on[a-z]+\s*=\s*["']/i.test(html) // an on<event>="…" handler attribute (quoted → no clinical-text false-positive)
  ) {
    return { ok: false, reason: "the capture contained unexpected active content" };
  }
  return { ok: true, html };
}

/** Sanitize a policy id into a safe snapshot filename `<id>-tree.html` (fallback `decision-tree.html`). Non-`[A-Za-z0-9._-]`
 *  → `-`, collapse runs, trim leading/trailing separators; an empty/degenerate id falls back so we never emit `-tree.html`. */
export function snapshotFileName(policyId: string | undefined): string {
  const base = (policyId ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return `${base || "decision"}-tree.html`;
}
