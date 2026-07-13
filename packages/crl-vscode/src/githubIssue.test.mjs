// #211 create-flag drawer — createGithubIssue (the effectful issue-stub POST). Tested via an INJECTED fetch (no network):
// success → the number; every failure mode → an IssueCreateError the cockpit turns into "flag saved without a link".
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { createGithubIssue, getGithubIssue, issueReadErrorLabel, IssueCreateError, issueCreateErrorLabel } = await load("githubIssue.ts");

// A minimal Response-ish stub for the injected fetch.
const resp = (ok, status, json) => ({ ok, status, json: async () => (json instanceof Error ? (() => { throw json; })() : json) });

test("createGithubIssue: POSTs to the repo issues endpoint with auth + body, returns the created number", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return resp(true, 201, { number: 4242 });
  };
  const n = await createGithubIssue({ owner: "acme", repo: "policies", title: "T", body: "B", token: "tok", fetchImpl });
  assert.equal(n, 4242);
  assert.equal(seen.url, "https://api.github.com/repos/acme/policies/issues");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, "Bearer tok");
  assert.match(seen.init.headers.Accept, /vnd\.github/);
  assert.deepEqual(JSON.parse(seen.init.body), { title: "T", body: "B" });
});

test("createGithubIssue: owner/repo are URL-encoded (no path injection)", async () => {
  let url;
  const fetchImpl = async (u) => { url = u; return resp(true, 201, { number: 1 }); };
  await createGithubIssue({ owner: "a/b", repo: "r?x", title: "T", body: "", token: "t", fetchImpl });
  assert.equal(url, "https://api.github.com/repos/a%2Fb/r%3Fx/issues");
});

test("createGithubIssue: a non-2xx throws IssueCreateError carrying the status + GitHub message", async () => {
  const fetchImpl = async () => resp(false, 403, { message: "Resource not accessible" });
  await assert.rejects(
    () => createGithubIssue({ owner: "o", repo: "r", title: "T", body: "", token: "t", fetchImpl }),
    (e) => e instanceof IssueCreateError && e.status === 403 && /Resource not accessible/.test(e.message),
  );
});

test("createGithubIssue: a non-JSON error body still throws with the status (no crash)", async () => {
  const fetchImpl = async () => resp(false, 502, new Error("not json"));
  await assert.rejects(
    () => createGithubIssue({ owner: "o", repo: "r", title: "T", body: "", token: "t", fetchImpl }),
    (e) => e instanceof IssueCreateError && e.status === 502,
  );
});

test("createGithubIssue: a 2xx missing the number throws (never returns NaN/undefined)", async () => {
  const fetchImpl = async () => resp(true, 201, { url: "x" });
  await assert.rejects(
    () => createGithubIssue({ owner: "o", repo: "r", title: "T", body: "", token: "t", fetchImpl }),
    (e) => e instanceof IssueCreateError,
  );
});

test("createGithubIssue: a transport error becomes IssueCreateError(status 0)", async () => {
  const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
  await assert.rejects(
    () => createGithubIssue({ owner: "o", repo: "r", title: "T", body: "", token: "t", fetchImpl }),
    (e) => e instanceof IssueCreateError && e.status === 0,
  );
});

test("issueCreateErrorLabel: maps the common statuses to a short human label", () => {
  assert.equal(issueCreateErrorLabel(new IssueCreateError(0, "x")), "offline");
  assert.equal(issueCreateErrorLabel(new IssueCreateError(401, "x")), "not authorized");
  assert.equal(issueCreateErrorLabel(new IssueCreateError(403, "x")), "not authorized");
  assert.equal(issueCreateErrorLabel(new IssueCreateError(404, "x")), "repo not found");
  assert.equal(issueCreateErrorLabel(new IssueCreateError(422, "x")), "rejected by GitHub");
  assert.equal(issueCreateErrorLabel(new IssueCreateError(429, "x")), "rate limited");
  assert.equal(issueCreateErrorLabel(new Error("plain")), "error");
});

// ── #210 Todo D slice 2 — getGithubIssue (the PRIVATE issue-READ GET; result-returning, never throws) ──
const rget = (ok, status, json) => ({ ok, status, json: async () => (json instanceof Error ? (() => { throw json; })() : json) });

test("getGithubIssue: GETs the issue endpoint with auth, returns {ok, issue} (body normalized, PR flagged)", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return rget(true, 200, { number: 5, title: "T", body: null, state: "open", html_url: "u" }); };
  const r = await getGithubIssue({ owner: "acme", repo: "pol", number: 5, token: "tok", fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.issue, { number: 5, title: "T", body: "", state: "open", htmlUrl: "u", isPullRequest: false });
  assert.equal(seen.url, "https://api.github.com/repos/acme/pol/issues/5");
  assert.equal(seen.init.method, "GET");
  assert.equal(seen.init.headers.Authorization, "Bearer tok");
});

test("getGithubIssue: a PR number is FLAGGED (isPullRequest), not rejected", async () => {
  const fetchImpl = async () => rget(true, 200, { number: 7, title: "P", body: "b", state: "open", pull_request: { url: "x" } });
  const r = await getGithubIssue({ owner: "o", repo: "r", number: 7, token: "t", fetchImpl });
  assert.equal(r.ok && r.issue.isPullRequest, true);
});

test("getGithubIssue: 404 → {ok:false, status:404, reason:'issue not found'} (never throws)", async () => {
  const fetchImpl = async () => rget(false, 404, { message: "Not Found" });
  const r = await getGithubIssue({ owner: "o", repo: "r", number: 9, token: "t", fetchImpl });
  assert.deepEqual(r, { ok: false, status: 404, reason: "issue not found" });
});

test("getGithubIssue: a 5xx → {ok:false} with the status (degrade, no throw)", async () => {
  const fetchImpl = async () => rget(false, 502, {});
  const r = await getGithubIssue({ owner: "o", repo: "r", number: 1, token: "t", fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 502);
});

test("getGithubIssue: a transport/abort error → {ok:false, status:0} ('timed out' for AbortError, else network)", async () => {
  const net = async () => { throw new Error("ECONNREFUSED"); };
  const r1 = await getGithubIssue({ owner: "o", repo: "r", number: 1, token: "t", fetchImpl: net });
  assert.deepEqual(r1, { ok: false, status: 0, reason: "couldn't reach GitHub" });
  const abort = async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
  const r2 = await getGithubIssue({ owner: "o", repo: "r", number: 1, token: "t", fetchImpl: abort });
  assert.deepEqual(r2, { ok: false, status: 0, reason: "timed out" });
});

test("getGithubIssue: passes the AbortSignal through to fetch (so a hung GET can be aborted)", async () => {
  const ac = new AbortController();
  let seenSignal;
  const fetchImpl = async (_u, init) => { seenSignal = init.signal; return rget(true, 200, { number: 1, title: "", body: "", state: "open" }); };
  await getGithubIssue({ owner: "o", repo: "r", number: 1, token: "t", signal: ac.signal, fetchImpl });
  assert.equal(seenSignal, ac.signal);
});

test("getGithubIssue: a 2xx with a NON-OBJECT body (null/array) → {ok:false} (never throws → Promise.all can't reject)", async () => {
  for (const bad of [null, [1, 2], "nope"]) {
    const r = await getGithubIssue({ owner: "o", repo: "r", number: 1, token: "t", fetchImpl: async () => rget(true, 200, bad) });
    assert.equal(r.ok, false, `body ${JSON.stringify(bad)} → not ok`);
    assert.match(r.reason, /unexpected shape/);
  }
});

test("issueReadErrorLabel: 404 = 'issue not found', distinct from a network/offline status-0", () => {
  assert.equal(issueReadErrorLabel(404), "issue not found");
  assert.equal(issueReadErrorLabel(401), "not authorized");
  assert.equal(issueReadErrorLabel(429), "rate limited");
});

console.log("githubIssue.test: ok");
