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

    def test_artifact_paths_for_report_use_report_stem(self):
        json_path, summary_path = pilot.artifact_paths_for_report(
            Path("restos-a-pagar-rap.html"),
            Path("artifacts"),
        )

        self.assertEqual(json_path, Path("artifacts") / "parser-pilot-restos-a-pagar-rap.json")
        self.assertEqual(summary_path, Path("artifacts") / "parser-pilot-restos-a-pagar-rap.md")

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
        self.assertIn("Checklist de revisao manual", summary)
        self.assertIn("Conferir se as colunas experimentais", summary)

    def test_index_payload_keeps_pilots_read_only_and_not_promoted(self):
        payload = {
            "report": "relatorio.html",
            "promotion_status": "not_promoted",
            "production": {"columns": ["Coluna 1"], "rows_count": 2},
            "experimental": {"columns": ["Saldo R$"], "rows_count": 1, "warnings": []},
            "readiness": {
                "ready_for_manual_review": True,
                "ready_for_production": False,
                "requires_manual_review": True,
                "manual_review_reasons": ["row_count_delta:1"],
                "row_count_delta": 1,
            },
        }

        index = pilot.build_index_payload([payload])

        self.assertTrue(index["read_only"])
        self.assertEqual(index["promotion_status"], "not_promoted")
        self.assertEqual(index["pilots_count"], 1)
        self.assertFalse(index["pilots"][0]["ready_for_production"])
        self.assertEqual(index["summary"]["manual_review_required_count"], 1)
        self.assertEqual(index["summary"]["row_delta_count"], 1)
        self.assertFalse(index["summary"]["safe_to_promote_any"])
        self.assertEqual(index["recommended_next_step"]["action"], "manual_review")
        self.assertFalse(index["recommended_next_step"]["allow_production_change"])
        self.assertIn("row_delta_present", index["recommended_next_step"]["reasons"])

    def test_index_markdown_contains_comparison_table(self):
        index = {
            "pilots_count": 1,
            "summary": {
                "manual_review_required_count": 1,
                "row_delta_count": 1,
                "production_ready_count": 0,
                "safe_to_promote_any": False,
            },
            "recommended_next_step": {
                "action": "manual_review",
                "allow_production_change": False,
                "reasons": ["row_delta_present"],
            },
            "pilots": [
                {
                    "report": "relatorio.html",
                    "production_columns_count": 2,
                    "experimental_columns_count": 2,
                    "production_rows_count": 10,
                    "experimental_rows_count": 9,
                    "row_count_delta": 1,
                    "requires_manual_review": True,
                    "ready_for_production": False,
                }
            ]
        }

        markdown = pilot.build_index_markdown(index)

        self.assertIn("| Relatorio |", markdown)
        self.assertIn("relatorio.html", markdown)
        self.assertIn("ready_for_production", markdown)
        self.assertIn("promocao automatica permitida: `False`", markdown)
        self.assertIn("Proxima decisao recomendada", markdown)
        self.assertIn("permite mudanca em producao: `False`", markdown)
        self.assertIn("Registro de decisao manual", markdown)
        self.assertIn("[ ] nao promover", markdown)


if __name__ == "__main__":
    unittest.main()
