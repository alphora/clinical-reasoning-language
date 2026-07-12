// #203 Todo 4b Slice C — the security core for the flag issue link-out. The adversarial reject matrix (both reviewers:
// source-lock alone is not enough; the pure helpers must actually reject the malicious bases + ref edges).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { issueRefOf, sanitizeIssueBase, buildIssueUrl, githubIssuesBaseFromRemote } = await load("issueLink.ts");

test("issueRefOf: full-string #?<digits> only (the injection guard)", () => {
  assert.equal(issueRefOf("#203"), "203");
  assert.equal(issueRefOf("203"), "203");
  assert.equal(issueRefOf("  #42 "), "42"); // trimmed
  assert.equal(issueRefOf("0"), "0");
  // rejects — a non-numeric or non-full-string ref gets NO link
  for (const bad of ["disc 173", "spec/x.md", "#1a", "203-foo", "#203 https://evil", "203/../x", "#203/evil", "#", "", "  ", "#-1", "1.2", "#203#204", undefined]) {
    assert.equal(issueRefOf(bad), undefined, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(issueRefOf(203), undefined); // non-string
});

test("sanitizeIssueBase: WHATWG-parse allowlist (http(s), no creds/query/frag); normalizes trailing slash", () => {
  assert.equal(sanitizeIssueBase("https://github.com/owner/repo/issues"), "https://github.com/owner/repo/issues");
  assert.equal(sanitizeIssueBase("https://github.com/owner/repo/issues/"), "https://github.com/owner/repo/issues"); // trailing slash stripped
  assert.equal(sanitizeIssueBase("  https://ghe.example.com/o/r/issues  "), "https://ghe.example.com/o/r/issues"); // trimmed; arbitrary host allowed (user's declared tracker)
  assert.equal(sanitizeIssueBase("http://localhost:3000/issues"), "http://localhost:3000/issues"); // http allowed
});

test("sanitizeIssueBase: rejects the attack surface", () => {
  const rejects = [
    "javascript:alert(1)",
    "file:///tmp/x",
    "vscode://evil",
    "data:text/html,x",
    "https://github.com@evil.com/o/r/issues", // userinfo → real host evil.com
    "https://user:pw@github.com/o/r/issues", // credentials
    "https://github.com/o/r/issues?x=1", // query
    "https://github.com/o/r/issues#frag", // fragment
    "not a url",
    "//github.com/o/r/issues", // no scheme
    "", "   ", undefined, null, 42, {}, ["https://github.com/x"],
  ];
  for (const b of rejects) assert.equal(sanitizeIssueBase(b), undefined, `should reject ${JSON.stringify(b)}`);
});

test("sanitizeIssueBase: backslash + homoglyph hosts are normalized by the parse, not string-matched", () => {
  // `new URL` normalizes backslashes to `/` — the result is still a valid https URL (host github.com), so it's ACCEPTED
  // but with the REAL parsed host, never the raw string. (The point: we never string-match the host.)
  const bs = sanitizeIssueBase("https:\\\\github.com\\o\\r\\issues");
  assert.ok(bs === undefined || new URL(bs).hostname === "github.com", "backslash form resolves via parse, not raw text");
  // a Cyrillic-homoglyph host punycodes to xn-- — its hostname is NOT literally "github.com"
  const hg = sanitizeIssueBase("https://gіthub.com/o/r/issues");
  assert.notEqual(hg && new URL(hg).hostname, "github.com");
});

test("buildIssueUrl: appends /<n> (not relative-resolve), re-validates, rejects bad inputs", () => {
  assert.equal(buildIssueUrl("https://github.com/owner/repo/issues", "203"), "https://github.com/owner/repo/issues/203");
  assert.equal(buildIssueUrl("https://github.com/owner/repo/issues/", "203"), "https://github.com/owner/repo/issues/203"); // trailing slash
  // NOT new URL("203","…/issues") which would drop the `issues` segment:
  assert.ok(buildIssueUrl("https://github.com/o/r/issues", "5").endsWith("/issues/5"));
  // rejects
  assert.equal(buildIssueUrl(undefined, "203"), undefined);
  assert.equal(buildIssueUrl("https://github.com/o/r/issues", undefined), undefined);
  assert.equal(buildIssueUrl("https://github.com/o/r/issues", "1a"), undefined); // non-numeric id
  assert.equal(buildIssueUrl("https://github.com/o/r/issues", "1/evil"), undefined);
  assert.equal(buildIssueUrl("javascript:x", "203"), undefined); // base can't rescue a bad scheme (re-parse)
});

test("githubIssuesBaseFromRemote: ACCEPTS the real github.com clone forms → the issues base (always https)", () => {
  const want = "https://github.com/owner/repo/issues";
  for (const ok of [
    "https://github.com/owner/repo",
    "https://github.com/owner/repo.git",
    "https://github.com/owner/repo/",
    "git@github.com:owner/repo.git",
    "git@github.com:owner/repo",
    "ssh://git@github.com/owner/repo.git",
    "ssh://git@github.com:22/owner/repo", // port ignored
    "git://github.com/owner/repo.git",
    "https://user@github.com/owner/repo", // token-less userinfo dropped
    "git@GitHub.com:owner/repo.git", // host case-insensitive
    "https://github.com/owner/repo/tree/main", // extra path → first two segments
  ]) {
    assert.equal(githubIssuesBaseFromRemote(ok), want, `should accept ${ok}`);
  }
});

test("githubIssuesBaseFromRemote: REJECTS non-github / host-confusion / bad-path / alias forms → undefined (→ manual setting)", () => {
  for (const bad of [
    "https://gitlab.com/owner/repo.git",
    "git@bitbucket.org:owner/repo.git",
    "https://ghe.example.com/owner/repo.git", // GitHub Enterprise host
    "https://www.github.com/owner/repo", // strict exact host — www rejected
    "git@github.com.evil.com:owner/repo.git", // host github.com.evil.com
    "ssh://git@github.com@evil/owner/repo", // WHATWG host = evil (last @)
    "https://github.com@evil.com/owner/repo", // host evil.com
    "git@evil.com/github.com/owner/repo", // host evil.com
    "http://github.com/owner/repo", // http rejected (https only)
    "git@github.com:owner/repo@evil.git", // repo grammar rejects @
    "https://github.com/owner", // no repo segment
    "https://github.com/owner/../../evil", // `..` normalized away → <2 segments
    "gh:owner/repo", // ssh alias — unparseable
    "github:owner/repo", // alias
    "", "   ", undefined, null, 42,
  ]) {
    assert.equal(githubIssuesBaseFromRemote(bad), undefined, `should reject ${JSON.stringify(bad)}`);
  }
});

console.log("issueLink.test: ok");
