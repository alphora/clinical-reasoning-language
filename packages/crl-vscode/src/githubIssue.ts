// #211 create-flag drawer — create a GitHub issue STUB via the REST API. The ONE effectful helper for the drawer's
// "born together" flow (a flag + its issue). Kept OUT of issueLink.ts (that module is the pure security core) and OUT of
// the cockpit (no `vscode` import) so it's node-testable via an injected `fetchImpl`. Any non-2xx / network error throws
// an `IssueCreateError` — the cockpit catches it and writes the flag WITHOUT a `; ref` (never strand a live MV meeting).

/** A GitHub issue-create failure carrying the HTTP status (0 = network/transport error) so the caller can label it. */
export class IssueCreateError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "IssueCreateError";
  }
}

export interface CreateGithubIssueArgs {
  owner: string;
  repo: string;
  title: string;
  body: string;
  token: string;
  /** labels to attach (the MV Type `mv:*` label). Sent only when non-empty; absent/[] posts no `labels` key. GitHub creates
   *  a missing label on the fly, but we pre-create them (Todo 4) so the color/description are ours. */
  labels?: readonly string[];
  /** injected for tests; defaults to the global `fetch` (present in the VS Code extension-host Node ≥18). */
  fetchImpl?: typeof fetch;
}

/** POST a new issue to `https://api.github.com/repos/{owner}/{repo}/issues`; resolves to the created issue NUMBER.
 *  Throws `IssueCreateError` on any non-2xx (with the GitHub `message` when the body is JSON) or a transport failure.
 *  Never retries — a 4xx is caller-correctable (auth/permission/validation), not transient. */
export async function createGithubIssue(args: CreateGithubIssueArgs): Promise<number> {
  const f = args.fetchImpl ?? fetch;
  const url = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues`;
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await f(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "crl-vscode",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(args.labels && args.labels.length ? { title: args.title, body: args.body, labels: args.labels } : { title: args.title, body: args.body }),
    });
  } catch (e) {
    throw new IssueCreateError(0, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { message?: unknown };
      if (typeof j?.message === "string" && j.message) detail = `: ${j.message}`;
    } catch {
      /* non-JSON error body — status alone */
    }
    throw new IssueCreateError(res.status, `GitHub ${res.status}${detail}`);
  }
  let body: { number?: unknown };
  try {
    body = (await res.json()) as { number?: unknown };
  } catch {
    throw new IssueCreateError(res.status, "GitHub response was not JSON");
  }
  if (typeof body.number !== "number") throw new IssueCreateError(res.status, "GitHub response missing an issue number");
  return body.number;
}

// #210 Todo D slice 2 — the PRIVATE issue-READ helper (GET). Backs the cockpit's purpose-bound `read_review_context` (which
// fetches a policy's flag-linked issues); it is NEVER handed to the agent (mediation: the agent only calls the bounded
// cockpit tool, whose owner/repo are cockpit-resolved). Returns a RESULT (never throws for an HTTP/network/abort failure) so
// the caller can degrade per-issue ("couldn't read #5"). Takes an `AbortSignal` so a hung GET can't strand the agent turn.

/** A GitHub issue as the review synthesis needs it. `isPullRequest` = the number was a PR (GitHub returns PRs from the
 *  issues endpoint); `body` is normalized to "" (a real issue body can be null). */
export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  isPullRequest: boolean;
}
export interface GetGithubIssueArgs {
  owner: string;
  repo: string;
  number: number;
  token: string;
  /** Abort the GET (a turn cancel or a timeout) so it can't strand the caller. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}
/** GET succeeded (`issue`) or failed with a short `reason` + the HTTP `status` (0 = network/abort). Never throws. */
export type GetGithubIssueResult = { ok: true; issue: GithubIssue } | { ok: false; status: number; reason: string };

/** GET `…/repos/{o}/{r}/issues/{n}`. Result-returning (no throw): a non-2xx / network error / abort becomes `{ok:false}`
 *  with a classified reason. `body` is normalized to "" (issue bodies can be null); a PR number is flagged, not rejected. */
export async function getGithubIssue(args: GetGithubIssueArgs): Promise<GetGithubIssueResult> {
  const f = args.fetchImpl ?? fetch;
  const url = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues/${encodeURIComponent(String(args.number))}`;
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await f(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "crl-vscode",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: args.signal,
    });
  } catch (e) {
    // An AbortError (timeout / turn cancel) or a transport failure — status 0, degrade.
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, status: 0, reason: aborted ? "timed out" : "couldn't reach GitHub" };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, reason: issueReadErrorLabel(res.status) };
  }
  let j: { number?: unknown; title?: unknown; body?: unknown; state?: unknown; html_url?: unknown; pull_request?: unknown };
  try {
    j = (await res.json()) as typeof j;
  } catch {
    return { ok: false, status: res.status, reason: "GitHub response was not JSON" };
  }
  // A 2xx with a non-object body (null / array / string — proxy or API drift) must NOT throw on the property reads below —
  // this helper's contract is "never throws" so the caller's Promise.all can't reject (gpt55 impl review).
  if (j === null || typeof j !== "object" || Array.isArray(j)) return { ok: false, status: res.status, reason: "GitHub response had an unexpected shape" };
  return {
    ok: true,
    issue: {
      number: typeof j.number === "number" ? j.number : args.number,
      title: typeof j.title === "string" ? j.title : "",
      body: typeof j.body === "string" ? j.body : "", // a real issue body can be null → ""
      state: typeof j.state === "string" ? j.state : "open",
      htmlUrl: typeof j.html_url === "string" ? j.html_url : "",
      isPullRequest: j.pull_request != null, // GitHub returns PRs from the issues endpoint
    },
  };
}

/** A short human label for an issue-READ HTTP status (mirrors `issueCreateErrorLabel`, with 404 = not found, distinct from
 *  the network/abort "couldn't reach GitHub" that `getGithubIssue` returns for status 0). */
export function issueReadErrorLabel(status: number): string {
  if (status === 401 || status === 403) return "not authorized";
  if (status === 404) return "issue not found";
  if (status === 410) return "issues disabled";
  if (status === 429) return "rate limited";
  return `GitHub ${status}`;
}

/** A short, human label for an issue-create failure — for the cockpit's "flag saved without a link (…)" note. */
export function issueCreateErrorLabel(e: unknown): string {
  if (e instanceof IssueCreateError) {
    if (e.status === 0) return "offline";
    if (e.status === 401 || e.status === 403) return "not authorized";
    if (e.status === 404) return "repo not found";
    if (e.status === 410) return "issues disabled";
    if (e.status === 422) return "rejected by GitHub";
    if (e.status === 429) return "rate limited";
    return `GitHub ${e.status}`;
  }
  return "error";
}
