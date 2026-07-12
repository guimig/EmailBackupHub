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

    def test_main_writes_requested_output(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            report = base / "relatorio.html"
            output = base / "artifact.json"
            report.write_text(
                """
                <table>
                  <tr><th>Conta</th><th>Saldo R$</th></tr>
                  <tr><td>1</td><td>10,00</td></tr>
                </table>
                """,
                encoding="utf-8",
            )

            code = pilot.main_with_args(["--report", str(report), "--output", str(output)])

            self.assertEqual(code, 0)
            self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
