"""Preserve a canonical UTF-8 text extract and check it against source HTML."""

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical_text(path):
    raw = Path(path).read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError("text extract has a UTF-8 BOM")
    text = raw.decode("utf-8", errors="strict")
    if "\ufffd" in text or "\x00" in text:
        raise ValueError("text extract contains replacement or NUL characters")
    if unicodedata.normalize("NFC", text) != text:
        raise ValueError("text extract is not NFC")
    return raw, text


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def normalize(value):
    value = unicodedata.normalize("NFKC", html.unescape(value)).lower()
    value = value.replace("−", " negative ")
    for symbol, word in (("≤", " le "), ("≥", " ge "), ("<=", " le "),
                         (">=", " ge "), ("<", " lt "), (">", " gt "),
                         ("=", " eq "), ("%", " percent ")):
        value = value.replace(symbol, word)
    value = re.sub(r"(?<![a-z0-9])-\s*(?=\d)", " negative ", value)
    value = re.sub(r"(?<![a-z0-9])\+\s*(?=\d)", " positive ", value)
    value = re.sub(r"(?<=\d)\.(?=\d)", " decimal ", value)
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def create_anchor(source_html, source_text, anchor, report, exceptions=None):
    html_path, text_path = Path(source_html), Path(source_text)
    html_raw = html_path.read_bytes()
    parsed = VisibleText()
    parsed.feed(html_raw.decode("utf-8", errors="strict"))
    html_visible = normalize(" ".join(parsed.parts))
    text_raw, text = canonical_text(text_path)
    accepted = {}
    if exceptions:
        rows = json.loads(Path(exceptions).read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            raise ValueError("exceptions must be a JSON array")
        for row in rows:
            if not isinstance(row, dict) or set(row) != {"lineSha256", "reason"}:
                raise ValueError("exception needs lineSha256 and reason")
            if not re.fullmatch(r"[0-9a-f]{64}", row["lineSha256"]) or not str(row["reason"]).strip():
                raise ValueError("invalid exception hash or reason")
            if row["lineSha256"] in accepted:
                raise ValueError("duplicate exception")
            accepted[row["lineSha256"]] = row["reason"]
    matched = []
    missed = []
    unchecked_headings = []
    unchecked_short_lines = []
    used = set()
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            unchecked_headings.append({"line": number, "lineSha256": digest(stripped.encode("utf-8"))})
            continue
        normalized = normalize(stripped)
        if len(normalized) < 20:
            if normalized:
                unchecked_short_lines.append({"line": number,
                                              "lineSha256": digest(stripped.encode("utf-8"))})
            continue
        line_hash = digest(stripped.encode("utf-8"))
        if normalized in html_visible:
            matched.append(number)
        elif line_hash in accepted:
            missed.append({"line": number, "lineSha256": line_hash, "reason": accepted[line_hash]})
            used.add(line_hash)
        else:
            raise ValueError(f"unmatched substantive text at line {number}: {line_hash}")
    if set(accepted) != used:
        raise ValueError("unused correspondence exception")
    if not matched:
        raise ValueError("no substantive text matched source HTML")
    out = Path(anchor)
    if out.exists() and out.read_bytes() != text_raw:
        raise ValueError("existing anchor differs from source text")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(text_raw)
    result = {"sourceHtmlSha256": digest(html_raw), "sourceTextSha256": digest(text_raw),
              "anchorSha256": digest(out.read_bytes()), "matchedLines": matched,
              "acceptedNonSourceLines": missed, "uncheckedHeadingsRequireHumanReadback": unchecked_headings,
              "uncheckedShortLinesRequireHumanReadback": unchecked_short_lines,
              "sourceCompleteness": "not established by text-to-HTML line matching; complete HTML and extraction need human readback",
              "method": "UTF-8/NFC byte copy plus visible-HTML body-line correspondence"}
    report_path = Path(report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--anchor", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--exceptions")
    args = parser.parse_args()
    try:
        print(json.dumps(create_anchor(args.html, args.text, args.anchor, args.report, args.exceptions)))
    except (ValueError, OSError, UnicodeError, TypeError) as exc:
        parser.exit(2, f"anchor preparation failed: {exc}\n")


if __name__ == "__main__":
    main()
