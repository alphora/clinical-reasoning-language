// #vitest-unification T1 — the monorepo vitest scaffolding. One root config with `test.projects` (vitest 4 removed the
// `vitest.workspace.ts` file), one project per workspace package. T1 SCOPE: prove one suite runs in each project; the
// `include`s are deliberately SCOPED to the proof-of-life suites so this does NOT run the bulk (that's T2/T3, which broaden
// the globs). Both legacy commands (`npm test` = crl jest via the aggregator; `npm run test:ext` = crl-vscode node runner)
// stay green in parallel — the crl proof is an UNCHANGED existing suite, and the crl-vscode proof lives OUTSIDE the
// `src/*.test.mjs` set the legacy runner discovers.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const base = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // NOTE on parallelism: the suites each import a heavy ANTLR+core graph; a worker PER FILE (threads or forks) exhausts
    // resources on constrained machines and intermittently fails worker init ("Vitest failed to find the runner"). Each
    // project pins serial execution via `poolOptions` (`singleThread`/`singleFork`) — a config-level option that IS honored
    // per-project (unlike `fileParallelism`, which is global-only and silently ignored under `projects`). So EVERY invocation
    // is serial+stable, not just the npm scripts. Revisit a bounded pool once validated on clean CI.
    projects: [
      {
        // crl (core): ts-jest → vitest. jest-API suites run under vitest globals unchanged.
        root: resolve(base, "packages/crl"),
        test: {
          name: "crl",
          environment: "node",
          globals: true,
          // `threads` (not the v4-default `forks`): thread workers are far lighter than child processes — the crl suites each
          // import a heavy ANTLR+core graph, and a process-per-file fork pool balloons memory (→ resource-driven flakiness on
          // constrained machines/CI). (We don't need forks' `process.chdir` — the execSync regression suites pass an explicit
          // `cwd` instead.)
          pool: "threads",
          // `maxThreads:1` = a ONE-worker pool, so files run SEQUENTIALLY but each still gets its own ISOLATED module context
          // (NOT `singleThread:true`, which crams all files into one un-isolated worker → cross-file state leaks). Baked into
          // the config (a `poolOption` IS honored per-project, unlike `fileParallelism`) so EVERY invocation — `npx vitest`,
          // IDE runners, CI — is serial+isolated+stable, not just the scripts. Cross-file parallelism intermittently fails
          // worker init here ("Vitest failed to find the runner"); serial is deterministic + green. Revisit a bounded pool
          // once validated on clean CI (and after auditing the regression suites' fixed-path fixture writes).
          poolOptions: { threads: { maxThreads: 1, minThreads: 1 } },
          // The heaviest suites spawn `npm run cli:*` (ts-node) via execSync, and cold module transforms (the big ANTLR+core
          // graph) can push the first test in a file past the 5s default. 30s gives them room.
          testTimeout: 30_000,
          setupFiles: ["./vitest.setup.ts"], // ports jest.setup.js (console.error mock) via vi.spyOn
          // T2: the full crl suite. The leaf-importing aggregators were de-aggregated (7 pure deleted; the 2 mixed stripped of
          // their leaf-imports, own tests kept), so a plain glob discovers every leaf exactly once — no double-registration.
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // crl-vscode (extension): node:test + esbuild-`load()` → vitest. `vscode` is aliased to the shared stub so a
        // runtime-vscode module (correspondenceCockpit) loads headlessly — vitest transforms the `.ts` natively (the thing
        // `load()` reimplements).
        root: resolve(base, "packages/crl-vscode"),
        resolve: {
          alias: { vscode: resolve(base, "packages/crl-vscode/test/oracle/vscode-stub.ts") },
        },
        test: {
          name: "crl-vscode",
          environment: "node",
          globals: true,
          // Many legacy suites call `process.exit()`; `forks` (v4 default) isolates each file so one can't tear down the run.
          // `maxForks:1` = a one-process pool, serial + isolated (same rationale + reliability as the crl project's maxThreads:1).
          pool: "forks",
          poolOptions: { forks: { maxForks: 1, minForks: 1 } },
          // T1 proof-of-life ONLY, and OUTSIDE `src/*.test.mjs` so the legacy `run-tests.mjs` never discovers it. T3 moves the
          // bulk under this project and retires the legacy runner.
          include: ["test/vitest/**/*.vitest.test.ts"],
        },
      },
    ],
  },
});
