"""Neutral binding-admission tests for the pilot pipeline."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[3]
SCRIPT = PROJECT / "docs/codification-codespace-pilot/pipeline-candidate/.claude/ke-pipeline/prepare.py"
spec = importlib.util.spec_from_file_location("prepare", SCRIPT)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=PROJECT / "tmp")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "binding.json"
        self.customer = {
            "customer": "synthetic-test",
            "status": "approved",
            "canonicalBase": "https://example.invalid/fhir/",
            "outcomes": {"Result A": "certify.A", "Result B": "not-certify.B"},
            "dispositionMode": "embedded",
            "determinationResourceType": "Task",
            "answerDomain": {
                "defaultBinaryChoices": ["Yes", "No"],
                "uncertainty": {"mode": "none", "choices": []},
            },
            "authority": [],
        }

    def admit(self):
        self.path.write_text(json.dumps(self.customer), encoding="utf-8")
        return prepare.approved_customer(self.path)

    def test_valid_explicit_binding(self):
        self.assertEqual(self.admit()["determinationResourceType"], "Task")

    def test_missing_or_bad_determination_type(self):
        for value in (None, "ServiceRequest"):
            with self.subTest(value=value):
                self.customer["determinationResourceType"] = value
                with self.assertRaisesRegex(ValueError, "determinationResourceType"):
                    self.admit()

    def test_missing_or_malformed_answer_domain(self):
        for value in (None, {}, {"defaultBinaryChoices": ["Yes", "No"]},
                      {"defaultBinaryChoices": ["Yes", "No"],
                       "uncertainty": {"mode": "none", "choices": ["Maybe"]}}):
            with self.subTest(value=value):
                self.customer["answerDomain"] = value
                with self.assertRaisesRegex(ValueError, "answerDomain|uncertainty"):
                    self.admit()

    def test_duplicate_activity_mapping_is_rejected(self):
        self.customer["outcomes"] = {"First": "certify.A", "Second": "certify.A"}
        with self.assertRaisesRegex(ValueError, "one activity"):
            self.admit()

    def test_unapproved_binding_is_rejected(self):
        self.customer["status"] = "needs-owner-binding"
        with self.assertRaisesRegex(ValueError, "not approved"):
            self.admit()


if __name__ == "__main__":
    unittest.main()
