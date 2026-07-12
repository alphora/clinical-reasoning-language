// #211 create-flag drawer — createGithubIssue (the effectful issue-stub POST). Tested via an INJECTED fetch (no network):
// success → the number; every failure mode → an IssueCreateError the cockpit turns into "flag saved without a link".
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { createGithubIssue, IssueCreateError, issueCreateErrorLabel } = await load("githubIssue.ts");

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

console.log("githubIssue.test: ok");
