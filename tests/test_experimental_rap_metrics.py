import unittest

import experimental_rap_metrics as rap


class ExperimentalRapMetricsTests(unittest.TestCase):
    def test_extracts_auditable_rap_metrics_from_total_geral(self):
        doc = {
            "totals": [
                {
                    "label": "Total Geral",
                    "values": {"RAP Pago": 1200.0, "RAP a Pagar": 800.0},
                    "raw": {},
                }
            ]
        }

        result = rap.extract_experimental_rap_metrics(doc)

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["metrics"]["rap_pago"], 1200.0)
        self.assertEqual(result["metrics"]["rap_a_pagar"], 800.0)
        self.assertEqual(result["metrics"]["rap_total"], 2000.0)
        self.assertFalse(result["metric_sources"]["rap_pago"]["fallback"])

    def test_does_not_use_suspicious_low_value(self):
        doc = {
            "totals": [
                {"label": "Total Geral", "values": {"RAP Pago": 15.0, "RAP a Pagar": 800.0}, "raw": {}}
            ]
        }

        result = rap.extract_experimental_rap_metrics(doc)

        self.assertEqual(result["status"], "partial")
        self.assertNotIn("rap_pago", result["metrics"])
        self.assertEqual(result["metrics"]["rap_a_pagar"], 800.0)
        self.assertIn("rap_pago_unavailable", result["issues"])

    def test_marks_positional_column_as_fallback_source(self):
        doc = {
            "totals": [
                {"label": "Total Geral", "values": {"Valor 11": 1200.0, "Valor 12": 800.0}, "raw": {}}
            ]
        }

        result = rap.extract_experimental_rap_metrics(doc)

        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["metric_sources"]["rap_pago"]["fallback"])
        self.assertTrue(result["metric_sources"]["rap_total"]["fallback"])

    def test_missing_values_are_not_zeroed(self):
        result = rap.extract_experimental_rap_metrics({"totals": []})

        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["metrics"], {})
        self.assertIn("rap_pago_unavailable", result["issues"])
        self.assertIn("rap_a_pagar_unavailable", result["issues"])


if __name__ == "__main__":
    unittest.main()
