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

    readiness = payload.get("readiness") or {}
    if not readiness:
        errors.append("artifact must include readiness summary")
    if readiness.get("ready_for_production") is True:
        errors.append("artifact cannot be marked ready_for_production")
    if readiness.get("requires_manual_review") is not True:
        errors.append("artifact must require manual review")
    if readiness.get("ready_for_manual_review") is False:
        warnings.append("artifact is not ready for manual review")
    if readiness.get("manual_review_reasons"):
        warnings.append(f"manual review required: {readiness.get('manual_review_reasons')}")

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


def validate_index_payload(payload: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if payload.get("read_only") is not True:
        errors.append("index must be read_only=true")
    if payload.get("promotion_status") != "not_promoted":
        errors.append("index must remain not_promoted")

    pilots = payload.get("pilots")
    if not isinstance(pilots, list) or not pilots:
        errors.append("index must include a non-empty pilots list")
        return errors, warnings

    if payload.get("pilots_count") != len(pilots):
        errors.append("pilots_count must match pilots list length")

    for position, pilot in enumerate(pilots, start=1):
        report = str(pilot.get("report") or "")
        prefix = f"pilot {position} ({report or 'unknown'})"
        if not report.endswith(".html"):
            errors.append(f"{prefix}: report must identify an HTML file")
        if pilot.get("promotion_status") != "not_promoted":
            errors.append(f"{prefix}: must remain not_promoted")
        if pilot.get("ready_for_production") is True:
            errors.append(f"{prefix}: cannot be ready_for_production")
        if pilot.get("requires_manual_review") is not True:
            errors.append(f"{prefix}: must require manual review")
        if pilot.get("ready_for_manual_review") is False:
            warnings.append(f"{prefix}: not ready for manual review")
        if not isinstance(pilot.get("production_columns_count"), int):
            errors.append(f"{prefix}: production_columns_count must be numeric")
        if not isinstance(pilot.get("experimental_columns_count"), int):
            errors.append(f"{prefix}: experimental_columns_count must be numeric")
        if not isinstance(pilot.get("experimental_rows_count"), int) or pilot.get("experimental_rows_count") <= 0:
            errors.append(f"{prefix}: experimental_rows_count must be positive")

    return errors, warnings


def validate_artifact(payload: dict) -> tuple[list[str], list[str]]:
    if "pilots" in payload:
        return validate_index_payload(payload)
    return validate_payload(payload)


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida artefato experimental de parser piloto.")
    parser.add_argument("artifact", nargs="?", default=str(DEFAULT_ARTIFACT))
    args = parser.parse_args(argv)

    path = Path(args.artifact)
    if not path.exists():
        print(f"Artefato ausente: {path}", file=sys.stderr)
        return 1

    errors, warnings = validate_artifact(load_json(path))
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
