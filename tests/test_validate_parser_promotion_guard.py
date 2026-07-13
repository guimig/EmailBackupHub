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


if __name__ == "__main__":
    unittest.main()
