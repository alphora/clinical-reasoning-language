import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import {
  canonicalizeDocx,
  sliceUtf8Bytes,
  byteOffsetToDisplayRange,
  byteRangeToDisplayRange,
  CANONICALIZER_VERSION,
} from "../canonicalize";

// ---- minimal ZIP writer (builds a real .docx my reader parses; deflate exercises the real path) ----
let TBL: Uint32Array | undefined;
function crc32(buf: Buffer): number {
  if (!TBL) {
    TBL = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = TBL[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipOpts {
  deflate?: boolean;
  corruptCrc?: boolean;
  method?: number; // override method byte (to test unsupported-compression)
  duplicateName?: string; // append a second entry with this name
  dataDescriptor?: boolean; // emulate Word: GP-bit-3 set, local header sizes zeroed, descriptor after data
}
function makeZip(parts: Record<string, string>, opts: ZipOpts = {}): Buffer {
  const deflate = opts.deflate ?? true;
  const dd = opts.dataDescriptor ?? false;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const add = (name: string, content: string): void => {
    const data = Buffer.from(content, "utf8");
    const comp = deflate ? deflateRawSync(data) : data;
    const method = opts.method ?? (deflate ? 8 : 0);
    const crc = opts.corruptCrc ? (crc32(data) ^ 0xffff) >>> 0 : crc32(data);
    const flags = dd ? 0x0008 : 0;
    const nameB = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    // With a data descriptor, the LOCAL header carries zero crc/sizes; the real values live in the central directory.
    lh.writeUInt32LE(dd ? 0 : crc, 14);
    lh.writeUInt32LE(dd ? 0 : comp.length, 18);
    lh.writeUInt32LE(dd ? 0 : data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    const trailer = dd
      ? (() => {
          const d = Buffer.alloc(16);
          d.writeUInt32LE(0x08074b50, 0);
          d.writeUInt32LE(crc, 4);
          d.writeUInt32LE(comp.length, 8);
          d.writeUInt32LE(data.length, 12);
          return d;
        })()
      : Buffer.alloc(0);
    const local = Buffer.concat([lh, nameB, comp, trailer]);
    locals.push(local);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, nameB]));
    offset += local.length;
  };
  for (const [name, content] of Object.entries(parts)) add(name, content);
  if (opts.duplicateName) add(opts.duplicateName, parts[opts.duplicateName] ?? "<x/>");
  const cd = Buffer.concat(centrals);
  const cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const n = centrals.length;
  eocd.writeUInt16LE(n, 8);
  eocd.writeUInt16LE(n, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const doc = (body: string): string => `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`;
const para = (runs: string): string => `<w:p>${runs}</w:p>`;
const t = (s: string): string => `<w:r><w:t>${s}</w:t></w:r>`;
const docx = (body: string, extra: Record<string, string> = {}, opts: ZipOpts = {}): Buffer =>
  makeZip({ "word/document.xml": doc(body), ...extra }, opts);

function expectOk(buf: Buffer) {
  const r = canonicalizeDocx(buf);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.kind}: ${r.error.message}`);
  return r;
}

describe("canonicalizeDocx — text walk determinism", () => {
  it("joins paragraphs with single \\n; multi-run / multi-<w:t> same visible text is identical (no separator)", () => {
    const split = expectOk(docx(para(`<w:r><w:t>Hel</w:t><w:t>lo</w:t></w:r>${t(" world")}`) + para(t("Line 2")))).text;
    const single = expectOk(docx(para(t("Hello world")) + para(t("Line 2")))).text;
    expect(split).toBe("Hello world\nLine 2");
    expect(single).toBe(split);
  });

  it("<w:tab>→\\t, <w:br>/<w:cr>→\\n", () => {
    expect(expectOk(docx(para(`${t("a")}<w:r><w:tab/></w:r>${t("b")}<w:r><w:br/></w:r>${t("c")}`))).text).toBe("a\tb\nc");
  });

  it("<w:t> char data is verbatim (xml:space ignored; whitespace never collapsed)", () => {
    expect(expectOk(docx(para(`<w:r><w:t xml:space="preserve">  lead  and   gaps  </w:t></w:r>`))).text).toBe("  lead  and   gaps  ");
  });

  it("decodes named + numeric (non-control) entities", () => {
    expect(expectOk(docx(para(t("a &amp; b &lt;c&gt; &#65; &#x42;")))).text).toBe("a & b <c> A B");
  });

  it("empty paragraph → empty line; para→table→para single \\n", () => {
    expect(expectOk(docx(para(t("A")) + "<w:p/>" + para(t("B")))).text).toBe("A\n\nB");
    const table = `<w:tbl><w:tr><w:tc>${para(t("c1"))}</w:tc><w:tc>${para(t("c2"))}</w:tc></w:tr></w:tbl>`;
    expect(expectOk(docx(para(t("before")) + table + para(t("after")))).text).toBe("before\nc1\tc2\nafter");
  });

  it("table: cell \\t / row \\n; multi-paragraph cell → \\n-joined", () => {
    const tbl = `<w:tbl><w:tr><w:tc>${para(t("r1c1"))}</w:tc><w:tc>${para(t("p1")) + para(t("p2"))}</w:tc></w:tr><w:tr><w:tc>${para(t("r2c1"))}</w:tc><w:tc>${para(t("r2c2"))}</w:tc></w:tr></w:tbl>`;
    expect(expectOk(docx(tbl)).text).toBe("r1c1\tp1\np2\nr2c1\tr2c2");
  });

  it("tracked changes: keep <w:ins>/<w:moveTo>, drop <w:del>/<w:delText>/<w:moveFrom>", () => {
    const body = para(`${t("keep ")}<w:ins>${t("added ")}</w:ins><w:del><w:r><w:delText>removed </w:delText></w:r></w:del><w:moveTo>${t("moved")}</w:moveTo>`);
    expect(expectOk(docx(body)).text).toBe("keep added moved");
  });

  it("noBreakHyphen → ‑ (visible); softHyphen dropped", () => {
    expect(expectOk(docx(para(`${t("co")}<w:r><w:softHyphen/></w:r>${t("op")}<w:r><w:noBreakHyphen/></w:r>${t("x")}`))).text).toBe("coop‑x");
  });

  it("NFC-normalizes (decomposed → composed)", () => {
    // 'e' + combining acute (U+0065 U+0301) → é (U+00E9)
    const r = expectOk(docx(para(t("café"))));
    expect(r.text).toBe("café");
  });

  it("CRLF / bare CR in char data normalize to \\n", () => {
    expect(expectOk(makeZip({ "word/document.xml": doc(para(t("a"))).replace(/\n/g, "") + "\r\n" })).text).toBe("a");
  });

  it("strips a leading BOM on document.xml", () => {
    expect(expectOk(makeZip({ "word/document.xml": "﻿" + doc(para(t("hi"))) })).text).toBe("hi");
  });

  it("is byte-identical across two runs + matches a committed text + textHash (golden, deflate path)", () => {
    const body = para(t("Adults (18+) with moderate-to-severe Crohn's disease")) + para(t("may be considered medically necessary."));
    const buf = docx(body, { "[Content_Types].xml": "<Types/>", "_rels/.rels": "<Relationships/>" }, { deflate: true });
    const a = expectOk(buf);
    const b = expectOk(buf);
    const EXPECTED = "Adults (18+) with moderate-to-severe Crohn's disease\nmay be considered medically necessary.";
    expect(a.text).toBe(EXPECTED);
    expect(b.text).toBe(a.text);
    // Frozen literal (NOT recomputed) — this is the tripwire that forces a CANONICALIZER_VERSION bump on any rule change.
    expect(a.metaCore.textHash).toBe("sha256:788f826311e8df21c451093c4fd7f14f95d9288adb64006eda83de489fcae07d");
    expect(a.metaCore.textHash).toBe("sha256:" + createHash("sha256").update(Buffer.from(EXPECTED, "utf8")).digest("hex"));
    expect(a.metaCore.canonicalizerVersion).toBe(CANONICALIZER_VERSION);
    expect(a.metaCore.offsetUnit).toBe("utf8-byte");
  });

  it("stored (uncompressed) entries also parse", () => {
    expect(expectOk(docx(para(t("stored")), {}, { deflate: false })).text).toBe("stored");
  });

  it("Word-style data-descriptor entries (GP-bit-3, zeroed local sizes) parse via central-dir sizes", () => {
    // Word commonly streams entries with a trailing data descriptor; the reader must use the central-dir sizes/CRC.
    const buf = docx(para(t("streamed via data descriptor")), {}, { deflate: true, dataDescriptor: true });
    expect(expectOk(buf).text).toBe("streamed via data descriptor");
  });
});

describe("canonicalizeDocx — warnings + fail-closed errors", () => {
  it("WARNS (does not drop) when an excluded part carries text", () => {
    const r = expectOk(docx(para(t("body")), { "word/footnotes.xml": `<w:footnotes ${NS}>${para(t("a footnote criterion"))}</w:footnotes>` }));
    expect(r.text).toBe("body");
    expect(r.warnings.some((w) => w.kind === "excluded-part-text")).toBe(true);
  });

  it("rels-discovers a non-conventionally-named footnotes part (single-quoted attrs) → warns", () => {
    const rels =
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id='rId9' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes' Target='notes/fn-custom.xml'/>` +
      `</Relationships>`;
    const r = expectOk(
      docx(para(t("body")), {
        "word/_rels/document.xml.rels": rels,
        "word/notes/fn-custom.xml": `<w:footnotes ${NS}>${para(t("hidden criterion"))}</w:footnotes>`,
      }),
    );
    expect(r.text).toBe("body");
    expect(r.warnings.some((w) => w.kind === "excluded-part-text")).toBe(true);
  });

  it("rels TargetMode=External and non-footnote types do not warn", () => {
    const rels =
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://x" TargetMode="External"/>` +
      `<Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`;
    const r = expectOk(docx(para(t("body")), { "word/_rels/document.xml.rels": rels, "word/styles.xml": "<w:styles/>" }));
    expect(r.warnings.length).toBe(0);
  });

  it("malformed XML — trailing markup/text after the root element → malformed-xml", () => {
    expect(failKind(makeZip({ "word/document.xml": doc(para(t("a"))) + "GARBAGE" }))).toBe("malformed-xml");
  });
  it("malformed XML — two root elements → malformed-xml", () => {
    expect(failKind(makeZip({ "word/document.xml": doc(para(t("a"))) + "<extra/>" }))).toBe("malformed-xml");
  });

  const failKind = (buf: Buffer) => {
    const r = canonicalizeDocx(buf);
    return r.ok ? "OK" : r.error.kind;
  };

  it("control-char numeric ref → control-char-ref", () => {
    expect(failKind(docx(para(t("a&#9;b"))))).toBe("control-char-ref");
  });
  it("nested table → nested-table", () => {
    const inner = `<w:tbl><w:tr><w:tc>${para(t("x"))}</w:tc></w:tr></w:tbl>`;
    expect(failKind(docx(`<w:tbl><w:tr><w:tc>${inner}</w:tc></w:tr></w:tbl>`))).toBe("nested-table");
  });
  it("mc:AlternateContent → alternate-content (paragraph scope)", () => {
    expect(failKind(docx(para(`<mc:AlternateContent><mc:Choice>${t("a")}</mc:Choice><mc:Fallback>${t("a")}</mc:Fallback></mc:AlternateContent>`)))).toBe("alternate-content");
  });
  it("mc:AlternateContent → alternate-content (block scope, not just paragraph)", () => {
    expect(failKind(docx(`<mc:AlternateContent><mc:Choice>${para(t("a"))}</mc:Choice></mc:AlternateContent>`))).toBe("alternate-content");
  });
  it("nested table wrapped in <w:sdt> is still detected (not silently dropped)", () => {
    const inner = `<w:sdt><w:sdtContent><w:tbl><w:tr><w:tc>${para(t("x"))}</w:tc></w:tr></w:tbl></w:sdtContent></w:sdt>`;
    expect(failKind(docx(`<w:tbl><w:tr><w:tc>${inner}</w:tc></w:tr></w:tbl>`))).toBe("nested-table");
  });
  it("malformed XML — missing close tag at EOF → malformed-xml (no partial text)", () => {
    expect(failKind(makeZip({ "word/document.xml": `<w:document ${NS}><w:body><w:p><w:r><w:t>A</w:t></w:r>` }))).toBe("malformed-xml");
  });
  it("malformed XML — mismatched end tag → malformed-xml", () => {
    expect(failKind(makeZip({ "word/document.xml": `<w:document ${NS}><w:body><w:p>${t("a")}</w:body></w:document>` }))).toBe("malformed-xml");
  });
  it("'>' inside an attribute value does not corrupt tokenization", () => {
    expect(expectOk(docx(para(`<w:r><w:t someAttr="a>b">hello</w:t></w:r>`))).text).toBe("hello");
  });
  it("bare/unknown entity → bad-entity; out-of-range numeric ref → bad-entity", () => {
    expect(failKind(docx(para(t("a & b"))))).toBe("bad-entity"); // bare & is invalid XML
    expect(failKind(docx(para(t("x&unknownent;y"))))).toBe("bad-entity");
    expect(failKind(docx(para(t("z&#x110000;w"))))).toBe("bad-entity"); // beyond U+10FFFF
  });
  it("block content wrapped in <w:sdt> is rendered, not dropped", () => {
    expect(expectOk(docx(`<w:sdt><w:sdtContent>${para(t("wrapped"))}</w:sdtContent></w:sdt>`)).text).toBe("wrapped");
  });
  it("WARNS dropped-body-text when a skipped subtree (e.g. <w:instrText>) carries text", () => {
    const r = expectOk(docx(para(`${t("a")}<w:r><w:instrText>HYPERLINK http://x</w:instrText></w:r>${t("b")}`)));
    expect(r.text).toBe("ab");
    expect(r.warnings.some((w) => w.kind === "dropped-body-text")).toBe(true);
  });
  it("not a zip → not-a-zip", () => {
    expect(failKind(Buffer.from("this is not a zip at all"))).toBe("not-a-zip");
  });
  it("missing document.xml → no-document", () => {
    expect(failKind(makeZip({ "word/other.xml": "<x/>" }))).toBe("no-document");
  });
  it("duplicate document.xml → duplicate-document", () => {
    expect(failKind(makeZip({ "word/document.xml": doc(para(t("a"))) }, { duplicateName: "word/document.xml" }))).toBe("duplicate-document");
  });
  it("CRC mismatch → crc-mismatch", () => {
    expect(failKind(makeZip({ "word/document.xml": doc(para(t("a"))) }, { corruptCrc: true }))).toBe("crc-mismatch");
  });
  it("unsupported compression method → unsupported-compression", () => {
    expect(failKind(makeZip({ "word/document.xml": doc(para(t("a"))) }, { deflate: false, method: 99 }))).toBe("unsupported-compression");
  });
});

describe("UTF-8 offset helpers", () => {
  const s = "café\nαβ"; // 'é' = 2 bytes, α/β = 2 bytes each; \n at byte 5
  it("sliceUtf8Bytes returns the exact half-open span", () => {
    expect(sliceUtf8Bytes(s, 0, 3)).toBe("caf");
    expect(sliceUtf8Bytes(s, 3, 5)).toBe("é"); // bytes 3-4
    expect(sliceUtf8Bytes(s, 6, 10)).toBe("αβ");
  });
  it("hard-errors on a mid-multibyte offset", () => {
    expect(() => sliceUtf8Bytes(s, 3, 4)).toThrow(RangeError); // end splits 'é'
    expect(() => sliceUtf8Bytes(s, 0, 999)).toThrow(RangeError);
    expect(() => sliceUtf8Bytes(s, 5, 2)).toThrow(RangeError); // start > end
  });
  it("byteOffsetToDisplayRange gives 0-based line + UTF-16-code-unit col", () => {
    expect(byteOffsetToDisplayRange(s, 0)).toEqual({ line: 0, col: 0 });
    expect(byteOffsetToDisplayRange(s, 5)).toEqual({ line: 0, col: 4 }); // after "café" (4 UTF-16 units)
    expect(byteOffsetToDisplayRange(s, 6)).toEqual({ line: 1, col: 0 }); // after the \n
    expect(byteOffsetToDisplayRange(s, 8)).toEqual({ line: 1, col: 1 }); // after α
  });
  it("byteOffsetToDisplayRange hard-errors on a mid-char offset", () => {
    expect(() => byteOffsetToDisplayRange(s, 4)).toThrow(RangeError);
  });
  it("hard-errors on non-integer offsets", () => {
    expect(() => sliceUtf8Bytes(s, 0, 1.5)).toThrow(RangeError);
    expect(() => byteOffsetToDisplayRange(s, 1.5)).toThrow(RangeError);
  });
  it("byteRangeToDisplayRange composes start+end and rejects inverted ranges", () => {
    expect(byteRangeToDisplayRange(s, { start: 0, end: 6 })).toEqual({ start: { line: 0, col: 0 }, end: { line: 1, col: 0 } });
    expect(() => byteRangeToDisplayRange(s, { start: 6, end: 2 })).toThrow(RangeError);
  });
});

describe("test harness CRC32 is the standard IEEE polynomial (transitively validates the reader's check)", () => {
  it("crc32('123456789') === 0xCBF43926", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});
