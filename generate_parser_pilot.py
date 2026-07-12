"""Generate read-only experimental parser artifacts for a selected report.

This script does not change production JSON, cache, dashboard inputs, e-mail
state, or Git history. It writes an isolated artifact intended for manual
comparison before any parser promotion.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

import experimental_table_parser
from compare_parser_outputs import compare_file
from data_generator import full_report_document


DEFAULT_REPORT = "saldos-de-contas-de-contratos.html"
DEFAULT_OUTPUT = Path("artifacts") / "parser-pilot-saldos-de-contas-de-contratos.json"
DEFAULT_SUMMARY_OUTPUT = Path("artifacts") / "parser-pilot-saldos-de-contas-de-contratos.md"


def build_readiness_summary(production: dict, experimental, comparison: dict) -> dict[str, object]:
    production_columns = production.get("columns") or []
    experimental_columns = experimental.columns or []
    production_rows = len(production.get("rows") or [])
    experimental_rows = len(experimental.rows)
    row_count_delta = abs(production_rows - experimental_rows)
    has_experimental_risks = bool(comparison.get("experimental_risks"))
    has_experimental_warnings = bool(experimental.warnings)
    has_generic_experimental_columns = any(str(column).startswith("Valor ") for column in experimental_columns)
    column_count_match = len(production_columns) == len(experimental_columns)

    manual_review_reasons: list[str] = []
    if not column_count_match:
        manual_review_reasons.append("column_count_differs")
    if row_count_delta:
        manual_review_reasons.append(f"row_count_delta:{row_count_delta}")
    if has_experimental_risks:
        manual_review_reasons.append("experimental_risks")
    if has_experimental_warnings:
        manual_review_reasons.append("experimental_warnings")
    if has_generic_experimental_columns:
        manual_review_reasons.append("generic_experimental_columns")
    if any(str(column).startswith(("Coluna ", "Valor ")) for column in production_columns):
        manual_review_reasons.append("production_columns_are_generic")

    return {
        "column_count_match": column_count_match,
        "row_count_delta": row_count_delta,
        "has_experimental_risks": has_experimental_risks,
        "has_experimental_warnings": has_experimental_warnings,
        "has_generic_experimental_columns": has_generic_experimental_columns,
        "ready_for_manual_review": bool(experimental_columns) and not has_experimental_risks,
        "requires_manual_review": True,
        "manual_review_reasons": manual_review_reasons or ["pilot_not_manually_reviewed"],
        "ready_for_production": False,
    }


def build_pilot_payload(report_path: Path) -> dict[str, object]:
    production = full_report_document(report_path, {}, dt.datetime.now(dt.timezone.utc))
    experimental = experimental_table_parser.parse_largest_html_table(
        report_path.read_text(encoding="utf-8", errors="replace")
    )
    comparison = compare_file(report_path)
    readiness = build_readiness_summary(production, experimental, comparison)
    return {
        "schema_version": "1.0",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "read_only": True,
        "report": report_path.name,
        "promotion_status": "not_promoted",
        "readiness": readiness,
        "comparison": comparison,
        "production": {
            "columns": production.get("columns") or [],
            "rows_count": len(production.get("rows") or []),
            "totals_count": len(production.get("totals") or []),
            "quality": production.get("quality") or {},
        },
        "experimental": {
            "columns": experimental.columns,
            "rows_count": len(experimental.rows),
            "warnings": experimental.warnings,
            "sample_rows": experimental.rows[:5],
        },
        "notes": [
            "Artefato experimental separado; nao consumido pelo dashboard.",
            "Nao substitui data/reports/*.json.",
            "Nao altera parser de producao.",
        ],
    }


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def markdown_list(values: list[object]) -> str:
    if not values:
        return "- nenhum"
    return "\n".join(f"- {value}" for value in values)


def build_markdown_summary(payload: dict[str, object]) -> str:
    production = payload.get("production") or {}
    experimental = payload.get("experimental") or {}
    readiness = payload.get("readiness") or {}
    comparison = payload.get("comparison") or {}
    production_columns = production.get("columns") or []
    experimental_columns = experimental.get("columns") or []
    production_rows = production.get("rows_count")
    experimental_rows = experimental.get("rows_count")
    manual_review_reasons = readiness.get("manual_review_reasons") or []
    risks = comparison.get("experimental_risks") or []
    warnings = experimental.get("warnings") or []

    return "\n".join(
        [
            "# Piloto experimental do parser",
            "",
            "Este resumo e somente para revisao manual. Ele nao altera `data/`,",
            "nao promove o parser experimental e nao e consumido pelo dashboard.",
            "",
            "## Status",
            "",
            f"- relatorio: `{payload.get('report')}`",
            f"- somente leitura: `{payload.get('read_only')}`",
            f"- status de promocao: `{payload.get('promotion_status')}`",
            f"- pronto para revisao manual: `{readiness.get('ready_for_manual_review')}`",
            f"- pronto para producao: `{readiness.get('ready_for_production')}`",
            "",
            "## Comparacao objetiva",
            "",
            f"- colunas na producao: `{len(production_columns)}`",
            f"- colunas no experimental: `{len(experimental_columns)}`",
            f"- linhas na producao: `{production_rows}`",
            f"- linhas no experimental: `{experimental_rows}`",
            f"- diferenca de linhas: `{readiness.get('row_count_delta')}`",
            "",
            "## Motivos para revisao manual",
            "",
            markdown_list(manual_review_reasons),
            "",
            "## Riscos experimentais",
            "",
            markdown_list(risks),
            "",
            "## Avisos experimentais",
            "",
            markdown_list(warnings),
            "",
            "## Colunas experimentais",
            "",
            markdown_list(experimental_columns),
            "",
            "## Proximos cuidados",
            "",
            "- revisar a diferenca de linhas antes de qualquer promocao;",
            "- confirmar totais/subtotais e valores monetarios no JSON oficial;",
            "- manter `ready_for_production=false` ate validacao manual explicita.",
            "",
        ]
    )


def write_markdown(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(build_markdown_summary(payload), encoding="utf-8")


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gera artefato experimental do parser piloto.")
    parser.add_argument("--report", default=DEFAULT_REPORT, help="HTML do relatorio piloto")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="caminho do artefato JSON")
    parser.add_argument(
        "--summary-output",
        default=str(DEFAULT_SUMMARY_OUTPUT),
        help="caminho do resumo Markdown",
    )
    args = parser.parse_args(argv)

    report_path = Path(args.report)
    if not report_path.exists():
        parser.error(f"arquivo ausente: {report_path}")

    payload = build_pilot_payload(report_path)
    write_json(Path(args.output), payload)
    write_markdown(Path(args.summary_output), payload)
    print(f"Artefato piloto gerado em {args.output}")
    print(f"Resumo do piloto gerado em {args.summary_output}")
    print("Somente leitura: nenhum dado oficial foi alterado.")
    return 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    raise SystemExit(main())
