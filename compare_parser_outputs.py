"""Compare production and experimental table parsing without changing data.

This command is read-only. It does not write JSON, alter cache, call IMAP, or
change the production parser.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

import experimental_table_parser
from data_generator import full_report_document


ROOT = Path(__file__).resolve().parent
CRITICAL_REPORTS = [
    "restos-a-pagar-rap.html",
    "saldos-de-contas-de-contratos.html",
    "evolucao-das-despesas-empenhadas.html",
    "despesas-empenhadas-liquidadas-e-pagas-mes-lancamento.html",
    "saldos-de-empenhos-do-exercicio-conta-contabil.html",
    "saldo-de-empenhos-a-liquidar-mes-a-mes.html",
]


def similarity(left: list[str], right: list[str]) -> float:
    if not left and not right:
        return 1.0
    left_set = {item.lower() for item in left if item}
    right_set = {item.lower() for item in right if item}
    if not left_set and not right_set:
        return 1.0
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def compare_file(path: Path) -> dict[str, object]:
    production = full_report_document(path, {}, dt.datetime.now(dt.timezone.utc))
    experimental = experimental_table_parser.parse_largest_html_table(
        path.read_text(encoding="utf-8", errors="replace")
    )
    prod_columns = production.get("columns") or []
    exp_columns = experimental.columns
    prod_rows = production.get("rows") or []
    exp_rows = experimental.rows
    return {
        "file": path.name,
        "production_columns": len(prod_columns),
        "experimental_columns": len(exp_columns),
        "production_rows": len(prod_rows),
        "experimental_rows": len(exp_rows),
        "column_similarity": round(similarity(prod_columns, exp_columns), 3),
        "production_quality": production.get("quality") or {},
        "experimental_warnings": experimental.warnings,
        "production_sample_columns": prod_columns[:8],
        "experimental_sample_columns": exp_columns[:8],
    }


def print_comparison(result: dict[str, object]) -> None:
    print(f"\n## {result['file']}")
    print(
        "- Colunas: "
        f"producao={result['production_columns']} "
        f"experimental={result['experimental_columns']} "
        f"similaridade={result['column_similarity']}"
    )
    print(f"- Linhas: producao={result['production_rows']} experimental={result['experimental_rows']}")
    print(f"- Qualidade producao: {result['production_quality']}")
    print(f"- Avisos experimental: {result['experimental_warnings']}")
    print(f"- Colunas producao: {result['production_sample_columns']}")
    print(f"- Colunas experimental: {result['experimental_sample_columns']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compara parser atual e experimental.")
    parser.add_argument("reports", nargs="*", help="HTMLs especificos; se omitido, usa relatorios criticos")
    parser.add_argument("--fail-on-missing", action="store_true", help="retorna erro se algum HTML estiver ausente")
    args = parser.parse_args()

    print("# Comparacao de parsers")
    print("Somente leitura: nenhum dado e gerado ou alterado.")
    missing = False
    for item in args.reports or CRITICAL_REPORTS:
        path = ROOT / item
        if not path.exists():
            missing = True
            print(f"\n## {item}\n- AUSENTE")
            continue
        print_comparison(compare_file(path))
    return 1 if missing and args.fail_on_missing else 0


if __name__ == "__main__":
    sys.exit(main())
