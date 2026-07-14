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
    // NOTE on parallelism: at scale (130+ files) a per-worker pool hits a vitest "failed to find the runner" worker-init
    // error, so the run scripts pass `--no-file-parallelism` (files run one at a time, each still isolated) — the proven-
    // reliable path. Config-level serial is NOT cleanly expressible here: `fileParallelism:false` is a global-only option
    // (silently ignored under `projects`), and `poolOptions.{maxThreads:1/singleThread}` itself triggers the runner error.
    // So a bare `npx vitest run` uses the default parallel pool (fine for a subset / a --project filter); the full-suite
    // scripts carry the flag. Revisit once on a clean CI + after auditing the regression suites' fixed-path fixture writes.
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
          pool: "threads", // thread workers are lighter than child-process forks for the heavy ANTLR+core per-file imports
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
          // `forks` (v4 default): child-process isolation — the future T3 suites call `process.exit()`, which a fork contains.
          pool: "forks",
          // T1 proof-of-life ONLY, and OUTSIDE `src/*.test.mjs` so the legacy `run-tests.mjs` never discovers it. T3 moves the
          // bulk under this project and retires the legacy runner.
          include: ["test/vitest/**/*.vitest.test.ts"],
        },
      },
    ],
  },
});
