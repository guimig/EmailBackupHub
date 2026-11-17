import copy
import unittest

from column_schema import build_column_schema, period_metadata
from dashboard_summary import compact_report, build_dashboard_summary


class ColumnSchemaTests(unittest.TestCase):
    def test_special_accounting_periods_preserved(self):
        columns = [
            'JAN/2025 / Saldo - R$ (Conta Contabil)',
            '013/2025 / Saldo - R$ (Conta Contabil)',
            '014/2025 / Saldo - R$ (Conta Contabil)',
        ]
        rows = [{columns[0]: '1.000,00', columns[1]: '0', columns[2]: '-20,50'}]
        original = copy.deepcopy(rows)
        schema = build_column_schema(columns, rows)
        self.assertEqual(rows, original)
        self.assertEqual([entry['type'] for entry in schema], ['money'] * 3)
        self.assertTrue(schema[0]['period']['calendar_month'])
        self.assertFalse(schema[1]['period']['calendar_month'])
        self.assertFalse(schema[2]['period']['calendar_month'])
        self.assertEqual(schema[1]['period']['number'], 13)
        self.assertEqual(schema[2]['period']['number'], 14)
        self.assertEqual(schema[2]['period']['label'], '014/2025')
        self.assertEqual(schema[1]['aggregation'], 'none')

    def test_identifiers_remain_textual_even_if_numeric(self):
        columns = ['Natureza Despesa Detalhada', 'NE CCor', 'PTRES', 'RIP', 'CPF', 'Conta Contabil', 'Saldo - R$']
        rows = [dict(zip(columns, [
            '33901414', '158459264222026NE000019', '231502',
            '0' + str(i).zfill(5), '01122233344', '621100000', '0',
        ])) for i in range(20)]
        schema = build_column_schema(columns, rows)
        self.assertEqual([entry['type'] for entry in schema[:-1]], ['identifier'] * 6)
        self.assertEqual(schema[-1]['type'], 'money')

    def test_date_category_period_and_empty(self):
        columns = ['Emissao - Dia', 'Emissao - Mes', 'Recolhedor Doc.', 'Descricao', 'Nro de dias', 'Vazia']
        rows = [{
            'Emissao - Dia': '03/02/2026', 'Emissao - Mes': 'FEV/2026',
            'Recolhedor Doc.': 'PF' if i % 2 else 'PJ',
            'Descricao': 'Documento ' + str(i), 'Nro de dias': str(i + 1),
        } for i in range(40)]
        schema = build_column_schema(columns, rows)
        self.assertEqual([entry['type'] for entry in schema], [
            'date', 'period', 'category', 'text', 'number', 'text',
        ])
        self.assertIsNone(schema[-1]['valid_ratio'])

    def test_unknown_report_samples_without_config(self):
        columns = ['Coluna personalizada', 'Custo unitario', 'Situacao']
        rows = [{
            'Coluna personalizada': str(i), 'Custo unitario': 'R$ 12,45',
            'Situacao': 'sim' if i % 2 else 'nao',
        } for i in range(500)]
        schema = build_column_schema(columns, rows)
        self.assertEqual(len(schema), 3)
        self.assertEqual(schema[1]['sampled_rows'], 256)
        self.assertEqual(schema[1]['aggregation'], 'none')
        self.assertEqual(schema[2]['type'], 'boolean')

    def test_override_validated_and_no_automatic_sum(self):
        columns = ['Valor', 'Codigo']
        rows = [{'Valor': '10,00', 'Codigo': '0010'}]
        schema = build_column_schema(columns, rows, {
            'Valor': {'type': 'money', 'aggregation': 'sum'},
        })
        self.assertEqual(schema[0]['aggregation'], 'sum')
        self.assertEqual(schema[0]['inferred_from'], 'explicit_override')
        with self.assertRaises(ValueError):
            build_column_schema(columns, rows, {'Valor': {'type': 'forbidden'}})
        with self.assertRaises(ValueError):
            build_column_schema(columns, rows, {'Codigo': {'type': 'text', 'aggregation': 'sum'}})

    def test_invalid_periods_not_accepted(self):
        self.assertIsNone(period_metadata('015/2025'))
        self.assertIsNone(period_metadata('31/12/2025'))
        self.assertIsNone(period_metadata('2025-12-31'))


class CompactSummaryTests(unittest.TestCase):
    def test_no_rows_keep_totals_and_metric_provenance(self):
        report = {
            'slug': 'novo', 'date_iso': '2026-11-17',
            'metadata': {'hash_conteudo': 'abc', 'private': 'discard'},
            'columns': ['Saldo'], 'rows': [{'Saldo': '1.234,56'}] * 3000,
            'totals': [{'label': 'Total', 'raw': {'Saldo': '1.234,56'}}],
            'row_types': [
                {'type': 'data', 'raw': {'Saldo': '10'}},
                {'type': 'total', 'raw': {'Saldo': '1.234,56'}},
            ],
            'metrics': {'saldo': 1234.56},
            'metrics_meta': {'saldo': {'status': 'ok', 'source': 'totals'}},
        }
        series = {'series': [{
            'date_iso': '2026-11-17', 'hash_conteudo': 'abc',
            'metrics': {'saldo': 1234.56},
            'metrics_meta': {'saldo': {'status': 'ok'}},
            'totals': [{'label': 'Total'}],
        }]}
        unchanged = copy.deepcopy(report)
        compact = compact_report(report, series)
        self.assertEqual(report, unchanged)
        self.assertNotIn('rows', compact)
        self.assertNotIn('private', compact['metadata'])
        self.assertEqual(len(compact['row_types']), 1)
        self.assertEqual(compact['metrics_meta'], report['metrics_meta'])
        self.assertNotIn('totals', compact['series_data']['series'][0])

    def test_missing_rap_metrics_never_become_zero(self):
        report = {
            'slug': 'restos-a-pagar-rap', 'metadata': {'hash_conteudo': 'a'},
            'metrics': {}, 'metrics_meta': {'rap_pago': {'status': 'invalid'}},
        }
        result = build_dashboard_summary('2026-11-17', {'restos-a-pagar-rap': report}, {}, '1.6')
        compact = result['reports']['restos-a-pagar-rap']
        self.assertEqual(compact['metrics'], {})
        self.assertEqual(compact['metrics_meta']['rap_pago']['status'], 'invalid')
        self.assertEqual(compact['series_data']['series'], [])


if __name__ == '__main__':
    unittest.main()
