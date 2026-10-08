from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

import data_generator as generator
from report_definitions import report_metric_rules

ROOT = Path(__file__).resolve().parents[1]


def document(slug):
    html = (ROOT / (slug + ".html")).read_text(encoding="utf-8", errors="replace")
    columns, rows, totals, row_types, issues = generator.normalize_table(
        generator.pick_table(BeautifulSoup(html, "html.parser"))
    )
    columns, rows, totals, row_types = generator.apply_column_names_to_data(
        slug, columns, rows, totals, row_types
    )
    return generator.annotate_metrics({
        "slug": slug, "columns": columns, "rows": rows,
        "totals": totals, "row_types": row_types,
        "quality": generator.quality_result(issues),
    })


class FinancialRegressions(unittest.TestCase):
    def test_identifiers_dates_and_descriptions_are_not_money(self):
        for value in ("158459264222026NE000019", "23349.002207/2025-40",
                      "JAN/2026", "DESPESAS 2026", "R$ sem valor"):
            with self.subTest(value=value):
                self.assertIsNone(generator.parse_br_number(value))
        self.assertEqual(generator.parse_br_number("(R$ 1.234,56)"), -1234.56)
        self.assertEqual(generator.parse_br_number("1.234"), 1234)
        self.assertEqual(generator.parse_br_number(1234.56), 1234.56)
        self.assertIsNone(generator.parse_br_number(float("nan")))

    def test_grand_total_is_used_even_when_subtotal_comes_last(self):
        totals = [
            {"label": "Total Geral", "values": {"Saldo": 300}},
            {"label": "Subtotal", "values": {"Saldo": 100}},
        ]
        self.assertEqual(generator.metric_value_from_totals(
            totals, ["Descricao", "Saldo"], {"columns": ["Saldo"]}), 300)
        self.assertIsNone(generator.metric_value_from_totals(
            totals[1:], ["Descricao", "Saldo"], {"columns": ["Saldo"]}))

    def test_description_mentioning_total_remains_a_detail(self):
        self.assertEqual(generator.classify_row(
            ["CONTRATO COM VALOR TOTAL DE R$ 1.000,00", "1.000,00"]), "data")

    def test_cache_from_old_parser_is_reparsed_even_when_html_is_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "report.html"
            source.write_text("<table></table>", encoding="utf-8")
            snapshot = root / "snapshot.json"
            generator.write_json(snapshot, {"slug": "old"})
            stats = {"cache_lookups": 0, "processed_files": 0,
                     "cache_hits": 0, "cache_misses_changed": 0}
            with patch.object(generator, "REPO_ROOT", root):
                digest = generator.content_hash_for_file(source)
                cache = {"report.html": {"content_hash": digest,
                                         "snapshot_path": "snapshot.json"}}
                with patch.object(generator, "full_report_document", return_value={"slug": "new"}) as parse:
                    doc, _ = generator.cached_document(source, {}, None, cache, stats)
            parse.assert_called_once()
            self.assertEqual(doc["slug"], "new")
            self.assertEqual(stats["cache_hits"], 0)

    def test_real_expense_html_uses_financial_columns_and_matches_detail_sum(self):
        slug = "despesas-empenhadas-liquidadas-e-pagas-mes-lancamento"
        doc = document(slug)
        self.assertEqual(len(doc["columns"]), 9)
        self.assertIn("Natureza Despesa", doc["columns"][0])
        self.assertIn("NE CCor", doc["columns"][3])
        self.assertFalse(any(generator.source_header_row(list(row.values())) for row in doc["rows"]))
        rules = report_metric_rules(slug)
        for metric in ("empenhado", "liquidado", "pago"):
            self.assertGreater(doc["metrics"][metric], 0)
            self.assertAlmostEqual(doc["metrics"][metric],
                generator.metric_value_from_rows(doc["rows"], doc["columns"], rules[metric]), places=2)
        self.assertGreaterEqual(doc["metrics"]["empenhado"], doc["metrics"]["liquidado"])
        self.assertGreaterEqual(doc["metrics"]["liquidado"], doc["metrics"]["pago"])
        print("Despesas HTML:", doc["metrics"])

    def test_real_account_balances_reconcile_with_expenses(self):
        expenses = document("despesas-empenhadas-liquidadas-e-pagas-mes-lancamento")
        balances = document("saldos-de-empenhos-do-exercicio-conta-contabil")
        self.assertNotIn("empenhado", balances["metrics"])
        self.assertAlmostEqual(balances["metrics"]["pago"], expenses["metrics"]["pago"], places=2)
        self.assertAlmostEqual(balances["metrics"]["liquidado_a_pagar"],
            expenses["metrics"]["liquidado"] - expenses["metrics"]["pago"], places=2)
        self.assertAlmostEqual(balances["metrics"]["saldo_a_liquidar"],
            expenses["metrics"]["empenhado"] - expenses["metrics"]["liquidado"], places=2)
        print("Saldos HTML:", balances["metrics"])

    def test_real_rap_uses_descriptive_headers(self):
        doc = document("restos-a-pagar-rap")
        for metric in ("rap_pago", "rap_a_pagar"):
            self.assertGreater(doc["metrics"][metric], 0)
            self.assertFalse(doc["metrics_meta"][metric]["fallback"])
            self.assertEqual(doc["metrics_meta"][metric]["line"], "Total")
        print("RAP HTML:", doc["metrics"])

    def test_monthly_balances_do_not_invent_a_total_from_one_month(self):
        doc = document("saldo-de-empenhos-a-liquidar-mes-a-mes")
        self.assertFalse(any("Total a Liquidar" == column for column in doc["columns"]))
        self.assertNotIn("saldo_a_liquidar", doc["metrics"])
        self.assertTrue(any(re.search(r"JUL/20\d{2}", column) for column in doc["columns"]))

    def test_contract_headers_keep_periods_out_of_detail_rows(self):
        doc = document("saldos-de-contas-de-contratos")
        self.assertTrue(any(__import__("re").search(r"[A-Z]{3}/20\d{2}", column) for column in doc["columns"]))
        self.assertFalse(any(generator.source_header_row(list(row.values())) for row in doc["rows"]))


if __name__ == "__main__":
    unittest.main()
