/**
 * ⭐⭐ THE ONE PLACE THAT KNOWS WHERE EMIT OUTPUT GOES.
 *
 * Every emit tool takes the SAME argument with the SAME meaning: `out` is the ROOT that the produces
 * table below hangs off. Omit it and it defaults to the project root; pass a path and you get the
 * identical table under that path. Operator, 2026-09-05:
 *
 *   "default (passing nothing) is how you write to the project. manual (passing a path) is how you
 *    write to anywhere else."
 *
 * ⚠ BEFORE THIS EXISTED THE THREE TOOLS TOOK THREE DIFFERENT LEVELS, and nothing said so anywhere.
 * `emit_crl`'s `out` was the parent of `cql/`+`fhir/`, `emit_cel`'s the parent of `patient/`, and
 * `emit_results`' the artifact root. So the value that was right for one was silently wrong for the
 * others: `--out-dir .` produced `./cql/` instead of `src/cql/`, and `--out-dir tests/data` produced
 * `tests/data/patient/` instead of `tests/data/fhir/patient/`. Both write successfully. Both are read
 * by nothing. FOUR documents each described a different layout and none matched the shipped tree.
 *
 * ⭐ THE TABLE IS MEASURED, from a real KALM/KELP content project, and is declared by that project's
 * own `kelp.project.json` — `cql → src/cql`, `fhir → src/fhir`, `qa → tests`. The `qa` entity covers
 * BOTH `tests/data/` and `tests/results/` because it governs `emit_cel` AND `emit_results`.
 *
 * ⚠ THE OFFSETS ARE NOT INTERCHANGEABLE WITH THE WRITERS' OWN SUFFIXES. Each writer appends its own
 * tail (`writeTwoLane` adds `cql/` and `fhir/`; `writeEmitResult` adds `patient/`; `produceResults`
 * adds `tests/results/fhir/`), so an offset here is only the part the writer does NOT add. Changing one
 * without the other silently doubles or drops a segment.
 */

import { join, resolve } from "node:path";

import { findProjectRoot } from "./imports/registry";

/** Which emit lane is asking. Each roots a different subtree under the same `out`. */
export type EmitLane = "crl" | "cql-flat" | "cel" | "results";

/**
 * Where each lane's writer roots itself, relative to `out`.
 *
 * ⚠ `results` is EMPTY because `produceResults` appends `tests/results/fhir` itself, and its `outRoot`
 * is ALSO the base for the orphan scan (`results/produce.ts`) — it genuinely wants the root, not a lane
 * directory. That asymmetry is internal to the writers; the tool surface stays uniform, which is the
 * whole point of this module.
 */
const LANE_OFFSET: Record<EmitLane, string> = {
  crl: "src",
  "cql-flat": join("src", "cql"),
  cel: join("tests", "data", "fhir"),
  results: "",
};

/** Human-readable produces-table row per lane, for help text and error messages. */
export const LANE_PRODUCES: Record<EmitLane, string> = {
  crl: "src/cql/<library>.cql + src/fhir/<ResourceType>/<id>.json",
  "cql-flat": "src/cql/<library>.cql",
  cel: "tests/data/fhir/patient/<compartmentId>/<lowercase-type>/<id>.json",
  results: "tests/results/fhir/patient/<compartmentId>/<lowercase-type>/<id>.json",
};

export type EmitOutput =
  | { ok: true; root: string; dir: string }
  | { ok: false; reason: string };

/**
 * Resolve where a lane writes.
 *
 * `out` is used VERBATIM as the root — the offset is applied exactly once, so passing the project root
 * explicitly is byte-identical to omitting it. That equivalence is the operator's "or possibly, pass the
 * project root", and it is pinned by a test; without it the two forms drift and the uniformity is a lie.
 *
 * ⚠ `out` is deliberately NOT constrained to lie inside a project ("not restricted to the project,
 * necessarily"). A scratch root therefore receives a layout-identical MIRROR, which is what makes
 * copy-back a straight copy rather than a re-derivation — the failure this whole change exists to stop.
 * Per-file containment is still enforced inside each writer; nothing here relaxes that.
 */
export function resolveEmitOutput(
  lane: EmitLane,
  sourcePath: string,
  out: string | undefined,
): EmitOutput {
  if (out !== undefined) {
    const root = resolve(out);
    return { ok: true, root, dir: join(root, LANE_OFFSET[lane]) };
  }

  // ⚠ `findProjectRoot` stats its argument WITHOUT a catch (`imports/registry.ts`), so a missing or
  // unreadable source throws rather than returning null. `emit_results` reaches here before it has
  // checked the file exists, so the catch is load-bearing, not defensive style: without it the declared
  // `{ ok: false }` contract would be a promise the function does not keep.
  let root: string | null;
  try {
    root = findProjectRoot(sourcePath);
  } catch {
    return {
      ok: false,
      reason:
        `cannot read "${sourcePath}" to find its project root. Pass an explicit output path to write ` +
        `somewhere else.`,
    };
  }

  if (root === null) {
    return {
      ok: false,
      reason:
        `no project root above "${sourcePath}" (no package.json in any parent). The default output ` +
        `location is derived from it. Pass an explicit output path to write outside a project.`,
    };
  }

  return { ok: true, root, dir: join(root, LANE_OFFSET[lane]) };
}

/** Exported for tests that need to assert the table without re-deriving it. */
export const laneOffset = (lane: EmitLane): string => LANE_OFFSET[lane];
