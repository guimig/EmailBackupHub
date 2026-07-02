"""Central report definitions used by static data generation.

This file intentionally contains only plain Python data so the current GitHub
Actions workflow and GitHub Pages output keep working without new dependencies.
JavaScript pages still keep temporary fallback copies of some rules; those can
be migrated to a generated JSON artifact in a later phase.
"""


REPORT_DEFINITIONS = {
    "2024-acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa": {
        "title": "Liquidações e Pagamentos por Natureza - 2024",
        "periodicidade": "historico",
        "limite_dias": None,
        "status": "atualizado",
    },
    "2025-acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa": {
        "title": "Liquidações e Pagamentos por Natureza - 2025",
        "periodicidade": "historico",
        "limite_dias": None,
        "status": "atualizado",
    },
    "acompanhamento-das-liquidacoes-e-pagamentos-por-data": {
        "title": "Liquidações e Pagamentos por Data",
        "columns": ["Data", "Empenhado", "Liquidado", "Pago", "Saldo a Liquidar"],
        "expected_metrics": ["empenhado", "liquidado", "pago", "saldo_a_liquidar"],
    },
    "acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa": {
        "title": "Liquidações e Pagamentos por Natureza",
        "columns": ["Natureza de Despesa", "Empenhado", "Liquidado", "Pago", "Saldo a Liquidar"],
        "expected_metrics": ["empenhado", "liquidado", "pago", "saldo_a_liquidar"],
    },
    "credito-disponivel-mes-lancamento": {
        "title": "Crédito Disponível por Mês de Lançamento",
        "periodicidade": "diaria",
        "limite_dias": 1,
        "columns": ["Mes", "Credito Inicial", "Credito Atualizado", "Credito Disponivel"],
        "highlights": [{"label": "Crédito disponível", "column": "Saldo - R$ (Conta Contábil)", "match_terms": ["saldo", "r$"]}],
        "expected_metrics": ["credito_disponivel"],
    },
    "despesas-empenhadas-liquidadas-e-pagas-2024": {
        "title": "Despesas Empenhadas, Liquidadas e Pagas - 2024",
        "periodicidade": "historico",
        "limite_dias": None,
        "status": "atualizado",
    },
    "despesas-empenhadas-liquidadas-e-pagas-2025": {
        "title": "Despesas Empenhadas, Liquidadas e Pagas - 2025",
        "periodicidade": "historico",
        "limite_dias": None,
        "status": "atualizado",
    },
    "despesas-empenhadas-liquidadas-e-pagas-mes-lancamento": {
        "title": "Despesas Empenhadas, Liquidadas e Pagas por Mês",
        "periodicidade": "diaria",
        "limite_dias": 1,
        "columns": ["Mes", "Empenhado", "Liquidado", "Pago", "Liquidado a Pagar"],
        "highlights": [
            {"label": "Despesas empenhadas", "column": "Valor 7"},
            {"label": "Despesas liquidadas", "column": "Valor 8"},
            {"label": "Despesas pagas", "column": "Valor 9"},
        ],
        "expected_metrics": ["empenhado", "liquidado", "pago"],
    },
    "despesas-empenhadas-liquidadas-e-pagas-strictu-sensu": {
        "title": "Despesas Empenhadas, Liquidadas e Pagas - Stricto Sensu",
        "periodicidade": "mensal",
        "limite_dias": 35,
        "columns": ["Natureza de Despesa", "Empenhado", "Liquidado", "Pago", "Liquidado a Pagar"],
        "highlights": [
            {"label": "Despesas empenhadas", "column": "Valor 7"},
            {"label": "Despesas liquidadas", "column": "Valor 8"},
            {"label": "Despesas pagas", "column": "Valor 9"},
        ],
        "expected_metrics": ["empenhado", "liquidado", "pago"],
    },
    "evolucao-das-despesas-empenhadas": {
        "title": "Evolução das Despesas Empenhadas",
        "expected_metrics": ["despesas_empenhadas"],
    },
    "imoveis-por-ug-conta-contabil-e-rip": {
        "title": "RIP Imóveis por Conta Contábil",
        "periodicidade": "mensal",
        "limite_dias": 35,
    },
    "limite-de-saque-conta-contabil": {
        "title": "Limite de Saque por Conta Contábil",
        "expected_metrics": ["limite_de_saque"],
    },
    "provisionamentos": {
        "title": "Provisionamentos",
        "highlights": [{"label": "Provisionamentos", "column": "Saldo - Moeda Origem (Item Informação)", "match_terms": ["saldo", "moeda"]}],
        "expected_metrics": ["provisionamentos"],
    },
    "recolhimento-proprio-gru": {
        "title": "Recolhimento Próprio - GRU",
        "columns": ["Unidade Gestora", "Codigo de Recolhimento", "Descricao", "Arrecadado"],
        "highlights": [{"label": "GRU arrecadadas", "column": "Movim. Líquido - R$ (Item Informação)", "match_terms": ["movim", "liquido"]}],
        "expected_metrics": ["gru_arrecadada"],
    },
    "restos-a-pagar-rap": {
        "title": "Restos a Pagar - RAP",
        "columns": ["Unidade Gestora", "Natureza de Despesa", "Inscrito", "Cancelado", "Pago", "A Pagar", "% Pago"],
        "highlights": [
            {"label": "RAP inscrito", "column": "Valor 9"},
            {"label": "RAP cancelado", "column": "Valor 10"},
            {"label": "RAP pago", "column": "Valor 11"},
            {"label": "RAP a pagar", "column": "Valor 12"},
        ],
        "expected_metrics": ["rap_inscrito", "rap_cancelado", "rap_pago", "rap_a_pagar"],
    },
    "saldo-de-empenhos-a-liquidar-mes-a-mes": {
        "title": "Saldo de Empenhos a Liquidar Mês a Mês",
        "periodicidade": "diaria",
        "limite_dias": 1,
        "columns": [
            "Natureza de Despesa",
            "Janeiro",
            "Fevereiro",
            "Marco",
            "Abril",
            "Maio",
            "Junho",
            "Julho",
            "Agosto",
            "Setembro",
            "Outubro",
            "Novembro",
            "Dezembro",
            "Total a Liquidar",
        ],
        "highlights": [{"label": "Saldo total a liquidar", "column": "Total a Liquidar"}],
        "expected_metrics": ["saldo_a_liquidar"],
    },
    "saldo-patrimonio-e-almoxarifado-conta-contabil": {
        "title": "Saldo de Patrimônio e Almoxarifado por Conta Contábil",
        "expected_metrics": ["saldo_patrimonial"],
    },
    "saldo-por-natureza-de-despesa": {
        "title": "Saldo por Natureza de Despesa",
        "expected_metrics": ["saldo"],
    },
    "saldos-de-contas-de-contratos": {
        "title": "Saldos de Contas de Contratos",
        "expected_metrics": ["saldo_contratos"],
    },
    "saldos-de-empenhos-do-exercicio-conta-contabil": {
        "title": "Saldos de Empenhos do Exercício por Conta Contábil",
        "columns": ["Conta Contabil", "Empenhado", "A Liquidar", "Liquidado a Pagar", "Pago"],
        "highlights": [
            {"label": "Empenhos a liquidar", "column": "Valor 8"},
            {"label": "Liquidados a pagar", "column": "Valor 9"},
            {"label": "Empenhos pagos", "column": "Valor 10"},
        ],
        "expected_metrics": ["empenhos_a_liquidar", "liquidados_a_pagar", "empenhos_pagos"],
    },
    "suprimento-de-fundos-empenhos": {
        "title": "Suprimento de Fundos - Empenhos",
        "expected_metrics": ["suprimento_fundos_empenhos"],
    },
    "suprimento-de-fundos-liquidacoes-e-pagamentos": {
        "title": "Suprimento de Fundos - Liquidações e Pagamentos",
        "expected_metrics": ["suprimento_fundos_liquidacoes_pagamentos"],
    },
}


def report_definition(slug):
    return REPORT_DEFINITIONS.get(slug, {})


def report_title(slug, fallback=None):
    return report_definition(slug).get("title") or fallback


def report_columns(slug):
    return report_definition(slug).get("columns")


def report_periodicity(slug):
    return report_definition(slug).get("periodicidade")


def report_limit_days(slug):
    return report_definition(slug).get("limite_dias")


def report_status(slug):
    return report_definition(slug).get("status")
