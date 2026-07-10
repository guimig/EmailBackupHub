import unittest

import experimental_table_parser as parser


class ExperimentalTableParserTests(unittest.TestCase):
    def test_expands_colspan_and_rowspan(self):
        html = """
        <table>
          <tr><th colspan="2">Grupo</th><th rowspan="2">Valor</th></tr>
          <tr><th>Conta</th><th>Descricao</th></tr>
          <tr><td>1</td><td>A</td><td>10,00</td></tr>
        </table>
        """

        parsed = parser.parse_html_table(html)

        self.assertEqual(parsed.columns, ["Grupo - Conta", "Grupo - Descricao", "Valor"])
        self.assertEqual(parsed.rows[0]["Grupo - Conta"], "1")
        self.assertEqual(parsed.rows[0]["Valor"], "10,00")
        self.assertFalse(parsed.warnings)

    def test_dedupes_repeated_columns(self):
        columns = parser.dedupe_columns(["Valor", "Valor", ""])

        self.assertEqual(columns, ["Valor", "Valor 2", "Valor 3"])

    def test_falls_back_to_generic_columns_when_header_is_missing(self):
        html = """
        <table>
          <tr><td>1</td><td>2</td></tr>
          <tr><td>3</td><td>4</td></tr>
        </table>
        """

        parsed = parser.parse_html_table(html)

        self.assertEqual(parsed.columns, ["Valor 1", "Valor 2"])
        self.assertIn("header_not_detected", parsed.warnings)
        self.assertIn("generic_columns", parsed.warnings)

    def test_detects_rap_like_header_before_data_rows(self):
        html = """
        <table>
          <tr><td colspan="4">Restos a Pagar - RAP</td></tr>
          <tr>
            <th>Natureza de Despesa</th>
            <th>RAP Inscrito</th>
            <th>RAP Pago</th>
            <th>RAP a Pagar</th>
          </tr>
          <tr><td>33903001</td><td>1.000,00</td><td>500,00</td><td>500,00</td></tr>
        </table>
        """

        parsed = parser.parse_html_table(html)

        self.assertEqual(parsed.columns, ["Natureza de Despesa", "RAP Inscrito", "RAP Pago", "RAP a Pagar"])
        self.assertEqual(parsed.rows[0]["RAP Pago"], "500,00")

    def test_parse_largest_html_table_ignores_small_metadata_table(self):
        html = """
        <table><tr><td>Metadado</td></tr></table>
        <table>
          <tr><th>Natureza</th><th>Valor</th></tr>
          <tr><td>Consumo</td><td>10,00</td></tr>
          <tr><td>Servico</td><td>20,00</td></tr>
        </table>
        """

        parsed = parser.parse_largest_html_table(html)

        self.assertEqual(parsed.columns, ["Natureza", "Valor"])
        self.assertEqual(len(parsed.rows), 2)


if __name__ == "__main__":
    unittest.main()
