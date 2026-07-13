"""Guard against accidental promotion of the experimental parser.

This check is intentionally conservative. The experimental parser may produce
diagnostic artifacts, but production generation must not import or call it until
a future phase explicitly promotes a reviewed pilot.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import parser_feature_flags


PRODUCTION_FILES = [
    Path("main.py"),
    Path("email_processor.py"),
    Path("html_generator.py"),
    Path("data_generator.py"),
    Path("run_logger.py"),
]

FORBIDDEN_MARKERS = [
    "experimental_table_parser",
    "generate_parser_pilot",
]


def validate_file(path: Path) -> list[str]:
    if not path.exists():
        return [f"arquivo de producao ausente: {path.as_posix()}"]
    text = path.read_text(encoding="utf-8", errors="replace")
    errors = []
    for marker in FORBIDDEN_MARKERS:
        if marker in text:
            errors.append(f"{path.as_posix()} referencia parser experimental: {marker}")
    return errors


def validate_repository() -> list[str]:
    errors: list[str] = []
    for path in PRODUCTION_FILES:
        errors.extend(validate_file(path))
    enabled_flags = parser_feature_flags.enabled_flags()
    for slug in enabled_flags:
        errors.append(f"feature flag experimental ligada por padrao: {slug}")
    return errors


def build_markdown_report(errors: list[str]) -> str:
    checked_files = "\n".join(f"- `{path.as_posix()}`" for path in PRODUCTION_FILES)
    forbidden_markers = "\n".join(f"- `{marker}`" for marker in FORBIDDEN_MARKERS)
    disabled_flags = "\n".join(f"- `{slug}`" for slug in parser_feature_flags.disabled_flags()) or "- nenhuma"
    enabled_flags = "\n".join(f"- `{slug}`" for slug in parser_feature_flags.enabled_flags()) or "- nenhuma"
    result = "falhou" if errors else "ok"
    findings = "\n".join(f"- {error}" for error in errors) if errors else "- nenhum problema encontrado"
    return "\n".join(
        [
            "# Guarda de promocao do parser",
            "",
            f"- resultado: `{result}`",
            "- objetivo: impedir promocao acidental do parser experimental para o fluxo oficial",
            "",
            "## Arquivos verificados",
            "",
            checked_files,
            "",
            "## Marcadores proibidos",
            "",
            forbidden_markers,
            "",
            "## Feature flags experimentais desligadas",
            "",
            disabled_flags,
            "",
            "## Feature flags experimentais ligadas",
            "",
            enabled_flags,
            "",
            "## Achados",
            "",
            findings,
            "",
        ]
    )


def write_report(path: Path, errors: list[str]) -> None:
    path.write_text(build_markdown_report(errors), encoding="utf-8")


def main_with_args(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valida isolamento do parser experimental.")
    parser.add_argument("--report", help="caminho opcional para relatorio Markdown")
    args = parser.parse_args(argv)

    errors = validate_repository()
    if args.report:
        write_report(Path(args.report), errors)
    if errors:
        for error in errors:
            print(f"ERRO: {error}", file=sys.stderr)
        return 1
    print("OK: parser experimental segue isolado do fluxo de producao.")
    return 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    raise SystemExit(main())
