// #203 Todo 4b Slice C — pure helpers for the flag issue link-out. BOTH inputs are untrusted: the `; ref` comes from a
// policy `.crl`, and the base (`crl.issueBaseUrl`) can come from a repo-controlled `.vscode/settings.json`. These helpers
// are the security core — the vscode glue (correspondenceCockpit) only does inspect()/trust/openExternal. Validated by
// issueLink.test.mjs (the adversarial reject matrix). No `vscode` import — keep this module pure + node-testable.

/** WHATWG-parse a URL and enforce the link-out allowlist: http(s) scheme, NO credentials, NO query, NO fragment. The
 *  parse is the ONLY validator — `new URL` normalizes backslashes and punycode-encodes homoglyph hosts, so a string
 *  match (`startsWith("https://github.com")`) is defeatable (`https://github.com@evil.com/…` has hostname `evil.com`);
 *  a parse is not. Returns the URL, or undefined. */
function parseHttpUrl(raw: string): URL | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined; // reject javascript:/file:/vscode:/…
  if (u.username !== "" || u.password !== "") return undefined; // reject embedded-credential host confusion
  if (u.search !== "" || u.hash !== "") return undefined; // a collection base carries no query/fragment
  return u;
}

/** A flag's `; ref` field value → the bare issue NUMBER (as a string) iff it is a pure `#?<digits>` (full-string, after
 *  trim); else undefined (a non-numeric ref like `disc 173` / `spec/x.md` gets no link). This is the injection guard:
 *  the FULL-string match means only a `\d+` path segment ever reaches the URL — it cannot smuggle scheme/host/`..`/`@`/
 *  `?`/`#`. A LEADING match would wrongly accept `203/../evil`. */
export function issueRefOf(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = /^#?(\d+)$/.exec(raw.trim());
  return m ? m[1] : undefined;
}

/** Validate + normalize an issue-COLLECTION base URL (e.g. `https://github.com/owner/repo/issues`) via `parseHttpUrl`.
 *  Returns the normalized `origin + path` with trailing slashes stripped, or undefined. `typeof` guard: a hand-mangled
 *  settings.json could yield a non-string. */
export function sanitizeIssueBase(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const u = parseHttpUrl(raw.trim());
  if (!u) return undefined;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/** Build the final issue URL from a (sanitized) base + a numeric id: `${base}/${n}`. NOT `new URL(n, base)` — relative
 *  resolution REPLACES the last path segment (`…/issues` → `…/203`, dropping `issues`). Re-parses the constructed URL
 *  (defense in depth) before returning. */
export function buildIssueUrl(base: string | undefined, issueNumber: string | undefined): string | undefined {
  if (typeof base !== "string" || typeof issueNumber !== "string" || !/^\d+$/.test(issueNumber)) return undefined;
  const candidate = `${base.replace(/\/+$/, "")}/${issueNumber}`;
  return parseHttpUrl(candidate) ? candidate : undefined;
}
