// #vitest-unification — the monorepo vitest config. One root config with `test.projects` (vitest 4 removed the
// `vitest.workspace.ts` file), one project per workspace package. Both packages are fully on vitest: `crl` (T2, ts-jest →
// vitest) and `crl-vscode` (T3, the bespoke node-harness suites → vitest, retiring `run-tests.mjs`/`test-harness.mjs`).
// Run the whole monorepo with `npm run test:vitest`, or a single project via `--project crl` / `--project crl-vscode`.
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
          // mcp-server/provision/stableServer spawn built servers + do real fs work; the default 5s is tight under a cold
          // transform + process spawn. 30s (matching the crl project) gives the integration suites room.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // `forks` (v4 default): child-process isolation. The integration suites (mcp-server, provision, stableServer)
          // spawn built servers + child processes and do real fs work; a per-file fork keeps that fully isolated per suite.
          pool: "forks",
          // T3: the full crl-vscode suite. `src/**/*.test.mjs` are the migrated node-harness suites; the T1 proof stays; the
          // oracle golden gate lives outside src/ and is listed explicitly (its filename matches neither glob).
          include: ["src/**/*.test.mjs", "test/vitest/**/*.vitest.test.ts", "test/oracle/check.mjs"],
        },
      },
    ],
  },
});
