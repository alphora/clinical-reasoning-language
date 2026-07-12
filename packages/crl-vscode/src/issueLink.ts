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

/** Derive the GitHub issues base (`https://github.com/<owner>/<repo>/issues`) from a git REMOTE url — for the auto-detect
 *  route (the origin is REPO-controlled, so this is the security boundary). GITHUB.COM ONLY, enforced HERE on an exact,
 *  lowercased hostname — NOT via `sanitizeIssueBase` (which allows arbitrary hosts by design for the manual setting). Two
 *  strict branches: the scp form `[ssh://]git@host:owner/repo(.git)?` (which `new URL` can't parse — bespoke regex, host
 *  group forbids `@`/`/` so `git@github.com.evil.com:…` reads host `github.com.evil.com` → reject) and the URL form
 *  (`https`/`ssh`/`git` only; the parsed `hostname` after the LAST `@` is exact-matched, so `ssh://git@github.com@evil/…`
 *  → host `evil` → reject). Takes the FIRST TWO path segments (`…/repo/tree/main` → `repo`); owner/repo must be a bare
 *  `[A-Za-z0-9._-]+` (rejects `..`). Any non-github / unparseable / aliased (`gh:owner/repo`) form → undefined → the manual
 *  setting. (gpt55 + Claude design review, disc 232.) */
export function githubIssuesBaseFromRemote(remoteUrl: string | undefined): string | undefined {
  if (typeof remoteUrl !== "string") return undefined;
  const url = remoteUrl.trim();
  if (url === "") return undefined;
  let host: string;
  let owner: string;
  let repo: string;
  // scp form: bare `git@<host>:<owner>/<repo>[.git][/]` — NOT a valid URL (no scheme). A `ssh://…` form is a real URL
  // (with an optional `:port`) → the URL branch; keeping `ssh://` out of this regex avoids misreading a port as the owner.
  const scp = /^git@([^@:/]+):([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  if (scp) {
    host = scp[1].toLowerCase();
    owner = scp[2];
    repo = scp[3];
  } else {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return undefined; // aliases (`gh:owner/repo`), garbage → manual
    }
    if (u.protocol !== "https:" && u.protocol !== "ssh:" && u.protocol !== "git:") return undefined; // no http/file/…
    host = u.hostname.toLowerCase(); // WHATWG host is post-last-`@` — closes the userinfo-confusion forms
    const segs = u.pathname.split("/").filter((s) => s !== "");
    if (segs.length < 2) return undefined;
    owner = segs[0];
    repo = segs[1].replace(/\.git$/, "");
  }
  if (host !== "github.com") return undefined; // EXACT — rejects GHE, www.github.com, github.com.evil.com, …
  const BARE = /^[A-Za-z0-9._-]+$/; // no `/`, `@`, `:`, whitespace, query, fragment
  if (!BARE.test(owner) || !BARE.test(repo) || owner === "." || owner === ".." || repo === "." || repo === "..") return undefined;
  return sanitizeIssueBase(`https://github.com/${owner}/${repo}/issues`); // always https; defense-in-depth normalize
}

/** Build the final issue URL from a (sanitized) base + a numeric id: `${base}/${n}`. NOT `new URL(n, base)` — relative
 *  resolution REPLACES the last path segment (`…/issues` → `…/203`, dropping `issues`). Re-parses the constructed URL
 *  (defense in depth) before returning. */
export function buildIssueUrl(base: string | undefined, issueNumber: string | undefined): string | undefined {
  if (typeof base !== "string" || typeof issueNumber !== "string" || !/^\d+$/.test(issueNumber)) return undefined;
  const candidate = `${base.replace(/\/+$/, "")}/${issueNumber}`;
  return parseHttpUrl(candidate) ? candidate : undefined;
}
