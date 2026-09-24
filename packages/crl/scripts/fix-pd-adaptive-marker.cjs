#!/usr/bin/env node
/*
 * fix-pd-adaptive-marker — rewrite the SDC `questionnaireAdaptive` marker on
 * already-emitted PlanDefinition resources from its URL-valued form to
 * `valueBoolean: true`.
 *
 *   before:  { "url": "<adaptive>", "valueUrl": "http://hcsc.com/fhir/priorauth" }
 *   after:   { "url": "<adaptive>", "valueBoolean": true }
 *
 * SCOPE — two deliberate narrowings:
 *
 *   1. PlanDefinition ONLY. The resulting DTR Questionnaire keeps the URL-valued
 *      form, so Questionnaire / QuestionnaireResponse (and every other resource
 *      type) are left untouched. Only a PlanDefinition's OWN top-level
 *      `extension[]` is considered, never `action[].extension`. A PlanDefinition
 *      found under `contained[]` IS eligible — it is still a PlanDefinition; what
 *      is never touched is the extensions of a NON-PlanDefinition nested there.
 *
 *   2. Eligible source values. By DEFAULT every `valueUrl` on that extension is
 *      eligible, because the rule being applied ("on a PlanDefinition this marker
 *      is boolean true") does not depend on which URL is there — and emitted
 *      packages carry their own canonical base, so keying off one literal URL
 *      would silently leave other packages wrong. Pass `--source-url <url>`
 *      (repeatable) to narrow to exact values instead.
 *
 * An entry is rewritten only when its sole `value[x]` is `valueUrl`. An entry
 * that is already `valueBoolean: true` is a no-op, so re-running is safe. Every
 * OTHER form on that extension URL — `valueBoolean: false`, `valueCanonical`,
 * several `value[x]` at once, no `value[x]` at all — is an UNRESOLVED marker:
 * reported, never changed, and counted as a failure so the run exits non-zero.
 * Fix those by hand.
 *
 * Resources are visited at FHIR resource locations only: the root resource,
 * `contained[]`, `Bundle.entry[].resource`, and `Parameters.parameter[].resource`
 * (including nested `part[]`) — not arbitrary nested JSON. Packaged `.tgz`
 * tarballs are NOT opened; expand them first.
 *
 * WRITE SAFETY. Rewriting goes through JSON.parse → mutate → JSON.stringify, so
 * before writing, the parse of the ORIGINAL is checked for losslessness:
 *
 *   - If re-serializing the original would change its CONTENT — a FHIR decimal
 *     losing significant digits (`1.50` → `1.5`), an integer beyond 2^53, a
 *     `\uXXXX` escape becoming a literal character, duplicate or reordered keys —
 *     the file is REFUSED outright. No flag overrides this; correct it by hand.
 *   - If only the LAYOUT would change (indentation, line endings), the file is
 *     refused unless `--allow-reformat`.
 *   - Otherwise the file is written with every unrelated byte preserved.
 *
 * Writes go to a temporary sibling and are renamed over the original, so an
 * interrupted run cannot leave a truncated file.
 *
 * Usage:
 *   node packages/crl/scripts/fix-pd-adaptive-marker.cjs <file-or-dir> [options]
 *
 *   --write                apply changes (default is preview only)
 *   --source-url <url>     only rewrite this exact valueUrl (repeatable)
 *   --backup               write <file>.bak beside each changed file
 *   --allow-reformat       permit a write whose LAYOUT (indent / line endings)
 *                          would change; never permits a content change
 *
 * Exit: 0 clean, 1 something needs attention (unresolved marker, malformed file,
 *       refused write, write failure), 2 bad usage.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ADAPTIVE_URL =
  "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-questionnaireAdaptive";
const STRATEGY_PROFILE = "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-strategydefinition";
const SKIP_DIRS = new Set(["node_modules", ".git"]);

/* ─── argv ────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const opts = { target: null, write: false, sourceUrls: [], backup: false, allowReformat: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") opts.write = true;
    else if (a === "--backup") opts.backup = true;
    else if (a === "--allow-reformat") opts.allowReformat = true;
    else if (a === "--source-url") {
      const v = argv[++i];
      if (!v) return { error: "--source-url needs a value" };
      opts.sourceUrls.push(v);
    } else if (a === "-h" || a === "--help") return { help: true };
    else if (a.startsWith("-")) return { error: `unknown option ${a}` };
    else if (opts.target === null) opts.target = a;
    else return { error: `unexpected extra argument ${a}` };
  }
  if (opts.target === null) return { error: "a file or directory argument is required" };
  return { opts };
}

/* ─── file discovery ──────────────────────────────────────────────── */

function collectJsonFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".json")) {
        out.push(path.join(dir, e.name));
      }
    }
  };
  walk(target);
  out.sort();
  return out;
}

/* ─── resource walk ───────────────────────────────────────────────── */

/**
 * Every FHIR resource reachable from `doc` at a resource-bearing location:
 * `contained[]`, `Bundle.entry[].resource`, `Parameters.parameter[].resource`
 * and the `part[]` beneath a parameter. Nothing else is treated as a resource.
 */
function eachResource(doc, visit) {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return;
  if (typeof doc.resourceType !== "string") return;
  visit(doc);
  if (Array.isArray(doc.contained)) for (const c of doc.contained) eachResource(c, visit);
  if (doc.resourceType === "Bundle" && Array.isArray(doc.entry)) {
    for (const entry of doc.entry) {
      if (entry && typeof entry === "object") eachResource(entry.resource, visit);
    }
  }
  if (doc.resourceType === "Parameters" && Array.isArray(doc.parameter)) {
    const params = p => {
      if (!p || typeof p !== "object") return;
      eachResource(p.resource, visit);
      if (Array.isArray(p.part)) for (const q of p.part) params(q);
    };
    for (const p of doc.parameter) params(p);
  }
}

/** The `value[x]` property names present on an extension entry. */
function valueKeys(ext) {
  return Object.keys(ext).filter(k => /^value[A-Z]/.test(k));
}

/**
 * Rewrite eligible markers on one parsed document, in place. Returns
 * `{ changed, notes, unresolved }` — `notes` is informational, `unresolved`
 * lists markers a human still has to deal with.
 */
function rewrite(doc, sourceUrls) {
  let changed = 0;
  const notes = [];
  const unresolved = [];
  eachResource(doc, res => {
    if (res.resourceType !== "PlanDefinition") return;
    if (!Array.isArray(res.extension)) return;
    const who = res.id ? `PlanDefinition/${res.id}` : "PlanDefinition";
    let matches = 0;
    res.extension.forEach((ext, i) => {
      if (!ext || typeof ext !== "object" || Array.isArray(ext)) return;
      if (ext.url !== ADAPTIVE_URL) return;
      matches++;
      const where = `${who} extension[${i}]`;
      const keys = valueKeys(ext);

      if (keys.length === 1 && keys[0] === "valueUrl" && typeof ext.valueUrl === "string") {
        if (sourceUrls.length > 0 && !sourceUrls.includes(ext.valueUrl)) {
          notes.push(`${where}: valueUrl ${ext.valueUrl} not in --source-url list, left alone`);
          return;
        }
        // Rebuild the entry so `valueBoolean` takes the slot `valueUrl` held,
        // keeping every other property of the extension untouched.
        const replacement = {};
        for (const [k, v] of Object.entries(ext)) {
          if (k === "valueUrl") replacement.valueBoolean = true;
          else replacement[k] = v;
        }
        res.extension[i] = replacement;
        changed++;
        // Our emitter only ever puts this marker on a ROOT (strategy) PlanDefinition.
        // Converting one elsewhere is probably right but is worth seeing.
        const profiles = (res.meta && res.meta.profile) || [];
        if (!Array.isArray(profiles) || !profiles.includes(STRATEGY_PROFILE)) {
          notes.push(`${where}: converted, but this is not a cpg-strategydefinition root`);
        }
        return;
      }

      if (keys.length === 1 && keys[0] === "valueBoolean" && ext.valueBoolean === true) return;

      const shape =
        keys.length === 0
          ? "no value[x]"
          : keys.length > 1
            ? `several value[x]: ${keys.join(", ")}`
            : keys[0] === "valueBoolean"
              ? "valueBoolean: false — contradicts the rule"
              : keys[0];
      unresolved.push(`${where}: ${shape}; not changed, fix by hand`);
    });
    if (matches > 1) notes.push(`${who}: ${matches} adaptive markers on one resource`);
  });
  return { changed, notes, unresolved };
}

/* ─── serialization ───────────────────────────────────────────────── */

function detectStyle(text) {
  const m = /\n([ \t]+)"/.exec(text);
  let indent = 2;
  if (m) indent = m[1][0] === "\t" ? "\t" : m[1].length;
  return {
    indent,
    eol: text.includes("\r\n") ? "\r\n" : "\n",
    trailingNewline: /\r?\n$/.test(text),
  };
}

function serialize(doc, style) {
  let s = JSON.stringify(doc, null, style.indent);
  if (style.eol === "\r\n") s = s.replace(/\n/g, "\r\n");
  return style.trailingNewline ? s + style.eol : s;
}

/** `text` with the whitespace OUTSIDE strings removed — string contents intact. */
function compactJson(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const c of text) {
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      out += c;
      inString = true;
    } else if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
      out += c;
    }
  }
  return out;
}

/**
 * What would writing this file cost beyond the marker itself?
 * "content" — re-serializing changes the document (decimal precision, escapes,
 *             key order, duplicate keys). Never acceptable.
 * "layout"  — only indentation / line endings differ.
 * "none"    — every unrelated byte is preserved.
 */
function writeCost(text, parsedOriginal, style) {
  if (JSON.stringify(parsedOriginal) !== compactJson(text)) return "content";
  return serialize(parsedOriginal, style) === text ? "none" : "layout";
}

/* ─── main ────────────────────────────────────────────────────────── */

function main() {
  const { opts, error, help } = parseArgs(process.argv.slice(2));
  if (help) {
    process.stdout.write(fs.readFileSync(__filename, "utf8").split("*/")[0] + "*/\n");
    return 0;
  }
  if (error) {
    process.stderr.write(`fix-pd-adaptive-marker: ${error}\n`);
    process.stderr.write(
      "usage: node packages/crl/scripts/fix-pd-adaptive-marker.cjs <file-or-dir> " +
        "[--write] [--source-url <url>]... [--backup] [--allow-reformat]\n",
    );
    return 2;
  }

  let files;
  try {
    files = collectJsonFiles(opts.target);
  } catch (e) {
    process.stderr.write(`cannot read ${opts.target}: ${e.message}\n`);
    return 1;
  }

  let changedFiles = 0;
  let changedMarkers = 0;
  let failures = 0;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e) {
      process.stderr.write(`ERROR  ${file}: cannot read (${e.message})\n`);
      failures++;
      continue;
    }

    let doc;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      // Only complain about files that claim to carry the marker; a directory of
      // mixed JSON will contain plenty that are simply not ours.
      if (text.includes(ADAPTIVE_URL)) {
        process.stderr.write(`ERROR  ${file}: malformed JSON (${e.message})\n`);
        failures++;
      }
      continue;
    }

    const { changed, notes, unresolved } = rewrite(doc, opts.sourceUrls);
    for (const n of notes) process.stdout.write(`note   ${file}: ${n}\n`);
    for (const u of unresolved) {
      process.stderr.write(`UNRESOLVED  ${file}: ${u}\n`);
      failures++;
    }
    if (changed === 0) continue;

    const style = detectStyle(text);
    const cost = writeCost(text, JSON.parse(text), style);

    if (cost === "content") {
      process.stderr.write(
        `ERROR  ${file}: rewriting would alter unrelated CONTENT (decimal precision, ` +
          `escapes, duplicate or reordered keys); refusing — correct this file by hand\n`,
      );
      failures++;
      continue;
    }

    if (!opts.write) {
      const tail = cost === "layout" ? " — also restyles layout, needs --allow-reformat" : "";
      changedFiles++;
      changedMarkers += changed;
      process.stdout.write(`would change  ${file} (${changed} marker(s))${tail}\n`);
      continue;
    }

    if (cost === "layout" && !opts.allowReformat) {
      process.stderr.write(
        `ERROR  ${file}: writing would also restyle the file's layout (indentation or ` +
          `line endings); re-run with --allow-reformat if that is acceptable\n`,
      );
      failures++;
      continue;
    }

    const tmp = `${file}.tmp-${process.pid}`;
    try {
      if (opts.backup) {
        const bak = `${file}.bak`;
        if (fs.existsSync(bak)) throw new Error(`backup ${bak} already exists`);
        fs.writeFileSync(bak, text);
      }
      // Write beside the target and rename over it, so an interrupted run cannot
      // leave the original truncated.
      fs.writeFileSync(tmp, serialize(doc, style));
      fs.renameSync(tmp, file);
      changedFiles++;
      changedMarkers += changed;
      process.stdout.write(`changed  ${file} (${changed} marker(s))\n`);
    } catch (e) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* the write error below is the one worth reporting */
      }
      process.stderr.write(`ERROR  ${file}: cannot write (${e.message})\n`);
      failures++;
    }
  }

  const verb = opts.write ? "changed" : "would change";
  process.stdout.write(
    `\n${files.length} JSON file(s) scanned; ${verb} ${changedFiles} file(s), ` +
      `${changedMarkers} marker(s); ${failures} need attention.\n`,
  );
  if (!opts.write && changedFiles > 0) {
    process.stdout.write("re-run with --write to apply.\n");
  }
  return failures > 0 ? 1 : 0;
}

// `process.exitCode` rather than `process.exit`, so a piped stdout (asynchronous
// on Windows) drains before the process leaves.
process.exitCode = main();
