<!-- GENERATED from .github/labels.json by scripts/apply-labels.ts --generate-md. Do not hand-edit. -->

# Repo label scheme

This repo uses a 3-axis label scheme (kind / area / priority) to triage issues and PRs. Source of truth: [`labels.json`](./labels.json). To regenerate this doc: `npx tsx scripts/apply-labels.ts --generate-md`.

## Rules

- `kind/*` — **exactly one** per issue.
- `area/*` — **≥1 per issue, except `kind/meta` issues may have 0** (they're about the project/process, not a code area).
- `priority/*` — **optional**. Absent = untriaged. Operator-only axis (script never touches it).

## Lifecycle

- `kind/design-q` issues are CLOSED when the design decision is reached. Any resulting work is filed as new `kind/feat` or `kind/chore` issues. Don't relabel — keeps history clean.
- The label scheme is enforced by `scripts/apply-labels.ts --apply`. Re-running re-asserts the JSON over any GH UI drift. To make a change stick: edit `.github/initial-issue-labels.json` (for taxonomy migrations) OR accept the GH UI is now the source of truth post-migration.

## Kind

| Label | Description |
|---|---|
| `kind/bug` | Defect: behavior doesn't match documented or intended semantics. |
| `kind/feat` | New capability or expansion of existing capability. |
| `kind/design-q` | Design question requiring a decision before implementation; close + file feat/chore on resolution. |
| `kind/chore` | Maintenance, refactor, dependency bump, or other non-feature/non-bug work. |
| `kind/doc` | User-facing documentation change (README, USER_GUIDE, etc.). |
| `kind/meta` | About the project or process itself (labels, conventions, governance). |

## Area

| Label | Maps to |
|---|---|
| `area/validator` | CRL or CEL validators (src/validator/, src/cel/validator/). |
| `area/cql-emitter` | CRL -> CQL emit lane (src/emitter/, src/imports/emit.ts). |
| `area/fhir-emitter` | CRL -> FHIR Definition resource emit (src/fhir-emitter/). |
| `area/cel-emitter` | CEL -> FHIR instance emit (src/cel/emitter/). |
| `area/template-match` | Narrative-pattern matcher (src/template-match/). |
| `area/grammar` | Surface syntax: CRL + CEL lexer/parser/AST/transformer. See LABELS.md for directory map. |
| `area/catalog` | Narrative-pattern catalog (catalog.json + inference-pattern-catalog.md). |
| `area/cli` | CLI entrypoints (src/cli/run-*.ts except run-mcp-server.ts). |
| `area/mcp` | MCP server + tool registrations (src/cli/run-mcp-server.ts). |
| `area/extension` | VS Code extension (extension/). |
| `area/imports` | Cross-file / cross-library resolution (src/imports/, src/cel/imports/). |
| `area/corpus` | Shipped exemplars + corpus fixtures. See LABELS.md for directory map. |
| `area/spec` | Language specifications (spec/, docs/cel-spec.md, docs/cpg-ig-alignment.md). |
| `area/packages` | npm package boundaries / monorepo structure (packages/). |
| `area/docs` | User-facing docs (README.md, USER_GUIDE.md, docs/ non-spec content). |
| `area/repo` | The repo as a whole: .github/, CLAUDE.md, release process, label scheme, dev environment. |

Note on CEL-spanning issues (umbrella, design-Q): tag the concrete affected areas (e.g. `cel-emitter, grammar, validator, imports, spec`). There is intentionally no broader `area/cel` — it would overlap `area/cel-emitter`.

## Priority

| Label | Description |
|---|---|
| `priority/p0` | Critical — blocks shipping or causes data loss; must-fix. |
| `priority/p1` | High — significant impact; address in current release window. |
| `priority/p2` | Medium — should fix in a reasonable timeframe. |
| `priority/p3` | Low — nice to have. |

## Filter examples

- All open CEL emitter bugs: `is:open is:issue label:kind/bug label:area/cel-emitter`
- All P0/P1 validator work: `is:open is:issue label:area/validator label:priority/p0,priority/p1`
- All design questions: `is:open is:issue label:kind/design-q`
