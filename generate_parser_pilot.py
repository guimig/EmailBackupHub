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


def build_pilot_payload(report_path: Path) -> dict[str, object]:
    production = full_report_document(report_path, {}, dt.datetime.now(dt.timezone.utc))
    experimental = experimental_table_parser.parse_largest_html_table(
        report_path.read_text(encoding="utf-8", errors="replace")
    )
    comparison = compare_file(report_path)
    return {
        "schema_version": "1.0",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "read_only": True,
        "report": report_path.name,
        "promotion_status": "not_promoted",
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


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gera artefato experimental do parser piloto.")
    parser.add_argument("--report", default=DEFAULT_REPORT, help="HTML do relatorio piloto")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="caminho do artefato JSON")
    args = parser.parse_args(argv)

    report_path = Path(args.report)
    if not report_path.exists():
        parser.error(f"arquivo ausente: {report_path}")

    payload = build_pilot_payload(report_path)
    write_json(Path(args.output), payload)
    print(f"Artefato piloto gerado em {args.output}")
    print("Somente leitura: nenhum dado oficial foi alterado.")
    return 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    raise SystemExit(main())
