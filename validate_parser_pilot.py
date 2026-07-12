"""Validate experimental parser pilot artifacts.

This validator is read-only. It checks that a pilot artifact remains isolated
from production and looks safe enough for manual review.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


DEFAULT_ARTIFACT = Path("artifacts") / "parser-pilot-saldos-de-contas-de-contratos.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_payload(payload: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if payload.get("read_only") is not True:
        errors.append("artifact must be read_only=true")
    if payload.get("promotion_status") != "not_promoted":
        errors.append("artifact must remain not_promoted")
    if not str(payload.get("report") or "").endswith(".html"):
        errors.append("artifact must identify an HTML report")

    comparison = payload.get("comparison") or {}
    if comparison.get("experimental_risks"):
        errors.append(f"experimental risks present: {comparison.get('experimental_risks')}")

    production = payload.get("production") or {}
    experimental = payload.get("experimental") or {}
    production_columns = production.get("columns") or []
    experimental_columns = experimental.get("columns") or []
    if not experimental_columns:
        errors.append("experimental columns are empty")
    if any(str(column).startswith("Valor ") for column in experimental_columns):
        errors.append("experimental columns still contain generic Valor labels")
    if len(production_columns) and len(experimental_columns) != len(production_columns):
        warnings.append(
            f"column count differs: production={len(production_columns)} experimental={len(experimental_columns)}"
        )

    production_rows = production.get("rows_count")
    experimental_rows = experimental.get("rows_count")
    if not isinstance(experimental_rows, int) or experimental_rows <= 0:
        errors.append("experimental rows_count must be positive")
    if isinstance(production_rows, int) and isinstance(experimental_rows, int):
        delta = abs(production_rows - experimental_rows)
        if delta > 1:
            warnings.append(f"row count differs by {delta}: production={production_rows} experimental={experimental_rows}")

    if experimental.get("warnings"):
        warnings.append(f"experimental warnings present: {experimental.get('warnings')}")

    return errors, warnings


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida artefato experimental de parser piloto.")
    parser.add_argument("artifact", nargs="?", default=str(DEFAULT_ARTIFACT))
    args = parser.parse_args(argv)

    path = Path(args.artifact)
    if not path.exists():
        print(f"Artefato ausente: {path}", file=sys.stderr)
        return 1

    errors, warnings = validate_payload(load_json(path))
    print(f"Validacao do artefato piloto: {path.as_posix()}")
    for warning in warnings:
        print(f"AVISO: {warning}")
    for error in errors:
        print(f"ERRO: {error}", file=sys.stderr)
    if errors:
        return 1
    print("OK: artefato piloto valido para revisao manual.")
    return 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    raise SystemExit(main())
