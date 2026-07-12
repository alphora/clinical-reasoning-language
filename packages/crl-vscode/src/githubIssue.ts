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
      body: JSON.stringify({ title: args.title, body: args.body }),
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
