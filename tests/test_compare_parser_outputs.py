import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import compare_parser_outputs as compare


class CompareParserOutputsTests(unittest.TestCase):
    def test_similarity_handles_empty_lists(self):
        self.assertEqual(compare.similarity([], []), 1.0)
        self.assertEqual(compare.similarity(["A"], []), 0.0)

    def test_similarity_compares_case_insensitive_sets(self):
        value = compare.similarity(["RAP Pago", "RAP a Pagar"], ["rap pago", "Outra"])

        self.assertEqual(value, 1 / 3)

    def test_experimental_risks_detects_title_prefix(self):
        risks = compare.experimental_risks(
            "restos-a-pagar-rap.html",
            ["Restos a Pagar - RAP - RAP Pago", "Restos a Pagar - RAP - RAP a Pagar"],
            [],
        )

        self.assertIn("title_prefix:Restos a Pagar - RAP", risks)

    def test_experimental_risks_detects_generic_header(self):
        risks = compare.experimental_risks("relatorio.html", ["Valor 1", "Valor 2"], ["header_not_detected"])

        self.assertIn("generic_columns", risks)
        self.assertIn("header_not_detected", risks)

    def test_main_writes_json_output_for_missing_report(self):
        with TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "comparison.json"
            code = compare.main_with_args(["relatorio-ausente.html", "--json-output", str(output)])

            self.assertEqual(code, 0)
            text = output.read_text(encoding="utf-8")

        self.assertIn('"read_only": true', text)
        self.assertIn('"missing": true', text)


if __name__ == "__main__":
    unittest.main()
