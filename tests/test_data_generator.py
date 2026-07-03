import unittest

from data_generator import (
    metric_value_from_totals,
    parse_br_number,
    quality_result,
    rap_metric_from_totals,
)


class DataGeneratorParsingTests(unittest.TestCase):
    def test_parse_br_number_handles_brazilian_money_format(self):
        self.assertEqual(parse_br_number("R$ 1.234,56"), 1234.56)
        self.assertEqual(parse_br_number("(1.234,56)"), -1234.56)

    def test_parse_br_number_keeps_missing_values_as_none(self):
        self.assertIsNone(parse_br_number(""))
        self.assertIsNone(parse_br_number(None))
        self.assertIsNone(parse_br_number("sem valor"))

    def test_quality_result_separates_warnings_from_errors(self):
        result = quality_result(["date_from_filename", "no_table"])

        self.assertFalse(result["ok"])
        self.assertEqual(result["warnings"], ["date_from_filename"])
        self.assertEqual(result["issues"], ["no_table"])

    def test_metric_value_from_totals_does_not_turn_missing_value_into_zero(self):
        columns = ["Descricao", "Saldo R$"]
        totals = [{"label": "Total", "values": {}, "raw": {"Descricao": "Total"}}]

        value = metric_value_from_totals(totals, columns, {"columns": ["Saldo R$"]})

        self.assertIsNone(value)

    def test_metric_value_from_totals_accepts_explicit_zero(self):
        columns = ["Descricao", "Saldo R$"]
        totals = [{"label": "Total", "values": {"Saldo R$": 0.0}, "raw": {"Descricao": "Total"}}]

        value = metric_value_from_totals(totals, columns, {"columns": ["Saldo R$"]})

        self.assertEqual(value, 0.0)


class RapMetricTests(unittest.TestCase):
    def test_rap_metric_uses_total_row_and_records_source(self):
        doc = {
            "columns": ["Descricao", "RAP Pago"],
            "totals": [
                {
                    "label": "Total Geral",
                    "values": {"RAP Pago": 1500.0},
                    "raw": {"Descricao": "Total Geral", "RAP Pago": "1.500,00"},
                }
            ],
        }

        value, meta = rap_metric_from_totals(doc, "rap_pago", {"columns": ["RAP Pago"]})

        self.assertEqual(value, 1500.0)
        self.assertEqual(meta["status"], "ok")
        self.assertEqual(meta["line"], "Total Geral")
        self.assertEqual(meta["column"], "RAP Pago")
        self.assertFalse(meta["fallback"])

    def test_rap_metric_rejects_suspiciously_low_values(self):
        doc = {
            "columns": ["Descricao", "RAP Pago"],
            "totals": [
                {
                    "label": "Total Geral",
                    "values": {"RAP Pago": 15.0},
                    "raw": {"Descricao": "Total Geral", "RAP Pago": "15,00"},
                }
            ],
        }

        value, meta = rap_metric_from_totals(doc, "rap_pago", {"columns": ["RAP Pago"]})

        self.assertIsNone(value)
        self.assertEqual(meta["status"], "invalid")
        self.assertIn("magnitude suspeita", meta["reason"])

    def test_rap_metric_requires_total_row(self):
        doc = {
            "columns": ["Descricao", "RAP Pago"],
            "totals": [
                {
                    "label": "Parcial",
                    "values": {"RAP Pago": 1500.0},
                    "raw": {"Descricao": "Parcial", "RAP Pago": "1.500,00"},
                }
            ],
        }

        value, meta = rap_metric_from_totals(doc, "rap_pago", {"columns": ["RAP Pago"]})

        self.assertIsNone(value)
        self.assertEqual(meta["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
