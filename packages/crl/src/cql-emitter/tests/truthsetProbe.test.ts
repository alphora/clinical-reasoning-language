import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { describe, it } from "vitest";

import type { CRL, Concept } from "../../ast/types";
import { assumedShapePreMigration } from "../../grammar/conceptShapes";
import { buildCRL } from "../../index";
import { classifyBooleanTotality } from "../../emit/booleanTotality";

/**
 * #189 T5-CQL BUILD-ORDER STEP 1 — the whole-fixture probe + migration inventory
 * (`tmp/PLAN-truthset-retire.md` §2, plan of record; panel disc 477/478/479, operator-chosen option (A)).
 *
 * ⭐ WHAT THIS PRODUCES: `tmp/INVENTORY-truthset.md` — the exact per-concept edit list the coupled slice
 * needs before it touches anything. The plan names a KNOWN population and says "CONFIRM + complete"; this is
 * the confirming, and it writes the completion.
 *
 * ⚠ IT IS A PROBE, NOT AN ORACLE. It asserts nothing about the corpus — enumerating a shape is not the same
 * as ruling on it, and the reject seam's rulings live in the plan. The one thing it DOES assert is that it
 * still finds files to read, so a path change cannot silently turn the inventory into an empty list.
 */

const REPO = path.resolve(__dirname, "../../../../..");

/** The cells the coupled slice must dispose of, per the plan of record. */
type Cell =
  /** A Scalar boolean `code is` with NO reduction and no `shape is RecordSet` — the truth-set lane's operand. */
  | "bare-scalar"
  /** `code is` + `defined as` + a `source representation` — the E1 both-rep family. */
  | "e1-defined-as"
  /** `code is` + `coded from` (a top-level `CodedFromDefinition`) + a `source representation`. */
  | "e1-coded-from"
  /** `code is` + a `source representation`, no definition at all. */
  | "e1-source-rep";

interface Row {
  file: string;
  concept: string;
  cell: Cell;
  /** What the concept declares, so the inventory says WHY without a second read. */
  detail: string;
}

function classify(c: Concept): { cell: Cell; detail: string } | undefined {
  if (c.code === undefined) return undefined;
  const shape = assumedShapePreMigration(c.shape);
  const valueType = c.valueTypes?.length === 1 ? c.valueTypes[0] : undefined;
  const reps = (c.representations ?? []).length;
  const def = c.definition;
  const declared = `shape=${c.shape ?? "(undeclared)"} value=${valueType ?? "(none)"} def=${
    def?.type ?? "(none)"
  } posreps=${reps}`;

  // ⚠⚠ E1 IS "A `code is` CONCEPT THAT ALSO HAS A SECOND REPRESENTATION", and there are THREE ways to get
  // one — a `defined as` twin, a `coded from` binding, or a `source representation`. An earlier cut of this
  // probe required `posreps > 0` for all three, which made `e1-defined-as` come back ZERO and dropped both
  // `mixed-code-defined-as` and `defined-as-exists-bothrep` — two of the plan's own named entries. The plan
  // named them; the probe not seeing them was the probe being wrong, not the plan being stale.
  if (def?.type === "DefinedAsDefinition") return { cell: "e1-defined-as", detail: declared };
  if (def?.type === "CodedFromDefinition") return { cell: "e1-coded-from", detail: declared };
  if (reps > 0) {
    if (def === undefined) return { cell: "e1-source-rep", detail: declared };
    // `code is` + `definition is`/reduction + posrep is the emit-mixed cell, owned by a different gate.
    return undefined;
  }
  // BARE SCALAR: a Scalar boolean `code is` carrying no derivation at all.
  if (shape === "Scalar" && valueType === "boolean" && def === undefined) {
    return { cell: "bare-scalar", detail: declared };
  }
  return undefined;
}

describe("#189 T5-CQL step 1 — truth-set retirement inventory", () => {
  it("enumerates every bare-scalar and E1 concept in the corpus", () => {
    const files = execSync("git ls-files", { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 })
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.endsWith(".crl"));
    if (files.length === 0) throw new Error("probe found no .crl files — the corpus walk is broken");

    const rows: Row[] = [];
    const unparsed: string[] = [];
    for (const f of files) {
      let built: { result?: CRL };
      try {
        built = buildCRL(readFileSync(path.join(REPO, f), "utf8")) as never;
      } catch {
        unparsed.push(f);
        continue;
      }
      if (!built.result) {
        unparsed.push(f);
        continue;
      }
      for (const c of built.result.statements as Concept[]) {
        if (c.type !== "Concept") continue;
        const hit = classify(c);
        if (!hit) continue;
        // ⭐ RUN the classifier, do not read its comments: the module carries TWO doctrine comments that
        // disagree about what an E1 form classifies as. The verdict is the fact.
        let verdict: string;
        try {
          const v = classifyBooleanTotality(c) as { kind: string; code?: string };
          verdict = v.kind + (v.code ? `/${v.code}` : "");
        } catch (e) {
          verdict = `THREW ${String(e).slice(0, 40)}`;
        }
        rows.push({ file: f, concept: c.name, cell: hit.cell, detail: `${hit.detail} → **${verdict}**` });
      }
    }

    const byCell = new Map<Cell, Row[]>();
    for (const r of rows) byCell.set(r.cell, [...(byCell.get(r.cell) ?? []), r]);

    // ⚠ The plan's KNOWN population, verbatim, so the report says which entries it CONFIRMED and which the
    // plan listed but the probe does not see (a stale entry is as important as a new one).
    const PLAN_NAMED = [
      "example-nested",
      "example-semand",
      "example-for-emit",
      "code-is-decision/root",
      "non-decision-localcode-activity/root",
      "standalone-age",
      "decision-localcode-reduction/root",
      "criterion-isolation",
      "criterion-foreign-qualified",
      "criterion-xor",
      "criterion-cycle-scoped",
      "partial-concepts-name-collision",
      "mixed-code-defined-as",
      "defined-as-exists-bothrep",
      "example-bothrep",
    ];
    const hitFiles = new Set(rows.map((r) => r.file));
    const confirmed = PLAN_NAMED.filter((n) => [...hitFiles].some((f) => f.includes(n)));
    const notSeen = PLAN_NAMED.filter((n) => !confirmed.includes(n));
    const namedFiles = new Set(
      [...hitFiles].filter((f) => PLAN_NAMED.some((n) => f.includes(n))),
    );
    const newlyFound = [...hitFiles].filter((f) => !namedFiles.has(f)).sort();

    const nl = String.fromCharCode(10);
    const out: string[] = [
      "# INVENTORY — #189 T5-CQL step 1 (truth-set lane retirement)",
      "",
      "⚠ GENERATED by `cql-emitter/tests/truthsetProbe.test.ts`. Re-run it rather than hand-editing.",
      "Plan of record: `tmp/PLAN-truthset-retire.md` §2. This is its \"CONFIRM + complete\".",
      "",
      `Corpus: ${files.length} tracked \`.crl\` files, ${unparsed.length} unparsed.`,
      `Total concepts in scope: **${rows.length}** across **${hitFiles.size}** files.`,
      "",
      "## Counts by cell",
      "",
      "| cell | n | files |",
      "|---|---:|---:|",
      ...(["bare-scalar", "e1-defined-as", "e1-coded-from", "e1-source-rep"] as Cell[]).map((c) => {
        const rs = byCell.get(c) ?? [];
        return `| \`${c}\` | ${rs.length} | ${new Set(rs.map((r) => r.file)).size} |`;
      }),
      "",
      "## ⭐ Against the plan's named population",
      "",
      `**CONFIRMED (${confirmed.length}/${PLAN_NAMED.length}):** ${confirmed.join(", ") || "(none)"}`,
      "",
      `**NAMED BY THE PLAN BUT NOT FOUND (${notSeen.length}):** ${notSeen.join(", ") || "(none)"}`,
      "",
      "⚠ A plan entry the probe cannot see is EITHER a stale plan entry OR a broken probe, and both have",
      "happened here. Each was read by hand; the dispositions:",
      "",
      "| entry | disposition |",
      "|---|---|",
      "| `example-nested` | ALREADY MIGRATED — all three leaves carry `definition is exists this` |",
      "| `example-semand` | ALREADY MIGRATED — 2 `exists this` leaves |",
      "| `example-for-emit` | ALREADY MIGRATED — 2 `exists this` leaves |",
      "| `decision-localcode-reduction/root` | ALREADY MIGRATED — `exists this`; its sibling is `exists \"Trial Records\"` |",
      "",
      "⚠ So the plan's record-refinement trio — the case §3 calls out first — is DONE. The plan (2026-08-20)",
      "predates that migration; do not re-migrate them, and do not read their absence as a probe defect.",
      "",
      "⚠ `mixed-code-defined-as` and `defined-as-exists-bothrep` were ALSO reported missing by the probe's",
      "first cut, and that WAS a probe defect: E1 was coded as requiring a `source representation`, when a",
      "`code is` + `defined as` twin IS the second representation. Corrected; both now appear.",
      "",
      `**FOUND BUT NOT NAMED (${newlyFound.length} files):** the plan said \"complete\" — this is the completion.`,
      "",
      ...newlyFound.map((f) => `- \`${f}\``),
      "",
      "## Full inventory",
      "",
    ];
    for (const cell of ["bare-scalar", "e1-defined-as", "e1-coded-from", "e1-source-rep"] as Cell[]) {
      const rs = byCell.get(cell) ?? [];
      out.push(`### \`${cell}\` — ${rs.length}`, "");
      if (rs.length === 0) out.push("_(none)_", "");
      for (const r of rs.sort((a, b) => a.file.localeCompare(b.file))) {
        out.push(`- \`${r.file}\` :: **${r.concept}** — ${r.detail}`);
      }
      out.push("");
    }
    // ⚠⚠ THE INLINE CORPUS. Plan §2 says "every fixture + inline test CRL", and an earlier cut of this probe
    // walked `git ls-files` ONLY — so "seven concepts across five files" was the tracked-`.crl` count, not
    // the seam's blast radius. Both review arms caught it, and one named a concrete miss
    // (`caseFeatureRecord.test.ts` "Legacy" — Condition + boolean + code, no reduction). Inline CRL lives in
    // template literals inside test files; extract each `library "..."`-rooted block and classify it too.
    const inlineRows: Row[] = [];
    const testFiles = execSync("git ls-files", { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 })
      .split(String.fromCharCode(10))
      .map((x) => x.trim())
      .filter((x) => x.endsWith(".test.ts"));
    for (const f of testFiles) {
      const src = readFileSync(path.join(REPO, f), "utf8");
      // A backtick block containing a `library "..."` line — the shape every inline CRL fixture uses.
      // ⚠ The delimiter is built rather than written: a backtick inside a regex literal in a .ts file trips
      // the transform. `BT` is that character.
      const BT = String.fromCharCode(96);
      const BS = String.fromCharCode(92);
      // ⚠⚠ THE CHARACTER CLASS MUST TOLERATE AN ESCAPED BACKTICK, and two earlier cuts did not — each found
      // ZERO inline concepts while the review had NAMED one (`caseFeatureRecord.test.ts` "Legacy"). Inline
      // CRL routinely contains `\`code\`` , so a naive `[^BT]*` stops at the first escaped backtick and the
      // block never closes. A probe that cannot reach the case a reviewer handed it is decorative.
      const body = "(?:[^" + BT + BS + BS + "]|" + BS + BS + ".)*";
      const blockRe = new RegExp(BT + "(" + body + ")" + BT, "g");
      for (const m of src.matchAll(blockRe)) {
        if (!/concept\s+"/.test(m[1])) continue;
        const raw = m[1]
          .split(BS + BT)
          .join(BT)
          // Inline snippets are written with ESCAPED newlines inside a single-line literal.
          .split(BS + "n")
          .join(String.fromCharCode(10))
          .replace(/\$\{[^}]*\}/g, "X");
        const snippet = /library\s+"/.test(raw)
          ? raw
          : 'library "Inline".' + String.fromCharCode(10) + raw;
        let built: { result?: CRL };
        try {
          built = buildCRL(snippet) as never;
        } catch {
          continue;
        }
        if (!built.result) continue;
        for (const c of built.result.statements as Concept[]) {
          if (c.type !== "Concept") continue;
          const hit = classify(c);
          if (!hit) continue;
          let verdict: string;
          try {
            const v = classifyBooleanTotality(c) as { kind: string; code?: string };
            verdict = v.kind + (v.code ? `/${v.code}` : "");
          } catch (e) {
            verdict = `THREW ${String(e).slice(0, 40)}`;
          }
          inlineRows.push({ file: f, concept: c.name, cell: hit.cell, detail: `${hit.detail} → **${verdict}**` });
        }
      }
    }
    const inlineRejects = inlineRows.filter((r) => r.detail.includes("rejected/"));
    out.push(
      "## ⚠ INLINE test CRL (plan §2's other half)",
      "",
      `${inlineRows.length} in-scope concepts in inline snippets across ${new Set(inlineRows.map((r) => r.file)).size} test files.`,
      `**${inlineRejects.length} of them classify \`rejected\`** — these fire the step-4 seam too, and are NOT`,
      "in the tracked-`.crl` count.",
      "",
      ...inlineRejects.map((r) => `- \`${r.file}\` :: **${r.concept}** — ${r.detail}`),
      "",
    );

    if (unparsed.length > 0) {
      out.push("## Unparsed (excluded from the counts)", "", ...unparsed.map((f) => `- \`${f}\``), "");
    }
    // ⚠ `tmp/` IS GITIGNORED, so it does NOT exist in a fresh clone — this write was an ENOENT on every CI
    // run while passing locally, where the directory happens to be there. It failed the v4.112.0 release
    // gate. A probe that writes an artifact must create its own directory; do not assume a workspace layout
    // that only exists on a machine somebody has already worked in.
    mkdirSync(path.join(REPO, "tmp"), { recursive: true });
    writeFileSync(path.join(REPO, "tmp/INVENTORY-truthset.md"), out.join(nl), "utf8");
  });
});
