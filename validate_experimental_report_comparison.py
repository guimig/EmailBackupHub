"""Compare a production parse with a parallel experimental report artifact."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from data_generator import full_report_document


MAX_ALLOWED_ROW_DELTA = 5


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compare_payload(report_path: Path, experimental_payload: dict) -> tuple[list[str], list[str], dict[str, object]]:
    errors: list[str] = []
    warnings: list[str] = []
    production = full_report_document(report_path, {}, dt.datetime.now(dt.timezone.utc))
    production_columns = production.get("columns") or []
    production_rows = production.get("rows") or []
    experimental_columns = experimental_payload.get("columns") or []
    experimental_rows = experimental_payload.get("rows") or []
    quality = experimental_payload.get("quality") or {}
    source = experimental_payload.get("source") or {}

    if experimental_payload.get("read_only") is not True:
        errors.append("experimental report must be read_only=true")
    if experimental_payload.get("promotion_status") != "not_promoted":
        errors.append("experimental report must remain not_promoted")
    if quality.get("ready_for_production") is True:
        errors.append("experimental report cannot be ready_for_production")
    if source.get("consumed_by_dashboard") is not False:
        errors.append("experimental report must not be consumed by dashboard")
    if source.get("consumed_by_report_viewer") is not False:
        errors.append("experimental report must not be consumed by report-viewer")
    if source.get("writes_data_reports") is not False:
        errors.append("experimental report must not write data/reports")
    if experimental_payload.get("report") != report_path.name:
        errors.append("experimental report name must match HTML report")
    if not experimental_columns:
        errors.append("experimental columns are empty")
    if any(str(column).startswith(("Coluna ", "Valor ")) for column in experimental_columns):
        errors.append("experimental columns still contain generic labels")
    if production_columns and len(production_columns) != len(experimental_columns):
        errors.append(
            f"column count differs: production={len(production_columns)} experimental={len(experimental_columns)}"
        )

    row_delta = abs(len(production_rows) - len(experimental_rows))
    if row_delta:
        warnings.append(f"row count differs by {row_delta}: production={len(production_rows)} experimental={len(experimental_rows)}")
    if row_delta > MAX_ALLOWED_ROW_DELTA:
        errors.append(f"row count delta {row_delta} exceeds limit {MAX_ALLOWED_ROW_DELTA}")

    summary = {
        "report": report_path.name,
        "production_columns_count": len(production_columns),
        "experimental_columns_count": len(experimental_columns),
        "production_rows_count": len(production_rows),
        "experimental_rows_count": len(experimental_rows),
        "row_count_delta": row_delta,
        "errors_count": len(errors),
        "warnings_count": len(warnings),
    }
    return errors, warnings, summary


def build_markdown_report(summary: dict[str, object], errors: list[str], warnings: list[str]) -> str:
    errors_text = "\n".join(f"- {error}" for error in errors) if errors else "- nenhum"
    warnings_text = "\n".join(f"- {warning}" for warning in warnings) if warnings else "- nenhum"
    return "\n".join(
        [
            "# Comparacao do JSON experimental",
            "",
            f"- relatorio: `{summary.get('report')}`",
            f"- colunas producao/experimental: `{summary.get('production_columns_count')}/{summary.get('experimental_columns_count')}`",
            f"- linhas producao/experimental: `{summary.get('production_rows_count')}/{summary.get('experimental_rows_count')}`",
            f"- diferenca de linhas: `{summary.get('row_count_delta')}`",
            "",
            "## Erros",
            "",
            errors_text,
            "",
            "## Avisos",
            "",
            warnings_text,
            "",
        ]
    )


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compara parser oficial e JSON experimental paralelo.")
    parser.add_argument("--report", required=True, help="HTML usado como base")
    parser.add_argument("--experimental-json", required=True, help="JSON experimental paralelo")
    parser.add_argument("--report-output", help="relatorio Markdown opcional")
    args = parser.parse_args(argv)

    errors, warnings, summary = compare_payload(Path(args.report), load_json(Path(args.experimental_json)))
    if args.report_output:
        Path(args.report_output).write_text(build_markdown_report(summary, errors, warnings), encoding="utf-8")
    for warning in warnings:
        print(f"AVISO: {warning}")
    for error in errors:
        print(f"ERRO: {error}", file=sys.stderr)
    if errors:
        return 1
    print("OK: JSON experimental paralelo valido para revisao manual.")
    return 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    raise SystemExit(main())
