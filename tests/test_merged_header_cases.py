import unittest

import experimental_table_parser as parser


class MergedHeaderReportCasesTests(unittest.TestCase):
    def assert_no_title_prefix(self, columns, forbidden_title):
        self.assertTrue(columns)
        for column in columns:
            self.assertFalse(
                column.startswith(forbidden_title),
                f"titulo de tabela virou prefixo de coluna: {column}",
            )

    def test_restos_a_pagar_rap_title_row_is_not_column_prefix(self):
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
        self.assert_no_title_prefix(parsed.columns, "Restos a Pagar - RAP")

    def test_saldos_de_contas_de_contratos_title_row_is_not_column_prefix(self):
        html = """
        <table>
          <tr><td colspan="5">Saldos de Contas de Contratos</td></tr>
          <tr>
            <th>UG</th>
            <th>Conta Contábil</th>
            <th>Contrato</th>
            <th>Fornecedor</th>
            <th>Saldo R$</th>
          </tr>
          <tr><td>158000</td><td>812310000</td><td>12/2026</td><td>Fornecedor</td><td>10.000,00</td></tr>
        </table>
        """

        parsed = parser.parse_html_table(html)

        self.assertEqual(parsed.columns, ["UG", "Conta Contábil", "Contrato", "Fornecedor", "Saldo R$"])
        self.assert_no_title_prefix(parsed.columns, "Saldos de Contas de Contratos")

    def test_evolucao_das_despesas_empenhadas_keeps_grouped_headers(self):
        html = """
        <table>
          <tr><td colspan="4">Evolução das Despesas Empenhadas</td></tr>
          <tr>
            <th rowspan="2">Ano</th>
            <th colspan="3">Despesas Empenhadas</th>
          </tr>
          <tr>
            <th>Janeiro</th>
            <th>Fevereiro</th>
            <th>Março</th>
          </tr>
          <tr><td>2026</td><td>1.000,00</td><td>2.000,00</td><td>3.000,00</td></tr>
        </table>
        """

        parsed = parser.parse_html_table(html)

        self.assertEqual(
            parsed.columns,
            [
                "Ano",
                "Despesas Empenhadas - Janeiro",
                "Despesas Empenhadas - Fevereiro",
                "Despesas Empenhadas - Março",
            ],
        )
        self.assert_no_title_prefix(parsed.columns, "Evolução das Despesas Empenhadas")


if __name__ == "__main__":
    unittest.main()
