// Release gate — refuse to PACK while refactor bookkeeping is still in the code.
//
// `REFACTOR:grounded` / `REFACTOR:suspect` / `RETIRE:<trigger>` are development state. They exist so a
// reader (and a reviewer) can tell which code has been re-derived from the target model and which is still
// the patient. None of that means anything to a consumer, and the refactor's own done-gate already says to
// sweep every marker in one final commit — so a release carrying them means the refactor was not closed.
//
// ⚠ WORST CASE is the catalog `.cql`. Those are copied VERBATIM into every policy the emitter produces, so
// a marker there does not just ship to our consumers — it propagates into THEIR published IGs, where
// everyone downstream reads our internal bookkeeping. Same rule, much larger blast radius.
//
// Escape hatch: ALLOW_REFACTOR_MARKERS=1 proceeds, loudly. Use it only for a deliberate interim release
// with the refactor still open, and say so in the release notes.
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SRC = join(root, "src");
const MARKER = /\b(REFACTOR:(grounded|suspect)|RETIRE:)/;
// Goldens are internal oracles — they never ship, and they SHOULD carry the marks so a reviewer reading
// emitted output sees the same warning a reviewer reading source does.
const SKIP = /[\\/](tests[\\/]golden|tests[\\/]fixtures)[\\/]/;

const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(ts|cql)$/.test(p) || SKIP.test(p)) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((l, i) => {
      if (MARKER.test(l)) hits.push(`${relative(root, p)}:${i + 1}`);
    });
  }
})(SRC);

if (hits.length === 0) {
  process.stdout.write("check-refactor-markers: clean — no refactor bookkeeping in shippable source.\n");
  process.exit(0);
}

const shown = hits.slice(0, 25);
const msg =
  `check-refactor-markers: ${hits.length} refactor marker(s) in shippable source.\n` +
  shown.map((h) => `  ${h}`).join("\n") +
  (hits.length > shown.length ? `\n  … and ${hits.length - shown.length} more\n` : "\n") +
  "\nA release carrying these means a refactor is still open (tmp/REFACTORS-IN-FORCE.md).\n" +
  "\nIF THE REFACTOR IS STILL OPEN - this is the normal case, take it:\n" +
  "  ALLOW_REFACTOR_MARKERS=1 npm pack   - and say so in the release notes.\n" +
  "\nIF THE REFACTOR IS ACTUALLY FINISHED: close it properly - resolve the open slices, delete every\n" +
  "RETIRE: whose trigger has fired, then sweep the REFACTOR: markers in ONE deliberate commit and move\n" +
  "the entry to CLOSED.\n" +
  "\nDO NOT delete markers to make this gate pass. They are the record that code was verified against\n" +
  "the target model; removing them makes verified code indistinguishable from unchecked code, and\n" +
  "defeats the grep that is the only way to tell. Use the override instead - that is what it is for.\n";

if (process.env.ALLOW_REFACTOR_MARKERS === "1") {
  process.stderr.write(msg.replace("check-refactor-markers:", "check-refactor-markers [OVERRIDDEN]:"));
  process.exit(0);
}
process.stderr.write(msg);
process.exit(1);
