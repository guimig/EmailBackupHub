import tempfile
import unittest
from pathlib import Path

import validate_parser_promotion_guard as guard


class ValidateParserPromotionGuardTests(unittest.TestCase):
    def test_validate_file_accepts_regular_production_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "data_generator.py"
            path.write_text("def generate_data_files():\n    return None\n", encoding="utf-8")

            self.assertEqual(guard.validate_file(path), [])

    def test_validate_file_rejects_experimental_parser_reference(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "data_generator.py"
            path.write_text("import experimental_table_parser\n", encoding="utf-8")

            errors = guard.validate_file(path)

        self.assertTrue(any("experimental_table_parser" in error for error in errors))

    def test_markdown_report_lists_checked_files_and_markers(self):
        report = guard.build_markdown_report(["data_generator.py referencia parser experimental"])

        self.assertIn("Guarda de promocao do parser", report)
        self.assertIn("data_generator.py", report)
        self.assertIn("experimental_table_parser", report)
        self.assertIn("Feature flags experimentais desligadas", report)
        self.assertIn("saldos-de-contas-de-contratos", report)
        self.assertIn("referencia parser experimental", report)

    def test_write_report_creates_markdown_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "guard.md"
            guard.write_report(output, [])

            text = output.read_text(encoding="utf-8")

        self.assertIn("resultado: `ok`", text)

    def test_validate_repository_rejects_enabled_feature_flags(self):
        original = dict(guard.parser_feature_flags.EXPERIMENTAL_PARSER_BY_SLUG)
        try:
            guard.parser_feature_flags.EXPERIMENTAL_PARSER_BY_SLUG["saldos-de-contas-de-contratos"] = True

            errors = guard.validate_repository()
        finally:
            guard.parser_feature_flags.EXPERIMENTAL_PARSER_BY_SLUG.clear()
            guard.parser_feature_flags.EXPERIMENTAL_PARSER_BY_SLUG.update(original)

        self.assertTrue(any("feature flag experimental ligada" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
