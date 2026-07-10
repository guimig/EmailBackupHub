import tempfile
import unittest
from pathlib import Path

import validate_data


class ValidateDataHelpersTests(unittest.TestCase):
    def test_parse_iso_date_accepts_valid_date_only(self):
        self.assertTrue(validate_data.parse_iso_date("2026-07-09"))
        self.assertFalse(validate_data.parse_iso_date("09/07/2026"))
        self.assertFalse(validate_data.parse_iso_date(""))
        self.assertFalse(validate_data.parse_iso_date(None))

    def test_report_entries_accepts_supported_shapes(self):
        items = [{"slug": "relatorio"}]

        self.assertEqual(validate_data.report_entries(items), items)
        self.assertEqual(validate_data.report_entries({"reports": items}), items)
        self.assertEqual(validate_data.report_entries({"items": items}), items)
        self.assertEqual(validate_data.report_entries({"data": items}), items)
        self.assertEqual(validate_data.report_entries({"unknown": items}), [])

    def test_path_from_data_strips_query_and_fragment(self):
        path = validate_data.path_from_data("data/reports/exemplo.json?x=1#linha")

        self.assertEqual(path, validate_data.ROOT / "data/reports/exemplo.json")

    def test_numeric_rejects_boolean_and_missing_values(self):
        self.assertEqual(validate_data.numeric(10), 10.0)
        self.assertEqual(validate_data.numeric(10.5), 10.5)
        self.assertIsNone(validate_data.numeric(True))
        self.assertIsNone(validate_data.numeric(""))
        self.assertIsNone(validate_data.numeric(None))

    def test_validate_series_warns_about_suspicious_rap_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "restos-a-pagar-rap.json"
            path.write_text(
                """
                {
                  "slug": "restos-a-pagar-rap",
                  "series": [
                    {
                      "date_iso": "2026-07-01",
                      "metrics": {"rap_pago": 15.0, "rap_a_pagar": null}
                    }
                  ]
                }
                """,
                encoding="utf-8",
            )

            validation = validate_data.Validation()
            validate_data.validate_series_json(path, validation)

        self.assertFalse(validation.errors)
        self.assertTrue(any("RAP suspeito" in warning for warning in validation.warnings))


if __name__ == "__main__":
    unittest.main()
