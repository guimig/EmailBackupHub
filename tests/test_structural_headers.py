"""Regressions for Tesouro Gerencial HTML exports with merged headers and sparse numbers."""
import unittest
from pathlib import Path

from bs4 import BeautifulSoup

from data_generator import normalize_table, parse_br_number, pick_table

ROOT = Path(__file__).resolve().parent.parent


def parsed(filename):
    soup = BeautifulSoup((ROOT / filename).read_text(encoding="utf-8"), "html.parser")
    grid, depth = pick_table(soup, include_header_depth=True)
    columns, rows, totals, types, issues = normalize_table(grid, depth)
    return depth, columns, rows, totals, types, issues


class StructuralHeaderTests(unittest.TestCase):
    def test_provisionamentos_details_reconcile_with_published_totals(self):
        depth, columns, rows, totals, _, issues = parsed("provisionamentos.html")
        self.assertEqual(depth, 1)
        self.assertEqual(columns, [
            "Ação Governo", "Grupo Despesa", "Grupo Despesa (2)",
            "PI", "PI (2)", "NC", "Doc - Observação", "Transação - Mês",
            "Saldo - Moeda Origem (Item Informação)"
        ])
        action_column, amount_column = columns[0], columns[-1]
        details = {}
        for row in rows:
            amount = parse_br_number(row[amount_column])
            if amount is not None:
                details[row[action_column]] = details.get(row[action_column], 0) + amount
        self.assertTrue(details)
        for subtotal in totals:
            label, values = subtotal["label"], subtotal["values"]
            if label.lower() == "total" or label in details or "PNAE" in label:
                actual = sum(details.values()) if label.lower() == "total" else details.get(label, 0)
                self.assertAlmostEqual(actual, values[amount_column], places=2, msg=label)
        self.assertTrue(any(item["label"].lower() == "total" for item in totals))
        self.assertNotIn("columns_generated", issues)

    def test_multiline_headers_keep_hierarchy_without_stealing_rows(self):
        fixtures = [
            ("credito-disponivel-mes-lancamento.html", 2, "Grupo Despesa", 11),
            ("limite-de-saque-conta-contabil.html", 3, "UG Executora Nome", 9),
            ("saldos-de-contas-de-contratos.html", 2, "Mês Lançamento / Entidade CCor", 29)
        ]
        for filename, expected_depth, first_column, minimum_rows in fixtures:
            with self.subTest(filename=filename):
                depth, columns, rows, totals, _, issues = parsed(filename)
                self.assertEqual(depth, expected_depth)
                self.assertEqual(columns[0], first_column)
                self.assertGreaterEqual(len(rows), minimum_rows)
                self.assertTrue(all(set(row) == set(columns) for row in rows))
                self.assertNotIn("columns_generated", issues)

    def test_audited_metrics_survive_header_reconstruction(self):
        import json
        from data_generator import apply_column_names_to_data, extract_metrics_with_meta

        slugs = (
            "provisionamentos",
            "restos-a-pagar-rap",
            "despesas-empenhadas-liquidadas-e-pagas-mes-lancamento",
            "credito-disponivel-mes-lancamento",
            "recolhimento-proprio-gru",
            "saldos-de-empenhos-do-exercicio-conta-contabil"
        )
        for slug in slugs:
            source = ROOT / (slug + ".html")
            reference = ROOT / "data" / "reports" / (slug + ".json")
            if not source.exists() or not reference.exists():
                continue  # optional checkout; CI includes the operational fixtures
            with self.subTest(slug=slug):
                _, columns, rows, totals, types, _ = parsed(source.name)
                columns, rows, totals, types = apply_column_names_to_data(
                    slug, columns, rows, totals, types
                )
                current = json.loads(reference.read_text(encoding="utf-8"))
                parsed_metrics, _, _ = extract_metrics_with_meta({
                    "slug": slug, "columns": columns, "rows": rows, "totals": totals
                })
                for metric, expected in current.get("metrics", {}).items():
                    self.assertIn(metric, parsed_metrics)
                    self.assertAlmostEqual(parsed_metrics[metric], expected, places=2)

    def test_header_depth_is_detected_in_critical_tesouro_reports(self):
        from diagnose_headers import CRITICAL_REPORTS
        for filename in CRITICAL_REPORTS:
            if not (ROOT / filename).exists():
                continue
            with self.subTest(filename=filename):
                depth, columns, rows, _, _, issues = parsed(filename)
                self.assertGreater(depth, 0)
                self.assertTrue(columns)
                self.assertTrue(rows)
                self.assertNotIn("columns_generated", issues)

    def test_sparse_first_detail_is_not_appended_to_headers(self):
        html = """<table><tr>
        <td style="background-color:#abc">Ação Governo</td>
        <td style="background-color:#abc" colspan="2">Grupo Despesa</td>
        <td style="background-color:#abc">Saldo R$</td></tr>
        <tr><td rowspan="2">APOIO PNAE</td><td rowspan="2">3</td>
          <td rowspan="2">OUTRAS DESPESAS CORRENTES</td><td>20,00</td></tr>
        <tr><td>30,00</td></tr><tr><td>Total</td><td colspan="2"></td>
        <td>50,00</td></tr></table>"""
        grid, depth = pick_table(BeautifulSoup(html, "html.parser"), include_header_depth=True)
        columns, rows, totals, _, issues = normalize_table(grid, depth)
        self.assertEqual(depth, 1)
        self.assertEqual(columns, ["Ação Governo", "Grupo Despesa", "Grupo Despesa (2)", "Saldo R$"])
        self.assertEqual(len(rows), 2)
        self.assertEqual([row["Saldo R$"] for row in rows], ["20,00", "30,00"])
        self.assertEqual(totals[0]["values"]["Saldo R$"], 50)
        self.assertNotIn("columns_generated", issues)


if __name__ == "__main__":
    unittest.main()
