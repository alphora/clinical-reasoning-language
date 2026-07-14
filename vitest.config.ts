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
    projects: [
      {
        // crl (core): ts-jest → vitest. jest-API suites run under vitest globals unchanged.
        root: resolve(base, "packages/crl"),
        test: {
          name: "crl",
          environment: "node",
          globals: true,
          setupFiles: ["./vitest.setup.ts"], // ports jest.setup.js (console.error mock) via vi.spyOn
          // T1 proof-of-life ONLY — a pure jest-API suite. T2 broadens to the full glob (excluding the `**/tests/index.test.ts`
          // aggregators, which would double-register every leaf they import).
          include: ["src/flags/tests/flagVocab.test.ts"],
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
          pool: "forks",
          // T1 proof-of-life ONLY, and OUTSIDE `src/*.test.mjs` so the legacy `run-tests.mjs` never discovers it. T3 moves the
          // bulk under this project and retires the legacy runner.
          include: ["test/vitest/**/*.vitest.test.ts"],
        },
      },
    ],
  },
});
