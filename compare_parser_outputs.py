"""Compare production and experimental table parsing without changing data.

This command is read-only. It does not write JSON, alter cache, call IMAP, or
change the production parser.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
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

FORBIDDEN_TITLE_PREFIXES = {
    "restos-a-pagar-rap.html": ["Restos a Pagar - RAP"],
    "saldos-de-contas-de-contratos.html": ["Saldos de Contas de Contratos"],
    "evolucao-das-despesas-empenhadas.html": ["Evolução das Despesas Empenhadas", "Evolucao das Despesas Empenhadas"],
}


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
    result = {
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
    result["experimental_risks"] = experimental_risks(path.name, exp_columns, experimental.warnings)
    return result


def experimental_risks(file_name: str, columns: list[str], warnings: list[str]) -> list[str]:
    risks = []
    for title in FORBIDDEN_TITLE_PREFIXES.get(file_name, []):
        if any(str(column).startswith(title) for column in columns):
            risks.append(f"title_prefix:{title}")
    if any(str(column).startswith("Valor ") for column in columns):
        risks.append("generic_columns")
    if "header_not_detected" in warnings:
        risks.append("header_not_detected")
    return sorted(set(risks))


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
    print(f"- Riscos experimental: {result['experimental_risks']}")
    print(f"- Colunas producao: {result['production_sample_columns']}")
    print(f"- Colunas experimental: {result['experimental_sample_columns']}")


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compara parser atual e experimental.")
    parser.add_argument("reports", nargs="*", help="HTMLs especificos; se omitido, usa relatorios criticos")
    parser.add_argument("--fail-on-missing", action="store_true", help="retorna erro se algum HTML estiver ausente")
    parser.add_argument("--json-output", help="grava a comparacao em JSON estruturado")
    args = parser.parse_args(argv)

    print("# Comparacao de parsers")
    print("Somente leitura: nenhum dado e gerado ou alterado.")
    missing = False
    results = []
    for item in args.reports or CRITICAL_REPORTS:
        path = ROOT / item
        if not path.exists():
            missing = True
            results.append({"file": item, "missing": True})
            print(f"\n## {item}\n- AUSENTE")
            continue
        result = compare_file(path)
        results.append(result)
        print_comparison(result)
    if args.json_output:
        output = Path(args.json_output)
        payload = {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "read_only": True,
            "results": results,
        }
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if missing and args.fail_on_missing else 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    sys.exit(main())
