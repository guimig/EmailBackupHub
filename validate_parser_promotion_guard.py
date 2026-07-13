"""Guard against accidental promotion of the experimental parser.

This check is intentionally conservative. The experimental parser may produce
diagnostic artifacts, but production generation must not import or call it until
a future phase explicitly promotes a reviewed pilot.
"""

from __future__ import annotations

import sys
from pathlib import Path


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
    return errors


def main() -> int:
    errors = validate_repository()
    if errors:
        for error in errors:
            print(f"ERRO: {error}", file=sys.stderr)
        return 1
    print("OK: parser experimental segue isolado do fluxo de producao.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
