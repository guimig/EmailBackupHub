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
    def test_pnae_merged_headers_do_not_absorb_first_four_transactions(self):
        depth, columns, rows, totals, row_types, issues = parsed("provisionamentos.html")
        self.assertEqual(depth, 1)
        self.assertEqual(columns, [
            "Ação Governo", "Grupo Despesa", "Grupo Despesa (2)",
            "PI", "PI (2)", "NC", "Doc - Observação", "Transação - Mês",
            "Saldo - Moeda Origem (Item Informação)"
        ])
        self.assertEqual(len(rows), 56)
        expected = ["89.872,00", "136.856,00", "3.432,00", "6.954,00"]
        self.assertEqual([row[columns[-1]] for row in rows[:4]], expected)
        self.assertTrue(all("PNAE" in row[columns[0]] for row in rows[:4]))
        self.assertEqual(totals[0]["label"], "APOIO AO PROGRAMA NACIONAL DE ALIMENTACAO ESCOLAR (PNAE)")
        self.assertEqual(totals[0]["values"][columns[-1]], 237114)
        total = next(item["values"][columns[-1]] for item in totals if item["label"].lower() == "total")
        self.assertEqual(round(sum(parse_br_number(row[columns[-1]]) or 0 for row in rows), 2),
                         round(total, 2))
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
