import unittest

from rap_metrics import extract_rap_metrics_from_totals


class RapMetricsTests(unittest.TestCase):
    def test_extracts_named_total_geral_metrics(self):
        doc = {
            "totals": [
                {"label": "Total Geral", "values": {"RAP Pago": 1000.0, "RAP a Pagar": 2000.0}, "raw": {}}
            ]
        }

        metrics, meta, issues = extract_rap_metrics_from_totals(doc)

        self.assertEqual(metrics["rap_pago"], 1000.0)
        self.assertEqual(metrics["rap_a_pagar"], 2000.0)
        self.assertFalse(meta["rap_pago"]["fallback"])
        self.assertEqual(issues, [])

    def test_missing_rap_values_are_not_zeroed(self):
        metrics, meta, issues = extract_rap_metrics_from_totals({"totals": []})

        self.assertEqual(metrics, {})
        self.assertEqual(meta["rap_pago"]["status"], "unavailable")
        self.assertIn("rap_metric_unavailable", issues)

    def test_suspicious_low_rap_is_not_used(self):
        doc = {"totals": [{"label": "Total Geral", "values": {"RAP Pago": 15.0}, "raw": {}}]}

        metrics, meta, issues = extract_rap_metrics_from_totals(doc)

        self.assertNotIn("rap_pago", metrics)
        self.assertEqual(meta["rap_pago"]["status"], "unavailable")
        self.assertIn("rap_metric_unavailable", issues)


if __name__ == "__main__":
    unittest.main()
