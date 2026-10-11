"""Focused neutral controls for HTML/text anchor correspondence."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[3]
SCRIPT = PROJECT / "docs/codification-codespace-pilot/pipeline-candidate/.claude/ke-pipeline/anchor-text.py"
spec = importlib.util.spec_from_file_location("anchor_text", SCRIPT)
anchor_text = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anchor_text)


class AnchorTextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=PROJECT / "tmp")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def run_anchor(self, html, text):
        (self.root / "source.html").write_text(html, encoding="utf-8")
        (self.root / "source.txt").write_text(text, encoding="utf-8")
        return anchor_text.create_anchor(
            self.root / "source.html", self.root / "source.txt",
            self.root / "anchor.txt", self.root / "report.json")

    def test_changed_comparator_and_decimal_are_rejected(self):
        html = "<p>Clinical score must be ≤ 2.5 for coverage.</p>"
        for changed in (
            "Clinical score must be ≥ 2.5 for coverage.",
            "Clinical score must be ≤ 25 for coverage.",
        ):
            with self.subTest(changed=changed), self.assertRaisesRegex(ValueError, "unmatched substantive"):
                self.run_anchor(html, changed)

    def test_short_requirement_is_reported_for_human_readback(self):
        result = self.run_anchor(
            "<p>Long policy requirement for a valid assessment.</p><p>Not covered.</p>",
            "Long policy requirement for a valid assessment.\nNot covered.\n")
        self.assertEqual(len(result["uncheckedShortLinesRequireHumanReadback"]), 1)
        self.assertIn("not established", result["sourceCompleteness"])

    def test_omitted_html_paragraph_is_not_misrepresented_as_complete(self):
        result = self.run_anchor(
            "<p>Long policy requirement for a valid assessment.</p>"
            "<p>Second paragraph with another independent criterion.</p>",
            "Long policy requirement for a valid assessment.\n")
        self.assertIn("not established", result["sourceCompleteness"])

    def test_changed_long_requirement_fails(self):
        with self.assertRaisesRegex(ValueError, "unmatched substantive"):
            self.run_anchor(
                "<p>The member has two qualifying treatment failures.</p>",
                "The member has three qualifying treatment failures.")

    def test_unicode_minus_cannot_become_positive(self):
        with self.assertRaisesRegex(ValueError, "unmatched substantive"):
            self.run_anchor(
                "<p>Clinical score must be −2.5 for coverage.</p>",
                "Clinical score must be 2.5 for coverage.")


if __name__ == "__main__":
    unittest.main()
