import tempfile
import unittest
from pathlib import Path

import generate_parser_pilot as pilot


class GenerateParserPilotTests(unittest.TestCase):
    def test_build_pilot_payload_is_read_only_and_not_promoted(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report = Path(temp_dir) / "saldos-de-contas-de-contratos.html"
            report.write_text(
                """
                <html><body>
                  <table>
                    <tr><td colspan="3">Saldos de Contas de Contratos</td></tr>
                    <tr><th>UG</th><th>Contrato</th><th>Saldo R$</th></tr>
                    <tr><td>158000</td><td>12/2026</td><td>1.000,00</td></tr>
                  </table>
                </body></html>
                """,
                encoding="utf-8",
            )

            payload = pilot.build_pilot_payload(report)

        self.assertTrue(payload["read_only"])
        self.assertEqual(payload["promotion_status"], "not_promoted")
        self.assertEqual(payload["experimental"]["columns"], ["UG", "Contrato", "Saldo R$"])
        self.assertIn("comparison", payload)
        self.assertIn("readiness", payload)
        self.assertTrue(payload["readiness"]["ready_for_manual_review"])
        self.assertTrue(payload["readiness"]["requires_manual_review"])
        self.assertFalse(payload["readiness"]["ready_for_production"])
        self.assertEqual(payload["readiness"]["row_count_delta"], 0)

    def test_main_writes_requested_output(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            report = base / "relatorio.html"
            output = base / "artifact.json"
            summary = base / "artifact.md"
            report.write_text(
                """
                <table>
                  <tr><th>Conta</th><th>Saldo R$</th></tr>
                  <tr><td>1</td><td>10,00</td></tr>
                </table>
                """,
                encoding="utf-8",
            )

            code = pilot.main_with_args(
                ["--report", str(report), "--output", str(output), "--summary-output", str(summary)]
            )

            self.assertEqual(code, 0)
            self.assertTrue(output.exists())
            self.assertTrue(summary.exists())
            self.assertIn("Piloto experimental do parser", summary.read_text(encoding="utf-8"))

    def test_markdown_summary_states_it_is_not_production_ready(self):
        payload = {
            "report": "relatorio.html",
            "read_only": True,
            "promotion_status": "not_promoted",
            "production": {"columns": ["Coluna 1"], "rows_count": 2},
            "experimental": {"columns": ["Saldo R$"], "rows_count": 1, "warnings": []},
            "readiness": {
                "ready_for_manual_review": True,
                "ready_for_production": False,
                "row_count_delta": 1,
                "manual_review_reasons": ["row_count_delta:1"],
            },
            "comparison": {"experimental_risks": []},
        }

        summary = pilot.build_markdown_summary(payload)

        self.assertIn("pronto para producao: `False`", summary)
        self.assertIn("row_count_delta:1", summary)


if __name__ == "__main__":
    unittest.main()
