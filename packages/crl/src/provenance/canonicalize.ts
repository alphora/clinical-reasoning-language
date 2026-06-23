/**
 * Anchor-source canonicalizer (provenance T4 prereq; design: docs/provenance-spec.md §6, plan v3).
 *
 * Deterministically renders a `.docx` (a ZIP of OOXML) into canonical TEXT — the stable, offset-addressable
 * `anchor-source` that provenance `sourceRef` offsets (utf8-byte, half-open) anchor into. Zero-dependency
 * (Node `zlib` only) so it bundles cleanly into the VSIX/MCP builds and gives byte-level determinism.
 *
 * The determinism contract is the whole point — same `.docx` → byte-identical text. Pinned rules (plan v3):
 *  - body + tables only (headers/footers/footnotes excluded; non-whitespace there → a WARNING, not a drop);
 *  - `<w:t>` char data verbatim (entities decoded, XML EOL-normalized; NEVER whitespace-collapsed; xml:space ignored);
 *  - runs / adjacent `<w:t>` concatenated with NO separator; `<w:tab>`→\t, `<w:br>`/`<w:cr>`→\n;
 *  - paragraphs joined by a single \n (empty `<w:p>` → empty line); tables: cell \t / row \n;
 *  - tracked changes: keep `<w:ins>`/`<w:moveTo>`, drop `<w:del>`/`<w:delText>`/`<w:moveFrom>`;
 *  - NFC the assembled text before hashing + offsets, but PRESERVE visible characters (no ASCII-folding).
 * Fail-closed (returned, never thrown — mirrors fhir-emitter/reproDate): zip64 / encrypted / multi-disk /
 * unsupported compression / CRC mismatch / nested table / `mc:AlternateContent` / control-char numeric ref.
 */
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const CANONICALIZER_NAME = "crl-anchor-docx-text";
/** Bump on ANY extraction/normalization rule change — offsets + textHash are comparable only within a version. */
export const CANONICALIZER_VERSION = "1.0.0";

const MAX_UNCOMPRESSED = 64 * 1024 * 1024; // 64 MB per entry (zip-bomb guard)

export interface AnchorMetaCore {
  textHash: string; // sha256:<lowercase-hex> over Buffer.from(text,'utf8')
  canonicalizer: string;
  canonicalizerVersion: string;
  offsetUnit: "utf8-byte";
  unicodeNormalization: "NFC";
  rangeConvention: "half-open";
}
export interface CanonicalizeWarning {
  kind: string;
  message: string;
}
export interface CanonicalizeError {
  kind: string;
  message: string;
}
export type CanonicalizeResult =
  | { ok: true; text: string; metaCore: AnchorMetaCore; warnings: CanonicalizeWarning[] }
  | { ok: false; error: CanonicalizeError; warnings: CanonicalizeWarning[] };

/** Persisted sidecar metadata (`<name>.anchormeta.json`): the core fields + provenance back-pointers + warnings. */
export interface AnchorMeta extends AnchorMetaCore {
  path: string; // the canonical-text artifact this metadata describes
  derivedFrom: string; // the source .docx it was derived from
  derivedFromHash: string; // sha256:<hex> of the source .docx bytes
  warnings: CanonicalizeWarning[]; // durable: a consumer (KELP) gates on these, not on stderr
}
export type AnchorArtifactResult =
  | { ok: true; text: string; meta: AnchorMeta }
  | { ok: false; error: CanonicalizeError; warnings: CanonicalizeWarning[] };

class CanonicalizeFailure extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

// ============================================================
// ZIP (zero-dep, fail-closed)
// ============================================================

interface ZipEntry {
  name: string;
  method: number;
  crc32: number;
  compSize: number;
  uncompSize: number;
  localOffset: number;
  flags: number;
  diskStart: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

function fail(kind: string, message: string): never {
  throw new CanonicalizeFailure(kind, message);
}

function findEocd(buf: Buffer): number {
  // EOCD is 22 bytes + an optional comment up to 65535. Scan back from the end; accept only a record whose
  // declared comment length is consistent with the remaining bytes (so a signature-shaped byte sequence inside
  // a trailing comment is not mistaken for the real EOCD).
  if (buf.length < 22) fail("not-a-zip", "Too small to be a .docx/ZIP.");
  const min = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD && i + 22 + buf.readUInt16LE(i + 20) === buf.length)
      return i;
  }
  fail("not-a-zip", "End-of-central-directory record not found (not a valid .docx/ZIP).");
}

function parseCentralDirectory(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  // Reject zip64: an EOCD64 locator sits just before the EOCD, or EOCD uses sentinel values.
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_EOCD64_LOC) {
    fail("zip64-unsupported", "ZIP64 archive is not supported.");
  }
  const diskNo = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  if (diskNo !== 0 || cdDisk !== 0)
    fail("multi-disk-unsupported", "Multi-disk ZIP is not supported.");
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    fail("zip64-unsupported", "ZIP64 sentinel sizes/offsets are not supported.");
  }
  if (cdOffset + cdSize > buf.length)
    fail("malformed-zip", "Central directory extends past end of file.");

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  for (let i = 0; i < total; i++) {
    if (p + 46 > cdEnd || buf.readUInt32LE(p) !== SIG_CEN) {
      fail("malformed-zip", "Malformed central-directory entry.");
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const diskStart = buf.readUInt16LE(p + 34);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > cdEnd)
      fail("malformed-zip", "Central-directory entry extends past the directory.");
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, crc32: crc, compSize, uncompSize, localOffset, flags, diskStart });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  if (entry.flags & 0x0001) fail("encrypted-unsupported", `Encrypted ZIP entry: ${entry.name}`);
  if (entry.diskStart !== 0) fail("multi-disk-unsupported", "Multi-disk ZIP is not supported.");
  if (entry.uncompSize > MAX_UNCOMPRESSED) {
    fail(
      "entry-too-large",
      `Entry ${entry.name} uncompressed size ${entry.uncompSize} exceeds the ${MAX_UNCOMPRESSED}-byte cap.`,
    );
  }
  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== SIG_LOC)
    fail("malformed-zip", `Bad local header for ${entry.name}.`);
  // The local header's name/extra lengths differ from the central directory's — re-read them here.
  const locNameLen = buf.readUInt16LE(lo + 26);
  const locExtraLen = buf.readUInt16LE(lo + 28);
  const locName = buf.toString("utf8", lo + 30, lo + 30 + locNameLen);
  if (locName !== entry.name)
    fail("malformed-zip", `Local/central name mismatch: ${locName} vs ${entry.name}.`);
  const dataStart = lo + 30 + locNameLen + locExtraLen;
  if (dataStart + entry.compSize > buf.length)
    fail("malformed-zip", `Entry data for ${entry.name} extends past end of file.`);
  const compressed = buf.subarray(dataStart, dataStart + entry.compSize);

  let out: Buffer;
  if (entry.method === 0) {
    out = Buffer.from(compressed);
  } else if (entry.method === 8) {
    try {
      // maxOutputLength bounds memory — a zip bomb (small deflate → huge inflate) throws rather than allocating.
      out = inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED });
    } catch (e) {
      fail(
        "inflate-failed",
        `Deflate decompression failed for ${entry.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    fail(
      "unsupported-compression",
      `Unsupported ZIP compression method ${entry.method} for ${entry.name}.`,
    );
  }
  if (out.length > MAX_UNCOMPRESSED)
    fail(
      "entry-too-large",
      `Entry ${entry.name} inflated beyond the ${MAX_UNCOMPRESSED}-byte cap.`,
    );
  if (crc32(out) !== entry.crc32)
    fail("crc-mismatch", `CRC32 mismatch for ${entry.name} (ZIP corruption).`);
  return out;
}

// CRC-32 (IEEE 802.3) — table-based; no dependency on zlib.crc32 (Node-version-gated).
let CRC_TABLE: Uint32Array | undefined;
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ============================================================
// Minimal XML → lite tree
// ============================================================

interface XmlEl {
  local: string; // namespace-stripped local name
  children: XmlNode[];
}
type XmlNode = XmlEl | { text: string };

function isEl(n: XmlNode): n is XmlEl {
  return (n as XmlEl).local !== undefined;
}

function decodeOneEntity(body: string, raw: string): string {
  const ref = raw.length > 32 ? raw.slice(0, 32) + "…" : raw; // cap for error messages (char data nodes can be huge)
  if (body[0] === "#") {
    const hex = body[1] === "x" || body[1] === "X";
    const digits = hex ? body.slice(2) : body.slice(1);
    if (!(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits))
      fail("bad-entity", `Invalid numeric character reference ${ref}.`);
    const cp = parseInt(digits, hex ? 16 : 10);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
      fail("bad-entity", `Out-of-range/surrogate character reference ${ref}.`);
    // C0/C1 control chars would collide with the structural \t/\n — fail closed (none expected in real .docx).
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f))
      fail(
        "control-char-ref",
        `Control-character reference ${ref} is not supported in anchor text.`,
      );
    return String.fromCodePoint(cp);
  }
  switch (body) {
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "amp":
      return "&";
    case "quot":
      return '"';
    case "apos":
      return "'"; // one of the five predefined XML entities
    default:
      fail("bad-entity", `Unknown XML entity ${ref}.`);
  }
}

/** Decode XML char data fail-closed: every `&` must begin a valid reference (a bare/unknown `&` is invalid XML). */
function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  let out = "";
  let i = 0;
  while (i < s.length) {
    const amp = s.indexOf("&", i);
    if (amp === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, amp);
    const semi = s.indexOf(";", amp);
    if (semi === -1)
      fail("bad-entity", `Unterminated entity reference near "${s.slice(amp, amp + 12)}".`);
    out += decodeOneEntity(s.slice(amp + 1, semi), s.slice(amp, semi + 1));
    i = semi + 1;
  }
  return out;
}

const localName = (raw: string): string => {
  const c = raw.indexOf(":");
  return c === -1 ? raw : raw.slice(c + 1);
};

/** Index of the `>` that closes the tag opened at `lt`, respecting quoted attribute values (which may contain `>`). */
function findTagEnd(s: string, lt: number): number {
  let quote = "";
  for (let i = lt + 1; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i;
    }
  }
  return -1;
}

/** Parse XML into a lite element tree. Skips the prolog, comments, PIs, DOCTYPE; decodes char data. */
function parseXml(xml: string): XmlEl {
  // Strip a leading BOM + XML EOL-normalize (XML 1.0 §2.11): CRLF and bare CR → LF.
  let s = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  s = s.replace(/\r\n?/g, "\n");
  const root: XmlEl = { local: "#root", children: [] };
  const stack: XmlEl[] = [root];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt === -1) {
      // trailing text after the last tag must be whitespace only (no markup past the root element)
      if (/\S/.test(s.slice(i)))
        fail("malformed-xml", "Non-whitespace text outside the root element.");
      break;
    }
    if (lt > i) {
      const between = s.slice(i, lt);
      // text at document-root level (outside any element) must be whitespace only
      if (stack.length === 1) {
        if (/\S/.test(between)) fail("malformed-xml", "Non-whitespace text at document root.");
      } else {
        stack[stack.length - 1].children.push({ text: decodeEntities(between) });
      }
    }
    if (s.startsWith("<!--", lt)) {
      i = s.indexOf("-->", lt);
      if (i === -1) fail("malformed-xml", "Unterminated XML comment.");
      i += 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", lt)) {
      const end = s.indexOf("]]>", lt);
      if (end === -1) fail("malformed-xml", "Unterminated CDATA.");
      // CDATA content is literal by XML semantics — intentionally NOT entity-decoded (don't "fix" into double-decoding).
      stack[stack.length - 1].children.push({ text: s.slice(lt + 9, end) });
      i = end + 3;
      continue;
    }
    if (s.startsWith("<?", lt) || s.startsWith("<!", lt)) {
      i = s.indexOf(">", lt);
      if (i === -1) fail("malformed-xml", "Unterminated XML declaration/PI.");
      i += 1;
      continue;
    }
    const gt = findTagEnd(s, lt);
    if (gt === -1) fail("malformed-xml", "Unterminated XML tag.");
    let tag = s.slice(lt + 1, gt);
    const selfClose = tag.endsWith("/");
    if (selfClose) tag = tag.slice(0, -1);
    if (tag[0] === "/") {
      // end tag — must match the element on top of the stack
      const name = localName(tag.slice(1).trim());
      const top = stack[stack.length - 1];
      if (stack.length <= 1 || top.local !== name) {
        fail("malformed-xml", `Mismatched/unbalanced end tag </${name}> (open: ${top.local}).`);
      }
      stack.pop();
    } else {
      const sp = tag.search(/[\s/]/);
      const name = localName(sp === -1 ? tag : tag.slice(0, sp));
      const el: XmlEl = { local: name, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!selfClose) stack.push(el);
    }
    i = gt + 1;
  }
  if (stack.length !== 1) fail("malformed-xml", "Unclosed XML element(s) at end of document.");
  if (root.children.filter(isEl).length !== 1)
    fail("malformed-xml", "XML must have exactly one root element.");
  return root;
}

function firstByLocal(el: XmlEl, local: string): XmlEl | undefined {
  for (const c of el.children) if (isEl(c) && c.local === local) return c;
  return undefined;
}

function hasNonWhitespaceText(node: XmlNode): boolean {
  if (!isEl(node)) return /\S/.test(node.text);
  return node.children.some(hasNonWhitespaceText);
}

// ============================================================
// Body text walk (the pinned determinism rules)
// ============================================================

// Run-level children that are dropped (their text is not body content); flagged if they carry text.
const SKIP_SUBTREES = new Set([
  "drawing",
  "pict",
  "object",
  "instrText",
  "delText",
  "del",
  "moveFrom",
]);

function renderParagraph(p: XmlEl, warnings: CanonicalizeWarning[]): string {
  let out = "";
  const walk = (node: XmlNode): void => {
    if (!isEl(node)) return; // char data only meaningful inside <w:t> (handled below)
    switch (node.local) {
      case "t":
        for (const c of node.children) if (!isEl(c)) out += c.text;
        return;
      case "tab":
        out += "\t";
        return;
      case "br":
      case "cr":
        out += "\n";
        return;
      case "noBreakHyphen":
        out += "‑"; // visible non-breaking hyphen — preserve-visible-chars
        return;
      case "softHyphen":
        return; // zero-width; drop (mc:AlternateContent is rejected earlier by assertNoAlternateContent)
    }
    if (SKIP_SUBTREES.has(node.local)) {
      if (hasNonWhitespaceText(node)) {
        warnings.push({
          kind: "dropped-body-text",
          message: `Non-whitespace text in a dropped <${node.local}> was excluded.`,
        });
      }
      return;
    }
    // ins / moveTo / r / smartTag / hyperlink / sdtContent / etc. — descend.
    for (const c of node.children) walk(c);
  };
  for (const c of p.children) walk(c);
  return out;
}

// Block-transparent wrappers: structural containers we see *through* to find block content (paragraphs/tables),
// so a paragraph or table wrapped in a content-control / custom-XML region is not silently dropped.
const BLOCK_TRANSPARENT = new Set(["sdt", "sdtContent", "customXml", "customXmlInsRangeStart"]);

/** Ordered block-level children (<w:p>/<w:tbl>) of `el`, recursing through block-transparent wrappers. */
function collectBlocks(el: XmlEl): XmlEl[] {
  const out: XmlEl[] = [];
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (c.local === "p" || c.local === "tbl") out.push(c);
    else if (BLOCK_TRANSPARENT.has(c.local)) out.push(...collectBlocks(c));
    // sectPr and other structural elements contribute no block text.
  }
  return out;
}

/** Hard-error on mc:AlternateContent anywhere in the tree (Choice + Fallback both carry text → ambiguous). */
function assertNoAlternateContent(el: XmlEl): void {
  if (el.local === "AlternateContent")
    fail("alternate-content", "mc:AlternateContent is not supported (ambiguous Choice/Fallback).");
  for (const c of el.children) if (isEl(c)) assertNoAlternateContent(c);
}

function renderTable(tbl: XmlEl, warnings: CanonicalizeWarning[]): string {
  const rows: string[] = [];
  for (const row of tbl.children) {
    if (!isEl(row) || row.local !== "tr") continue;
    const cells: string[] = [];
    for (const cell of row.children) {
      if (!isEl(cell) || cell.local !== "tc") continue;
      const paras: string[] = [];
      for (const block of collectBlocks(cell)) {
        if (block.local === "tbl") fail("nested-table", "Nested tables are not supported (v1).");
        paras.push(renderParagraph(block, warnings));
      }
      cells.push(paras.join("\n"));
    }
    rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

/** Walk <w:body> blocks in document order, emitting a block per top-level paragraph / table. */
function renderBody(body: XmlEl, warnings: CanonicalizeWarning[]): string {
  const blocks: string[] = [];
  for (const block of collectBlocks(body)) {
    blocks.push(
      block.local === "p" ? renderParagraph(block, warnings) : renderTable(block, warnings),
    );
  }
  return blocks.join("\n");
}

// Excluded content-bearing parts scanned only to WARN when they carry text (a future criterion-in-footnote signal).
// Headers/footers are deliberately NOT scanned: they are page chrome (title / policy-no / "Page N") present on every
// document, so warning on them would cry-wolf. Known v1 limitation: a criterion authored into a header/footer is
// silently excluded — an unusual authoring choice, accepted to keep this signal actionable.
const EXCLUDED_PART_RE = /^word\/(footnotes|endnotes|comments)\.xml$/i;
// Attribute extraction tolerant of single/double quotes; type matched on the captured value, anchored to its end
// (so ".../commentsExtended" does not match "comments"). rels manifests are flat machine-generated XML — a regex is
// adequate here (a miss only downgrades a warning, never affects canonical text), unlike the nested document body.
const attr = (name: string, tag: string): string | undefined =>
  new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`, "i")
    .exec(tag)
    ?.slice(2)
    .find((g) => g !== undefined);
const REL_TYPE_RE = /\/(footnotes|endnotes|comments)$/i;

/** Resolve a document.xml.rels Target (relative to `word/`) to a part name; null for external/absolute targets. */
function resolveWordRelTarget(target: string): string | null {
  if (/^[a-z]+:/i.test(target)) return null; // external (http:, etc.)
  const base = ["word"];
  for (const seg of target.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") base.pop();
    else base.push(seg);
  }
  return base.join("/");
}

/** Content-bearing excluded parts: conventional fixed names + relationship-discovered targets (variable names). */
function findExcludedContentParts(entries: ZipEntry[], input: Buffer): Set<string> {
  const parts = new Set<string>();
  for (const e of entries) if (EXCLUDED_PART_RE.test(e.name)) parts.add(e.name);
  const rels = entries.find((e) => e.name === "word/_rels/document.xml.rels");
  if (rels) {
    const xml = readEntry(input, rels).toString("utf8");
    for (const m of xml.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*>/gi)) {
      const tag = m[0];
      const type = attr("Type", tag);
      if (
        !type ||
        !REL_TYPE_RE.test(type) ||
        (attr("TargetMode", tag) ?? "").toLowerCase() === "external"
      )
        continue;
      const target = attr("Target", tag);
      const resolved = target && resolveWordRelTarget(target);
      if (resolved) parts.add(resolved);
    }
  }
  return parts;
}

// ============================================================
// Public API
// ============================================================

export function canonicalizeDocx(input: Buffer): CanonicalizeResult {
  const warnings: CanonicalizeWarning[] = [];
  try {
    const entries = parseCentralDirectory(input);
    const docEntries = entries.filter((e) => e.name === "word/document.xml");
    if (docEntries.length === 0) fail("no-document", "word/document.xml not found in the .docx.");
    if (docEntries.length > 1)
      fail("duplicate-document", "Multiple word/document.xml entries (ambiguous).");

    // WARN (not drop) if a content-bearing excluded part carries non-whitespace text — surfaces a future criterion-in-footnote.
    const byName = new Map(entries.map((e) => [e.name, e]));
    for (const partName of findExcludedContentParts(entries, input)) {
      const e = byName.get(partName);
      if (e && hasNonWhitespaceText(parseXml(readEntry(input, e).toString("utf8")))) {
        warnings.push({
          kind: "excluded-part-text",
          message: `Excluded part ${partName} contains text not represented in the anchor source.`,
        });
      }
    }

    const docXml = readEntry(input, docEntries[0]).toString("utf8");
    const root = parseXml(docXml);
    const doc = firstByLocal(root, "document");
    const body = doc && firstByLocal(doc, "body");
    if (!body) fail("no-body", "No <w:body> in word/document.xml.");
    assertNoAlternateContent(body); // hard-error at any scope (block/table/paragraph)

    const raw = renderBody(body, warnings);
    const text = raw.normalize("NFC"); // NFC before hashing + offsets; visible characters preserved.
    const textHash =
      "sha256:" + createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
    return {
      ok: true,
      text,
      metaCore: {
        textHash,
        canonicalizer: CANONICALIZER_NAME,
        canonicalizerVersion: CANONICALIZER_VERSION,
        offsetUnit: "utf8-byte",
        unicodeNormalization: "NFC",
        rangeConvention: "half-open",
      },
      warnings,
    };
  } catch (e) {
    if (e instanceof CanonicalizeFailure)
      return { ok: false, error: { kind: e.kind, message: e.message }, warnings };
    return {
      ok: false,
      error: { kind: "unexpected", message: e instanceof Error ? e.message : String(e) },
      warnings,
    };
  }
}

/**
 * File-artifact wrapper over {@link canonicalizeDocx}: attaches provenance back-pointers (the sidecar metadata).
 * Pure (no I/O) — the CLI/caller owns reading the `.docx` and writing `<name>.txt` + `<name>.anchormeta.json`.
 * @param artifactPath the canonical-text artifact path this metadata will describe (stored in `meta.path`)
 * @param derivedFrom  a label for the source `.docx` (e.g. its path), stored in `meta.derivedFrom`
 */
export function buildAnchorArtifact(
  input: Buffer,
  artifactPath: string,
  derivedFrom: string,
): AnchorArtifactResult {
  const r = canonicalizeDocx(input);
  if (!r.ok) return r;
  const derivedFromHash = "sha256:" + createHash("sha256").update(input).digest("hex");
  return {
    ok: true,
    text: r.text,
    meta: { ...r.metaCore, path: artifactPath, derivedFrom, derivedFromHash, warnings: r.warnings },
  };
}

// ============================================================
// UTF-8 offset helpers (consumers MUST use these — JS strings are UTF-16, offsets are UTF-8 bytes)
// ============================================================

function isUtf8Boundary(buf: Buffer, byteOffset: number): boolean {
  if (!Number.isInteger(byteOffset)) return false;
  if (byteOffset === 0 || byteOffset === buf.length) return true;
  if (byteOffset < 0 || byteOffset > buf.length) return false;
  return (buf[byteOffset] & 0xc0) !== 0x80; // not a continuation byte
}

/** Exact substring for a half-open [startByte, endByte) UTF-8 range. Hard-errors on a non-boundary/out-of-range offset. */
export function sliceUtf8Bytes(text: string, startByte: number, endByte: number): string {
  const buf = Buffer.from(text, "utf8");
  if (startByte > endByte)
    throw new RangeError(`sliceUtf8Bytes: start ${startByte} > end ${endByte}`);
  if (!isUtf8Boundary(buf, startByte) || !isUtf8Boundary(buf, endByte)) {
    throw new RangeError(
      `sliceUtf8Bytes: offset not on a UTF-8 character boundary or out of range [${startByte},${endByte}) len=${buf.length}`,
    );
  }
  return buf.subarray(startByte, endByte).toString("utf8");
}

/** Map a utf8-byte offset → 0-based {line, col}; col is UTF-16 code units (matches VS Code Position.character). */
export function byteOffsetToDisplayRange(
  text: string,
  byteOffset: number,
): { line: number; col: number } {
  const buf = Buffer.from(text, "utf8");
  if (!isUtf8Boundary(buf, byteOffset)) {
    throw new RangeError(
      `byteOffsetToDisplayRange: offset ${byteOffset} not on a UTF-8 boundary or out of range (len=${buf.length})`,
    );
  }
  const prefix = buf.subarray(0, byteOffset).toString("utf8");
  let line = 0;
  let col = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix.charCodeAt(i) === 10) {
      line++;
      col = 0;
    } else {
      col++; // UTF-16 code units
    }
  }
  return { line, col };
}

export function byteRangeToDisplayRange(
  text: string,
  range: { start: number; end: number },
): { start: { line: number; col: number }; end: { line: number; col: number } } {
  if (range.start > range.end)
    throw new RangeError(`byteRangeToDisplayRange: start ${range.start} > end ${range.end}`);
  return {
    start: byteOffsetToDisplayRange(text, range.start),
    end: byteOffsetToDisplayRange(text, range.end),
  };
}
