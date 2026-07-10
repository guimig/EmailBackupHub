import tempfile
import unittest
from pathlib import Path

from bs4 import BeautifulSoup

import diagnose_headers


class DiagnoseHeadersTests(unittest.TestCase):
    def test_span_detection_and_expanded_width(self):
        soup = BeautifulSoup(
            """
            <table>
              <tr><th colspan="2">Grupo</th><th rowspan="2">Valor</th></tr>
              <tr><th>Conta</th><th>Descricao</th></tr>
            </table>
            """,
            "html.parser",
        )
        rows = soup.find_all("tr")

        self.assertTrue(diagnose_headers.has_spans(rows[0]))
        self.assertEqual(diagnose_headers.expanded_width(rows[0]), 3)
        self.assertEqual(diagnose_headers.expanded_width(rows[1]), 2)

    def test_header_score_prefers_textual_financial_headers(self):
        header = ["Natureza de Despesa", "RAP Pago", "RAP a Pagar"]
        numeric_row = ["33903001", "15,00", "20,00"]

        self.assertGreater(diagnose_headers.header_score(header), diagnose_headers.header_score(numeric_row))

    def test_summarize_report_finds_candidate_header(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "relatorio.html"
            path.write_text(
                """
                <html><body>
                  <table>
                    <tr><td colspan="3">Relatorio</td></tr>
                    <tr><th>Natureza de Despesa</th><th>RAP Pago</th><th>RAP a Pagar</th></tr>
                    <tr><td>33903001</td><td>1.500,00</td><td>2.000,00</td></tr>
                  </table>
                </body></html>
                """,
                encoding="utf-8",
            )

            summary = diagnose_headers.summarize_report(path, max_rows=5)

        self.assertEqual(summary["tables"], 1)
        candidates = summary["largest_tables"][0]["candidate_headers"]
        self.assertTrue(any("RAP Pago" in candidate["sample"] for candidate in candidates))


if __name__ == "__main__":
    unittest.main()
