import unittest

import rap_metrics as rap


class DiagnoseRapTotalsTests(unittest.TestCase):
    def test_rejects_suspicious_low_candidate_as_best(self):
        doc = {
            "totals": [
                {"label": "Total Geral", "values": {"Valor 11": 15.0}, "raw": {}},
                {"label": "Total Geral", "values": {"RAP Pago": 1500.0}, "raw": {}},
            ]
        }

        candidates = rap.rap_total_candidates(doc)
        best = rap.best_candidates(candidates)

        self.assertEqual(best["rap_pago"]["value"], 1500.0)
        self.assertEqual(best["rap_pago"]["quality"], "candidato")

    def test_prefers_total_geral_over_partial_total(self):
        doc = {
            "totals": [
                {"label": "Total Unidade", "values": {"RAP a Pagar": 1000.0}, "raw": {}},
                {"label": "Total Geral", "values": {"RAP a Pagar": 2000.0}, "raw": {}},
            ]
        }

        best = rap.best_candidates(rap.rap_total_candidates(doc))

        self.assertEqual(best["rap_a_pagar"]["value"], 2000.0)
        self.assertEqual(best["rap_a_pagar"]["label"], "Total Geral")

    def test_marks_positional_column_as_lower_score_than_named_column(self):
        self.assertLess(rap.column_score("Valor 11"), rap.column_score("RAP Pago"))


if __name__ == "__main__":
    unittest.main()
