import tempfile
import unittest
from pathlib import Path

import validate_experimental_report_comparison as comparison


class ValidateExperimentalReportComparisonTests(unittest.TestCase):
    def sample_report(self, base: Path) -> Path:
        report = base / "saldos-de-contas-de-contratos.html"
        report.write_text(
            """
            <table>
              <tr><th>UG</th><th>Contrato</th><th>Saldo R$</th></tr>
              <tr><td>158000</td><td>12/2026</td><td>1.000,00</td></tr>
            </table>
            """,
            encoding="utf-8",
        )
        return report

    def sample_payload(self):
        return {
            "read_only": True,
            "promotion_status": "not_promoted",
            "report": "saldos-de-contas-de-contratos.html",
            "source": {
                "consumed_by_dashboard": False,
                "consumed_by_report_viewer": False,
                "writes_data_reports": False,
            },
            "columns": ["UG", "Contrato", "Saldo R$"],
            "rows": [{"UG": "158000", "Contrato": "12/2026", "Saldo R$": "1.000,00"}],
            "quality": {"ready_for_production": False},
        }

    def test_compare_payload_accepts_parallel_artifact(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report = self.sample_report(Path(temp_dir))

            errors, warnings, summary = comparison.compare_payload(report, self.sample_payload())

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(summary["row_count_delta"], 0)

    def test_compare_payload_rejects_production_ready_payload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report = self.sample_report(Path(temp_dir))
            payload = self.sample_payload()
            payload["quality"]["ready_for_production"] = True

            errors, _warnings, _summary = comparison.compare_payload(report, payload)

        self.assertTrue(any("ready_for_production" in error for error in errors))

    def test_markdown_report_lists_errors_and_warnings(self):
        markdown = comparison.build_markdown_report(
            {"report": "x.html", "row_count_delta": 1},
            ["erro"],
            ["aviso"],
        )

        self.assertIn("Comparacao do JSON experimental", markdown)
        self.assertIn("erro", markdown)
        self.assertIn("aviso", markdown)


if __name__ == "__main__":
    unittest.main()
